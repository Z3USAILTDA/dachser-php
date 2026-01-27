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

// Port groups by region for quick selection
export const PORTOS_GRUPOS = {
  // Brasil
  BRASIL_SUL: ["BRSSZ", "BRPNG", "BRITJ", "BRNVT", "BRIOA", "BRRIG"],
  BRASIL_SUDESTE: ["BRSSZ", "BRRIO", "BRVIX"],
  BRASIL_NORDESTE: ["BRSSA", "BRSUA", "BRPEC"],
  BRASIL_NORTE: ["BRMAO"],
  BRASIL_TODOS: ["BRSSZ", "BRPNG", "BRITJ", "BRNVT", "BRIOA", "BRRIG", "BRRIO", "BRVIX", "BRSSA", "BRSUA", "BRPEC", "BRMAO"],
  // Ásia
  ASIA_CHINA: ["CNSHA", "CNNGB", "CNYTN", "CNTAO", "CNXMN", "HKHKG"],
  ASIA_SUDESTE: ["SGSIN", "VNSGN", "MYPKG", "THLCH", "IDTPP", "IDJKT"],
  ASIA_NORDESTE: ["KRPUS", "JPTYO", "JPYOK", "TWKHH", "TWKEL"],
  // Europa
  EUROPA_NORTE: ["NLRTM", "BEANR", "DEHAM", "DEBRV", "GBFXT", "FRLEH"],
  EUROPA_SUL: ["ESVLC", "ESBCN", "ITGOA", "GRPIR", "PTLIS", "PTLEI"],
  // Américas
  AMERICAS_NORTE: ["USLAX", "USLGB", "USNYC", "USSAV", "USHOU", "USMIA"],
  AMERICAS_SUL: ["ARBUE", "UYMVD", "CLVAP", "PECLL", "COBUN", "ECGYE"],
  // Hubs de Transbordo
  HUBS: ["PAPTY", "PACOL", "JMKIN", "BSFPO", "ESALG", "AEJEA", "OMSLH", "LKCMB"],
} as const;

// Human-readable labels for ports
export const PORTOS_LABELS: Record<string, string> = {
  // Brasil
  BRSSZ: "Santos",
  BRPNG: "Paranaguá",
  BRITJ: "Itajaí",
  BRNVT: "Navegantes",
  BRIOA: "Itapoá",
  BRRIG: "Rio Grande",
  BRRIO: "Rio de Janeiro",
  BRVIX: "Vitória",
  BRSSA: "Salvador",
  BRSUA: "Suape",
  BRPEC: "Pecém",
  BRMAO: "Manaus",
  // China
  CNSHA: "Xangai",
  CNNGB: "Ningbo",
  CNYTN: "Yantian",
  CNTAO: "Qingdao",
  CNXMN: "Xiamen",
  HKHKG: "Hong Kong",
  // Sudeste Asiático
  SGSIN: "Singapura",
  VNSGN: "Ho Chi Minh",
  MYPKG: "Port Klang",
  THLCH: "Laem Chabang",
  IDTPP: "Tanjung Priok",
  IDJKT: "Jakarta",
  // Nordeste Asiático
  KRPUS: "Busan",
  JPTYO: "Tóquio",
  JPYOK: "Yokohama",
  TWKHH: "Kaohsiung",
  TWKEL: "Keelung",
  // Europa Norte
  NLRTM: "Rotterdam",
  BEANR: "Antuérpia",
  DEHAM: "Hamburgo",
  DEBRV: "Bremerhaven",
  GBFXT: "Felixstowe",
  FRLEH: "Le Havre",
  // Europa Sul
  ESVLC: "Valencia",
  ESBCN: "Barcelona",
  ITGOA: "Gênova",
  GRPIR: "Piraeus",
  PTLIS: "Lisboa",
  PTLEI: "Leixões",
  // América do Norte
  USLAX: "Los Angeles",
  USLGB: "Long Beach",
  USNYC: "Nova York",
  USSAV: "Savannah",
  USHOU: "Houston",
  USMIA: "Miami",
  // América do Sul
  ARBUE: "Buenos Aires",
  UYMVD: "Montevidéu",
  CLVAP: "Valparaíso",
  PECLL: "Callao",
  COBUN: "Buenaventura",
  ECGYE: "Guayaquil",
  // Hubs
  PAPTY: "Panamá",
  PACOL: "Colón",
  JMKIN: "Kingston",
  BSFPO: "Freeport",
  ESALG: "Algeciras",
  AEJEA: "Jebel Ali",
  OMSLH: "Salalah",
  LKCMB: "Colombo",
};

// Groups for UI quick-select buttons
export const PORTOS_GRUPOS_UI = {
  origem: [
    { label: "+China", key: "ASIA_CHINA" },
    { label: "+Ásia SE", key: "ASIA_SUDESTE" },
    { label: "+Ásia NE", key: "ASIA_NORDESTE" },
    { label: "+Europa N", key: "EUROPA_NORTE" },
    { label: "+Europa S", key: "EUROPA_SUL" },
    { label: "+Américas N", key: "AMERICAS_NORTE" },
    { label: "+Américas S", key: "AMERICAS_SUL" },
    { label: "+Hubs", key: "HUBS" },
  ],
  destino: [
    { label: "+Santos", key: "BRASIL_SANTOS", ports: ["BRSSZ"] },
    { label: "+Sul BR", key: "BRASIL_SUL" },
    { label: "+Sudeste BR", key: "BRASIL_SUDESTE" },
    { label: "+Nordeste BR", key: "BRASIL_NORDESTE" },
    { label: "+Todos BR", key: "BRASIL_TODOS" },
  ],
} as const;

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
  portos_origem: string[];
  portos_destino: string[];
  portos?: string[]; // Deprecated - kept for backward compatibility
  eventos_disparo: string[];
  frequencia: FrequenciaNotificacao;
  canais: CanalNotificacaoSea[];
  emails_import?: string | null;
  emails_export?: string | null;
  template_id: string;
  ativo: boolean;
  is_default: boolean;
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
