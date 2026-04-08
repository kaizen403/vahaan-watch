"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wifi, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkstationSocket } from "@/hooks/useWorkstationSocket";

const STORAGE_KEY = "tablet_ws_url";
const WORKSTATION_KEY = "tablet_workstation";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

type ConnectionPhase = "idle" | "connecting" | "connected" | "failed";

export default function PairingPage() {
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const socket = useWorkstationSocket(wsUrl);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const workstationRaw = localStorage.getItem(WORKSTATION_KEY);
      if (workstationRaw) {
        try {
          const { address: storedAddress } = JSON.parse(workstationRaw) as {
            address: string;
            name: string;
          };
          setAddress(storedAddress);
        } catch {}
      }
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
      router.push("/dashboard");
    }
  }, [socket.connected, socket.healthReport, router]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmedAddress = address.trim();
    const trimmedPassword = password.trim();
    if (!trimmedAddress || !trimmedPassword) return;

    setPairing(true);
    setPairError(null);

    try {
      const res = await fetch(`${API_BASE}/api/workstations/tablet-pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: trimmedAddress,
          password: trimmedPassword,
        }),
      });

      if (!res.ok) {
        setPairError("Invalid workstation address or password");
        setPhase("idle");
        setPairing(false);
        return;
      }

      const json = (await res.json()) as {
        success: boolean;
        data?: {
          workstation: { id: string; address: string; name: string };
          wsPort: number;
        };
      };

      if (!json.success || !json.data) {
        setPairError("Invalid workstation address or password");
        setPhase("idle");
        setPairing(false);
        return;
      }

      const { workstation, wsPort } = json.data;
      const url = `ws://localhost:${wsPort}`;
      localStorage.setItem(STORAGE_KEY, url);
      localStorage.setItem(
        WORKSTATION_KEY,
        JSON.stringify({
          address: workstation.address,
          name: workstation.name,
        }),
      );
      localStorage.setItem("tablet_workstation_id", workstation.id);
      setWsUrl(url);
      setPhase("connecting");
    } catch {
      setPairError("Could not reach the API server");
      setPhase("idle");
    }

    setPairing(false);
  }

  function handleDisconnect() {
    setWsUrl(null);
    setPhase("idle");
    setPairError(null);
    setPairing(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WORKSTATION_KEY);
    localStorage.removeItem("tablet_workstation_id");
  }

  const isConnecting = pairing || phase === "connecting";
  const buttonDisabled =
    !address.trim() ||
    !password.trim() ||
    isConnecting ||
    phase === "connected";
  const buttonText = isConnecting
    ? "Connecting…"
    : phase === "connected"
      ? "Connected"
      : phase === "failed"
        ? "Retry"
        : "Connect";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">Vaahan Tablet</CardTitle>
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
                placeholder="WS-001"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={pairing || phase === "connected"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-password">Password</Label>
              <Input
                id="ws-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pairing || phase === "connected"}
              />
            </div>

            {pairError && (
              <p className="text-sm text-destructive">{pairError}</p>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={buttonDisabled}
              >
                {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                {buttonText}
              </Button>

              {(phase === "connecting" ||
                phase === "failed" ||
                phase === "connected") &&
                !pairing && (
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
                {phase === "connected" && (
                  <span className="inline-flex items-center gap-1.5">
                    Connected — waiting for health check
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </span>
                )}
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
