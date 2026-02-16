

# Cadastro NOVA -- Tabela `t_dachser_analistas` para Autocomplete de Clerk

## Resumo

Criar uma nova tabela `dados_dachser.t_dachser_analistas` populada a partir de `t_master_dados`, contendo analistas unicos com nome, email e modal (AIR/SEA). Essa tabela sera usada no campo Clerk do "Cadastro NOVA" com o mesmo padrao de autocomplete que `t_clientes_base` tem para Consignee.

## Tabela `t_dachser_analistas`

```text
CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_analistas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome_analista VARCHAR(255) NOT NULL,
  email_analista VARCHAR(255),
  modal VARCHAR(10) NOT NULL COMMENT 'AIR ou SEA',
  ativo BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nome_email_modal (nome_analista, email_analista, modal),
  INDEX idx_nome (nome_analista),
  INDEX idx_modal (modal),
  INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### Populacao inicial (INSERT a partir de t_master_dados)

```text
INSERT IGNORE INTO dados_dachser.t_dachser_analistas (nome_analista, email_analista, modal)
SELECT DISTINCT
  TRIM(nome_analista) as nome_analista,
  TRIM(email_analista) as email_analista,
  CASE
    WHEN tipo_processo LIKE 'AIR%' THEN 'AIR'
    WHEN tipo_processo LIKE 'SEA%' THEN 'SEA'
    ELSE 'OTHER'
  END as modal
FROM dados_dachser.t_master_dados
WHERE nome_analista IS NOT NULL
  AND TRIM(nome_analista) != ''
```

Isso extrai todos os analistas unicos, agrupa por modal (AIR/SEA baseado no prefixo de `tipo_processo`) e preserva o email correspondente.

## Arquivos a criar/modificar

### 1. Modificar: `supabase/functions/mariadb-tables-setup/index.ts`
- Adicionar criacao da tabela `t_dachser_analistas` na secao `dados_dachser`
- Adicionar o INSERT IGNORE para popular com dados existentes de `t_master_dados`

### 2. Modificar: `supabase/functions/olimpo-proxy/index.ts`
- Adicionar action `search_analistas` (mesmo padrao de `search_clientes_base`):
  - Recebe `q` (termo de busca) e `modal` (filtro opcional, ex: "AIR")
  - Query: busca em `t_dachser_analistas` onde `nome_analista LIKE %termo%`, `ativo = 1`, e opcionalmente filtrado por modal
  - Retorna `{ success: true, analistas: [{ nome_analista, email_analista, modal }] }`

### 3. Modificar: `src/pages/air/CadastroNova.tsx` (no plano geral)
- Campo Clerk usa autocomplete identico ao Consignee:
  - Debounce 300ms, busca apos 2 caracteres
  - Chama `olimpo-proxy?action=search_analistas&q=<termo>&modal=AIR&limit=15`
  - Popover exibe nome + email do analista
  - Ao selecionar, preenche o campo Clerk com `nome_analista` e armazena `email_analista` separadamente no formulario

### 4. Atualizar tabela `t_cadastro_aereo`
- Adicionar coluna `clerk_email VARCHAR(255)` para armazenar o email do analista selecionado (alem do nome no campo `clerk`)

## Fluxo do autocomplete Clerk

1. Usuario digita 2+ caracteres no campo Clerk
2. Frontend chama `olimpo-proxy?action=search_analistas&q=termo&modal=AIR&limit=15`
3. Backend busca em `t_dachser_analistas` (filtrado por `modal = 'AIR'` e `ativo = 1`)
4. Popover exibe lista com nome e email
5. Ao selecionar, preenche `clerk` (nome) e `clerk_email` (email) no formulario
6. Ambos sao salvos em `t_cadastro_aereo`

## Resumo de todos os arquivos do plano completo

| Arquivo | Acao |
|---------|------|
| `supabase/functions/parse-hawb-cadastro/index.ts` | **Criar** -- Edge function de extracao via Gemini API direta |
| `supabase/functions/olimpo-proxy/index.ts` | **Modificar** -- Adicionar actions `search_analistas`, `create_cadastro_aereo`, `setup_t_cadastro_aereo` |
| `supabase/functions/mariadb-tables-setup/index.ts` | **Modificar** -- Adicionar criacao + populacao de `t_dachser_analistas` |
| `src/pages/air/CadastroNova.tsx` | **Criar** -- Pagina completa com formulario, upload, autocompletes |
| `src/App.tsx` | **Modificar** -- Adicionar rota `/air/cadastro-nova` |
| `src/pages/Dashboard.tsx` | **Modificar** -- Adicionar item no menu AIR com `z3usOnly: true` |
| `supabase/config.toml` | **Modificar** -- Registrar `parse-hawb-cadastro` com `verify_jwt = false` |

