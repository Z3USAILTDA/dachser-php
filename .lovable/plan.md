

## Integrar tbaixas e StatusLan na Filtragem de Vouchers da Esteira

### Contexto Atual

A esteira de vouchers (`get_vouchers_esteira`) filtra apenas por `etapa_atual != 'CONCLUIDO'` para remover processos finalizados. Porem, a tabela `tbaixas` do MariaDB contem registros de baixas financeiras com o campo `StatusLan` que indica:

- **StatusLan 1** = Finalizado
- **StatusLan 2** = Cancelado  
- **StatusLan 3** = Negociado
- **StatusLan 0 ou 4** = Em aberto (deve permanecer visivel)

A mesma logica ja e aplicada na Regua de Cobranca (`regua-send-emails`, `regua-send-aging`, `mariadb-proxy` para NFs).

### Alteracoes Necessarias

#### 1. `get_vouchers_esteira` (mariadb-proxy)

Adicionar um `LEFT JOIN` com `tbaixas` e excluir vouchers cujo `id_rm` corresponda a uma baixa com `StatusLan IN (1, 2, 3)`:

```sql
SELECT v.*, dfv.id_rm as dfv_id_rm, ...
FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv 
  ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci
WHERE ...
  AND NOT EXISTS (
    SELECT 1 FROM dados_dachser.tbaixas b
    WHERE b.IdLancamentoRM = dfv.id_rm 
      AND b.StatusLan IN (1, 2, 3)
  )
```

Isso garante que vouchers ja pagos/cancelados/negociados sejam automaticamente removidos do pipeline ativo.

#### 2. `get_historico_baixas` (mariadb-proxy)

Adicionar a coluna `StatusLan` como informacao visivel e, opcionalmente, filtrar para mostrar apenas baixas com `StatusLan IN (1, 2, 3)` (as efetivamente concluidas), ja que registros com `StatusLan 0/4` ainda estao em aberto.

#### 3. `voucher-sync-setup`

Refinar a marcacao de `BAIXADO` para considerar `StatusLan`:

```sql
UPDATE dados_dachser.t_vouchers v
JOIN dados_dachser.t_dados_financeiro_voucher dfv 
  ON v.numero_spo COLLATE utf8mb4_unicode_ci = dfv.nd COLLATE utf8mb4_unicode_ci
JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
SET v.sync_status = 'BAIXADO'
WHERE v.sync_status = 'ATIVO'
  AND b.StatusLan IN (1, 2, 3)
```

#### 4. `HistoricoBaixasTab.tsx` (UI)

Exibir o `StatusLan` como badge na tabela de historico para que o usuario saiba o status de cada baixa (Finalizado, Cancelado, Negociado, Em Aberto).

### Detalhes Tecnicos

- O JOIN com `tbaixas` usa `dfv.id_rm = b.IdLancamentoRM` (mesmo padrao da Regua)
- Collation `utf8mb4_unicode_ci` nos JOINs entre `t_vouchers` e `t_dados_financeiro_voucher` para evitar erros de collation
- `NOT EXISTS` e preferivel a `LEFT JOIN ... IS NULL` para performance quando a subquery e simples
- Vouchers sem correspondencia em `t_dados_financeiro_voucher` (sem `id_rm`) continuam visiveis no pipeline

### Arquivos Modificados

1. **supabase/functions/mariadb-proxy/index.ts** - `get_vouchers_esteira`: adicionar filtro `NOT EXISTS tbaixas`
2. **supabase/functions/mariadb-proxy/index.ts** - `get_historico_baixas`: incluir `StatusLan` como dado retornado (ja esta presente)
3. **supabase/functions/voucher-sync-setup/index.ts** - Refinar query `BAIXADO` com `StatusLan IN (1, 2, 3)`
4. **src/components/esteira/HistoricoBaixasTab.tsx** - Exibir badge de StatusLan na tabela

