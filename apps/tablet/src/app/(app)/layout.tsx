"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  ListChecks,
  Settings,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { WorkstationProvider, useWorkstation } from "@/contexts/WorkstationContext";

type TabItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
};

const TABS: TabItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Alerts", icon: Bell, href: "/alerts" },
  { label: "Hit Lists", icon: ListChecks, href: "/hitlists" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

function ConnectionIndicator() {
  const { connected, reconnecting } = useWorkstation();

  return (
    <div className="flex items-center gap-2">
      {connected ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          <Wifi className="w-4 h-4 text-success" />
        </>
      ) : (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
          </span>
          <WifiOff className={cn("w-4 h-4 text-destructive", reconnecting && "animate-pulse")} />
        </>
      )}
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = React.useState("--:--:--");

  React.useEffect(() => {
    function tick() {
      setTime(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono text-sm text-muted-foreground tabular-nums tracking-wider">
      {time}
    </span>
  );
}

function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="glass-heavy border-t border-border flex items-stretch shrink-0 safe-area-bottom">
      {TABS.map(({ label, icon: Icon, href }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground active:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("w-5 h-5", active && "text-primary")} />
            <span className={cn("text-[10px] font-medium", active && "text-primary")}>
              {label}
            </span>
            {active && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header className="h-12 glass-heavy border-b border-border flex items-center px-4 gap-3 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Shield className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
        </div>
        <span className="font-bold tracking-[0.12em] text-xs text-foreground flex-1">
          SURVEILLANCE
        </span>
        <LiveClock />
        <ConnectionIndicator />
      </header>

      <main className="flex-1 overflow-auto p-4">{children}</main>

      <BottomTabBar />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkstationProvider>
      <AppShell>{children}</AppShell>
    </WorkstationProvider>
  );
}
