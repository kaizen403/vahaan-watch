"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ScanLine,
  Target,
  Percent,
  TrendingUp,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  X,
} from "lucide-react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DeviceStatus = "PENDING" | "ACTIVE" | "OFFLINE" | "DISABLED";
type MatchStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "ESCALATED"
  | "FALSE_POSITIVE"
  | "RESOLVED";
type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface DailyEntry {
  date: string;
  detections: number;
  matches: number;
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

interface AnalyticsSummary {
  totalDetections: number;
  totalMatches: number;
  detectionsInRange: number;
  matchesInRange: number;
  hitRate: number;
  byWorkstation: WorkstationBreakdown[];
  daily: DailyEntry[];
  dailyByWorkstation?: Record<string, DailyEntry[]>;
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

interface DetectionListItem {
  id: string;
  externalEventId: string | null;
  workstationId: string;
  plate: string;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  confidence: number;
  occurredAt: string;
  snapshotUrl: string | null;
  workstation: { name: string; deviceId: string };
  matchEvents: Array<{ id: string; alertStatus: MatchStatus }>;
}

interface DetectionsResponse {
  detections: DetectionListItem[];
  total: number;
  page: number;
  limit: number;
}

interface HitlistEntryDetail {
  id: string;
  plateOriginal: string;
  plateNormalized: string;
  priority: number;
  reasonSummary: string | null;
  caseReference: string | null;
  sourceAgency: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleCategory: string | null;
  ownerName: string | null;
  ownerContact: string | null;
  extendedCaseNotes: string | null;
  status: string;
}

interface DetectionDetail {
  id: string;
  plate: string;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  confidence: number;
  occurredAt: string;
  snapshotUrl: string | null;
  workstation: {
    id: string;
    name: string;
    address: string | null;
    deviceId: string;
    status: DeviceStatus;
  };
  matchEvents: Array<{
    id: string;
    alertStatus: MatchStatus;
    createdAt: string;
    hitlistEntry: HitlistEntryDetail;
  }>;
}

interface MatchEventListItem {
  id: string;
  alertStatus: MatchStatus;
  note: string | null;
  createdAt: string;
  detection: {
    plate: string;
    country: string | null;
    make: string | null;
    model: string | null;
    color: string | null;
    category: string | null;
    confidence: number;
    occurredAt: string;
    snapshotUrl: string | null;
  };
  workstation: { name: string; deviceId: string };
  hitlistEntry: {
    plateOriginal: string;
    reasonSummary: string | null;
    priority: number;
    caseReference: string | null;
  };
}

interface MatchEventsResponse {
  items: MatchEventListItem[];
  total: number;
  page: number;
  limit: number;
}

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const WS_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#38bdf8",
];

const TAB_LIMIT = 20;

type ChartRow = Record<string, string | number>;

function statusBadgeVariant(
  s: DeviceStatus,
): "success" | "destructive" | "warning" | "secondary" {
  const m: Record<
    DeviceStatus,
    "success" | "destructive" | "warning" | "secondary"
  > = {
    ACTIVE: "success",
    OFFLINE: "destructive",
    PENDING: "warning",
    DISABLED: "secondary",
  };
  return m[s] ?? "secondary";
}

function matchStatusVariant(
  s: MatchStatus,
): "warning" | "default" | "destructive" | "secondary" | "success" {
  const m: Record<
    MatchStatus,
    "warning" | "default" | "destructive" | "secondary" | "success"
  > = {
    PENDING: "warning",
    ACKNOWLEDGED: "default",
    ESCALATED: "destructive",
    FALSE_POSITIVE: "secondary",
    RESOLVED: "success",
  };
  return m[s] ?? "secondary";
}

function priorityVariant(p: number): "destructive" | "warning" | "secondary" {
  if (p >= 3) return "destructive";
  if (p >= 2) return "warning";
  return "secondary";
}

function priorityLabel(p: number): string {
  if (p >= 3) return "High";
  if (p >= 2) return "Medium";
  return "Low";
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function vehicleDesc(
  make: string | null,
  model: string | null,
  color: string | null,
  category?: string | null,
): string {
  return (
    [color, make, model, category].filter(Boolean).join(" \u00b7 ") || "\u2014"
  );
}

function buildDateRange(days: number) {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-heavy rounded-lg px-3 py-2 text-xs">
      {label && (
        <p className="text-muted-foreground mb-1">
          {formatShortDate(String(label))}
        </p>
      )}
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <p
            key={String(p.dataKey)}
            style={{ color: p.color }}
            className="font-medium"
          >
            {p.dataKey === "detections"
              ? "Scans"
              : p.dataKey === "matches"
                ? "Matches"
                : p.name}
            {": "}
            <span className="tabular-nums font-mono">{p.value}</span>
          </p>
        ))}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm text-foreground", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">Confidence</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${value * 100}%` }}
          />
        </div>
        <span className="text-sm font-mono tabular-nums text-foreground">
          {(value * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ScanDetailContent({ data }: { data: DetectionDetail }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Plate</p>
        <p className="text-3xl font-mono font-bold text-foreground tracking-wider">
          {data.plate}
        </p>
      </div>

      {data.country && <DetailRow label="Country" value={data.country} />}

      <div className="grid grid-cols-2 gap-4">
        {data.make && <DetailRow label="Make" value={data.make} />}
        {data.model && <DetailRow label="Model" value={data.model} />}
        {data.color && <DetailRow label="Color" value={data.color} />}
        {data.category && <DetailRow label="Category" value={data.category} />}
      </div>

      <ConfidenceBar value={data.confidence} />
      <DetailRow label="Workstation" value={data.workstation.name} />
      <DetailRow
        label="Timestamp"
        value={formatFullDateTime(data.occurredAt)}
      />

      {data.matchEvents.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Match Events ({data.matchEvents.length})
          </p>
          <div className="space-y-2">
            {data.matchEvents.map((me) => (
              <div key={me.id} className="glass rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Badge variant={priorityVariant(me.hitlistEntry.priority)}>
                    {priorityLabel(me.hitlistEntry.priority)} Priority
                  </Badge>
                  <Badge
                    variant={matchStatusVariant(me.alertStatus)}
                    className="capitalize"
                  >
                    {me.alertStatus.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                </div>
                {me.hitlistEntry.reasonSummary && (
                  <p className="text-xs text-muted-foreground">
                    {me.hitlistEntry.reasonSummary}
                  </p>
                )}
                {me.hitlistEntry.caseReference && (
                  <p className="text-xs text-foreground">
                    Case:{" "}
                    <span className="font-mono">
                      {me.hitlistEntry.caseReference}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchDetailContent({ data }: { data: MatchEventListItem }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Plate</p>
        <p className="text-3xl font-mono font-bold text-foreground tracking-wider">
          {data.detection.plate}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={priorityVariant(data.hitlistEntry.priority)}>
          {priorityLabel(data.hitlistEntry.priority)} Priority
        </Badge>
        <Badge
          variant={matchStatusVariant(data.alertStatus)}
          className="capitalize"
        >
          {data.alertStatus.toLowerCase().replace(/_/g, " ")}
        </Badge>
      </div>

      {data.hitlistEntry.reasonSummary && (
        <DetailRow label="Reason" value={data.hitlistEntry.reasonSummary} />
      )}
      {data.hitlistEntry.caseReference && (
        <DetailRow
          label="Case Reference"
          value={data.hitlistEntry.caseReference}
          mono
        />
      )}

      <DetailRow label="Workstation" value={data.workstation.name} />
      <DetailRow
        label="Detection Time"
        value={formatFullDateTime(data.detection.occurredAt)}
      />
      <DetailRow
        label="Alert Created"
        value={formatFullDateTime(data.createdAt)}
      />

      <div>
        <p className="text-xs text-muted-foreground mb-2">Vehicle Details</p>
        <div className="grid grid-cols-2 gap-3">
          {data.detection.make && (
            <DetailRow label="Make" value={data.detection.make} />
          )}
          {data.detection.model && (
            <DetailRow label="Model" value={data.detection.model} />
          )}
          {data.detection.color && (
            <DetailRow label="Color" value={data.detection.color} />
          )}
          {data.detection.category && (
            <DetailRow label="Category" value={data.detection.category} />
          )}
        </div>
      </div>

      {data.detection.country && (
        <DetailRow label="Country" value={data.detection.country} />
      )}
      <ConfidenceBar value={data.detection.confidence} />
      {data.note && <DetailRow label="Note" value={data.note} />}
    </div>
  );
}

export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(7);
  const [workstationId, setWorkstationId] = useState<string | undefined>(
    undefined,
  );
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [workstations, setWorkstations] = useState<WorkstationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"scans" | "matches">("scans");
  const [scansPage, setScansPage] = useState(1);
  const [matchesPage, setMatchesPage] = useState(1);

  const [scansData, setScansData] = useState<DetectionsResponse | null>(null);
  const [scansLoading, setScansLoading] = useState(false);
  const [matchesData, setMatchesData] = useState<MatchEventsResponse | null>(
    null,
  );
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [detailType, setDetailType] = useState<"scan" | "match" | null>(null);
  const [scanDetail, setScanDetail] = useState<DetectionDetail | null>(null);
  const [matchDetail, setMatchDetail] = useState<MatchEventListItem | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  function handleRangeChange(days: number) {
    setRangeDays(days);
    setScansPage(1);
    setMatchesPage(1);
  }

  function handleWsChange(id: string | undefined) {
    setWorkstationId(id);
    setScansPage(1);
    setMatchesPage(1);
  }

  useEffect(() => {
    if (!wsDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setWsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [wsDropdownOpen]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = buildDateRange(rangeDays);
    const params = new URLSearchParams({ from, to });
    if (workstationId) params.set("workstationId", workstationId);

    try {
      const [sResp, dResp] = await Promise.all([
        api.get<ApiResp<AnalyticsSummary>>(
          `/api/analytics/summary?${params.toString()}`,
        ),
        api.get<ApiResp<DevicesResponse>>("/api/devices"),
      ]);
      if (sResp.success) setSummary(sResp.data);
      else setError(sResp.error);
      if (dResp.success) setWorkstations(dResp.data.workstations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [rangeDays, workstationId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab !== "scans") return;
    let cancelled = false;
    (async () => {
      setScansLoading(true);
      const { from, to } = buildDateRange(rangeDays);
      const params = new URLSearchParams({
        from,
        to,
        page: String(scansPage),
        limit: String(TAB_LIMIT),
      });
      if (workstationId) params.set("workstationId", workstationId);
      try {
        const resp = await api.get<ApiResp<DetectionsResponse>>(
          `/api/detections?${params.toString()}`,
        );
        if (!cancelled && resp.success) setScansData(resp.data);
      } catch {
      } finally {
        if (!cancelled) setScansLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, scansPage, workstationId, rangeDays]);

  useEffect(() => {
    if (activeTab !== "matches") return;
    let cancelled = false;
    (async () => {
      setMatchesLoading(true);
      const { from, to } = buildDateRange(rangeDays);
      const params = new URLSearchParams({
        from,
        to,
        page: String(matchesPage),
        limit: String(TAB_LIMIT),
      });
      if (workstationId) params.set("workstationId", workstationId);
      try {
        const resp = await api.get<ApiResp<MatchEventsResponse>>(
          `/api/match-events?${params.toString()}`,
        );
        if (!cancelled && resp.success) setMatchesData(resp.data);
      } catch {
      } finally {
        if (!cancelled) setMatchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, matchesPage, workstationId, rangeDays]);

  function openScanDetail(id: string) {
    setDetailType("scan");
    setScanDetail(null);
    setMatchDetail(null);
    setDetailLoading(true);
    api
      .get<ApiResp<DetectionDetail>>(`/api/detections/${id}`)
      .then((resp) => {
        if (resp.success) setScanDetail(resp.data);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }

  function openMatchDetail(item: MatchEventListItem) {
    setDetailType("match");
    setScanDetail(null);
    setMatchDetail(item);
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailType(null);
    setScanDetail(null);
    setMatchDetail(null);
  }

  const avgScansPerDay =
    summary && summary.daily.length > 0
      ? Math.round(summary.detectionsInRange / summary.daily.length)
      : 0;

  const selectedWsName = workstationId
    ? (workstations.find((ws) => ws.id === workstationId)?.name ?? "Unknown")
    : "All workstations";

  const isStackedMode = !workstationId && !!summary?.dailyByWorkstation;

  // Transform dailyByWorkstation into flat { date, ws1: n, ws2: n, …, matches } rows for recharts stacked bars
  const chartData = useMemo((): ChartRow[] => {
    if (!summary) return [];
    return summary.daily.map((day) => {
      const row: ChartRow = {
        date: day.date,
        detections: day.detections,
        matches: day.matches,
      };
      if (summary.dailyByWorkstation) {
        for (const ws of summary.byWorkstation) {
          const wsDaily = summary.dailyByWorkstation[ws.workstationId];
          const found = wsDaily?.find((d) => d.date === day.date);
          row[ws.workstationId] = found?.detections ?? 0;
        }
      }
      return row;
    });
  }, [summary]);

  const scansTotalPages = scansData
    ? Math.max(1, Math.ceil(scansData.total / TAB_LIMIT))
    : 1;
  const matchesTotalPages = matchesData
    ? Math.max(1, Math.ceil(matchesData.total / TAB_LIMIT))
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scan performance and hit-rate metrics
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div className="flex rounded-lg overflow-hidden border border-border">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.days}
                  onClick={() => handleRangeChange(opt.days)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    rangeDays === opt.days
                      ? "bg-primary text-primary-foreground"
                      : "glass-hover text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative" ref={dropdownRef}>
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
                  onClick={() => {
                    handleWsChange(undefined);
                    setWsDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                    !workstationId
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent/10",
                  )}
                >
                  All workstations
                </button>
                {workstations.map((ws) => (
                  <button
                    type="button"
                    key={ws.id}
                    onClick={() => {
                      handleWsChange(ws.id);
                      setWsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
                      workstationId === ws.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent/10",
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
              <Card
                key={stat.label}
                className="glass glass-hover transition-all"
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-card", stat.color)}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stat.label}
                      </p>
                      <p
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          stat.color,
                        )}
                      >
                        {stat.value}
                      </p>
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

              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />
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
                    <Tooltip content={<ChartTooltip />} />

                    {isStackedMode ? (
                      summary.byWorkstation.map((ws, i) => (
                        <Bar
                          key={ws.workstationId}
                          dataKey={ws.workstationId}
                          stackId="detections"
                          fill={WS_COLORS[i % WS_COLORS.length]}
                          name={ws.name}
                          radius={
                            i === summary.byWorkstation.length - 1
                              ? [4, 4, 0, 0]
                              : undefined
                          }
                        />
                      ))
                    ) : (
                      <Bar
                        dataKey="detections"
                        fill="#60a5fa"
                        radius={[4, 4, 0, 0]}
                        name="detections"
                      />
                    )}

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

              <div className="flex flex-wrap justify-center gap-4 mt-3">
                {isStackedMode ? (
                  summary.byWorkstation.map((ws, i) => (
                    <div
                      key={ws.workstationId}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: WS_COLORS[i % WS_COLORS.length],
                        }}
                      />
                      <span className="text-muted-foreground">{ws.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
                    <span className="text-muted-foreground">Scans</span>
                  </div>
                )}
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
                <h2 className="text-sm font-semibold text-foreground">
                  Per-Workstation Breakdown
                </h2>
              </div>

              {summary.byWorkstation.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                          Workstation
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">
                          Scans
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">
                          Matches
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">
                          Hit Rate
                        </th>
                        <th className="pb-3 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.byWorkstation.map((ws) => (
                        <tr
                          key={ws.workstationId}
                          onClick={() => handleWsChange(ws.workstationId)}
                          className={cn(
                            "cursor-pointer transition-colors",
                            workstationId === ws.workstationId
                              ? "bg-primary/8 border-l-2 border-l-primary"
                              : "hover:bg-accent/5",
                          )}
                        >
                          <td className="py-3 pr-4 font-medium text-foreground">
                            {ws.name}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge
                              variant={statusBadgeVariant(ws.status)}
                              className="capitalize"
                            >
                              {ws.status.toLowerCase()}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums font-mono text-foreground">
                            {ws.detectionsInRange.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums font-mono text-foreground">
                            {ws.matchesInRange.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums font-mono text-foreground">
                            {(ws.hitRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-3">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center gap-1 border-b border-border">
                <button
                  type="button"
                  onClick={() => setActiveTab("scans")}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "scans"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Scans
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("matches")}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeTab === "matches"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Matches
                </button>
              </div>

              <div className="mt-4">
                {activeTab === "scans" ? (
                  scansLoading ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : scansData && scansData.detections.length > 0 ? (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left">
                              <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                                Plate
                              </th>
                              <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                                Vehicle
                              </th>
                              <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground text-right">
                                Confidence
                              </th>
                              <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                                Workstation
                              </th>
                              <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                                Time
                              </th>
                              <th className="pb-3 text-xs font-medium text-muted-foreground">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {scansData.detections.map((d) => (
                              <tr
                                key={d.id}
                                onClick={() => openScanDetail(d.id)}
                                className="cursor-pointer hover:bg-accent/5 transition-colors"
                              >
                                <td className="py-3 pr-4 font-mono font-semibold text-foreground tabular-nums">
                                  {d.plate}
                                </td>
                                <td className="py-3 pr-4 text-muted-foreground">
                                  {vehicleDesc(
                                    d.make,
                                    d.model,
                                    d.color,
                                    d.category,
                                  )}
                                </td>
                                <td className="py-3 pr-4 text-right tabular-nums font-mono text-foreground">
                                  {(d.confidence * 100).toFixed(0)}%
                                </td>
                                <td className="py-3 pr-4 text-foreground">
                                  {d.workstation.name}
                                </td>
                                <td className="py-3 pr-4 text-muted-foreground text-xs">
                                  {formatDateTime(d.occurredAt)}
                                </td>
                                <td className="py-3">
                                  {d.matchEvents.length > 0 ? (
                                    <Badge variant="destructive">HIT</Badge>
                                  ) : (
                                    <Badge variant="secondary">CLEAR</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={scansPage <= 1}
                          onClick={() =>
                            setScansPage((p) => Math.max(1, p - 1))
                          }
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page{" "}
                          <span className="tabular-nums font-mono">
                            {scansPage}
                          </span>{" "}
                          of{" "}
                          <span className="tabular-nums font-mono">
                            {scansTotalPages}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={scansPage >= scansTotalPages}
                          onClick={() => setScansPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No scans found in selected range
                    </div>
                  )
                ) : matchesLoading ? (
                  <div className="flex items-center justify-center h-[200px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : matchesData && matchesData.items.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Plate
                            </th>
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Priority
                            </th>
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Reason
                            </th>
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Case Ref
                            </th>
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Workstation
                            </th>
                            <th className="pb-3 pr-4 text-xs font-medium text-muted-foreground">
                              Time
                            </th>
                            <th className="pb-3 text-xs font-medium text-muted-foreground">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {matchesData.items.map((m) => (
                            <tr
                              key={m.id}
                              onClick={() => openMatchDetail(m)}
                              className="cursor-pointer hover:bg-accent/5 transition-colors"
                            >
                              <td className="py-3 pr-4 font-mono font-semibold text-foreground tabular-nums">
                                {m.detection.plate}
                              </td>
                              <td className="py-3 pr-4">
                                <Badge
                                  variant={priorityVariant(
                                    m.hitlistEntry.priority,
                                  )}
                                >
                                  {priorityLabel(m.hitlistEntry.priority)}
                                </Badge>
                              </td>
                              <td className="py-3 pr-4 text-muted-foreground max-w-[200px] truncate">
                                {m.hitlistEntry.reasonSummary ?? "\u2014"}
                              </td>
                              <td className="py-3 pr-4 font-mono text-xs text-foreground">
                                {m.hitlistEntry.caseReference ?? "\u2014"}
                              </td>
                              <td className="py-3 pr-4 text-foreground">
                                {m.workstation.name}
                              </td>
                              <td className="py-3 pr-4 text-muted-foreground text-xs">
                                {formatDateTime(m.createdAt)}
                              </td>
                              <td className="py-3">
                                <Badge
                                  variant={matchStatusVariant(m.alertStatus)}
                                  className="capitalize"
                                >
                                  {m.alertStatus
                                    .toLowerCase()
                                    .replace(/_/g, " ")}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={matchesPage <= 1}
                        onClick={() =>
                          setMatchesPage((p) => Math.max(1, p - 1))
                        }
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page{" "}
                        <span className="tabular-nums font-mono">
                          {matchesPage}
                        </span>{" "}
                        of{" "}
                        <span className="tabular-nums font-mono">
                          {matchesTotalPages}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={matchesPage >= matchesTotalPages}
                        onClick={() => setMatchesPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                    No matches found in selected range
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {detailType && (
        <button
          type="button"
          tabIndex={-1}
          onClick={closeDetail}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") closeDetail();
          }}
          aria-label="Close detail panel"
          className="fixed inset-0 w-full h-full bg-background/50 backdrop-blur-sm z-40 cursor-default"
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 right-0 w-[480px] max-w-full glass-heavy border-l border-border z-50 transform transition-transform duration-300 overflow-y-auto",
          detailType ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-foreground">
              {detailType === "scan" ? "Scan Detail" : "Match Detail"}
            </h3>
            <button
              type="button"
              onClick={closeDetail}
              className="p-1.5 rounded-lg hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center h-[200px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailType === "scan" && scanDetail ? (
            <ScanDetailContent data={scanDetail} />
          ) : detailType === "match" && matchDetail ? (
            <MatchDetailContent data={matchDetail} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
