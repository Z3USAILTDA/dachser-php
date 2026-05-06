## Objetivo
1. Remover a coluna **"Necessita Fiscal"** do Excel de relatório.
2. Preencher a coluna **"Criado Por"** dos vouchers em etapa **A_PROCESSAR** com o `created_by` da tabela `t_dados_financeiro_voucher`.

---

## 1. `src/utils/voucherExcelExport.ts` — remover "Necessita Fiscal"

- **HEADERS** passa de 11 para 10 colunas (remover índice 6 "Necessita Fiscal"):
  1. Número SPO/Voucher
  2. Fornecedor
  3. CNPJ Fornecedor
  4. Valor
  5. Moeda
  6. Vencimento
  7. Forma de Pagamento
  8. Urgente
  9. Etapa Atual
  10. Criado Por
- **COL_WIDTHS** passa para 10 entradas: `[22, 38, 22, 18, 10, 14, 22, 12, 26, 30]`.
- Remover do array `cells` de cada linha o objeto `{ v: v.cobrancaEmNomeDe === "DACHSER" ? "Sim" : "Não", align: "center" }`.
- `lastCol` recalcula automaticamente para 9 (coluna J). Subtotal: coluna **D** (Valor) continua igual (`SUM(D{first}:D{last})`).

## 2. `supabase/functions/mariadb-proxy/index.ts` — incluir `created_by` em `get_vouchers_pendentes_rm`

Na query da action `get_vouchers_pendentes_rm` (linha ~11813), adicionar `dfv.created_by` no SELECT:

```sql
SELECT 
  dfv.id_rm,
  dfv.nd,
  ...
  dfv.razao_social,
  dfv.created_by
FROM dados_dachser.t_dados_financeiro_voucher dfv
...
```

## 3. `src/components/tabs/ReportsTab.tsx` — sem mudança funcional

O mapeamento de `rmVouchers` já lê `rm.created_by` e popula `criadoPorDfv`/`criadoPorUserName`. Após (2), a coluna "Criado Por" do Excel passará a exibir o valor automaticamente.

---

## Verificação
- Exportar Excel: confirmar que "Necessita Fiscal" sumiu e o total continua na coluna Valor.
- Filtrar etapa = "A Processar" → exportar → "Criado Por" preenchido com o usuário do RM.

Sem mudanças no PDF.
