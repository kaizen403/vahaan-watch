"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AlertPayload,
  DetectionEvent,
  HealthReport,
  MatchResult,
  WorkstationMessage,
} from "@/types/workstation";

interface WorkstationSocketState {
  connected: boolean;
  healthReport: HealthReport | null;
  lastDetection: DetectionEvent | null;
  lastAlert: AlertPayload | null;
  lastMatch: (MatchResult & { detection: DetectionEvent }) | null;
  error: string | null;
  reconnecting: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export function useWorkstationSocket(workstationUrl: string | null) {
  const [state, setState] = useState<WorkstationSocketState>({
    connected: false,
    healthReport: null,
    lastDetection: null,
    lastAlert: null,
    lastMatch: null,
    error: null,
    reconnecting: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (url: string) => {
      cleanup();

      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        backoffRef.current = INITIAL_BACKOFF_MS;
        setState((prev) => ({
          ...prev,
          connected: true,
          error: null,
          reconnecting: false,
        }));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          connected: false,
          reconnecting: true,
        }));

        const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
        backoffRef.current = delay * 2;

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect(url);
          }
        }, delay);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          error: "WebSocket connection error",
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;

        let msg: WorkstationMessage;
        try {
          msg = JSON.parse(event.data as string) as WorkstationMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case "detection":
            setState((prev) => ({ ...prev, lastDetection: msg.data }));
            break;
          case "match":
            setState((prev) => ({ ...prev, lastMatch: msg.data }));
            break;
          case "alert":
            setState((prev) => ({ ...prev, lastAlert: msg.data }));
            break;
          case "health":
            setState((prev) => ({ ...prev, healthReport: msg.data }));
            break;
        }
      };
    },
    [cleanup],
  );

  useEffect(() => {
    mountedRef.current = true;

    if (workstationUrl) {
      connect(workstationUrl);
    } else {
      cleanup();
      setState({
        connected: false,
        healthReport: null,
        lastDetection: null,
        lastAlert: null,
        lastMatch: null,
        error: null,
        reconnecting: false,
      });
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [workstationUrl, connect, cleanup]);

  return state;
}
