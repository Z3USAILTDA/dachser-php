import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { UserRole } from "@/types/voucher";

interface InviteUserDialogProps {
  onUserInvited: () => void;
}

export const InviteUserDialog = ({ onUserInvited }: InviteUserDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("OPERACAO");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleInvite = async () => {
    if (!email || !name) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha e-mail e nome do usuário",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

      // Create user via Edge Function
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email,
          password: tempPassword,
          name,
          role,
        },
      });

      if (error) throw error;

      toast({
        title: "Usuário convidado!",
        description: `E-mail de boas-vindas enviado para ${email}`,
      });

      setOpen(false);
      setEmail("");
      setName("");
      setRole("OPERACAO");
      onUserInvited();
    } catch (error: any) {
      toast({
        title: "Erro ao convidar usuário",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border/50">
        <DialogHeader>
          <DialogTitle>Convidar Novo Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="bg-input/50 border-border/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              className="bg-input/50 border-border/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Perfil</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="bg-input/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-border/50">
            Cancelar
          </Button>
          <Button onClick={handleInvite} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar Convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
