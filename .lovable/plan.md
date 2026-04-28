# Relatório v3 — Conexões reais e tabelas por tela

## Problema com a v2

O scanner usava regex simples `/FROM\s+(\w+)/`, que falhou em vários casos:

- **Queries multilinha** (`FROM \n      t_master_dados`) — o `\n` quebrava o regex e ficava `—`.
- **Template strings com variável** (`INSERT INTO ${table}`, `UPDATE ${table} SET ...`) no `mariadb-proxy`, `voucher-mariadb-sync`, `olimpo-proxy` — sem parse, ficavam vazias ou poluídas.
- **Tabelas referenciadas como string passada do frontend** (ex.: `supabase.functions.invoke('mariadb-proxy', { body: { table: 't_xxx', ... } })`) — não eram coletadas.
- **Operações Postgres em hooks/components** via `supabase.from('t_xxx')` em **components**, não só em hooks/pages.
- Identificadores capturados com lixo (palavras-chave SQL `INNER`, `LEFT`, `INFORMATION_SCHEMA.COLUMNS`, etc.)

Resultado: muitas telas mostraram `Tabelas: —`, perdendo o ponto principal do relatório.

## Plano da v3

### 1. Scanner SQL aprimorado (edge functions)

Para cada `supabase/functions/*/index.ts`:

- **Normalizar o source**: remover comentários (`//`, `/* */`), colapsar whitespace.
- **Regex multilinha**: `/\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+([`"]?[\w.${}]+[`"]?)/gis` com flag `s` para incluir quebras.
- **Whitelist de identificadores válidos**: começam com `t_`, `tbaixas`, `dados_dachser.`, `ai_agente.`, `Charges.`, `INFORMATION_SCHEMA.`, ou o padrão `${var}` (marcado como dinâmico).
- **Blacklist explícita** de palavras-chave SQL.
- **Capturar `${var}`**: marcar a função como "tabelas dinâmicas" e listar as tabelas que o frontend passa nos `body.table`.

### 2. Scanner do frontend para `body.table` / `body.tableName`

Procurar nos arquivos do frontend chamadas como:
```ts
supabase.functions.invoke('mariadb-proxy', {
  body: { action: 'select', table: 't_dachser_demurrage_containers', ... }
})
```

Extrair o valor literal de `table` / `tableName` / `from` e atribuí-lo à tela que faz a chamada. Isso resolve o problema do proxy genérico.

### 3. Cobertura completa de Postgres

Procurar `supabase.from('xxx')`, `supabase.rpc('xxx')` e `supabase.storage.from('xxx')` em:
- `src/pages/**/*.tsx`
- `src/hooks/**/*.{ts,tsx}`
- `src/components/**/*.{ts,tsx}` (componentes usados pelas telas — já parcialmente coberto)
- `src/utils/**/*.ts`

### 4. Resolução transitiva mais profunda

A v2 só seguia `pages → hooks` e `pages → components (1 nível)`. Agora:
- Construir um grafo `pageRel → set(arquivos importados)` (até 2 níveis dentro de `src/`).
- Acumular `invokes`, `pgTables`, `buckets`, `proxyTables` de todos os nós alcançáveis.

### 5. Novo formato por tela

Cada tela mostra:

```text
Tela: src/pages/sea/DraftExportacao.tsx       Rota: /sea/draft-exportacao
Hooks: useDraftData
─ Conexões diretas ────────────────────────────────────
  Postgres (Supabase): shipments, profiles
  Storage:              maritime-files
─ Edge Functions chamadas ─────────────────────────────
  ▸ draft-fetch-mariadb       → MariaDB.dados_dachser
       Lê:    t_master_dados, t_dados_aereo
       Grava: —
  ▸ mariadb-proxy             → MariaDB (genérico)
       Tabelas usadas por esta tela: t_draft_export, t_tracking_sea
  ▸ hapag-tracking            → MariaDB.dados_dachser  + API Hapag
       Lê/Grava: t_tracking_sea, t_sea_master
─ Risco: MÉDIO ────────────────────────────────────────
```

Separação **Lê vs Grava** (FROM/JOIN/SELECT vs INSERT/UPDATE/DELETE) para cada function.

### 6. Entregáveis

- `/mnt/documents/dachser-db-by-module-v3.md`
- `/mnt/documents/dachser-db-by-module-v3.pdf` (mesma identidade visual, novo layout por tela)
- `/mnt/documents/dachser-db-by-module-v3.xlsx` com abas:
  - **Resumo** (telas, fns, tabelas únicas por módulo)
  - **Por-Tela** (uma linha por tela, com listas consolidadas)
  - **Matriz** (tela × function × tabela × operação L/E/Storage)
  - **Cobertura-Tabelas** (cada tabela MariaDB/PG → quais telas a usam)
  - **Edge-Functions** (todas as 143, com Lê / Grava separados)
  - **Sistema-Background** (94 órfãs categorizadas)

### 7. QA

- Spot-check manual de 5 telas (DraftExportacao, AWBList, EsteiraVoucherDetails, DemurrageMonitor, CCTDashboard) comparando o relatório com o código real.
- Render do PDF página a página até não encontrar overflow ou tabelas vazias indevidas.

Sem alteração no código da aplicação ou no banco — apenas geração de artefatos em `/mnt/documents/`.
