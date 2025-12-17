import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [esteiraActive, setEsteiraActive] = useState<boolean>(false);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        // Check if user is logged in via DACHSER (MariaDB)
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
        
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const userId = parsed.id;
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
          
          // Fetch esteira role from database
          try {
            const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
              body: { action: "get_user_esteira_role", userId },
            });
            
            if (!error && data?.success) {
              const esteiraRole = data.esteira_role as UserRole | null;
              const active = data.esteira_active === 1;
              
              if (esteiraRole) {
                setRole(esteiraRole);
                setEsteiraActive(active);
              } else if (isAdminUser) {
                // Admin users always have access even without explicit esteira_role
                setRole("ADMIN");
                setEsteiraActive(true);
              } else {
                setRole(null);
                setEsteiraActive(false);
              }
            } else {
              // If fetch fails, fallback to is_admin check
              if (isAdminUser) {
                setRole("ADMIN");
                setEsteiraActive(true);
              } else {
                setRole(null);
                setEsteiraActive(false);
              }
            }
          } catch (fetchErr) {
            console.error("Error fetching esteira role:", fetchErr);
            // Fallback to is_admin
            if (isAdminUser) {
              setRole("ADMIN");
              setEsteiraActive(true);
            } else {
              setRole(null);
              setEsteiraActive(false);
            }
          }
          setLoading(false);
          return;
        }

        // Check Supabase auth (fallback)
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setRole(null);
          setEsteiraActive(false);
          setLoading(false);
          return;
        }

        // Try to get role from user_roles table
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (roleData?.role) {
          setRole(roleData.role as UserRole);
          setEsteiraActive(true);
        } else {
          setRole("OPERACAO");
          setEsteiraActive(true);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        // Fallback to localStorage check for admin
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === true;
          if (isAdminUser) {
            setRole("ADMIN");
            setEsteiraActive(true);
          } else {
            setRole(null);
            setEsteiraActive(false);
          }
        } else {
          setRole(null);
          setEsteiraActive(false);
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
