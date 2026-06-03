## Problema

Análise da etapa 2 do item 126 ficou em `processing` por mais de 10 min, estourando o timeout do cliente. Os logs da edge `analyze-chb-documents` não mostram nenhuma mensagem `[BG] ...` (Anthropic, Gemini, snapshots, Prompt length) — apenas os `[POLL]` do cliente. Isso indica que a task em background morreu silenciosamente sem atualizar o status no MariaDB, ou que a chamada ao LLM ficou pendurada até o runtime matar o processo.

Causas prováveis (em ordem):
1. **Chamada ao Anthropic/Gemini sem `AbortController`** (linha ~1391). Se o provedor demora, a request fica pendurada até o runtime da edge function matar o worker aos 300s — e o `catch` nunca roda, então `update_chb_run status=error` nunca é gravado.
2. **Prompt inflado**: o bloco de snapshots aprovados + REGRA DE OURO + OCR completo dos arquivos da etapa 1 (já incluídos via `cachedContext`) pode estar empurrando o prompt para um tamanho onde o LLM trava ou retorna timeout.
3. **`processAnalysisInBackground` invocado sem `EdgeRuntime.waitUntil`** em fallback (linha 2835-2836): se o `EdgeRuntime` não existir, a Promise vira fire-and-forget e pode ser cancelada quando a response inicial fecha.

## Mudanças

### 1. Timeout duro nas chamadas LLM (núcleo do fix)
Em `callAnthropicAPI` e `callGeminiAPI`:
- Envolver o `fetch` com `AbortController` + `setTimeout(240_000)` (4 min).
- Se abortar, lançar erro claro `LLM_TIMEOUT` para o catch externo fazer fallback ou marcar `error` no MariaDB.

### 2. Garantia de gravação de erro mesmo em crash silencioso
Em `processAnalysisInBackground`:
- Envolver todo o corpo num `try/catch` externo que SEMPRE chama `update_chb_run status=error` com a mensagem do erro, inclusive timeouts.
- Adicionar `console.log` no início absoluto (antes de qualquer await) para confirmar que a task arrancou.

### 3. Garantir que o background roda
Trocar `EdgeRuntime.waitUntil(...)  ||  processAnalysisInBackground(...)` por:
```ts
const bg = processAnalysisInBackground(...);
if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(bg);
// fire-and-forget já está disparado via bg
```

### 4. Reduzir bloat do prompt de snapshots
- Limitar `snapBlock` a no máximo ~20 linhas por etapa anterior (cortar `rows` longos com `…+N campos`).
- Não duplicar snapshots quando o `cachedContext` (correções do usuário) já cobre os mesmos campos.

### 5. Logging mínimo de diagnóstico
- Logar `[BG] startedAt`, `[BG] step0 ok`, `[BG] anthropic.start`, `[BG] anthropic.end ms=…` para que da próxima vez seja possível identificar exatamente onde travou via `edge_function_logs`.

### 6. Mensagem amigável no front
Em `ConferenciaChb.tsx` (linha 498), trocar a mensagem genérica de "Tempo limite excedido" por uma que oriente o usuário a tentar novamente (a análise será marcada como erro pelo backend graças ao item 2, então o retry funcionará sem ficar preso).

## Arquivos afetados
- `supabase/functions/analyze-chb-documents/index.ts` — itens 1, 2, 3, 4, 5
- `src/pages/ConferenciaChb.tsx` — item 6

## Não faz parte deste plano
- Mudar a tabela de snapshots.
- Trocar provedor de LLM.
- Mexer no `mariadb-proxy`.

## Validação
1. Rodar análise da etapa 2 do item 126 novamente.
2. Conferir nos logs: `[BG] startedAt` → `[BG] anthropic.start` → `[BG] anthropic.end ms=...` → `[BG] Analysis completed`.
3. Se ocorrer timeout, a UI deve mostrar erro em < 5 min com mensagem clara e o status no MariaDB deve estar `error` (não `processing`).
