import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Package, Calendar, DollarSign, Ship, Loader2, Download } from "lucide-react";
import { useDemurragePreInvoiceItems, type PreInvoice, type PreInvoiceItem } from "@/hooks/useDemurrageData";
import { exportPreInvoicePDF } from "@/utils/demurragePdfExport";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface PreInvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preInvoice: PreInvoice | null;
}

export function PreInvoiceDetailsDialog({ open, onOpenChange, preInvoice }: PreInvoiceDetailsDialogProps) {
  const { data: items = [], isLoading } = useDemurragePreInvoiceItems(preInvoice?.id ?? null);

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

  if (!preInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border-[rgba(255,255,255,0.1)] max-w-4xl max-h-[85vh] overflow-y-auto">
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

          {/* Items Table */}
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-[#ffc800]" />
              Containers ({items.length})
            </h4>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#ffc800]" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nenhum container encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.1)]">
                    <TableHead>Container</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-center">Free Time</TableHead>
                    <TableHead className="text-center">Dias</TableHead>
                    <TableHead className="text-right">Taxa/Dia</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="border-[rgba(255,255,255,0.1)]">
                      <TableCell className="font-mono">{item.container_number || '-'}</TableCell>
                      <TableCell>{item.container_type || '-'}</TableCell>
                      <TableCell className="text-center">{item.free_time_days || '-'}</TableCell>
                      <TableCell className="text-center font-medium">{item.days_count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.daily_rate_usd || 0)}</TableCell>
                      <TableCell className="text-right font-semibold text-[#ffc800]">{formatCurrency(item.total_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
