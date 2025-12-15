import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [esteiraActive, setEsteiraActive] = useState<boolean>(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        // First check if user is logged in via DACHSER (MariaDB)
        const dachserUser = localStorage.getItem("dachser_user");
        if (dachserUser) {
          const parsed = JSON.parse(dachserUser);
          
          // Fetch esteira role from MariaDB
          try {
            const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
              body: { action: "get_user", userId: parsed.id },
            });
            
            if (data?.success && data.user) {
              // Check if user has esteira_role set
              if (data.user.esteira_role) {
                setRole(data.user.esteira_role as UserRole);
                setEsteiraActive(data.user.esteira_active === 1);
              } else if (parsed.is_admin === 1 || parsed.is_admin === true) {
                // Admin system users get ADMIN role
                setRole("ADMIN");
                setEsteiraActive(true);
              } else {
                // No esteira role assigned
                setRole(null);
                setEsteiraActive(false);
              }
            } else {
              // Fallback to is_admin check
              if (parsed.is_admin === 1 || parsed.is_admin === true) {
                setRole("ADMIN");
              } else {
                setRole(null);
              }
            }
          } catch (apiError) {
            console.error("Error fetching esteira role from MariaDB:", apiError);
            // Fallback: admin users get ADMIN, others get null
            if (parsed.is_admin === 1 || parsed.is_admin === true) {
              setRole("ADMIN");
            } else {
              setRole(null);
            }
          }
          setLoading(false);
          return;
        }

        // Check Supabase auth
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Try localStorage fallback for older sessions
          const storedUser = localStorage.getItem("user");
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setRole(parsed.is_admin === 1 ? "ADMIN" : "OPERACAO");
          } else {
            setRole(null);
          }
          setLoading(false);
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
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === true;
          setRole(isAdminUser ? "ADMIN" : null);
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
  const hasEsteiraAccess = role !== null && esteiraActive;

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
    isGestor,
    hasEsteiraAccess,
    esteiraActive
  };
}
