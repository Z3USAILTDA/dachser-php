

## Plano: Backfill de transshipment_port via last_event em todos os registros

### Objetivo
Atualizar `transshipment_port` em **todos** os registros da `t_tracking_sea` que possuem `last_event` com localização diferente de `destino` e `origem`, usando UPDATE direto no banco (sem depender do refresh container a container).

### Estratégia

Reescrever a edge function `sea-tracking-transship-backfill` para executar um UPDATE em massa na `t_tracking_sea`, aplicando a mesma lógica de detecção que já existe no `refresh_sea_tracking` e no CTE `transship_last_event`:

1. Extrair localização do `last_event` via `SUBSTRING_INDEX(last_event, ' - ', -1)`
2. Filtrar apenas eventos de trânsito (VESSEL DEPARTED, DEPARTURE, ARRIVAL, DISCHARGED)
3. Excluir eventos locais (GATE OUT, GATE IN, LOADED, EMPTY)
4. Comparar primeiro token da localização com primeiro token de `destino` e `origem`
5. Se diferente de ambos → gravar/acumular no `transshipment_port`

### Detalhes técnicos

**UPDATE com acumulação** (mesma lógica do refresh):
- Se `transshipment_port` é NULL/vazio → gravar a localização detectada
- Se já tem valor e a localização já está contida → manter como está
- Se já tem valor e a localização é nova → concatenar com `; `

**SQL do UPDATE direto:**
```sql
UPDATE t_tracking_sea ts
SET transshipment_port = CASE
  WHEN transshipment_port IS NULL OR transshipment_port = '' 
    THEN UPPER(TRIM(SUBSTRING_INDEX(last_event, ' - ', -1)))
  WHEN UPPER(transshipment_port) LIKE CONCAT('%', UPPER(TRIM(SUBSTRING_INDEX(last_event, ' - ', -1))), '%')
    THEN transshipment_port
  ELSE CONCAT(transshipment_port, '; ', UPPER(TRIM(SUBSTRING_INDEX(last_event, ' - ', -1))))
END
WHERE active = 1
  AND last_event LIKE '% - %'
  AND (UPPER(last_event) LIKE 'VESSEL DEPARTED%' OR ...)
  AND NOT (UPPER(last_event) LIKE 'GATE OUT%' OR ...)
  AND localização ≠ destino (primeiro token)
  AND localização ≠ origem (primeiro token)
```

**Também incluir detecção por keywords** (TRANSSHIP/T/S) na `t_tracking_sea_history` para extrair location e gravar no `transshipment_port` da `t_tracking_sea`.

### Alteração

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sea-tracking-transship-backfill/index.ts` | Reescrever para: (1) UPDATE via last_event vs destino/origem na t_tracking_sea, (2) UPDATE via history com keywords de transbordo, (3) Modo dry_run para preview, (4) Acumulação com `; ` |

### Fluxo da função

1. **PASSO 1**: UPDATE em `t_tracking_sea` via lógica `last_event` (localização ≠ destino ≠ origem)
2. **PASSO 2**: UPDATE em `t_tracking_sea` via `t_tracking_sea_history` (eventos com keywords TRANSSHIP/T/S, extraindo `location`)
3. **PASSO 3**: Retornar contagem de registros atualizados e amostra dos resultados

