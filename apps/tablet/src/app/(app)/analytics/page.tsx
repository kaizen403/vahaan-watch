"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkstation } from "@/contexts/WorkstationContext";
import type { DetectionEvent } from "@/types/workstation";
import { cn } from "@/lib/utils";
import { BarChart3, Activity, ScanLine, Target, Gauge } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MAX_DETECTIONS = 500;

type ChartEntry = { time: string; scans: number };

type ScanTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
};

function ScanTooltip({ active, payload, label }: ScanTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-heavy rounded-lg px-3 py-2 text-xs border border-glass-border">
      {label && <p className="text-muted-foreground mb-1">{label}</p>}
      <p className="text-foreground font-medium">
        {payload[0]!.value} scan{payload[0]!.value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { lastDetection, alerts } = useWorkstation();
  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const prevRef = useRef<DetectionEvent | null>(null);

  useEffect(() => {
    if (lastDetection && lastDetection !== prevRef.current) {
      prevRef.current = lastDetection;
      setDetections((prev) =>
        [lastDetection, ...prev].slice(0, MAX_DETECTIONS),
      );
    }
  }, [lastDetection]);

  const hitRate =
    detections.length > 0
      ? `${((alerts.length / detections.length) * 100).toFixed(1)}%`
      : "N/A";

  const avgConf =
    detections.length > 0
      ? `${(
          detections.reduce((sum, d) => sum + (d.confidence ?? 0), 0) /
          detections.length
        ).toFixed(1)}%`
      : "N/A";

  const now = new Date();
  const chartData: ChartEntry[] = Array.from({ length: 12 }, (_, i) => {
    const target = new Date(now);
    target.setHours(now.getHours() - (11 - i), 0, 0, 0);
    const h = target.getHours();
    const d = target.getDate();
    const label = target.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const scans = detections.filter((det) => {
      const t = new Date(det.occurredAt);
      return t.getHours() === h && t.getDate() === d;
    }).length;
    return { time: label, scans };
  });

  const stats = [
    {
      label: "Scans This Session",
      value: detections.length.toString(),
      icon: ScanLine,
      colorClass: "text-foreground",
    },
    {
      label: "Hits This Session",
      value: alerts.length.toString(),
      icon: Activity,
      colorClass: "text-destructive",
    },
    {
      label: "Hit Rate",
      value: hitRate,
      icon: Target,
      colorClass: "text-warning",
    },
    {
      label: "Avg Confidence",
      value: avgConf,
      icon: Gauge,
      colorClass: "text-accent",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Session statistics for this workstation
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, colorClass }) => (
          <div
            key={label}
            className="glass rounded-xl p-4 flex items-start gap-3"
          >
            <div className={cn("p-2 rounded-lg bg-card shrink-0", colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p
                className={cn(
                  "text-xl font-bold font-mono tabular-nums mt-0.5",
                  colorClass,
                )}
              >
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Scan Volume — Last 12 Hours
        </h3>
        {detections.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
            >
              <defs>
                <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ScanTooltip />} />
              <Area
                type="monotone"
                dataKey="scans"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#scanGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[180px] gap-3 text-muted-foreground">
            <ScanLine className="h-10 w-10 opacity-20" />
            <p className="text-sm">No detections recorded this session</p>
          </div>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            Recent Detections
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              (last 20)
            </span>
          </h3>
        </div>
        {detections.length === 0 ? (
          <div className="p-8 text-center">
            <ScanLine className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">
              Waiting for detections…
            </p>
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {detections.slice(0, 20).map((det, idx) => {
              const isHit = alerts.some((a) => a.detectionId === det.id);
              return (
                <li
                  key={det.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5",
                    idx < Math.min(detections.length, 20) - 1 &&
                      "border-b border-border",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      isHit ? "bg-destructive" : "bg-success",
                    )}
                  />
                  <span className="font-mono text-sm font-semibold text-foreground flex-1 tracking-wider truncate">
                    {det.plate}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {det.confidence != null
                      ? `${det.confidence.toFixed(0)}%`
                      : "—"}
                  </span>
                  {isHit && (
                    <span className="text-[10px] font-bold text-destructive uppercase tracking-widest shrink-0">
                      HIT
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(det.occurredAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
