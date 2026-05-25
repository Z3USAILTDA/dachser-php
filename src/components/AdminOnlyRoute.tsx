import { ReactNode, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface AdminOnlyRouteProps {
  children: ReactNode;
}

function checkIsAdmin(): boolean {
  try {
    const raw = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
  } catch {
    return false;
  }
}

export function AdminOnlyRoute({ children }: AdminOnlyRouteProps) {
  const isAdmin = checkIsAdmin();
  const toastedRef = useRef(false);

  useEffect(() => {
    if (!isAdmin && !toastedRef.current) {
      toastedRef.current = true;
      toast({
        title: "Acesso restrito",
        description: "Esta tela está disponível apenas para administradores.",
        variant: "destructive",
      });
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
