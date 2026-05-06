## Atualizar PDF para seguir padrão do Excel

Alinhar o `voucherPdfExport.ts` ao layout e colunas do `voucherExcelExport.ts`.

### Mudanças em `src/utils/voucherPdfExport.ts`

**Colunas (10, iguais ao Excel):**
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

**Cabeçalho/título:**
- Título: "Relatório de Vouchers — DACHSER" (faixa dourada)
- Subtítulo: "Gerado em DD/MM/YYYY às HH:mm • N voucher(s)"

**Estilos da tabela:**
- Header dourado (#D4AF37), texto preto, negrito, centralizado
- Linhas alternadas cinza claro (#F5F5F5)
- Linhas urgentes destacadas em vermelho claro (#FFE5E5) e negrito
- Bordas finas cinza
- Valor formatado com `#,##0.00` (numérico, alinhado à direita)
- Datas em `dd/MM/yyyy`

**Linha de TOTAL:**
- Última linha com fundo dourado claro (#FFF4D6), borda superior dupla
- "TOTAL" na coluna 1, soma na coluna Valor
- Se houver moedas mistas, exibir "(moedas mistas)" na coluna Moeda

**Largura das colunas:** proporcional ao Excel, ajustada à página A4 paisagem (~277mm úteis).

**Página de resumo:** manter a página de resumo existente (estatísticas por etapa, urgentes, valor total agregado por moeda quando aplicável).

Sem alterações no Excel nem no `ReportsTab.tsx`.