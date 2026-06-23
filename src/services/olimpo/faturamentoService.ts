import { getOlimpo, type OlimpoListParams } from "./common";

export function getFaturamento(params: OlimpoListParams = {}) {
  return getOlimpo("/faturamento", params);
}

export function getFaturamentoSummary(params: OlimpoListParams = {}) {
  return getOlimpo("/faturamento/summary", params);
}
