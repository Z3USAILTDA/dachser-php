## Diagnóstico

Logs do último sync:

```text
[sync_sea_tracking] Found 252 candidates from t_sea_master
[sync_sea_tracking] Found 0 candidates from t_dados_maritimo
[sync_sea_tracking] 0 to insert, 1 to reactivate
```

A query de candidatos de `t_dados_maritimo` filtra apenas por `dm.created_at >= '2026-02-01'`. Processos novos cujo `created_at` está vazio, antigo, ou cuja data real de entrada está em `master_insert`, são descartados antes da validação de MBL — por isso nenhum é adicionado.

## Ajuste proposto (cirúrgico, apenas em `sync_sea_tracking`)

Em `supabase/functions/olimpo-proxy/index.ts`, na CTE de candidatos de `t_dados_maritimo` (~linha 2715):

1. Substituir o filtro atual:
   ```sql
   AND dm.created_at >= '2026-02-01'
   ```
   por um filtro que considere `created_at` **e** `master_insert`, aceitando o registro se qualquer um dos dois for válido:
   ```sql
   AND (
     dm.created_at    >= '2026-02-01'
     OR dm.master_insert >= '2026-02-01'
   )
   ```
   Assim, processos novos que só têm `master_insert` preenchido (ou só `created_at`) passam a entrar como candidatos.

2. Manter intactas todas as demais regras:
   - validação de formato de MBL (`VALID_MBL_PREFIXES` + regex SCAC);
   - exclusão de booking/refs internas (`EBKG`, `BKNG`, `GLNL`, `GLSL`, `GLDL`, `BRSA`);
   - exclusão de HAWBs brasileiros (`^BR[A-Za-z]{3}`);
   - `INSERT ... ON DUPLICATE KEY UPDATE active=1` (não sobrescreve dados de MBLs já ativos).

3. Não alterar a CTE de `t_sea_master` nem a lógica de reativação.

## Resultado esperado

Após o redeploy, o log deve passar a mostrar candidatos > 0 vindos de `t_dados_maritimo`, e MBLs novos com `master_insert` recente (mesmo sem `created_at`) serão inseridos em `t_tracking_sea`.