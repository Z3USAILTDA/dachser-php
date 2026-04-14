

## Plano: Importação Excel Othello/Totvs RM — Tela filha de FIN

### Visão Geral

Criar tela `/fin/othello-import` para importação de Excel `.xlsx` com 3 abas, processamento client-side com SheetJS, e persistência transacional via edge function no MariaDB (schema `dados_dachser`). Tabelas já existem e estão vazias.

### Arquivos a criar

#### 1. `src/pages/fin/OthelloImport.tsx` — Página de importação

- Upload de `.xlsx`, leitura client-side com `xlsx` (SheetJS, `raw: false` para valores calculados)
- Validação das 3 abas e cabeçalhos exatos
- Processamento: Base Totvs RM primeiro (indexar por `processo`), depois Nacional (cruzar `faturado_em`/`comentarios`), depois Interacional (colunas A-H)
- Cálculos no frontend: `faturado_no_othello_por`, `faturado_no_rm_por`, `regiao`, `divisao_por_modal`, `othello_rm`, campos por pessoa/participação
- Acesso restrito: `is_admin === 1` (Z3US e DACHSER)
- Usa `PageLayout`, segue design existente (background dachser, cards, etc.)
- Resumo final: linhas importadas por aba, erros

**Tipos de dados respeitados conforme schema MariaDB:**
- `id_ref_object`, `processo`: BIGINT (número)
- `service_date`, `faturado_em`: DATE
- `revenue`, `revenue_transit`, `total_revenue`, `valor_total_faturado`: DECIMAL(18,2)
- `filial`: INT
- `participacao`: DECIMAL(10,4)
- `faturado_em` (nacional): VARCHAR(50) — texto, não data
- Demais: VARCHAR com tamanhos respeitados

#### 2. `supabase/functions/fin-othello-import/index.ts` — Edge function

- Recebe JSON com dados das 3 abas já processados + nome do arquivo
- Conecta ao MariaDB usando secrets existentes (MARIADB_HOST, etc.)
- Transação completa: `START TRANSACTION` → `DELETE` das 3 tabelas → `INSERT` em batches de 50 → `COMMIT` (ou `ROLLBACK`)
- Campos de controle preenchidos: `arquivo_origem`, `aba_origem`, `linha_excel`, `importado_em`
- Retorna contagens por aba e erros

### Arquivos a modificar

#### 3. `src/App.tsx`
- Import `OthelloImport` + rota `/fin/othello-import`

#### 4. `src/pages/Dashboard.tsx`
- Adicionar item filho em FIN (após Esteira Vouchers/SPO):
```typescript
{
  label: "Importar Othello/RM",
  href: "/fin/othello-import",
  adminOnly: true,
}
```

### Dependências
- Instalar `xlsx` (SheetJS) para leitura client-side do Excel

### Resumo de alterações
| Arquivo | Ação |
|---------|------|
| `src/pages/fin/OthelloImport.tsx` | Novo |
| `supabase/functions/fin-othello-import/index.ts` | Novo |
| `src/App.tsx` | +1 import, +1 rota |
| `src/pages/Dashboard.tsx` | +1 item menu FIN |
| `package.json` | +xlsx |

