import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Voucher } from "@/types/voucher";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VoucherDetailsView } from "@/components/esteira/VoucherDetailsView";
import { VoucherOperacaoActions } from "@/components/esteira/VoucherOperacaoActions";
import { VoucherFiscalActions } from "@/components/esteira/VoucherFiscalActions";
import { VoucherSupervisorActions } from "@/components/esteira/VoucherSupervisorActions";
import { VoucherFinanceiroActions } from "@/components/esteira/VoucherFinanceiroActions";
import { VoucherRoboActions } from "@/components/esteira/VoucherRoboActions";

const EsteiraVoucherDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, isAdmin, hasRole } = useUserRole();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVoucher = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      // Fetch voucher data from MariaDB
      const { data: responseData, error: fnError } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_voucher_by_id', voucher_id: id }
      });

      if (fnError) throw fnError;
      
      if (!responseData?.success || !responseData?.data) {
        throw new Error('Voucher não encontrado');
      }

      const data = responseData.data;
      const anexos = responseData.anexos || [];
      const logs = responseData.logs || [];

      const mappedVoucher: Voucher = {
        id: data.id,
        numeroSPO: data.numero_spo,
        fornecedor: data.fornecedor,
        cnpjFornecedor: data.cnpj_fornecedor,
        valor: data.valor ? parseFloat(data.valor) : undefined,
        moeda: data.moeda || "BRL",
        vencimento: data.vencimento ? new Date(data.vencimento) : new Date(),
        dataEmissaoDocumento: data.data_emissao_documento ? new Date(data.data_emissao_documento) : undefined,
        cobrancaEmNomeDe: data.cobranca_em_nome_de || 'DACHSER',
        formaPagamento: data.forma_pagamento || 'BOLETO',
        tipoDocumento: data.tipo_documento,
        filial: data.filial,
        remessa: data.remessa,
        urgente: data.urgencia_tipo !== "NORMAL",
        urgenciaTipo: data.urgencia_tipo || "NORMAL",
        comentariosOperacao: data.comentarios_operacao,
        comentariosFiscal: data.comentarios_fiscal,
        comentariosFinanceiro: data.comentarios_financeiro,
        ajusteOperacao: data.ajuste_operacao,
        ajusteFiscal: data.ajuste_fiscal,
        etapaAtual: data.etapa_atual || 'OPERACAO',
        statusBaixa: data.status_baixa || "PENDENTE",
        statusFinanceiro: data.status_financeiro || "PENDENTE",
        statusEnvioCliente: data.status_envio_cliente,
        criadoPorUserId: data.criado_por_user_id,
        responsavelOperacaoUserId: data.responsavel_operacao_user_id,
        responsavelFiscalUserId: data.responsavel_fiscal_user_id,
        responsavelSupervisorUserId: data.responsavel_supervisor_user_id,
        responsavelFinanceiroUserId: data.responsavel_financeiro_user_id,
        aprovadoPorUserId: data.aprovado_por_user_id,
        clienteEmail: data.cliente_email,
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
        anexos: anexos.map((a: any) => ({
          id: a.id,
          voucherId: data.id,
          tipo: a.tipo,
          fileName: a.file_name,
          fileUrl: a.file_url,
          fileSize: a.file_size,
          uploadedByUserId: data.criado_por_user_id,
          createdAt: a.created_at ? new Date(a.created_at) : new Date(),
        })),
        logs: logs.map((l: any) => ({
          id: l.id,
          voucherId: data.id,
          dataHora: l.data_hora ? new Date(l.data_hora) : new Date(),
          userId: l.user_id,
          userName: l.user_name,
          acao: l.acao,
          detalhe: l.detalhe,
        })).sort((a: any, b: any) => b.dataHora.getTime() - a.dataHora.getTime()),
      };

      setVoucher(mappedVoucher);
    } catch (error: any) {
      console.error('Error loading voucher:', error);
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

  const canShowOperacaoActions = () => {
    if (!voucher || !role) return false;
    const isOperacaoEtapa = voucher.etapaAtual === "OPERACAO" || voucher.etapaAtual === "AJUSTE_OPERACAO";
    const canAct = hasRole("OPERACAO") || hasRole("GESTOR_OPERACAO");
    return isOperacaoEtapa && canAct;
  };

  const canShowFiscalActions = () => {
    if (!voucher || !role) return false;
    const isFiscalEtapa = voucher.etapaAtual === "FISCAL" || voucher.etapaAtual === "AJUSTE_FISCAL";
    const isDachser = voucher.cobrancaEmNomeDe === "DACHSER";
    const canAct = hasRole("FISCAL") || hasRole("GESTOR_FISCAL");
    return isFiscalEtapa && isDachser && canAct;
  };

  const canShowSupervisorActions = () => {
    if (!voucher || !role) return false;
    const isSupervisorEtapa = voucher.etapaAtual === "SUPERVISOR";
    const canAct = hasRole("SUPERVISOR") || hasRole("GESTOR_SUPERVISOR");
    return isSupervisorEtapa && canAct;
  };

  const canShowFinanceiroActions = () => {
    if (!voucher || !role) return false;
    const isFinanceiroEtapa = voucher.etapaAtual === "FINANCEIRO";
    const canAct = hasRole("FINANCEIRO") || hasRole("GESTOR_FINANCEIRO");
    return isFinanceiroEtapa && canAct;
  };

  const canShowRoboActions = () => {
    if (!voucher || !role) return false;
    const isRoboEtapa = voucher.etapaAtual === "ROBO";
    const canAct = hasRole("FINANCEIRO") || hasRole("GESTOR_FINANCEIRO");
    return isRoboEtapa && canAct;
  };

  if (loading) {
    return (
      <PageLayout backTo="/fin/esteira">
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  if (!voucher) {
    return (
      <PageLayout backTo="/fin/esteira">
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Voucher não encontrado</p>
        </div>
      </PageLayout>
    );
  }

  const getEtapaBadgeColor = (etapa: string) => {
    switch (etapa) {
      case "OPERACAO": return "bg-blue-500/20 text-blue-500";
      case "FISCAL": return "bg-purple-500/20 text-purple-500";
      case "SUPERVISOR": return "bg-orange-500/20 text-orange-500";
      case "FINANCEIRO": return "bg-amber-500/20 text-amber-500";
      case "ROBO": return "bg-cyan-500/20 text-cyan-500";
      case "CONCLUIDO": return "bg-green-500/20 text-green-500";
      case "AJUSTE_OPERACAO": return "bg-orange-500/20 text-orange-500";
      case "AJUSTE_FISCAL": return "bg-red-500/20 text-red-500";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <PageLayout backTo="/fin/esteira">
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
            {/* Voucher Details */}
            <VoucherDetailsView voucher={voucher} />

            {/* Stage Actions */}
            {canShowOperacaoActions() && (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
                <VoucherOperacaoActions voucher={voucher} onUpdate={loadVoucher} />
              </Card>
            )}

            {canShowFiscalActions() && (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
                <VoucherFiscalActions voucher={voucher} onUpdate={loadVoucher} />
              </Card>
            )}

            {canShowSupervisorActions() && (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
                <VoucherSupervisorActions voucher={voucher} onUpdate={loadVoucher} />
              </Card>
            )}

            {canShowFinanceiroActions() && (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
                <VoucherFinanceiroActions voucher={voucher} onUpdate={loadVoucher} />
              </Card>
            )}

            {canShowRoboActions() && (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50">
                <VoucherRoboActions voucher={voucher} onUpdate={loadVoucher} />
              </Card>
            )}

            {/* Alert Messages */}
            {voucher.ajusteOperacao && voucher.etapaAtual === "AJUSTE_OPERACAO" && (
              <Card className="p-4 bg-orange-500/10 border-orange-500/30">
                <h4 className="font-semibold text-orange-500 mb-2">Ajuste Solicitado</h4>
                <p className="text-foreground">{voucher.ajusteOperacao}</p>
              </Card>
            )}

            {voucher.ajusteFiscal && voucher.etapaAtual === "AJUSTE_FISCAL" && (
              <Card className="p-4 bg-red-500/10 border-red-500/30">
                <h4 className="font-semibold text-red-500 mb-2">Ajuste Fiscal Solicitado</h4>
                <p className="text-foreground">{voucher.ajusteFiscal}</p>
              </Card>
            )}
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
                        <span className="font-medium text-foreground">{log.acao.replace(/_/g, " ")}</span>
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
