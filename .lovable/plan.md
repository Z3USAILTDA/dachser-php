

## Plano: Prevenção de Vouchers Duplicados na Esteira

### Problema
O mesmo número SPO (ex: `20251876986`) aparece duas vezes na tabela — um em etapa avançada (Financeiro) e outro em A Processar. Isso ocorre porque a verificação de duplicidade no backend (`save_voucher_esteira`) só bloqueia se o voucher existente **não** está em `A_PROCESSAR`. Quando um voucher já existe em qualquer etapa avançada (FISCAL, SUPERVISOR, FINANCEIRO, ROBO, CONCLUIDO), o sistema retorna erro 409 — mas há cenários onde essa validação falha ou é contornada.

### Causa raiz provável
1. A query de duplicidade usa `LIMIT 1` — se existem dois registros com o mesmo `numero_spo`, pode encontrar o `A_PROCESSAR` primeiro e deletá-lo, permitindo criar um novo, sem perceber que há outro em etapa avançada.
2. Não há `UNIQUE INDEX` na coluna `numero_spo` da `t_vouchers`, então o banco não impede duplicatas a nível de constraint.

### Solução

**1. Backend (`mariadb-proxy/index.ts` — action `save_voucher_esteira`)**
- Alterar a query de duplicidade para buscar TODOS os vouchers com o mesmo `numero_spo` (remover `LIMIT 1`)
- Se **qualquer** registro existente estiver em etapa diferente de `A_PROCESSAR`, bloquear a criação com erro 409
- Só substituir se **todos** os existentes estiverem em `A_PROCESSAR`

```sql
-- Antes
SELECT id, numero_spo, etapa_atual FROM t_vouchers WHERE numero_spo = ? LIMIT 1

-- Depois  
SELECT id, numero_spo, etapa_atual FROM t_vouchers WHERE numero_spo = ?
```

Lógica revisada:
- Se algum resultado tem `etapa_atual` diferente de `A_PROCESSAR` → retornar 409 com ID e etapa do existente
- Se todos são `A_PROCESSAR` → deletar todos e prosseguir com a criação

**2. Frontend (`CreateVoucherDialog.tsx`)**
- Quando receber erro 409 com `existingId`, oferecer botão para navegar até o voucher existente ao invés de apenas mostrar toast de erro

**3. Limpeza dos dados existentes**
- Identificar e remover o voucher duplicado que está em `A Processar` (o que foi criado erroneamente), mantendo o que já avançou no fluxo

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Melhorar query de duplicidade para buscar todos os registros e validar corretamente |
| `src/components/esteira/CreateVoucherDialog.tsx` | Melhorar UX do erro de duplicidade com link para o voucher existente |

