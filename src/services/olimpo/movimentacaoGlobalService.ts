import { getOlimpo, type OlimpoListParams } from "./common";

export function getMovimentacaoGlobal(params: OlimpoListParams = {}) {
  return getOlimpo("/movimentacao-global", params);
}

export function getMovimentacaoGlobalSummary(params: OlimpoListParams = {}) {
  return getOlimpo("/movimentacao-global/summary", params);
}

export function getMovimentacaoGlobalFilters() {
  return getOlimpo("/filters");
}

export function getMapboxToken() {
  return getOlimpo("/mapbox-token");
}
