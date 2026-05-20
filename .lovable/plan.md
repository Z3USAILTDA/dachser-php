## Causa raiz

Os registros aparecem como **R$ 0,00** na tela de Disputas, mas com o valor correto no Excel exportado, porque o campo `valor` retornado pela query `get_disputas_cr` (coluna `valor_nf` da view `v_fin_regua_contas_receber`, tipo `DECIMAL`) chega como **string** no JSON do `mariadb-proxy` (comportamento padrão do driver MariaDB para tipos decimais).

- **Excel (`src/utils/disputaExcelExport.ts`)**: usa `Number(r.valor) || 0` → coage a string corretamente → valor correto.
- **Tela (`src/pages/FinanceiroDisputa.tsx` linhas 204-207)**: `formatMoney` checa `typeof val === "number"` antes de formatar. Como `val` é string, o guard cai no `else` e retorna `0` → exibe **R$ 0,00**.

Não é problema de dados nem de query — é uma simples checagem de tipo restritiva demais no front.

## Correção (1 arquivo, mudança cirúrgica)

**`src/pages/FinanceiroDisputa.tsx`** — ajustar `formatMoney` para coagir o valor antes de validar, como já faz o export:

```ts
const formatMoney = (val: number | string | null | undefined) => {
  const n = Number(val);
  const safe = Number.isFinite(n) ? n : 0;
  return "R$ " + safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
```

Também atualizar o tipo da interface `DisputaRow.valor` para `number | string` (linha 55) para refletir a realidade do payload e evitar futuros enganos.

## Fora de escopo

- Não alterar a query no `mariadb-proxy` nem o tipo retornado pelo driver (afetaria outras telas).
- Não mexer no export do Excel (já está correto).
- Nenhuma mudança de backend, migração ou RLS.