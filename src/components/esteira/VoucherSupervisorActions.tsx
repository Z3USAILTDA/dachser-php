import { useState } from "react";
import { Voucher } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VoucherSupervisorActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherSupervisorActions = ({ voucher, onUpdate }: VoucherSupervisorActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [comentarios, setComentarios] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const { toast } = useToast();

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  const handleAprovar = async () => {
    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "FINANCEIRO",
          status_financeiro: "APROVADO",
          aprovado_por_user_id: userData.id?.toString(),
          responsavel_supervisor_user_id: userData.id?.toString(),
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "APROVADO_SUPERVISOR",
          detalhe: "Voucher/SPO urgente aprovado pelo Supervisor",
        },
      });

      toast({
        title: "Voucher/SPO aprovado",
        description: "Voucher/SPO urgente aprovado e enviado para Financeiro",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar voucher/SPO",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowApproveDialog(false);
    }
  };

  const handleRejeitar = async () => {
    if (!comentarios.trim()) {
      toast({
        title: "Comentário obrigatório",
        description: "Informe o motivo da rejeição",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const userData = getUserData();

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          etapa_atual: "OPERACAO",
          status_financeiro: "REJEITADO",
          ajuste_operacao: `REJEITADO PELO SUPERVISOR: ${comentarios}`,
          responsavel_supervisor_user_id: userData.id?.toString(),
        },
      });

      if (error) throw error;

      // Log the action
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: "REJEITADO_SUPERVISOR",
          detalhe: `Voucher/SPO rejeitado: ${comentarios}`,
        },
      });

      // OPERACAO não recebe e-mail (quem inicia o processo)

      toast({
        title: "Voucher/SPO rejeitado",
        description: "Voucher/SPO rejeitado e devolvido para Operação",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao rejeitar voucher/SPO",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowRejectDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Ações - Supervisor</h3>
        <p className="text-sm text-muted-foreground">
          Aprovar ou rejeitar voucher/SPO marcado como urgente real
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-sm font-medium text-amber-600 mb-1">
          Voucher/SPO Urgente Real
        </p>
        <p className="text-sm text-muted-foreground">
          Este voucher/SPO foi marcado como urgente e requer aprovação do supervisor antes de prosseguir para o financeiro.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => setShowApproveDialog(true)}
          disabled={loading}
          className="gap-2 bg-green-600 hover:bg-green-600/90"
        >
          <CheckCircle2 className="h-4 w-4" />
          Aprovar e Enviar ao Financeiro
        </Button>

        <Button
          onClick={() => setShowRejectDialog(true)}
          disabled={loading}
          variant="outline"
          className="gap-2 border-destructive text-destructive hover:bg-destructive/10"
        >
          <XCircle className="h-4 w-4" />
          Rejeitar
        </Button>
      </div>

      {/* Dialog de Aprovação */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar aprovação</AlertDialogTitle>
            <AlertDialogDescription>
              Ao aprovar, o voucher/SPO será enviado para o Financeiro com prioridade urgente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAprovar} disabled={loading}>
              {loading ? "Aprovando..." : "Confirmar Aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Rejeição */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar voucher/SPO urgente</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição. O voucher/SPO será devolvido para a Operação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="motivo-rejeicao">
              Motivo da Rejeição <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-rejeicao"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Descreva o motivo da rejeição..."
              rows={4}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejeitar}
              disabled={loading || !comentarios.trim()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? "Rejeitando..." : "Confirmar Rejeição"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
