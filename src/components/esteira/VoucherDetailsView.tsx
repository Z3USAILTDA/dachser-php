import { useState } from "react";
import { Voucher, ETAPA_LABELS, calcularTempoNaEtapa, formatarTempoNaEtapa, SLA_POR_ETAPA } from "@/types/voucher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, Building2, User, Clock, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FilePreview } from "./FilePreview";
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

interface VoucherDetailsViewProps {
  voucher: Voucher;
  onUpdate?: () => void;
  canEditAttachments?: boolean;
}

export const VoucherDetailsView = ({ voucher, onUpdate, canEditAttachments = false }: VoucherDetailsViewProps) => {
  const { toast } = useToast();
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const tempoNaEtapa = calcularTempoNaEtapa(voucher);
  const slaLimit = SLA_POR_ETAPA[voucher.etapaAtual as keyof typeof SLA_POR_ETAPA] || 24;
  const slaExcedido = tempoNaEtapa >= slaLimit;

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
          action: "query",
          query: "DELETE FROM t_voucher_anexos WHERE id = ?",
          params: [attachmentId],
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

      {/* Header - Cobrança em nome de + Etapa + SLA */}
      <div 
        className="rounded-xl px-6 py-4 border border-[rgba(255,255,255,0.12)] backdrop-blur-[18px]"
        style={{ backgroundColor: 'rgba(5,6,18,0.9)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/* Cobrança em nome de - DESTAQUE */}
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border-2",
              voucher.cobrancaEmNomeDe === "DACHSER" 
                ? "bg-[#ffc800]/10 border-[#ffc800]/40 text-[#ffc800]" 
                : "bg-blue-500/10 border-blue-500/40 text-blue-400"
            )}>
              {voucher.cobrancaEmNomeDe === "DACHSER" ? (
                <Building2 className="h-5 w-5" />
              ) : (
                <User className="h-5 w-5" />
              )}
              <div>
                <p className="text-xs font-medium opacity-80">Cobrança em nome de</p>
                <p className="font-bold text-lg">
                  {voucher.cobrancaEmNomeDe === "DACHSER" ? "DACHSER" : "CLIENTE"}
                </p>
              </div>
            </div>

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
        <CardHeader>
          <CardTitle className="text-[#f5f5f5]">Informações do Voucher/SPO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nº Voucher/SPO</p>
              <p className="font-mono font-medium text-foreground">{voucher.numeroSPO}</p>
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
            {voucher.fornecedor && (
              <div>
                <p className="text-sm text-muted-foreground">Fornecedor</p>
                <p className="text-sm font-medium text-foreground">{voucher.fornecedor}</p>
              </div>
            )}
            {voucher.cnpjFornecedor && (
              <div>
                <p className="text-sm text-muted-foreground">CNPJ Fornecedor</p>
                <p className="text-sm font-mono text-foreground">{voucher.cnpjFornecedor}</p>
              </div>
            )}
            {voucher.valor && (
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-sm font-medium text-foreground">
                  {voucher.moeda} {voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Vencimento</p>
              <p className="font-medium text-foreground">
                {formatDateOnlyBR(voucher.vencimento)}
              </p>
            </div>
            {voucher.dataEmissaoDocumento && (
              <div>
                <p className="text-sm text-muted-foreground">Data Emissão</p>
                <p className="text-sm text-foreground">
                  {formatDateOnlyBR(voucher.dataEmissaoDocumento)}
                </p>
              </div>
            )}
            {voucher.tipoDocumento && (
              <div>
                <p className="text-sm text-muted-foreground">Tipo Documento</p>
                <Badge variant="outline">{voucher.tipoDocumento.replace(/_/g, " ")}</Badge>
              </div>
            )}
            {voucher.filial && (
              <div>
                <p className="text-sm text-muted-foreground">Filial</p>
                <p className="text-sm text-foreground">{voucher.filial}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Forma de Pagamento</p>
              <p className="text-sm text-foreground">{voucher.formaPagamento?.replace(/_/g, "/")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remessa</p>
              <p className="text-sm text-foreground">{voucher.remessa?.replace(/_/g, " ") || "Nenhum"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status Baixa</p>
              <Badge variant="outline">{voucher.statusBaixa?.replace(/_/g, " ") || "PENDENTE"}</Badge>
            </div>
            {voucher.statusFinanceiro && (
              <div>
                <p className="text-sm text-muted-foreground">Status Financeiro</p>
                <Badge variant={
                  voucher.statusFinanceiro === "APROVADO" ? "default" :
                  voucher.statusFinanceiro === "REJEITADO" ? "destructive" :
                  "secondary"
                }>
                  {voucher.statusFinanceiro}
                </Badge>
              </div>
            )}
            {voucher.clienteEmail && (
              <div>
                <p className="text-sm text-muted-foreground">Email do Cliente</p>
                <p className="text-sm text-foreground">{voucher.clienteEmail}</p>
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
          {canEditAttachments && (
            <Badge variant="outline" className="text-warning border-warning">
              Modo Edição
            </Badge>
          )}
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
                    />
                    {canEditAttachments && (
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

      {/* Confirm Delete Dialog */}
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