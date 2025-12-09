import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Voucher } from "@/types/voucher";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const EsteiraVoucherDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVoucher = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("vouchers")
        .select(`
          *,
          criado_por:profiles!criado_por_user_id(name, role),
          responsavel_operacao:profiles!responsavel_operacao_user_id(name),
          responsavel_fiscal:profiles!responsavel_fiscal_user_id(name),
          responsavel_supervisor:profiles!responsavel_supervisor_user_id(name),
          responsavel_financeiro:profiles!responsavel_financeiro_user_id(name),
          aprovado_por:profiles!aprovado_por_user_id(name),
          attachments:attachments(id, tipo, file_name, file_url, file_size, created_at),
          logs:log_entries(
            id,
            data_hora,
            acao,
            detalhe,
            user:profiles(name)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      const mappedVoucher: Voucher = {
        id: data.id,
        numeroSPO: data.numero_spo,
        fornecedor: data.fornecedor,
        cnpjFornecedor: data.cnpj_fornecedor,
        valor: data.valor,
        moeda: data.moeda || "BRL",
        vencimento: new Date(data.vencimento),
        dataEmissaoDocumento: data.data_emissao_documento ? new Date(data.data_emissao_documento) : undefined,
        cobrancaEmNomeDe: data.cobranca_em_nome_de,
        formaPagamento: data.forma_pagamento,
        tipoDocumento: data.tipo_documento,
        filial: data.filial,
        remessa: data.remessa,
        urgente: data.urgente,
        urgenciaTipo: data.urgencia_tipo || "NORMAL",
        urgenciaAutorizacaoAnexoId: data.urgencia_autorizacao_anexo_id,
        comentariosOperacao: data.comentarios_operacao,
        comentariosFiscal: data.comentarios_fiscal,
        comentariosFinanceiro: data.comentarios_financeiro,
        ajusteOperacao: data.ajuste_operacao,
        ajusteFiscal: data.ajuste_fiscal,
        etapaAtual: data.etapa_atual,
        statusBaixa: data.status_baixa,
        statusFinanceiro: data.status_financeiro || "PENDENTE",
        statusEnvioCliente: data.status_envio_cliente,
        criadoPorUserId: data.criado_por_user_id,
        criadoPorUserName: data.criado_por?.name,
        responsavelOperacaoUserId: data.responsavel_operacao_user_id,
        responsavelOperacaoUserName: data.responsavel_operacao?.name,
        responsavelFiscalUserId: data.responsavel_fiscal_user_id,
        responsavelFiscalUserName: data.responsavel_fiscal?.name,
        responsavelSupervisorUserId: data.responsavel_supervisor_user_id,
        responsavelSupervisorUserName: data.responsavel_supervisor?.name,
        responsavelFinanceiroUserId: data.responsavel_financeiro_user_id,
        responsavelFinanceiroUserName: data.responsavel_financeiro?.name,
        aprovadoPorUserId: data.aprovado_por_user_id,
        aprovadoPorUserName: data.aprovado_por?.name,
        clienteEmail: data.cliente_email,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        anexos: (data.attachments || []).map((a: any) => ({
          id: a.id,
          voucherId: data.id,
          tipo: a.tipo,
          fileName: a.file_name,
          fileUrl: a.file_url,
          fileSize: a.file_size,
          uploadedByUserId: data.criado_por_user_id,
          createdAt: new Date(a.created_at),
        })),
        logs: (data.logs || []).map((l: any) => ({
          id: l.id,
          voucherId: data.id,
          dataHora: new Date(l.data_hora),
          userId: l.user_id,
          userName: l.user?.name,
          acao: l.acao,
          detalhe: l.detalhe,
        })),
      };

      setVoucher(mappedVoucher);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar voucher",
        description: error.message,
        variant: "destructive",
      });
      navigate("/fin/esteira");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVoucher();
  }, [id]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  if (!voucher) {
    return (
      <PageLayout>
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Voucher não encontrado</p>
        </div>
      </PageLayout>
    );
  }

  const getEtapaBadgeColor = (etapa: string) => {
    switch (etapa) {
      case "OPERACAO": return "bg-info/20 text-info";
      case "FISCAL": return "bg-warning/20 text-warning";
      case "SUPERVISOR": return "bg-primary/20 text-primary";
      case "FINANCEIRO": return "bg-success/20 text-success";
      case "ROBO": return "bg-muted text-muted-foreground";
      case "CONCLUIDO": return "bg-success/20 text-success";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <PageLayout>
      <PageHeader 
        title={`Voucher ${voucher.numeroSPO}`}
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground">Etapa atual:</span>
            <Badge className={getEtapaBadgeColor(voucher.etapaAtual)}>
              {voucher.etapaAtual.replace("_", " ")}
            </Badge>
          </div>
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="detalhes" className="w-full">
          <TabsList className="bg-card/80 backdrop-blur-sm border border-border/50">
            <TabsTrigger value="detalhes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Detalhes
            </TabsTrigger>
            <TabsTrigger value="historico" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-6 mt-6">
            <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Número SPO</label>
                  <p className="text-foreground font-medium mt-1">{voucher.numeroSPO}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fornecedor</label>
                  <p className="text-foreground font-medium mt-1">{voucher.fornecedor}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CNPJ</label>
                  <p className="text-foreground font-medium mt-1">{voucher.cnpjFornecedor || "-"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor</label>
                  <p className="text-foreground font-medium mt-1">
                    {voucher.valor ? `R$ ${voucher.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vencimento</label>
                  <p className="text-foreground font-medium mt-1">{voucher.vencimento.toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Forma de Pagamento</label>
                  <p className="text-foreground font-medium mt-1">{voucher.formaPagamento?.replace("_", " ") || "-"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo Documento</label>
                  <p className="text-foreground font-medium mt-1">{voucher.tipoDocumento?.replace("_", " ") || "-"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cobrança</label>
                  <p className="text-foreground font-medium mt-1">{voucher.cobrancaEmNomeDe || "-"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Urgência</label>
                  <Badge className={cn(
                    voucher.urgenciaTipo === "URGENTE_REAL" ? "bg-destructive/20 text-destructive" :
                    voucher.urgenciaTipo === "URGENTE_AUTOMATICO" ? "bg-warning/20 text-warning" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {voucher.urgenciaTipo === "NORMAL" ? "Normal" : 
                     voucher.urgenciaTipo === "URGENTE_REAL" ? "Urgente Real" : "Urgente Automático"}
                  </Badge>
                </div>
              </div>

              {/* Comentários */}
              <div className="mt-8 space-y-4">
                {voucher.comentariosOperacao && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comentários Operação</label>
                    <p className="text-foreground mt-1 p-3 bg-muted/30 rounded-lg">{voucher.comentariosOperacao}</p>
                  </div>
                )}
                {voucher.comentariosFiscal && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comentários Fiscal</label>
                    <p className="text-foreground mt-1 p-3 bg-muted/30 rounded-lg">{voucher.comentariosFiscal}</p>
                  </div>
                )}
                {voucher.comentariosFinanceiro && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comentários Financeiro</label>
                    <p className="text-foreground mt-1 p-3 bg-muted/30 rounded-lg">{voucher.comentariosFinanceiro}</p>
                  </div>
                )}
              </div>

              {/* Anexos */}
              {voucher.anexos.length > 0 && (
                <div className="mt-8">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Anexos</label>
                  <div className="mt-2 space-y-2">
                    {voucher.anexos.map((anexo) => (
                      <a
                        key={anexo.id}
                        href={anexo.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-primary">{anexo.fileName}</span>
                        <Badge variant="secondary" className="ml-auto">{anexo.tipo}</Badge>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="historico" className="mt-6">
            <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50 animate-fade-in">
              <h3 className="text-lg font-semibold mb-4 text-foreground">Histórico de Ações</h3>
              <div className="space-y-4">
                {voucher.logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhuma ação registrada</p>
                ) : (
                  voucher.logs.map((log, index) => (
                    <div 
                      key={log.id} 
                      className="border-l-2 border-primary/50 pl-4 py-2 hover:border-primary transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-foreground">{log.acao.replace("_", " ")}</span>
                        <span className="text-sm text-muted-foreground">
                          {log.dataHora.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Por: {log.userName || "Sistema"}
                      </p>
                      {log.detalhe && (
                        <p className="text-sm mt-1 text-foreground/80">{log.detalhe}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </PageLayout>
  );
};

export default EsteiraVoucherDetails;
