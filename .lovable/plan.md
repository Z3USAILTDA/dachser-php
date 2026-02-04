
# Plano: Ajuste das Tabelas t_air_master e t_sea_master

## ✅ IMPLEMENTADO

Todas as alterações foram aplicadas com sucesso:

### 1. Novas Colunas Adicionadas

#### Tabela `t_air_master` (4 novas colunas)
- `wh_treatment` VARCHAR(255) - WH Treatment
- `cct_transm` VARCHAR(100) - CCT Transm.
- `eta_ata` DATETIME - E.T.A. / A.T.A.
- `email_title` TEXT - Email Title Pre-Alert

#### Tabela `t_sea_master` (8 novas colunas)
- `deadline_draft_vgm` DATETIME - Deadline REAL Draft + VGM
- `drafts_sent` TINYINT - Drafts sent
- `deadline_load` DATETIME - Deadline Load
- `cargo_departed` TINYINT - Cargo Departed
- `d_term` VARCHAR(50) - D-Term
- `pod_available` TINYINT - POD available
- `dn_available` TINYINT - DN available
- `hawb` VARCHAR(100) - HAWB No.

### 2. Arquivos Modificados

| Arquivo | Status |
|---------|--------|
| `supabase/functions/mariadb-tables-setup/index.ts` | ✅ Atualizado |
| `src/lib/parseExcelMaster.ts` | ✅ Atualizado |
| `supabase/functions/mariadb-proxy/index.ts` | ✅ Atualizado |

### 3. Próximos Passos

1. **Executar mariadb-tables-setup** - Para criar as novas colunas no banco
2. **Testar importação** - Validar com as planilhas Air Export, Air Import, Sea Import, Sea Export

