"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HardDrive,
  Tablet,
  Link2,
  Unlink,
  Loader2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  X,
  Plus,
} from "lucide-react";

type DeviceStatus = "PENDING" | "ACTIVE" | "OFFLINE" | "DISABLED";

interface Workstation {
  id: string;
  deviceId: string;
  name: string;
  description: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

interface TabletDevice {
  id: string;
  deviceId: string;
  name: string;
  description: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

interface DevicePairing {
  id: string;
  workstationId: string;
  tabletId: string;
  createdAt: string;
  unpairedAt: string | null;
}

interface DevicesData {
  workstations: Workstation[];
  tablets: TabletDevice[];
  pairings: DevicePairing[];
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };
type TabView = "workstations" | "tablets" | "pairings";

function statusBadge(status: DeviceStatus) {
  const map: Record<DeviceStatus, { label: string; variant: "success" | "destructive" | "warning" | "secondary"; icon: typeof Wifi }> = {
    ACTIVE: { label: "Active", variant: "success", icon: Wifi },
    OFFLINE: { label: "Offline", variant: "destructive", icon: WifiOff },
    PENDING: { label: "Pending", variant: "warning", icon: Clock },
    DISABLED: { label: "Disabled", variant: "secondary", icon: WifiOff },
  };
  return map[status] ?? map.OFFLINE;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

export default function DevicesPage() {
  const [data, setData] = useState<DevicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabView>("workstations");
  const [showPairForm, setShowPairForm] = useState(false);
  const [pairWsId, setPairWsId] = useState("");
  const [pairTabletId, setPairTabletId] = useState("");
  const [pairing, setPairing] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get<ApiResp<DevicesData>>("/api/devices");
      if (resp.success) setData(resp.data);
      else setError(resp.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDevices(); }, [fetchDevices]);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    if (!pairWsId || !pairTabletId) return;
    setPairing(true);
    try {
      const resp = await api.post<ApiResp<DevicePairing>>("/api/devices/pairings", {
        workstationId: pairWsId,
        tabletId: pairTabletId,
      });
      if (resp.success) {
        setShowPairForm(false);
        setPairWsId("");
        setPairTabletId("");
        void fetchDevices();
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create pairing");
    } finally {
      setPairing(false);
    }
  }

  const workstations = data?.workstations ?? [];
  const tablets = data?.tablets ?? [];
  const pairings = data?.pairings ?? [];
  const activePairings = pairings.filter((p) => !p.unpairedAt);

  const TABS: { value: TabView; label: string; count: number }[] = [
    { value: "workstations", label: "Workstations", count: workstations.length },
    { value: "tablets", label: "Tablets", count: tablets.length },
    { value: "pairings", label: "Pairings", count: activePairings.length },
  ];

  function nameFor(type: "ws" | "tablet", id: string): string {
    if (type === "ws") return workstations.find((w) => w.id === id)?.name ?? id.slice(0, 8);
    return tablets.find((t) => t.id === id)?.name ?? id.slice(0, 8);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Devices</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage workstations, tablets, and device pairings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setShowPairForm(true)}
            className="flex items-center gap-2 glow-primary"
          >
            <Link2 className="h-4 w-4" />
            Pair Devices
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetchDevices()}
            disabled={loading}
            className="glass glass-hover"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card"><HardDrive className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Workstations</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{workstations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card"><Tablet className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Tablets</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{tablets.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card"><Link2 className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active Pairings</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums">{activePairings.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass rounded-xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-card"><Wifi className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Online</p>
              <p className="text-2xl font-semibold text-success tabular-nums">
                {workstations.filter((w) => w.status === "ACTIVE").length + tablets.filter((t) => t.status === "ACTIVE").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button type="button" variant="ghost" size="icon" onClick={() => setError(null)} className="text-destructive hover:text-destructive/70 h-6 w-6"><X className="h-4 w-4" /></Button>
        </div>
      )}

      {showPairForm && (
        <div className="glass-heavy rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Create Device Pairing</h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => setShowPairForm(false)} className="text-muted-foreground hover:text-foreground h-6 w-6"><X className="h-4 w-4" /></Button>
          </div>
          <form onSubmit={handlePair} className="space-y-4">
            <div>
              <Label htmlFor="pair-ws" className="text-xs font-medium text-muted-foreground mb-1.5 block">Workstation</Label>
              <Select value={pairWsId} onValueChange={setPairWsId}>
                <SelectTrigger id="pair-ws" className="w-full bg-input border border-border">
                  <SelectValue placeholder="Select a workstation" />
                </SelectTrigger>
                <SelectContent>
                  {workstations.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.deviceId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pair-tablet" className="text-xs font-medium text-muted-foreground mb-1.5 block">Tablet</Label>
              <Select value={pairTabletId} onValueChange={setPairTabletId}>
                <SelectTrigger id="pair-tablet" className="w-full bg-input border border-border">
                  <SelectValue placeholder="Select a tablet" />
                </SelectTrigger>
                <SelectContent>
                  {tablets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.deviceId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowPairForm(false)} className="glass glass-hover">Cancel</Button>
              <Button type="submit" disabled={pairing}>
                {pairing ? "Pairing…" : "Create Pairing"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={tab === t.value ? "default" : "outline"}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex items-center gap-2",
              tab !== t.value && "glass glass-hover",
            )}
          >
            {t.label}
            <Badge
              variant={tab === t.value ? "secondary" : "outline"}
              className={cn(
                "text-xs",
                tab === t.value && "bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              {t.count}
            </Badge>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {tab === "pairings" ? (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workstation</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tablet</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paired At</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Device ID</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Seen</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Registered</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tab === "pairings" ? (
                  pairings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                        No pairings. Link a workstation to a tablet to get started.
                      </td>
                    </tr>
                  ) : (
                    pairings.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-foreground">{nameFor("ws", p.workstationId)}</td>
                        <td className="px-4 py-3 text-foreground">{nameFor("tablet", p.tabletId)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.createdAt)}</td>
                         <td className="px-4 py-3">
                           {p.unpairedAt ? (
                             <Badge variant="secondary" className="inline-flex items-center gap-1.5">
                               <Unlink className="h-3 w-3" /> Unpaired
                             </Badge>
                           ) : (
                             <Badge variant="success" className="inline-flex items-center gap-1.5">
                               <Link2 className="h-3 w-3" /> Paired
                             </Badge>
                           )}
                         </td>
                      </tr>
                    ))
                  )
                ) : (
                  (() => {
                    const items = tab === "workstations" ? workstations : tablets;
                    if (items.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                            No {tab} registered. Use the device provisioning API to register devices.
                          </td>
                        </tr>
                      );
                    }
                    return items.map((d) => {
                      const badge = statusBadge(d.status);
                      const BadgeIcon = badge.icon;
                      const pairedTablets = tab === "workstations"
                        ? pairings
                            .filter((p) => p.workstationId === d.id && !p.unpairedAt)
                            .map((p) => tablets.find((t) => t.id === p.tabletId))
                            .filter((t): t is TabletDevice => t !== undefined)
                        : [];
                      return (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <div className="text-foreground font-medium">{d.name}</div>
                            {d.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{d.description}</div>}
                            {tab === "workstations" && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {pairedTablets.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">No tablets paired</span>
                                ) : (
                                  pairedTablets.map((tablet) => (
                                    <Badge key={tablet.id} variant="secondary" className="text-xs">{tablet.name}</Badge>
                                  ))
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{d.deviceId}</td>
                           <td className="px-4 py-3">
                             <Badge variant={badge.variant} className="inline-flex items-center gap-1.5">
                               <BadgeIcon className="h-3 w-3" /> {badge.label}
                             </Badge>
                           </td>
                          <td className="px-4 py-3 text-muted-foreground">{timeAgo(d.lastSeenAt)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.createdAt)}</td>
                        </tr>
                      );
                    });
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
