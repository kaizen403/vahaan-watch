import { spawn, type ChildProcess } from "node:child_process";
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import type { CameraFrame, ComponentHealth, WorkstationConfig } from "../types.js";

type CameraAdapterConfig = Pick<WorkstationConfig, "cameraSource" | "cameraFps" | "rtspTransport" | "rtspConnectTimeoutMs" | "rtspReadTimeoutMs" | "rtspReconnectMaxAttemptsPerSession" | "rtspStreamValidationIntervalMs">;
type FrameHandler = (frame: CameraFrame) => void | Promise<void>;
const logger = createLogger("camera-adapter");

const JPEG_SOI = 0xff;
const JPEG_SOF_MARKER = 0xd8;
const JPEG_EOI_MARKER = 0xd9;
const RESTART_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

function ffmpegStreamArgs(source: string, fps: number): string[] {
  const isRtsp = source.startsWith("rtsp://") || source.startsWith("rtsps://");
  const isFile = !isRtsp && !source.startsWith("http");
  return [
    "-hide_banner", "-loglevel", "error",
    ...(isRtsp ? ["-rtsp_transport", "tcp"] : []),
    ...(isFile ? ["-stream_loop", "-1"] : []),
    "-i", source,
    "-an", "-vf", `fps=${fps}`,
    "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
  ];
}

export class CameraAdapter {
  private readonly config: CameraAdapterConfig;
  private process: ChildProcess | null = null;
  private started = false;
  private connected = false;
  private lastFrameAt: Date | null = null;
  private lastError: string | null = null;
  private processRestarts = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private frameBuffer = Buffer.alloc(0);
  private latestFrame: CameraFrame | null = null;
  private frameWaiters: Array<(f: CameraFrame) => void> = [];
  private onFrameHandler: FrameHandler | null = null;

  public constructor(config: CameraAdapterConfig = loadConfig()) {
    this.config = config;
  }

  public async start(onFrame?: FrameHandler): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.onFrameHandler = onFrame ?? null;
    this.spawn(0);
    logger.info("camera adapter started", { source: this.config.cameraSource, fps: this.config.cameraFps });
  }

  public async stop(): Promise<void> {
    this.started = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.process && !this.process.killed) this.process.kill("SIGKILL");
    this.process = null;
    this.connected = false;
    this.frameWaiters = [];
    logger.info("camera adapter stopped", { source: this.config.cameraSource });
  }

  public async grabFrame(): Promise<CameraFrame> {
    if (this.latestFrame) return this.latestFrame;
    return new Promise((resolve) => {
      this.frameWaiters.push(resolve);
    });
  }

  public async captureFrame(): Promise<CameraFrame> {
    return this.grabFrame();
  }

  public async healthCheck(): Promise<ComponentHealth> {
    const now = new Date();
    const staleMs = Math.max(5_000, Math.round(3000 / Math.max(this.config.cameraFps, 1)));
    const isFresh = this.lastFrameAt !== null && now.getTime() - this.lastFrameAt.getTime() <= staleMs;
    const status = !this.started ? "degraded" : this.connected && isFresh ? "healthy" : "unhealthy";
    
    let message = !this.started
      ? "camera adapter is stopped"
      : this.connected && isFresh
        ? "camera frames are flowing"
        : this.lastError ?? "camera capture is stale";

    return { component: "camera", status, message, lastCheckedAt: now.toISOString() };
  }

  private spawn(restartCount: number): void {
    if (!this.started) return;
    const child = spawn("ffmpeg", ffmpegStreamArgs(this.config.cameraSource, this.config.cameraFps), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process = child;
    this.frameBuffer = Buffer.alloc(0);

    child.stdout.on("data", (chunk: Buffer) => this.handleData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString("utf8").trim();
      if (msg) logger.debug("ffmpeg stderr", { msg });
    });
    child.once("error", (err) => {
      this.lastError = err.message;
      this.connected = false;
      logger.error("ffmpeg process error", { error: err.message });
    });
    child.once("close", (code) => {
      if (!this.started) return;
      this.process = null;
      this.connected = false;
      this.processRestarts += 1;
      const backoff = RESTART_BACKOFF_MS[Math.min(restartCount, RESTART_BACKOFF_MS.length - 1)];
      logger.warn("camera restarting", { code, restarts: this.processRestarts, backoffMs: backoff });
      this.restartTimer = setTimeout(() => this.spawn(restartCount + 1), backoff);
    });

    logger.debug("ffmpeg stream spawned", { source: this.config.cameraSource });
  }

  private handleData(chunk: Buffer): void {
    this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);
    this.extractFrames();
  }

  private extractFrames(): void {
    // Scan for JPEG boundaries: SOI = FF D8, EOI = FF D9
    let start = -1;
    for (let i = 0; i < this.frameBuffer.length - 1; i++) {
      if (this.frameBuffer[i] === JPEG_SOI && this.frameBuffer[i + 1] === JPEG_SOF_MARKER) {
        start = i;
      }
      if (start !== -1 && this.frameBuffer[i] === JPEG_SOI && this.frameBuffer[i + 1] === JPEG_EOI_MARKER) {
        const frameData = Buffer.from(this.frameBuffer.slice(start, i + 2));
        this.frameBuffer = Buffer.from(this.frameBuffer.slice(i + 2));
        this.emitFrame(frameData);
        start = -1;
        i = -1; // restart scan on remaining buffer
      }
    }
    // Trim buffer if no SOI found to prevent unbounded growth
    if (start === -1 && this.frameBuffer.length > 1_000_000) {
      this.frameBuffer = Buffer.alloc(0);
    }
  }

  private emitFrame(data: Buffer): void {
    this.connected = true;
    this.lastError = null;
    const frame: CameraFrame = { data, timestamp: new Date(), source: this.config.cameraSource };
    this.lastFrameAt = frame.timestamp;
    this.latestFrame = frame;
    // Resolve waiters
    if (this.frameWaiters.length > 0) {
      const waiters = this.frameWaiters.splice(0);
      for (const w of waiters) w(frame);
    }
    // Push mode handler
    if (this.onFrameHandler) {
      void Promise.resolve(this.onFrameHandler(frame)).catch((err: unknown) => {
        logger.error("frame handler error", { error: err instanceof Error ? err.message : String(err) });
      });
    }
  }
}

export { CameraAdapter as FfmpegCameraAdapter };

export function createCameraAdapter(config: CameraAdapterConfig = loadConfig()): CameraAdapter {
  return new CameraAdapter(config);
}
