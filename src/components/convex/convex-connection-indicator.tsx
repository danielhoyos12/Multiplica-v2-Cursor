"use client";

import { useConvexConnectionState } from "convex/react";

function StatusDot({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <div
      className="pointer-events-none fixed top-3 right-3 z-50 flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={label}
      title={label}
    >
      <span
        className={
          connected
            ? "block size-2.5 rounded-full bg-[var(--success)] ring-2 ring-[var(--rice)]"
            : "block size-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--rice)]"
        }
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Fixed top-right Convex websocket indicator (green / red). */
export function ConvexConnectionIndicator() {
  const { isWebSocketConnected } = useConvexConnectionState();
  const label = isWebSocketConnected
    ? "Convex conectado"
    : "Convex desconectado";

  return <StatusDot connected={isWebSocketConnected} label={label} />;
}

/** Shown when NEXT_PUBLIC_CONVEX_URL is missing (always disconnected). */
export function ConvexDisconnectedIndicator() {
  return (
    <StatusDot connected={false} label="Convex no configurado" />
  );
}
