// DACHSER Voucher Types

export type EtapaAtual = 
  | "RASCUNHO"
  | "OPERACAO" 
  | "FISCAL" 
  | "SUPERVISOR" 
  | "FINANCEIRO" 
  | "ROBO" 
  | "CONCLUIDO"
  | "AJUSTE_OPERACAO"
  | "AJUSTE_FISCAL";

export type StatusBaixa = 
  | "PENDENTE" 
  | "BAIXA_MANUAL" 
  | "BAIXA_REMESSA" 
  | "BAIXADO_RM";

export type StatusFinanceiro = "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "APROVADO" | "REJEITADO";

export type StatusEnvioCliente = "PENDENTE" | "ENVIADO" | "NAO_APLICAVEL" | "AGUARDANDO_CLIENTE" | "NAO_APLICA";

export type StatusComprovante = "PENDENTE" | "ANEXADO" | "VALIDADO";

export type AccrualStatus = "MATCH_OK" | "MATCH_PARCIAL" | "SEM_ACCRUAL";

export type FormaPagamento = 
  | "BOLETO" 
  | "PIX" 
  | "CARTAO" 
  | "DEPOSITO"
  | "DARF"
  | "GPS"
  | "TRANSFERENCIA_PIX"
  | "DEBITO"
  | "CAMBIO"
  | "ADF";

export type Remessa = "NENHUM" | "REMESSA_12H" | "REMESSA_15H" | "REMESSA_SIMPLES";

export type CobrancaEmNomeDe = "DACHSER" | "CLIENTE";

export type TipoDocumento = 
  | "FATURA" 
  | "NOTA_FISCAL" 
  | "DEMONSTRATIVO" 
  | "ICMS" 
  | "ARMAZENAGEM"
  | "NF_SERVICO"
  | "NF_DEBITO"
  | "BOLETO"
  | "ADF"
  | "OUTROS";

export type UrgenciaTipo = "NORMAL" | "URGENTE_REAL" | "URGENTE_AUTOMATICO";

export type TipoAnexo = 
  | "FATURA" 
  | "DEMONSTRATIVO" 
  | "BOLETO" 
  | "COMPROVANTE" 
  | "AUTORIZACAO_URGENCIA" 
  | "FATURA_DEMONSTRATIVO"
  | "BOLETO_INSTRUCOES"
  | "OUTROS";

export type UserRole = 
  | "ADMIN"
  | "GESTOR_OPERACAO"
  | "GESTOR_FISCAL"
  | "GESTOR_SUPERVISOR"
  | "GESTOR_FINANCEIRO"
  | "OPERACAO"
  | "FISCAL"
  | "SUPERVISOR"
  | "FINANCEIRO";

// Labels e SLAs configuráveis
export const ETAPA_LABELS: Record<EtapaAtual, string> = {
  RASCUNHO: "Rascunho",
  OPERACAO: "Voucher",
  FISCAL: "Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ROBO: "Robô",
  CONCLUIDO: "Concluído",
  AJUSTE_OPERACAO: "Ajuste Voucher",
  AJUSTE_FISCAL: "Ajuste Fiscal",
};

export const SLA_POR_ETAPA: Record<EtapaAtual, number> = {
  RASCUNHO: 0,
  OPERACAO: 24,
  FISCAL: 48,
  SUPERVISOR: 24,
  FINANCEIRO: 24,
  ROBO: 4,
  CONCLUIDO: 0,
  AJUSTE_OPERACAO: 24,
  AJUSTE_FISCAL: 24,
};

// Calcular tempo na etapa em horas
export const calcularTempoNaEtapa = (voucher: Voucher): number => {
  const agora = new Date();
  const ultimaAtualizacao = new Date(voucher.updatedAt);
  const diffMs = agora.getTime() - ultimaAtualizacao.getTime();
  return diffMs / (1000 * 60 * 60); // Converter para horas
};

// Formatar tempo na etapa
export const formatarTempoNaEtapa = (horas: number): string => {
  if (horas < 1) {
    const minutos = Math.round(horas * 60);
    return `${minutos}min`;
  }
  if (horas < 24) {
    return `${Math.round(horas)}h`;
  }
  const dias = Math.floor(horas / 24);
  const horasRestantes = Math.round(horas % 24);
  return `${dias}d ${horasRestantes}h`;
};

export interface Anexo {
  id: string;
  voucherId: string;
  tipo: TipoAnexo;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  uploadedByUserId?: string;
  createdAt: Date;
}

export interface LogEntry {
  id: string;
  voucherId: string;
  dataHora: Date;
  userId?: string;
  userName?: string;
  acao: string;
  detalhe?: string;
}

export interface Voucher {
  id: string;
  numeroSPO: string;
  fornecedor: string;
  cnpjFornecedor?: string;
  valor?: number;
  moeda: string;
  vencimento: Date;
  dataEmissaoDocumento?: Date;
  cobrancaEmNomeDe: CobrancaEmNomeDe;
  formaPagamento: FormaPagamento;
  tipoDocumento: TipoDocumento;
  filial?: string;
  remessa: Remessa;
  urgente: boolean;
  urgenciaTipo: UrgenciaTipo;
  urgenciaAutorizacaoAnexoId?: string;
  urgenciaMotivo?: string;
  comentariosOperacao?: string;
  comentariosFiscal?: string;
  comentariosFinanceiro?: string;
  ajusteOperacao?: string;
  ajusteFiscal?: string;
  etapaAtual: EtapaAtual;
  statusBaixa: StatusBaixa;
  statusFinanceiro: StatusFinanceiro;
  statusEnvioCliente?: StatusEnvioCliente;
  statusComprovante?: StatusComprovante;
  accrualStatus?: AccrualStatus;
  accrualValor?: number;
  accrualDiferenca?: number;
  processoId?: string;
  origemProcesso?: string;
  origemCriacao?: "MANUAL" | "RM";
  linhaDigitavel?: string;
  clienteNome?: string;
  centroCusto?: string;
  tipoOperacao?: string;
  fonteDados?: string;
  criadoPorUserId?: string;
  criadoPorUserName?: string;
  responsavelOperacaoUserId?: string;
  responsavelOperacaoUserName?: string;
  responsavelFiscalUserId?: string;
  responsavelFiscalUserName?: string;
  responsavelSupervisorUserId?: string;
  responsavelSupervisorUserName?: string;
  responsavelFinanceiroUserId?: string;
  responsavelFinanceiroUserName?: string;
  aprovadoPorUserId?: string;
  aprovadoPorUserName?: string;
  clienteEmail?: string;
  createdAt: Date;
  updatedAt: Date;
  anexos: Anexo[];
  logs: LogEntry[];
}
