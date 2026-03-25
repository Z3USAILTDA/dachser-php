import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Package, Calendar, DollarSign, Loader2, Download } from "lucide-react";
import { useDemurragePreInvoiceItems, useDemurrageContainersByMbl, type PreInvoice, type PreInvoiceItem, type DemurrageContainer } from "@/hooks/useDemurrageData";
import { exportPreInvoicePDF } from "@/utils/demurragePdfExport";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface PreInvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preInvoice: PreInvoice | null;
}

export function PreInvoiceDetailsDialog({ open, onOpenChange, preInvoice }: PreInvoiceDetailsDialogProps) {
  const { data: items = [], isLoading } = useDemurragePreInvoiceItems(preInvoice?.id ?? null);
  const { data: containers = [], isLoading: isLoadingContainers } = useDemurrageContainersByMbl(
    open ? preInvoice?.shipment_mbl ?? null : null,
    open ? preInvoice?.invoice_number ?? null : null
  );

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const getWorkflowBadge = (status: string) => {
    const colors: Record<string, string> = {
      calculated: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      reviewed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      sent: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      invoiced: "bg-green-500/10 text-green-500 border-green-500/20",
      paid: "bg-green-600/10 text-green-400 border-green-600/20",
    };
    const labels: Record<string, string> = {
      calculated: "Calculada",
      reviewed: "Revisada",
      sent: "Lançada",
      invoiced: "Faturada",
      paid: "Paga",
    };
    return (
      <Badge className={colors[status] || "bg-gray-500/10 text-gray-500"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const calcDiasEmPosse = (c: DemurrageContainer) => {
    if (!c.ft_started_at) return '-';
    const start = parseISO(c.ft_started_at);
    const end = c.data_devolucao ? parseISO(c.data_devolucao) : new Date();
    return differenceInDays(end, start);
  };

  if (!preInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileText className="h-5 w-5 text-[#ffc800]" />
            Detalhes da Pré-Fatura
          </DialogTitle>
          <DialogDescription>
            {preInvoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Header Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <FileText className="h-4 w-4" />
                  Número
                </div>
                <p className="font-mono font-semibold text-[#ffc800]">{preInvoice.invoice_number}</p>
              </CardContent>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="h-4 w-4" />
                  Total USD
                </div>
                <p className="font-semibold text-[#ffc800]">{formatCurrency(preInvoice.total_usd)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Calendar className="h-4 w-4" />
                  Emissão
                </div>
                <p className="font-medium">{formatDate(preInvoice.issue_date)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  Status
                </div>
                {getWorkflowBadge(preInvoice.workflow_status)}
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Cliente:</span>
              <p className="font-medium">{preInvoice.client_name || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">MBL:</span>
              <p className="font-mono">{preInvoice.shipment_mbl || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">BL:</span>
              <p className="font-mono">{preInvoice.bl_number || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Navio:</span>
              <p>{preInvoice.vessel_name || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Viagem:</span>
              <p>{preInvoice.voyage_number || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Prazo Contestação:</span>
              <p className="font-medium">
                {(preInvoice as any).alert_sent_at 
                  ? (() => {
                      const start = new Date((preInvoice as any).alert_sent_at);
                      let hoursRemaining = 48;
                      const current = new Date(start);
                      while (hoursRemaining > 0) {
                        current.setHours(current.getHours() + 1);
                        const day = current.getDay();
                        if (day !== 0 && day !== 6) {
                          hoursRemaining--;
                        }
                      }
                      return format(current, "dd/MM/yyyy HH:mm", { locale: ptBR });
                    })()
                  : <span className="text-muted-foreground italic">Aguardando envio de alerta</span>
                }
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Origem:</span>
              <p>{preInvoice.origin_port || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Destino:</span>
              <p>{preInvoice.destination_port || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Taxa Câmbio:</span>
              <p>{preInvoice.exchange_rate ? Number(preInvoice.exchange_rate).toFixed(4) : '-'}</p>
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Containers Table */}
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-[#ffc800]" />
              Containers ({containers.length})
            </h4>

            {isLoadingContainers ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-10 w-10 mx-auto mb-2 animate-spin opacity-50" />
                <p>Carregando containers...</p>
              </div>
            ) : containers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nenhum container encontrado para este MBL</p>
              </div>
            ) : (
              {containers.length === 1 && (containers[0] as any)._source === 'pre_invoice_only' ? (
                <div className="text-center py-6 text-muted-foreground border border-[rgba(255,255,255,0.1)] rounded-lg">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium mb-1">Dados parciais disponíveis</p>
                  <p className="text-xs">Os containers desta pré-fatura não estão mais disponíveis nas tabelas operacionais.</p>
                  <div className="mt-3 text-xs space-y-1">
                    {(containers[0] as any).navio && <p>Navio: <span className="text-foreground">{(containers[0] as any).navio}</span></p>}
                    {(containers[0] as any).porto_origem && <p>Origem: <span className="text-foreground">{(containers[0] as any).porto_origem}</span></p>}
                    {(containers[0] as any).porto_destino && <p>Destino: <span className="text-foreground">{(containers[0] as any).porto_destino}</span></p>}
                  </div>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[rgba(255,255,255,0.1)]">
                      <TableHead>Container</TableHead>
                      <TableHead>ATA</TableHead>
                      <TableHead>Último Evento</TableHead>
                      <TableHead>Medida</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descarga</TableHead>
                      <TableHead className="text-center">Free Time</TableHead>
                      <TableHead>Limite Devol.</TableHead>
                      <TableHead>Devol. Vazio</TableHead>
                      <TableHead className="text-center">Dias Posse</TableHead>
                      <TableHead className="text-center">Dias Incid.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((c) => (
                      <TableRow key={c.id} className="border-[rgba(255,255,255,0.1)]">
                        <TableCell className="font-mono text-xs">{c.numero || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(c.data_atracacao)}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={c.last_event || ''}>
                          {c.last_event || '-'}
                        </TableCell>
                        <TableCell className="text-xs">{c.tipo_conteiner || '-'}</TableCell>
                        <TableCell className="text-xs">{c.tipo_processo || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDate(c.ft_started_at)}</TableCell>
                        <TableCell className="text-center text-xs">
                          {c.free_time_days ? `${c.free_time_days}d` : '-'}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(c.free_time_end_date)}</TableCell>
                        <TableCell className="text-xs">{formatDate(c.data_devolucao)}</TableCell>
                        <TableCell className="text-center text-xs font-medium">{calcDiasEmPosse(c)}</TableCell>
                        <TableCell className="text-center text-xs font-semibold text-[#ffc800]">
                          {c.excedente_dias > 0 ? c.excedente_dias : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              )}
            )}
          </div>

          {/* Actions Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-[rgba(255,255,255,0.1)]">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  exportPreInvoicePDF(preInvoice, items);
                  toast.success("PDF exportado com sucesso");
                } catch (error) {
                  toast.error("Erro ao exportar PDF");
                }
              }}
              disabled={isLoading || items.length === 0}
              className="bg-transparent border-[rgba(255,255,255,0.2)]"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <div className="bg-[rgba(255,200,0,0.1)] border border-[#ffc800]/30 rounded-lg p-4 min-w-[200px]">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total USD:</span>
                <span className="font-bold text-xl text-[#ffc800]">{formatCurrency(preInvoice.total_usd)}</span>
              </div>
              {preInvoice.total_brl > 0 && (
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-muted-foreground">Total BRL:</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preInvoice.total_brl)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
