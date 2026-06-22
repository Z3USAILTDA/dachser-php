import { useState, useEffect } from "react";
import { insertDadosRmOnFinanceiro } from "@/utils/voucherRmSync";
import { useNavigate } from "react-router-dom";
import { Voucher, TipoAnexo } from "@/types/voucher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Trash2, Loader2, Upload, FileText, AlertCircle, CalendarIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "./FileUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseMariaDBDate } from "@/utils/parseMariaDBDate";

interface VoucherRascunhoActionsProps {
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

export const VoucherRascunhoActions = ({ voucher, onUpdate }: VoucherRascunhoActionsProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEnviarDialog, setShowEnviarDialog] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoAnexo>("FATURA_DEMONSTRATIVO");
  const { toast } = useToast();

  const initialVencimento = voucher.vencimento instanceof Date ? voucher.vencimento : undefined;
  const [vencimentoEnvio, setVencimentoEnvio] = useState<Date | undefined>(initialVencimento || undefined);

  useEffect(() => {
    const v = voucher.vencimento instanceof Date ? voucher.vencimento : undefined;
    setVencimentoEnvio(v);
  }, [voucher.vencimento?.getTime()]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isVencimentoExpirado = vencimentoEnvio ? vencimentoEnvio < today : false;

  const hasFatura = voucher.anexos.some(a => a.tipo === "FATURA_DEMONSTRATIVO" || a.tipo === "FATURA");
  const hasBoleto = voucher.anexos.some(a => a.tipo === "BOLETO_INSTRUCOES" || a.tipo === "BOLETO");
  const boletoRequired = voucher.formaPagamento === "BOLETO";
  const canEnviar = hasFatura && (!boletoRequired || hasBoleto);

  // Função passada para FileUpload.uploadFn — faz upload BLOB e cria registro DB
  const uploadFileFn = async (file: File): Promise<string> => {
    const userData = getUserData();
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

  // Chamado após o upload bem-sucedido
  const handleFileUpload = async (fileUrl: string, fileName: string, _fileSize: number) => {
    try {
      // extract-boleto-barcode mantido no Supabase — será integrado no FIN-5
      // quando a URL de produção estiver disponível para a edge function acessar.
      toast({ title: "Anexo adicionado", description: `"${fileName}" foi anexado com sucesso.` });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar anexo", description: error.message, variant: "destructive" });
    }
  };

  const formatDateForDB = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleEnviar = async () => {
    try {
      setLoading(true);
      const userData = getUserData();

      const camposFaltantes: string[] = [];
      if (!voucher.tipoDocumento) camposFaltantes.push("Tipo de Documento");
      if (!voucher.formaPagamento) camposFaltantes.push("Forma de Pagamento");
      if (!voucher.vencimento) camposFaltantes.push("Vencimento");
      if (camposFaltantes.length > 0) {
        toast({ title: "Campos obrigatórios não preenchidos", description: `Preencha: ${camposFaltantes.join(", ")}`, variant: "destructive" });
        return;
      }

      // Se vencimento foi alterado, atualizar antes de mudar etapa
      const originalVenc = initialVencimento?.getTime();
      const newVenc = vencimentoEnvio?.getTime();
      if (vencimentoEnvio && originalVenc !== newVenc) {
        await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vencimento: formatDateForDB(vencimentoEnvio), user_id: userData.id?.toString(), user_name: userData.username }),
        });
      }

      let proximaEtapa: "OPERACAO" | "FISCAL" | "FINANCEIRO" | "SUPERVISOR";
      if (voucher.urgenciaTipo === "URGENTE_REAL") {
        proximaEtapa = "SUPERVISOR";
      } else if (voucher.cobrancaEmNomeDe === "DACHSER") {
        proximaEtapa = "FISCAL";
      } else {
        proximaEtapa = "FINANCEIRO";
      }

      const patchResp = await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa_atual: proximaEtapa,
          status_envio_cliente: voucher.cobrancaEmNomeDe === "CLIENTE" ? "AGUARDANDO_CLIENTE" : "NAO_APLICA",
          user_id: userData.id?.toString(),
          user_name: userData.username,
        }),
      });
      const patchData = await patchResp.json();
      if (!patchResp.ok || !patchData.success) throw new Error(patchData.error || 'Erro ao atualizar voucher');

      const etapaLabel = proximaEtapa === "SUPERVISOR" ? "Supervisor" : proximaEtapa === "FISCAL" ? "Fiscal" : "Financeiro";
      const isFromAProcessar = voucher.etapaAtual === "A_PROCESSAR";
      await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userData.id?.toString(),
          user_name: userData.username,
          acao: isFromAProcessar ? "VOUCHER_ENVIADO" : "RASCUNHO_ENVIADO",
          detalhe: isFromAProcessar
            ? `Voucher processado e enviado para ${etapaLabel}`
            : `Rascunho finalizado e enviado para ${etapaLabel}`,
        }),
      });

      if (proximaEtapa === "FINANCEIRO") insertDadosRmOnFinanceiro(voucher);

      toast({ title: "Voucher/SPO enviado!", description: `Voucher/SPO enviado para ${etapaLabel}` });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao enviar voucher/SPO", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setShowEnviarDialog(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      // Deletar voucher — o endpoint já cascateia para t_voucher_anexos
      const resp = await fetch(`/api/fin/vouchers/${encodeURIComponent(voucher.id)}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Erro ao excluir voucher');
      toast({ title: "Voucher excluído", description: "O voucher foi excluído com sucesso." });
      navigate("/fin/esteira");
    } catch (error: any) {
      toast({ title: "Erro ao excluir voucher", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const isAProcessar = voucher.etapaAtual === "A_PROCESSAR";
  const stageLabel = isAProcessar ? "a processar" : "rascunho";
  const stageLabelCapitalized = isAProcessar ? "A Processar" : "Rascunho";

  return (
    <div className="space-y-6">
      <Alert className="bg-amber-500/10 border-amber-500/30">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-foreground">
          Este voucher/SPO está em <strong>{stageLabel}</strong>. Complete os dados e anexos obrigatórios para enviá-lo.
        </AlertDescription>
      </Alert>

      {isVencimentoExpirado && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-400">
            <strong>Data de vencimento expirada!</strong> Altere a data de vencimento para uma data válida (hoje ou futura) antes de enviar o voucher.
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-[rgba(255,255,255,0.12)]" style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Anexos Obrigatórios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasFatura ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {hasFatura ? '✓' : '○'}
            </div>
            <span className={hasFatura ? 'text-foreground' : 'text-muted-foreground'}>Fatura / Demonstrativo</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${hasBoleto ? 'bg-green-500/20 text-green-500' : boletoRequired ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground'}`}>
              {hasBoleto ? '✓' : boletoRequired ? '○' : '—'}
            </div>
            <span className={hasBoleto ? 'text-foreground' : 'text-muted-foreground'}>
              Boleto / Instruções de Pagamento
              {!boletoRequired && (
                <span className="ml-2 text-xs italic">(opcional — forma de pagamento {voucher.formaPagamento || "não é boleto"})</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

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

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.12)]">
        <div>
          <h3 className="text-lg font-semibold">Ações - {stageLabelCapitalized}</h3>
          <p className="text-sm text-muted-foreground">
            {canEnviar
              ? "Anexos completos! Você pode enviar o voucher/SPO."
              : boletoRequired
              ? "Adicione fatura e boleto para enviar."
              : "Adicione a fatura/demonstrativo para enviar."}
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={() => setShowEnviarDialog(true)}
          disabled={loading || !canEnviar || isVencimentoExpirado}
          className="gap-2 bg-primary hover:bg-primary/90"
          title={isVencimentoExpirado ? "Altere a data de vencimento antes de enviar" : undefined}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar Voucher/SPO
        </Button>

        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={loading} className="gap-2">
          <Trash2 className="h-4 w-4" />
          Excluir Voucher
        </Button>
      </div>

      <Dialog open={showEnviarDialog} onOpenChange={setShowEnviarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Voucher/SPO</DialogTitle>
            <DialogDescription>Confirme os dados antes de enviar para a próxima etapa do fluxo.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !vencimentoEnvio && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {vencimentoEnvio ? format(vencimentoEnvio, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={vencimentoEnvio}
                    onSelect={setVencimentoEnvio}
                    disabled={(date) => { const t = new Date(); t.setHours(0,0,0,0); return date < t; }}
                    className="pointer-events-auto"
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="text-sm text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/50">
              <p><span className="font-medium text-foreground">Nº:</span> {voucher.numeroSPO}</p>
              <p><span className="font-medium text-foreground">Valor:</span> {voucher.moeda} {Number(voucher.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p><span className="font-medium text-foreground">Fornecedor:</span> {voucher.fornecedor}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviarDialog(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleEnviar} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : "Confirmar e Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O voucher e todos os anexos serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading} className="bg-destructive hover:bg-destructive/90">
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
