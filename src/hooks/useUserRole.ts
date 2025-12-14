import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Try localStorage fallback for MariaDB users
          const storedUser = localStorage.getItem("user");
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setRole(parsed.is_admin === 1 ? "ADMIN" : "OPERACAO");
          } else {
            setRole(null);
          }
          return;
        }

        // Try to get role from user_roles table first
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (roleData?.role) {
          setRole(roleData.role as UserRole);
        } else {
          // Fallback to profiles table
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          setRole("OPERACAO");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        // Fallback to localStorage
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setRole(parsed.is_admin === 1 ? "ADMIN" : "OPERACAO");
        } else {
          setRole(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, []);

  const isAdmin = role === "ADMIN";
  const isFiscal = role === "FISCAL";
  const isSupervisor = role === "SUPERVISOR";
  const isFinanceiro = role === "FINANCEIRO";
  const isOperacao = role === "OPERACAO";
  const isGestorOperacao = role === "GESTOR_OPERACAO";
  const isGestorFiscal = role === "GESTOR_FISCAL";
  const isGestorSupervisor = role === "GESTOR_SUPERVISOR";
  const isGestorFinanceiro = role === "GESTOR_FINANCEIRO";
  const isGestor = role?.startsWith("GESTOR_") || false;

  return { 
    role, 
    loading, 
    isAdmin,
    isFiscal,
    isSupervisor,
    isFinanceiro,
    isOperacao,
    isGestorOperacao,
    isGestorFiscal,
    isGestorSupervisor,
    isGestorFinanceiro,
    isGestor 
  };
}
