

## Plano: Adicionar campos "Condição de Pagamento" e "Nome do Vendedor" em duas telas

### 1. Olimpo — Cobrança (ClientDetailSheet): Nova seção de faturas detalhadas

**Backend — `mariadb-proxy/index.ts`**
- Criar nova action `get_client_faturas` que retorna faturas individuais (com paginação server-side) para um dado `clientName`:
  - Campos: `documento`, `nd`, `referencia_cliente`, `numero_nf`, `tipo_documento`, `data_vencimento` (formatada), `data_emissao` (formatada), `valor_nf`, `disputa` (0/1), `condicao_pagamento`, `nome_vendedor`
  - JOIN com `t_dados_nfs` via `id_rm` para trazer `numero_processo` (processo)
  - Parâmetros: `clientName`, `page`, `pageSize` (default 20)
  - Retorna `{ rows, total, page, pageSize }`

**Frontend — `ClientDetailSheet.tsx`**
- Adicionar aba/seção "Faturas" abaixo do detalhamento por CNPJ
- Botão para expandir/carregar a lista de faturas
- Tabela com colunas: Documento, ND, Ref. Cliente, NF, Tipo, Vencimento, Emissão, Valor, Disputa (badge), Processo, Cond. Pagamento, Vendedor
- Paginação usando `TablePagination`
- Sheet expandido para `sm:max-w-4xl` para acomodar a tabela

### 2. Régua de Cobrança (ReguaCobranca.tsx): Adicionar colunas na tabela de faturas

**Backend — `mariadb-proxy/index.ts` (action `get_regua_stage`)**
- Adicionar ao SELECT: `t.condicao_pagamento`, `t.nome_vendedor`

**Frontend — `ReguaCobranca.tsx`**
- Atualizar interface `StageRow` com `condicao_pagamento` e `nome_vendedor`
- Adicionar 2 colunas na tabela do stage: "Cond. Pagamento" e "Vendedor"

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Nova action `get_client_faturas` + adicionar campos em `get_regua_stage` |
| `src/components/olimpo/ClientDetailSheet.tsx` | Seção de faturas detalhadas com tabela paginada |
| `src/pages/ReguaCobranca.tsx` | Interface + 2 colunas extras na tabela de faturas |

### Observação
Os nomes de coluna `condicao_pagamento` e `nome_vendedor` serão usados conforme informado. Se os nomes reais no banco forem diferentes (ex: `cond_pagto`, `vendedor`), ajustaremos após o primeiro teste.

