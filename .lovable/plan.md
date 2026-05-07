## Ajustes no Importar SPO em Lote

Três pequenos ajustes ao fluxo já existente — sem mudar funcionalidades.

---

### 1) Mostrar motivos de erro no rodapé do preview

**Arquivo:** `src/components/esteira/BatchImportVoucherDialog.tsx`

No rodapé do step `preview` (onde hoje aparece "Corrija os erros para habilitar a importação"), adicionar um resumo agregado dos motivos de erro encontrados nas linhas, agrupando pela mensagem e mostrando a contagem.

Exemplo de exibição:
- "26 linhas com fornecedor obrigatório"
- "12 linhas com vencimento obrigatório"
- "3 linhas com tipo de documento obrigatório"

Implementação: derivar do `items` um `Map<motivo, count>` percorrendo `validation_message.split(";")` apenas dos itens com `status === "ERROR"`. Renderizar como lista compacta (texto pequeno, em vermelho suave) ao lado/abaixo do botão "Criar voucher(s)". Cada item pode ser clicável e aplicar o filtro `errors` + busca pelo motivo (opcional — somente leitura é suficiente).

---

### 2) Fornecedor sempre vem da DFV (`nome_beneficiario`)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` — função `mergeWithDfv` (linha ~18341)

Alterar a resolução do campo `fornecedor` para **ignorar o valor da planilha** e usar exclusivamente o que vier da `t_dados_financeiro_voucher.nome_beneficiario` (com fallback para `razao_social`, como já é hoje).

```ts
// antes:
fornecedor: pick(sheet.fornecedor, dfvFornecedor, 'fornecedor'),

// depois:
fornecedor: dfvFornecedor,  // sempre DFV
// origin['fornecedor'] = dfvFornecedor ? 'DFV' : null;
```

Comportamento resultante:
- Se a SPO existe na DFV → `fornecedor` preenchido automaticamente, marcado como `DFV`.
- Se a SPO não existe na DFV → `fornecedor` fica `null` → cai no validador existente ("fornecedor obrigatório") e a linha aparece como erro no preview.

**Frontend:** no `BatchImportRowEditor.tsx`, deixar o input "Fornecedor" como `readOnly` (igual ao SPO) e adicionar uma legenda pequena: "Preenchido automaticamente pela base RM (nome_beneficiario)". Isso evita que o usuário tente sobrescrever um campo que será ignorado.

---

### 3) Campo "Fiscal" — obrigatório + ícone de informação com modal

O campo já é validado como obrigatório no frontend e backend (validador atual: "contabilização fiscal obrigatória"). Manter como está. Adicionar **ícone de informação** ao lado do label que abre o `FornecedoresSemFiscalDialog` existente — o mesmo modal já usado em `CreateVoucherDialog.tsx` (linha 1317).

**Arquivos a alterar:**

a) `src/components/esteira/BatchImportRowEditor.tsx` — no campo "Fiscal" da seção Financeiro:
```tsx
<Label className="text-xs flex items-center gap-1.5">
  Fiscal <span className="text-red-400">*</span>
  <FornecedoresSemFiscalDialog trigger={
    <button type="button" className="text-muted-foreground hover:text-primary">
      <Info className="h-3.5 w-3.5" />
    </button>
  } />
</Label>
```

b) `src/components/esteira/BatchImportVoucherDialog.tsx` — no step `fill`, quando o campo ausente é `cobranca_em_nome_de`, renderizar o mesmo ícone ao lado do label "Fiscal *".

Sem alteração no componente `FornecedoresSemFiscalDialog` em si — ele já aceita `trigger` como prop.

---

### Resumo do que NÃO muda

- Fluxo de upload, validação backend, criação do lote.
- Drawer continua editável para todos os outros campos.
- Toolbar "Editar em lote", filtros, contadores de Válidas/Com erro.
- `origem_processo`, `forma_pagamento` e `urgente` continuam por linha.
