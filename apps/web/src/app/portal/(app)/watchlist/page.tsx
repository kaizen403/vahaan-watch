"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ListChecks,
  Plus,
  ChevronRight,
  ChevronDown,
  Archive,
  FileText,
  Loader2,
  AlertCircle,
  X,
  Upload,
  Hash,
  Car,
  Globe,
  Shield,
  Monitor,
} from "lucide-react";

/* ── types ─────────────────────────────────────────── */

type HitlistStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

interface HitlistEntry {
  id: string;
  plateOriginal: string;
  plateNormalized: string;
  countryOrRegion: string | null;
  priority: string | null;
  status: string;
  reasonCode: string | null;
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

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

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
  assignedBy: string | null;
  workstation: WorkstationSummary;
}

/* ── helpers ───────────────────────────────────────── */

function statusBadgeVariant(status: HitlistStatus): "success" | "warning" | "secondary" {
  const map: Record<HitlistStatus, "success" | "warning" | "secondary"> = {
    ACTIVE: "success",
    DRAFT: "warning",
    ARCHIVED: "secondary",
  };
  return map[status];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── main ──────────────────────────────────────────── */

export default function WatchlistPage() {
  const [hitlists, setHitlists] = useState<Hitlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Hitlist | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [showAddVersion, setShowAddVersion] = useState<string | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [versionEntries, setVersionEntries] = useState("");
  const [addingVersion, setAddingVersion] = useState(false);

  const [assignments, setAssignments] = useState<HitlistAssignment[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationSummary[]>([]);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [selectedWsIds, setSelectedWsIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get<ApiResp<Hitlist[]>>("/api/hitlists");
      if (resp.success) setHitlists(resp.data);
      else setError(resp.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hitlists");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWorkstations = useCallback(async () => {
    try {
      const resp = await api.get<ApiResp<{ workstations: WorkstationSummary[]; tablets: unknown[]; pairings: unknown[] }>>("/api/devices");
      if (resp.success) setWorkstations(resp.data.workstations);
    } catch (_) {
      setWorkstations([]);
    }
  }, []);

  useEffect(() => { void fetchList(); void fetchWorkstations(); }, [fetchList, fetchWorkstations]);

  async function fetchAssignments(hitlistId: string) {
    try {
      const resp = await api.get<ApiResp<HitlistAssignment[]>>(`/api/hitlists/${hitlistId}/assignments`);
      if (resp.success) setAssignments(resp.data);
      else setAssignments([]);
    } catch (_) {
      setAssignments([]);
    }
  }

  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      setAssignments([]);
      setShowAssign(null);
      setSelectedWsIds([]);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    setAssignments([]);
    setShowAssign(null);
    setSelectedWsIds([]);
    try {
      const resp = await api.get<ApiResp<Hitlist>>(`/api/hitlists/${id}`);
      if (resp.success) {
        setDetailData(resp.data);
        await fetchAssignments(id);
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hitlist");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const resp = await api.post<ApiResp<Hitlist>>("/api/hitlists", {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      });
      if (resp.success) {
        setShowCreate(false);
        setCreateName("");
        setCreateDesc("");
        void fetchList();
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create hitlist");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddVersion(hitlistId: string) {
    if (!versionEntries.trim()) return;
    setAddingVersion(true);
    try {
      const lines = versionEntries.trim().split("\n").filter(Boolean);
      const entries = lines.map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        return {
          plateOriginal: parts[0] ?? "",
          countryOrRegion: parts[1] || undefined,
          priority: parts[2] || undefined,
          reasonSummary: parts[3] || undefined,
          vehicleMake: parts[4] || undefined,
          vehicleModel: parts[5] || undefined,
          vehicleColor: parts[6] || undefined,
        };
      });
      const resp = await api.post<ApiResp<HitlistVersion>>(
        `/api/hitlists/${hitlistId}/versions`,
        { note: versionNote.trim() || undefined, entries },
      );
      if (resp.success) {
        setShowAddVersion(null);
        setVersionNote("");
        setVersionEntries("");
        void fetchList();
        if (expandedId === hitlistId) await loadDetail(hitlistId);
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add version");
    } finally {
      setAddingVersion(false);
    }
  }

  async function handleAssign(hitlistId: string) {
    if (selectedWsIds.length === 0) return;
    setAssigning(true);
    try {
      await api.post(`/api/hitlists/${hitlistId}/assign`, { workstationIds: selectedWsIds });
      setShowAssign(null);
      setSelectedWsIds([]);
      await fetchAssignments(hitlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(hitlistId: string, workstationId: string) {
    try {
      await api.del(`/api/hitlists/${hitlistId}/assign/${workstationId}`);
      await fetchAssignments(hitlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unassign");
    }
  }

  async function handleAssignAll(hitlistId: string) {
    setAssigning(true);
    try {
      await api.post(`/api/hitlists/${hitlistId}/assign-all`, {});
      await fetchAssignments(hitlistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign all");
    } finally {
      setAssigning(false);
    }
  }

  const activeCount = hitlists.filter((h) => h.status === "ACTIVE").length;
  const totalEntries = hitlists.reduce((sum, h) => {
    const latest = h.versions?.[0];
    return sum + (latest?.entries?.length ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage hitlists and plate entries for workstation matching
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium glow-primary"
        >
          <Plus className="h-4 w-4" />
          New Hitlist
        </Button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Hitlists", value: hitlists.length, icon: ListChecks },
          { label: "Active", value: activeCount, icon: Shield },
          { label: "Total Entries", value: totalEntries, icon: Hash },
        ].map((s) => (
          <Card key={s.label} className="glass rounded-xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-card">
                <s.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold text-foreground tabular-nums">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* error */}
      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button type="button" variant="ghost" size="icon" onClick={() => setError(null)} className="text-destructive hover:text-destructive/70 h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* create modal */}
      {showCreate && (
        <div className="glass-heavy rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Create Hitlist</h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground h-6 w-6">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="hl-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</Label>
              <Input
                id="hl-name"
                type="text"
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Stolen Vehicles Q1"
                className="w-full bg-input border border-border"
              />
            </div>
            <div>
              <Label htmlFor="hl-desc" className="text-xs font-medium text-muted-foreground mb-1.5 block">Description (optional)</Label>
              <Input
                id="hl-desc"
                type="text"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full bg-input border border-border"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="glass glass-hover">
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* list */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : hitlists.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="glass rounded-full p-6 mb-4">
            <ListChecks className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No Hitlists</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Create your first hitlist to start tracking plates across workstations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hitlists.map((h) => (
            <div key={h.id} className="glass rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <button
                  type="button"
                  onClick={() => void loadDetail(h.id)}
                  className="flex flex-1 items-center gap-4 text-left min-w-0 glass-hover transition-all rounded-lg -m-2 p-2 cursor-pointer"
                >
                  {expandedId === h.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground truncate">{h.name}</span>
                      <Badge variant={statusBadgeVariant(h.status)} className="capitalize">
                        {h.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      v{h.currentVersionNumber} · {h.versions?.[0]?.entries?.length ?? 0} entries · Created {fmtDate(h.createdAt)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddVersion(showAddVersion === h.id ? null : h.id)}
                    className="text-xs glass glass-hover"
                  >
                    <Upload className="h-3 w-3" />
                    Add Version
                  </Button>
                </div>
              </div>
              {showAddVersion === h.id && (
                <div className="border-t border-border px-5 py-4 bg-card/30">
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    Add Version to &ldquo;{h.name}&rdquo;
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`vnote-${h.id}`} className="text-xs text-muted-foreground mb-1 block">Note (optional)</Label>
                      <Input
                        id={`vnote-${h.id}`}
                        type="text"
                        value={versionNote}
                        onChange={(e) => setVersionNote(e.target.value)}
                        placeholder="e.g. Weekly update batch"
                        className="w-full bg-input border border-border"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`ventries-${h.id}`} className="text-xs text-muted-foreground mb-1 block">
                        Entries (one plate per line: plate, country, priority, reason, make, model, color)
                      </Label>
                      <textarea
                        id={`ventries-${h.id}`}
                        rows={5}
                        value={versionEntries}
                        onChange={(e) => setVersionEntries(e.target.value)}
                        placeholder={"KA01AB1234, IN, HIGH, Stolen vehicle\nMH02CD5678, IN, MEDIUM, Wanted suspect"}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowAddVersion(null); setVersionNote(""); setVersionEntries(""); }}
                        className="glass glass-hover"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={addingVersion || !versionEntries.trim()}
                        onClick={() => void handleAddVersion(h.id)}
                      >
                        {addingVersion ? "Uploading…" : "Upload Entries"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* expanded detail */}
              {expandedId === h.id && (
                <div className="border-t border-border">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : detailData ? (
                    <div className="px-5 py-4 space-y-4">
                      {detailData.description && (
                        <p className="text-sm text-muted-foreground">{detailData.description}</p>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            Assigned Workstations ({assignments.length})
                          </h3>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleAssignAll(h.id)} disabled={assigning} className="text-xs glass glass-hover">
                              Assign All
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => { setShowAssign(showAssign === h.id ? null : h.id); if (!workstations.length) void fetchWorkstations(); }} className="text-xs glass glass-hover">
                              <Plus className="h-3 w-3" />
                              Assign
                            </Button>
                          </div>
                        </div>

                        {showAssign === h.id && (
                          <div className="glass rounded-lg p-4 space-y-3">
                            <p className="text-xs text-muted-foreground">Select workstations to assign this hitlist:</p>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {workstations
                                .filter(ws => !assignments.some(a => a.workstationId === ws.id))
                                .map(ws => (
                                  <label key={ws.id} className="flex items-center gap-3 p-2 rounded-lg glass-hover cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedWsIds.includes(ws.id)}
                                      onChange={(e) => {
                                        setSelectedWsIds(prev =>
                                          e.target.checked ? [...prev, ws.id] : prev.filter(id => id !== ws.id)
                                        );
                                      }}
                                      className="rounded border-border"
                                    />
                                    <span className="text-sm text-foreground">{ws.name}</span>
                                    <Badge variant="secondary" className="text-xs ml-auto">{ws.deviceId}</Badge>
                                  </label>
                                ))}
                              {workstations.filter(ws => !assignments.some(a => a.workstationId === ws.id)).length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">All workstations already assigned</p>
                              )}
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => { setShowAssign(null); setSelectedWsIds([]); }} className="glass glass-hover">Cancel</Button>
                              <Button type="button" size="sm" disabled={assigning || selectedWsIds.length === 0} onClick={() => void handleAssign(h.id)}>
                                {assigning ? "Assigning…" : `Assign (${selectedWsIds.length})`}
                              </Button>
                            </div>
                          </div>
                        )}

                        {assignments.length > 0 ? (
                          <div className="space-y-1">
                            {assignments.map(a => (
                              <div key={a.id} className="flex items-center justify-between px-3 py-2 glass rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-foreground">{a.workstation.name}</span>
                                  <Badge variant="secondary" className="text-xs">{a.workstation.deviceId}</Badge>
                                  <Badge variant={a.workstation.status === "ACTIVE" ? "success" : "warning"} className="text-xs capitalize">
                                    {a.workstation.status.toLowerCase()}
                                  </Badge>
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => void handleUnassign(h.id, a.workstationId)} className="text-muted-foreground hover:text-destructive h-6 w-6">
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-3 glass rounded-lg">
                            No workstations assigned. Assign workstations to distribute this hitlist.
                          </p>
                        )}
                      </div>

                      {detailData.versions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No versions yet. Upload entries to create the first version.
                        </p>
                      ) : (
                        detailData.versions.map((v) => (
                          <div key={v.id} className="space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-foreground">
                                Version {v.versionNumber}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {v.entries.length} entries · {fmtDate(v.createdAt)}
                              </span>
                              {v.note && (
                                <span className="text-xs text-muted-foreground italic">— {v.note}</span>
                              )}
                            </div>

                            {v.entries.length > 0 && (
                              <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border bg-card/30">
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Plate</th>
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Normalized</th>
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Country</th>
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Priority</th>
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Reason</th>
                                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Vehicle</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {v.entries.slice(0, 20).map((entry) => (
                                      <tr key={entry.id} className="border-b border-border last:border-0">
                                        <td className="px-3 py-2 text-foreground font-mono">{entry.plateOriginal}</td>
                                        <td className="px-3 py-2 text-muted-foreground font-mono">{entry.plateNormalized}</td>
                                        <td className="px-3 py-2 text-muted-foreground">{entry.countryOrRegion ?? "—"}</td>
                                         <td className="px-3 py-2">
                                           <Badge
                                             variant={
                                               entry.priority === "HIGH" ? "destructive"
                                                 : entry.priority === "MEDIUM" ? "warning"
                                                 : "outline"
                                             }
                                           >
                                             {entry.priority ?? "—"}
                                           </Badge>
                                         </td>
                                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{entry.reasonSummary ?? "—"}</td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {[entry.vehicleColor, entry.vehicleMake, entry.vehicleModel].filter(Boolean).join(" ") || "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {v.entries.length > 20 && (
                                  <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                                    Showing 20 of {v.entries.length} entries
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
          ))}
        </div>
      )}
    </div>
  );
}
