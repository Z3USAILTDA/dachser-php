// DACHSER Voucher Types

export type EtapaAtual = 
  | "A_PROCESSAR"
  | "RASCUNHO"
  | "OPERACAO" 
  | "FISCAL" 
  | "SUPERVISOR" 
  | "FINANCEIRO" 
  | "ROBO" 
  | "CONCLUIDO"
  | "AJUSTE_OPERACAO"
  | "AJUSTE_FISCAL"
  | "CANCELADO";

export type StatusBaixa = 
  | "PENDENTE" 
  | "BAIXA_MANUAL" 
  | "BAIXA_REMESSA" 
  | "BAIXADO_RM";

export type StatusFinanceiro = "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "APROVADO" | "REJEITADO";

export type StatusEnvioCliente = "PENDENTE" | "ENVIADO" | "NAO_APLICAVEL" | "AGUARDANDO_CLIENTE" | "NAO_APLICA";

export type StatusComprovante = "PENDENTE" | "ANEXADO" | "VALIDADO";

export type StatusDocumentoFiscal = "PENDENTE" | "ANEXADO";

export type AccrualStatus = "MATCH_OK" | "MATCH_PARCIAL" | "SEM_ACCRUAL";

export type FormaPagamento = 
  | "BOLETO" 
  | "PIX" 
  | "TRANSFERENCIA"
  | "CARTAO" 
  | "DEPOSITO"
  | "DARF"
  | "GPS"
  | "TRANSFERENCIA_PIX" // Mantido para compatibilidade com dados existentes
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

// New types for Pagamentos module
// Simplificado para MANUAL ou REMESSA (10h ou 15h)
export type TipoExecucaoPagamento = "MANUAL" | "REMESSA_10H" | "REMESSA_15H";

export type StatusPagamento = "PENDENTE_DADOS" | "PRONTO" | "EM_REMESSA" | "PAGO" | "ERRO";

export type StatusLoteRemessa = "DRAFT" | "GERADO" | "ENVIADO" | "RETORNO_IMPORTADO" | "FINALIZADO" | "ERRO";

export type StatusItemRemessa = "INCLUIDO" | "REGISTRADO" | "AUTORIZADO" | "PAGO" | "REJEITADO" | "ERRO";

export type LogOrigin = "UI" | "ROBO" | "RM" | "SYSTEM";

export type LogEntityType = "VOUCHER" | "ANEXO" | "PAGAMENTO" | "REMESSA";

export type StatusIntegracaoRM = "PENDENTE" | "ENVIADO_T_DADOS_RM" | "PROCESSADO" | "ERRO";

// Labels e SLAs configuráveis
export const ETAPA_LABELS: Record<EtapaAtual, string> = {
  A_PROCESSAR: "A Processar",
  RASCUNHO: "Rascunho",
  OPERACAO: "Operacional",
  FISCAL: "Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ROBO: "Robô",
  CONCLUIDO: "Concluído",
  AJUSTE_OPERACAO: "Ajuste Operacional",
  AJUSTE_FISCAL: "Ajuste Fiscal",
  CANCELADO: "Cancelado",
};

export const SLA_POR_ETAPA: Record<EtapaAtual, number> = {
  A_PROCESSAR: 0,
  RASCUNHO: 0,
  OPERACAO: 24,
  FISCAL: 48,
  SUPERVISOR: 24,
  FINANCEIRO: 24,
  ROBO: 4,
  CONCLUIDO: 0,
  AJUSTE_OPERACAO: 24,
  AJUSTE_FISCAL: 24,
  CANCELADO: 0,
};

export const STATUS_PAGAMENTO_LABELS: Record<StatusPagamento, string> = {
  PENDENTE_DADOS: "Aguardando Dados",
  PRONTO: "Pronto",
  EM_REMESSA: "Em Remessa",
  PAGO: "Pago",
  ERRO: "Erro",
};

export const TIPO_EXECUCAO_LABELS: Record<TipoExecucaoPagamento, string> = {
  MANUAL: "Manual",
  REMESSA_10H: "Remessa 10h",
  REMESSA_15H: "Remessa 15h",
};

export const STATUS_LOTE_REMESSA_LABELS: Record<StatusLoteRemessa, string> = {
  DRAFT: "Rascunho",
  GERADO: "Arquivo Gerado",
  ENVIADO: "Enviado ao Banco",
  RETORNO_IMPORTADO: "Retorno Importado",
  FINALIZADO: "Finalizado",
  ERRO: "Erro",
};

export const STATUS_ITEM_REMESSA_LABELS: Record<StatusItemRemessa, string> = {
  INCLUIDO: "Incluído",
  REGISTRADO: "Registrado",
  AUTORIZADO: "Autorizado",
  PAGO: "Pago",
  REJEITADO: "Rejeitado",
  ERRO: "Erro",
};

export const STATUS_INTEGRACAO_RM_LABELS: Record<StatusIntegracaoRM, string> = {
  PENDENTE: "Pendente",
  ENVIADO_T_DADOS_RM: "Enviado p/ RM",
  PROCESSADO: "Processado",
  ERRO: "Erro",
};

// Calcular tempo na etapa em horas (usando UTC para evitar problemas de fuso)
export const calcularTempoNaEtapa = (voucher: Voucher): number => {
  // Garantir que ambas as datas estejam em UTC
  const agoraUTC = Date.now();
  const ultimaAtualizacao = new Date(voucher.updatedAt).getTime();
  const diffMs = agoraUTC - ultimaAtualizacao;
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

export interface DadosBancarios {
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: string;
  favorecidoNome?: string;
  favorecidoDocumento?: string;
  chavePix?: string;
  pixTipoChave?: string;
}

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
  // New fields for extended logging
  origin?: LogOrigin;
  entityType?: LogEntityType;
  eventType?: string;
  payloadJson?: Record<string, unknown>;
}

export interface VoucherFilho {
  id: string;
  numeroSPO: string;
  fornecedor?: string;
  valor?: number;
  moeda?: string;
  vencimento?: Date;
  etapaAtual?: string;
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
  origemCriacao?: "MANUAL" | "RM" | "MASTER";
  linhaDigitavel?: string;
  clienteNome?: string;
  centroCusto?: string;
  tipoOperacao?: string;
  fonteDados?: string;
  criadoPorUserId?: string;
  criadoPorUserName?: string;
  enviadoPorUserName?: string;
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
  // New fields for Pagamentos module
  tipoExecucaoPagamento?: TipoExecucaoPagamento;
  isProntoParaRobo?: boolean;
  codigoBarras?: string;
  statusPagamento?: StatusPagamento;
  loteRemessaId?: string;
  dadosBancarios?: DadosBancarios;
  statusIntegracaoRm?: StatusIntegracaoRM;
  // PIX field
  chavePix?: string;
  // Cancellation fields
  cancelamentoMotivo?: string;
  cancelamentoVoucherCredito?: string;
  canceladoPorUserId?: string;
  canceladoPorUserName?: string;
  canceladoEm?: Date;
  // RM Pending tracking (internal use)
  idRm?: number;
  // Voucher Master fields
  voucherMasterId?: string;
  isMaster?: boolean;
  vouchersFilhos?: VoucherFilho[];
  // ADF Status - tracks if document was attached after creation
  statusDocumentoFiscal?: StatusDocumentoFiscal;
  nomeMaster?: string; // Nome personalizado do voucher master
}

export interface RemessaItem {
  id: string;
  loteId: string;
  voucherId: string;
  valor: number;
  vencimento: Date;
  linhaDigitavel?: string;
  codigoBarras?: string;
  statusItem: StatusItemRemessa;
  retornoJson?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  voucher?: Partial<Voucher>;
}

export interface RemessaLote {
  id: string;
  banco: string;
  dataCriacao: Date;
  criadoPorUserId?: string;
  criadoPorUserName?: string;
  statusLote: StatusLoteRemessa;
  arquivoRemessaUrl?: string;
  arquivoRetornoUrl?: string;
  metadataJson?: Record<string, unknown>;
  totalItens: number;
  valorTotal: number;
  updatedAt: Date;
  itens?: RemessaItem[];
}

export interface Crass {
  id: string;
  arquivoUrl: string;
  arquivoNome: string;
  dataUpload: Date;
  uploadedByUserId?: string;
  uploadedByUserName?: string;
  checksum?: string;
  isVigente: boolean;
  createdAt: Date;
}

// Validation result for ROBO readiness
export interface ValidacaoProntoParaRobo {
  valido: boolean;
  pendencias: string[];
}

// Helper function to check if payment method is boleto-like
export const isBoleto = (formaPagamento: FormaPagamento): boolean => {
  return ['BOLETO', 'DARF', 'GPS'].includes(formaPagamento);
};

// Helper function to check if payment requires bank details
export const requiresBankDetails = (tipoExecucao?: TipoExecucaoPagamento): boolean => {
  return false; // TED removido
};

// Helper function to check if payment requires PIX key
export const requiresPixKey = (tipoExecucao?: TipoExecucaoPagamento): boolean => {
  return false; // PIX como execução removido
};

// Validate if voucher is ready for ROBO
export const validarProntoParaRobo = (voucher: Voucher): ValidacaoProntoParaRobo => {
  const pendencias: string[] = [];

  // 1. Tipo execução definido
  if (!voucher.tipoExecucaoPagamento) {
    pendencias.push("Tipo de execução de pagamento não definido");
  }

  // 2. Para BOLETO: linha digitável ou código de barras
  if (isBoleto(voucher.formaPagamento) && !voucher.linhaDigitavel && !voucher.codigoBarras) {
    pendencias.push("Linha digitável ou código de barras não informado");
  }

  // 3. Para REMESSA: dados bancários para transferência
  if ((voucher.tipoExecucaoPagamento === 'REMESSA_10H' || voucher.tipoExecucaoPagamento === 'REMESSA_15H') && !isBoleto(voucher.formaPagamento)) {
    const db = voucher.dadosBancarios;
    if (!db?.banco || !db?.agencia || !db?.conta) {
      pendencias.push("Dados bancários incompletos para remessa");
    }
  }

  // 4. Para ADF: documento fiscal deve estar anexado
  if (voucher.tipoDocumento === 'ADF' && voucher.statusDocumentoFiscal === 'PENDENTE') {
    pendencias.push("Documento fiscal não anexado (ADF aguardando documento)");
  }

  return { valido: pendencias.length === 0, pendencias };
};
