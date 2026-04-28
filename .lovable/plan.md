# Relatório Detalhado de Conexões ao Banco de Dados — Sistema Dachser

## Objetivo

Gerar um relatório **completo e detalhado** mapeando todas as conexões a bancos de dados do ecossistema Dachser, entregue como **PDF + XLSX + Markdown** em `/mnt/documents/`.

## Escopo

### Bancos cobertos

1. **MariaDB `dados_dachser`** (`MARIADB_HOST`) — operacional principal (~95 edge functions)
   - Tabelas: `t_master_dados`, `t_dados_aereo`, `t_fato_aereo`, `t_air_master`, `t_sea_master`, `t_voucher_*`, `t_demurrage_*`, `t_cct_dashboard_cache`, `t_dachser_analistas`, `t_leadcomex_enrichment_logs`, `t_sla_config`, `t_accrual_entries`, etc.
2. **MariaDB `ai_agente`** (mesmo host) — análise/IA
   - Tabelas: `t_chb_client_config`, `t_analise_documental_historico`, `t_dachser_chb_runs`, `t_dachser_chb_extracted_data`
3. **MariaDB Charges** (`MARIADB_CHARGES_HOST` / `MARIADB_CHARGES_DATABASE`) — Local Charges
4. **Supabase Postgres (Lovable Cloud)** — auth, perfis, papéis, shipments CCT, histórico de análise documental, storage buckets

### Camadas analisadas

- **Edge Functions** (144 totais; ~95 conectam a MariaDB)
- **Frontend `src/`** (hooks, páginas) — uso do client `supabase` e invocações de edge functions
- **Infra/Secrets** — variáveis `MARIADB_*`, `MARIADB_CHARGES_*`, `SUPABASE_*`

## Conteúdo detalhado do relatório

### 1. Sumário Executivo
- Totais por banco (nº de funções, nº de tabelas distintas, nº de hooks consumidores)
- Top 10 funções mais críticas (mais tabelas tocadas, mais chamadas/dia se inferível)
- Mapa de risco resumido

### 2. Diagrama de Arquitetura (ASCII)
Camadas: Frontend → Edge Functions → (MariaDB principal | MariaDB ai_agente | MariaDB Charges | Supabase Postgres) → integrações externas (Hapag, LeadComex, JsonCargo, etc.)

### 3. Inventário por Banco

Para **cada banco**:

#### 3.1 Configuração de conexão
- Secret host/port/user/database utilizado
- Padrão de conexão observado (conexão direta `new Client().connect`, proxy `mariadb-proxy`, `queryWithRetry`)
- Limites conhecidos (`max_user_connections=30` no MariaDB principal)

#### 3.2 Tabela de Edge Functions
Colunas: `função | propósito (1 linha) | tabelas lidas | tabelas escritas | usa proxy? | tem close()? | tem retry? | risco`

#### 3.3 Tabelas do banco
Listagem das tabelas detectadas, com:
- Funções que leem
- Funções que escrevem
- Hooks/páginas frontend que consomem indiretamente

#### 3.4 Tabelas Postgres (Supabase)
- Schema, RLS policies resumidas, hooks que consomem direto via `supabase` client

### 4. Inventário Frontend
- Hook → Edge Function → Banco/Tabelas
- Páginas que invocam edge functions diretamente (sem hook)
- Uso direto do client Supabase (auth, profiles, user_roles, shipments)

### 5. Integrações Externas (contexto de tráfego DB)
- Hapag-Lloyd, LeadComex, JsonCargo, FlightRadar, LH Cargo, Azul, Anthropic, OpenAI, Lovable AI Gateway, Resend, SMTP — quais funções chamam e quais tabelas MariaDB persistem o resultado

### 6. Análise de Riscos e Recomendações
- Pontos de saturação (`max_user_connections`)
- Funções sem `close()` em `finally`
- Queries longas sem timeout/retry
- Polling agressivo no frontend
- Tabelas sem índice óbvio para joins frequentes (heurística por nome de coluna)
- Recomendações de pooling, cache (`t_cct_dashboard_cache` como referência), e proxy unificado

### 7. Apêndices
- Lista completa de secrets relacionados a DB
- Glossário de prefixos (`t_`, `t_dachser_`, `t_air_`, `t_sea_`, `t_voucher_`, `t_demurrage_`, `t_cct_`)

## Como será gerado (técnico)

1. **Script de varredura** em `/tmp/scan-db.ts` (Deno):
   - Percorre `supabase/functions/*/index.ts`
   - Detecta padrões: `new Client()`, `Deno.env.get("MARIADB...")`, `db: "..."`, chamadas a `mariadb-proxy`
   - Extrai referências SQL via regex multi-padrão (`FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `CREATE TABLE`)
   - Extrai propósito da função do comentário/header ou do nome
   - Detecta presença de `close()`, `try/finally`, `queryWithRetry`, timeouts
2. **Script de varredura frontend** em `src/hooks` e `src/pages`:
   - Mapeia `supabase.functions.invoke('xxx')` → edge function
   - Mapeia `supabase.from('xxx')` → tabela Postgres
3. **Geração XLSX** (openpyxl) com 6 abas:
   - `Resumo`, `MariaDB-dados_dachser`, `MariaDB-ai_agente`, `MariaDB-Charges`, `Postgres`, `Frontend-Map`, `Riscos`
   - Coloração: azul=inputs, amarelo=alertas, vermelho=risco alto
4. **Geração PDF** via Markdown → `pandoc` (ou impressão do XLSX) com formatação dachser (cabeçalho, paginação)
5. **Markdown** versão navegável e versionável
6. **QA**: converter PDF para imagens e inspecionar todas as páginas; validar XLSX com `recalculate_formulas.py`

## Entregáveis

- `/mnt/documents/dachser-db-connections-report.pdf` — relatório formatado para leitura
- `/mnt/documents/dachser-db-connections.xlsx` — planilha multi-aba para filtragem
- `/mnt/documents/dachser-db-connections-report.md` — versão Markdown
- Resumo no chat com principais achados e riscos

Sem qualquer alteração no código da aplicação ou nos bancos — apenas leitura e geração de artefatos.
