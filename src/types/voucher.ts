// DACHSER Voucher Types

export type EtapaAtual = 
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

export type StatusFinanceiro = "PENDENTE" | "PROCESSANDO" | "CONCLUIDO";

export type StatusEnvioCliente = "PENDENTE" | "ENVIADO" | "NAO_APLICAVEL";

export type FormaPagamento = 
  | "BOLETO" 
  | "TED" 
  | "PIX" 
  | "CARTAO" 
  | "DEPOSITO"
  | "DARF"
  | "GPS";

export type CobrancaEmNomeDe = "DACHSER" | "CLIENTE";

export type TipoDocumento = 
  | "FATURA" 
  | "NOTA_FISCAL" 
  | "DEMONSTRATIVO" 
  | "ICMS" 
  | "ARMAZENAGEM"
  | "OUTROS";

export type UrgenciaTipo = "NORMAL" | "URGENTE_REAL" | "URGENTE_AUTOMATICO";

export type TipoAnexo = 
  | "FATURA" 
  | "DEMONSTRATIVO" 
  | "BOLETO" 
  | "COMPROVANTE" 
  | "AUTORIZACAO_URGENCIA" 
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
  remessa?: string;
  urgente: boolean;
  urgenciaTipo: UrgenciaTipo;
  urgenciaAutorizacaoAnexoId?: string;
  comentariosOperacao?: string;
  comentariosFiscal?: string;
  comentariosFinanceiro?: string;
  ajusteOperacao?: string;
  ajusteFiscal?: string;
  etapaAtual: EtapaAtual;
  statusBaixa: StatusBaixa;
  statusFinanceiro: StatusFinanceiro;
  statusEnvioCliente?: StatusEnvioCliente;
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
