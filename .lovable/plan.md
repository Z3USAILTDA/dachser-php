## Objetivo

Exibir na tela de Demurrage apenas processos cujo MBL ainda exista em `dados_dachser.t_dados_maritimo.bl_number` (tabela passou por limpa de dados). Containers órfãos em `t_dachser_demurrage_containers` deixam de aparecer em todas as listagens do módulo.

## Filtro padrão (SQL)

```sql
AND EXISTS (
  SELECT 1 FROM dados_dachser.t_dados_maritimo dm
  WHERE TRIM(UPPER(dm.bl_number)) COLLATE utf8mb4_unicode_ci
      = TRIM(UPPER(dc.mbl)) COLLATE utf8mb4_unicode_ci
)
```

## Mudanças (apenas `supabase/functions/mariadb-proxy/index.ts`)

1. **`demurrage_get_containers`** (Monitor) — incluir o `EXISTS` em `whereConditions`.
2. **`demurrage_get_containers_by_mbl`** — só retorna container se o MBL existir em `t_dados_maritimo.bl_number`; fallbacks por tracking/pre-invoice ficam condicionados à mesma checagem.
3. **`demurrage_get_stats`** — agregados (totais, USD, risk_status) consideram apenas containers com MBL presente em `t_dados_maritimo`.
4. **Demais actions `demurrage_*`** que listam containers/pre-invoices/disputas/analytics — aplicar o mesmo `EXISTS` (via join em `t_dachser_demurrage_containers` ou direto pelo MBL da pre-invoice).

## Não muda

- Schema MariaDB (sem migrações, sem deletes).
- Frontend/React.
- `demurrage-recalc`, cron, free-time: cálculo continua igual; só a visibilidade na tela é afetada.

## Memória

Salvar `mem://sea/demurrage-visibility-filter-dados-maritimo`:
"Toda listagem de demurrage filtra por EXISTS em `t_dados_maritimo.bl_number = t_dachser_demurrage_containers.mbl` (TRIM/UPPER + COLLATE utf8mb4_unicode_ci). Containers sem MBL correspondente ficam ocultos após a limpa."

## Validação

- `curl` em `demurrage_get_containers` antes/depois para confirmar redução.
- Conferir um MBL removido da `t_dados_maritimo` — não deve mais aparecer.
- Conferir MBLs presentes — continuam aparecendo normalmente.