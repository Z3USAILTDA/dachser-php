

## Plano: Incluir tipo_conteiner no INSERT da edge function client-freetime-crud

### Problema

O frontend envia `tipo_conteiner` no body do request (linha 111 do DemurrageFreeTimeDialog), mas a edge function ignora esse campo:
- `FreeTimeRecord` (linha 9-24) não tem `tipo_conteiner`
- O `INSERT` (linhas 91-108) não inclui a coluna
- O `UPDATE` (linhas 121-130) também não

### Pré-requisito

A coluna `tipo_conteiner` precisa existir na tabela `t_client_free_time` do MariaDB. Se ainda não foi criada, executar:
```sql
ALTER TABLE t_client_free_time ADD COLUMN tipo_conteiner VARCHAR(100) DEFAULT NULL;
```

### Alterações

**Arquivo: `supabase/functions/client-freetime-crud/index.ts`**

1. Adicionar `tipo_conteiner?: string | null` na interface `FreeTimeRecord` (após linha 15)
2. Adicionar `tipo_conteiner` no SQL do INSERT (linhas 92-108) - coluna e valor
3. Adicionar handler de `tipo_conteiner` no bloco UPDATE (após linha 130)

### Resultado

O valor selecionado no multi-select (ex: `"20DV,40HC"`) será persistido na coluna `tipo_conteiner` do banco.

