"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart3, ScanLine, Target, Percent, TrendingUp, Loader2,
  AlertCircle, ChevronDown, CalendarDays,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DeviceStatus = "PENDING" | "ACTIVE" | "OFFLINE" | "DISABLED";

interface AnalyticsSummary {
  totalDetections: number;
  totalMatches: number;
  detectionsInRange: number;
  matchesInRange: number;
  hitRate: number;
  byWorkstation: WorkstationBreakdown[];
  daily: DailyEntry[];
}

interface WorkstationBreakdown {
  workstationId: string;
  name: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  detectionsInRange: number;
  matchesInRange: number;
  hitRate: number;
}

interface DailyEntry {
  date: string;
  detections: number;
  matches: number;
}

interface WorkstationOption {
  id: string;
  name: string;
  status: DeviceStatus;
}

interface DevicesResponse {
  workstations: WorkstationOption[];
  tablets: unknown[];
  pairings: unknown[];
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

function statusBadgeVariant(status: DeviceStatus): "success" | "destructive" | "warning" | "secondary" {
  const map: Record<DeviceStatus, "success" | "destructive" | "warning" | "secondary"> = {
    ACTIVE: "success",
    OFFLINE: "destructive",
    PENDING: "warning",
    DISABLED: "secondary",
  };
  return map[status] ?? "secondary";
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function GlassTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-heavy rounded-lg px-3 py-2 text-xs">
      {label && <p className="text-muted-foreground mb-1">{formatShortDate(label)}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name === "detections" ? "Scans" : "Matches"}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(7);
  const [workstationId, setWorkstationId] = useState<string | undefined>(undefined);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [workstations, setWorkstations] = useState<WorkstationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const to = new Date();
    const from = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (workstationId) params.set("workstationId", workstationId);

    try {
      const [summaryResp, devicesResp] = await Promise.all([
        api.get<ApiResp<AnalyticsSummary>>(`/api/analytics/summary?${params.toString()}`),
        api.get<ApiResp<DevicesResponse>>("/api/devices"),
      ]);

      if (summaryResp.success) {
        setSummary(summaryResp.data);
      } else {
        setError(summaryResp.error);
      }

      if (devicesResp.success) {
        setWorkstations(devicesResp.data.workstations);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [rangeDays, workstationId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const avgScansPerDay =
    summary && summary.daily.length > 0
      ? Math.round(summary.detectionsInRange / summary.daily.length)
      : 0;

  const selectedWsName = workstationId
    ? workstations.find((ws) => ws.id === workstationId)?.name ?? "Unknown"
    : "All workstations";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Scan performance and hit-rate metrics</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div className="flex rounded-lg overflow-hidden border border-border">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.days}
                  onClick={() => setRangeDays(opt.days)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    rangeDays === opt.days
                      ? "bg-primary text-primary-foreground"
                      : "glass-hover text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              className="min-w-[160px] justify-between"
            >
              <span className="truncate">{selectedWsName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
            {wsDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 glass-heavy rounded-lg border border-border p-1 min-w-[200px] max-h-[240px] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setWorkstationId(undefined); setWsDropdownOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                    !workstationId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/10"
                  )}
                >
                  All workstations
                </button>
                {workstations.map((ws) => (
                  <button
                    type="button"
                    key={ws.id}
                    onClick={() => { setWorkstationId(ws.id); setWsDropdownOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                      workstationId === ws.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/10"
                    )}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: "Total Scans",
                value: summary.detectionsInRange.toLocaleString(),
                icon: ScanLine,
                color: "text-foreground",
              },
              {
                label: "Total Matches",
                value: summary.matchesInRange.toLocaleString(),
                icon: Target,
                color: "text-success",
              },
              {
                label: "Hit Rate",
                value: `${(summary.hitRate * 100).toFixed(1)}%`,
                icon: Percent,
                color: "text-warning",
              },
              {
                label: "Avg Scans / Day",
                value: avgScansPerDay.toLocaleString(),
                icon: TrendingUp,
                color: "text-info",
              },
            ].map((stat) => (
              <Card key={stat.label} className="glass glass-hover transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-card", stat.color)}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className={cn("text-2xl font-semibold tabular-nums", stat.color)}>{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Daily Scans &amp; Matches
                </h2>
              </div>
              {summary.daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={summary.daily} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<GlassTooltip />} />
                    <Bar dataKey="detections" fill="#60a5fa" radius={[4, 4, 0, 0]} name="detections" />
                    <Line
                      type="monotone"
                      dataKey="matches"
                      stroke="#4ade80"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#4ade80" }}
                      name="matches"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                  No scan data in selected range
                </div>
              )}
              <div className="flex justify-center gap-6 mt-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
                  <span className="text-muted-foreground">Scans</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
                  <span className="text-muted-foreground">Matches</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Per-Workstation Breakdown</h2>
              </div>
              {summary.byWorkstation.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">Workstation</th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">Scans</th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">Matches</th>
                        <th className="pb-3 text-xs font-medium text-muted-foreground text-right">Hit Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.byWorkstation.map((ws) => (
                        <tr key={ws.workstationId} className="hover:bg-accent/5 transition-colors">
                          <td className="py-3 pr-4 font-medium text-foreground">{ws.name}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={statusBadgeVariant(ws.status)} className="capitalize">
                              {ws.status.toLowerCase()}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                            {ws.detectionsInRange.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                            {ws.matchesInRange.toLocaleString()}
                          </td>
                          <td className="py-3 text-right tabular-nums text-foreground">
                            {(ws.hitRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
                  No workstations found
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
