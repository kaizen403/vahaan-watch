"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Monitor } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type WorkstationSession = {
  workstationId: string;
  address: string;
  name: string;
  token: string;
};

export default function WorkstationLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<WorkstationSession | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("workstation_session");
    if (!raw) {
      router.push("/workstation/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as WorkstationSession;
      setSession(parsed);
      setIsPending(false);
    } catch {
      localStorage.removeItem("workstation_session");
      router.push("/workstation/login");
    }
  }, [router]);

  function handleSignOut() {
    localStorage.removeItem("workstation_session");
    router.push("/workstation/login");
  }

  if (isPending || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl glass glow-primary flex items-center justify-center">
            <Monitor className="w-6 h-6 text-primary" strokeWidth={1.5} style={{ animation: "pulse 2s infinite" }} />
          </div>
          <p className="text-sm text-muted-foreground">Verifying session&hellip;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header
        className={cn(
          "h-12 glass-heavy border-b border-border flex items-center justify-between px-4 shrink-0",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-bold tracking-[0.15em] text-sm text-foreground">Vaahan Workstation.</span>
          <span className="text-xs text-muted-foreground/50 font-mono hidden sm:inline">
            {session.address}
          </span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive glass-hover border border-transparent"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </Button>
      </header>

      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
