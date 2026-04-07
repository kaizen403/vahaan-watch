"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  ScanLine,
  Search,
  Settings,
  Shield,
  X,
} from "lucide-react";

import { auth } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

interface ToastContextValue {
  toast: (opts: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within the portal layout");
  return ctx;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...opts, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "glass rounded-xl px-4 py-3 min-w-64 max-w-sm pointer-events-auto flex items-start gap-3",
              t.variant === "destructive" && "border-destructive/30 glow-destructive",
              t.variant === "success" && "border-success/30",
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              {t.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5 h-6 w-6"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/portal/dashboard" },
  { label: "Scans", icon: ScanLine, href: "/portal/scans" },
  { label: "Cameras", icon: Camera, href: "/portal/cameras" },
  { label: "Alerts", icon: Bell, href: "/portal/alerts" },
  { label: "Search", icon: Search, href: "/portal/search" },
  { label: "Analytics", icon: BarChart3, href: "/portal/analytics" },
  { label: "Watchlist", icon: ListChecks, href: "/portal/watchlist" },
  { label: "Devices", icon: HardDrive, href: "/portal/devices" },
  { label: "Workstations", icon: Monitor, href: "/portal/workstations" },
  { label: "Settings", icon: Settings, href: "/portal/settings" },
];

function Sidebar({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col glass-heavy border-r border-border transition-all duration-300 ease-out shrink-0",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-border",
          collapsed && "px-3 justify-center",
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-primary" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <span className="font-bold tracking-[0.15em] text-sm text-foreground">Vehicle Surveillance</span>
        )}
      </div>

      <TooltipProvider>
        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push(href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all h-auto justify-start",
                      active
                        ? "bg-primary/12 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground glass-hover border border-transparent",
                      collapsed && "justify-center px-2.5",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
                    {!collapsed && <span>{label}</span>}
                  </Button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">{label}</TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      <div className="p-2 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onCollapse(!collapsed)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground glass-hover border border-transparent transition-all h-auto justify-start",
            collapsed && "justify-center px-2.5",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-background/70 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-50 flex flex-col glass-heavy border-r border-border transition-transform duration-300 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <span className="font-bold tracking-[0.15em] text-sm text-foreground">Vehicle Surveillance</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-8 w-8"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Button
                type="button"
                variant="ghost"
                key={href}
                onClick={() => {
                  router.push(href);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all h-auto justify-start",
                  active
                    ? "bg-primary/12 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground glass-hover border border-transparent",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active && "text-primary")} />
                <span>{label}</span>
              </Button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function LiveClock() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
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

function pageTitleFromPathname(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "dashboard";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function Header({
  onMobileMenu,
  user,
}: {
  onMobileMenu: () => void;
  user: { name: string; email: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await auth.signOut();
    router.push("/portal/login");
  }

  return (
    <header className="h-14 glass-heavy border-b border-border flex items-center px-4 gap-4 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onMobileMenu}
        className="md:hidden text-muted-foreground hover:text-foreground h-9 w-9"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <h1 className="font-semibold text-foreground text-sm flex-1">
        {pageTitleFromPathname(pathname)}
      </h1>

      <LiveClock />

      <div className="flex items-center gap-2">
        {user && (
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-muted-foreground max-w-[8rem] truncate">{user.name}</span>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive glass-hover border border-transparent"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = auth.useSession();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/portal/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass glow-primary flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" strokeWidth={1.5} style={{ animation: "pulse 2s infinite" }} />
          </div>
          <p className="text-sm text-muted-foreground">Verifying session…</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            onMobileMenu={() => setMobileOpen(true)}
            user={session.user}
          />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
