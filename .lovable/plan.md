
# Plano: Exibir MBLs Mesmo Sem Containers Encontrados

## Problema Identificado

A query `get_sea_tracking` possui dois filtros que estão excluindo MBLs da tela:

### 1. Filtro de JOIN com `master_data` (linha 1773)
```sql
AND md.mbl_id IS NOT NULL  -- Exclui MBLs que não existem em t_sea_master
```
Isso exclui MBLs que existem em `t_tracking_sea` mas não têm correspondência em `t_sea_master`.

### 2. Cláusula HAVING restritiva (linhas 1776-1782)
```sql
HAVING 
  (
    COUNT(DISTINCT CASE 
      WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', 'IGNORADO', '') 
      AND ts.container IS NOT NULL 
      THEN ts.container 
    END) > 0
    OR (COUNT(*) = 1 AND MAX(ts.container) = 'PENDENTE')
  )
```
Isso exclui MBLs onde **todos** os containers têm status `NAO_ENCONTRADO`.

---

## Alterações Necessárias

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

#### 1. Relaxar filtro do JOIN (linha 1773)
Trocar de `INNER JOIN implícito` para permitir MBLs sem correspondência em `t_sea_master`:

```sql
-- ANTES (linha 1773)
AND md.mbl_id IS NOT NULL

-- DEPOIS
-- Removido: permitir MBLs mesmo sem correspondência em t_sea_master
```

#### 2. Incluir MBLs com containers `NAO_ENCONTRADO` na cláusula HAVING (linhas 1776-1782)

```sql
-- ANTES
HAVING 
  (
    COUNT(DISTINCT CASE 
      WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', 'IGNORADO', '') 
      AND ts.container IS NOT NULL 
      THEN ts.container 
    END) > 0
    OR (COUNT(*) = 1 AND MAX(ts.container) = 'PENDENTE')
  )

-- DEPOIS (adicionar condição para NAO_ENCONTRADO)
HAVING 
  (
    COUNT(DISTINCT CASE 
      WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', 'IGNORADO', '') 
      AND ts.container IS NOT NULL 
      THEN ts.container 
    END) > 0
    OR (COUNT(*) = 1 AND MAX(ts.container) = 'PENDENTE')
    OR (COUNT(*) >= 1 AND MAX(ts.container) = 'NAO_ENCONTRADO')
  )
```

---

## Resultado Esperado

Após as correções:
1. MBLs com containers `NAO_ENCONTRADO` permanecerão visíveis na tela
2. MBLs existentes em `t_tracking_sea` aparecerão mesmo sem correspondência em `t_sea_master`
3. A ordenação priorizará `PENDENTE` no topo, seguido por `NAO_ENCONTRADO`

---

## Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| Linha 1773 | Remover filtro `AND md.mbl_id IS NOT NULL` |
| Linhas 1776-1782 | Adicionar `OR (COUNT(*) >= 1 AND MAX(ts.container) = 'NAO_ENCONTRADO')` |
