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
        // Check if user is logged in via DACHSER (MariaDB) - check both keys
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
        console.log("[useUserRole] storedUser:", storedUser);
        
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          console.log("[useUserRole] parsed user:", parsed);
          console.log("[useUserRole] is_admin:", parsed.is_admin, "type:", typeof parsed.is_admin);
          
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
          console.log("[useUserRole] isAdminUser:", isAdminUser);
          
          // For MariaDB users, use is_admin to determine role
          if (isAdminUser) {
            console.log("[useUserRole] Setting role to ADMIN");
            setRole("ADMIN");
            setEsteiraActive(true);
          } else {
            console.log("[useUserRole] Setting role to OPERACAO");
            // Non-admin users get OPERACAO role by default
            setRole("OPERACAO");
            setEsteiraActive(true);
          }
          setLoading(false);
          return;
        }
        
        console.log("[useUserRole] No storedUser found, checking Supabase auth");

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
