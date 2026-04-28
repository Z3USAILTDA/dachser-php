## Objetivo

Corrigir dois problemas na tela **Monitoramento Pós-Embarque (CCT)**:
1. Coluna **CLIENTE** vazia para vários processos.
2. Aba **Timeline** dos detalhes mostrando "Nenhum evento registrado" para todos os processos.

---

## Correção 1 — Cliente vazio na listagem

### Causa raiz

Em `supabase/functions/mariadb-proxy/index.ts`, linha **4500**, a query `get_cct_shipments_cached` busca o cliente apenas de `t_dados_aereo`:

```sql
a.consignee_nome AS cliente,
```

Para HAWBs sem registro em `t_dados_aereo` (típico de processos `0226102456`, `AMS-27722024`, `BKK-69915067`), retorna `NULL` mesmo quando `t_master_dados.cliente` tem o valor.

### Mudança

A complementação correta é **`t_master_dados` (prioridade) + `t_dados_aereo` (fallback)** — sem usar `nome_consignatario_leadcomex`. O JOIN com `m` (t_master_dados, alias já existente na query) já está montado, basta usar a coluna `m.cliente`.

`supabase/functions/mariadb-proxy/index.ts` (linha 4500):

```sql
-- antes
a.consignee_nome AS cliente,

-- depois
COALESCE(NULLIF(TRIM(m.cliente), ''), NULLIF(TRIM(a.consignee_nome), '')) AS cliente,
```

- `m.cliente` (t_master_dados) tem prioridade — é a fonte oficial do cadastro.
- `a.consignee_nome` (t_dados_aereo) é fallback quando o master ainda não foi cadastrado.
- `NULLIF(TRIM(...), '')` evita que strings em branco "ganhem" do valor seguinte.

Mudança cirúrgica de 1 linha. Filtros, joins, ordem e demais campos permanecem inalterados.

---

## Correção 2 — Timeline de eventos vazia

### Causa raiz

O backend retorna `eventos` da `t_cct_dashboard_cache` como **string pipe-separada**:

```
"Chegada Informada | 25/03/2026 19:18:08 || Entregue | 01/04/2026 16:22:55 || Informada | 24/03/2026 08:25:59 || Recepcionada | 26/03/2026 04:54:01"
```

Formato:
- Eventos separados por `||`
- Cada evento: `Descrição | dd/MM/yyyy HH:mm:ss`

Mas o parser `parseAndSortEventos` em `src/hooks/useCCTData.ts` (linhas 81-165) faz **`JSON.parse(raw)`** e, ao falhar, cai silenciosamente no `catch` retornando `[]`. Como **todas** as linhas do cache vêm em pipe, **todos** os processos ficam sem timeline.

### Mudança

`src/hooks/useCCTData.ts` — função `parseAndSortEventos`:

1. Antes do `JSON.parse`, detectar se a string **começa com `[` ou `{`** (JSON) ou se contém `|` (pipe).
2. Se for **pipe-separada**: split por `||`, depois cada item por `|` em `[descricao, dataStr]`. Converter `dd/MM/yyyy HH:mm:ss` para ISO. Construir objetos `{ descricao, data_hora_evento, codigo_evento }`.
3. Se for **JSON**: manter o caminho atual (retrocompatibilidade).
4. Resto da função (sort cronológico ASC, mapeamento para `CCTEvento`) inalterado.

Normalizar `codigo_evento` a partir da descrição do formato pipe para que `EventTimeline` aplique cores/ícones corretos:
- "Entregue" → `ENTREGUE`
- "Chegada Informada" → `CHEGADA_INFORMADA`
- "Informada" → `MANIFESTADO`
- "Recepcionada" → `RECEPCIONADO`
- "Em trânsito terrestre" → `EM_TRANSITO`
- Outros → `descricao.toUpperCase().replace(/\s+/g, '_')`

Mudança contida em **1 função** de **1 arquivo**.

---

## Resultado esperado

- **Listagem CCT**: processos sem `t_dados_aereo` passam a exibir o cliente vindo do cadastro `t_master_dados`. Quem tem `consignee_nome` continua usando o de `t_dados_aereo` como fallback (sem regressão). `nome_consignatario_leadcomex` **não** é mais consultado.
- **Timeline de detalhes**: todos os processos passam a listar eventos cronologicamente, com ícones e cores corretos por tipo (entregue/recepcionada/informada/etc).

## Arquivos alterados

- `supabase/functions/mariadb-proxy/index.ts` — 1 linha (4500)
- `src/hooks/useCCTData.ts` — função `parseAndSortEventos`

## Não envolve

- Mudanças de schema, RLS, migrations.
- Mudanças em outras queries, joins ou actions do proxy.
- Refatoração de componentes; `EventTimeline` e `ProcessoTimeline` permanecem inalterados.
