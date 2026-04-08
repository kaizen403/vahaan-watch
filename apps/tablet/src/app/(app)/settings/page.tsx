"use client";

import { useRouter } from "next/navigation";
import { useWorkstation } from "@/contexts/WorkstationContext";
import { cn } from "@/lib/utils";
import type { ComponentHealth } from "@/types/workstation";
import {
  Settings,
  WifiOff,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Unplug,
  Info,
  Activity,
} from "lucide-react";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function HealthBadge({ status }: { status: ComponentHealth["status"] }) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Healthy
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <AlertTriangle className="h-3.5 w-3.5" />
      Unhealthy
    </span>
  );
}

function RowItem({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground text-right">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { connected, healthReport, wsUrl, disconnect, reconnecting } =
    useWorkstation();

  function handleDisconnect() {
    disconnect();
    router.push("/");
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Workstation connection and configuration
        </p>
      </div>

      <section className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Wifi className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Connection</h2>
        </div>
        <RowItem label="Status">
          <div className="flex items-center gap-2 justify-end">
            {connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="text-success font-medium">Connected</span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full bg-destructive",
                    reconnecting && "animate-pulse",
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    reconnecting ? "text-warning" : "text-destructive",
                  )}
                >
                  {reconnecting ? "Reconnecting…" : "Disconnected"}
                </span>
              </>
            )}
          </div>
        </RowItem>
        <div className="flex items-start justify-between px-4 py-3 gap-4 border-b border-border last:border-b-0">
          <span className="text-sm text-muted-foreground shrink-0">
            Workstation Address
          </span>
          <span className="text-sm text-foreground font-mono text-right break-all">
            {wsUrl ?? "—"}
          </span>
        </div>
      </section>

      {healthReport && (
        <section className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              Workstation Health
            </h2>
          </div>
          <RowItem label="Overall">
            <HealthBadge status={healthReport.overall} />
          </RowItem>
          <RowItem
            label={
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Uptime
              </span>
            }
          >
            <span className="font-mono tabular-nums">
              {formatUptime(healthReport.uptime)}
            </span>
          </RowItem>
          <RowItem
            label={
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Pending Detections
              </span>
            }
          >
            <span
              className={cn(
                "font-mono tabular-nums",
                healthReport.pendingDetections > 0
                  ? "text-warning"
                  : "text-foreground",
              )}
            >
              {healthReport.pendingDetections}
            </span>
          </RowItem>
          <RowItem
            label={
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Pending Match Events
              </span>
            }
          >
            <span
              className={cn(
                "font-mono tabular-nums",
                healthReport.pendingMatchEvents > 0
                  ? "text-warning"
                  : "text-foreground",
              )}
            >
              {healthReport.pendingMatchEvents}
            </span>
          </RowItem>

          {healthReport.components.length > 0 && (
            <div className="px-4 pt-3 pb-4 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
                Components
              </p>
              {healthReport.components.map((comp) => (
                <div
                  key={comp.component}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-sm text-foreground">
                    {comp.component}
                  </span>
                  <HealthBadge status={comp.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Unplug className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Actions</h2>
        </div>
        <div className="p-4">
          <button
            type="button"
            onClick={handleDisconnect}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg",
              "border border-destructive/50 text-destructive",
              "text-sm font-medium",
              "hover:bg-destructive/10 active:bg-destructive/20",
              "transition-colors duration-150",
            )}
          >
            <WifiOff className="h-4 w-4" />
            Disconnect from Workstation
          </button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Clears the saved address and returns to pairing.
          </p>
        </div>
      </section>

      <section className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">App Info</h2>
        </div>
        <RowItem label="Application">
          <span>Vaahan Tablet</span>
        </RowItem>
        <RowItem label="Version">
          <span className="font-mono">v1.0.0</span>
        </RowItem>
        <div className="flex items-start justify-between px-4 py-3 gap-4">
          <span className="text-sm text-muted-foreground shrink-0">
            Central API
          </span>
          <span className="text-sm text-foreground font-mono text-right break-all">
            {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}
          </span>
        </div>
      </section>
    </div>
  );
}
