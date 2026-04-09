

## Plano: Corrigir filtros dos cards (drillDown) na Esteira

### Problema
Os 4 cards (Em Andamento, SLA, Pendências, Atividade 24h) definem `drillDownFilter` ao serem clicados, mas a função `filterVouchers` **nunca lê** essa variável. O filtro visual (badge com "✕") aparece, porém a lista de vouchers não muda.

### Solução
Adicionar a lógica de `drillDownFilter` dentro de `filterVouchers`, replicando exatamente os mesmos critérios usados em `calculateMetrics`:

| Card | Filtro | Critério (já existente em `calculateMetrics`) |
|------|--------|-----------------------------------------------|
| Em Andamento | `ativos` | `etapaAtual !== "CONCLUIDO" && etapaAtual !== "A_PROCESSAR"` |
| SLA | `sla` | `etapaAtual !== "CONCLUIDO" && vencimento <= amanhã` |
| Pendências | `pendencias` | `etapaAtual !== "CONCLUIDO" && etapaAtual !== "A_PROCESSAR" && (etapa FINANCEIRO/ROBO ou urgência URGENTE_REAL)` |
| Atividade 24h | `atividade` | `updatedAt >= ontem` |

### Alteração

**Arquivo: `src/pages/esteira/EsteiraIndex.tsx`**

Dentro de `filterVouchers`, após os filtros existentes e antes do `return true`, adicionar um bloco que aplica o drillDown:

```typescript
// Drill-down filter from metric cards
if (drillDownFilter === "ativos") {
  if (voucher.etapaAtual === "CONCLUIDO" || voucher.etapaAtual === "A_PROCESSAR") return false;
}
if (drillDownFilter === "sla") {
  if (voucher.etapaAtual === "CONCLUIDO") return false;
  if (voucher.vencimento > tomorrow) return false;
}
if (drillDownFilter === "pendencias") {
  if (voucher.etapaAtual === "CONCLUIDO" || voucher.etapaAtual === "A_PROCESSAR") return false;
  const aguardandoComprovante = voucher.etapaAtual === "FINANCEIRO" || voucher.etapaAtual === "ROBO";
  const emExcecao = voucher.urgenciaTipo === "URGENTE_REAL";
  if (!aguardandoComprovante && !emExcecao) return false;
}
if (drillDownFilter === "atividade") {
  if (voucher.updatedAt < yesterday) return false;
}
```

Nenhum outro arquivo ou estrutura será alterado.

