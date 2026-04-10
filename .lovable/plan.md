

## Plano: Botão + Modal para baixas sem correspondência na t_dados_financeiro_voucher

### Objetivo
Adicionar um botão na tela de Histórico de Baixas que abre um modal listando todas as baixas com `TipoPagRec = 1` cujo `IdLancamentoRM` **não** possui correspondência na `t_dados_financeiro_voucher`.

### Alterações

**1. Backend — novo action no `mariadb-proxy` (`supabase/functions/mariadb-proxy/index.ts`)**

Criar action `get_baixas_sem_voucher`:
```sql
SELECT b.IdLancamentoRM, b.IdBaixa, b.TipoPagRec, b.ValorBaixado, 
       b.DataDaBaixa, b.UsuarioBaixa, b.StatusLan
FROM dados_dachser.tbaixas b
WHERE b.TipoPagRec = 1 
  AND b.StatusLan IN (0, 1, 2, 3)
  AND b.IdLancamentoRM NOT IN (
    SELECT DISTINCT id_rm FROM dados_dachser.t_dados_financeiro_voucher WHERE id_rm IS NOT NULL
  )
ORDER BY b.DataDaBaixa DESC
LIMIT 2000
```

**2. Frontend — `src/components/esteira/HistoricoBaixasTab.tsx`**

- Adicionar botão "Sem Voucher" ao lado dos botões existentes (Atualizar/Exportar)
- Adicionar estado para controlar abertura do modal e dados
- Ao clicar, chamar `supabase.functions.invoke("mariadb-proxy", { body: { action: "get_baixas_sem_voucher" } })`
- Renderizar modal (Dialog) com tabela mostrando: IdLancamentoRM, Valor Baixado, Data Baixa, Usuário Baixa, Status
- Incluir busca e paginação simples dentro do modal

### Resumo
| Local | Alteração |
|-------|-----------|
| `mariadb-proxy/index.ts` | Nova action `get_baixas_sem_voucher` com LEFT JOIN / NOT IN |
| `HistoricoBaixasTab.tsx` | Botão + modal com tabela das baixas órfãs |

