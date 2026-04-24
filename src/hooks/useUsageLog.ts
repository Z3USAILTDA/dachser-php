import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseUsageLogOptions {
  endpoint: string;
  method?: "GET" | "POST" | "DELETE" | "PUT";
}

const SESSION_STORAGE_KEY = "dachser_session_id";

/**
 * Retorna (ou cria) um session_id único por aba do navegador.
 * sessionStorage é isolado por aba e persiste em reloads da mesma aba.
 */
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

/**
 * Hook para registrar uso de páginas no sistema de métricas.
 * Registra automaticamente quando a página é acessada.
 */
async function sendLog(payload: Record<string, unknown>) {
  try {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;
    const user = JSON.parse(storedUser);
    const username = user?.username || user?.email?.split("@")[0];
    if (!username || username === "unknown") return;

    await supabase.functions.invoke("mariadb-proxy", {
      body: {
        action: "log_usage",
        username,
        sessionId: getOrCreateSessionId(),
        ...payload,
      },
    });
  } catch (error) {
    console.warn("Failed to log usage:", error);
  }
}

export function useUsageLog({ endpoint, method = "GET" }: UseUsageLogOptions) {
  const hasLogged = useRef(false);
  const enteredAtRef = useRef<number>(0);

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    enteredAtRef.current = Date.now();
    const enteredAtIso = new Date(enteredAtRef.current).toISOString();

    // view_start
    sendLog({
      endpoint,
      method,
      eventType: "view_start",
      enteredAt: enteredAtIso,
    });

    const sendViewEnd = (reason: "unmount" | "pagehide") => {
      const leftAt = Date.now();
      const durationMs = leftAt - enteredAtRef.current;
      // Use sendBeacon-like best-effort; supabase.functions.invoke may not flush on unload,
      // so we also fire on unmount which covers SPA navigation.
      sendLog({
        endpoint,
        method,
        eventType: "view_end",
        enteredAt: enteredAtIso,
        leftAt: new Date(leftAt).toISOString(),
        durationMs,
        reason,
      });
    };

    const handlePageHide = () => sendViewEnd("pagehide");
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      sendViewEnd("unmount");
    };
  }, [endpoint, method]);
}

/**
 * Função para registrar ações específicas (POST, DELETE, etc.)
 */
export async function logAction(endpoint: string, method: "POST" | "DELETE" | "PUT" = "POST") {
  try {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    const user = JSON.parse(storedUser);
    const username = user?.username || user?.email?.split("@")[0];
    if (!username || username === "unknown") return;

    await supabase.functions.invoke("mariadb-proxy", {
      body: {
        action: "log_usage",
        username,
        endpoint,
        method,
        sessionId: getOrCreateSessionId(),
      },
    });
  } catch (error) {
    console.warn("Failed to log action:", error);
  }
}

/**
 * Registra um evento de interação semântico (ex: "air.timeline.open", "vouchers.approve").
 * Usa o método "EVENT" para distinguir de page views (GET) e mutações HTTP reais (POST/PUT/DELETE)
 * sem exigir alteração no schema do log.
 */
export function trackEvent(action: string) {
  if (!action) return;
  // Reusa o mesmo pipeline de log; o "endpoint" passa a ser o nome da ação.
  // Cast intencional: estamos estendendo o vocabulário de método só para eventos UI.
  return logAction(`event:${action}`, "POST" as const);
}

