import { useState } from "react";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, AlertTriangle, RefreshCw, Loader2, Upload, MessageSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface VoucherOperacaoActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

export const VoucherOperacaoActions = ({ voucher, onUpdate }: VoucherOperacaoActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const [respostaAjuste, setRespostaAjuste] = useState(voucher.comentariosOperacao || "");
  const { toast } = useToast();
  const { user } = useAuth();

  // Verificar se voucher está com RM pendente
  const isRmPendente = voucher.fonteDados === "RM_PENDENTE";
  const isAjusteOperacao = voucher.etapaAtual === "AJUSTE_OPERACAO";

  // Função para adicionar novo anexo
  const handleFileUpload = async (fileUrl: string, fileName: string, fileSize: number) => {
    if (!user) return;
    
    try {
      const { error } = await (supabase as any)
        .from("voucher_anexos")
        .insert({
          voucher_id: voucher.id,
          tipo: selectedTipo,
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
          uploaded_by_user_id: user.id,
        });

      if (error) throw error;

      toast({
        title: "Anexo adicionado",
        description: `"${fileName}" foi anexado com sucesso.`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar anexo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Tentar sincronizar dados do RM
  const handleSyncRM = async () => {
    if (!voucher.numeroSPO) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("voucher-integrate-rm", {
        body: {
          action: "fetch",
          numeroVoucherRM: voucher.numeroSPO,
        },
      });

      if (error) throw error;

      if (data.success && data.data) {
        // Atualizar voucher com dados do RM
        const { error: updateError } = await (supabase as any)
          .from("vouchers")
          .update({
            fornecedor: data.data.fornecedor || voucher.fornecedor,
            cnpj_fornecedor: data.data.cnpjFornecedor || voucher.cnpjFornecedor,
            valor: data.data.valor || voucher.valor,
            vencimento: data.data.vencimento || voucher.vencimento,
            tipo_documento: data.data.tipoDocumento || voucher.tipoDocumento,
            data_emissao_documento: data.data.dataEmissao || voucher.dataEmissaoDocumento,
            moeda: data.data.moeda || voucher.moeda,
            fonte_dados: "RM", // Marcar como sincronizado
          })
          .eq("id", voucher.id);

        if (updateError) throw updateError;

        toast({
          title: "Dados sincronizados!",
          description: "Dados do RM carregados com sucesso. Voucher pode prosseguir.",
        });

        onUpdate();
      } else {
        toast({
          title: "RM ainda não disponível",
          description: "Os dados ainda não estão disponíveis no RM. Tente novamente mais tarde.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao sincronizar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleEnviar = async () => {
    try {
      setLoading(true);

      // BLOQUEIO: Não permite avançar se RM pendente
      if (isRmPendente) {
        toast({
          title: "Voucher com RM Pendente",
          description: "Sincronize os dados do RM antes de enviar para a próxima etapa.",
          variant: "destructive",
        });
        return;
      }

      // Verificar anexos obrigatórios
      const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO");
      const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES");

      if (!hasFatura || !hasBoleto) {
        toast({
          title: "Anexos obrigatórios faltando",
          description: "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções",
          variant: "destructive",
        });
        return;
      }

      // Determinar próxima etapa baseado em urgência, cobrança e tipo documento
      let proximaEtapa: "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      
      // ADF pula etapa Fiscal, vai direto para Financeiro
      if (voucher.tipoDocumento === "ADF") {
        proximaEtapa = "FINANCEIRO";
      } else if (voucher.urgenciaTipo === "URGENTE_REAL") {
        proximaEtapa = "SUPERVISOR";
      } else if (voucher.cobrancaEmNomeDe === "DACHSER") {
        proximaEtapa = "FISCAL";
      } else {
        proximaEtapa = "FINANCEIRO";
      }

      const updateData: Record<string, any> = {
        etapa_atual: proximaEtapa,
        status_envio_cliente: voucher.cobrancaEmNomeDe === "CLIENTE" ? "AGUARDANDO_CLIENTE" : "NAO_APLICA",
      };

      // Se for ajuste, salvar a resposta
      if (isAjusteOperacao && respostaAjuste.trim()) {
        updateData.comentarios_operacao = respostaAjuste.trim();
      }

      const { error } = await (supabase as any)
        .from("vouchers")
        .update(updateData)
        .eq("id", voucher.id);

      if (error) throw error;

      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : 
                         proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";

      toast({
        title: "Voucher enviado!",
        description: `Voucher enviado para ${etapaLabel}`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Alerta de RM Pendente */}
      {isRmPendente && (
        <Alert variant="destructive" className="bg-warning/10 border-warning text-warning-foreground">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dados do RM Pendentes</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              Este voucher foi criado mas os dados do RM ainda não foram sincronizados.
              O voucher <strong>não pode avançar</strong> até que os dados sejam carregados.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncRM}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Tentar Sincronizar Agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Seção de Ajuste - apenas em AJUSTE_OPERACAO */}
      {isAjusteOperacao && (
        <>
          {/* Motivo do ajuste solicitado pelo Fiscal */}
          {voucher.ajusteFiscal && (
            <Alert className="bg-destructive/10 border-destructive/30">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive">Ajuste solicitado pelo Fiscal</AlertTitle>
              <AlertDescription className="mt-2 text-foreground">
                {voucher.ajusteFiscal}
              </AlertDescription>
            </Alert>
          )}

          {/* Campo de resposta ao ajuste */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <MessageSquare className="h-5 w-5" />
                Resposta ao Ajuste
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resposta-ajuste">Descreva o que foi corrigido</Label>
                <Textarea
                  id="resposta-ajuste"
                  placeholder="Ex: Anexos corrigidos conforme solicitado. A fatura foi substituída pela versão atualizada..."
                  value={respostaAjuste}
                  onChange={(e) => setRespostaAjuste(e.target.value)}
                  className="min-h-[100px] bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Este comentário será visível na próxima etapa do workflow.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Seção de Upload de Novos Anexos */}
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <Upload className="h-5 w-5" />
                Adicionar Novos Anexos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Exclua os anexos incorretos na lista acima e adicione os novos aqui.
              </p>
              
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium whitespace-nowrap">Tipo do anexo:</label>
                <Select value={selectedTipo} onValueChange={(v) => setSelectedTipo(v as TipoAnexo)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FATURA_DEMONSTRATIVO">Fatura/Demonstrativo</SelectItem>
                    <SelectItem value="BOLETO_INSTRUCOES">Boleto/Instruções</SelectItem>
                    <SelectItem value="COMPROVANTE">Comprovante</SelectItem>
                    <SelectItem value="OUTROS">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <FileUpload
                label="Novo anexo"
                multiple
                onFileUpload={handleFileUpload}
              />
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ações - Voucher</h3>
          <p className="text-sm text-muted-foreground">
            {isRmPendente 
              ? "Sincronize os dados do RM para liberar o envio" 
              : isAjusteOperacao
                ? "Corrija os anexos e reenvie o voucher"
                : "Revise os dados e anexos antes de enviar"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={loading || isRmPendente}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          <Send className="h-4 w-4" />
          {isAjusteOperacao 
            ? "Reenviar para Fiscal" 
            : voucher.tipoDocumento === "ADF"
              ? "Enviar para Financeiro"
              : voucher.cobrancaEmNomeDe === "DACHSER" 
                ? "Enviar para Fiscal" 
                : "Enviar para Financeiro"}
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio</AlertDialogTitle>
            <AlertDialogDescription>
              {isAjusteOperacao 
                ? "Confirma que os ajustes foram realizados e o voucher pode ser reenviado?"
                : `Após o envio, os campos da operação serão bloqueados para edição${voucher.formaPagamento === "ADF" ? " (exceto para ADF)" : ""}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnviar} disabled={loading}>
              {loading ? "Enviando..." : "Confirmar Envio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
