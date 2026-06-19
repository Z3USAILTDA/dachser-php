// Telemetria local da tela air/tracking-aereo — substitui o hook compartilhado
// useUsageLog (que depende de Supabase) APENAS para esta tela, mantendo a migração
// isolada. Os logs são enviados ao backend interno em /api/air/usage-log.

import { useEffect, useRef } from "react";
import { apiPost } from "./apiClient";

const SESSION_STORAGE_KEY = "dachser_session_id";

function getOrCreateSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function currentUsername(): string | null {
  try {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const user = JSON.parse(stored);
    return user?.username || user?.email?.split("@")[0] || null;
  } catch {
    return null;
  }
}

async function send(payload: Record<string, unknown>): Promise<void> {
  try {
    const username = currentUsername();
    if (!username || username === "unknown") return;
    await apiPost("/api/air/usage-log", {
      username,
      sessionId: getOrCreateSessionId(),
      ...payload,
    });
  } catch {
    /* telemetria é best-effort; nunca quebra a tela */
  }
}

/** Registra um evento de interação (ex.: "air.refresh", "air.timeline.open"). */
export function trackEvent(action: string): void {
  if (!action) return;
  void send({ endpoint: `event:${action}`, method: "POST" });
}

/** Registra entrada/saída da página (view_start / view_end com duração). */
export function useAirPageView(endpoint: string): void {
  const hasLogged = useRef(false);
  const enteredAtRef = useRef<number>(0);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    enteredAtRef.current = Date.now();
    const enteredAtIso = new Date(enteredAtRef.current).toISOString();
    void send({ endpoint, method: "GET", eventType: "view_start", enteredAt: enteredAtIso });

    const sendViewEnd = (reason: "unmount" | "pagehide") => {
      const leftAt = Date.now();
      void send({
        endpoint,
        method: "GET",
        eventType: "view_end",
        enteredAt: enteredAtIso,
        leftAt: new Date(leftAt).toISOString(),
        durationMs: leftAt - enteredAtRef.current,
        reason,
      });
    };

    const handlePageHide = () => sendViewEnd("pagehide");
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      sendViewEnd("unmount");
    };
  }, [endpoint]);
}
