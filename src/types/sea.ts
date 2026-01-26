// Sea/Maritime Types - Notification Rules for Container Tracking

export type TipoProcessoMaritimo = "IMPORT" | "EXPORT" | "BOTH";

export type CanalNotificacaoSea = "EMAIL_CLIENTE" | "EMAIL_INTERNO" | "WEBHOOK";

export type FrequenciaNotificacao = "IMEDIATO" | "DIARIO" | "SEMANAL";

// Tipos para mapeamento de armadores (Shipping Lines)
export type ShippingLineCode = 
  | 'HAPAG_LLOYD' | 'MSC' | 'MAERSK' | 'HAMBURG_SUD' | 'CMA_CGM' 
  | 'ONE' | 'EVERGREEN' | 'COSCO' | 'YANG_MING' 
  | 'HMM' | 'ZIM' | 'PIL' | 'WAN_HAI' 
  | 'SEABOARD' | 'CROWLEY' | 'ARKAS' | 'TURKON' 
  | 'GRIMALDI' | 'SM_LINE' | 'TRANSROLL' | 'UNKNOWN';

export interface ShippingLineInfo {
  code: ShippingLineCode;
  name: string;
  country: string;
  color: string;
  apiSupported: boolean; // Se tem integração com API de tracking
}

// Status marítimos disponíveis para disparo de notificações
export const STATUS_MARITIMOS = [
  "BKG",   // Booking criado
  "CLT",   // Coleta da carga
  "GIO",   // Gate-in origem
  "CRG",   // Carregado no navio
  "DEP",   // Partida do navio
  "TSP",   // Transbordo
  "ARR",   // Chegada do navio
  "DCH",   // Descarga
  "INS",   // Liberação aduaneira
  "GOD",   // Gate-out destino
  "DLV",   // Entrega final
  "ATRASO_7D", // Atraso >= 7 dias (crítico)
] as const;

export type StatusMaritimoEvento = typeof STATUS_MARITIMOS[number];

export const STATUS_MARITIMOS_LABELS: Record<string, string> = {
  "BKG": "Booking criado",
  "CLT": "Coleta da carga",
  "GIO": "Gate-in origem",
  "CRG": "Carregado no navio",
  "DEP": "Partida do navio",
  "TSP": "Transbordo",
  "ARR": "Chegada do navio",
  "DCH": "Descarga",
  "INS": "Liberação aduaneira",
  "GOD": "Gate-out destino",
  "DLV": "Entrega final",
  "ATRASO_7D": "Atraso crítico (≥ 7 dias)",
};

export const PORTOS_COMUNS_BRASIL = [
  "BRSSZ",  // Santos
  "BRPNG",  // Paranaguá
  "BRITJ",  // Itajaí
  "BRNVT",  // Navegantes
  "BRIOA",  // Itapoá
  "BRRIG",  // Rio Grande
  "BRRIO",  // Rio de Janeiro
  "BRVIX",  // Vitória
  "BRSSA",  // Salvador
  "BRSUA",  // Suape
  "BRPEC",  // Pecém
  "BRMAO",  // Manaus
];

export const CANAIS_NOTIFICACAO_SEA: { value: CanalNotificacaoSea; label: string }[] = [
  { value: 'EMAIL_CLIENTE', label: 'E-mail Cliente' },
  { value: 'EMAIL_INTERNO', label: 'E-mail Interno' },
  { value: 'WEBHOOK', label: 'Webhook' },
];

export const FREQUENCIAS_NOTIFICACAO: { value: FrequenciaNotificacao; label: string; desc: string }[] = [
  { value: 'IMEDIATO', label: 'Imediato', desc: 'Envio ao detectar evento' },
  { value: 'DIARIO', label: 'Diário', desc: 'Resumo diário às 08h' },
  { value: 'SEMANAL', label: 'Semanal', desc: 'Resumo semanal às segundas' },
];

export interface SeaRegraNotificacao {
  id: string;
  cliente_nome?: string | null;
  cnpj_consignatario?: string | null;
  tipo_processo: TipoProcessoMaritimo;
  portos: string[];
  eventos_disparo: string[];
  frequencia: FrequenciaNotificacao;
  canais: CanalNotificacaoSea[];
  emails_import?: string | null;
  emails_export?: string | null;
  template_id: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to get color for notification channels
export function getCanalColorSea(canal: string): string {
  switch (canal) {
    case 'EMAIL_CLIENTE': return 'bg-blue-500/20 text-blue-300';
    case 'EMAIL_INTERNO': return 'bg-purple-500/20 text-purple-300';
    case 'WEBHOOK': return 'bg-green-500/20 text-green-300';
    default: return 'bg-white/10 text-white/70';
  }
}

// Helper to get color for tipo processo
export function getTipoProcessoColor(tipo: TipoProcessoMaritimo): string {
  switch (tipo) {
    case 'IMPORT': return 'bg-cyan-500/20 text-cyan-300';
    case 'EXPORT': return 'bg-orange-500/20 text-orange-300';
    case 'BOTH': return 'bg-violet-500/20 text-violet-300';
    default: return 'bg-white/10 text-white/70';
  }
}

// Helper to get color for frequencia
export function getFrequenciaColor(freq: FrequenciaNotificacao): string {
  switch (freq) {
    case 'IMEDIATO': return 'bg-red-500/20 text-red-300';
    case 'DIARIO': return 'bg-amber-500/20 text-amber-300';
    case 'SEMANAL': return 'bg-emerald-500/20 text-emerald-300';
    default: return 'bg-white/10 text-white/70';
  }
}
