## Objetivo

Corrigir o erro 500 `Unknown column 'm.tratamentos_especiais'` no action `get_cct_shipments_cached`.

## Diagnóstico

Conforme o schema fornecido, `t_master_dados` **não possui** a coluna `tratamentos_especiais` (existe apenas `tratamento`). A query atual referencia `m.tratamentos_especiais`, causando o erro.

## Mudança

No arquivo `supabase/functions/mariadb-proxy/index.ts`, dentro da query `get_cct_shipments_cached`, substituir a linha:

```sql
m.tratamentos_especiais,
```

por:

```sql
NULL AS tratamentos_especiais,
```

Isso preserva o contrato de retorno (campo `tratamentos_especiais` continua existindo no resultado, apenas vazio) sem quebrar consumidores no frontend.