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

  const handleAprovar = async () => {
    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "FINANCEIRO",
          status_financeiro: "APROVADO",
          aprovado_por_user_id: userData.user?.id,
          responsavel_supervisor_user_id: userData.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      toast({
        title: "Voucher aprovado",
        description: "Voucher urgente aprovado e enviado para Financeiro",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar voucher",
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

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await (supabase as any)
        .from("vouchers")
        .update({
          etapa_atual: "OPERACAO",
          status_financeiro: "REJEITADO",
          ajuste_operacao: `REJEITADO PELO SUPERVISOR: ${comentarios}`,
          responsavel_supervisor_user_id: userData.user?.id,
        })
        .eq("id", voucher.id);

      if (error) throw error;

      // Enviar email de notificação para operação
      const { data: senderProfile } = await (supabase as any)
        .from("profiles")
        .select("name")
        .eq("id", userData.user?.id)
        .maybeSingle();

      const { data: operacaoProfile } = await (supabase as any)
        .from("profiles")
        .select("email")
        .eq("id", voucher.responsavelOperacaoUserId || voucher.criadoPorUserId)
        .maybeSingle();

      if (operacaoProfile?.email) {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: operacaoProfile.email,
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            fromStage: "SUPERVISOR",
            toStage: "OPERACAO",
            reason: comentarios,
            senderName: senderProfile?.name || "Supervisor",
          },
        });
      }

      toast({
        title: "Voucher rejeitado",
        description: "Voucher rejeitado e devolvido para Operação",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao rejeitar voucher",
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
          Aprovar ou rejeitar voucher marcado como urgente real
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-sm font-medium text-amber-600 mb-1">
          Voucher Urgente Real
        </p>
        <p className="text-sm text-muted-foreground">
          Este voucher foi marcado como urgente e requer aprovação do supervisor antes de prosseguir para o financeiro.
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
              Ao aprovar, o voucher será enviado para o Financeiro com prioridade urgente.
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
            <AlertDialogTitle>Rejeitar voucher urgente</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição. O voucher será devolvido para a Operação.
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
