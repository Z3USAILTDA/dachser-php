
# Plano: Ajuste das Tabelas t_air_master e t_sea_master

## Resumo Executivo

Após analisar as 4 planilhas enviadas (Air Export, Air Import, Sea Import, Sea Export), identifiquei **11 colunas** que precisam ser adicionadas ou habilitadas nas tabelas do banco de dados para suportar todos os campos das novas planilhas.

---

## 1. Colunas a Adicionar

### Tabela `t_air_master` (4 novas colunas)

| Coluna | Tipo | Origem na Planilha |
|--------|------|-------------------|
| `wh_treatment` | VARCHAR(255) | "WH Treatment" (Air Import) |
| `cct_transm` | VARCHAR(100) | "CCT Transm." (Air Import) |
| `eta_ata` | DATETIME | "E.T.A. / A.T.A." (Air Import) |
| `email_title` | TEXT | "Email Title Pre-Alert" (Ambas Air) |

### Tabela `t_sea_master` (8 novas colunas)

| Coluna | Tipo | Origem na Planilha |
|--------|------|-------------------|
| `deadline_draft_vgm` | DATETIME | "Deadline REAL Draft + VGM" (Sea Export) |
| `drafts_sent` | TINYINT | "Drafts sent" (Sea Export) |
| `deadline_load` | DATETIME | "Deadline Load" (Sea Export) |
| `cargo_departed` | TINYINT | "Cargo Departed" (Sea Export) |
| `d_term` | VARCHAR(50) | "D-Term" (Sea Export) |
| `pod_available` | TINYINT | "POD available" (Sea Export) |
| `dn_available` | TINYINT | "DN available" (Sea Export) |
| `hawb` | VARCHAR(100) | "HAWB No." (opcional para Sea) |

---

## 2. Alterações Necessárias

### 2.1. Script SQL de Migração (mariadb-tables-setup)

Adicionar instruções `ALTER TABLE` para criar as novas colunas em ambas as tabelas.

### 2.2. Parser Frontend (parseExcelMaster.ts)

- Adicionar novos aliases de colunas no `COLUMN_ALIASES`
- Expandir o array `DB_COLUMNS`
- Atualizar a interface `MasterRow`
- Adicionar conversões no switch de parsing

### 2.3. Backend Insert (mariadb-proxy)

- Modificar a action `bulk_insert_master` para incluir as novas colunas nas queries INSERT de AIR e SEA

---

## 3. Detalhes Técnicos

### 3.1. Novos Aliases de Colunas

```text
deadline_draft_vgm: ["deadline_draft_vgm", "deadline_real_draft_vgm", "draft_vgm_deadline"]
drafts_sent: ["drafts_sent", "draft_sent", "drafts"]
deadline_load: ["deadline_load", "load_deadline", "prazo_embarque"]
pod_available: ["pod_available", "pod"]
dn_available: ["dn_available", "dn"]

# Já existem mas precisam ser adicionados como aliases AIR:
wh_treatment: ["wh_treatment", "wh", "warehouse_treatment", "tratamento_armazem"]
cct_transm: ["cct_transm", "cct", "transmissao_cct"]
email_title: ["email_title", "email_title_pre_alert", "titulo_email"]
eta_ata: ["eta_ata", "e_t_a_a_t_a", "eta", "ata", "arrival"]
```

### 3.2. SQL para Novas Colunas

```sql
-- t_air_master
ALTER TABLE dados_dachser.t_air_master 
  ADD COLUMN IF NOT EXISTS wh_treatment VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS cct_transm VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS eta_ata DATETIME NULL,
  ADD COLUMN IF NOT EXISTS email_title TEXT NULL;

-- t_sea_master
ALTER TABLE dados_dachser.t_sea_master 
  ADD COLUMN IF NOT EXISTS deadline_draft_vgm DATETIME NULL,
  ADD COLUMN IF NOT EXISTS drafts_sent TINYINT NULL,
  ADD COLUMN IF NOT EXISTS deadline_load DATETIME NULL,
  ADD COLUMN IF NOT EXISTS cargo_departed TINYINT NULL,
  ADD COLUMN IF NOT EXISTS d_term VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS pod_available TINYINT NULL,
  ADD COLUMN IF NOT EXISTS dn_available TINYINT NULL,
  ADD COLUMN IF NOT EXISTS hawb VARCHAR(100) NULL;
```

---

## 4. Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-tables-setup/index.ts` | Adicionar colunas para ambas tabelas |
| `src/lib/parseExcelMaster.ts` | Novos aliases, DB_COLUMNS, MasterRow interface |
| `supabase/functions/mariadb-proxy/index.ts` | Atualizar bulk_insert_master para AIR e SEA |

---

## 5. Ordem de Execução

1. **Deploy do mariadb-tables-setup** - Criar colunas no banco
2. **Atualizar parseExcelMaster.ts** - Frontend consegue reconhecer novas colunas
3. **Atualizar mariadb-proxy** - Backend insere dados nas novas colunas
4. **Teste de importação** - Validar com as planilhas fornecidas
