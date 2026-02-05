
# Plano: Filtrar Monitoramento Marítimo por ETD >= 01/11/2025

## Resumo
Adicionar filtro de data na query `get_sea_tracking` do `olimpo-proxy` para retornar apenas processos marítimos cujo ETD (Estimated Time of Departure) no `t_master_dados` seja a partir de 01/11/2025.

---

## Alteração Necessária

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

#### Modificação na action `get_sea_tracking` (linhas 1664-1808)

**Objetivo**: Adicionar filtro de ETD na CTE `master_data` para limitar os registros retornados.

**Antes (CTE master_data)**:
```sql
master_data AS (
  SELECT 
    TRIM(mawb) as mbl_id,
    MAX(eta) as eta,
    MAX(nome_analista) as nome_analista
  FROM dados_dachser.t_master_dados
  WHERE active = 1 AND mawb IS NOT NULL AND TRIM(mawb) != ''
  GROUP BY TRIM(mawb)
),
```

**Depois (CTE master_data com filtro ETD)**:
```sql
master_data AS (
  SELECT 
    TRIM(mawb) as mbl_id,
    MAX(eta) as eta,
    MAX(etd) as etd,
    MAX(nome_analista) as nome_analista
  FROM dados_dachser.t_master_dados
  WHERE active = 1 
    AND mawb IS NOT NULL 
    AND TRIM(mawb) != ''
    AND etd >= '2025-11-01'
  GROUP BY TRIM(mawb)
),
```

**Modificação adicional no WHERE principal**:

Adicionar condição para que apenas MBLs que existam no `master_data` (com ETD válido) sejam retornados:

```sql
WHERE ts.active = 1
  AND md.mbl_id IS NOT NULL  -- NOVO: Garante que MBL existe em master_data (ETD >= 2025-11-01)
```

---

## Benefícios

| Benefício | Descrição |
|-----------|-----------|
| **Performance** | Reduz volume de dados processados na query |
| **Foco operacional** | Remove processos antigos/encerrados da visualização |
| **Consistência** | Alinha com o filtro já existente no `sync_sea_tracking` |

---

## Consideração de Performance

A CTE `master_data` já existe e faz GROUP BY por `mbl_id`. Adicionar o filtro `etd >= '2025-11-01'` na CTE é mais eficiente do que filtrar depois, pois:
- Reduz o número de linhas na CTE antes do JOIN
- Aproveita índices existentes na coluna `etd` do `t_master_dados`

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Adicionar filtro ETD na CTE master_data e no WHERE principal |

---

## Ordem de Execução

1. **Alterar a CTE master_data** - Adicionar `AND etd >= '2025-11-01'`
2. **Adicionar campo etd na CTE** - Para possível uso futuro na UI
3. **Modificar WHERE principal** - Garantir que apenas MBLs com ETD válido apareçam
4. **Deploy da edge function** - Aplicar alterações
5. **Teste** - Verificar se a tela de Monitoramento FCL exibe apenas processos com ETD a partir de 01/11/2025
