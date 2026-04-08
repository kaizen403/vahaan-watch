"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListPlus,
  Loader2,
  RefreshCw,
  ScanLine,
  Search,
  XCircle,
} from "lucide-react";

import { useWorkstation } from "@/contexts/WorkstationContext";
import { api } from "@/lib/api";
import { AddToHitlistModal } from "@/components/AddToHitlistModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DetectionEvent } from "@/types/workstation";

interface ApiDetection {
  id: string;
  plate: string;
  occurredAt: string;
  confidence: number | null;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  workstation: { name: string; deviceId: string } | null;
  matchEvents: { id: string; alertStatus: string }[];
}

type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface DisplayScan {
  id: string;
  plate: string;
  occurredAt: string;
  confidence: number | null;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
  isMatch: boolean;
  isLive: boolean;
}

type HitlistTarget = {
  plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  category: string | null;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fromLive(det: DetectionEvent, matchedIds: Set<string>): DisplayScan {
  return {
    id: det.id,
    plate: det.plate,
    occurredAt: det.occurredAt,
    confidence: det.confidence,
    country: det.country,
    make: det.make,
    model: det.model,
    color: det.color,
    category: det.category,
    isMatch: matchedIds.has(det.id),
    isLive: true,
  };
}

function fromApi(det: ApiDetection): DisplayScan {
  return {
    id: det.id,
    plate: det.plate,
    occurredAt: det.occurredAt,
    confidence: det.confidence,
    country: det.country,
    make: det.make,
    model: det.model,
    color: det.color,
    category: det.category,
    isMatch: det.matchEvents.length > 0,
    isLive: false,
  };
}

function vehicleSummary(scan: DisplayScan): string {
  return [scan.color, scan.make, scan.model, scan.category]
    .filter(Boolean)
    .join(" · ");
}

const MAX_LIVE = 100;

export default function ScansPage() {
  const { connected, lastDetection, matches } = useWorkstation();

  const [liveScans, setLiveScans] = useState<DetectionEvent[]>([]);
  const prevDetRef = useRef<DetectionEvent | null>(null);

  const [apiScans, setApiScans] = useState<DisplayScan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchPlate, setSearchPlate] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [hitlistPlate, setHitlistPlate] = useState<HitlistTarget | null>(null);
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (lastDetection && lastDetection !== prevDetRef.current) {
      prevDetRef.current = lastDetection;
      setLiveScans((prev) => [lastDetection, ...prev].slice(0, MAX_LIVE));
    }
  }, [lastDetection]);

  const matchedDetectionIds = new Set(matches.map((m) => m.detection.id));

  const [workstationId, setWorkstationId] = useState<string | null>(null);
  useEffect(() => {
    setWorkstationId(localStorage.getItem("tablet_workstation_id"));
  }, []);

  const fetchHistory = useCallback(
    async (pageToLoad: number, plateFilter: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: "30",
        });
        if (workstationId) params.set("workstationId", workstationId);
        if (plateFilter) params.set("plate", plateFilter);

        const resp = await api.get<
          ApiResp<{ detections: ApiDetection[]; total: number }>
        >(`/api/detections?${params.toString()}`);

        if (resp.success) {
          setApiScans(resp.data.detections.map(fromApi));
          setTotal(resp.data.total);
          setPage(pageToLoad);
        } else {
          setError(resp.error);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load scan history",
        );
      } finally {
        setLoading(false);
      }
    },
    [workstationId],
  );

  useEffect(() => {
    void fetchHistory(1, activeSearch);
  }, [fetchHistory, activeSearch]);

  function handleSearch() {
    setActiveSearch(searchPlate.trim());
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;
    void fetchHistory(newPage, activeSearch);
  }

  const liveDisplayScans = liveScans.map((det) =>
    fromLive(det, matchedDetectionIds),
  );
  const apiIdSet = new Set(apiScans.map((s) => s.id));
  const uniqueLive = liveDisplayScans.filter((s) => !apiIdSet.has(s.id));

  const liveCount = uniqueLive.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Scans</h1>
          {liveCount > 0 && (
            <Badge variant="default" className="tabular-nums text-[10px]">
              {liveCount} live
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fetchHistory(page, activeSearch)}
          disabled={loading}
          aria-label="Refresh scans"
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search plate..."
            value={searchPlate}
            onChange={(e) => setSearchPlate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <Button size="sm" onClick={handleSearch}>
          Search
        </Button>
      </div>

      {connected && uniqueLive.length > 0 && !activeSearch && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Live Feed
            </span>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {uniqueLive.slice(0, 10).map((scan) => (
              <Card
                key={`live-${scan.id}`}
                className={cn(
                  "glass transition-all",
                  scan.isMatch && "border-destructive/40 glow-destructive",
                )}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-foreground tracking-widest">
                        {scan.plate}
                      </span>
                      {scan.isMatch && (
                        <Badge variant="destructive" className="text-[10px]">
                          HIT
                        </Badge>
                      )}
                    </div>
                    {vehicleSummary(scan) && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {vehicleSummary(scan)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {scan.confidence !== null && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {(scan.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {scan.country && (
                        <span className="text-[10px] text-muted-foreground">
                          {scan.country}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(scan.occurredAt)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={() =>
                      setHitlistPlate({
                        plate: scan.plate,
                        make: scan.make,
                        model: scan.model,
                        color: scan.color,
                        category: scan.category,
                      })
                    }
                    aria-label="Add to hitlist"
                  >
                    <ListPlus className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {activeSearch ? "Search Results" : "Scan History"}
          </span>
          {!loading && (
            <Badge variant="secondary" className="text-[10px]">
              {total}
            </Badge>
          )}
        </div>

        {loading && apiScans.length === 0 && (
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && apiScans.length === 0 && (
          <div className="glass rounded-xl p-8 flex flex-col items-center text-center min-h-[200px] justify-center">
            <div className="glass rounded-full p-4 mb-3">
              <ScanLine className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-sm font-medium text-foreground mb-1">
              {activeSearch ? "No Matching Scans" : "No Scan History"}
            </h2>
            <p className="text-xs text-muted-foreground max-w-xs">
              {activeSearch
                ? "Try a different plate number."
                : "Scans will appear here once the workstation syncs data to the central server."}
            </p>
          </div>
        )}

        {apiScans.length > 0 && (
          <div className="space-y-1.5">
            {apiScans.map((scan) => (
              <Card
                key={scan.id}
                className={cn(
                  "glass transition-all",
                  scan.isMatch && "border-destructive/25",
                )}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-foreground tracking-widest">
                        {scan.plate}
                      </span>
                      {scan.isMatch && (
                        <Badge variant="destructive" className="text-[10px]">
                          HIT
                        </Badge>
                      )}
                    </div>
                    {vehicleSummary(scan) && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {vehicleSummary(scan)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {scan.confidence !== null && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {(scan.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {scan.country && (
                        <span className="text-[10px] text-muted-foreground">
                          {scan.country}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(scan.occurredAt)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={() =>
                      setHitlistPlate({
                        plate: scan.plate,
                        make: scan.make,
                        model: scan.model,
                        color: scan.color,
                        category: scan.category,
                      })
                    }
                    aria-label="Add to hitlist"
                  >
                    <ListPlus className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {apiScans.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-muted-foreground">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
              {total}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 glass glass-hover"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground tabular-nums px-1">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 glass glass-hover"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
      <AddToHitlistModal
        open={!!hitlistPlate}
        plate={hitlistPlate?.plate ?? ""}
        vehicleMake={hitlistPlate?.make}
        vehicleModel={hitlistPlate?.model}
        vehicleColor={hitlistPlate?.color}
        vehicleCategory={hitlistPlate?.category}
        onClose={() => setHitlistPlate(null)}
      />
    </div>
  );
}
