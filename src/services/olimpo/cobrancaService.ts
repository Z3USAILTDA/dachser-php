import { getOlimpo, postOlimpo } from "./common";

export type CobrancaViewMode = "product" | "client";

export function getCobranca(params: { viewMode?: CobrancaViewMode } = {}) {
  return getOlimpo("/cobranca", params);
}

export function getCobrancaSummary(params: { viewMode?: CobrancaViewMode } = {}) {
  return getOlimpo("/cobranca/summary", params);
}

export function getBudgetForecast(viewMode: CobrancaViewMode) {
  return getOlimpo("/cobranca/budget-forecast", { viewMode });
}

export function getPaymentTermRating() {
  return getOlimpo("/cobranca/payment-term-rating");
}

export function getAgingHistorical() {
  return getOlimpo("/cobranca/aging-historical");
}

export function getPaymentTermByClient() {
  return getOlimpo("/cobranca/payment-term-by-client");
}

export function getAgingHistoricalByClient() {
  return getOlimpo("/cobranca/aging-historical-by-client");
}

export function getClientDetail(clientName: string) {
  return getOlimpo("/cobranca/client-detail", { clientName });
}

export function getClientEmailLogs(cnpj: string) {
  return getOlimpo("/cobranca/email-logs", { cnpj });
}

export function getClientFaturas(params: {
  clientName: string;
  page?: number;
  pageSize?: number;
  modalFilter?: string;
  vencSort?: string;
}) {
  return getOlimpo("/cobranca/client-faturas", params);
}

export function getClientDisputas(cnpj: string) {
  return getOlimpo("/cobranca/client-disputas", { cnpj });
}

export function saveCobrancaObservacao(body: { cnpj: string; observacao: string; updatedBy?: string }) {
  return postOlimpo("/cobranca/observacao", body);
}

export function getAgingAnalitico() {
  return getOlimpo("/cobranca/aging-analitico");
}
