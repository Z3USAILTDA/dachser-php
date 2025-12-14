import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, FileSpreadsheet, CalendarIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ETAPA_LABELS } from "@/types/voucher";
import * as XLSX from "xlsx";

interface ReportFilters {
  etapa: string;
  statusBaixa: string;
  cobrancaEmNomeDe: string;
  dataInicio?: Date;
  dataFim?: Date;
}

export function ReportsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState<"excel" | "pdf">("excel");
  const [filters, setFilters] = useState<ReportFilters>({
    etapa: "all",
    statusBaixa: "all",
    cobrancaEmNomeDe: "all",
  });

  const handleExport = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("vouchers")
        .select(`*`)
        .order("created_at", { ascending: false });

      if (filters.etapa !== "all") {
        query = query.eq("etapa_atual", filters.etapa as any);
      }

      if (filters.statusBaixa !== "all") {
        query = query.eq("status_baixa", filters.statusBaixa as any);
      }

      if (filters.cobrancaEmNomeDe !== "all") {
        query = query.eq("cobranca_em_nome_de", filters.cobrancaEmNomeDe as any);
      }

      if (filters.dataInicio) {
        query = query.gte("created_at", filters.dataInicio.toISOString());
      }

      if (filters.dataFim) {
        const dataFimEnd = new Date(filters.dataFim);
        dataFimEnd.setHours(23, 59, 59, 999);
        query = query.lte("created_at", dataFimEnd.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "Sem dados",
          description: "Nenhum voucher encontrado com os filtros selecionados",
          variant: "destructive",
        });
        return;
      }

      if (exportType === "excel") {
        const exportData = data.map((v: any) => ({
          "SPO": v.numero_spo,
          "Fornecedor": v.fornecedor,
          "CNPJ": v.cnpj_fornecedor,
          "Valor": v.valor,
          "Moeda": v.moeda,
          "Vencimento": v.vencimento ? format(new Date(v.vencimento), "dd/MM/yyyy") : "",
          "Etapa": ETAPA_LABELS[v.etapa_atual as keyof typeof ETAPA_LABELS] || v.etapa_atual,
          "Status Baixa": v.status_baixa,
          "Cobrança": v.cobranca_em_nome_de,
          "Forma Pagamento": v.forma_pagamento,
          "Urgência": v.urgencia_tipo,
          "Criado em": v.created_at ? format(new Date(v.created_at), "dd/MM/yyyy HH:mm") : "",
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
        XLSX.writeFile(wb, `vouchers_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);

        toast({
          title: "Exportação concluída!",
          description: `${data.length} vouchers exportados para Excel`,
        });
      } else {
        toast({
          title: "PDF em desenvolvimento",
          description: "Use a exportação Excel por enquanto",
        });
      }
    } catch (error: any) {
      console.error("Erro ao exportar:", error);
      toast({
        title: "Erro ao exportar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Exportar Relatórios</CardTitle>
              <CardDescription>
                Selecione os filtros e o formato de exportação
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Export Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/30">
            <button
              onClick={() => setExportType("excel")}
              className={cn(
                "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                exportType === "excel"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/50 bg-card/50"
              )}
            >
              <FileSpreadsheet className={cn(
                "h-8 w-8",
                exportType === "excel" ? "text-primary" : "text-muted-foreground"
              )} />
              <div className="text-left">
                <p className={cn(
                  "font-semibold",
                  exportType === "excel" ? "text-primary" : "text-foreground"
                )}>
                  Excel (.xlsx)
                </p>
                <p className="text-sm text-muted-foreground">
                  Formato com cores e estilos
                </p>
              </div>
            </button>

            <button
              onClick={() => setExportType("pdf")}
              className={cn(
                "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                exportType === "pdf"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/50 bg-card/50"
              )}
            >
              <FileText className={cn(
                "h-8 w-8",
                exportType === "pdf" ? "text-primary" : "text-muted-foreground"
              )} />
              <div className="text-left">
                <p className={cn(
                  "font-semibold",
                  exportType === "pdf" ? "text-primary" : "text-foreground"
                )}>
                  PDF (.pdf)
                </p>
                <p className="text-sm text-muted-foreground">
                  Formato com resumo e estatísticas
                </p>
              </div>
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select
                value={filters.etapa}
                onValueChange={(value) => setFilters({ ...filters, etapa: value })}
              >
                <SelectTrigger className="bg-input/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/50">
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="OPERACAO">Operação</SelectItem>
                  <SelectItem value="FISCAL">Fiscal</SelectItem>
                  <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                  <SelectItem value="ROBO">Robô</SelectItem>
                  <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                  <SelectItem value="AJUSTE_OPERACAO">Ajuste - Operação</SelectItem>
                  <SelectItem value="AJUSTE_FISCAL">Ajuste - Fiscal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status de Baixa</Label>
              <Select
                value={filters.statusBaixa}
                onValueChange={(value) => setFilters({ ...filters, statusBaixa: value })}
              >
                <SelectTrigger className="bg-input/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/50">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="BAIXA_MANUAL">Baixa Manual</SelectItem>
                  <SelectItem value="BAIXA_REMESSA">Baixa Remessa</SelectItem>
                  <SelectItem value="BAIXADO_RM">Baixado RM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cobrança em Nome de</Label>
              <Select
                value={filters.cobrancaEmNomeDe}
                onValueChange={(value) => setFilters({ ...filters, cobrancaEmNomeDe: value })}
              >
                <SelectTrigger className="bg-input/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/50">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="DACHSER">Dachser</SelectItem>
                  <SelectItem value="CLIENTE">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-input/50 border-border/50",
                      !filters.dataInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dataInicio ? (
                      format(filters.dataInicio, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                      "Selecionar data"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border/50">
                  <Calendar
                    mode="single"
                    selected={filters.dataInicio}
                    onSelect={(date) => setFilters({ ...filters, dataInicio: date })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-input/50 border-border/50",
                      !filters.dataFim && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dataFim ? (
                      format(filters.dataFim, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                      "Selecionar data"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border/50">
                  <Calendar
                    mode="single"
                    selected={filters.dataFim}
                    onSelect={(date) => setFilters({ ...filters, dataFim: date })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleExport}
              disabled={loading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exportType === "excel" ? "Exportar Excel" : "Exportar PDF"}
            </Button>

            <Button
              variant="outline"
              onClick={() => setFilters({
                etapa: "all",
                statusBaixa: "all",
                cobrancaEmNomeDe: "all",
                dataInicio: undefined,
                dataFim: undefined,
              })}
              className="border-border/50 hover:bg-muted/50"
            >
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Named export for backward compatibility
export { ReportsTab as default };
