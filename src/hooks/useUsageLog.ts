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
export function useUsageLog({ endpoint, method = "GET" }: UseUsageLogOptions) {
  const hasLogged = useRef(false);

  useEffect(() => {
    // Evita log duplicado em strict mode / re-renders
    if (hasLogged.current) return;
    hasLogged.current = true;

    const logUsage = async () => {
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
        // Silently fail - logging should not break the app
        console.warn("Failed to log usage:", error);
      }
    };

    logUsage();
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
