"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  ListPlus,
  Search,
  Shield,
  Zap,
} from "lucide-react";

import { api } from "@/lib/api";
import { useWorkstation } from "@/contexts/WorkstationContext";
import { AddToHitlistModal } from "@/components/AddToHitlistModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DetectionEvent } from "@/types/workstation";
import { cn } from "@/lib/utils";

const MAX_FEED_DETECTIONS = 50;
const FEED_POLL_MS = 10_000;

type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type StatsData = {
  totalDetections: number;
  detectionsToday: number;
  totalMatches: number;
  matchesToday: number;
  lastSeenAt: string | null;
};

interface ApiDetection {
  id: string;
  plate: string;
  occurredAt: string;
  confidence: number | null;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  matchEvents: { id: string; alertStatus: string }[];
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="glass glass-hover transition-all">
      <CardContent className="p-4">
        <div className="text-muted-foreground">{icon}</div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-foreground tabular-nums">
            {value}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
          {sub && <div className="mt-1.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { connected, healthReport, lastDetection, alerts, matches } =
    useWorkstation();

  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const [apiDetections, setApiDetections] = useState<DetectionEvent[]>([]);
  const [workstationId, setWorkstationId] = useState<string | null>(null);
  const [apiStats, setApiStats] = useState<StatsData | null>(null);
  const [hitlistPlate, setHitlistPlate] = useState<{
    plate: string;
    confidence: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    category: string | null;
  } | null>(null);
  const prevDetectionRef = useRef<DetectionEvent | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = localStorage.getItem("tablet_workstation_id");
    setWorkstationId(id);
  }, []);

  useEffect(() => {
    if (!workstationId) return;

    const fetchStats = async () => {
      try {
        const response = await api.get<ApiResp<StatsData>>(
          `/api/workstations/${workstationId}/stats`,
        );
        if (response.success && response.data) {
          setApiStats(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [workstationId]);

  const fetchRecentDetections = useCallback(async () => {
    if (!workstationId) return;
    try {
      const params = new URLSearchParams({
        workstationId,
        limit: "10",
      });
      const resp = await api.get<
        ApiResp<{ detections: ApiDetection[]; total: number }>
      >(`/api/detections?${params.toString()}`);
      if (resp.success) {
        setApiDetections(
          resp.data.detections.map((d) => ({
            id: d.id,
            externalEventId: "",
            plate: d.plate,
            plateNormalized: d.plate,
            occurredAt: d.occurredAt,
            confidence: d.confidence,
            snapshotPath: null,
            country: d.country,
            make: d.make,
            model: d.model,
            color: d.color,
            category: d.category,
          })),
        );
      }
    } catch {}
  }, [workstationId]);

  useEffect(() => {
    fetchRecentDetections();
    const interval = setInterval(fetchRecentDetections, FEED_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchRecentDetections]);

  useEffect(() => {
    if (lastDetection && lastDetection !== prevDetectionRef.current) {
      prevDetectionRef.current = lastDetection;
      setDetections((prev) =>
        [lastDetection, ...prev].slice(0, MAX_FEED_DETECTIONS),
      );
      if (feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
    }
  }, [lastDetection]);

  const matchedDetectionIds = new Set(matches.map((m) => m.detection.id));

  const feedDetections = (() => {
    const seen = new Set<string>();
    const merged: DetectionEvent[] = [];
    for (const d of detections) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push(d);
      }
    }
    for (const d of apiDetections) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push(d);
      }
    }
    return merged.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  })();

  const overallStatus = healthReport?.overall ?? null;
  const uptime = healthReport?.uptime ?? 0;
  const totalScans = detections.length;
  const totalAlerts = alerts.length;

  const displayTotalScans = apiStats?.detectionsToday ?? totalScans;
  const displayAlerts = apiStats?.matchesToday ?? totalAlerts;
  const displayMatches = apiStats?.totalMatches ?? matches.length;

  const statusBadgeVariant =
    overallStatus === "healthy"
      ? "success"
      : overallStatus === "degraded"
        ? "warning"
        : overallStatus === "unhealthy"
          ? "destructive"
          : "secondary";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Search className="h-4 w-4" />}
          label="Total Scans"
          value={displayTotalScans}
          sub={
            <span className="text-[10px] text-muted-foreground font-mono">
              {totalScans} this session
            </span>
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Alerts"
          value={displayAlerts}
          sub={
            displayAlerts > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                {displayAlerts} today
              </Badge>
            ) : undefined
          }
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Uptime"
          value={healthReport ? formatUptime(uptime) : "—"}
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Matches"
          value={displayMatches}
          sub={
            <span className="text-[10px] text-muted-foreground font-mono">
              all time
            </span>
          }
        />
      </div>

      <div className="glass rounded-xl p-3 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Shield className="w-3 h-3 text-primary" strokeWidth={1.5} />
        </div>
        <span className="text-xs font-medium text-muted-foreground flex-1">
          Workstation
        </span>
        {overallStatus ? (
          <Badge
            variant={statusBadgeVariant}
            className="capitalize text-[10px]"
          >
            {overallStatus}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            No Report
          </Badge>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              connected ? "bg-success" : "bg-destructive",
            )}
          />
          <span className="text-[10px] text-muted-foreground">
            {connected ? "Connected" : "Offline"}
          </span>
        </div>
        {healthReport &&
          (healthReport.pendingDetections > 0 ||
            healthReport.pendingMatchEvents > 0) && (
            <span className="text-[10px] text-warning font-mono">
              {healthReport.pendingDetections + healthReport.pendingMatchEvents}{" "}
              pending
            </span>
          )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Live Scan Feed
          </span>
          {connected && (
            <span className="relative flex h-1.5 w-1.5 ml-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
        </div>
        <div
          ref={feedRef}
          className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto"
        >
          {feedDetections.length === 0 ? (
            <Card>
              <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-center">
                <Search className="w-8 h-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Waiting for scans…
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Plate detections will appear here in real time
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            feedDetections.slice(0, 10).map((det) => {
              const isMatch = matchedDetectionIds.has(det.id);
              const matchAlert = alerts.find((a) => a.detectionId === det.id);
              return (
                <Card
                  key={det.id}
                  className={cn(
                    "glass transition-all",
                    isMatch && "border-destructive/40 glow-destructive",
                  )}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-foreground tracking-widest">
                          {det.plate}
                        </span>
                        {isMatch && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] font-bold shrink-0"
                          >
                            MATCH
                          </Badge>
                        )}
                      </div>
                      {matchAlert && (
                        <p className="text-xs text-destructive mt-0.5 truncate">
                          {matchAlert.reasonSummary ??
                            matchAlert.vehicleDescription ??
                            "Hitlist match"}
                        </p>
                      )}
                      {vehicleSummary(det) && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {vehicleSummary(det)}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {det.country && (
                          <span className="text-[10px] text-muted-foreground">
                            {det.country}
                          </span>
                        )}
                        {det.confidence !== null && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {(det.confidence * 100).toFixed(0)}% conf
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(det.occurredAt)}
                        </span>
                      </div>
                    </div>
                    {isMatch && (
                      <div className="w-8 h-8 rounded-lg bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                      onClick={() =>
                        setHitlistPlate({
                          plate: det.plate,
                          confidence: det.confidence,
                          make: det.make,
                          model: det.model,
                          color: det.color,
                          category: det.category,
                        })
                      }
                      aria-label="Add to hitlist"
                    >
                      <ListPlus className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
      <AddToHitlistModal
        open={!!hitlistPlate}
        plate={hitlistPlate?.plate ?? ""}
        vehicleMake={hitlistPlate?.make}
        vehicleModel={hitlistPlate?.model}
        vehicleColor={hitlistPlate?.color}
        vehicleCategory={hitlistPlate?.category}
        onClose={() => setHitlistPlate(null)}
      />
    </div>
  );
}
function vehicleSummary(det: DetectionEvent): string {
  return [det.color, det.make, det.model, det.category]
    .filter(Boolean)
    .join(" · ");
}
