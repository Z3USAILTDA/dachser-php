import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Voucher, ETAPA_LABELS, calcularTempoNaEtapa, formatarTempoNaEtapa, SLA_POR_ETAPA } from "@/types/voucher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoedaBadge } from "./MoedaBadge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, Building2, User, Clock, Trash2, Loader2, ExternalLink, Pencil } from "lucide-react";
import { FornecedoresSemFiscalDialog } from "./FornecedoresSemFiscalDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FilePreview } from "./FilePreview";
import { ExtraAnexoUpload } from "./ExtraAnexoUpload";
import { ProcessoOrigemCard } from "./ProcessoOrigemCard";
import { AccrualMatchBadge } from "./AccrualMatchBadge";
import { StatusComprovanteBadge } from "./StatusComprovanteBadge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatDateOnlyBR } from "@/utils/timezone";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Check, Globe } from "lucide-react";
import { useVoucherInlineSave } from "@/hooks/useVoucherInlineSave";

interface VoucherDetailsViewProps {
  voucher: Voucher;
  onUpdate?: () => void;
  canEditAttachments?: boolean;
  canEditFields?: boolean;
}

export const VoucherDetailsView = ({ voucher, onUpdate, canEditAttachments = false, canEditFields = false }: VoucherDetailsViewProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [vouchersFilhos, setVouchersFilhos] = useState<any[]>([]);
  const [loadingFilhos, setLoadingFilhos] = useState(false);
  const loadedMasterIdRef = useRef<string | null>(null);
  const tempoNaEtapa = calcularTempoNaEtapa(voucher);
  const slaLimit = SLA_POR_ETAPA[voucher.etapaAtual as keyof typeof SLA_POR_ETAPA] || 24;
  const slaExcedido = tempoNaEtapa >= slaLimit;
  const { save, savingField, savedField } = useVoucherInlineSave(voucher.id, onUpdate);
  const [isEditing, setIsEditing] = useState(false);
  const editableNow = canEditFields && isEditing;

  const SaveIndicator = ({ field }: { field: string }) => {
    if (savingField === field) return <Loader2 className="h-3 w-3 animate-spin text-[#F5B843]" />;
    if (savedField === field) return <Check className="h-3 w-3 text-green-400" />;
    return null;
  };

  // ---- Inline editors -------------------------------------------------------
  type EditableTextProps = {
    field: string;
    value: string | number | undefined | null;
    type?: "text" | "number" | "date";
    placeholder?: string;
    multiline?: boolean;
  };
  const EditableText = ({ field, value, type = "text", placeholder, multiline }: EditableTextProps) => {
    const initial = (() => {
      if (value == null) return "";
      if (type === "date") {
        if (typeof value === "string") return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
        const d = value as unknown as Date;
        if (d instanceof Date) {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
        return String(value);
      }
      return String(value);
    })();
    const [local, setLocal] = useState(initial);
    useEffect(() => setLocal(initial), [initial]);

    const commit = () => {
      if (local === initial) return;
      let payload: any = local;
      if (type === "number") payload = local === "" ? null : parseFloat(local.replace(",", "."));
      save(field, payload);
    };

    if (multiline) {
      return (
        <div className="flex items-start gap-2">
          <Textarea
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            placeholder={placeholder}
            className="min-h-[60px] text-sm bg-background/40 border-border/60"
          />
          <SaveIndicator field={field} />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="h-8 text-sm bg-background/40 border-border/60"
        />
        <SaveIndicator field={field} />
      </div>
    );
  };

  const EditableSelect = ({
    field,
    value,
    options,
    placeholder,
  }: {
    field: string;
    value: string | undefined | null;
    options: { label: string; value: string }[];
    placeholder?: string;
  }) => (
    <div className="flex items-center gap-2">
      <Select value={value || ""} onValueChange={(v) => save(field, v || null)}>
        <SelectTrigger className="h-8 text-sm bg-background/40 border-border/60">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SaveIndicator field={field} />
    </div>
  );

  const MoedaInline = () => {
    const isEstrangeira = voucher.moeda === "XXX";
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Select
            value={isEstrangeira ? "BRL" : (voucher.moeda || "BRL")}
            onValueChange={(v) => save("moeda", v)}
            disabled={isEstrangeira}
          >
            <SelectTrigger className="h-8 text-sm bg-background/40 border-border/60 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
          <SaveIndicator field="moeda" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isEstrangeira}
            onChange={(e) => save("moeda", e.target.checked ? "XXX" : "BRL")}
            className="h-3 w-3 rounded border-border accent-[#F5B843]"
          />
          <Globe className="h-3 w-3" /> Moeda estrangeira
        </label>
      </div>
    );
  };


  useEffect(() => {
    if (voucher.isMaster) {
      if (loadedMasterIdRef.current === voucher.id) return;
      loadedMasterIdRef.current = voucher.id;
      setLoadingFilhos(true);
      supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_voucher_filhos", master_id: voucher.id },
      }).then(({ data }) => {
        setVouchersFilhos(data?.data || []);
      }).catch(() => {
        setVouchersFilhos([]);
      }).finally(() => setLoadingFilhos(false));
    } else {
      loadedMasterIdRef.current = null;
      setVouchersFilhos([]);
    }
  }, [voucher.id, voucher.isMaster]);

  const isImageFile = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Erro ao baixar arquivo",
        description: "Não foi possível baixar o arquivo",
        variant: "destructive",
      });
    }
  };

  const handleDragStart = async (e: React.DragEvent, fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("DownloadURL", `${blob.type}:${fileName}:${fileUrl}`);
      e.dataTransfer.setData("text/plain", fileUrl);
    } catch (error) {
      console.error("Erro ao preparar arquivo para drag:", error);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string, fileName: string) => {
    setDeletingAttachmentId(attachmentId);
    try {
      // Extrair o path do arquivo da URL
      const attachment = voucher.anexos.find(a => a.id === attachmentId);
      if (attachment) {
        const match = attachment.fileUrl.match(/voucher-anexos\/(.+)$/);
        if (match) {
          const filePath = match[1];
          // Deletar do storage
          await supabase.storage.from("voucher-anexos").remove([filePath]);
        }
      }

      // Delete from MariaDB via proxy
      const { error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "delete_voucher_anexo",
          anexo_id: attachmentId,
        },
      });

      toast({
        title: "Anexo excluído",
        description: `"${fileName}" foi removido com sucesso.`,
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir anexo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeletingAttachmentId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">

      {/* Badges movidos para EsteiraVoucherDetails - removidos daqui */}

      {/* Header - Etapa + SLA */}
      <div 
        className="rounded-xl px-6 py-4 border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px]"
        style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/* Etapa Atual */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-[#aaaaaa]">Etapa Atual</p>
              <Badge className="bg-[rgba(255,255,255,0.1)] text-[#f5f5f5] border border-[rgba(255,255,255,0.2)] text-sm px-3 py-1">
                {ETAPA_LABELS[voucher.etapaAtual] || voucher.etapaAtual}
              </Badge>
            </div>
          </div>

          {/* SLA Indicator */}
          {voucher.etapaAtual !== "CONCLUIDO" && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border",
              slaExcedido 
                ? "bg-red-500/10 border-red-500/30" 
                : tempoNaEtapa >= slaLimit * 0.75 
                  ? "bg-orange-500/10 border-orange-500/30"
                  : "bg-green-500/10 border-green-500/30"
            )}>
              <Clock className={cn(
                "h-5 w-5",
                slaExcedido ? "text-red-500 animate-pulse" : tempoNaEtapa >= slaLimit * 0.75 ? "text-orange-400" : "text-green-400"
              )} />
              <div>
                <p className="text-xs text-[#aaaaaa]">Tempo na etapa</p>
                <p className={cn(
                  "font-bold text-lg",
                  slaExcedido ? "text-red-500" : tempoNaEtapa >= slaLimit * 0.75 ? "text-orange-400" : "text-green-400"
                )}>
                  {formatarTempoNaEtapa(tempoNaEtapa)} / {slaLimit}h
                </p>
              </div>
              {slaExcedido && (
                <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 ml-2">
                  SLA Excedido!
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Informações Básicas */}
      <Card 
        className="border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
        style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[#f5f5f5]">Informações do Voucher/SPO</CardTitle>
          {canEditFields && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-[#F5B843] hover:bg-[#F5B843]/10"
              onClick={() => setIsEditing((v) => !v)}
              title={isEditing ? "Concluir edição" : "Editar dados"}
            >
              {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nº Voucher/SPO</p>
              <p className="font-mono font-medium text-foreground flex items-center gap-2">
                {voucher.numeroSPO}
                <MoedaBadge moeda={voucher.moeda} />
              </p>
            </div>
            {voucher.isMaster && voucher.nomeMaster && (
              <div>
                <p className="text-sm text-muted-foreground">Nome do Master</p>
                <p className="font-medium text-foreground">{voucher.nomeMaster}</p>
              </div>
            )}
            {voucher.processoId && (
              <div>
                <p className="text-sm text-muted-foreground">Nº Processo</p>
                <p className="font-mono font-medium text-foreground">{voucher.processoId}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Fornecedor</p>
              {canEditFields ? (
                <EditableText field="fornecedor" value={voucher.fornecedor} placeholder="Nome do fornecedor" />
              ) : (
                <p className="text-sm font-medium text-foreground">{voucher.fornecedor || "—"}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CNPJ Fornecedor</p>
              {canEditFields ? (
                <EditableText field="cnpj_fornecedor" value={voucher.cnpjFornecedor} placeholder="00.000.000/0000-00" />
              ) : (
                <p className="text-sm font-mono text-foreground">{voucher.cnpjFornecedor || "—"}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor</p>
              {canEditFields ? (
                <EditableText field="valor" value={voucher.valor} type="number" placeholder="0.00" />
              ) : (
                <p className="text-sm font-medium text-foreground">
                  {voucher.valor != null
                    ? `${voucher.moeda} ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                </p>
              )}
            </div>
            {canEditFields && (
              <div>
                <p className="text-sm text-muted-foreground">Moeda</p>
                <MoedaInline />
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Vencimento</p>
              {canEditFields ? (
                <EditableText field="vencimento" value={voucher.vencimento as any} type="date" />
              ) : (
                <p className="font-medium text-foreground">{formatDateOnlyBR(voucher.vencimento)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Data Emissão</p>
              {canEditFields ? (
                <EditableText field="data_emissao_documento" value={voucher.dataEmissaoDocumento as any} type="date" />
              ) : (
                <p className="text-sm text-foreground">
                  {voucher.dataEmissaoDocumento ? formatDateOnlyBR(voucher.dataEmissaoDocumento) : "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tipo Documento</p>
              {canEditFields ? (
                <EditableSelect
                  field="tipo_documento"
                  value={voucher.tipoDocumento}
                  placeholder="Selecione..."
                  options={[
                    { label: "Voucher", value: "VOUCHER" },
                    { label: "SPO", value: "SPO" },
                    { label: "ICMS", value: "ICMS" },
                    { label: "Armazenagem", value: "ARMAZENAGEM" },
                    { label: "ADF", value: "ADF" },
                    { label: "Outros", value: "OUTROS" },
                  ]}
                />
              ) : (
                voucher.tipoDocumento ? <Badge variant="outline">{voucher.tipoDocumento.replace(/_/g, " ")}</Badge> : <p className="text-sm text-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Filial</p>
              {canEditFields ? (
                <EditableText field="filial" value={voucher.filial} placeholder="Ex: SP01" />
              ) : (
                <p className="text-sm text-foreground">{voucher.filial || "—"}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Forma de Pagamento</p>
              {canEditFields ? (
                <EditableSelect
                  field="forma_pagamento"
                  value={voucher.formaPagamento}
                  options={[
                    { label: "Boleto", value: "BOLETO" },
                    { label: "PIX", value: "PIX" },
                    { label: "Transferência", value: "TRANSFERENCIA" },
                    { label: "Cartão", value: "CARTAO" },
                    { label: "Depósito", value: "DEPOSITO" },
                    { label: "DARF", value: "DARF" },
                    { label: "GPS", value: "GPS" },
                    { label: "Débito", value: "DEBITO" },
                    { label: "Câmbio", value: "CAMBIO" },
                    { label: "ADF", value: "ADF" },
                  ]}
                />
              ) : (
                <p className="text-sm text-foreground">{voucher.formaPagamento?.replace(/_/g, "/")}</p>
              )}
            </div>
            {canEditFields && (
              <div>
                <p className="text-sm text-muted-foreground">Cobrança em Nome de</p>
                <EditableSelect
                  field="cobranca_em_nome_de"
                  value={voucher.cobrancaEmNomeDe}
                  options={[
                    { label: "DACHSER (com Fiscal)", value: "DACHSER" },
                    { label: "CLIENTE (direto Financeiro)", value: "CLIENTE" },
                  ]}
                />
              </div>
            )}
            {canEditFields && voucher.formaPagamento === "PIX" && (
              <div>
                <p className="text-sm text-muted-foreground">Chave PIX</p>
                <EditableText field="chave_pix" value={voucher.chavePix} placeholder="CPF, CNPJ, e-mail ou chave aleatória" />
              </div>
            )}
            {canEditFields && (
              <div>
                <p className="text-sm text-muted-foreground">Origem do Processo</p>
                <EditableSelect
                  field="origem_processo"
                  value={voucher.origemProcesso}
                  placeholder="—"
                  options={[
                    { label: "AIR", value: "AIR" },
                    { label: "SEA", value: "SEA" },
                    { label: "CHB", value: "CHB" },
                    { label: "ROD", value: "ROD" },
                  ]}
                />
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Remessa</p>
              <p className="text-sm text-foreground">{voucher.remessa?.replace(/_/g, " ") || "Nenhum"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status Baixa</p>
              <Badge variant="outline">{
                voucher.statusBaixa === "BAIXA_SOLICITADA" ? "Baixa Solicitada" :
                voucher.statusBaixa === "REALIZADA" ? "Realizada" :
                voucher.statusBaixa?.replace(/_/g, " ") || "PENDENTE"
              }</Badge>
            </div>
            {voucher.statusFinanceiro && (
              <div>
                <p className="text-sm text-muted-foreground">Status Financeiro</p>
                <Badge variant={
                  voucher.statusFinanceiro === "APROVADO" || voucher.statusFinanceiro === "CONCLUIDO" ? "default" :
                  voucher.statusFinanceiro === "REJEITADO" ? "destructive" :
                  voucher.statusFinanceiro === "PROCESSADO" ? "secondary" :
                  "secondary"
                }>
                  {voucher.statusFinanceiro === "PROCESSADO" ? "Processado" :
                   voucher.statusFinanceiro === "CONCLUIDO" ? "Concluído" :
                   voucher.statusFinanceiro}
                </Badge>
              </div>
            )}
            {voucher.clienteEmail && (
              <div>
                <p className="text-sm text-muted-foreground">Email do Cliente</p>
                <p className="text-sm text-foreground">{voucher.clienteEmail}</p>
              </div>
            )}
            {canEditFields && (
              <div>
                <p className="text-sm text-muted-foreground">Marcar como urgente</p>
                <div className="flex items-center gap-2 mt-1">
                  <Switch
                    checked={voucher.urgenciaTipo === "URGENTE_REAL"}
                    disabled={voucher.tipoDocumento === "ARMAZENAGEM" || voucher.tipoDocumento === "ICMS"}
                    onCheckedChange={(checked) => save("urgencia_tipo", checked ? "URGENTE_REAL" : "NORMAL")}
                  />
                  <SaveIndicator field="urgencia_tipo" />
                </div>
              </div>
            )}
            {canEditFields && (
              <div className="md:col-span-3">
                <p className="text-sm text-muted-foreground">Comentários</p>
                <EditableText
                  field="comentarios_operacao"
                  value={voucher.comentariosOperacao}
                  placeholder="Informações adicionais..."
                  multiline
                />
              </div>
            )}
          </div>

          {/* Urgência */}
          {voucher.urgenciaTipo && voucher.urgenciaTipo !== "NORMAL" && (
            <div className={`border rounded-lg p-4 flex gap-3 ${
              voucher.urgenciaTipo === "URGENTE_REAL" 
                ? "bg-destructive/10 border-destructive/20" 
                : "bg-warning/10 border-warning/20"
            }`}>
              <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${
                voucher.urgenciaTipo === "URGENTE_REAL" ? "text-destructive" : "text-warning"
              }`} />
              <div>
                <p className={`font-medium ${
                  voucher.urgenciaTipo === "URGENTE_REAL" ? "text-destructive" : "text-warning"
                }`}>
                  {voucher.urgenciaTipo === "URGENTE_REAL" ? "Urgente Real" : "Urgência Automática"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {voucher.urgenciaMotivo || (
                    voucher.urgenciaTipo === "URGENTE_REAL" 
                      ? "Este voucher/SPO foi marcado como urgente e requer aprovação do supervisor"
                      : "Urgência aplicada automaticamente por tipo de documento (ICMS/Armazenagem)"
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comentários */}
      {(voucher.comentariosOperacao || voucher.comentariosFiscal || voucher.comentariosFinanceiro) && (
        <Card 
          className="border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
          style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
        >
        <CardHeader>
            <CardTitle className="text-[#f5f5f5]">Comentários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {voucher.comentariosOperacao && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Operação</p>
                <p className="text-sm text-foreground">{voucher.comentariosOperacao}</p>
              </div>
            )}
            {voucher.comentariosFiscal && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Fiscal</p>
                <p className="text-sm text-foreground">{voucher.comentariosFiscal}</p>
              </div>
            )}
            {voucher.comentariosFinanceiro && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Financeiro</p>
                <p className="text-sm text-foreground">{voucher.comentariosFinanceiro}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ajustes Solicitados */}
      {(voucher.ajusteOperacao || voucher.ajusteFiscal) && (
        <Card 
          className="border border-orange-500/30 backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
          style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
        >
          <CardHeader>
            <CardTitle className="text-orange-500">Ajustes Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {voucher.ajusteOperacao && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Para Operação</p>
                <p className="text-sm text-foreground">{voucher.ajusteOperacao}</p>
              </div>
            )}
            {voucher.ajusteFiscal && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Para Fiscal</p>
                <p className="text-sm text-foreground">{voucher.ajusteFiscal}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Anexos */}
      <Card 
        className="border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
        style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
      >
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-[#f5f5f5]">Anexos</CardTitle>
          <div className="flex items-center gap-2">
            {["FISCAL", "SUPERVISOR", "FINANCEIRO", "AJUSTE_FISCAL"].includes(voucher.etapaAtual) && (
              <ExtraAnexoUpload
                voucherId={voucher.id}
                etapaAtual={voucher.etapaAtual}
                onUploaded={onUpdate}
              />
            )}
            {canEditAttachments && (
              <Badge variant="outline" className="text-warning border-warning">
                Modo Edição
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(!voucher.anexos || voucher.anexos.length === 0) ? (
            <p className="text-muted-foreground text-center py-4">Nenhum anexo</p>
          ) : (
            <div className="space-y-2">
              {voucher.anexos.map((anexo) => (
                <div
                  key={anexo.id}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, anexo.fileUrl, anexo.fileName)}
                  className="flex items-center justify-between p-3 border border-[rgba(255,255,255,0.08)] rounded-lg hover:bg-secondary/30 transition-colors cursor-move"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isImageFile(anexo.fileName) ? (
                      <div className="relative h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted border border-border">
                        <img
                          src={anexo.fileUrl}
                          alt={anexo.fileName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-foreground">{anexo.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {anexo.tipo?.replace(/_/g, " ")}
                        {anexo.fileSize && ` • ${(anexo.fileSize / 1024 / 1024).toFixed(2)} MB`}
                        <span className="ml-2 text-primary">• Arraste para baixar</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FilePreview
                      fileName={anexo.fileName}
                      fileUrl={anexo.fileUrl}
                      fileType={anexo.tipo}
                      onDownload={() => handleDownload(anexo.fileUrl, anexo.fileName)}
                      allFiles={voucher.anexos.map(a => ({ fileName: a.fileName, fileUrl: a.fileUrl, fileType: a.tipo }))}
                      initialIndex={voucher.anexos.findIndex(a => a.id === anexo.id)}
                    />
                    {canEditAttachments && ['OPERACAO', 'RASCUNHO', 'AJUSTE_OPERACAO'].includes(voucher.etapaAtual) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(anexo.id)}
                        disabled={deletingAttachmentId === anexo.id}
                      >
                        {deletingAttachmentId === anexo.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vouchers Vinculados (Master) */}
      {voucher.isMaster && (
        <Card 
          className="border border-purple-500/30 backdrop-blur-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
          style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
        >
          <CardHeader>
            <CardTitle className="text-purple-400 flex items-center gap-2">
              Vouchers Vinculados
              <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {loadingFilhos ? "..." : vouchersFilhos.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFilhos ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground text-sm">Carregando vouchers vinculados...</span>
              </div>
            ) : vouchersFilhos.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum voucher vinculado</p>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SPO</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchersFilhos.map((filho: any) => (
                      <TableRow 
                        key={filho.id} 
                        className="cursor-pointer hover:bg-muted/20"
                        onDoubleClick={() => navigate(`/fin/esteira/voucher/${filho.id}`)}
                      >
                        <TableCell className="font-mono font-medium">
                          <span className="inline-flex items-center gap-2">
                            {filho.numero_spo || filho.numeroSPO}
                            <MoedaBadge moeda={filho.moeda} />
                            {filho.qtd_duplicados > 1 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
                                ×{filho.qtd_duplicados}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{filho.fornecedor}</TableCell>
                        <TableCell>
                          {filho.valor ? `${filho.moeda || 'BRL'} ${Number(filho.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </TableCell>
                        <TableCell>{filho.vencimento ? formatDateOnlyBR(filho.vencimento) : '-'}</TableCell>
                        <TableCell>
                          <Badge className="bg-primary/20 text-primary border border-primary/30">
                            {ETAPA_LABELS[filho.etapa_atual || filho.etapaAtual] || filho.etapa_atual || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => navigate(`/fin/esteira/voucher/${filho.id}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}


      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const anexo = voucher.anexos.find(a => a.id === confirmDeleteId);
                if (anexo) {
                  handleDeleteAttachment(anexo.id, anexo.fileName);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};