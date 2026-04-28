import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/verify-code",
  "/reset-password",
  "/supervisor-confirmacao",
]);

/**
 * Monitora inatividade global. Após 20 min sem interação,
 * encerra a sessão e redireciona para /login?reason=inactivity.
 */
export const InactivityGuard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicRoute = PUBLIC_PATHS.has(location.pathname);
  const enabled = !!user && !isPublicRoute;

  useInactivityTimeout({
    enabled,
    timeoutMs: 20 * 60 * 1000,
    warningLeadMs: 60 * 1000,
    onWarning: () => {
      toast({
        title: "Sessão prestes a expirar",
        description: "Sua sessão será encerrada em 1 minuto por inatividade.",
      });
    },
    onTimeout: async () => {
      try {
        await supabase.auth.signOut();
      } catch (_) {
        // ignora — o relevante é limpar e redirecionar
      }
      localStorage.removeItem("user");
      navigate("/login?reason=inactivity", { replace: true });
    },
  });

  return null;
};
