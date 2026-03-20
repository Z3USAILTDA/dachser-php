

## Plano: Excel Bonito para Olimpo Cobrança

### Problema
O export atual usa `xlsx` (sem estilos), valores como strings (`.toFixed(2)`), sem cores, sem formatação de moeda, sem bordas — gera um Excel "cru".

### Solução

**Trocar `xlsx` por `xlsx-js-style`** (já usado em outros arquivos do projeto como `HistoricoBaixasTab.tsx` e `voucherExcelExport.ts`) e aplicar formatação profissional.

### Alterações em `src/pages/olimpo/OlimpoCobranca.tsx`

**1. Import**: Trocar `import * as XLSX from "xlsx"` por `import * as XLSX from "xlsx-js-style"`

**2. Aba "Aging" — Estilização completa**:
- **Título "Brazil Customer Aging Overview"**: Merge de colunas, fonte 16pt bold, fundo dourado (#D4AF37), texto preto
- **Header das colunas**: Fundo dourado, fonte 11pt bold, bordas finas, alinhamento centralizado
- **Linhas de dados**: Valores como números raw (não strings), formato de moeda `#,##0.00`, linhas alternadas com fundo cinza claro (#F5F5F5)
- **Linha "Grand Total"**: Fundo escuro (#1a1a2e), texto branco, fonte bold
- **Linha "% do Total"**: Formato percentual, fundo levemente diferenciado
- **Linha "% Provisão"**: Formato percentual, highlight em amarelo claro
- **Linha "Valor Provisionado"**: Formato moeda, fundo verde claro (#E8F5E9)
- **Larguras de colunas** ajustadas automaticamente

**3. Aba "Analítico de Clientes" — Mesma estilização**:
- Header com fundo dourado e bordas
- Valores numéricos como números (não strings `.toFixed(2)`)
- Formato moeda nas colunas de valor/provisão
- Linha de TOTAL com destaque (fundo escuro, bold)
- Linhas alternadas com zebra striping
- Larguras de colunas otimizadas para cada tipo de dado

**4. Propriedades do Workbook**:
- Title, Author, Subject preenchidos (padrão Z3US.AI)

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `src/pages/olimpo/OlimpoCobranca.tsx` | Trocar xlsx por xlsx-js-style, aplicar estilos profissionais nas 2 abas |

