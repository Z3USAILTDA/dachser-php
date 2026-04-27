## Objetivo

Restringir o dashboard **CCT** (`/air/cct`) para mostrar **apenas** processos que:
1. **Existam na tela de Tracking Aéreo** (presentes em `t_fato_aereo`); **e**
2. **Não estejam entregues** (`last_status_code` ≠ `DLV` e ≠ `POD`).

A regra de "ARR - DESTINO há mais de 5 dias" **não** será aplicada.

## Mudança

### Backend — `supabase/functions/mariadb-proxy/index.ts` (action `get_cct_shipments`)

Ajustar a CTE `tracking_status` (linhas 3981–3989). Trocar a lista positiva de códigos por uma negativa, aceitando qualquer status intermediário do tracking exceto entregues:

```sql
tracking_status AS (
  SELECT
    tdaf.awb,
    tdaf.last_status_code,
    tdaf.hawbs_json
  FROM ${database}.t_fato_aereo tdaf
  WHERE tdaf.last_status_code NOT IN ('DLV','POD')
    AND json_valid(tdaf.hawbs_json)
)
```

O `INNER JOIN tracking_status` (linha 4098) permanece — é ele que garante que apenas HAWBs presentes na tela de tracking apareçam no CCT.

### Frontend

Nenhuma mudança.

## Validação

1. Abrir `/air/tracking-aereo` e identificar HAWBs visíveis (excluindo DLV/POD).
2. Abrir `/air/cct` e confirmar que todos os HAWBs listados existem no tracking.
3. Confirmar que processos `DLV`/`POD` não aparecem mais no CCT.
4. Confirmar que HAWBs sem registro em `t_fato_aereo` deixam de aparecer no CCT.
