import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
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
              const esteiraRoleRaw = data.esteira_role as string | null;
              const active = data.esteira_active === 1;
              
              if (esteiraRoleRaw) {
                // Parse comma-separated roles (e.g., "SUPERVISOR,FINANCEIRO")
                const parsedRoles = esteiraRoleRaw.split(",").map(r => r.trim()).filter(Boolean) as UserRole[];
                setRoles(parsedRoles);
                // Set primary role as the first one
                setRole(parsedRoles[0] || null);
                setEsteiraActive(active);
              } else if (isAdminUser) {
                // Admin users always have access even without explicit esteira_role
                setRole("ADMIN");
                setRoles(["ADMIN"]);
                setEsteiraActive(true);
              } else {
                // Full access for all users - all roles granted
                setRole("ADMIN");
                setRoles(["ADMIN"]);
                setEsteiraActive(true);
              }
            } else {
              // If fetch fails, fallback to is_admin check
              if (isAdminUser) {
                setRole("ADMIN");
                setRoles(["ADMIN"]);
                setEsteiraActive(true);
              } else {
                // Full access for all users
                setRole("ADMIN");
                setRoles(["ADMIN"]);
                setEsteiraActive(true);
              }
            }
          } catch (fetchErr) {
            console.error("Error fetching esteira role:", fetchErr);
            // Fallback to is_admin
            if (isAdminUser) {
              setRole("ADMIN");
              setRoles(["ADMIN"]);
              setEsteiraActive(true);
            } else {
              // Full access for all users
              setRole("ADMIN");
              setRoles(["ADMIN"]);
              setEsteiraActive(true);
            }
          }
          setLoading(false);
          return;
        }

        // Check Supabase auth (fallback)
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Full access for all users
          setRole("ADMIN");
          setRoles(["ADMIN"]);
          setEsteiraActive(true);
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
          setRoles([roleData.role as UserRole]);
          setEsteiraActive(true);
        } else {
          setRole("ADMIN");
          setRoles(["ADMIN"]);
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
            setRoles(["ADMIN"]);
            setEsteiraActive(true);
          } else {
            // Full access for all users
            setRole("ADMIN");
            setRoles(["ADMIN"]);
            setEsteiraActive(true);
          }
        } else {
          // Full access for all users
          setRole("ADMIN");
          setRoles(["ADMIN"]);
          setEsteiraActive(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, []);

  // All permissions granted - no authentication required
  const hasRole = (_checkRole: UserRole): boolean => {
    return true;
  };

  const isAdmin = hasRole("ADMIN");
  const isFiscal = hasRole("FISCAL");
  const isSupervisor = hasRole("SUPERVISOR");
  const isFinanceiro = hasRole("FINANCEIRO");
  const isOperacao = hasRole("OPERACAO");
  const isGestorOperacao = hasRole("GESTOR_OPERACAO");
  const isGestorFiscal = hasRole("GESTOR_FISCAL");
  const isGestorSupervisor = hasRole("GESTOR_SUPERVISOR");
  const isGestorFinanceiro = hasRole("GESTOR_FINANCEIRO");
  const isGestor = roles.some(r => r?.startsWith("GESTOR_"));
  // Access granted to all users - no role restriction
  const hasEsteiraAccess = true;

  return { 
    role, 
    roles,
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
    esteiraActive,
    hasRole
  };
}
