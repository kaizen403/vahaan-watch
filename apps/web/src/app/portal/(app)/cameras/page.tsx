"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Wifi,
  WifiOff,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  MonitorSmartphone,
} from "lucide-react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002";

interface Workstation {
  id: string;
  address: string;
  deviceId: string;
  name: string;
  description: string | null;
  status: "PENDING" | "ACTIVE" | "OFFLINE" | "DISABLED";
  lastSeenAt: string | null;
  createdAt: string;
  _count?: { pairings: number };
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface CameraFeedProps {
  workstationAddress: string;
  wsUrl?: string;
  isActive: boolean;
}

function CameraFeed({ workstationAddress, wsUrl = WS_URL, isActive }: CameraFeedProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [connError, setConnError] = useState(false);
  const latestFrameUrl = useRef<string | null>(null);
  const shouldReconnect = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) {
      shouldReconnect.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsLive(false);
      setConnError(false);
      return;
    }

    shouldReconnect.current = true;

    function connect() {
      if (!shouldReconnect.current) return;
      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          setConnError(false);
          ws.send(JSON.stringify({ type: "viewCamera", workstationAddress }));
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const blob = new Blob([event.data], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            if (latestFrameUrl.current) URL.revokeObjectURL(latestFrameUrl.current);
            latestFrameUrl.current = url;
            setFrameUrl(url);
            setIsLive(true);
          } else if (typeof event.data === "string") {
            const msg = JSON.parse(event.data) as { type: string; active?: boolean };
            if (msg.type === "cameraOffline") setIsLive(false);
            else if (msg.type === "cameraStatus") setIsLive(msg.active ?? false);
          }
        };

        ws.onerror = () => {
          setConnError(true);
          setIsLive(false);
        };

        ws.onclose = () => {
          setIsLive(false);
          if (shouldReconnect.current) {
            timerRef.current = setTimeout(connect, 3000);
          }
        };
      } catch {
        setConnError(true);
      }
    }

    connect();

    return () => {
      shouldReconnect.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (latestFrameUrl.current) {
        URL.revokeObjectURL(latestFrameUrl.current);
        latestFrameUrl.current = null;
      }
    };
  }, [isActive, workstationAddress, wsUrl]);

  if (!isActive) {
    return (
      <div className="aspect-video bg-card/30 flex items-center justify-center">
        <Camera className="h-12 w-12 text-muted-foreground/20" />
      </div>
    );
  }

  return (
    <div className="aspect-video bg-card/30 relative overflow-hidden">
      {frameUrl ? (
        <img
          src={frameUrl}
          alt={`Live feed — ${workstationAddress}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {connError ? (
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-xs text-destructive/80">Connection error</p>
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
          )}
        </div>
      )}

    </div>
  );
}

export default function CamerasPage() {
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWorkstations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const resp = await api.get<ApiResp<Workstation[]>>("/api/workstations");
      if (resp.success) setWorkstations(resp.data ?? []);
      else setError(resp.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workstations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkstations();
    const id = setInterval(() => void fetchWorkstations(true), 30000);
    return () => clearInterval(id);
  }, [fetchWorkstations]);

  const activeCount = workstations.filter((w) => w.status === "ACTIVE").length;
  const offlineCount = workstations.filter((w) => w.status !== "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Live Cameras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time video feeds from active workstations
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void fetchWorkstations(true)}
          disabled={refreshing}
          className={cn(
            "flex items-center gap-2 glass glass-hover text-muted-foreground hover:text-foreground",
            refreshing && "opacity-50",
          )}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card">
              <Camera className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Workstations</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{workstations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card">
              <Wifi className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Online</p>
              <p className="text-2xl font-semibold text-success tabular-nums">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card">
              <WifiOff className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Offline</p>
              <p className="text-2xl font-semibold text-destructive tabular-nums">{offlineCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : workstations.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="glass rounded-full p-6 mb-4">
            <Camera className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No Workstations</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Register a workstation to begin monitoring camera feeds. Workstations connect via the device provisioning API.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workstations.map((ws) => {
            const isActive = ws.status === "ACTIVE";
            const statusVariant: "success" | "warning" | "destructive" | "outline" =
              ws.status === "ACTIVE"
                ? "success"
                : ws.status === "PENDING"
                  ? "warning"
                  : ws.status === "DISABLED"
                    ? "outline"
                    : "destructive";
            const statusLabel =
              ws.status === "PENDING"
                ? "Pending"
                : ws.status === "DISABLED"
                  ? "Disabled"
                  : ws.status === "OFFLINE"
                    ? "Offline"
                    : null;
            const StatusIcon =
              ws.status === "ACTIVE" ? Wifi : ws.status === "PENDING" ? Clock : WifiOff;

            return (
              <div key={ws.id} className="glass rounded-xl overflow-hidden glass-hover transition-all">
                <div className="relative">
                  <CameraFeed workstationAddress={ws.address} isActive={isActive} />
                  <div className="absolute top-3 right-3">
                    <Badge variant={statusVariant} className="gap-1.5">
                      <StatusIcon className="h-3 w-3" />
                      {statusLabel}
                    </Badge>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground truncate">{ws.name}</h3>
                    <span className="text-xs font-mono text-muted-foreground ml-2 shrink-0">{ws.address}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last seen: {timeAgo(ws.lastSeenAt)}</span>
                    {ws._count?.pairings ? (
                      <span className="flex items-center gap-1 text-accent">
                        <MonitorSmartphone className="h-3 w-3" />
                        {ws._count.pairings} paired
                      </span>
                    ) : null}
                  </div>

                  {ws.description && (
                    <p className="text-xs text-muted-foreground/70 truncate">{ws.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
