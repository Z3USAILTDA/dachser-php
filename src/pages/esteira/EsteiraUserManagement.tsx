import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Users, ShieldCheck, ShieldX, ArrowLeft, Search, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/voucher";
import dachserBg from "@/assets/dachser-background.jpg";

interface MariaDBUser {
  id: number;
  username: string;
  email: string;
  is_admin: number;
  esteira_role: string | null;
  esteira_active: number | null;
}

const roleLabels: Record<UserRole | "SEM_ACESSO", string> = {
  SEM_ACESSO: "Sem Acesso",
  ADMIN: "Administrador",
  GESTOR_OPERACAO: "Gestor Operação",
  GESTOR_FISCAL: "Gestor Fiscal",
  GESTOR_SUPERVISOR: "Gestor Supervisor",
  GESTOR_FINANCEIRO: "Gestor Financeiro",
  OPERACAO: "Operação",
  FISCAL: "Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
};

const roleColors: Record<UserRole | "SEM_ACESSO", string> = {
  SEM_ACESSO: "bg-[#1a1a1a] text-[#666666] border border-[#333333]",
  ADMIN: "bg-destructive/20 text-destructive border border-destructive/30",
  GESTOR_OPERACAO: "bg-[#ffc800]/20 text-[#ffc800] border border-[#ffc800]/30",
  GESTOR_FISCAL: "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30",
  GESTOR_SUPERVISOR: "bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30",
  GESTOR_FINANCEIRO: "bg-[#06b6d4]/20 text-[#06b6d4] border border-[#06b6d4]/30",
  OPERACAO: "bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30",
  FISCAL: "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30",
  SUPERVISOR: "bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30",
  FINANCEIRO: "bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30",
};

export default function EsteiraUserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<MariaDBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Check if current user is admin from localStorage
  useEffect(() => {
    const userData = localStorage.getItem("dachser_user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setIsAdmin(user.is_admin === 1 || user.is_admin === true);
      } catch {
        setIsAdmin(false);
      }
    }
    setCheckingAdmin(false);
  }, []);

  useEffect(() => {
    if (!checkingAdmin && !isAdmin) {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página",
        variant: "destructive",
      });
      navigate("/fin/esteira");
    }
  }, [isAdmin, checkingAdmin, navigate, toast]);

  useEffect(() => {
    if (isAdmin && !checkingAdmin) {
      fetchUsers();
    }
  }, [isAdmin, checkingAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_esteira_users" },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao carregar usuários");

      setUsers(data.users || []);
    } catch (error: any) {
      console.error("Erro ao carregar usuários:", error);
      toast({
        title: "Erro ao carregar usuários",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "update_esteira_role",
          userId,
          esteira_role: newRole === "SEM_ACESSO" ? null : newRole,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao atualizar role");

      toast({
        title: "Função atualizada",
        description: `A função do usuário foi alterada para ${roleLabels[newRole as UserRole | "SEM_ACESSO"]}`,
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar função",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (userId: number, currentActive: number | null) => {
    const newActive = currentActive !== 1;
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "toggle_esteira_active",
          userId,
          esteira_active: newActive,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao alterar status");

      toast({
        title: newActive ? "Usuário ativado" : "Usuário desativado",
        description: `O usuário foi ${newActive ? "ativado" : "desativado"} na Esteira`,
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getUserRole = (user: MariaDBUser): UserRole | "SEM_ACESSO" => {
    if (!user.esteira_role) return "SEM_ACESSO";
    return user.esteira_role as UserRole;
  };

  const isUserActive = (user: MariaDBUser): boolean => {
    return user.esteira_active === 1;
  };

  // Filter users by search
  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(query) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.esteira_role && user.esteira_role.toLowerCase().includes(query))
    );
  });

  // Stats
  const usersWithRole = users.filter(u => u.esteira_role).length;
  const usersActive = users.filter(u => u.esteira_active === 1).length;

  if (checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050608]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#050608]">
      {/* Background Effects */}
      <div className="pointer-events-none fixed inset-0">
        <img src={dachserBg} alt="" className="w-full h-full object-cover opacity-[0.14]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050608]/90 via-[#050608]/70 to-[#050608]" />
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(ellipse 70% 35% at 50% 0%, rgba(245,184,67,0.10) 0%, transparent 60%),
            radial-gradient(ellipse 55% 25% at 60% 0%, rgba(255,200,0,0.08) 0%, transparent 50%)
          `
        }} />
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 max-w-[95%] mx-auto px-2 pt-5 pb-4 flex items-center justify-between">
        {/* Left - Back + Header */}
        <div className="flex items-center gap-[18px]">
          <button 
            onClick={() => navigate("/fin/esteira")} 
            className="w-8 h-8 rounded-full border border-white/12 bg-[rgba(5,6,18,0.9)] text-white/80 flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
          >
            <ArrowLeft size={16} />
          </button>

          <header>
            <h1 className="text-[1.6rem] tracking-[0.24em] uppercase text-[#f5f5f5]">DACHSER</h1>
            <p className="text-[0.9rem] text-[#aaaaaa] mt-0.5">Gestão de Usuários — Esteira de Vouchers</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc800] shadow-[0_0_10px_rgba(255,200,0,.9)]" />
            </div>
          </header>
        </div>

        {/* Right - Stats */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-full bg-[rgba(0,0,0,.7)] border border-[rgba(255,255,255,.18)]">
            <span className="text-[#aaaaaa] text-[0.8rem]">Total: </span>
            <span className="text-white font-semibold">{users.length}</span>
          </div>
          <div className="px-4 py-2 rounded-full bg-[rgba(0,0,0,.7)] border border-[rgba(255,255,255,.18)]">
            <span className="text-[#aaaaaa] text-[0.8rem]">Com função: </span>
            <span className="text-[#ffc800] font-semibold">{usersWithRole}</span>
          </div>
          <div className="px-4 py-2 rounded-full bg-[rgba(0,0,0,.7)] border border-[rgba(255,255,255,.18)]">
            <span className="text-[#aaaaaa] text-[0.8rem]">Ativos: </span>
            <span className="text-[#10b981] font-semibold">{usersActive}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-[95%] mx-auto px-2 pb-8">
        {/* Card Header */}
        <div className="rounded-t-2xl bg-[rgba(5,6,18,0.9)] border border-b-0 border-[rgba(255,255,255,0.12)] p-5 backdrop-blur-[18px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#ffc800]/10 border border-[#ffc800]/30 flex items-center justify-center">
                <UserCog className="h-6 w-6 text-[#ffc800]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Controle de Permissões</h2>
                <p className="text-sm text-[#888888]">
                  Defina a função de cada usuário para acesso à Esteira de Vouchers
                </p>
              </div>
            </div>
            
            {/* Search */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666666]" />
              <Input
                placeholder="Buscar usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#0a0b10] border-white/10 rounded-full text-white placeholder:text-[#666666]"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-b-2xl bg-[rgba(5,6,18,0.9)] border border-t-0 border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/10 hover:bg-transparent">
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider">Usuário</TableHead>
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider">Admin Sistema</TableHead>
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider">Função Esteira</TableHead>
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[#888888] font-medium text-xs uppercase tracking-wider text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-[#666666]">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Nenhum usuário encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user, index) => {
                    const userRole = getUserRole(user);
                    const userActive = isUserActive(user);
                    
                    return (
                      <TableRow 
                        key={user.id} 
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors animate-fade-in"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <TableCell className="font-medium text-white">{user.username}</TableCell>
                        <TableCell className="text-[#888888]">{user.email || "-"}</TableCell>
                        <TableCell>
                          {user.is_admin === 1 ? (
                            <Badge className="bg-destructive/20 text-destructive border border-destructive/30">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <span className="text-[#444444]">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={roleColors[userRole]}>
                            {roleLabels[userRole]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {userRole === "SEM_ACESSO" ? (
                            <span className="text-[#444444]">-</span>
                          ) : (
                            <Badge 
                              className={
                                userActive 
                                  ? "bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30" 
                                  : "bg-[#1a1a1a] text-[#666666] border border-[#333333]"
                              }
                            >
                              {userActive ? "Ativo" : "Inativo"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Select
                              value={userRole}
                              onValueChange={(value) => handleRoleChange(user.id, value)}
                            >
                              <SelectTrigger className="w-[160px] bg-[#0a0b10] border-white/10 rounded-lg text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0a0b10] border-white/10">
                                <SelectItem value="SEM_ACESSO">Sem Acesso</SelectItem>
                                <SelectItem value="OPERACAO">Operação</SelectItem>
                                <SelectItem value="FISCAL">Fiscal</SelectItem>
                                <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                                <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                                <SelectItem value="GESTOR_OPERACAO">Gestor Operação</SelectItem>
                                <SelectItem value="GESTOR_FISCAL">Gestor Fiscal</SelectItem>
                                <SelectItem value="GESTOR_SUPERVISOR">Gestor Supervisor</SelectItem>
                                <SelectItem value="GESTOR_FINANCEIRO">Gestor Financeiro</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            {userRole !== "SEM_ACESSO" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleActive(user.id, user.esteira_active)}
                                className={`border-white/10 rounded-lg ${
                                  userActive 
                                    ? 'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30' 
                                    : 'hover:bg-[#10b981]/10 hover:text-[#10b981] hover:border-[#10b981]/30'
                                }`}
                              >
                                {userActive ? (
                                  <>
                                    <ShieldX className="h-3 w-3 mr-1" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                    Ativar
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 rounded-xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-5 backdrop-blur-[18px]">
          <h3 className="text-sm font-semibold text-white mb-3">Sobre as Funções</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
              <Badge className={roleColors.OPERACAO + " mb-2"}>Operação</Badge>
              <p className="text-[#888888]">Cria e gerencia vouchers</p>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
              <Badge className={roleColors.FISCAL + " mb-2"}>Fiscal</Badge>
              <p className="text-[#888888]">Valida documentos fiscais</p>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
              <Badge className={roleColors.SUPERVISOR + " mb-2"}>Supervisor</Badge>
              <p className="text-[#888888]">Aprova urgências reais</p>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
              <Badge className={roleColors.FINANCEIRO + " mb-2"}>Financeiro</Badge>
              <p className="text-[#888888]">Processa pagamentos</p>
            </div>
            <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
              <Badge className={roleColors.ADMIN + " mb-2"}>Admin</Badge>
              <p className="text-[#888888]">Acesso total ao sistema</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10 text-center text-[10px] text-[#888888] uppercase tracking-[0.16em] pb-6">
        Z3US.AI • For Logistics
      </div>
    </div>
  );
}
