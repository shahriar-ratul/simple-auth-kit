"use client";

import type { AuditLogEntry } from "@easy-auth/auth-client";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { AUTH_API_URL } from "@/lib/env";
import { cookieTokenStorage } from "@/lib/token-storage";

export type LiveFeedStatus = "connecting" | "connected" | "disconnected";

/**
 * Live tail of the backend's `/audit-logs` socket.io namespace. Entries arrive as
 * `audit-log:created` in the same wire shape as the REST list, newest first, capped.
 */
export function useLiveAuditFeed(enabled: boolean, cap = 20) {
  const [status, setStatus] = useState<LiveFeedStatus>("connecting");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const tokens = await cookieTokenStorage.get();
      if (cancelled || !tokens) {
        setStatus("disconnected");
        return;
      }
      const socket = io(`${AUTH_API_URL}/audit-logs`, {
        auth: { token: tokens.accessToken },
      });
      socketRef.current = socket;

      socket.on("connect", () => setStatus("connected"));
      socket.on("disconnect", () => setStatus("disconnected"));
      socket.on("connect_error", () => setStatus("disconnected"));
      socket.on("audit-log:created", (entry: AuditLogEntry) => {
        setEntries((prev) => [entry, ...prev].slice(0, cap));
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, cap]);

  return { status, entries };
}
