

## Por que a ordenação ainda fica incorreta mesmo a Q3 já trazendo os 3 últimos eventos

### Causa raiz

A Q3 faz `JSON_EXTRACT(timeline_json, '$[0]')`, `'$[1]'`, `'$[2]'`, `'$[3]'` — ou seja, ela pega os eventos pela **posição física no array JSON**, não pela data.

Isso só funciona quando o array já está fisicamente ordenado por data desc no MariaDB. Para o AWB `020-07276290` o dump confirmou que está. Mas para AWBs como `020-65056110` (caso original do problema) e outros, o crawler grava os eventos em ordens variadas — às vezes ordem de chegada da página da cia aérea, às vezes ordem cronológica asc, às vezes mistura quando o array é atualizado incrementalmente. Resultado: `$[0]` não é necessariamente o evento mais recente.

Além disso, mesmo com array ordenado, há um segundo problema: `last_status_code` (coluna crua de `t_fato_aereo`) é o que a `fetch-status-aereo` usa como fallback e está desatualizado em vários AWBs — não acompanha a timeline.

### Correção (no próprio SELECT, sem pós-processamento JS)

Trocar o bloco que faz `JSON_EXTRACT($[0..3])` por uma CTE com `JSON_TABLE` que ordena por timestamp real e numera as posições:

```sql
WITH eventos_ordenados AS (
  SELECT 
    f.awb,
    jt.descricao,
    jt.local,
    jt.data_str,
    STR_TO_DATE(jt.data_str, '%d %b %Y %H:%i') AS data_real,
    ROW_NUMBER() OVER (
      PARTITION BY f.awb 
      ORDER BY STR_TO_DATE(jt.data_str, '%d %b %Y %H:%i') DESC
    ) AS pos
  FROM t_fato_aereo f
  CROSS JOIN JSON_TABLE(
    f.timeline_json, '$[*]' COLUMNS (
      descricao VARCHAR(500) PATH '$.Description',
      local     VARCHAR(20)  PATH '$.Location',
      data_str  VARCHAR(50)  PATH '$.Date'
    )
  ) jt
)
SELECT 
  MAX(CASE WHEN pos=1 THEN descricao END) AS desc0,
  MAX(CASE WHEN pos=1 THEN local     END) AS loc0,
  MAX(CASE WHEN pos=1 THEN data_real END) AS date0,
  MAX(CASE WHEN pos=2 THEN descricao END) AS desc1,
  ...
FROM eventos_ordenados
GROUP BY awb
```

E aplicar o mesmo `JSON_TABLE + ORDER BY` na query de timeline (`get_awb_tracking_events` em `mariadb-proxy`) — dessa forma o front recebe a timeline já ordenada do banco, sem precisar do `sort` JS atual em `AwbTimelineModal`.

### Resolução de status — derivar do `desc0` ordenado

Com `desc0` agora garantidamente o mais recente, a `fetch-status-aereo` deve resolver o código direto da descrição via `t_eventos_awb` + `t_description_eventos` (Q1+Q2) e **só** cair em `last_status_code` quando a timeline for vazia. Hoje `last_status_code` ganha em ramos onde o regex falha — adicionar reconhecimento das frases padrão IATA em inglês:

```
"Received from flight"  → RCF
"Received from shipper" → RCS
"Manifested"            → MAN
"Departed"              → DEP
"Arrived"               → ARR
"Notified for Delivery" → NFD
"Awaiting Delivery"     → AWD
"Delivered"             → DLV
"Booked"                → BKD
"Freight on Hand"       → FOH
```

### Desempate de timestamps iguais

Quando dois eventos têm o mesmo `STR_TO_DATE`, adicionar tiebreaker no `ORDER BY` por hierarquia IATA (RCF > ARR > DEP > MAN > RCS …) via `FIELD()` ou `CASE` — assim RCS e RCF empatados nunca mais escolhem RCS.

### Limpeza

Remover Edge Function temporária `debug-tracking-aereo-selects` (config.toml + index.ts) — diagnóstico concluído.

Remover do `AwbTimelineModal.tsx` o bloco JS de `IATA_WEIGHT` e `deduped.sort(...)` — passa a confiar na ordenação do SQL.

### Não muda

- Schema de retorno para o front.
- CTE de discrepância (Q6).
- Cron, SLA, visibility, `MANUAL_OVERRIDES`.
- Demais módulos.

### Validação

1. `020-65056110` → exibe `RCF` (era `RCS`).
2. `020-07276290` → continua `RCF` correto.
3. 3-5 amostras em `RCS`/`DEP`/`ARR`/`DLV` legítimos não regridem.

