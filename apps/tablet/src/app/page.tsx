"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield, Wifi, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkstationSocket } from "@/hooks/useWorkstationSocket";

const STORAGE_KEY = "tablet_ws_url";

type ConnectionPhase = "idle" | "connecting" | "connected" | "failed";

export default function PairingPage() {
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");

  const socket = useWorkstationSocket(wsUrl);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAddress(stored.replace(/^ws:\/\//, ""));
      setWsUrl(stored);
      setPhase("connecting");
    }
  }, []);

  useEffect(() => {
    if (socket.connected) {
      setPhase("connected");
    } else if (wsUrl && socket.error) {
      setPhase("failed");
    } else if (wsUrl && !socket.connected) {
      setPhase("connecting");
    }
  }, [socket.connected, socket.error, wsUrl]);

  useEffect(() => {
    if (socket.connected && socket.healthReport) {
      localStorage.setItem(STORAGE_KEY, wsUrl!);
      router.push("/dashboard");
    }
  }, [socket.connected, socket.healthReport, wsUrl, router]);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;

    const url = trimmed.startsWith("ws://") ? trimmed : `ws://${trimmed}`;
    setWsUrl(url);
    setPhase("connecting");
  }

  function handleDisconnect() {
    setWsUrl(null);
    setPhase("idle");
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="w-16 h-16 rounded-2xl glass glow-primary flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <CardTitle className="text-xl">Vehicle Surveillance Tablet</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to a workstation to begin monitoring
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-address">Workstation Address</Label>
              <Input
                id="ws-address"
                placeholder="192.168.1.100:8089"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={phase === "connecting" || phase === "connected"}
              />
              <p className="text-xs text-muted-foreground">
                IP address and port of the workstation agent
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={!address.trim() || phase === "connecting" || phase === "connected"}
              >
                {phase === "connecting" && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {phase === "idle" && "Connect"}
                {phase === "connecting" && "Connecting…"}
                {phase === "connected" && "Connected"}
                {phase === "failed" && "Retry"}
              </Button>

              {(phase === "connecting" || phase === "failed" || phase === "connected") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDisconnect}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="flex items-center gap-3 p-3 rounded-lg glass">
            {phase === "connected" ? (
              <Wifi className="w-5 h-5 text-success shrink-0" />
            ) : phase === "failed" ? (
              <WifiOff className="w-5 h-5 text-destructive shrink-0" />
            ) : phase === "connecting" ? (
              <Loader2 className="w-5 h-5 text-warning animate-spin shrink-0" />
            ) : (
              <WifiOff className="w-5 h-5 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  phase === "connected" && "text-success",
                  phase === "failed" && "text-destructive",
                  phase === "connecting" && "text-warning",
                  phase === "idle" && "text-muted-foreground",
                )}
              >
                {phase === "idle" && "Not connected"}
                {phase === "connecting" && "Establishing connection…"}
                {phase === "connected" && "Connected — waiting for health check"}
                {phase === "failed" && "Connection failed"}
              </p>
              {phase === "failed" && socket.error && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {socket.error}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
