// Air module types

export type CanalNotificacaoAir = 'EMAIL_CLIENTE' | 'EMAIL_INTERNO';

export interface EmailClienteRegra {
  id: string | number;
  cliente_nome: string | null;
  cnpj_consignatario: string | null;
  email_cliente: string | null;
  aeroportos: string[];
  eventos_disparo: string[];
  canais: CanalNotificacaoAir[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// AWB-specific events for triggering notifications
export const EVENTOS_AWB = [
  'DEP',   // Departed
  'ARR',   // Arrived  
  'RCF',   // Received from Flight
  'NFD',   // Notified for Delivery
  'AWD',   // Awaiting Delivery
  'DLV',   // Delivered
  'POD',   // Proof of Delivery
] as const;

export type EventoAWB = typeof EVENTOS_AWB[number];

export const CANAIS_AWB: { value: CanalNotificacaoAir; label: string }[] = [
  { value: 'EMAIL_CLIENTE', label: 'E-mail Cliente' },
  { value: 'EMAIL_INTERNO', label: 'E-mail Interno' },
];

export const AEROPORTOS_COMUNS_AWB = ['GRU', 'VCP', 'GIG', 'CNF', 'POA', 'CWB', 'SSA', 'REC', 'FOR', 'BSB'];
