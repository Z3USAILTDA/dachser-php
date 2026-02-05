

# Plano: Corrigir Erro na CTE `master_data`

## Problema Detectado
A query `get_sea_tracking` falha com erro:
```
Unknown column 'active' in 'where clause'
```

A tabela `t_sea_master` não possui coluna `active`, mas a CTE `master_data` (linha 1674) ainda faz referência a ela.

## Alteração Necessária

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

**Linha 1674** - Remover condição `active = 1`:

```sql
-- ANTES (linha 1674)
WHERE active = 1 
  AND master IS NOT NULL 
  AND TRIM(master) != ''
  AND etd >= '2025-11-01'

-- DEPOIS
WHERE master IS NOT NULL 
  AND TRIM(master) != ''
  AND etd >= '2025-11-01'
```

## Resultado Esperado
Após a correção:
1. `get_sea_tracking` executará sem erro
2. A tela de monitoramento carregará os dados da nova fonte `t_sea_master`
3. A tabela `t_tracking_sea` será populada via `sync_sea_tracking`

