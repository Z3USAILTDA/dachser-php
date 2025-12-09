import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/voucher";

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  role: z.string().min(1, "Selecione um perfil"),
});

type FormValues = z.infer<typeof formSchema>;

interface InviteUserDialogProps {
  onUserInvited: () => void;
}

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "OPERACAO", label: "Operação" },
  { value: "FISCAL", label: "Fiscal" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "FINANCEIRO", label: "Financeiro" },
  { value: "GESTOR_OPERACAO", label: "Gestor Operação" },
  { value: "GESTOR_FISCAL", label: "Gestor Fiscal" },
  { value: "GESTOR_SUPERVISOR", label: "Gestor Supervisor" },
  { value: "GESTOR_FINANCEIRO", label: "Gestor Financeiro" },
  { value: "ADMIN", label: "Administrador" },
];

export const InviteUserDialog = ({ onUserInvited }: InviteUserDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "OPERACAO",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

      // Create user via Supabase Auth Admin API (requires service role)
      // For now, we'll use the signUp method which will send a confirmation email
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: values.email,
        password: tempPassword,
        options: {
          data: {
            name: values.name,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create profile entry
        const { error: profileError } = await (supabase as any)
          .from("profiles")
          .insert({
            id: authData.user.id,
            email: values.email,
            name: values.name,
            role: values.role,
            active: true,
          });

        if (profileError) {
          console.error("Erro ao criar perfil:", profileError);
        }

        // Create user_roles entry for proper role management
        const { error: roleError } = await (supabase as any)
          .from("user_roles")
          .insert({
            user_id: authData.user.id,
            role: values.role.toLowerCase(),
          });

        if (roleError) {
          console.error("Erro ao criar role:", roleError);
        }
      }

      toast({
        title: "Convite enviado",
        description: `Um email de confirmação foi enviado para ${values.email}.`,
      });

      form.reset();
      setOpen(false);
      onUserInvited();
    } catch (error: any) {
      console.error("Erro ao convidar usuário:", error);
      toast({
        title: "Erro ao convidar usuário",
        description: error.message || "Ocorreu um erro ao enviar o convite",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar Novo Usuário</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do usuário" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="usuario@empresa.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Perfil</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Enviando..." : "Enviar Convite"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
