

## Plano: Normalizar HAWB no JOIN entre CCT e tracking_status

### Problema

A tabela `t_cct_hawb_api_atual` armazena HAWBs sem hífen (ex: `ABC12345`), enquanto `t_fato_aereo.hawbs_json` armazena com hífen (ex: `ABC-12345`). O `json_contains` faz comparação exata, então o INNER JOIN falha e processos não aparecem no CCT.

### Alteração

**Arquivo: `supabase/functions/mariadb-proxy/index.ts`** — linha ~3631

Substituir:
```sql
INNER JOIN tracking_status ts
  ON json_contains(ts.hawbs_json, JSON_ARRAY(c.hawb))
```

Por uma abordagem que normalize ambos os lados removendo hífens, pontos, espaços e underscores. Como `json_contains` não suporta transformações inline facilmente, a solução é usar um JOIN lateral ou converter para `LIKE`/`LOCATE` com normalização:

```sql
INNER JOIN tracking_status ts
  ON json_contains(ts.hawbs_json, JSON_ARRAY(c.hawb))
  OR json_contains(ts.hawbs_json, JSON_ARRAY(
    CONCAT(LEFT(c.hawb, 3), '-', SUBSTRING(c.hawb, 4))
  ))
```

Essa segunda condição tenta o formato com hífen após os 3 primeiros caracteres (padrão HAWB: `XXX-YYYYYYYY` → `XXXYYYYYYYY`). Se o formato variar, podemos usar `REPLACE` no `hawbs_json` para remover hífens antes do `json_contains`:

```sql
INNER JOIN tracking_status ts
  ON json_contains(ts.hawbs_json, JSON_ARRAY(c.hawb))
  OR json_contains(
    REPLACE(ts.hawbs_json, '-', ''),
    JSON_ARRAY(REPLACE(c.hawb, '-', ''))
  )
```

A segunda abordagem (com `REPLACE`) é mais robusta e cobre qualquer posição do hífen.

### Nenhum outro arquivo alterado

