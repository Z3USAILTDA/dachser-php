## Fase 2C.1 — Correção do bucket D1

### Problema
Bucket D1 do `regua-send-emails` retorna 439 títulos, mas o `get_regua_stage_cr` (régua visual) retorna 29. Diferença causada pelo intervalo amplo `BETWEEN 1 AND 6`.

### Causa
No `supabase/functions/regua-send-emails/index.ts`, função `getStageCondition`, o case `D1` está como:
```sql
DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 1 AND 6
```
A régua visual (mariadb-proxy `get_regua_stage_cr`, linha 2662) usa:
```sql
DATEDIFF(CURDATE(), t.data_vencimento) = 1
```

### Correção (única alteração)
Arquivo: `supabase/functions/regua-send-emails/index.ts`

Substituir apenas a linha do case `D1`:
```ts
case "D1":
  return "DATEDIFF(CURDATE(), t.data_vencimento) = 1";
```

Demais buckets permanecem inalterados (PRE, D7, D15, D30, D45, D60 já validados):
- PRE: `t.data_vencimento >= CURDATE()`
- D7: `BETWEEN 7 AND 14`
- D15: `BETWEEN 15 AND 29`
- D30: `BETWEEN 30 AND 44`
- D45: `tipo_documento <> 'FAT_NF' AND BETWEEN 45 AND 59`
- D60: `(<> 'FAT_NF' AND >= 60) OR ('FAT_NF' AND >= 45)`

### Travas mantidas (sem mudança)
- `dryRun` obrigatório
- Nenhuma chamada ao Resend
- Nenhuma escrita em `t_regua_email_log`
- Destinatário simulado fixo `devs@z3us.ai`
- Apenas primeiro cliente processado
- Fonte única: `dados_dachser.v_fin_regua_contas_receber`
- Soft delete por `doc_key` com `NOT EXISTS`

### Fora de escopo
Frontend, mariadb-proxy, regua-send-aging, disputas, Olimpo.

### Validação pós-deploy
Rodar `dryRun:true` em todos os stages e confirmar:

| Stage | Esperado |
|---|---|
| PRE | 2265 |
| D1  | 29 |
| D7  | 513 |
| D15 | 507 |
| D30 | 134 |
| D45 | 22 |
| D60 | 122 |
