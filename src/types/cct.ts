// CCT Types

export type StatusCCTOficial = 
  | "AGUARDANDO_MANIFESTACAO"
  | "MANIFESTADO"
  | "AREA_TRANSFERENCIA"
  | "CHEGADA_INFORMADA"
  | "RECEPCIONADO"
  | "EM_TRANSITO"
  | "ENTREGUE"
  | "BLOQUEIO";

export type SLAStatus = "OK" | "ALERTA" | "CRITICO";

export type TipoVoo = "VOO_CURTO" | "VOO_LONGO";

export type StatusExcecao = "ABERTA" | "EM_ANALISE" | "RESOLVIDA";

export type TipoExcecao = 
  | "HOUSE_NAO_ENCONTRADO"
  | "API_INDISPONIVEL"
  | "DIVERGENCIA_DADOS"
  | "ATRASO_EVENTO";

export type CanalNotificacao = "EMAIL_CLIENTE" | "EMAIL_INTERNO" | "WEBHOOK";

export type FonteEvento = "LEADCOMEX" | "HANDLER" | "RFB" | "MANUAL";

export type NivelConfianca = "PRIMARIA" | "COMPLEMENTAR";

export const DIVERGENCIA_THRESHOLD_PCT = 5;

export const CODIGOS_EVENTO = [
  "AGUARDANDO_EMBARQUE",
  "MANIFESTADO",
  "AREA_TRANSFERENCIA",
  "CHEGADA_INFORMADA",
  "RECEPCIONADO",
  "EM_TRANSITO",
  "ENTREGUE",
  "BLOQUEIO",
] as const;

export type CodigoEvento = typeof CODIGOS_EVENTO[number];

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
  codigo_evento: CodigoEvento;
  data_hora_evento: string;
  descricao?: string | null;
  fonte: FonteEvento;
  nivel_confianca: NivelConfianca;
  created_at: string;
}

export interface CCTStatusAtual {
  id: string;
  shipment_id: string;
  status_cct_oficial: StatusCCTOficial;
  sla_status: SLAStatus;
  sla_limite?: string | null;
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

// Utility function
export function calcularDivergenciaPeso(
  pesoDeclarado?: number | null,
  pesoConstatado?: number | null
): number | null {
  if (pesoDeclarado == null || pesoConstatado == null || pesoDeclarado === 0) {
    return null;
  }
  return Math.abs(((pesoConstatado - pesoDeclarado) / pesoDeclarado) * 100);
}
