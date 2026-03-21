

## Plano: Detectar transbordo via `last_event` na query de listagem

### Problema identificado

A detecção de transbordo via `last_event` existe apenas no `refresh_sea_tracking` (processamento por container via API), mas muitos MBLs já possuem `last_event` com localização no banco sem que o refresh tenha rodado após a adição da lógica. Exemplos reais encontrados sem transbordo detectado:

- `"Vessel departed - YANTIAN"` | origem: LAEM CHABANG | destino: SANTOS → **YANTIAN deveria ser transbordo**
- `"Vessel departed - YANTIAN"` | origem: BANG PHLI | destino: SANTOS → **YANTIAN deveria ser transbordo**
- Pelo menos 4+ MBLs nessa condição (HLCUBKK260143931, HLCUBKK260144320, HLCUBKK260144990, HLCUBKK260145016, HLCUBKK260146220)

Casos que são corretamente ignorados (localização = origem ou destino):
- `"Vessel departed - VALENCIA"` | origem: VALENCIA → OK, não é transbordo
- `"Discharged - RIO GRANDE"` | destino: RIO GRANDE → OK, não é transbordo
- `"Departure from - RIO GRANDE"` | destino: RIO GRANDE → OK, não é transbordo

### Solução

Adicionar um novo CTE `transship_last_event` na query `get_sea_tracking` que:

1. Filtra containers com `last_event` contendo ` - ` (separador evento-localização)
2. Extrai o prefixo do evento (antes do ` - `) e a localização (depois do ` - `)
3. Filtra apenas eventos de trânsito: `VESSEL DEPARTED`, `DEPARTURE`, `ARRIVAL`, `DISCHARGED`
4. Exclui eventos locais: `GATE OUT`, `GATE IN`, `LOADED`, `EMPTY`
5. Compara primeiro token da localização com primeiro token de `destino` e `origem`
6. Se diferente de ambos, considera como transshipment_port
7. Adiciona como fallback final no COALESCE da linha 2191

### Alteração

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Adicionar CTE `transship_last_event` na query `get_sea_tracking` (~linha 2114) e incluir no COALESCE da linha 2191 como último fallback |

### SQL do novo CTE

```sql
transship_last_event AS (
  SELECT 
    ts_le.mbl_id,
    MAX(UPPER(TRIM(SUBSTRING_INDEX(ts_le.last_event, ' - ', -1)))) as transshipment_port
  FROM dados_dachser.t_tracking_sea ts_le
  WHERE ts_le.active = 1
    AND ts_le.last_event LIKE '% - %'
    AND ts_le.transshipment_port IS NULL OR ts_le.transshipment_port = ''
    -- Apenas eventos de trânsito
    AND (
      UPPER(ts_le.last_event) LIKE 'VESSEL DEPARTED%'
      OR UPPER(ts_le.last_event) LIKE 'DEPARTURE%'
      OR UPPER(ts_le.last_event) LIKE 'ARRIVAL%'
      OR UPPER(ts_le.last_event) LIKE 'ARRIVED%'
      OR UPPER(ts_le.last_event) LIKE 'DISCHARGED%'
    )
    -- Excluir eventos locais
    AND UPPER(ts_le.last_event) NOT LIKE 'GATE OUT%'
    AND UPPER(ts_le.last_event) NOT LIKE 'GATE IN%'
    AND UPPER(ts_le.last_event) NOT LIKE 'LOADED%'
    AND UPPER(ts_le.last_event) NOT LIKE 'EMPTY%'
    -- Localização != destino (primeiro token)
    AND ts_le.destino IS NOT NULL
    AND UPPER(TRIM(SUBSTRING_INDEX(
          SUBSTRING_INDEX(ts_le.last_event, ' - ', -1), ',', 1
        ))) != UPPER(TRIM(SUBSTRING_INDEX(ts_le.destino, ',', 1)))
    AND UPPER(TRIM(SUBSTRING_INDEX(
          SUBSTRING_INDEX(ts_le.last_event, ' - ', -1), ' ', 1
        ))) != UPPER(TRIM(SUBSTRING_INDEX(ts_le.destino, ' ', 1)))
    -- Localização != origem (primeiro token)
    AND (ts_le.origem IS NULL OR (
      UPPER(TRIM(SUBSTRING_INDEX(
            SUBSTRING_INDEX(ts_le.last_event, ' - ', -1), ',', 1
          ))) != UPPER(TRIM(SUBSTRING_INDEX(ts_le.origem, ',', 1)))
      AND UPPER(TRIM(SUBSTRING_INDEX(
            SUBSTRING_INDEX(ts_le.last_event, ' - ', -1), ' ', 1
          ))) != UPPER(TRIM(SUBSTRING_INDEX(ts_le.origem, ' ', 1)))
    ))
  GROUP BY ts_le.mbl_id
)
```

Linha 2191 atualizada:
```sql
COALESCE(
  MAX(tvc.transshipment_port),
  MAX(td.transshipment_port),
  MAX(th.transshipment_port),
  MAX(tle.transshipment_port)  -- novo fallback
) as transshipment_port,
```

Novo JOIN (~linha 2208):
```sql
LEFT JOIN transship_last_event tle ON tle.mbl_id ... = ts.mbl_id ...
```

