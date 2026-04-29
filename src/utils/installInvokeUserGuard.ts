import { supabase } from "@/integrations/supabase/client";

/**
 * Modo emergencial: injeta requesterUsername em TODA chamada ao mariadb-proxy
 * a partir do localStorage.user. O proxy usa esse campo para bloquear quem
 * não for cleiciane.faconi (exceto ações de auth).
 */
let installed = false;

export function installInvokeUserGuard() {
  if (installed) return;
  installed = true;

  const fns: any = supabase.functions;
  const original = fns.invoke.bind(fns);

  fns.invoke = async (functionName: string, options: any = {}) => {
    try {
      if (functionName === "mariadb-proxy") {
        const stored = localStorage.getItem("user");
        if (stored) {
          const u = JSON.parse(stored);
          const username = u?.username || u?.email?.split("@")[0];
          if (username) {
            options = {
              ...options,
              body: {
                ...(options?.body ?? {}),
                requesterUsername:
                  options?.body?.requesterUsername ?? username,
              },
            };
          }
        }
      }
    } catch {
      // silencioso
    }
    return original(functionName, options);
  };
}
