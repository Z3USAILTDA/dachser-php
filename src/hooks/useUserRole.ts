import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [esteiraActive, setEsteiraActive] = useState<boolean>(false);

  useEffect(() => {
    const ROLE_CACHE_KEY = "esteira_role_cache_v1";
    const ROLE_CACHE_TTL_MS = 60_000;

    const applyRoleData = (
      esteiraRoleRaw: string | null,
      active: boolean,
      isAdminUser: boolean,
    ) => {
      if (esteiraRoleRaw) {
        const parsedRoles = esteiraRoleRaw.split(",").map(r => r.trim()).filter(Boolean) as UserRole[];
        setRoles(parsedRoles);
        setRole(parsedRoles[0] || null);
        setEsteiraActive(active);
      } else if (isAdminUser) {
        setRole("ADMIN");
        setRoles(["ADMIN"]);
        setEsteiraActive(true);
      } else {
        setRole(null);
        setRoles([]);
        setEsteiraActive(false);
      }
    };

    const fetchRole = async () => {
      try {
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");

        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const userId = parsed.id;
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;

          // 1) Tenta cache de sessão (evita chamada ao MariaDB a cada navegação)
          try {
            const cachedRaw = sessionStorage.getItem(ROLE_CACHE_KEY);
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              if (
                cached &&
                cached.userId === userId &&
                typeof cached.timestamp === "number" &&
                Date.now() - cached.timestamp < ROLE_CACHE_TTL_MS
              ) {
                applyRoleData(cached.esteiraRoleRaw ?? null, !!cached.active, isAdminUser);
                setLoading(false);
                return;
              }
            }
          } catch {
            // ignora cache corrompido
          }

          // 2) Busca esteira role do banco
          try {
            const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
              body: { action: "get_user_esteira_role", userId },
            });

            if (!error && data?.success) {
              const esteiraRoleRaw = data.esteira_role as string | null;
              const active = data.esteira_active === 1;

              applyRoleData(esteiraRoleRaw, active, isAdminUser);

              try {
                sessionStorage.setItem(
                  ROLE_CACHE_KEY,
                  JSON.stringify({ userId, esteiraRoleRaw, active, timestamp: Date.now() }),
                );
              } catch {
                // sessionStorage cheio / indisponível — segue sem cache
              }
            } else {
              if (isAdminUser) {
                setRole("ADMIN");
                setRoles(["ADMIN"]);
                setEsteiraActive(true);
              } else {
                setRole(null);
                setRoles([]);
                setEsteiraActive(false);
              }
            }
          } catch (fetchErr) {
            console.error("Error fetching esteira role:", fetchErr);
            if (isAdminUser) {
              setRole("ADMIN");
              setRoles(["ADMIN"]);
              setEsteiraActive(true);
            } else {
              setRole(null);
              setRoles([]);
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
          setRoles([]);
          setEsteiraActive(false);
          setLoading(false);
          return;
        }

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
          setRole(null);
          setRoles([]);
          setEsteiraActive(false);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const isAdminUser = parsed.is_admin === 1 || parsed.is_admin === true;
          if (isAdminUser) {
            setRole("ADMIN");
            setRoles(["ADMIN"]);
            setEsteiraActive(true);
          } else {
            setRole(null);
            setRoles([]);
            setEsteiraActive(false);
          }
        } else {
          setRole(null);
          setRoles([]);
          setEsteiraActive(false);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, []);

  // Check if user has a specific role
  const hasRole = (checkRole: UserRole): boolean => {
    return roles.includes(checkRole);
  };

  // Role flags
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

  // Permission checks based on role hierarchy
  // ADMIN: acesso total
  // SUPERVISOR/FINANCEIRO: acesso total (podem fazer tudo que os outros fazem)
  // OPERACAO: criar e gerenciar vouchers, anexar documentos
  // FISCAL: validar documentos fiscais, aprovar etapa fiscal

  // Verifica se pode acessar a esteira
  const hasEsteiraAccess = esteiraActive && (
    isAdmin || isSupervisor || isFinanceiro || isOperacao || isFiscal || isGestor
  );

  // Verifica se pode criar vouchers (Operação, Supervisor, Financeiro, Admin)
  const canCreateVoucher = isAdmin || isSupervisor || isFinanceiro || isOperacao;

  // Verifica se pode editar vouchers (Operação, Supervisor, Financeiro, Admin)
  const canEditVoucher = isAdmin || isSupervisor || isFinanceiro || isOperacao;

  // Verifica se pode deletar vouchers (Supervisor, Financeiro, Admin)
  const canDeleteVoucher = isAdmin || isSupervisor || isFinanceiro;

  // Verifica se pode aprovar etapa fiscal (Fiscal, Supervisor, Financeiro, Admin)
  const canApproveFiscal = isAdmin || isSupervisor || isFinanceiro || isFiscal;

  // Verifica se pode aprovar etapa supervisor (Supervisor, Financeiro, Admin)
  const canApproveSupervisor = isAdmin || isSupervisor || isFinanceiro;

  // Verifica se pode processar pagamentos (Financeiro, Admin)
  const canProcessPayment = isAdmin || isFinanceiro;

  // Verifica se pode gerenciar baixas (Financeiro, Admin)
  const canManageBaixa = isAdmin || isFinanceiro;

  // Verifica se pode anexar documentos (Operação, Supervisor, Financeiro, Admin)
  const canAttachDocuments = isAdmin || isSupervisor || isFinanceiro || isOperacao;

  // Verifica se pode autorizar exceções (Supervisor, Financeiro, Admin)
  const canAuthorizeExceptions = isAdmin || isSupervisor || isFinanceiro;

  // Verifica se pode voltar etapa (Admin, Supervisor, Financeiro)
  const canGoBackStage = isAdmin || isSupervisor || isFinanceiro;

  // Verifica se pode cancelar voucher (Admin, Supervisor, Financeiro)
  const canCancelVoucher = isAdmin || isSupervisor || isFinanceiro || isOperacao || isFiscal;

  // Verifica se pode desmembrar voucher master (Admin, Supervisor, Financeiro)
  const canDisassembleMaster = isAdmin || isSupervisor || isFinanceiro;

  // Verifica se pode gerenciar usuários (Admin apenas)
  const canManageUsers = isAdmin;

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
    hasRole,
    // Permission checks
    canCreateVoucher,
    canEditVoucher,
    canDeleteVoucher,
    canApproveFiscal,
    canApproveSupervisor,
    canProcessPayment,
    canManageBaixa,
    canAttachDocuments,
    canAuthorizeExceptions,
    canGoBackStage,
    canCancelVoucher,
    canDisassembleMaster,
    canManageUsers,
  };
}
