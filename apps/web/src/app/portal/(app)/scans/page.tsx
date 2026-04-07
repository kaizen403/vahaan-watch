"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Calendar,
  Car,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Globe,
  Loader2,
  Monitor,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  SlidersHorizontal,
} from "lucide-react";

interface DetectionWorkstation {
  name: string;
  deviceId: string;
}

interface DetectionMatchEvent {
  id: string;
  alertStatus: string;
}

interface Detection {
  id: string;
  plate: string;
  occurredAt: string;
  confidence: number | null;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  snapshotUrl: string | null;
  workstationId: string;
  workstation: DetectionWorkstation | null;
  matchEvents: DetectionMatchEvent[];
}

interface DetectionsPageData {
  detections: Detection[];
  total: number;
  page: number;
  limit: number;
}

type ApiResp<T> = { success: true; data: T } | { success: false; error: string };

interface Filters {
  plate: string;
  dateFrom: string;
  dateTo: string;
  workstationId: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getVehicleSummary(det: Detection): string {
  const parts = [det.color, det.make, det.model, det.category].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export default function ScansPage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    plate: "",
    dateFrom: "",
    dateTo: "",
    workstationId: "",
  });
  const [activeFilters, setActiveFilters] = useState<Filters>({
    plate: "",
    dateFrom: "",
    dateTo: "",
    workstationId: "",
  });
  const loadRequestIdRef = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = activeFilters.plate || activeFilters.dateFrom || activeFilters.dateTo || activeFilters.workstationId;

  const fetchPage = useCallback(
    async (pageToLoad: number, filtersToUse: Filters, isRefresh = false) => {
      const requestId = ++loadRequestIdRef.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: String(pageSize),
        });
        if (filtersToUse.plate) params.set("plate", filtersToUse.plate);
        if (filtersToUse.dateFrom) params.set("from", new Date(filtersToUse.dateFrom).toISOString());
        if (filtersToUse.dateTo) params.set("to", new Date(filtersToUse.dateTo + "T23:59:59").toISOString());
        if (filtersToUse.workstationId) params.set("workstationId", filtersToUse.workstationId);

        const resp = await api.get<ApiResp<DetectionsPageData>>(
          `/api/detections?${params.toString()}`,
        );

        if (requestId !== loadRequestIdRef.current) return;
        if (!resp.success) {
          setError(resp.error);
          return;
        }

        setDetections(resp.data.detections);
        setTotal(resp.data.total);
        setPage(pageToLoad);
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load scans");
      } finally {
        if (requestId !== loadRequestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void fetchPage(1, activeFilters);
  }, [fetchPage, activeFilters]);

  function handleSearch() {
    setActiveFilters({ ...filters });
    setPage(1);
  }

  function handleClearFilters() {
    const cleared: Filters = { plate: "", dateFrom: "", dateTo: "", workstationId: "" };
    setFilters(cleared);
    setActiveFilters(cleared);
    setPage(1);
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    void fetchPage(newPage, activeFilters);
  }

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Scans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All plate detections from workstations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3 w-3 animate-pulse text-primary" />
            {refreshing ? "Refreshing" : "Live"}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchPage(page, activeFilters, true)}
            disabled={refreshing}
            className="glass glass-hover"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 bg-destructive/5 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchPage(page, activeFilters)}
            className="glass glass-hover"
          >
            Retry
          </Button>
        </div>
      )}

      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by plate number..."
                value={filters.plate}
                onChange={(e) => updateFilter("plate", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="pl-10"
              />
            </div>
            <Button
              type="button"
              onClick={handleSearch}
              className="shrink-0"
            >
              <Search className="h-4 w-4 mr-1.5" />
              Search
            </Button>
            <Button
              type="button"
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className={cn(!showFilters && "glass glass-hover")}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> From Date
                </Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter("dateFrom", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> To Date
                </Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter("dateTo", e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearFilters}
                  className="glass glass-hover"
                  disabled={!hasFilters}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          )}

          {hasFilters && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Showing filtered results</span>
              <Badge variant="secondary" className="text-[10px]">
                {total} result{total !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="glass rounded-xl min-h-[400px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : detections.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <div className="relative glass rounded-full p-6">
              <ScanLine className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">
            {hasFilters ? "No Matching Scans" : "No Scans Yet"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {hasFilters
              ? "Try adjusting your filters or search criteria."
              : "Scans will appear here as workstations detect plates. Make sure a workstation is running and syncing to the central server."}
          </p>
        </div>
      ) : (
        <>
          <Card className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plate</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workstation</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Confidence</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Country</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vehicle</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detections.map((det) => {
                    const isMatch = det.matchEvents.length > 0;
                    return (
                      <tr
                        key={det.id}
                        className={cn(
                          "hover:bg-card/40 transition-colors",
                          isMatch && "bg-destructive/5",
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-foreground tracking-wider">
                            {det.plate}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-foreground text-xs">
                              {formatTimestamp(det.occurredAt)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {timeAgo(det.occurredAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-foreground text-xs truncate max-w-[150px]">
                              {det.workstation?.name ?? "Unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {det.confidence !== null ? (
                            <div className="flex items-center gap-1.5">
                              <Gauge className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono text-xs text-foreground">
                                {(det.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {det.country ? (
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-foreground">{det.country}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Car className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs text-foreground truncate max-w-[150px]">
                              {getVehicleSummary(det)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isMatch ? (
                            <Badge variant="destructive" className="text-[10px]">
                              HIT
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Clear
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
              {total} scan{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="glass glass-hover"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="glass glass-hover"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
