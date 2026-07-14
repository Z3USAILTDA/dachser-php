// Service da tela air/tracking-aereo.
//
// Esta camada concentra TODA a comunicação de dados da tela com o backend interno.
// A tela não fala diretamente com banco nem com Supabase — apenas com estes endpoints:
//   GET  /api/air/tracking-aereo            -> lista de AWBs (tabela + base dos cards)
//   POST /api/air/tracking-aereo/failed-alert
//   POST /api/air/master-swaps              -> badges de troca de master por AWB
//   GET  /api/air/master-discrepancies      -> discrepâncias pendentes de troca de master
//   POST /api/air/master-discrepancies/resolve
//
// Todos os caminhos são relativos; em produção o domínio encaminha /api para o backend.

import { apiGet, apiPost } from "./apiClient";

export interface AirTrackingResponse {
  success: boolean;
  data?: any[];
  failed_count?: number;
  error?: string;
  message?: string;
  request_id?: string;
}

export interface AirTrackingParams {
  /** Aborta a requisição (timeout/cancelamento). */
  signal?: AbortSignal;
}

/** Lista completa de processos aéreos (alimenta tabela e cards) — uma única requisição, sem paginação. */
export async function getAirTrackingAereo(params: AirTrackingParams = {}): Promise<AirTrackingResponse> {
  return apiGet(`/api/air/tracking-aereo`, { signal: params.signal });
}

/** Opções de filtro derivadas do banco (companhias, analistas, serviços). */
export async function getAirTrackingAereoFilters(): Promise<{
  success: boolean;
  filters?: { airlines: string[]; analysts: string[]; services: string[] };
  error?: string;
}> {
  return apiGet(`/api/air/tracking-aereo/filters`);
}

/** Métricas agregadas para os cards (total, trânsito, alerta, críticos). */
export async function getAirTrackingAereoSummary(): Promise<{
  success: boolean;
  summary?: { total: number; transit: number; alert: number; critical: number };
  error?: string;
}> {
  return apiGet(`/api/air/tracking-aereo/summary`);
}

/** Badges de "troca de master" para os AWBs visíveis. */
export async function getMasterSwaps(awbs: string[]): Promise<{ success: boolean; data?: any[] }> {
  return apiPost(`/api/air/master-swaps`, { awbs });
}

/** Discrepâncias pendentes de troca de master. */
export async function getMasterDiscrepancies(): Promise<{ success: boolean; data?: any[] }> {
  return apiGet(`/api/air/master-discrepancies`);
}

/** Resolve uma discrepância escolhendo o master correto. */
export async function resolveMasterDiscrepancy(payload: {
  id: number;
  awb_escolhido: string;
  user: string;
}): Promise<{ success: boolean; error?: string; descartados?: string[]; awb_escolhido?: string }> {
  return apiPost(`/api/air/master-discrepancies/resolve`, payload);
}

/** Sinaliza ao backend AWBs com falha de rastreio (alerta/auditoria). Best-effort. */
export async function reportTrackingFailures(awbs: string[]): Promise<void> {
  try {
    await apiPost(`/api/air/tracking-aereo/failed-alert`, { awbs });
  } catch {
    /* alerta é best-effort; não deve impactar a UI */
  }
}
