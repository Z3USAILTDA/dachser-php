import { requestJson } from "./common";

export type OlimpoFiltersResponse = {
  success: boolean;
  filters?: {
    status: string[];
    clientes: string[];
    origens: string[];
    destinos: string[];
  };
};

export async function getOlimpoFilters(): Promise<OlimpoFiltersResponse> {
  return requestJson<OlimpoFiltersResponse>("/api/olimpo/filters", "Erro ao carregar filtros do Olimpo");
}
