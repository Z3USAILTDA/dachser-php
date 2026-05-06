## Objetivo
Simplificar o Excel de relatório (apenas 11 colunas), melhorar o visual e adicionar linha de subtotal. Garantir que vouchers em `A_PROCESSAR` apareçam quando o filtro de etapa for "Operação" (e também em "Todas").

---

## 1. Reduzir colunas do Excel para apenas 11

Arquivo: `src/utils/voucherExcelExport.ts`

Nova ordem/lista de colunas:

1. Número SPO/Voucher
2. Fornecedor
3. CNPJ Fornecedor
4. Valor
5. Moeda
6. Vencimento
7. Necessita Fiscal (Sim quando `cobrancaEmNomeDe = DACHSER`)
8. Forma de Pagamento
9. Urgente
10. Etapa Atual
11. Criado Por (`v.criadoPorDfv || v.criadoPorUserName`)

Remover do export atual: CNPJ duplicado já mantido; remover Tipo Execução, Filial, Remessa, Status Baixa, Status Integração RM, Resp. Operação/Fiscal/Financeiro, Comentários (3), Data Criação, Última Atualização.

---

## 2. Melhorias visuais

- Título mesclado no topo (linha 1) "Relatório de Vouchers — DACHSER" com fundo dourado (#D4AF37), fonte 16, branco/preto, altura 32.
- Linha 2: período/filtros aplicados + data de geração (cinza claro, itálico).
- Linha 3: cabeçalho das colunas (dourado, negrito, centralizado, altura 26, com borda).
- Linhas de dados: zebra (cinza claro #F5F5F5 alternado), urgentes em vermelho claro (#FFE5E5) com negrito.
- Bordas finas em todas as células do range.
- Coluna "Valor" alinhada à direita e formatada como número com 2 casas (formato Excel `#,##0.00`) em vez de string formatada — permite somatórias.
- Freeze pane na linha do cabeçalho.
- Auto-filter aplicado no cabeçalho.
- Larguras ajustadas para as 11 colunas.

---

## 3. Subtotal no final

- Linha extra após a última linha de dados:
  - Coluna A: "TOTAL" (negrito, fundo dourado claro #FFF4D6).
  - Coluna D (Valor): fórmula `=SUM(D{first}:D{last})` com formato numérico (mostra soma apenas quando moeda for uniforme; quando houver moedas mistas, ainda soma valores brutos — adicionar célula ao lado com texto "(valores brutos, moedas mistas)" em itálico cinza se houver mais de uma moeda no conjunto).
  - Demais colunas em branco com fundo dourado claro e borda superior dupla.

---

## 4. Garantir A_PROCESSAR no relatório de Operação

Investigação:
- Backend (`mariadb-proxy` → `export_vouchers_report`, linha 11178) já mapeia `OPERACAO` para `('OPERACAO','A_PROCESSAR','AJUSTE_OPERACAO')`. Então o problema reportado provavelmente é um destes:
  a) Quando o usuário escolhe "Todas", não há filtro — então deveria aparecer naturalmente. Confirmar via consulta ao banco se existem registros com `etapa_atual = 'A_PROCESSAR'` no período.
  b) O dropdown só lista `OPERACAO`, `FISCAL`, `FINANCEIRO`, `ROBO`, `CONCLUIDO`. Não há opção dedicada "A Processar". Adicionar item explícito **"A Processar"** no `Select` de Etapa de `ReportsTab.tsx` (value `A_PROCESSAR`) para o caso do usuário querer filtrar exclusivamente esses.
  c) Reforçar o label do item "Operação" para deixar claro que inclui A_PROCESSAR e Ajuste Operação — alterar texto para "Operação (inclui A Processar / Ajuste)".

Ajustes em `src/components/tabs/ReportsTab.tsx`:
- Adicionar `<SelectItem value="A_PROCESSAR">A Processar</SelectItem>`.
- Adicionar `<SelectItem value="AJUSTE_OPERACAO">Ajuste Operação</SelectItem>` e `<SelectItem value="AJUSTE_FISCAL">Ajuste Fiscal</SelectItem>` para granularidade.
- Renomear texto de "Operação" para "Operação (inclui A Processar / Ajuste)".

No backend, garantir que valores `A_PROCESSAR` e `AJUSTE_OPERACAO` quando vierem isolados sejam tratados pelo branch genérico (`v.etapa_atual = ?`) — já é o caso. Sem mudança backend além de validação.

---

## Detalhes técnicos

### voucherExcelExport.ts
- Trocar `formatCurrency` (string) por valor numérico cru + `cell.z = '#,##0.00'` para a coluna Valor.
- Header passa para a linha 3 (índice 2). Inserir `ws['!merges']` para título e subtítulo (A1:K1, A2:K2).
- `ws['!autofilter'] = { ref: 'A3:K{lastDataRow}' }`.
- `ws['!freeze'] / ws['!views']`: usar `ws['!views'] = [{ state: 'frozen', ySplit: 3 }]` (xlsx-js-style suporta via `!views` ou `!freeze`; usar pattern já compatível).
- Subtotal: célula `D{lastDataRow+1}` recebe `{ t: 'n', f: 'SUM(D4:D{lastDataRow})', z: '#,##0.00' }`.

### ReportsTab.tsx
- Apenas adicionar 3 SelectItems e renomear o label de "Operação".

Sem mudanças em PDF (`voucherPdfExport.ts`) — escopo é apenas o Excel.
