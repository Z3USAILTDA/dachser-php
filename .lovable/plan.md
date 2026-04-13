

## Plano: Mostrar FINANCEIRO + ROBO na tela de Processos para usuários Financeiro

### Problema
Quando um usuário com role FINANCEIRO abre a aba Processos, o auto-filtro define `etapa: "FINANCEIRO"`. A função `filterVouchers` faz comparação estrita (`vEtapa !== fEtapa`), excluindo vouchers na etapa ROBO.

### Alteração

**`src/pages/esteira/EsteiraIndex.tsx`**

1. **Auto-filtro de etapa** (linha ~661): Alterar o valor mapeado para FINANCEIRO incluir ROBO:
   ```typescript
   FINANCEIRO: "FINANCEIRO",
   // Não muda aqui — mantém "FINANCEIRO" como valor do filtro
   ```

2. **Lógica de filtragem** (linha ~1292-1295): Quando o filtro de etapa é "FINANCEIRO", aceitar também vouchers com etapa "ROBO":
   ```typescript
   if (filters.etapa !== "all") {
     const vEtapa = (voucher.etapaAtual || "").trim().toUpperCase();
     const fEtapa = filters.etapa.trim().toUpperCase();
     // FINANCEIRO filter should also show ROBO stage
     if (fEtapa === "FINANCEIRO") {
       if (vEtapa !== "FINANCEIRO" && vEtapa !== "ROBO") return false;
     } else {
       if (vEtapa !== fEtapa) return false;
     }
   }
   ```

3. **Query de pagamentos** (backend `list_pagamentos`): Reverter para incluir ROBO novamente na condição de etapa, tanto na listagem quanto nas stats:
   ```sql
   v.etapa_atual IN ('FINANCEIRO', 'ROBO')
   ```

### Resultado
Usuários FINANCEIRO verão vouchers nas etapas FINANCEIRO e ROBO tanto na aba Processos quanto na aba Pagamentos, com contagens alinhadas.

