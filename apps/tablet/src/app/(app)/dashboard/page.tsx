"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Search,
  Shield,
  Zap,
} from "lucide-react";

import { useWorkstation } from "@/contexts/WorkstationContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DetectionEvent } from "@/types/workstation";
import { cn } from "@/lib/utils";

const MAX_FEED_DETECTIONS = 50;

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
          <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
          {sub && <div className="mt-1.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { connected, healthReport, lastDetection, alerts, matches } = useWorkstation();

  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const prevDetectionRef = useRef<DetectionEvent | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastDetection && lastDetection !== prevDetectionRef.current) {
      prevDetectionRef.current = lastDetection;
      setDetections((prev) => [lastDetection, ...prev].slice(0, MAX_FEED_DETECTIONS));
      if (feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
    }
  }, [lastDetection]);

  const matchedDetectionIds = new Set(matches.map((m) => m.detection.id));

  const overallStatus = healthReport?.overall ?? null;
  const uptime = healthReport?.uptime ?? 0;
  const totalScans = detections.length;
  const totalAlerts = alerts.length;

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
          value={totalScans}
          sub={
            <span className="text-[10px] text-muted-foreground font-mono">this session</span>
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Alerts"
          value={totalAlerts}
          sub={
            totalAlerts > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                {totalAlerts} hit{totalAlerts !== 1 ? "s" : ""}
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
          value={matches.length}
          sub={
            matches.length > 0 ? (
              <Badge variant="destructive" className="text-[10px]">Active</Badge>
            ) : undefined
          }
        />
      </div>

      <div className="glass rounded-xl p-3 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Shield className="w-3 h-3 text-primary" strokeWidth={1.5} />
        </div>
        <span className="text-xs font-medium text-muted-foreground flex-1">Workstation</span>
        {overallStatus ? (
          <Badge variant={statusBadgeVariant} className="capitalize text-[10px]">
            {overallStatus}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">No Report</Badge>
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
          (healthReport.pendingDetections > 0 || healthReport.pendingMatchEvents > 0) && (
            <span className="text-[10px] text-warning font-mono">
              {healthReport.pendingDetections + healthReport.pendingMatchEvents} pending
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
          {detections.length === 0 ? (
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
            detections.slice(0, 10).map((det) => {
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
                          <Badge variant="destructive" className="text-[10px] font-bold shrink-0">
                            MATCH
                          </Badge>
                        )}
                      </div>
                      {matchAlert && (
                        <p className="text-xs text-destructive mt-0.5 truncate">
                          {matchAlert.reasonSummary ?? matchAlert.vehicleDescription ?? "Hitlist match"}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
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
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
