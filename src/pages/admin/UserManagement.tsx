import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Shield, UserCheck, UserX, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EsteiraRole = "OPERACAO" | "FISCAL" | "SUPERVISOR" | "FINANCEIRO" | "ADMIN" | "SEM_ACESSO";

interface MariaDBUser {
  id: number;
  username: string;
  email: string;
  is_admin: number;
  esteira_role: EsteiraRole | null;
  esteira_active: number;
}

const roleLabels: Record<EsteiraRole, string> = {
  OPERACAO: "Operação",
  FISCAL: "Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ADMIN: "Administrador",
  SEM_ACESSO: "Sem Acesso",
};

const roleColors: Record<EsteiraRole, string> = {
  OPERACAO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FISCAL: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  SUPERVISOR: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  FINANCEIRO: "bg-green-500/20 text-green-400 border-green-500/30",
  ADMIN: "bg-red-500/20 text-red-400 border-red-500/30",
  SEM_ACESSO: "bg-muted text-muted-foreground border-muted",
};

const UserManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<MariaDBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const adminStatus = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
      setIsAdmin(adminStatus);
      if (!adminStatus) {
        toast.error("Acesso não autorizado");
        navigate("/dashboard");
      }
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_all_users_esteira" },
      });

      if (error) throw error;
      if (data.users) {
        setUsers(data.users);
      }
    } catch (err: any) {
      console.error("Error fetching users:", err);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: EsteiraRole) => {
    try {
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_user_esteira_role",
          userId,
          esteira_role: newRole === "SEM_ACESSO" ? null : newRole,
        },
      });

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, esteira_role: newRole === "SEM_ACESSO" ? null : newRole }
            : u
        )
      );
      toast.success("Função atualizada com sucesso");
    } catch (err: any) {
      console.error("Error updating role:", err);
      toast.error("Erro ao atualizar função");
    }
  };

  const handleToggleActive = async (userId: number, currentActive: number) => {
    const newActive = currentActive === 1 ? 0 : 1;
    try {
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_user_esteira_active",
          userId,
          esteira_active: newActive,
        },
      });

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, esteira_active: newActive } : u))
      );
      toast.success(newActive === 1 ? "Usuário ativado" : "Usuário desativado");
    } catch (err: any) {
      console.error("Error toggling active:", err);
      toast.error("Erro ao alterar status");
    }
  };

  const getUserRole = (user: MariaDBUser): EsteiraRole => {
    return user.esteira_role || "SEM_ACESSO";
  };

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statsTotal = users.length;
  const statsWithRole = users.filter((u) => u.esteira_role).length;
  const statsActive = users.filter((u) => u.esteira_active === 1).length;

  return (
    <PageLayout
      title="Gerenciamento de Usuários"
      subtitle="Defina funções para a Esteira de Vouchers"
      backTo="/dashboard"
    >
      <div className="max-w-6xl mx-auto space-y-6 p-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PageCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{statsTotal}</p>
                <p className="text-xs text-muted-foreground">Total de Usuários</p>
              </div>
            </div>
          </PageCard>

          <PageCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{statsWithRole}</p>
                <p className="text-xs text-muted-foreground">Com Função Esteira</p>
              </div>
            </div>
          </PageCard>

          <PageCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{statsActive}</p>
                <p className="text-xs text-muted-foreground">Usuários Ativos</p>
              </div>
            </div>
          </PageCard>
        </div>

        {/* Search and Refresh */}
        <PageCard className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background/50 border-border/50"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </PageCard>

        {/* Users Table */}
        <PageCard className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Usuário</TableHead>
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Admin Sistema</TableHead>
                  <TableHead className="text-muted-foreground">Função Esteira</TableHead>
                  <TableHead className="text-muted-foreground">Status Esteira</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const currentRole = getUserRole(user);
                  return (
                    <TableRow key={user.id} className="border-border/20">
                      <TableCell className="font-medium text-foreground">
                        @{user.username}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email || "-"}
                      </TableCell>
                      <TableCell>
                        {user.is_admin === 1 ? (
                          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
                            Admin
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={currentRole}
                          onValueChange={(value) =>
                            handleRoleChange(user.id, value as EsteiraRole)
                          }
                        >
                          <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                            <SelectValue>
                              <Badge className={`${roleColors[currentRole]} border`}>
                                {roleLabels[currentRole]}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SEM_ACESSO">
                              <Badge className={`${roleColors.SEM_ACESSO} border`}>
                                Sem Acesso
                              </Badge>
                            </SelectItem>
                            <SelectItem value="OPERACAO">
                              <Badge className={`${roleColors.OPERACAO} border`}>
                                Operação
                              </Badge>
                            </SelectItem>
                            <SelectItem value="FISCAL">
                              <Badge className={`${roleColors.FISCAL} border`}>
                                Fiscal
                              </Badge>
                            </SelectItem>
                            <SelectItem value="SUPERVISOR">
                              <Badge className={`${roleColors.SUPERVISOR} border`}>
                                Supervisor
                              </Badge>
                            </SelectItem>
                            <SelectItem value="FINANCEIRO">
                              <Badge className={`${roleColors.FINANCEIRO} border`}>
                                Financeiro
                              </Badge>
                            </SelectItem>
                            <SelectItem value="ADMIN">
                              <Badge className={`${roleColors.ADMIN} border`}>
                                Administrador
                              </Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(user.id, user.esteira_active)}
                          className={`gap-2 ${
                            user.esteira_active === 1
                              ? "text-green-400 hover:text-green-300"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {user.esteira_active === 1 ? (
                            <>
                              <UserCheck className="w-4 h-4" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <UserX className="w-4 h-4" />
                              Inativo
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </PageCard>

        {/* Info Card */}
        <PageCard className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Funções da Esteira de Vouchers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="font-medium text-blue-400">Operação:</span>
              <p className="text-muted-foreground mt-1">Cria e gerencia vouchers, anexa documentos</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <span className="font-medium text-purple-400">Fiscal:</span>
              <p className="text-muted-foreground mt-1">Valida documentos fiscais, aprova etapa fiscal</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="font-medium text-amber-400">Supervisor:</span>
              <p className="text-muted-foreground mt-1">Aprova vouchers urgentes, autoriza exceções</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="font-medium text-green-400">Financeiro:</span>
              <p className="text-muted-foreground mt-1">Processa pagamentos, gerencia baixas</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="font-medium text-red-400">Administrador:</span>
              <p className="text-muted-foreground mt-1">Acesso total a todas as funções da esteira</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <span className="font-medium text-muted-foreground">Sem Acesso:</span>
              <p className="text-muted-foreground mt-1">Usuário não pode acessar a Esteira</p>
            </div>
          </div>
        </PageCard>
      </div>
    </PageLayout>
  );
};

export default UserManagement;
