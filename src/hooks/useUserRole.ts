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
        const { data: roleData } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (roleData?.role) {
          setRole(roleData.role as UserRole);
        } else {
          // Fallback to profiles table
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

          setRole((profile?.role as UserRole) || "OPERACAO");
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
  const isGestor = role?.startsWith("GESTOR_") || false;

  return { role, loading, isAdmin, isGestor };
}
