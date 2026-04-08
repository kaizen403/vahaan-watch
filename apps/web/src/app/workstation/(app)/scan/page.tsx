"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Radar,
  AlertTriangle,
  Camera,
  ChevronDown,
  Activity,
  ShieldAlert,
  Clock,
  Tablet,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
const BRIDGE_URL = "ws://localhost:8089";

const REGIONS = [
  { value: "SAS", label: "South Asia" },
  { value: "EUR", label: "Europe" },
  { value: "NAM", label: "N. America" },
  { value: "AFR", label: "Africa" },
];

const INTERVALS = [
  { label: "0.5 fps", ms: 2000 },
  { label: "1 fps", ms: 1000 },
  { label: "2 fps", ms: 500 },
  { label: "3 fps", ms: 333 },
];

const SCALE_OPTIONS = [
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
];

const MAX_FRAME_WIDTH = 720;
const JPEG_QUALITY = 0.88;
const CROP_WIDTH_RATIO = 0.84;
const CROP_HEIGHT_RATIO = 0.42;
const MAX_LOG_ENTRIES = 100;

type ScanStatus = "idle" | "connecting" | "scanning" | "error";

type WsDetection = {
  timestamp: string;
  plate: string;
  country: string;
  make: string;
  model: string;
  color: string;
  category: string;
  confidence: number;
  blacklist: boolean;
};

type ScanResult = {
  success: true;
  data: {
    detection: {
      id: string;
      plate: string;
      country: string | null;
      make: string | null;
      model: string | null;
      color: string | null;
      category: string | null;
      confidence: number | null;
      occurredAt: string;
    };
    matches: Array<{
      id: string;
      alertStatus: string;
      hitlistEntry: {
        id: string;
        plateOriginal: string;
        priority: string | null;
        reasonSummary: string | null;
        caseReference: string | null;
      };
    }>;
    isHit: boolean;
    matchCount: number;
  };
};

type ScanApiResponse = ScanResult | { success: false; error: string };

type ScanLogEntry = {
  id: string;
  plate: string;
  timestamp: string;
  isHit: boolean;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  confidence: number | null;
  matches: Array<{
    id: string;
    alertStatus: string;
    hitlistEntry: {
      id: string;
      plateOriginal: string;
      priority: string | null;
      reasonSummary: string | null;
      caseReference: string | null;
    };
  }>;
  fresh: boolean;
};

function relativeTime(iso: string): string {
  const diff = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "square";
      osc2.frequency.setValueAtTime(1100, ctx.currentTime);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.6);
    }, 300);
  } catch {}
}

export default function WorkstationScanPage() {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [region, setRegion] = useState("SAS");
  const [intervalMs, setIntervalMs] = useState(1000);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [connectedTablets, setConnectedTablets] = useState(0);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("00:00:00");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<ScanStatus>("idle");
  const bridgeRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    function connectBridge() {
      try {
        const ws = new WebSocket(BRIDGE_URL);
        bridgeRef.current = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "identify", role: "workstation" }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            if (msg.type === "status" && msg.data) {
              setConnectedTablets(msg.data.connectedTablets ?? 0);
            }
          } catch {}
        };
        ws.onclose = () => {
          setTimeout(connectBridge, 3000);
        };
        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setTimeout(connectBridge, 3000);
      }
    }
    connectBridge();
    return () => {
      if (bridgeRef.current) bridgeRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!sessionStart) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, "0");
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const sec = String(s % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${sec}`);
    }, 1000);
    return () => clearInterval(id);
  }, [sessionStart]);

  useEffect(() => {
    const id = setInterval(() => {
      setScanLog((prev) => prev.map((e) => ({ ...e })));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const teardown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  function startFrameCapture(ws: WebSocket, frameIntervalMs: number) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    intervalRef.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (video.readyState < 2) return;

      const sourceWidth = video.videoWidth || 1280;
      const sourceHeight = video.videoHeight || 720;
      const cropWidth = Math.round(sourceWidth * CROP_WIDTH_RATIO);
      const cropHeight = Math.round(sourceHeight * CROP_HEIGHT_RATIO);
      const cropX = Math.round((sourceWidth - cropWidth) / 2);
      const cropY = Math.round((sourceHeight - cropHeight) / 2);
      const scale = Math.min(1, MAX_FRAME_WIDTH / cropWidth);

      canvas.width = Math.round(cropWidth * scale);
      canvas.height = Math.round(cropHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      canvas.toBlob(
        (blob) => {
          if (!blob || ws.readyState !== WebSocket.OPEN) return;
          blob.arrayBuffer().then((buf) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(buf);
          });
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    }, frameIntervalMs);
  }

  async function handleDetection(detection: WsDetection) {
    try {
      const session = JSON.parse(
        localStorage.getItem("workstation_session") || "{}",
      ) as Record<string, unknown>;
      const result = await api.post<ScanApiResponse>("/api/portal/scan", {
        plate: detection.plate,
        country: detection.country,
        make: detection.make,
        model: detection.model,
        color: detection.color,
        category: detection.category,
        confidence: detection.confidence,
        occurredAt: detection.timestamp,
        workstationAddress:
          typeof session.address === "string" ? session.address : undefined,
      });

      if (!result.success) return;

      const entry: ScanLogEntry = {
        id: result.data.detection.id,
        plate: result.data.detection.plate,
        timestamp: result.data.detection.occurredAt,
        isHit: result.data.isHit,
        country: result.data.detection.country,
        make: result.data.detection.make,
        model: result.data.detection.model,
        color: result.data.detection.color,
        category: result.data.detection.category,
        confidence: result.data.detection.confidence,
        matches: result.data.matches,
        fresh: true,
      };

      if (result.data.isHit) {
        playAlertBeep();
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const priority =
            result.data.matches[0]?.hitlistEntry.priority ?? "UNKNOWN";
          const reason =
            result.data.matches[0]?.hitlistEntry.reasonSummary ??
            "Hitlist match";
          new Notification(`ALERT: Plate ${entry.plate} matched!`, {
            body: `Priority: ${priority} - ${reason}`,
          });
        }
      }

      setTimeout(() => {
        setScanLog((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, fresh: false } : e)),
        );
      }, 3000);

      setScanLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
      setTotalScans((n) => n + 1);
      if (result.data.isHit) setHitCount((n) => n + 1);

      if (bridgeRef.current?.readyState === WebSocket.OPEN) {
        const det = result.data.detection;
        bridgeRef.current.send(
          JSON.stringify({
            type: "detection",
            data: {
              id: det.id,
              externalEventId: "",
              plate: det.plate,
              plateNormalized: det.plate,
              occurredAt:
                typeof det.occurredAt === "string"
                  ? det.occurredAt
                  : new Date(det.occurredAt).toISOString(),
              confidence: det.confidence,
              snapshotPath: null,
              country: det.country,
              make: det.make,
              model: det.model,
              color: det.color,
              category: det.category,
            },
          }),
        );

        for (const m of result.data.matches) {
          bridgeRef.current.send(
            JSON.stringify({
              type: "alert",
              data: {
                plate: det.plate,
                normalizedPlate: det.plate,
                priority: m.hitlistEntry.priority,
                hitlistEntryId: m.hitlistEntry.id,
                reasonSummary: m.hitlistEntry.reasonSummary,
                vehicleDescription:
                  [det.color, det.make, det.model, det.category]
                    .filter(Boolean)
                    .join(" · ") || null,
                detectionId: det.id,
                occurredAt:
                  typeof det.occurredAt === "string"
                    ? det.occurredAt
                    : new Date(det.occurredAt).toISOString(),
              },
            }),
          );
        }
      }
    } catch {}
  }

  async function startScanning() {
    setErrorMsg("");
    setStatus("connecting");

    if (bridgeRef.current?.readyState === WebSocket.OPEN) {
      bridgeRef.current.send(JSON.stringify({ type: "scanStart" }));
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: "environment" },
        },
      });
    } catch {
      setErrorMsg("Camera access denied. Please allow camera permissions.");
      setStatus("error");
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      const session = JSON.parse(
        localStorage.getItem("workstation_session") || "{}",
      ) as Record<string, unknown>;
      ws.send(
        JSON.stringify({
          type: "start",
          region,
          continuous: true,
          workstationAddress:
            typeof session.address === "string" ? session.address : "",
        }),
      );
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "ready") {
          setStatus("scanning");
          if (!sessionStart) setSessionStart(Date.now());
          startFrameCapture(ws, intervalMs);
        } else if (msg.type === "detection") {
          void handleDetection(msg.data as WsDetection);
        } else if (msg.type === "error") {
          setErrorMsg(msg.message || "Server error");
          setStatus("error");
          teardown();
        } else if (msg.type === "ended") {
          setStatus("idle");
          teardown();
        }
      } catch {}
    };

    ws.onerror = () => {
      setErrorMsg("WebSocket error \u2014 is the WS server running?");
      setStatus("error");
      teardown();
    };

    ws.onclose = () => {
      if (statusRef.current === "scanning") {
        setStatus("idle");
      }
    };
  }

  function stopScanning() {
    if (bridgeRef.current?.readyState === WebSocket.OPEN) {
      bridgeRef.current.send(JSON.stringify({ type: "scanStop" }));
    }
    teardown();
    setStatus("idle");
  }

  const isActive = status === "scanning" || status === "connecting";
  const hitRate =
    totalScans > 0 ? ((hitCount / totalScans) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[35%] min-w-[320px] max-w-[480px] border-r border-border flex flex-col glass-heavy overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Live Feed
            </span>
          </div>
          <Badge variant="outline" className="tabular-nums text-xs">
            {totalScans} scanned
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {scanLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/30 select-none">
              <Radar className="w-12 h-12 mb-3" strokeWidth={1} />
              <span className="text-sm">No detections yet</span>
              <span className="text-xs mt-1">
                Start scanning to see results
              </span>
            </div>
          ) : (
            scanLog.map((entry) => (
              <DetectionRow key={entry.id} entry={entry} />
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Tablet className="w-3.5 h-3.5" />
            <span>Connected Tablets</span>
            <Badge
              variant={connectedTablets > 0 ? "success" : "outline"}
              className="ml-auto text-xs"
            >
              {connectedTablets}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 relative flex items-center justify-center bg-background p-4">
          <div
            className={cn(
              "relative w-full max-w-4xl aspect-video rounded-xl border overflow-hidden",
              status === "scanning" ? "border-primary/25" : "border-border",
            )}
            style={{
              transform: `scale(${scaleFactor})`,
              transformOrigin: "center center",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                (status === "idle" ||
                  status === "connecting" ||
                  status === "error") &&
                  "opacity-0 absolute inset-0",
              )}
            />

            {(status === "idle" || status === "error") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30 select-none">
                <Camera className="w-16 h-16" strokeWidth={1} />
                <span className="text-sm mt-3">Camera preview</span>
              </div>
            )}

            {status === "connecting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <div className="h-10 w-10 rounded-full border-2 border-muted border-t-primary animate-spin" />
                <span className="text-sm mt-3">Connecting&hellip;</span>
              </div>
            )}

            {status === "scanning" && (
              <div className="absolute inset-x-[8%] top-1/2 -translate-y-1/2 h-[42%] border border-dashed border-primary/20 rounded-lg pointer-events-none z-10" />
            )}
          </div>

          {status === "error" && (
            <div className="absolute bottom-6 left-6 right-6 rounded-lg border border-destructive/30 bg-destructive/5 backdrop-blur-sm px-4 py-3 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="border-t border-border glass-heavy px-4 py-3 space-y-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              onClick={isActive ? stopScanning : startScanning}
              variant={isActive ? "outline" : "default"}
              className={cn(
                "h-10 px-5 gap-2 font-semibold",
                !isActive && "glow-primary",
              )}
            >
              <Radar className="w-4 h-4" />
              {isActive ? "Stop" : "Start Scanning"}
            </Button>

            <ControlSelect
              id="ws-region"
              label="Region"
              value={region}
              onChange={setRegion}
              disabled={isActive}
              options={REGIONS.map((r) => ({ value: r.value, label: r.label }))}
            />

            <ControlSelect
              id="ws-rate"
              label="Rate"
              value={String(intervalMs)}
              onChange={(v) => setIntervalMs(Number(v))}
              disabled={isActive}
              options={INTERVALS.map((i) => ({
                value: String(i.ms),
                label: i.label,
              }))}
            />

            <ControlSelect
              id="ws-scale"
              label="Scale"
              value={String(scaleFactor)}
              onChange={(v) => setScaleFactor(Number(v))}
              disabled={false}
              options={SCALE_OPTIONS.map((s) => ({
                value: String(s.value),
                label: s.label,
              }))}
            />
          </div>

          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <StatItem
              icon={Activity}
              label="Scans"
              value={String(totalScans)}
            />
            <StatItem
              icon={ShieldAlert}
              label="Hits"
              value={String(hitCount)}
              highlight={hitCount > 0}
            />
            <StatItem icon={Zap} label="Hit Rate" value={`${hitRate}%`} />
            <StatItem icon={Clock} label="Session" value={elapsed} />
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function ControlSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={id}
        className="text-xs text-muted-foreground whitespace-nowrap"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none rounded-lg border border-border bg-card px-2.5 py-1.5 pr-7 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 cursor-pointer"
        >
          {options.map((o) => (
            <option
              key={o.value}
              value={o.value}
              className="bg-background text-foreground"
            >
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon
        className={cn(
          "w-3.5 h-3.5",
          highlight ? "text-destructive" : "text-muted-foreground/60",
        )}
      />
      <span className="text-muted-foreground/60">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums font-medium",
          highlight ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DetectionRow({ entry }: { entry: ScanLogEntry }) {
  const vehicleDetails = [entry.color, entry.make, entry.model, entry.category]
    .filter(Boolean)
    .join(" \u00b7 ");
  const confidencePct =
    entry.confidence !== null
      ? entry.confidence <= 1
        ? Math.round(entry.confidence * 100)
        : Math.round(entry.confidence)
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        entry.isHit
          ? "border-destructive/35 bg-destructive/5 glow-destructive"
          : "border-border bg-card/30",
        entry.fresh && entry.isHit && "animate-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {entry.isHit && (
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0 mt-[3px]" />
          )}
          <span className="font-mono text-sm font-bold tracking-widest text-foreground leading-none">
            {entry.plate}
          </span>
          <Badge
            variant={entry.isHit ? "destructive" : "success"}
            className="text-[10px] px-1.5 py-0"
          >
            {entry.isHit ? "HIT" : "CLEAR"}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
          {relativeTime(entry.timestamp)}
        </span>
      </div>

      {(vehicleDetails || confidencePct !== null) && (
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {vehicleDetails && (
            <span className="text-[11px] text-muted-foreground">
              {vehicleDetails}
            </span>
          )}
          {confidencePct !== null && (
            <span className="text-[11px] text-muted-foreground/50 tabular-nums">
              {confidencePct}%
            </span>
          )}
        </div>
      )}

      {entry.isHit && entry.matches.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {entry.matches.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-1.5 space-y-0.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {m.hitlistEntry.priority && (
                  <span className="text-[10px] font-semibold text-destructive uppercase tracking-wide">
                    {m.hitlistEntry.priority}
                  </span>
                )}
                {m.hitlistEntry.caseReference && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {m.hitlistEntry.caseReference}
                  </span>
                )}
                {!m.hitlistEntry.priority && !m.hitlistEntry.caseReference && (
                  <span className="text-[10px] font-semibold text-destructive">
                    Match found
                  </span>
                )}
              </div>
              {m.hitlistEntry.reasonSummary && (
                <p className="text-[10px] text-destructive/75 leading-snug">
                  {m.hitlistEntry.reasonSummary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
