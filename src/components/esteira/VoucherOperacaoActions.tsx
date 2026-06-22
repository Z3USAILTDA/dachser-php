import { useState } from "react";
import { insertDadosRmOnFinanceiro } from "@/utils/voucherRmSync";
import { parseRequesterFromAjuste, stripRequesterMarker } from "@/utils/voucherAjusteRouting";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client"; // mantido apenas para send-voucher-notification (FIN-5)
import { useToast } from "@/hooks/use-toast";
import { Send, AlertTriangle, RefreshCw, Loader2, Upload, MessageSquare, FileText, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AjusteRouteChoiceDialog } from "./AjusteRouteChoiceDialog";
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

interface VoucherOperacaoActionsProps {
  voucher: Voucher;
  onUpdate: () => void;
}

const getUserData = () => {
  const stored = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  return stored ? JSON.parse(stored) : { id: 0, username: "sistema" };
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const VoucherOperacaoActions = ({ voucher, onUpdate }: VoucherOperacaoActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [showRouteChoice, setShowRouteChoice] = useState(false);
  const [routeChoice, setRouteChoice] = useState<"REQUESTER" | "NORMAL">("REQUESTER");
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const [respostaAjuste, setRespostaAjuste] = useState(voucher.comentariosOperacao || "");
  const { toast } = useToast();
  const { user } = useAuth();

  const isRmPendente = voucher.fonteDados === "RM_PENDENTE";
  const isAjusteOperacao = voucher.etapaAtual === "AJUSTE_OPERACAO";

  const isMaster = voucher.isMaster || voucher.origemCriacao === "MASTER" || voucher.numeroSPO?.startsWith("MASTER-");

  const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
  const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");
  const boletoObrigatorio = voucher.formaPagamento === "BOLETO";
  const canEnviar = isMaster ? !isRmPendente : (hasFatura && (!boletoObrigatorio || hasBoleto) && !isRmPendente);

  // Função passada ao FileUpload.uploadFn — substitui anexo existente do mesmo tipo e faz upload BLOB
  const uploadFileFn = async (file: File): Promise<string> => {
    const userData = getUserData();

    // Deletar anexo existente do mesmo tipo (substituição)
    const existingAnexo = voucher.anexos.find(a => a.tipo === selectedTipo);
    if (existingAnexo) {
      await fetch(`/api/fin/vouchers/anexos/${encodeURIComponent(existingAnexo.id)}`, { method: 'DELETE' });
    }

    const base64 = await fileToBase64(file);
    const resp = await fetch('/api/fin/vouchers/anexos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_id: voucher.id,
        tipo: selectedTipo,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        file_base64: base64,
        user_id: userData.id?.toString(),
        user_name: userData.username,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
    return data.file_url;
  };

  const handleFileUpload = async (fileUrl: string, fileName: string, _fileSize: number) => {
    try {
      const existingAnexo = voucher.anexos.find(a => a.tipo === selectedTipo);
      // extract-boleto-barcode mantido no Supabase (FIN-5) — acessará URL de produção quando deployado
      toast({
        title: existingAnexo ? "Anexo substituído" : "Anexo adicionado",
        description: existingAnexo
          ? `"${existingAnexo.fileName}" foi substituído por "${fileName}".`
          : `"${fileName}" foi anexado com sucesso.`,
      });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar anexo", description: error.message, variant: "destructive" });
    }
  };

  // Sincronizar dados do RM (integração externa — mantém stub)
  const handleSyncRM = async () => {
    if (!voucher.numeroSPO) return;
    setSyncing(true);
    try {
      toast({ title: "RM ainda não disponível", description: "Integração RM em fase de migração. Tente novamente mais tarde.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const validateBeforeSend = (): boolean => {
    if (isRmPendente) {
      toast({ title: "Voucher/SPO com RM Pendente", description: "Sincronize os dados do RM antes de enviar.", variant: "destructive" });
      return false;
    }
    const camposFaltantes: string[] = [];
    if (!voucher.tipoDocumento) camposFaltantes.push("Tipo de Documento");
    if (!voucher.formaPagamento) camposFaltantes.push("Forma de Pagamento");
    if (!voucher.vencimento) camposFaltantes.push("Vencimento");
    if (camposFaltantes.length > 0) {
      toast({ title: "Campos obrigatórios não preenchidos", description: `Preencha: ${camposFaltantes.join(", ")}`, variant: "destructive" });
      return false;
    }
    if (!isMaster) {
      const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
      const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");
      const boletoObrigatorio = voucher.formaPagamento === "BOLETO";
      if (!hasFatura || (boletoObrigatorio && !hasBoleto)) {
        toast({
          title: "Anexos obrigatórios faltando",
          description: boletoObrigatorio
            ? "É necessário anexar Fatura/Demonstrativo e Boleto/Instruções"
            : "É necessário anexar Fatura/Demonstrativo",
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const computeNormalNextStage = (): "FISCAL" | "FINANCEIRO" | "SUPERVISOR" => {
    if (isMaster) return "FISCAL";
    if (voucher.urgenciaTipo === "URGENTE_REAL") return "SUPERVISOR";
    if (voucher.cobrancaEmNomeDe === "DACHSER") return "FISCAL";
    return "FINANCEIRO";
  };

  const requesterFromAjuste = isAjusteOperacao ? parseRequesterFromAjuste(voucher.ajusteOperacao) : null;
  const normalNextStageOp = computeNormalNextStage();

  const handleSendClick = () => {
    if (!validateBeforeSend()) return;
    if (requesterFromAjuste && requesterFromAjuste !== normalNextStageOp) {
      setRouteChoice("REQUESTER");
      setShowRouteChoice(true);
      return;
    }
    setShowConfirm(true);
  };

  const handleEnviar = async (chosen: "REQUESTER" | "NORMAL" = "NORMAL") => {
    try {
      setLoading(true);
      if (!validateBeforeSend()) { setLoading(false); return; }

      let proximaEtapa: "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      if (chosen === "REQUESTER" && requesterFromAjuste) {
        proximaEtapa = requesterFromAjuste === "SUPERVISOR" ? "SUPERVISOR" : "FINANCEIRO";
      } else {
        proximaEtapa = normalNextStageOp;
      }

      const updateData: Record<string, any> = {
        etapa_atual: proximaEtapa,
        status_envio_cliente: voucher.cobrancaEmNomeDe === "CLIENTE" ? "AGUARDANDO_CLIENTE" : "NAO_APLICA",
      };
      if (isAjusteOperacao && respostaAjuste.trim()) {
        updateData.comentarios_operacao = respostaAjuste.trim();
      }

      const userData = getUserData();
      const patchResp = await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updateData, user_id: userData.id?.toString(), user_name: userData.username }),
      });
      const patchData = await patchResp.json();
      if (!patchResp.ok || !patchData.success) throw new Error(patchData.error || 'Erro ao atualizar voucher');

      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";
      const acaoLog = isMaster ? "MASTER_APROVADO_OPERACAO" : isAjusteOperacao ? "REENVIO_APOS_AJUSTE" : "ENVIADO_OPERACAO";
      const choiceSuffix = (isAjusteOperacao && requesterFromAjuste)
        ? (chosen === "REQUESTER"
            ? ` (retornado para etapa solicitante ${requesterFromAjuste}, escolhido pelo usuário)`
            : ` (fluxo normal, escolhido pelo usuário, ignorando solicitante ${requesterFromAjuste})`)
        : "";
      const detalheLog = (isMaster
        ? `Voucher master aprovado pela Operação e enviado para ${etapaLabel}`
        : `Voucher/SPO enviado para ${etapaLabel}`) + choiceSuffix;

      await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userData.id?.toString(), user_name: userData.username, acao: acaoLog, detalhe: detalheLog }),
      });

      if (proximaEtapa === "FINANCEIRO") insertDadosRmOnFinanceiro(voucher);

      // Notificação de urgência — mantida no Supabase (FIN-5)
      if (proximaEtapa === "SUPERVISOR") {
        try {
          const urgencyBody = {
            voucherId: voucher.id,
            voucherNumber: voucher.numeroSPO,
            toStage: "SUPERVISOR",
            fromStage: "OPERACAO",
            senderName: userData.username,
            fornecedor: voucher.fornecedor,
            valor: voucher.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            moeda: voucher.moeda,
            vencimento: voucher.vencimento,
          };
          await supabase.functions.invoke("send-voucher-notification", { body: { type: "URGENCIA_SOLICITADA", ...urgencyBody } });
          try {
            await supabase.functions.invoke("send-voucher-notification", { body: { type: "URGENCIA_SOLICITADA_CONFIRMACAO", ...urgencyBody } });
          } catch (_) {}
        } catch (emailErr) {
          console.log("Email notification skipped:", emailErr);
        }
      }

      toast({ title: isMaster ? "Voucher master aprovado!" : "Voucher/SPO enviado!", description: detalheLog });
      onUpdate();
    } catch (error: any) {
      const msg = error.message || "";
      const friendlyMsg = msg.includes("WORKER_LIMIT")
        ? "O servidor está sobrecarregado. Tente novamente em alguns segundos."
        : msg.includes("timeout") || msg.includes("Timeout")
        ? "A operação demorou demais. Tente novamente."
        : msg || "Erro desconhecido ao enviar o voucher.";
      toast({ title: "Erro ao enviar voucher/SPO", description: friendlyMsg, variant: "destructive" });
    } finally {
      setLoading(false);
      setShowConfirm(false);
      setShowRouteChoice(false);
    }
  };

  return (
    <div className="space-y-4">
      {isRmPendente && (
        <Alert variant="destructive" className="bg-warning/10 border-warning text-warning-foreground">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dados do RM Pendentes</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              Este voucher/SPO foi criado mas os dados do RM ainda não foram sincronizados.
              O voucher/SPO <strong>não pode avançar</strong> até que os dados sejam carregados.
            </p>
            <Button variant="outline" size="sm" onClick={handleSyncRM} disabled={syncing} className="gap-2">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tentar Sincronizar Agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isAjusteOperacao && voucher.ajusteFiscal && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-destructive">Ajuste solicitado pelo Fiscal</AlertTitle>
          <AlertDescription className="mt-2 text-foreground">
            {stripRequesterMarker(voucher.ajusteFiscal)}
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

      {!isMaster && (
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
                <span className="text-xs text-muted-foreground">{boletoObrigatorio ? "(obrigatório)" : "(opcional)"}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isMaster && (
        <Alert className="bg-purple-500/10 border-purple-500/30">
          <AlertTriangle className="h-4 w-4 text-purple-500" />
          <AlertTitle className="text-purple-500">Voucher Master</AlertTitle>
          <AlertDescription className="mt-2 text-foreground">
            Este é um voucher agrupador (master). Ao aprovar, ele será enviado para a etapa Fiscal.
          </AlertDescription>
        </Alert>
      )}

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
            uploadFn={uploadFileFn}
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
              ? "Corrija os anexos e reenvie o voucher/SPO"
              : isMaster
              ? "Voucher master pronto para aprovação. Clique para enviar ao Fiscal."
              : canEnviar
              ? "Anexos completos! Você pode enviar o voucher/SPO."
              : "Adicione os anexos obrigatórios para enviar."}
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={handleSendClick}
          disabled={loading || !canEnviar}
          className={`gap-2 ${isMaster ? 'bg-purple-600 hover:bg-purple-700' : 'bg-primary hover:bg-primary/90'}`}
        >
          <Send className="h-4 w-4" />
          Aprovar e Enviar para a Próxima Etapa
        </Button>
      </div>

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
            <AlertDialogAction onClick={() => handleEnviar("NORMAL")} disabled={loading}>
              {loading ? "Enviando..." : "Confirmar Envio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {requesterFromAjuste && (
        <AjusteRouteChoiceDialog
          open={showRouteChoice}
          onOpenChange={setShowRouteChoice}
          requesterStage={requesterFromAjuste}
          normalNextStage={normalNextStageOp}
          choice={routeChoice}
          onChoiceChange={setRouteChoice}
          onConfirm={() => handleEnviar(routeChoice)}
          loading={loading}
        />
      )}
    </div>
  );
};
