import { useState, useEffect, useMemo } from "react";
import { 
  Calendar, 
  Copy, 
  Check, 
  Building2, 
  CreditCard, 
  RefreshCw,
  Send,
  FileText,
  AlertCircle,
  Loader2,
  Banknote,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FaturaItem {
  id: string;
  numero_spo: string;
  fornecedor: string;
  cnpj_fornecedor: string;
  valor: number;
  vencimento: string;
  forma_pagamento: string;
  status_baixa: string;
  etapa_atual: string;
  linha_digitavel?: string;
  remessa?: string;
}

interface DadosBancarios {
  banco: string;
  agencia: string;
  digito_agencia?: string;
  conta_corrente: string;
  digito_conta?: string;
  razao_social: string;
  cnpj: string;
  chavePix?: string;
  pixTipoChave?: string;
}

export const FaturasDoDiaTab = () => {
  const [faturas, setFaturas] = useState<FaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterFormaPag, setFilterFormaPag] = useState<string>("all");
  const [filterStatusBaixa, setFilterStatusBaixa] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dadosBancariosCache, setDadosBancariosCache] = useState<Record<string, DadosBancarios>>({});
  const [loadingDados, setLoadingDados] = useState<Record<string, boolean>>({});
  const [sendingRemessa, setSendingRemessa] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Load faturas do dia
  const loadFaturas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_faturas_do_dia" }
      });

      if (error) throw error;

      setFaturas(data?.data || []);
    } catch (error: any) {
      console.error("Erro ao carregar faturas:", error);
      toast({
        title: "Erro ao carregar faturas",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load dados bancários for a fornecedor
  const loadDadosBancarios = async (cnpj: string) => {
    if (dadosBancariosCache[cnpj] || loadingDados[cnpj]) return;

    setLoadingDados(prev => ({ ...prev, [cnpj]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "get_dados_bancarios_fornecedor",
          cnpj: cnpj.replace(/\D/g, "")
        }
      });

      if (error) throw error;

      if (data?.data) {
        setDadosBancariosCache(prev => ({ ...prev, [cnpj]: data.data }));
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados bancários:", error);
    } finally {
      setLoadingDados(prev => ({ ...prev, [cnpj]: false }));
    }
  };

  useEffect(() => {
    loadFaturas();
  }, []);

  // Load bank details for transfer payments
  useEffect(() => {
    faturas.forEach(fatura => {
      if (isTransferencia(fatura.forma_pagamento) && fatura.cnpj_fornecedor) {
        loadDadosBancarios(fatura.cnpj_fornecedor);
      }
    });
  }, [faturas]);

  const isTransferencia = (formaPag: string) => {
    return ["TRANSFERENCIA_PIX", "PIX", "TRANSFERENCIA", "DEPOSITO"].includes(formaPag);
  };

  const isBoleto = (formaPag: string) => {
    return ["BOLETO", "DARF", "GPS"].includes(formaPag);
  };

  const isRemessa = (fatura: FaturaItem) => {
    return fatura.status_baixa === "BAIXA_REMESSA" || 
           (fatura.remessa && fatura.remessa !== "NENHUM");
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast({
        title: "Copiado!",
        description: "Texto copiado para a área de transferência"
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto",
        variant: "destructive"
      });
    }
  };

  const getRegraFormaPag = (fatura: FaturaItem, dadosBancarios?: DadosBancarios): string => {
    if (isBoleto(fatura.forma_pagamento)) {
      return "Titulo de Cobrança (Boleto)";
    }
    
    if (isTransferencia(fatura.forma_pagamento) && dadosBancarios) {
      const bancoUpper = dadosBancarios.banco?.toUpperCase() || "";
      if (bancoUpper.includes("ITAU") || bancoUpper.includes("341")) {
        return "Crédito em Conta Corrente da Mesma Titularidade";
      }
      return "DOC (Compe)";
    }
    
    return "DOC (Compe)";
  };

  const handleEnviarRemessa = async (fatura: FaturaItem) => {
    setSendingRemessa(prev => ({ ...prev, [fatura.id]: true }));
    
    try {
      const dadosBancarios = dadosBancariosCache[fatura.cnpj_fornecedor];
      const regraFormaPag = getRegraFormaPag(fatura, dadosBancarios);
      
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { 
          action: "insert_dados_rm",
          id_rm: fatura.numero_spo,
          voucher_boleto: isBoleto(fatura.forma_pagamento) ? fatura.linha_digitavel : null,
          chave_pix: null, // PIX key would need to be loaded from voucher data if needed
          pix_tipo_chave: null,
          forma_pag: fatura.forma_pagamento,
          fornecedor: fatura.fornecedor,
          regras_forma_pag: regraFormaPag
        }
      });

      if (error) throw error;

      toast({
        title: "Enviado para Remessa",
        description: `Voucher ${fatura.numero_spo} inserido na t_dados_rm com sucesso`
      });

      // Atualizar status do voucher
      await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "update_voucher_esteira",
          voucher_id: fatura.id,
          status_baixa: "BAIXADO_RM"
        }
      });

      loadFaturas();
    } catch (error: any) {
      console.error("Erro ao enviar para remessa:", error);
      toast({
        title: "Erro ao enviar para remessa",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSendingRemessa(prev => ({ ...prev, [fatura.id]: false }));
    }
  };

  // Filter faturas
  const filteredFaturas = useMemo(() => {
    return faturas.filter(fatura => {
      if (filterFormaPag !== "all") {
        if (filterFormaPag === "BOLETO" && !isBoleto(fatura.forma_pagamento)) return false;
        if (filterFormaPag === "TRANSFERENCIA" && !isTransferencia(fatura.forma_pagamento)) return false;
      }
      if (filterStatusBaixa !== "all" && fatura.status_baixa !== filterStatusBaixa) return false;
      return true;
    });
  }, [faturas, filterFormaPag, filterStatusBaixa]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const today = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Faturas do Dia</h2>
            <p className="text-sm text-muted-foreground capitalize">{today}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Filters */}
          <Select value={filterFormaPag} onValueChange={setFilterFormaPag}>
            <SelectTrigger className="w-[160px] bg-[#0a0b10] border-white/10 rounded-full">
              <SelectValue placeholder="Forma Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatusBaixa} onValueChange={setFilterStatusBaixa}>
            <SelectTrigger className="w-[160px] bg-[#0a0b10] border-white/10 rounded-full">
              <SelectValue placeholder="Status Baixa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="BAIXA_MANUAL">Baixa Manual</SelectItem>
              <SelectItem value="BAIXA_REMESSA">Baixa Remessa</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              loadFaturas();
            }}
            disabled={refreshing}
            className="rounded-full"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Total</div>
          <div className="text-xl font-bold mt-1">{faturas.length}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Boletos</div>
          <div className="text-xl font-bold mt-1">{faturas.filter(f => isBoleto(f.forma_pagamento)).length}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Transferências</div>
          <div className="text-xl font-bold mt-1">{faturas.filter(f => isTransferencia(f.forma_pagamento)).length}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#0a0b10] border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Valor Total</div>
          <div className="text-xl font-bold mt-1">{formatCurrency(faturas.reduce((sum, f) => sum + (f.valor || 0), 0))}</div>
        </div>
      </div>

      {/* Faturas List */}
      {filteredFaturas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Receipt className="h-12 w-12 mb-4 opacity-50" />
          <p>Nenhuma fatura encontrada para hoje</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFaturas.map((fatura) => {
            const dadosBancarios = dadosBancariosCache[fatura.cnpj_fornecedor];
            const isManual = fatura.status_baixa === "BAIXA_MANUAL";
            const isRemessaStatus = isRemessa(fatura);
            const showBoleto = isBoleto(fatura.forma_pagamento);
            const showTransferencia = isTransferencia(fatura.forma_pagamento);
            
            return (
              <div
                key={fatura.id}
                className="rounded-xl bg-[#0a0b10] border border-white/10 p-4 hover:border-primary/30 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {showBoleto ? (
                        <Banknote className="h-5 w-5 text-primary" />
                      ) : (
                        <CreditCard className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{fatura.numero_spo}</span>
                        <Badge variant={isRemessaStatus ? "secondary" : "outline"} className="text-[10px]">
                          {isRemessaStatus ? "REMESSA" : "MANUAL"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{fatura.fornecedor}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-foreground">{formatCurrency(fatura.valor || 0)}</div>
                    <div className="text-xs text-muted-foreground">Venc: {formatDate(fatura.vencimento)}</div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="rounded-lg bg-[#05060c] border border-white/5 p-3 mt-2">
                  {showBoleto && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Linha Digitável:</span>
                      </div>
                      
                      {fatura.linha_digitavel ? (
                        <div className="flex items-center justify-between gap-2">
                          <code className="flex-1 text-sm font-mono bg-black/30 px-3 py-2 rounded border border-white/5 text-foreground">
                            {fatura.linha_digitavel}
                          </code>
                          
                          {isManual && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopy(fatura.linha_digitavel!, `boleto-${fatura.id}`)}
                              className="shrink-0"
                            >
                              {copiedId === `boleto-${fatura.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          
                          {isRemessaStatus && (
                            <Button
                              size="sm"
                              onClick={() => handleEnviarRemessa(fatura)}
                              disabled={sendingRemessa[fatura.id]}
                              className="shrink-0 bg-primary hover:bg-primary/90"
                            >
                              {sendingRemessa[fatura.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Send className="h-4 w-4 mr-2" />
                                  Enviar Remessa
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-yellow-500">
                          <AlertCircle className="h-4 w-4" />
                          <span>Linha digitável não cadastrada</span>
                        </div>
                      )}
                    </div>
                  )}

                  {showTransferencia && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span>Dados Bancários:</span>
                      </div>
                      
                      {loadingDados[fatura.cnpj_fornecedor] ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Carregando dados bancários...</span>
                        </div>
                      ) : dadosBancarios ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Banco:</span>{" "}
                              <span className="text-foreground font-medium">{dadosBancarios.banco}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Agência:</span>{" "}
                              <span className="text-foreground font-medium">
                                {dadosBancarios.agencia}{dadosBancarios.digito_agencia ? `-${dadosBancarios.digito_agencia}` : ""}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Conta:</span>{" "}
                              <span className="text-foreground font-medium">
                                {dadosBancarios.conta_corrente}{dadosBancarios.digito_conta ? `-${dadosBancarios.digito_conta}` : ""}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Razão Social:</span>{" "}
                              <span className="text-foreground font-medium">{dadosBancarios.razao_social}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-2">
                            {isManual && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const text = `Banco: ${dadosBancarios.banco}\nAgência: ${dadosBancarios.agencia}${dadosBancarios.digito_agencia ? `-${dadosBancarios.digito_agencia}` : ""}\nConta: ${dadosBancarios.conta_corrente}${dadosBancarios.digito_conta ? `-${dadosBancarios.digito_conta}` : ""}\nRazão Social: ${dadosBancarios.razao_social}`;
                                  handleCopy(text, `banco-${fatura.id}`);
                                }}
                              >
                                {copiedId === `banco-${fatura.id}` ? (
                                  <Check className="h-4 w-4 text-green-500 mr-2" />
                                ) : (
                                  <Copy className="h-4 w-4 mr-2" />
                                )}
                                Copiar Dados
                              </Button>
                            )}
                            
                            {isRemessaStatus && (
                              <Button
                                size="sm"
                                onClick={() => handleEnviarRemessa(fatura)}
                                disabled={sendingRemessa[fatura.id]}
                                className="bg-primary hover:bg-primary/90"
                              >
                                {sendingRemessa[fatura.id] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-2" />
                                    Enviar Remessa
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-yellow-500">
                          <AlertCircle className="h-4 w-4" />
                          <span>Dados bancários não encontrados para CNPJ: {fatura.cnpj_fornecedor}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer with regra_forma_pag for remessa */}
                {isRemessaStatus && (
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span>Regra:</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {getRegraFormaPag(fatura, dadosBancarios)}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
