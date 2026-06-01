## Diagnóstico

O `WORKER_RESOURCE_LIMIT` persiste porque a mesma Edge Function da tela ainda é a responsável por recalcular o payload (~1.609 linhas + CTEs `JSON_TABLE` em rota/discrepância). `EdgeRuntime.waitUntil` evita bloquear a resposta, mas **não aumenta o orçamento de CPU do worker** — no cold start ou quando o cache expira, o cálculo entra no caminho síncrono e o worker morre.

## Objetivo

Manter o comportamento atual (mesma tela, mesmos campos, mesmo formato de payload), mas:

- recalcular **no máximo 1× a cada 30 minutos**;
- recalcular **sob demanda quando o usuário forçar atualização da página** (F5 / reload), bypassando o cache;
- nas demais requisições, servir leitura leve do cache persistido em `air_tracking_cache`.

## Plano cirúrgico

Arquivo único alterado: `supabase/functions/fetch-tracking-aereo/index.ts`. Sem mudanças em frontend, SQL, schema, RLS ou demais funções.

### 1. Persistir o payload completo no cache existente

Reaproveitar `public.air_tracking_cache` (já existe, RLS pública), adicionando a chave `payload` ao lado de `discrepancy` e `route`:

```text
cache_key = 'payload'
data      = { success, data, failed_count }   // payload final
updated_at = timestamp do último cálculo
```

Nada de nova tabela, nada de nova migração.

### 2. Janela de validade de 30 minutos

Constantes na função:

- `PAYLOAD_TTL_MS = 30 * 60_000` (30 min) — janela fresca
- `PAYLOAD_HARD_TTL_MS = 2 * 60 * 60_000` (2 h) — limite para servir stale enquanto recalcula

Fluxo do handler ao receber request:

1. Lê cache (memória → fallback `air_tracking_cache.payload`).
2. Se idade < 30 min e **sem force**: retorna cache (`x-cache: fresh`).
3. Se idade ≥ 30 min e < 2 h e **sem force**: retorna cache stale imediatamente (`x-cache: stale`) e dispara recálculo em background com lock de concorrência (`refreshInFlight`).
4. Se não há cache ou idade ≥ 2 h: recalcula no caminho síncrono (cold start raro).

### 3. Force refresh quando o usuário recarregar a página

Sem mudar a UI nem o `fetchData` da tela, detectar reload via cabeçalhos HTTP padrão que o browser já envia:

- `Cache-Control: no-cache` ou
- `Pragma: no-cache`

Esses cabeçalhos são enviados automaticamente pelo browser quando o usuário aperta F5/reload "duro" no Chromium/Firefox. Quando presentes:

- Ignora o cache;
- Recalcula no caminho síncrono;
- Persiste o novo payload em `air_tracking_cache.payload`;
- Marca resposta com `x-cache: forced`.

Também aceitamos um parâmetro explícito `?force=1` para o frontend usar caso queira disparar manualmente no futuro — sem mexer no frontend agora.

### 4. Lock de concorrência para o recálculo

`refreshInFlight` global garante que só **uma** execução pesada ocorre por vez, mesmo com múltiplos polls simultâneos. Demais requests aguardam o cache atualizado ou recebem o stale corrente.

### 5. Mantém todo o restante intacto

- Mesmo SQL principal e CTEs de rota/discrepância.
- Mesma eleição IATA, ARR Destino/Conexão, RFS, overrides, SLA.
- Mesmo payload `{ success, data, failed_count }` por linha.
- Mesma tabela, mesma RLS pública.
- Nenhuma alteração em `server/index.js` ou no `TrackingAereo.tsx`.

## Comportamento resultante

| Cenário | O que acontece |
|---|---|
| Poll normal dentro de 30 min | Cache fresh — resposta instantânea, zero CPU pesada |
| Poll após 30 min | Stale servido na hora + 1 recálculo em background |
| Reload da página (F5) | Cabeçalho `no-cache` detectado → recálculo síncrono e cache atualizado |
| Cold start raro (cache > 2 h) | Recálculo síncrono — único momento que ainda usa CPU pesada |
| 5 usuários polling juntos | Apenas 1 recálculo roda; demais recebem cache |

## Garantias

- Sem mudanças visíveis na tela.
- Sem perda de dados ou campos.
- Tracking-truth e manual overrides preservados.
- `WORKER_RESOURCE_LIMIT` deixa de acontecer no tráfego normal — só pode reaparecer se o recálculo único pesado estourar CPU, e nesse caso o cache stale anterior continua sendo servido aos usuários sem erro visível.

## Validação após deploy

- Invocar `fetch-tracking-aereo` várias vezes seguidas → todas 200, `x-cache: fresh` ou `stale`.
- Aguardar 30 min e invocar → `x-cache: stale` + log de `[BG-REFRESH]`.
- Forçar reload no `/air/tracking-aereo` → `x-cache: forced` no log e payload regenerado.
- Conferir `air_tracking_cache.payload.updated_at` avançando.