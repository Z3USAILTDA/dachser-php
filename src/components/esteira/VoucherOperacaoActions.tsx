import { useState } from "react";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, AlertTriangle, RefreshCw, Loader2, Upload, MessageSquare, Edit, FileText, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { EditVoucherDialog } from "./EditVoucherDialog";
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
  allVouchers?: Voucher[];
}

export const VoucherOperacaoActions = ({ voucher, onUpdate, allVouchers = [] }: VoucherOperacaoActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const [respostaAjuste, setRespostaAjuste] = useState(voucher.comentariosOperacao || "");
  const { toast } = useToast();
  const { user } = useAuth();

  // Verificar se voucher está com RM pendente
  const isRmPendente = voucher.fonteDados === "RM_PENDENTE";
  const isAjusteOperacao = voucher.etapaAtual === "AJUSTE_OPERACAO";

  // Verificar anexos obrigatórios
  const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
  const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");
  // Boleto só é obrigatório se forma de pagamento for BOLETO
  const boletoObrigatorio = voucher.formaPagamento === "BOLETO";
  const canEnviar = hasFatura && (!boletoObrigatorio || hasBoleto) && !isRmPendente;

  // Get user data from localStorage (MariaDB auth)
  const getUserData = () => {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    return storedUser ? JSON.parse(storedUser) : { id: 0, username: "sistema" };
  };

  // Função para adicionar novo anexo (MariaDB) - SUBSTITUI anexo existente do mesmo tipo
  const handleFileUpload = async (fileUrl: string, fileName: string, fileSize: number) => {
    try {
      // Verificar se já existe anexo do mesmo tipo e deletar (substituição)
      const existingAnexo = voucher.anexos.find(a => a.tipo === selectedTipo);
      if (existingAnexo) {
        // Deletar arquivo do storage
        const match = existingAnexo.fileUrl.match(/voucher-anexos\/(.+)$/);
        if (match) {
          const filePath = match[1];
          await supabase.storage.from("voucher-anexos").remove([filePath]);
        }
        
        // Deletar registro do anexo no MariaDB
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "delete_voucher_anexo",
            anexo_id: existingAnexo.id,
          },
        });
      }

      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_anexo",
          voucher_id: voucher.id,
          tipo: selectedTipo,
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
        },
      });

      if (error) throw error;

      // Log the action
      const userData = getUserData();
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: existingAnexo ? "ANEXO_SUBSTITUIDO" : "ANEXO_ADICIONADO",
          detalhe: existingAnexo 
            ? `Anexo "${existingAnexo.fileName}" substituído por "${fileName}" (${selectedTipo})`
            : `Anexo "${fileName}" (${selectedTipo}) adicionado`,
        },
      });

      toast({
        title: existingAnexo ? "Anexo substituído" : "Anexo adicionado",
        description: existingAnexo 
          ? `"${existingAnexo.fileName}" foi substituído por "${fileName}".`
          : `"${fileName}" foi anexado com sucesso.`,
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
        // Atualizar voucher no MariaDB
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "update_voucher_esteira",
            voucher_id: voucher.id,
            fornecedor: data.data.fornecedor || voucher.fornecedor,
            cnpj_fornecedor: data.data.cnpjFornecedor || voucher.cnpjFornecedor,
            valor: data.data.valor || voucher.valor,
            vencimento: data.data.vencimento || voucher.vencimento,
            tipo_documento: data.data.tipoDocumento || voucher.tipoDocumento,
            data_emissao_documento: data.data.dataEmissao || voucher.dataEmissaoDocumento,
            moeda: data.data.moeda || voucher.moeda,
          },
        });

        // Log the action
        const userData = getUserData();
        await supabase.functions.invoke("mariadb-proxy", {
          body: {
            action: "save_voucher_log",
            voucher_id: voucher.id,
            user_id: userData.id?.toString(),
            user_name: userData.username,
            acao: "DADOS_RM_SINCRONIZADOS",
            detalhe: "Dados do RM carregados com sucesso",
          },
        });

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
      const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
      const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");

      if (!hasFatura || !hasBoleto) {
        toast({
          title: "Anexos obrigatórios faltando",
          description: "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções",
          variant: "destructive",
        });
        return;
      }

      // Determinar próxima etapa
      let proximaEtapa: "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      
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

      if (isAjusteOperacao && respostaAjuste.trim()) {
        updateData.comentarios_operacao = respostaAjuste.trim();
      }

      // Update voucher in MariaDB
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: voucher.id,
          ...updateData,
        },
      });

      if (error) throw error;

      // Log the action
      const userData = getUserData();
      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : 
                         proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";
      
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "save_voucher_log",
          voucher_id: voucher.id,
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: isAjusteOperacao ? "REENVIO_APOS_AJUSTE" : "ENVIADO_OPERACAO",
          detalhe: `Voucher enviado para ${etapaLabel}`,
        },
      });

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

      {/* Seção de Ajuste (quando retornado do Fiscal) */}
      {isAjusteOperacao && voucher.ajusteFiscal && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-destructive">Ajuste solicitado pelo Fiscal</AlertTitle>
          <AlertDescription className="mt-2 text-foreground">
            {voucher.ajusteFiscal}
          </AlertDescription>
        </Alert>
      )}

      {isAjusteOperacao && (
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
                placeholder="Ex: Anexos corrigidos conforme solicitado..."
                value={respostaAjuste}
                onChange={(e) => setRespostaAjuste(e.target.value)}
                className="min-h-[100px] bg-background"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist de Anexos Obrigatórios */}
      <Card className="border-[rgba(255,255,255,0.12)]" style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Anexos {boletoObrigatorio ? "Obrigatórios" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasFatura ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {hasFatura ? <CheckCircle2 className="h-4 w-4" /> : '○'}
            </div>
            <span className={hasFatura ? 'text-foreground' : 'text-muted-foreground'}>
              Fatura / Demonstrativo <span className="text-xs text-muted-foreground">(obrigatório)</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasBoleto ? 'bg-green-500/20 text-green-500' : boletoObrigatorio ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/50'}`}>
              {hasBoleto ? <CheckCircle2 className="h-4 w-4" /> : '○'}
            </div>
            <span className={hasBoleto ? 'text-foreground' : boletoObrigatorio ? 'text-muted-foreground' : 'text-muted-foreground/70'}>
              Boleto / Instruções de Pagamento{' '}
              <span className="text-xs text-muted-foreground">
                {boletoObrigatorio ? "(obrigatório)" : "(opcional)"}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Seção de Upload de Anexos - Sempre Visível */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-primary">
            <Upload className="h-5 w-5" />
            Adicionar Anexos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            label="Selecionar arquivo"
            multiple
            onFileUpload={handleFileUpload}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ações - Operacional</h3>
          <p className="text-sm text-muted-foreground">
            {isRmPendente 
              ? "Sincronize os dados do RM para liberar o envio" 
              : isAjusteOperacao
                ? "Corrija os anexos e reenvie o voucher"
                : canEnviar 
                  ? "Anexos completos! Você pode enviar o voucher." 
                  : "Adicione os anexos obrigatórios para enviar."}
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={() => setShowEditDialog(true)}
          className="gap-2"
        >
          <Edit className="h-4 w-4" />
          Editar Dados
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={loading || !canEnviar}
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

      <EditVoucherDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        voucher={voucher}
        onSuccess={onUpdate}
      />

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio</AlertDialogTitle>
            <AlertDialogDescription>
              {isAjusteOperacao 
                ? "Confirma que os ajustes foram realizados e o voucher pode ser reenviado?"
                : "Após o envio, os campos da operação serão bloqueados para edição."}
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
