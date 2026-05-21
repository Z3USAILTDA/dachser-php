## Objetivo

Reduzir drasticamente os MBLs presos como "Aguardando container" / "NAO_ENCONTRADO" expandindo as fontes consultadas no backfill antes de cair para chamadas de API externa.

## Diagnóstico do que existe hoje

Hoje o `sync_sea_tracking` (`supabase/functions/olimpo-proxy/index.ts`) faz backfill de container em **uma única fonte**:

```sql
-- Atual (Step 6)
FROM dados_dachser.t_master_dados md
JOIN dados_dachser.t_tracking_sea ts ON ts.mbl_id = md.mawb
WHERE md.tipo_processo LIKE '%SEA%'
  AND md.container REGEXP '^[A-Z]{4}[0-9]{7}$'
```

Problemas observados:

1. `t_master_dados.mawb` raramente é preenchido para SEA EXPORT — os MBLs são inseridos a partir de `t_sea_master.master` e `t_dados_maritimo.bl_number`, mas **nenhuma dessas duas tabelas é consultada para container**.
2. O regex `^[A-Z]{4}[0-9]{7}$` rejeita silenciosamente containers que vêm com hífen, espaço, dígito verificador faltando ou minúsculas, mesmo quando são válidos depois de normalizar.
3. Não há fallback para `ai_agente.t_dachser_sea_items` / `ai_agente.t_dachser_container` / `ai_agente.t_dachser_container_tracking`, que já têm milhares de containers casados a MBL/booking.
4. Quando o container é descoberto via API (`enrich_sea_containers`), ele é gravado, mas **a linha PENDENTE só é deletada se o backfill estrutural rodar depois** — então a UI ainda mostra duas linhas (uma com container e outra como AGD) durante uma janela.

## Mudanças propostas (somente backend, sem schema)

Arquivo: `supabase/functions/olimpo-proxy/index.ts`, dentro do bloco `action === 'sync_sea_tracking'`, **substituir** a Step 6 atual por um pipeline em cascata. **Nada mais é tocado** — Step 5 (insert), Step 7 (delete PENDENTE), Step 8 (shipping_line) continuam iguais.

### Step 6 novo: cascata de fontes

Para cada MBL ativo em `t_tracking_sea` cujo `container IS NULL OR container IN ('PENDENTE','NAO_ENCONTRADO','')`, tentar na ordem e **parar na primeira que devolver um container válido**:

```text
1. t_sea_master.master   → coluna container/cntr_no se existir nessa tabela
2. t_dados_maritimo.bl_number → colunas container / container_number / num_container
3. t_master_dados.mawb   → fonte atual (mantida)
4. ai_agente.t_dachser_sea_items (container, mbl/bol)
5. ai_agente.t_dachser_container_tracking (container, mbl_reference)
```

A consulta vai ser uma única query com `LEFT JOIN` em todas e `COALESCE` na ordem acima, devolvendo `(mbl_id, container, source)`. Normalização aplicada antes de comparar com regex:

```ts
const norm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
// aceitar se norm tem 10-11 chars e bate ^[A-Z]{4}[0-9]{6,7}$
```

### Sub-etapa 6B: dedup determinístico

Após inserir o container real, executar **na mesma transação** o DELETE que hoje vive na Step 7, expandido para também limpar `NAO_ENCONTRADO`:

```sql
DELETE FROM t_tracking_sea
WHERE container IN ('PENDENTE','NAO_ENCONTRADO','')
  AND mbl_id IN (<mbls com container real>)
```

Assim acabamos com a janela de "duas linhas para o mesmo MBL".

### Sub-etapa 6C: descoberta de schema defensiva

Antes de rodar a query, executar uma única vez por invocação:

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA IN ('dados_dachser','ai_agente')
  AND TABLE_NAME IN ('t_sea_master','t_dados_maritimo','t_dachser_sea_items','t_dachser_container_tracking')
  AND COLUMN_NAME REGEXP 'container|cntr'
```

Só monta o `LEFT JOIN` para tabelas/colunas que realmente existirem — evita quebrar o sync se uma das fontes mudar nome ou for removida.

### Resposta da action

Adicionar contadores por fonte no JSON de retorno:

```json
"backfill_by_source": {
  "t_sea_master": 0,
  "t_dados_maritimo": 0,
  "t_master_dados": 0,
  "t_dachser_sea_items": 0,
  "t_dachser_container_tracking": 0
}
```

Útil para medir a eficácia depois do deploy.

## Validação

1. Rodar `sync_sea_tracking` manualmente e ler `backfill_by_source` no response.
2. Comparar contagem de AGD no dashboard `/sea/tracking` antes e depois.
3. Para os MBLs que **continuarem** sem container após a cascata, o pipeline já existente `enrich_sea_containers` (JsonCargo + Hapag) continua sendo o último recurso — sem mudanças.

## Fora de escopo

- Frontend (`ContainerTracking.tsx`) — nenhuma mudança; o sub-status `AGD_NO_CT` já criado anteriormente segue válido.
- Schema MariaDB ou Supabase.
- `enrich_sea_containers` e o cron de retrack.
