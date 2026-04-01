import type {
  ApiResponse,
  DetectionUploadRequest,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  HeartbeatPayload,
  HitlistSyncResponse,
  MatchEventUploadRequest,
  SyncContractsResponse,
  SyncCursor,
  SyncScope,
} from "../types.js";

interface CentralApiClientConfig {
  baseUrl: string;
}

interface RequestOptions {
  auth: "device" | "provisioning" | "none";
  body?: unknown;
}

class RetryableRequestError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class CentralApiClient {
  private readonly baseUrl: string;
  private deviceToken: string | null;

  public constructor(config: CentralApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.deviceToken = null;
  }

  public setDeviceToken(token: string): void {
    this.deviceToken = token;
  }

  public async register(body: DeviceRegistrationRequest): Promise<DeviceRegistrationResponse> {
    return this.request<DeviceRegistrationResponse>("/api/devices/register", {
      auth: "provisioning",
      body,
    });
  }

  public async getSyncContracts(): Promise<SyncContractsResponse> {
    return this.request<SyncContractsResponse>("/api/sync/contracts", { auth: "none" });
  }

  public async getHitlist(hitlistId: string, sinceVersion?: number): Promise<HitlistSyncResponse> {
    const params = new URLSearchParams();
    if (typeof sinceVersion === "number") {
      params.set("sinceVersion", String(sinceVersion));
    }

    const query = params.size > 0 ? `?${params.toString()}` : "";
    return this.request<HitlistSyncResponse>(`/api/sync/hitlists/${encodeURIComponent(hitlistId)}${query}`, {
      auth: "device",
    });
  }

  public async getSyncCursors(): Promise<SyncCursor[]> {
    return this.request<SyncCursor[]>("/api/sync/cursors", { auth: "device" });
  }

  public async updateSyncCursor(scope: SyncScope, cursor: string): Promise<void> {
    await this.request<SyncCursor>("/api/sync/cursors", {
      auth: "device",
      body: { scope, cursor },
    });
  }

  public async uploadDetection(body: DetectionUploadRequest): Promise<{ id: string }> {
    const response = await this.request<{ id: string }>("/api/ingest/detections", {
      auth: "device",
      body,
    });

    return { id: response.id };
  }

  public async uploadMatchEvent(body: MatchEventUploadRequest): Promise<{ id: string }> {
    const response = await this.request<{ id: string }>("/api/ingest/match-events", {
      auth: "device",
      body,
    });

    return { id: response.id };
  }

  public async sendHeartbeat(payload: HeartbeatPayload): Promise<void> {
    await this.request<unknown>("/api/telemetry/heartbeat", {
      auth: "device",
      body: payload,
    });
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const attempts = 5;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(path, options);

        if (response.status >= 500) {
          throw new RetryableRequestError(`Central API request failed with status ${response.status}.`);
        }

        return await this.parseResponse<T>(response);
      } catch (error) {
        const shouldRetry = attempt < attempts - 1 && this.isRetryable(error);
        if (!shouldRetry) {
          throw error;
        }

        const delay = Math.min(500 * 2 ** attempt, 30_000);
        const jitter = Math.floor(Math.random() * 1000);
        await sleep(delay + jitter);
      }
    }

    throw new Error("Central API request failed after retries.");
  }

  private async fetchWithTimeout(path: string, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const headers = new Headers({
        Accept: "application/json",
      });

      if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      if (options.auth === "device") {
        if (!this.deviceToken) {
          throw new Error("Device token is not set.");
        }
        headers.set("x-device-token", this.deviceToken);
      }

      if (options.auth === "provisioning") {
        const provisioningToken = process.env.DEVICE_PROVISIONING_TOKEN;
        if (!provisioningToken) {
          throw new Error("DEVICE_PROVISIONING_TOKEN is required for registration.");
        }
        headers.set("x-provisioning-token", provisioningToken);
      }

      return await fetch(new URL(path, `${this.baseUrl}/`), {
        method: options.body === undefined ? "GET" : "POST",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const payload = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new Error(this.extractError(payload, response.status));
    }

    if (payload === undefined) {
      return undefined as T;
    }

    const envelope = payload as ApiResponse<T>;
    if (typeof envelope === "object" && envelope !== null && "success" in envelope) {
      if (envelope.success) {
        return envelope.data;
      }

      throw new Error(envelope.error);
    }

    return payload as T;
  }

  private extractError(payload: unknown, status: number): string {
    if (typeof payload === "object" && payload !== null) {
      if ("error" in payload && typeof payload.error === "string") {
        return payload.error;
      }
      if ("message" in payload && typeof payload.message === "string") {
        return payload.message;
      }
    }

    return `Central API request failed with status ${status}.`;
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof RetryableRequestError) {
      return true;
    }

    return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
  }
}
