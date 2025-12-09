import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/voucher";

interface UserWithRole {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: UserRole;
  created_at: string;
}

const roleLabels: Record<UserRole, string> = {
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

const roleColors: Record<UserRole, string> = {
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
  const { role, loading: roleLoading, isAdmin } = useUserRole();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página",
        variant: "destructive",
      });
      navigate("/fin/esteira");
    }
  }, [isAdmin, roleLoading, navigate, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      const { data: profilesData, error: profilesError } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: rolesData, error: rolesError } = await (supabase as any)
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const usersWithRoles = (profilesData || []).map((profile: any) => {
        const userRole = (rolesData || []).find((r: any) => r.user_id === profile.id);
        const rawRole = userRole?.role || profile.role;
        
        let validRole: UserRole = rawRole as UserRole;
        if (rawRole === "GESTOR") {
          validRole = "GESTOR_OPERACAO";
        }
        
        return {
          id: profile.id,
          name: profile.name || profile.email || "Usuário",
          email: profile.email || "",
          active: profile.active !== false,
          role: validRole || "OPERACAO",
          created_at: profile.created_at,
        };
      });

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar usuários",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const { error: roleError } = await (supabase as any)
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (roleError) throw roleError;

      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (profileError) throw profileError;

      toast({
        title: "Role atualizado",
        description: "O papel do usuário foi alterado com sucesso",
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ active: !currentActive })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: currentActive ? "Usuário desativado" : "Usuário ativado",
        description: `O usuário foi ${currentActive ? "desativado" : "ativado"} com sucesso`,
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

  if (roleLoading || !isAdmin) {
    return (
      <PageLayout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader 
        title="Gestão de Usuários"
        subtitle="Gerencie usuários e suas permissões no sistema"
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
                  <CardTitle>Usuários do Sistema</CardTitle>
                  <CardDescription>
                    Gerencie permissões dos usuários
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
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Criação</TableHead>
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
                      users.map((user, index) => (
                        <TableRow 
                          key={user.id} 
                          className="even:bg-muted/20 hover:bg-muted/30 transition-colors animate-fade-in"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell className="text-muted-foreground">{user.email}</TableCell>
                          <TableCell>
                            <Badge className={roleColors[user.role]}>
                              {roleLabels[user.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.active ? "default" : "secondary"} className={user.active ? "bg-success text-success-foreground" : ""}>
                              {user.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "-"}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Select
                              value={user.role}
                              onValueChange={(value: UserRole) => handleRoleChange(user.id, value)}
                            >
                              <SelectTrigger className="w-[140px] inline-flex bg-input/50 border-border/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border/50">
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleActive(user.id, user.active)}
                              className="border-border/50 hover:bg-muted/50"
                            >
                              {user.active ? "Desativar" : "Ativar"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
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
