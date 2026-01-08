// Air module types

export interface EmailClienteRegra {
  id: string | number;
  cliente_nome: string | null;
  cnpj_consignatario: string | null;
  email_cliente: string | null;
  aeroportos: string[];
  eventos_disparo: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// AWB-specific events for triggering notifications (matching tracking screen status codes)
export const EVENTOS_AWB = [
  'DEP',   // Departed
  'ARR',   // Arrived  
  'RCF',   // Received from Flight
  'MAN',   // Manifested
  'NFD',   // Notified for Delivery
  'AWD',   // Awaiting Delivery
  'DLV',   // Delivered
  'POD',   // Proof of Delivery
  'DIS',   // Discrepancy
  'OFLD',  // Offloaded
  'NIL',   // Nil (no info)
  'NIF',   // Not Found
  'FOH',   // Freight on Hand
  'BKD',   // Booked
  'RCS',   // Received from Shipper
] as const;

export type EventoAWB = typeof EVENTOS_AWB[number];

export const AEROPORTOS_COMUNS_AWB = ['GRU', 'VCP', 'GIG', 'CNF', 'POA', 'CWB', 'SSA', 'REC', 'FOR', 'BSB'];
