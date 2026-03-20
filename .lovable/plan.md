

## Plano Completo: Correções na Régua de Cobrança e Disputas

### 1. Importação de Planilha — Modal de Duplicados

**Problema**: Ao reimportar planilha, registros existentes são silenciosamente ignorados. Sem feedback ao usuário.

**Solução**:

**Backend** (`supabase/functions/mariadb-proxy/index.ts`):
- Nova action `check_disputas_planilha`: recebe itens parseados, faz SELECT em `t_fin_disputas` para cada ND, retorna `newItems[]`, `existingItems[]`, `notFoundItems[]`
- Alterar `import_disputas_planilha`: aceitar flag `forceUpdate: boolean` — quando `true`, faz UPDATE em vez de skip

**Frontend** (`src/pages/FinanceiroDisputa.tsx`):
- Alterar `handleImportSpreadsheet`: parsear → chamar `check_disputas_planilha` → se há duplicados, abrir modal; senão importar direto
- Modal com tabela de duplicados (ND, Cliente, Responsável) e 3 botões: **Substituir Todos** / **Importar apenas novos** / **Cancelar**

---

### 2. Observações e Prazo não sobem da Planilha

**Problema**: `parseSpreadsheet` não mapeia coluna "prazo"/"vencimento"/"deadline".

**Solução** (`src/pages/FinanceiroDisputa.tsx`):
- Adicionar mapeamento de coluna "prazo", "vencimento", "data limite", "deadline" via `findColumnIndex`
- Propagar campo `prazo` no item enviado ao backend (UPDATE via `forceUpdate` resolve a persistência)

---

### 3. Exportação Excel — Valor e Total Valor com contagem em vez de soma

**Problema**: Posições de colunas no sumário não batem com os headers.

**Solução** (`src/utils/disputaExcelExport.ts`):
- Alinhar "Total Valor:" + soma na coluna "Valor (R$)" (índice 6)
- Garantir que `r.valor` seja número raw nos dados

---

### 4. Erro ao Editar Observação ou Excluir Disputa

**Problema**: `update_disputa_observacoes` pode falhar por mismatch de chave; `delete_disputa` pode ter constraints incompatíveis.

**Solução** (`supabase/functions/mariadb-proxy/index.ts`):
- `update_disputa_observacoes`: trocar UPSERT por check-then-update (SELECT → UPDATE/INSERT)
- `delete_disputa`: adicionar try/catch com logging detalhado e retorno de erro específico

---

### 5. E-mails Agrupados não Enviam

**Problema**: `regua-send-aging` usa driver instável `mysql@v2.12.1` (Deno) que causa timeouts.

**Solução** (`supabase/functions/regua-send-aging/index.ts`):
- Migrar para `npm:mysql2/promise` com `connectWithRetry` (3 tentativas com backoff)
- Try/catch granular separando erros de DB vs erros de Resend

**Frontend** (`src/pages/ReguaCobranca.tsx`):
- Melhorar tratamento de erro para exibir mensagem específica

---

### Arquivos alterados

| Arquivo | Alterações |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | `check_disputas_planilha`, `forceUpdate`, fix observações e delete |
| `src/pages/FinanceiroDisputa.tsx` | Modal duplicados, mapeamento "prazo" |
| `src/utils/disputaExcelExport.ts` | Corrigir alinhamento sumário |
| `supabase/functions/regua-send-aging/index.ts` | Migrar driver, retry |
| `src/pages/ReguaCobranca.tsx` | Melhor tratamento de erros |

