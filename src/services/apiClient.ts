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
  // Lê como texto primeiro (em vez de res.json() direto) para que, se o JSON
  // vier inválido/truncado (conexão cortada, HTTP/2 interrompido, etc.),
  // consigamos registrar a resposta bruta recebida antes de decidir se vale
  // a pena tentar novamente — nunca mascarar silenciosamente o problema.
  let raw = "";
  try {
    raw = await res.text();
  } catch (readErr) {
    // O corpo nunca chegou a ser lido (stream cortado a meio caminho — ex.:
    // ERR_HTTP2_PROTOCOL_ERROR). Isto NÃO é uma resposta vazia legítima:
    // é uma falha de rede/conexão. Reporta como tal, sem disfarçar.
    console.error("[apiClient] Conexão interrompida ao ler o corpo da resposta:", {
      url: res.url,
      status: res.status,
      error: readErr instanceof Error ? readErr.message : String(readErr),
    });
    throw new Error("Conexao interrompida ao ler a resposta da API (rede/HTTP2). Tente novamente.");
  }
  let body: any = null;
  let parseFailed = false;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }
  }

  if (!res.ok) {
    const msg = body?.error || body?.message || `Erro ${res.status} ao comunicar com a API`;
    throw new Error(msg);
  }

  if (parseFailed) {
    console.error("[apiClient] JSON inválido recebido do backend:", {
      url: res.url,
      status: res.status,
      bodySnippet: raw.slice(0, 1000),
    });
    throw new Error("Resposta invalida da API. Verifique se o backend esta publicado e se /api esta encaminhando para o servidor.");
  }

  if (body === null && res.status !== 204 && raw.length > 0) {
    throw new Error("Resposta invalida da API. Verifique se o backend esta publicado e se /api esta encaminhando para o servidor.");
  }

  if (body === null && res.status !== 204 && raw.length === 0) {
    console.error("[apiClient] Resposta vazia do backend:", { url: res.url, status: res.status });
    throw new Error("Resposta vazia da API. Verifique se o backend esta publicado e se /api esta encaminhando para o servidor.");
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
