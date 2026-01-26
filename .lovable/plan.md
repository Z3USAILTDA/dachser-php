
# Plano: Filtrar ETD >= 2026-01-01 para Exibição E Processamento

## Objetivo
Aplicar o filtro ETD >= 01/01/2026 na Edge Function `draft-fetch-mariadb` para garantir que:
1. Apenas processos de 2026 em diante sejam **exibidos** na tela
2. Apenas processos de 2026 em diante sejam **processados** (tracking Hapag-Lloyd)

---

## Por que isso funciona?

A arquitetura do módulo Status Doc Exportação usa um único ponto de entrada de dados:

```text
draft-fetch-mariadb (fonte única)
        │
        ├──► Grid de Dados (exibição)
        │
        └──► Tracker (processamento)
                │
                └──► draft-track-hapag-multi
                        │
                        └──► draft-save-tracking (persiste em t_consulta_armador)
```

Ao filtrar na fonte (`draft-fetch-mariadb`), nenhum MBL antigo sequer chega ao pipeline de processamento.

---

## Alteração Técnica

### Arquivo:
**`supabase/functions/draft-fetch-mariadb/index.ts`**

### Código Atual (linha 42-56):
```typescript
// Execute query to get MBLs - filtered by ETD last 3 months
const query = `
  SELECT 
    tmd.mawb as mbl_id,
    tmd.tipo_processo,
    tmd.etd,
    tmd.shipper
  FROM 
    dados_dachser.t_master_dados tmd
  WHERE 
    tmd.tipo_processo = 'SEA EXPORT'
    AND tmd.mawb LIKE '%HLC%'
    AND tmd.etd >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
  ORDER BY tmd.etd DESC, tmd.mawb
`;
```

### Código Novo:
```typescript
// Execute query to get MBLs - filtered by ETD from 2026-01-01 onwards
// This ensures both display AND processing only consider 2026+ data
const query = `
  SELECT 
    tmd.mawb as mbl_id,
    tmd.tipo_processo,
    tmd.etd,
    tmd.shipper
  FROM 
    dados_dachser.t_master_dados tmd
  WHERE 
    tmd.tipo_processo = 'SEA EXPORT'
    AND tmd.mawb LIKE '%HLC%'
    AND tmd.etd >= '2026-01-01'
  ORDER BY tmd.etd DESC, tmd.mawb
`;
```

---

## Impacto

| Componente | Efeito |
|------------|--------|
| Grid de Dados | Exibe apenas MBLs com ETD >= 2026-01-01 |
| Tracker Manual | Só processa MBLs listados (todos com ETD >= 2026-01-01) |
| KPIs/Estatísticas | Calculados apenas com dados de 2026+ |
| `t_consulta_armador` | Novos registros serão apenas de 2026+ |
| CCT Dashboard | Sem alteração (usa `mariadb-proxy`) |

---

## Reversibilidade

Para alterar o filtro no futuro:
```sql
-- Voltar para 3 meses dinâmicos:
AND tmd.etd >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)

-- Outra data específica:
AND tmd.etd >= 'YYYY-MM-DD'
```

---

## Passos de Implementação

1. Editar `supabase/functions/draft-fetch-mariadb/index.ts`
2. Alterar condição SQL de `DATE_SUB(CURDATE(), INTERVAL 3 MONTH)` para `'2026-01-01'`
3. Atualizar comentário explicativo
4. Deploy automático da Edge Function

---

## Resultado Esperado

Após a implementação:
- A Grid mostrará apenas MBLs Hapag-Lloyd com ETD a partir de 01/01/2026
- O Tracker só processará esses mesmos MBLs
- Casos antigos (2025 e anteriores) não serão exibidos nem processados
