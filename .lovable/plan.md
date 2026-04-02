

## Plano: Trocar fonte de dados de `t_master_dados` para `t_dados_maritimo`

### Situação atual

O cron (`sea-tracking-cron`) **NÃO** chama `sync_sea_tracking` automaticamente — ele apenas roda `olimpo-sync` (que alimenta `t_olimpo_tracking`) e depois enriquece containers existentes. A descoberta de novos MBLs acontece via `sync_sea_tracking` (action do `olimpo-proxy`), que é chamado manualmente ou pela tela.

Existem **3 pontos** que usam `t_master_dados` como fonte de MBLs marítimos:

| Local | Uso |
|-------|-----|
| `olimpo-proxy` → `sync_sea_tracking` (Step 2B) | Fonte secundária de MBLs para `t_tracking_sea` |
| `olimpo-proxy` → action `list_sea_mbls` (CTE `master_dados_new`) | Fonte secundária para listagem na tela |
| `draft-fetch-mariadb` | Alimenta tela Status Doc Exportação |

### O que será feito

**1. Adicionar `sync_sea_tracking` ao cron** como Passo 0 (antes do `olimpo-sync`), garantindo que novos MBLs do MariaDB sejam importados automaticamente a cada execução.

**2. Trocar `t_master_dados` por `t_dados_maritimo`** nos 3 pontos acima:

Mapeamento de colunas:

```text
t_master_dados          →  t_dados_maritimo
─────────────────────────────────────────────
mawb                    →  bl_number
tipo_processo           →  (não existe, inferir como 'SEA IMPORT'/'SEA EXPORT' ou fixar)
etd                     →  etd
eta                     →  eta
shipper                 →  shipper_name
cliente                 →  consignee_nome
nome_analista           →  clerk / clerk_email
hawb                    →  (não existe diretamente)
data_insert             →  created_at / master_insert
```

**3. Arquivos alterados:**

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Trocar `t_master_dados` por `t_dados_maritimo` no `sync_sea_tracking` (Step 2B, ~linhas 2724-2746) e no CTE `master_dados_new` (~linhas 2013-2029) |
| `supabase/functions/draft-fetch-mariadb/index.ts` | Trocar query de `t_master_dados` para `t_dados_maritimo`, ajustando colunas |
| `supabase/functions/sea-tracking-cron/index.ts` | Adicionar Passo 0: chamada a `olimpo-proxy?action=sync_sea_tracking` |

### Detalhes técnicos

**`sync_sea_tracking` Step 2B** (nova query):
```sql
SELECT
  TRIM(dm.bl_number) AS mbl_id,
  'SEA EXPORT' AS tipo_processo,  -- ou lógica baseada em outra coluna
  'PENDENTE' AS container,
  dm.consignee_nome AS consignee,
  dm.clerk_email AS email_analista,
  NULL AS email_cliente
FROM dados_dachser.t_dados_maritimo dm
WHERE dm.bl_number IS NOT NULL
  AND TRIM(dm.bl_number) != ''
  AND dm.created_at >= '2026-02-01'
  AND (validação de prefixo SCAC)
GROUP BY TRIM(dm.bl_number)
LIMIT 300
```

**`draft-fetch-mariadb`** (nova query):
```sql
SELECT 
  dm.bl_number as mbl_id,
  'SEA EXPORT' as tipo_processo,
  dm.etd,
  dm.shipper_name as shipper
FROM dados_dachser.t_dados_maritimo dm
WHERE dm.bl_number IS NOT NULL
  AND dm.created_at >= '2026-02-01'
ORDER BY dm.etd DESC, dm.bl_number
```

**`sea-tracking-cron` Passo 0** — chamada fire-and-forget ao `sync_sea_tracking` antes do `olimpo-sync`.

### Dúvida para prosseguir

A `t_dados_maritimo` não tem coluna `tipo_processo`. Como diferenciar SEA IMPORT de SEA EXPORT? Opções:
- Fixar como `'SEA EXPORT'` (se todos os registros dessa tabela são export)
- Usar outra coluna para inferir (ex: `id_olss`, `cadastro_id`)
- Manter JOIN com `t_master_dados` apenas para pegar `tipo_processo`

### O que NÃO muda

- Nenhuma tabela MariaDB criada/alterada
- Nenhum componente React ou hook (apenas as edge functions)
- Lógica de enriquecimento (sea_seed_smart, carrier-fallback) permanece idêntica
- `t_sea_master` continua como fonte primária no `sync_sea_tracking`

