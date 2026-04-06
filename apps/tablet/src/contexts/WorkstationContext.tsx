"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkstationSocket } from "@/hooks/useWorkstationSocket";
import type {
  AlertPayload,
  DetectionEvent,
  HealthReport,
  MatchResult,
} from "@/types/workstation";

const STORAGE_KEY = "tablet_ws_url";
const MAX_ALERTS = 50;

interface WorkstationContextValue {
  connected: boolean;
  healthReport: HealthReport | null;
  lastDetection: DetectionEvent | null;
  alerts: AlertPayload[];
  matches: (MatchResult & { detection: DetectionEvent })[];
  wsUrl: string | null;
  setWsUrl: (url: string | null) => void;
  disconnect: () => void;
  error: string | null;
  reconnecting: boolean;
}

const WorkstationContext = createContext<WorkstationContextValue | null>(null);

export function useWorkstation() {
  const ctx = useContext(WorkstationContext);
  if (!ctx)
    throw new Error("useWorkstation must be used within WorkstationProvider");
  return ctx;
}

export function WorkstationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [wsUrl, setWsUrlState] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const [matches, setMatches] = useState<
    (MatchResult & { detection: DetectionEvent })[]
  >([]);

  const prevAlertRef = useRef<AlertPayload | null>(null);
  const prevMatchRef = useRef<
    (MatchResult & { detection: DetectionEvent }) | null
  >(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setWsUrlState(stored);
    }
  }, []);

  const setWsUrl = useCallback((url: string | null) => {
    setWsUrlState(url);
    if (url) {
      localStorage.setItem(STORAGE_KEY, url);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWsUrl(null);
    setAlerts([]);
    setMatches([]);
  }, [setWsUrl]);

  const socket = useWorkstationSocket(wsUrl);

  useEffect(() => {
    if (socket.lastAlert && socket.lastAlert !== prevAlertRef.current) {
      prevAlertRef.current = socket.lastAlert;
      setAlerts((prev) => [socket.lastAlert!, ...prev].slice(0, MAX_ALERTS));
    }
  }, [socket.lastAlert]);

  useEffect(() => {
    if (socket.lastMatch && socket.lastMatch !== prevMatchRef.current) {
      prevMatchRef.current = socket.lastMatch;
      setMatches((prev) => [socket.lastMatch!, ...prev].slice(0, MAX_ALERTS));
    }
  }, [socket.lastMatch]);

  const value = useMemo<WorkstationContextValue>(
    () => ({
      connected: socket.connected,
      healthReport: socket.healthReport,
      lastDetection: socket.lastDetection,
      alerts,
      matches,
      wsUrl,
      setWsUrl,
      disconnect,
      error: socket.error,
      reconnecting: socket.reconnecting,
    }),
    [
      socket.connected,
      socket.healthReport,
      socket.lastDetection,
      socket.error,
      socket.reconnecting,
      alerts,
      matches,
      wsUrl,
      setWsUrl,
      disconnect,
    ],
  );

  return (
    <WorkstationContext.Provider value={value}>
      {children}
    </WorkstationContext.Provider>
  );
}
