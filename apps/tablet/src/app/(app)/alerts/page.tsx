"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useWorkstation } from "@/contexts/WorkstationContext";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertPayload } from "@/types/workstation";

type MatchStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "ESCALATED"
  | "FALSE_POSITIVE"
  | "RESOLVED";

interface ApiMatchEvent {
  id: string;
  plate: string;
  plateNormalized: string | null;
  priority: string | null;
  alertStatus: MatchStatus;
  reasonSummary: string | null;
  vehicleDescription: string | null;
  detectionId: string;
  occurredAt: string;
}

type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface DisplayAlert {
  id: string | null;
  detectionId: string;
  plate: string;
  priority: string | null;
  alertStatus: MatchStatus;
  reasonSummary: string | null;
  vehicleDescription: string | null;
  occurredAt: string;
}

function priorityVariant(
  priority: string | null,
): "destructive" | "warning" | "outline" {
  if (priority === "HIGH") return "destructive";
  if (priority === "MEDIUM") return "warning";
  return "outline";
}

function statusVariant(
  status: MatchStatus,
): "destructive" | "warning" | "success" | "secondary" | "outline" {
  switch (status) {
    case "PENDING":
      return "destructive";
    case "ACKNOWLEDGED":
      return "success";
    case "ESCALATED":
      return "warning";
    case "FALSE_POSITIVE":
      return "secondary";
    case "RESOLVED":
      return "outline";
  }
}

function statusLabel(status: MatchStatus): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "ESCALATED":
      return "Escalated";
    case "FALSE_POSITIVE":
      return "False Positive";
    case "RESOLVED":
      return "Resolved";
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fromPayload(p: AlertPayload): DisplayAlert {
  return {
    id: null,
    detectionId: p.detectionId,
    plate: p.plate,
    priority: p.priority,
    alertStatus: "PENDING",
    reasonSummary: p.reasonSummary,
    vehicleDescription: p.vehicleDescription,
    occurredAt: p.occurredAt,
  };
}

function fromApiEvent(e: ApiMatchEvent): DisplayAlert {
  return {
    id: e.id,
    detectionId: e.detectionId,
    plate: e.plate,
    priority: e.priority,
    alertStatus: e.alertStatus,
    reasonSummary: e.reasonSummary,
    vehicleDescription: e.vehicleDescription,
    occurredAt: e.occurredAt,
  };
}

export default function AlertsPage() {
  const { alerts: liveAlerts } = useWorkstation();

  const [workstationId, setWorkstationId] = useState<string | null>(null);
  const [apiAlerts, setApiAlerts] = useState<DisplayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const prevCountRef = useRef<number | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setWorkstationId(localStorage.getItem("tablet_workstation_id"));
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = workstationId
        ? `/api/match-events?workstationId=${encodeURIComponent(workstationId)}&limit=50`
        : `/api/match-events?limit=50`;
      const resp =
        await api.get<ApiResp<{ items: ApiMatchEvent[]; total: number }>>(path);
      if (resp.success) {
        setApiAlerts(resp.data.items.map(fromApiEvent));
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [workstationId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (prevCountRef.current === null) {
      prevCountRef.current = liveAlerts.length;
    } else if (liveAlerts.length > prevCountRef.current) {
      const added = liveAlerts.slice(
        0,
        liveAlerts.length - prevCountRef.current,
      );
      const ids = added.map((a) => a.detectionId);
      setNewIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => {
          next.add(id);
        });
        return next;
      });
      timer = setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => {
            next.delete(id);
          });
          return next;
        });
      }, 3000);
      prevCountRef.current = liveAlerts.length;
    } else {
      prevCountRef.current = liveAlerts.length;
    }

    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [liveAlerts]);

  const merged: DisplayAlert[] = (() => {
    const map = new Map<string, DisplayAlert>();
    for (const a of apiAlerts) map.set(a.detectionId, a);
    for (const live of liveAlerts) {
      if (!map.has(live.detectionId)) {
        map.set(live.detectionId, fromPayload(live));
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  })();

  async function handleAction(alert: DisplayAlert, next: MatchStatus) {
    if (!alert.id) return;
    const key = alert.id;
    setUpdating((prev) => new Set(prev).add(key));
    try {
      await api.patch<unknown>(`/api/match-events/${alert.id}`, {
        alertStatus: next,
      });
      setApiAlerts((prev) =>
        prev.map((a) => (a.id === key ? { ...a, alertStatus: next } : a)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setUpdating((prev) => {
        const s = new Set(prev);
        s.delete(key);
        return s;
      });
    }
  }

  const pendingCount = merged.filter((a) => a.alertStatus === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Alerts</h1>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="tabular-nums">
              {pendingCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fetchHistory()}
          disabled={loading}
          aria-label="Refresh alerts"
        >
          <RefreshCw
            className={cn(
              "w-4 h-4 text-muted-foreground",
              loading && "animate-spin",
            )}
          />
        </Button>
      </div>

      {error && (
        <div className="glass rounded-xl p-3 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setError(null)}
            className="h-6 w-6 text-destructive"
            aria-label="Dismiss error"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      )}

      {loading && merged.length === 0 && (
        <div className="flex items-center justify-center min-h-[240px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && merged.length === 0 && (
        <div className="glass rounded-xl p-12 flex flex-col items-center text-center min-h-[300px] justify-center">
          <div className="glass rounded-full p-6 mb-4">
            <Bell className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-2">
            No alerts yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Alerts will appear here when a scanned plate matches a hit list.
          </p>
        </div>
      )}

      {merged.length > 0 && (
        <div className="space-y-3">
          {merged.map((alert) => {
            const isNew = newIds.has(alert.detectionId);
            const isUpdating = alert.id ? updating.has(alert.id) : false;
            const isPending = alert.alertStatus === "PENDING";
            const isHigh = alert.priority === "HIGH";

            return (
              <div
                key={alert.detectionId}
                className={cn(
                  "glass rounded-xl p-4 border transition-all duration-500",
                  isNew &&
                    "border-primary/40 bg-primary/5 shadow-[0_0_24px_oklch(0.72_0.19_145/0.12)]",
                  !isNew && isHigh && "border-destructive/25",
                  !isNew && !isHigh && "border-border",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xl font-bold text-foreground tracking-widest">
                      {alert.plate}
                    </span>
                    {alert.priority && (
                      <Badge variant={priorityVariant(alert.priority)}>
                        {alert.priority}
                      </Badge>
                    )}
                    <Badge variant={statusVariant(alert.alertStatus)}>
                      {statusLabel(alert.alertStatus)}
                    </Badge>
                    {isNew && (
                      <Badge
                        variant="default"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        New
                      </Badge>
                    )}
                  </div>

                  {alert.reasonSummary && (
                    <p className="text-sm font-medium text-foreground mt-1.5">
                      {alert.reasonSummary}
                    </p>
                  )}

                  {alert.vehicleDescription && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {alert.vehicleDescription}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 mt-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {relativeTime(alert.occurredAt)}
                    </span>
                  </div>
                </div>

                {alert.id && isPending && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleAction(alert, "ACKNOWLEDGED")}
                      disabled={isUpdating}
                      className="flex-1 text-success border-success/30 hover:bg-success/10 hover:text-success glass"
                    >
                      {isUpdating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleAction(alert, "ESCALATED")}
                      disabled={isUpdating}
                      className="flex-1 text-warning border-warning/30 hover:bg-warning/10 hover:text-warning glass"
                    >
                      {isUpdating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      Escalate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleAction(alert, "FALSE_POSITIVE")}
                      disabled={isUpdating}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                {alert.id && !isPending && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground flex-1">
                      {alert.alertStatus === "ACKNOWLEDGED" &&
                        "Acknowledged — no further action needed"}
                      {alert.alertStatus === "ESCALATED" &&
                        "Escalated to supervisor"}
                      {alert.alertStatus === "FALSE_POSITIVE" &&
                        "Marked as false positive"}
                      {alert.alertStatus === "RESOLVED" && "Resolved"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleAction(alert, "PENDING")}
                      disabled={isUpdating}
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Reopen
                    </Button>
                  </div>
                )}

                {!alert.id && (
                  <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Live alert — syncing to server…
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
