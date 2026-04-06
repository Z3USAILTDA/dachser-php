

## Plano: Observações — propagação na importação, individual na edição manual

### Resumo

- **Na importação de planilha**: se o ND tem observação, todas as NFs desse ND recebem a mesma observação.
- **Na edição manual (tela)**: apenas a NF editada é atualizada. Sem propagação.

### Alterações

#### 1. Backend — `supabase/functions/mariadb-proxy/index.ts`

**Case `import_disputas_planilha` (linhas ~3265-3303)**

Após o INSERT/UPDATE de cada NF na `t_fin_disputas`, adicionar um UPDATE que propaga a observação para todas as NFs do mesmo ND:

```sql
-- Após inserir/atualizar a disputa da NF atual, propagar observação para todas as NFs do mesmo ND
UPDATE ai_agente.t_fin_disputas 
SET observacoes = COALESCE(?, observacoes), updated_at = NOW()
WHERE nf IN (
  SELECT DISTINCT CONCAT(COALESCE(documento,''), '|', COALESCE(numero_nf,''))
  FROM dados_dachser.t_dados_financeiro_nfs 
  WHERE nd = ? AND nd IS NOT NULL AND nd != ''
)
AND (observacoes IS NULL OR observacoes = '')
```

Isso preenche a observação apenas nas NFs do mesmo ND que ainda não têm observação própria (não sobrescreve observações existentes).

**Case `update_disputa_observacoes` (linhas 2804-2845)** — SEM ALTERAÇÃO. Continua atualizando apenas a NF individual (`WHERE nf = ?`).

#### 2. Frontend — `src/pages/FinanceiroDisputa.tsx`

**`handleObservacoesChange`** — SEM ALTERAÇÃO. Continua enviando apenas o `doc_key` individual, atualizando só aquela NF na tela e no banco.

### Resultado

| Cenário | Comportamento |
|---------|--------------|
| Importação de planilha com observação | Todas as NFs do mesmo ND recebem a observação (se ainda não têm uma) |
| Edição manual na tela | Apenas a NF editada é alterada |

### Arquivo alterado
- `supabase/functions/mariadb-proxy/index.ts` — case `import_disputas_planilha` (~linha 3303)

