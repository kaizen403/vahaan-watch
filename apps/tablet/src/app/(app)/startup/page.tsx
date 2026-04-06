"use client";

import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Activity,
  Clock,
  Database,
  ArrowRight,
  Shield,
} from "lucide-react";

import { useWorkstation } from "@/contexts/WorkstationContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ComponentHealth } from "@/types/workstation";
import { cn } from "@/lib/utils";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function StatusDot({ status }: { status: ComponentHealth["status"] }) {
  const colorMap: Record<ComponentHealth["status"], string> = {
    healthy: "bg-success",
    degraded: "bg-warning",
    unhealthy: "bg-destructive",
  };
  return (
    <span
      className={cn("inline-flex h-2.5 w-2.5 rounded-full shrink-0", colorMap[status])}
    />
  );
}

function OverallStatusIcon({ status }: { status: "healthy" | "degraded" | "unhealthy" }) {
  if (status === "healthy") {
    return <CheckCircle2 className="w-10 h-10 text-success" />;
  }
  if (status === "degraded") {
    return <AlertTriangle className="w-10 h-10 text-warning" />;
  }
  return <XCircle className="w-10 h-10 text-destructive" />;
}

export default function StartupPage() {
  const { healthReport, connected } = useWorkstation();
  const router = useRouter();

  if (!healthReport) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 min-h-[60vh]">
        <div className="glass-heavy rounded-2xl p-8 flex flex-col items-center gap-4 w-full max-w-xs">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {connected ? "Loading health report…" : "Connecting to workstation…"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {connected
                ? "Waiting for the workstation to report its status"
                : "Ensure the workstation agent is running"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { overall, components, uptime, pendingDetections, pendingMatchEvents } = healthReport;
  const canProceed = overall !== "unhealthy";

  const overallBadgeVariant =
    overall === "healthy"
      ? "success"
      : overall === "degraded"
        ? "warning"
        : "destructive";

  return (
    <div className="space-y-4 pb-4">
      <div
        className={cn(
          "glass-heavy rounded-xl p-4 flex items-center gap-4",
          overall === "unhealthy" && "border-destructive/30",
          overall === "degraded" && "border-warning/30",
          overall === "healthy" && "border-success/20",
        )}
      >
        <OverallStatusIcon status={overall} />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground tracking-tight">Startup Checks</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={overallBadgeVariant} className="capitalize">
              {overall}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {components.length} component{components.length !== 1 ? "s" : ""} checked
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-end">
            <Clock className="w-3 h-3" />
            <span className="font-mono tabular-nums">{formatUptime(uptime)}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">uptime</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Database className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <div
                className={cn(
                  "text-xl font-bold tabular-nums",
                  pendingDetections > 0 ? "text-warning" : "text-foreground",
                )}
              >
                {pendingDetections}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Pending Detections
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <div
                className={cn(
                  "text-xl font-bold tabular-nums",
                  pendingMatchEvents > 0 ? "text-warning" : "text-foreground",
                )}
              >
                {pendingMatchEvents}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Pending Matches
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
          Component Health
        </h2>
        {components.map((comp) => {
          const badgeVariant =
            comp.status === "healthy"
              ? "success"
              : comp.status === "degraded"
                ? "warning"
                : "destructive";

          return (
            <Card
              key={comp.component}
              className={cn(
                "glass glass-hover transition-all",
                comp.status === "unhealthy" && "border-destructive/30",
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={comp.status} />
                    <span className="text-sm font-semibold text-foreground capitalize truncate">
                      {comp.component}
                    </span>
                  </div>
                  <Badge variant={badgeVariant} className="capitalize shrink-0 text-[10px]">
                    {comp.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 pl-5 leading-relaxed">
                  {comp.message}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1 pl-5 font-mono">
                  checked {formatTime(comp.lastCheckedAt)}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {components.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No components reported yet</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="pt-2 space-y-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => router.push("/dashboard")}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all",
            canProceed
              ? "glass-heavy text-primary border border-primary/30 hover:border-primary/60 active:scale-[0.98] glow-primary"
              : "glass text-muted-foreground border border-border cursor-not-allowed opacity-50",
          )}
        >
          <Shield className="w-4 h-4" />
          Proceed to Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>
        {!canProceed && (
          <p className="text-center text-xs text-destructive">
            Resolve unhealthy components before proceeding
          </p>
        )}
      </div>
    </div>
  );
}
