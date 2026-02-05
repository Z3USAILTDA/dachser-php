

# Plano: Migrar Fonte de Dados para `t_sea_master` (Backend Only)

## Objetivo
Alterar a fonte de dados do monitoramento marítimo de `t_master_dados` para `t_sea_master`, **sem qualquer alteração visual na tela**.

---

## Alterações Necessárias

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

#### 1. Modificar `get_sea_tracking` (linhas 1667-1678)

**Antes** - CTE `master_data` usando `t_master_dados`:
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

**Depois** - CTE `master_data` usando `t_sea_master`:
```sql
master_data AS (
  SELECT 
    TRIM(master) as mbl_id,
    MAX(eta_ata) as eta,
    MAX(etd) as etd,
    MAX(nome_analista) as nome_analista
  FROM dados_dachser.t_sea_master
  WHERE active = 1 
    AND master IS NOT NULL 
    AND TRIM(master) != ''
    AND etd >= '2025-11-01'
  GROUP BY TRIM(master)
),
```

#### 2. Modificar `sync_sea_tracking` (linhas 2004-2031)

**Antes** - Query de candidatos usando `t_master_dados`:
```sql
SELECT
  TRIM(md.mawb) AS mbl_id,
  md.tipo_processo,
  ...
FROM dados_dachser.t_master_dados md
WHERE ...
  AND md.tipo_processo LIKE '%SEA%'
```

**Depois** - Query de candidatos usando `t_sea_master`:
```sql
SELECT
  TRIM(sm.master) AS mbl_id,
  'SEA IMPORT' AS tipo_processo,
  ...
FROM dados_dachser.t_sea_master sm
WHERE ...
```

---

## Mapeamento de Campos

| t_master_dados | t_sea_master | Descrição |
|----------------|--------------|-----------|
| `mawb` | `master` | Código MBL |
| `eta` | `eta_ata` | Data de chegada |
| `etd` | `etd` | Data de saída |
| `nome_analista` | `nome_analista` | Coordenador |
| `cliente` | `customer_no` | Cliente |

---

## O Que NÃO Muda

- Nenhuma alteração em `src/pages/ContainerTracking.tsx`
- Interface `MblTrackingData` permanece igual
- Colunas da tabela permanecem as mesmas
- Filtros e ordenação não são alterados
- Visual da tela 100% preservado

---

## Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| CTE `master_data` (get) | `t_master_dados.mawb` → `t_sea_master.master` |
| CTE `master_data` (get) | `eta` → `eta_ata` |
| Query candidatos (sync) | Trocar tabela fonte para `t_sea_master` |
| Query candidatos (sync) | Remover filtro `tipo_processo LIKE '%SEA%'` (implícito) |

