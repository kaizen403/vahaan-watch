"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ListChecks,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Monitor,
  Shield,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HitlistStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

interface HitlistEntry {
  id: string;
  plateOriginal: string;
  plateNormalized: string;
  countryOrRegion: string | null;
  priority: string | null;
  status: string;
  reasonSummary: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
}

interface HitlistVersion {
  id: string;
  versionNumber: number;
  entries: HitlistEntry[];
  note: string | null;
  createdAt: string;
}

interface Hitlist {
  id: string;
  name: string;
  description: string | null;
  status: HitlistStatus;
  currentVersionNumber: number;
  versions: HitlistVersion[];
  createdAt: string;
  updatedAt: string;
}

interface WorkstationSummary {
  id: string;
  deviceId: string;
  name: string;
  status: string;
}

interface HitlistAssignment {
  id: string;
  hitlistId: string;
  workstationId: string;
  assignedAt: string;
  workstation: WorkstationSummary;
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

function statusVariant(status: HitlistStatus): "success" | "warning" | "secondary" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warning";
  return "secondary";
}

function priorityVariant(priority: string | null): "destructive" | "warning" | "outline" {
  if (priority === "HIGH") return "destructive";
  if (priority === "MEDIUM") return "warning";
  return "outline";
}

export default function HitListsPage() {
  const [workstationId, setWorkstationId] = useState<string | null>(null);
  const [hitlists, setHitlists] = useState<Hitlist[]>([]);
  const [assignments, setAssignments] = useState<Record<string, HitlistAssignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Hitlist | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    setWorkstationId(localStorage.getItem("tablet_workstation_id"));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listResp = await api.get<ApiResp<Hitlist[]>>("/api/hitlists");
      if (!listResp.success) {
        setError(listResp.error);
        return;
      }
      setHitlists(listResp.data);

      const settled = await Promise.allSettled(
        listResp.data.map((h) =>
          api.get<ApiResp<HitlistAssignment[]>>(
            `/api/hitlists/${h.id}/assignments`,
          ),
        ),
      );
      const next: Record<string, HitlistAssignment[]> = {};
      listResp.data.forEach((h, i) => {
        const r = settled[i];
        if (r.status === "fulfilled" && r.value.success) {
          next[h.id] = r.value.data;
        } else {
          next[h.id] = [];
        }
      });
      setAssignments(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hit lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const resp = await api.get<ApiResp<Hitlist>>(`/api/hitlists/${id}`);
      if (resp.success) {
        setDetailData(resp.data);
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshAssignments(hitlistId: string) {
    try {
      const resp = await api.get<ApiResp<HitlistAssignment[]>>(
        `/api/hitlists/${hitlistId}/assignments`,
      );
      if (resp.success) {
        setAssignments((prev) => ({ ...prev, [hitlistId]: resp.data }));
      }
    } catch (_e) {
    }
  }

  async function handleAssign(hitlistId: string) {
    if (!workstationId) {
      setError("Workstation ID not linked. Configure it in Settings.");
      return;
    }
    setActionLoading((prev) => new Set(prev).add(hitlistId));
    try {
      await api.post(`/api/hitlists/${hitlistId}/assign`, {
        workstationIds: [workstationId],
      });
      await refreshAssignments(hitlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setActionLoading((prev) => {
        const s = new Set(prev);
        s.delete(hitlistId);
        return s;
      });
    }
  }

  async function handleUnassign(hitlistId: string) {
    if (!workstationId) return;
    setActionLoading((prev) => new Set(prev).add(hitlistId));
    try {
      await api.del(`/api/hitlists/${hitlistId}/assign/${workstationId}`);
      setAssignments((prev) => ({
        ...prev,
        [hitlistId]: (prev[hitlistId] ?? []).filter(
          (a) => a.workstationId !== workstationId,
        ),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unassign");
    } finally {
      setActionLoading((prev) => {
        const s = new Set(prev);
        s.delete(hitlistId);
        return s;
      });
    }
  }

  const activeCount = hitlists.filter((h) => h.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Hit Lists</h1>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              {hitlists.length} total · {activeCount} active
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fetchAll()}
          disabled={loading}
          aria-label="Refresh hit lists"
        >
          <RefreshCw
            className={cn(
              "w-4 h-4 text-muted-foreground",
              loading && "animate-spin",
            )}
          />
        </Button>
      </div>

      {!workstationId && !loading && (
        <div className="glass rounded-xl p-3 border border-warning/30 bg-warning/5 flex items-center gap-3">
          <Monitor className="h-4 w-4 text-warning shrink-0" />
          <p className="text-xs text-warning flex-1">
            Workstation ID not linked — assign/unassign unavailable. Configure
            in Settings.
          </p>
        </div>
      )}

      {error && (
        <div className="glass rounded-xl p-3 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setError(null)}
            className="h-6 w-6 text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center min-h-[240px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && hitlists.length === 0 && (
        <div className="glass rounded-xl p-12 flex flex-col items-center text-center min-h-[300px] justify-center">
          <div className="glass rounded-full p-6 mb-4">
            <ListChecks className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-2">
            No Hit Lists
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            No hit lists found. Create hitlists in the web portal to manage
            them here.
          </p>
        </div>
      )}

      {!loading && hitlists.length > 0 && (
        <div className="space-y-3">
          {hitlists.map((h) => {
            const hitlistAssignments = assignments[h.id] ?? [];
            const isAssigned =
              !!workstationId &&
              hitlistAssignments.some((a) => a.workstationId === workstationId);
            const isExpanded = expandedId === h.id;
            const isActing = actionLoading.has(h.id);
            const entryCount = h.versions?.[0]?.entries?.length ?? 0;

            return (
              <div key={h.id} className="glass rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleExpand(h.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {h.name}
                        </span>
                        <Badge
                          variant={statusVariant(h.status)}
                          className="text-[10px]"
                        >
                          {h.status}
                        </Badge>
                        {isAssigned && (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            Assigned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        v{h.currentVersionNumber} · {entryCount} entries ·{" "}
                        {hitlistAssignments.length} workstation
                        {hitlistAssignments.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>

                  {workstationId &&
                    (isAssigned ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleUnassign(h.id)}
                        disabled={isActing}
                        className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                      >
                        {isActing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        Unassign
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAssign(h.id)}
                        disabled={isActing || h.status !== "ACTIVE"}
                        className="shrink-0 text-xs glass glass-hover"
                      >
                        {isActing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Shield className="h-3 w-3" />
                        )}
                        Assign
                      </Button>
                    ))}
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : detailData?.id === h.id ? (
                      <div className="space-y-4">
                        {detailData.description && (
                          <p className="text-xs text-muted-foreground">
                            {detailData.description}
                          </p>
                        )}

                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Monitor className="h-3 w-3" />
                            Assigned to {hitlistAssignments.length} workstation
                            {hitlistAssignments.length !== 1 ? "s" : ""}
                          </p>
                          {hitlistAssignments.length > 0 ? (
                            <div className="space-y-1">
                              {hitlistAssignments.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center gap-2 text-xs glass rounded-lg px-2 py-1.5"
                                >
                                  <Monitor className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-foreground">
                                    {a.workstation.name}
                                  </span>
                                  <span className="text-muted-foreground font-mono">
                                    {a.workstation.deviceId}
                                  </span>
                                  {a.workstationId === workstationId && (
                                    <Badge
                                      variant="success"
                                      className="text-[10px] ml-auto"
                                    >
                                      This device
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No workstations assigned.
                            </p>
                          )}
                        </div>

                        {detailData.versions.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            No versions yet.
                          </p>
                        ) : (
                          detailData.versions.map((v) => (
                            <div key={v.id} className="space-y-2">
                              <p className="text-xs font-medium text-foreground">
                                Version {v.versionNumber}
                                <span className="text-muted-foreground font-normal ml-2">
                                  {v.entries.length} entries
                                  {v.note && ` · ${v.note}`}
                                </span>
                              </p>
                              {v.entries.length > 0 && (
                                <div className="overflow-x-auto rounded-lg border border-border">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border bg-card/30">
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                          Plate
                                        </th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                          Priority
                                        </th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                          Reason
                                        </th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                                          Vehicle
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {v.entries.slice(0, 15).map((entry) => (
                                        <tr
                                          key={entry.id}
                                          className="border-b border-border last:border-0"
                                        >
                                          <td className="px-3 py-2 text-foreground font-mono">
                                            {entry.plateOriginal}
                                          </td>
                                          <td className="px-3 py-2">
                                            <Badge
                                              variant={priorityVariant(
                                                entry.priority,
                                              )}
                                            >
                                              {entry.priority ?? "—"}
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">
                                            {entry.reasonSummary ?? "—"}
                                          </td>
                                          <td className="px-3 py-2 text-muted-foreground">
                                            {[
                                              entry.vehicleColor,
                                              entry.vehicleMake,
                                              entry.vehicleModel,
                                            ]
                                              .filter(Boolean)
                                              .join(" ") || "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {v.entries.length > 15 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                                      Showing 15 of {v.entries.length} entries
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
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

