## Objetivo

Aproveitar as APIs de armadores já implementadas na tela **Draft Exportação** (`draft-track-hapag-multi`, `draft-track-msc`, `draft-track-one`) como fallback em tempo real no fluxo `enrich_sea_containers`, para encontrar containers de MBLs que hoje ficam `PENDENTE` / `NAO_ENCONTRADO` porque a JsonCargo API não responde.

## Situação atual

Já existe a edge function `sea-carrier-fallback` (chamada pelo Passo 4 do `sea-tracking-cron`) cobrindo HAPAG, HAMBURG SUD, MSC e ONE. Hoje ela só roda em lote no cron geral; o `enrich_sea_containers` (acionado MBL a MBL) **não** consome esse fallback, então um MBL Hapag/MSC/ONE que falha na JsonCargo precisa esperar o próximo ciclo do cron.

```ts
// CARRIER_CONFIG atual (mantido como está)
HAPAG_LLOYD: { fn: 'draft-track-hapag-multi', shortName: 'HAPAG' },
HAMBURG_SUD: { fn: 'draft-track-hapag-multi', shortName: 'HAMBURG SUD' },
MSC:         { fn: 'draft-track-msc',         shortName: 'MSC' },
ONE:         { fn: 'draft-track-one',         shortName: 'ONE' },
```

Demais armadores (MAERSK, CMA, COSCO, EVERGREEN, etc.) **não** entram nesta fase — fica para um próximo ciclo.

## Escopo

Mudanças apenas em backend, sem novos armadores e sem usar `draft-track-navigator`/Firecrawl:

- `supabase/functions/sea-carrier-fallback/index.ts` — aceitar query `?single_mbl=<MBL>` para processar um MBL específico.
- `supabase/functions/olimpo-proxy/index.ts` — em `enrich_sea_containers`, chamar `sea-carrier-fallback?single_mbl=...` como **último recurso** por MBL, depois de JsonCargo + Hapag fallback falharem.

Sem mudanças em frontend, schema, `CARRIER_CONFIG`, `draft-track-*` ou no Passo 4 do `sea-tracking-cron` (segue rodando em lote como hoje).

## Mudanças detalhadas

### 1. `sea-carrier-fallback` — modo single-MBL

- Ler `const singleMbl = url.searchParams.get('single_mbl')`.
- Quando presente, **pular** a query SQL `SELECT DISTINCT mbl_id ... LIMIT 40` e usar `pendingRows = [{ mbl_id: singleMbl }]`.
- Restante do loop (sanitização, `detectCarrierFromMbl`, chamada `draft-track-*`, INSERT/UPDATE em `t_tracking_sea`, marcação `NAO_ENCONTRADO`, `last_check`) permanece igual.
- Retorno mantém o mesmo formato (`stats`); inclui `single_mbl_mode: true` quando aplicável para facilitar diagnóstico.

### 2. `olimpo-proxy` → `enrich_sea_containers` — terceiro estágio por MBL

Hoje a sequência por MBL é:

1. JsonCargo (várias variações de MBL).
2. Fallback Hapag (apenas se `effectiveShippingLine === 'HAPAG_LLOYD'`).

Adicionar:

3. **Carrier fallback dedicado por MBL**: se `containers.length === 0` após (1) e (2), chamar
   `fetch(${supabaseUrl}/functions/v1/sea-carrier-fallback?single_mbl=<MBL>)` com `Authorization: Bearer ${SUPABASE_ANON_KEY}`.
   - Só dispara para armadores cobertos por `CARRIER_CONFIG` (HAPAG, HAMBURG_SUD, MSC, ONE) — verificar com `detectShippingLineFromMbl` antes de chamar; se não bater, pular.
   - Se o fallback retornar `discovered > 0`, considerar o MBL enriquecido (`enriched++`).
   - Contabilizar em novo contador `recovered_by_carrier_fallback` no retorno do enrich.

### 3. Diagnóstico

- `sea-carrier-fallback` continua retornando o `stats` atual + `single_mbl_mode` quando aplicável.
- `enrich_sea_containers` ganha no retorno:
  - `recovered_by_carrier_fallback: number`
  - `carrier_fallback_attempts: number` (quantas vezes acionou o fallback)

## Não-objetivos

- **Não** adicionar MAERSK, CMA_CGM, COSCO, EVERGREEN, YANG_MING, HMM, ZIM ao `CARRIER_CONFIG`.
- **Não** usar `draft-track-navigator` / Firecrawl.
- Não alterar `draft-track-hapag-multi`, `draft-track-msc`, `draft-track-one`.
- Não tocar em frontend, schema MariaDB, `sync_sea_tracking`, nem na chamada em lote do `sea-tracking-cron` (Passo 4).
- Não criar novos secrets.

## Como testar

1. Deploy de `sea-carrier-fallback` e `olimpo-proxy`.
2. `POST /sea-carrier-fallback?single_mbl=<MBL_HAPAG_QUE_FALHA>` — verificar que processa apenas esse MBL.
3. `GET /olimpo-proxy?action=enrich_sea_containers&batch_size=20` — conferir `recovered_by_carrier_fallback > 0` em MBLs Hapag/MSC/ONE que antes ficavam `NAO_ENCONTRADO`.
4. Conferir no Container Tracking que esses MBLs agora aparecem com container real e `shipping_line` preenchido (HAPAG/MSC/ONE).

## Risco

- Latência extra por MBL no enrich (até +1 chamada quando JsonCargo e Hapag falham). Mitigado por só rodar para armadores cobertos e por `batch_size` / `max_time_ms` já existentes.
- Sem risco de custo Firecrawl (escopo limitado às APIs oficiais já em uso na Draft Exportação).
