import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, ShieldCheck, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/voucher";

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
  SEM_ACESSO: "bg-muted text-muted-foreground",
  ADMIN: "bg-destructive text-destructive-foreground",
  GESTOR_OPERACAO: "bg-primary/80 text-primary-foreground",
  GESTOR_FISCAL: "bg-primary/70 text-primary-foreground",
  GESTOR_SUPERVISOR: "bg-primary/60 text-primary-foreground",
  GESTOR_FINANCEIRO: "bg-primary/90 text-primary-foreground",
  OPERACAO: "bg-info text-info-foreground",
  FISCAL: "bg-warning text-warning-foreground",
  SUPERVISOR: "bg-primary text-primary-foreground",
  FINANCEIRO: "bg-success text-success-foreground",
};

export default function EsteiraUserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<MariaDBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
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

  if (checkingAdmin || !isAdmin) {
    return (
      <PageLayout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  const getUserRole = (user: MariaDBUser): UserRole | "SEM_ACESSO" => {
    if (!user.esteira_role) return "SEM_ACESSO";
    return user.esteira_role as UserRole;
  };

  const isUserActive = (user: MariaDBUser): boolean => {
    return user.esteira_active === 1;
  };

  return (
    <PageLayout>
      <PageHeader 
        title="Gestão de Usuários - Esteira"
        subtitle="Gerencie usuários e suas permissões no sistema de vouchers"
      />
      
      <main className="container mx-auto px-4 py-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Usuários do Sistema DACHSER</CardTitle>
                  <CardDescription>
                    Defina a função de cada usuário para acesso à Esteira de Vouchers
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Usuário</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Admin Sistema</TableHead>
                      <TableHead>Função Esteira</TableHead>
                      <TableHead>Status Esteira</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user, index) => {
                        const userRole = getUserRole(user);
                        const userActive = isUserActive(user);
                        
                        return (
                          <TableRow 
                            key={user.id} 
                            className="even:bg-muted/20 hover:bg-muted/30 transition-colors animate-fade-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell className="text-muted-foreground">{user.email || "-"}</TableCell>
                            <TableCell>
                              {user.is_admin === 1 ? (
                                <Badge className="bg-destructive text-destructive-foreground">
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Admin
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={roleColors[userRole]}>
                                {roleLabels[userRole]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {userRole === "SEM_ACESSO" ? (
                                <span className="text-muted-foreground text-sm">-</span>
                              ) : (
                                <Badge 
                                  variant={userActive ? "default" : "secondary"} 
                                  className={userActive ? "bg-success text-success-foreground" : ""}
                                >
                                  {userActive ? "Ativo" : "Inativo"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Select
                                value={userRole}
                                onValueChange={(value) => handleRoleChange(user.id, value)}
                              >
                                <SelectTrigger className="w-[160px] inline-flex bg-input/50 border-border/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border/50">
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
                                  className="border-border/50 hover:bg-muted/50"
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
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </PageLayout>
  );
}
