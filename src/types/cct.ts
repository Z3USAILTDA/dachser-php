// CCT Types - Enhanced with new SLA system and FRO status

export type StatusCCTOficial = 
  | "AGUARDANDO_MANIFESTACAO"
  | "COLETA_REALIZADA"
  | "CARGA_RECEBIDA_TECA"
  | "MANIFESTADO"
  | "AREA_TRANSFERENCIA"
  | "CHEGADA_INFORMADA"
  | "RECEPCIONADO"
  | "DISPONIVEL_RETIRADA"
  | "EM_TRANSITO"
  | "EM_TRANSITO_LAST_MILE"
  | "ENTREGUE"
  | "BLOQUEIO"
  | "FROZEN";

export type SLAStatus = "OK" | "ALERTA" | "CRITICO" | "VENCIDO";

export type TipoVoo = "VOO_CURTO" | "VOO_LONGO";

export type StatusExcecao = "ABERTA" | "EM_ANALISE" | "RESOLVIDA";

export type TipoExcecao = 
  | "HOUSE_NAO_ENCONTRADO"
  | "API_INDISPONIVEL"
  | "DIVERGENCIA_DADOS"
  | "ATRASO_EVENTO"
  | "CARGA_BLOQUEADA"
  | "SLA_PROXIMO_VENCIMENTO"
  | "SLA_VENCIDO";

export type CanalNotificacao = "EMAIL_CLIENTE" | "EMAIL_INTERNO" | "WEBHOOK";

export type FonteEvento = "LEADCOMEX" | "HANDLER" | "RFB" | "MANUAL" | "TRACKING";

export type NivelConfianca = "PRIMARIA" | "COMPLEMENTAR";

export const DIVERGENCIA_THRESHOLD_PCT = 5;

export const CODIGOS_EVENTO = [
  "AGUARDANDO_EMBARQUE",
  "COLETA_REALIZADA",
  "CARGA_RECEBIDA_TECA",
  "MANIFESTADO",
  "AREA_TRANSFERENCIA",
  "CHEGADA_INFORMADA",
  "RECEPCIONADO",
  "DISPONIVEL_RETIRADA",
  "EM_TRANSITO",
  "EM_TRANSITO_LAST_MILE",
  "ENTREGUE",
  "BLOQUEIO",
  "FROZEN",
] as const;

export type CodigoEvento = typeof CODIGOS_EVENTO[number];

// ==================== SLA Configuration ====================

export interface SLAConfig {
  status: string;
  descricao: string;
  slaHoras: number;
  toleranciaMinutos?: number;
}

// SLA definitions by operational status (in hours)
export const SLA_POR_STATUS: Record<string, SLAConfig> = {
  'COLETA_REALIZADA': { 
    status: 'COLETA_REALIZADA', 
    descricao: 'Coleta Realizada', 
    slaHoras: 1,
    toleranciaMinutos: 15 
  },
  'CARGA_RECEBIDA_TECA': { 
    status: 'CARGA_RECEBIDA_TECA', 
    descricao: 'Carga Recebida no Terminal (TECA)', 
    slaHoras: 6,
    toleranciaMinutos: 30 
  },
  'ATD': { 
    status: 'ATD', 
    descricao: 'Carga Embarcada (Decolagem)', 
    slaHoras: 1,
    toleranciaMinutos: 15 
  },
  'DEP': { 
    status: 'DEP', 
    descricao: 'Carga Embarcada (Departure)', 
    slaHoras: 1,
    toleranciaMinutos: 15 
  },
  'ATA': { 
    status: 'ATA', 
    descricao: 'Pouso Informado', 
    slaHoras: 1,
    toleranciaMinutos: 15 
  },
  'ARR': { 
    status: 'ARR', 
    descricao: 'Chegada Informada', 
    slaHoras: 1,
    toleranciaMinutos: 15 
  },
  'RCF': { 
    status: 'RCF', 
    descricao: 'Recepcionado', 
    slaHoras: 6,
    toleranciaMinutos: 30 
  },
  'DISPONIVEL_RETIRADA': { 
    status: 'DISPONIVEL_RETIRADA', 
    descricao: 'Disponível para Retirada', 
    slaHoras: 6,
    toleranciaMinutos: 30 
  },
  'NFD': { 
    status: 'NFD', 
    descricao: 'Notificação de Disponibilidade', 
    slaHoras: 6,
    toleranciaMinutos: 30 
  },
  'AWD': { 
    status: 'AWD', 
    descricao: 'Carga em Espera', 
    slaHoras: 6,
    toleranciaMinutos: 30 
  },
  'EM_TRANSITO_LAST_MILE': { 
    status: 'EM_TRANSITO_LAST_MILE', 
    descricao: 'Em Trânsito para Entrega (Last Mile)', 
    slaHoras: 4,
    toleranciaMinutos: 30 
  },
  'DLV': { 
    status: 'DLV', 
    descricao: 'Entrega Realizada', 
    slaHoras: 2,
    toleranciaMinutos: 30 
  },
  'POD': { 
    status: 'POD', 
    descricao: 'Comprovante de Entrega', 
    slaHoras: 2,
    toleranciaMinutos: 30 
  },
};

// Status mapping from tracking codes to CCT official status
export const STATUS_MAPPING: Record<string, StatusCCTOficial> = {
  // Departure / Transit
  'DEP': 'EM_TRANSITO',
  'MAN': 'MANIFESTADO',
  'BKD': 'MANIFESTADO',
  
  // Arrival
  'ARR': 'CHEGADA_INFORMADA',
  'ATA': 'CHEGADA_INFORMADA',
  
  // Reception / Processing
  'RCF': 'RECEPCIONADO',
  'RCS': 'RECEPCIONADO',
  
  // Available for pickup
  'NFD': 'DISPONIVEL_RETIRADA',
  'AWD': 'DISPONIVEL_RETIRADA',
  
  // Delivery
  'DLV': 'ENTREGUE',
  'POD': 'ENTREGUE',
  
  // Problems / Blocks
  'FRO': 'FROZEN',
  'DIS': 'BLOQUEIO',
  'OFLD': 'BLOQUEIO',
  
  // Default
  'AGUARDANDO_MANIFESTACAO': 'AGUARDANDO_MANIFESTACAO',
};

// List of registered airline codes (synchronized with track-awb)
export const REGISTERED_AIRLINE_CODES = [
  '001', // American Airlines
  '016', // United Airlines
  '020', // Lufthansa
  '006', // Delta Airlines
  '047', // Avianca
  '055', // Air France
  '045', // KLM
  '057', // Air Canada
  '074', // KLM Cargo
  '075', // Iberia
  '118', // Korean Air Cargo
  '125', // British Airways
  '139', // Aeromexico Cargo
  '157', // Qatar Airways
  '172', // Emirates SkyCargo
  '176', // Emirates
  '235', // Turkish Airlines
  '369', // Air China Cargo
  '399', // Fedex
  '406', // LAM Mozambique
  '549', // Azul Cargo
  '577', // LATAM Cargo
  '615', // Cargolux
  '724', // Singapore Airlines Cargo
  '729', // Avianca Cargo (Tampa Cargo)
  '881', // Ethiopian Airlines
  '996', // Turkish Cargo
];

// ==================== Core Interfaces ====================

export interface CCTShipment {
  id: string;
  house: string;
  master: string;
  cliente: string;
  cnpj_consignatario?: string | null;
  aeroporto_origem: string;
  aeroporto_destino: string;
  eta?: string | null;
  etd?: string | null;
  peso_declarado?: number | null;
  peso_constatado?: number | null;
  volume_declarado?: number | null;
  volume_constatado?: number | null;
  tratamentos_especiais?: string[] | null;
  analista_id?: string | null;
  analista?: { id: string; nome: string; email: string } | null;
  nome_analista_legado?: string | null;
  data_decolagem_ultimo_trecho?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CCTEvento {
  id: string;
  shipment_id: string;
  codigo_evento: string;
  data_hora_evento: string;
  descricao?: string | null;
  fonte: FonteEvento;
  nivel_confianca: NivelConfianca;
  aeroporto?: string | null;
  created_at: string;
}

// Enhanced SLA info for UI display
export interface SLAInfo {
  status: SLAStatus;
  horasRestantes: number | null;
  percentual: number | null;
  slaConfigHoras: number;
  vencidoEm?: string | null;
  proximoVencimento?: string | null;
}

export interface CCTStatusAtual {
  id: string;
  shipment_id: string;
  status_cct_oficial: StatusCCTOficial;
  sla_status: SLAStatus;
  sla_limite?: string | null;
  sla_info?: SLAInfo | null;
  proximo_evento_esperado?: string | null;
  tipo_voo?: TipoVoo | null;
  created_at: string;
  updated_at: string;
}

export interface CCTExcecao {
  id: string;
  shipment_id: string;
  tipo_excecao: TipoExcecao;
  descricao: string;
  status_excecao: StatusExcecao;
  fonte_detectou: string;
  resolvido_em?: string | null;
  created_at: string;
  updated_at: string;
  shipments?: CCTShipment;
}

export interface CCTRegraNotificacao {
  id: string;
  cliente_nome?: string | null;
  cnpj_consignatario?: string | null;
  aeroportos: string[];
  eventos_disparo: string[];
  canais: CanalNotificacao[];
  template_id: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessoCCT {
  shipment: CCTShipment;
  status_atual: CCTStatusAtual;
  eventos: CCTEvento[];
  excecoes: CCTExcecao[];
}

export interface CodigoIATA {
  codigo: string;
  descricao: string;
  categoria: string;
}

export interface CCTProfile {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface CCTAeroporto {
  codigo: string;
  nome: string;
  cidade: string;
  pais: string;
}

// ==================== Utility Functions ====================

export function calcularDivergenciaPeso(
  pesoDeclarado?: number | null,
  pesoConstatado?: number | null
): number | null {
  if (pesoDeclarado == null || pesoConstatado == null || pesoDeclarado === 0) {
    return null;
  }
  return Math.abs(((pesoConstatado - pesoDeclarado) / pesoDeclarado) * 100);
}

/**
 * Calculate SLA info based on status code and last update time
 */
export function calcularSLAInfo(
  statusCode: string,
  ultimaAtualizacao: string | null
): SLAInfo {
  const config = SLA_POR_STATUS[statusCode];
  const slaHoras = config?.slaHoras ?? 24; // Default 24h if not configured
  
  if (!ultimaAtualizacao) {
    return {
      status: 'OK',
      horasRestantes: null,
      percentual: null,
      slaConfigHoras: slaHoras,
    };
  }
  
  const now = new Date();
  const lastUpdate = new Date(ultimaAtualizacao);
  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffHoras = diffMs / (1000 * 60 * 60);
  
  const horasRestantes = slaHoras - diffHoras;
  const percentual = Math.min(100, Math.max(0, (diffHoras / slaHoras) * 100));
  
  let status: SLAStatus;
  if (horasRestantes <= 0) {
    status = 'VENCIDO';
  } else if (horasRestantes <= 0.5) { // 30 minutes
    status = 'CRITICO';
  } else if (percentual >= 75) {
    status = 'ALERTA';
  } else {
    status = 'OK';
  }
  
  const vencidoEm = horasRestantes < 0 
    ? new Date(lastUpdate.getTime() + slaHoras * 60 * 60 * 1000).toISOString() 
    : null;
    
  const proximoVencimento = horasRestantes > 0 
    ? new Date(lastUpdate.getTime() + slaHoras * 60 * 60 * 1000).toISOString() 
    : null;
  
  return {
    status,
    horasRestantes: Math.round(horasRestantes * 100) / 100,
    percentual: Math.round(percentual * 100) / 100,
    slaConfigHoras: slaHoras,
    vencidoEm,
    proximoVencimento,
  };
}

/**
 * Format SLA remaining time for display
 */
export function formatSLARestante(horasRestantes: number | null): string {
  if (horasRestantes === null) return '-';
  
  if (horasRestantes <= 0) {
    const atraso = Math.abs(horasRestantes);
    if (atraso < 1) {
      return `-${Math.round(atraso * 60)}min`;
    }
    return `-${atraso.toFixed(1)}h`;
  }
  
  if (horasRestantes < 1) {
    return `${Math.round(horasRestantes * 60)}min`;
  }
  
  return `${horasRestantes.toFixed(1)}h`;
}

/**
 * Check if airline code is registered for CCT
 */
export function isAirlineRegistered(mawb: string): boolean {
  const airlineCode = mawb.trim().substring(0, 3);
  return REGISTERED_AIRLINE_CODES.includes(airlineCode);
}
