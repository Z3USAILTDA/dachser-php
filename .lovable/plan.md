## Ajuste: campos por-linha em vez de globais no step "Preencher"

### Problema

Hoje, quando a planilha não traz `Origem Processo` ou `Forma de Pagamento`, o step `fill` força o usuário a escolher **um valor único aplicado a todas as 26 linhas**. Esses dois campos variam por voucher e essa imposição cria dados incorretos.

### Solução

Tratar `origem_processo` e `forma_pagamento` como campos **sempre por-linha**: nunca aparecem no step `fill` global. O usuário define caso a caso via drawer de edição (já existente) ou via "Editar em lote" da toolbar (já existente, opera só nas linhas selecionadas).

`tipo_documento` e `cobranca_em_nome_de` (Fiscal) continuam podendo ser preenchidos globalmente, pois costumam ser uniformes no lote.

### Mudanças (1 arquivo)

**`src/components/esteira/BatchImportVoucherDialog.tsx`**

1. Em `detectMissingColumns`, remover as duas entradas:
   - `{ key: "origem_processo", label: "Origem Processo" }`
   - `{ key: "forma_pagamento", label: "Forma de Pagamento" }`
   
   Mantém apenas `tipo_documento` e `cobranca_em_nome_de`.

2. Se ambos os campos restantes também já estiverem preenchidos, o step `fill` é pulado naturalmente (lógica atual já trata `missing.length ? "fill" : "preview"`).

3. Atualizar o texto auxiliar do step `fill` para esclarecer: *"Origem Processo e Forma de Pagamento devem ser definidos por linha — use o botão de edição ou 'Editar em lote' na próxima etapa."* (apenas quando o step `fill` for exibido).

### O que NÃO muda

- Validação `validate()` continua exigindo `origem_processo` e `forma_pagamento` por linha → linhas sem esses campos aparecem como **ERROR** no preview, com tooltip explicando o motivo.
- Drawer de edição (`BatchImportRowEditor`) já permite editar ambos.
- Toolbar "Editar em lote" já permite aplicar nas linhas selecionadas.
- Backend, parsing, criação de vouchers, lookup DFV — nada é tocado.
- Steps `upload` e `preview` permanecem idênticos.

### Resultado esperado

Planilha de teste do usuário (sem essas duas colunas) → vai direto para `preview` (ou para `fill` apenas com Tipo Doc + Fiscal se faltarem). As 26 linhas aparecem com erro indicando "origem do processo obrigatória; forma de pagamento obrigatória", e o usuário corrige por linha ou em lote conforme cada caso.
