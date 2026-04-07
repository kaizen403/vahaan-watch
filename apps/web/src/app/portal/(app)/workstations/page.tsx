"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Monitor,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Copy,
  Check,
  Tablet,
} from "lucide-react";

type WsStatus = "ACTIVE" | "OFFLINE" | "PENDING";

interface Workstation {
  id: string;
  address: string;
  name: string;
  description: string | null;
  status: WsStatus;
  lastSeenAt: string | null;
  createdAt: string;
  connectedTablets?: number;
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

type ModalMode = "create" | "edit" | "delete" | null;

function statusBadge(status: WsStatus) {
  const map: Record<WsStatus, { label: string; variant: "success" | "destructive" | "warning"; icon: typeof Wifi }> = {
    ACTIVE: { label: "Active", variant: "success", icon: Wifi },
    OFFLINE: { label: "Offline", variant: "destructive", icon: WifiOff },
    PENDING: { label: "Pending", variant: "warning", icon: Clock },
  };
  return map[status] ?? map.OFFLINE;
}

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => void handleCopy()}
      className="h-6 w-6 text-muted-foreground hover:text-foreground"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export default function WorkstationsPage() {
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<Workstation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formAddress, setFormAddress] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  const fetchWorkstations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get<ApiResp<Workstation[]>>("/api/workstations");
      if (resp.success) setWorkstations(resp.data ?? []);
      else setError(resp.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workstations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchWorkstations(); }, [fetchWorkstations]);

  function openCreate() {
    setFormAddress("");
    setFormPassword("");
    setFormName("");
    setFormDesc("");
    setSelected(null);
    setModal("create");
  }

  function openEdit(ws: Workstation) {
    setFormAddress(ws.address);
    setFormPassword("");
    setFormName(ws.name);
    setFormDesc(ws.description ?? "");
    setSelected(ws);
    setModal("edit");
  }

  function openDelete(ws: Workstation) {
    setSelected(ws);
    setModal("delete");
  }

  function closeModal() {
    setModal(null);
    setSelected(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formAddress.trim() || !formPassword || !formName.trim()) return;
    setSubmitting(true);
    try {
      const resp = await api.post<ApiResp<{ workstation: Workstation; deviceToken?: string }>>("/api/workstations", {
        address: formAddress.trim(),
        password: formPassword,
        name: formName.trim(),
        description: formDesc.trim() || undefined,
      });
      if (resp.success) {
        closeModal();
        if (resp.data.deviceToken) setDeviceToken(resp.data.deviceToken);
        void fetchWorkstations();
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workstation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !formName.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        address: formAddress.trim(),
        name: formName.trim(),
      };
      if (formDesc.trim()) body.description = formDesc.trim();
      if (formPassword) body.password = formPassword;
      const resp = await api.put<ApiResp<{ workstation: Workstation }>>(`/api/workstations/${selected.id}`, body);
      if (resp.success) {
        closeModal();
        void fetchWorkstations();
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update workstation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const resp = await api.del<ApiResp<unknown>>(`/api/workstations/${selected.id}`);
      if (resp.success) {
        closeModal();
        void fetchWorkstations();
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workstation");
    } finally {
      setSubmitting(false);
    }
  }

  const items = workstations ?? [];
  const totalCount = items.length;
  const onlineCount = items.filter((w) => w.status === "ACTIVE").length;
  const offlineCount = items.filter((w) => w.status !== "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Workstations</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage field workstations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 glow-primary"
          >
            <Plus className="h-4 w-4" />
            Create Workstation
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetchWorkstations()}
            disabled={loading}
            className="glass glass-hover"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{totalCount}</p>
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
              <p className="text-2xl font-semibold text-success tabular-nums">{onlineCount}</p>
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
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button type="button" variant="ghost" size="icon" onClick={() => setError(null)} className="text-destructive hover:text-destructive/70 h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {deviceToken && (
        <div className="glass-heavy rounded-xl p-5 border border-success/30 bg-success/5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Workstation created — copy the device token now</p>
            <Button type="button" variant="ghost" size="icon" onClick={() => setDeviceToken(null)} className="text-muted-foreground hover:text-foreground h-6 w-6">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 bg-card/60 rounded-lg px-3 py-2 border border-border">
            <code className="font-mono text-xs text-foreground flex-1 break-all">{deviceToken}</code>
            <CopyButton text={deviceToken} />
          </div>
          <p className="text-xs text-muted-foreground">This token will not be shown again. Store it securely.</p>
        </div>
      )}

      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative glass-heavy rounded-xl p-6 w-full max-w-md border border-border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">
                {modal === "create" ? "Create Workstation" : "Edit Workstation"}
              </h2>
              <Button type="button" variant="ghost" size="icon" onClick={closeModal} className="text-muted-foreground hover:text-foreground h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={modal === "create" ? handleCreate : handleEdit} className="space-y-4">
              <div>
                <Label htmlFor="ws-address" className="text-xs font-medium text-muted-foreground mb-1.5 block">Address</Label>
                <Input
                  id="ws-address"
                  type="text"
                  required
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g. WS-001"
                  className="w-full bg-input border border-border font-mono"
                />
              </div>
              <div>
                <Label htmlFor="ws-password" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Password{modal === "edit" && <span className="text-muted-foreground/60 ml-1">(leave blank to keep current)</span>}
                </Label>
                <Input
                  id="ws-password"
                  type="password"
                  required={modal === "create"}
                  minLength={4}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={modal === "edit" ? "Leave blank to keep current" : "Min 4 characters"}
                  className="w-full bg-input border border-border"
                />
              </div>
              <div>
                <Label htmlFor="ws-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</Label>
                <Input
                  id="ws-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. North Gate Station"
                  className="w-full bg-input border border-border"
                />
              </div>
              <div>
                <Label htmlFor="ws-desc" className="text-xs font-medium text-muted-foreground mb-1.5 block">Description (optional)</Label>
                <Input
                  id="ws-desc"
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Brief description"
                  className="w-full bg-input border border-border"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={closeModal} className="glass glass-hover">Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (modal === "create" ? "Creating…" : "Saving…") : (modal === "create" ? "Create" : "Save Changes")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "delete" && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative glass-heavy rounded-xl p-6 w-full max-w-sm border border-destructive/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Delete Workstation</h2>
              <Button type="button" variant="ghost" size="icon" onClick={closeModal} className="text-muted-foreground hover:text-foreground h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              This will permanently remove the workstation:
            </p>
            <div className="glass rounded-lg px-3 py-2 mb-5 flex items-center gap-2">
              <code className="font-mono text-sm text-foreground">{selected.address}</code>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-sm text-foreground">{selected.name}</span>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeModal} className="glass glass-hover">Cancel</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={submitting}
                onClick={() => void handleDelete()}
              >
                {submitting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="glass rounded-full p-6 mb-4">
            <Monitor className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No Workstations</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Create a workstation to let field operators log in with their address and password.
          </p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Address</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Seen</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tablets</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ws) => {
                  const badge = statusBadge(ws.status);
                  const BadgeIcon = badge.icon;
                  return (
                    <tr key={ws.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <code className="font-mono text-sm text-foreground bg-card/60 px-2 py-0.5 rounded border border-border">
                          {ws.address}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{ws.name}</div>
                        {ws.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{ws.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badge.variant} className="inline-flex items-center gap-1.5">
                          <BadgeIcon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{timeAgo(ws.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Tablet className="h-3.5 w-3.5" />
                          <span className="tabular-nums">{ws.connectedTablets ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(ws)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label={`Edit ${ws.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openDelete(ws)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${ws.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
