import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, FileText, Download, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import { ETAPA_LABELS } from "@/types/voucher";

interface ReportFilters {
  etapa: string;
  statusBaixa: string;
  cobrancaEmNomeDe: string;
  dataInicio?: Date;
  dataFim?: Date;
}

export const ReportsTab = () => {
  const [filters, setFilters] = useState<ReportFilters>({
    etapa: "all",
    statusBaixa: "all",
    cobrancaEmNomeDe: "all",
  });
  const [exportType, setExportType] = useState<"excel" | "pdf">("excel");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      setLoading(true);

      let query = supabase.from("vouchers").select("*");

      if (filters.etapa !== "all") {
        query = query.eq("etapa_atual", filters.etapa);
      }
      if (filters.statusBaixa !== "all") {
        query = query.eq("status_baixa", filters.statusBaixa);
      }
      if (filters.cobrancaEmNomeDe !== "all") {
        query = query.eq("cobranca_em_nome_de", filters.cobrancaEmNomeDe);
      }
      if (filters.dataInicio) {
        query = query.gte("vencimento", filters.dataInicio.toISOString());
      }
      if (filters.dataFim) {
        query = query.lte("vencimento", filters.dataFim.toISOString());
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "Nenhum dado encontrado",
          description: "Ajuste os filtros e tente novamente",
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
          title: "Exportação concluída",
          description: `${data.length} registros exportados para Excel`,
        });
      } else {
        // PDF export - simplified version
        toast({
          title: "PDF em desenvolvimento",
          description: "Use a exportação Excel por enquanto",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro na exportação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      etapa: "all",
      statusBaixa: "all",
      cobrancaEmNomeDe: "all",
      dataInicio: undefined,
      dataFim: undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Exportar Relatórios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export Type */}
          <div className="space-y-2">
            <Label>Formato de Exportação</Label>
            <div className="flex gap-4">
              <Button
                variant={exportType === "excel" ? "default" : "outline"}
                onClick={() => setExportType("excel")}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button
                variant={exportType === "pdf" ? "default" : "outline"}
                onClick={() => setExportType("pdf")}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={filters.etapa} onValueChange={(v) => setFilters({ ...filters, etapa: v })}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(ETAPA_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status Baixa</Label>
              <Select value={filters.statusBaixa} onValueChange={(v) => setFilters({ ...filters, statusBaixa: v })}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="BAIXA_MANUAL">Baixa Manual</SelectItem>
                  <SelectItem value="BAIXA_REMESSA">Baixa Remessa</SelectItem>
                  <SelectItem value="BAIXADO_RM">Baixado RM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cobrança</Label>
              <Select value={filters.cobrancaEmNomeDe} onValueChange={(v) => setFilters({ ...filters, cobrancaEmNomeDe: v })}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="DACHSER">DACHSER</SelectItem>
                  <SelectItem value="CLIENTE">CLIENTE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Período</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-background/50">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dataInicio ? format(filters.dataInicio, "dd/MM/yy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dataInicio}
                      onSelect={(date) => setFilters({ ...filters, dataInicio: date })}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-background/50">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dataFim ? format(filters.dataFim, "dd/MM/yy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dataFim}
                      onSelect={(date) => setFilters({ ...filters, dataFim: date })}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button onClick={handleExport} disabled={loading} className="gap-2">
              <Download className="h-4 w-4" />
              {loading ? "Exportando..." : "Exportar"}
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <FileSpreadsheet className="h-5 w-5 text-info shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">Sobre os Relatórios</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Excel:</strong> Exporta dados completos com todas as colunas disponíveis</li>
                <li><strong>PDF:</strong> Relatório formatado para impressão (em desenvolvimento)</li>
                <li>Utilize os filtros para segmentar os dados antes de exportar</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
