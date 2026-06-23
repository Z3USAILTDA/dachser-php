import { apiGet, apiPost } from "@/services/apiClient";

export type OlimpoListParams = {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  cliente?: string;
  origem?: string;
  destino?: string;
  mode?: string;
  tipo?: string;
  viewMode?: string;
};

export function buildQuery(params: Record<string, unknown> = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, String(value));
    }
  });

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getOlimpo(path: string, params: Record<string, unknown> = {}) {
  return apiGet(`/api/olimpo${path}${buildQuery(params)}`);
}

export function postOlimpo(path: string, body?: unknown) {
  return apiPost(`/api/olimpo${path}`, body);
}
