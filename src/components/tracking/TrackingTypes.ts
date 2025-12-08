export interface DhlAwbTracking {
  id: number;
  awb: string;
  hawb: string | null;
  consignee_name: string | null;
  route: string | null;
  status: string | null;
  last_event: string | null;
  last_update: string | null;
  last_checked: string | null;
  analyst: string | null;
  notes: string | null;
  customer_email: string | null;
  terminal: string | null;
  consignee_email?: string | null;
  consignee: string | null;
  whatsapp_alert?: boolean;
  email_alert?: boolean;
  delivered_at?: string | null;
  estimated_delivery?: string | null;
  days_in_transit?: number | null;
  nfd_counter?: number | null;
  bug_alert?: boolean;
}

export interface DashboardStats {
  total_awbs: number;
  active_awbs: number;
  alert_awbs: number;
  critical_awbs: number;
}

export type AlertCategory = "on_time" | "delayed" | "critical";

export interface LogData {
  id: number;
  created_at: string;
  mimicked_operator_id: string | null;
  actor_name: string | null;
  action: string | null;
  new_value: any;
  awb: string | null;
}

export interface EmailHistory {
  id: number;
  created_at: string;
  created_by: string;
  subject: string;
  content: string;
  awb: string | null;
  consignee_email: string | null;
  status: string;
}

export interface ColumnVisibility {
  awb: boolean;
  hawb: boolean;
  consignee: boolean;
  route: boolean;
  status: boolean;
  last_event: boolean;
  last_update: boolean;
  last_checked: boolean;
  analyst: boolean;
  terminal: boolean;
  whatsapp_alert: boolean;
  email_alert: boolean;
  delivered_at: boolean;
  estimated_delivery: boolean;
  days_in_transit: boolean;
  nfd_counter: boolean;
}

export const COLUMN_LABELS: Record<keyof ColumnVisibility, string> = {
  awb: "AWB",
  hawb: "HAWB",
  consignee: "Cliente",
  route: "Rota",
  status: "Rastreio",
  last_event: "Último Evento",
  last_update: "Última Atualização",
  last_checked: "Última Verificação",
  analyst: "Nome Analista",
  terminal: "Terminal",
  whatsapp_alert: "WhatsApp Ativo",
  email_alert: "Email Ativo",
  delivered_at: "Data Entrega",
  estimated_delivery: "Previsão Entrega",
  days_in_transit: "Dias em Trânsito",
  nfd_counter: "Qtd NFD",
};

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  awb: true,
  hawb: true,
  consignee: true,
  route: true,
  status: true,
  last_event: true,
  last_update: true,
  last_checked: true,
  analyst: true,
  terminal: true,
  whatsapp_alert: true,
  email_alert: true,
  delivered_at: true,
  estimated_delivery: true,
  days_in_transit: true,
  nfd_counter: true,
};

export const ALERT_FILTERS = [
  { value: "all", label: "Todas as AWBs" },
  { value: "on_time", label: "No Prazo" },
  { value: "delayed", label: "Em Alerta" },
  { value: "critical", label: "Críticos" },
];

export const ITEMS_PER_PAGE = 10;
