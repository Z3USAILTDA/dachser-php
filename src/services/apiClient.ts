// Cliente HTTP interno do frontend.
//
// Regras de segurança/produção:
// - NUNCA contém usuário, senha, host ou porta de banco. Apenas a URL base da API.
// - Por padrão usa caminho relativo ("/api/..."), o que funciona tanto em localhost
//   quanto em produção (o reverse proxy do domínio encaminha /api para o backend).
// - Opcionalmente aceita VITE_API_BASE_URL ou VITE_API_URL (apenas a URL pública da API)
//   para casos em que o backend roda em outro host/origem. É a única env pública
//   permitida aqui.

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ""
).replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

async function parseAndCheck(res: Response): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body?.error || `Erro ${res.status} ao comunicar com a API`;
    throw new Error(msg);
  }
  if (body === null && res.status !== 204) {
    throw new Error("Resposta invalida da API. Verifique se o backend esta publicado e se /api esta encaminhando para o servidor.");
  }

  return body;
}

export interface ApiGetOptions {
  /** Adiciona headers de no-cache (usado em refresh forçado). */
  noCache?: boolean;
  /** AbortSignal para timeouts/cancelamento. */
  signal?: AbortSignal;
}

export async function apiGet(path: string, options: ApiGetOptions = {}): Promise<any> {
  const res = await fetch(apiUrl(path), {
    method: "GET",
    headers: options.noCache ? { "cache-control": "no-cache", pragma: "no-cache" } : {},
    signal: options.signal,
  });
  return parseAndCheck(res);
}

export async function apiPost(path: string, body?: unknown, options: { signal?: AbortSignal } = {}): Promise<any> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  return parseAndCheck(res);
}

export async function apiPatch(path: string, body?: unknown): Promise<any> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseAndCheck(res);
}

export async function apiDelete(path: string, body?: unknown): Promise<any> {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseAndCheck(res);
}
