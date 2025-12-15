import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { exportVouchersToExcel } from "@/utils/voucherExcelExport";
import { exportVouchersToPDF } from "@/utils/voucherPdfExport";
import { Voucher } from "@/types/voucher";

interface ReportFilters {
  etapa: string;
  statusBaixa: string;
  cobrancaEmNomeDe: string;
  dataInicio?: Date;
  dataFim?: Date;
}

export default function EsteiraReports() {
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
      
      let query = (supabase as any)
        .from("vouchers")
        .select(`
          *,
          criado_por:profiles!criado_por_user_id(name),
          responsavel_operacao:profiles!responsavel_operacao_user_id(name),
          responsavel_fiscal:profiles!responsavel_fiscal_user_id(name),
          responsavel_financeiro:profiles!responsavel_financeiro_user_id(name)
        `)
        .order("created_at", { ascending: false });

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

      // Map data to Voucher type
      const mappedVouchers: Voucher[] = data.map((v: any) => ({
        id: v.id,
        numeroSPO: v.numero_spo,
        fornecedor: v.fornecedor,
        cnpjFornecedor: v.cnpj_fornecedor,
        valor: v.valor,
        moeda: v.moeda || "BRL",
        vencimento: new Date(v.vencimento),
        dataEmissaoDocumento: v.data_emissao_documento ? new Date(v.data_emissao_documento) : undefined,
        cobrancaEmNomeDe: v.cobranca_em_nome_de,
        formaPagamento: v.forma_pagamento,
        tipoDocumento: v.tipo_documento,
        filial: v.filial,
        remessa: v.remessa,
        urgente: v.urgencia_tipo !== "NORMAL",
        urgenciaTipo: v.urgencia_tipo || "NORMAL",
        comentariosOperacao: v.comentarios_operacao,
        comentariosFiscal: v.comentarios_fiscal,
        comentariosFinanceiro: v.comentarios_financeiro,
        ajusteOperacao: v.ajuste_operacao,
        ajusteFiscal: v.ajuste_fiscal,
        etapaAtual: v.etapa_atual,
        statusBaixa: v.status_baixa || "PENDENTE",
        statusFinanceiro: v.status_financeiro || "PENDENTE",
        statusEnvioCliente: v.status_envio_cliente,
        criadoPorUserId: v.criado_por_user_id,
        criadoPorUserName: v.criado_por?.name,
        responsavelOperacaoUserId: v.responsavel_operacao_user_id,
        responsavelOperacaoUserName: v.responsavel_operacao?.name,
        responsavelFiscalUserId: v.responsavel_fiscal_user_id,
        responsavelFiscalUserName: v.responsavel_fiscal?.name,
        responsavelFinanceiroUserId: v.responsavel_financeiro_user_id,
        responsavelFinanceiroUserName: v.responsavel_financeiro?.name,
        clienteEmail: v.cliente_email,
        createdAt: new Date(v.created_at),
        updatedAt: new Date(v.updated_at),
        anexos: [],
        logs: [],
      }));

      let fileName: string;
      if (exportType === "excel") {
        fileName = exportVouchersToExcel(mappedVouchers);
      } else {
        fileName = exportVouchersToPDF(mappedVouchers);
      }

      toast({
        title: "Exportação concluída!",
        description: `${mappedVouchers.length} vouchers exportados para ${fileName}`,
      });
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
    <PageLayout backTo="/fin/esteira">
      <PageHeader 
        title="Relatórios"
        subtitle="Exporte dados de vouchers para análise"
      />

      <main className="container mx-auto px-4 py-6">
        <Card className="bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
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
      </main>
    </PageLayout>
  );
}
