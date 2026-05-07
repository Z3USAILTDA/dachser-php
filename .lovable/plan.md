## Objetivo

Alinhar o fluxo de **importação em lote** (`BatchImportVoucherDialog` + `BatchImportRowEditor` + handler `create_voucher_batch_import`) ao **formulário individual** (`CreateVoucherDialog`), em três frentes:

1. Equivalência de campos obrigatórios.
2. Equivalência de regras automáticas baseadas no valor selecionado em cada campo (urgência por tipo, etapa por urgência+fiscal, status de envio ao cliente).
3. Captura da Chave PIX quando a forma de pagamento for PIX.

## 1. Campos obrigatórios

Regra do individual: `spo`, `fornecedor`, `vencimento`, `origem_processo`, `tipo_documento`, `forma_pagamento`, `cobranca_em_nome_de` (Fiscal). Anexos não se aplicam ao lote (são vinculados em etapa posterior).

### `BatchImportVoucherDialog.tsx` — função `validate`
Remover regras que o individual não exige:
- `if (!next.processo) ...`
- `if (!next.valor || next.valor <= 0) ...`

Manter como obrigatórios: `spo`, `origem_processo`, `fornecedor`, `vencimento`, `tipo_documento`, `forma_pagamento`, `cobranca_em_nome_de`.

Adicionar regra condicional do PIX (ver seção 3).

### `BatchImportRowEditor.tsx`
- Remover "Processo" do array `missing` e o `*` do label "Processo".
- Adicionar `*` em "Fornecedor" (já é obrigatório no `validate`; só falta o asterisco visual). Campo continua read-only — preenchido por `nome_beneficiario` da DFV.
- Manter `*` em: Origem Processo, Forma de Pagamento, Fiscal, Vencimento, Tipo Documento.

## 2. Regras automáticas por valor selecionado

Referência: `CreateVoucherDialog.handleSubmitVoucher` (linhas ~444-463).

```ts
// Urgência
const isUrgenteReal = !!it.urgente;
const tipoDoc = (it.tipo_documento || '').toUpperCase();
const autoUrgent = !isUrgenteReal && (tipoDoc === 'ICMS' || tipoDoc === 'ARMAZENAGEM');
const urgenciaTipo = isUrgenteReal ? 'URGENTE_REAL'
                   : autoUrgent  ? 'URGENTE_AUTOMATICO'
                                  : 'NORMAL';

// Etapa
const etapaAtual = urgenciaTipo === 'URGENTE_REAL' ? 'SUPERVISOR'
                  : (it.cobranca_em_nome_de === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');

// status_envio_cliente
const statusEnvioCliente = it.cobranca_em_nome_de === 'CLIENTE' ? 'AGUARDANDO_CLIENTE' : 'NAO_APLICA';

// flag urgente (booleano numérico)
const urgenteFlag = (isUrgenteReal || autoUrgent) ? 1 : 0;
```

### `supabase/functions/mariadb-proxy/index.ts` — handler `create_voucher_batch_import` (≈ linha 18394)

No `INSERT INTO dados_dachser.t_vouchers`, substituir os literais hard-coded:
- `'OPERACAO'` → `?` (`etapaAtual`)
- `'NAO_APLICA'` → `?` (`statusEnvioCliente`)
- `it.urgente ? 1 : 0` → `urgenteFlag`
- `it.urgente ? 'URGENTE_REAL' : 'NORMAL'` → `urgenciaTipo`

Manter os demais valores inalterados (`status_baixa='PENDENTE'`, `status_financeiro='PENDENTE'`, `remessa='NENHUM'`, `status_documento_fiscal='PENDENTE'`, `tipo_execucao_pagamento='A_DEFINIR'`, `origem_criacao='LOTE_PLANILHA'`).

## 3. Chave PIX condicional

Quando `forma_pagamento = "PIX"`, exibir e exigir o campo Chave PIX no editor de linha, e gravá-lo no voucher (mesmo comportamento do individual).

### `src/components/esteira/BatchImportPreviewTable.tsx`
Adicionar à interface `PreviewItem`:
```ts
chave_pix?: string | null;
```

### `src/components/esteira/BatchImportRowEditor.tsx`
Logo abaixo do bloco "Forma de Pagamento", renderizar condicionalmente:
```tsx
{draft.forma_pagamento === "PIX" && (
  <div className="space-y-1.5 col-span-2">
    <Label className="text-xs">Chave PIX <span className="text-red-400">*</span></Label>
    <Input
      className="h-8 text-xs"
      placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
      value={draft.chave_pix || ""}
      onChange={(e) => set("chave_pix", e.target.value || null)}
    />
  </div>
)}
```
Adicionar `"Chave PIX"` em `missing` quando `forma_pagamento === "PIX" && !chave_pix`, bloqueando "Salvar alterações".

### `src/components/esteira/BatchImportVoucherDialog.tsx` — `validate`
Acrescentar:
```ts
if (next.forma_pagamento === "PIX" && !next.chave_pix) errors.push("chave PIX obrigatória");
```

### `supabase/functions/mariadb-proxy/index.ts` — handler `create_voucher_batch_import`
- Calcular: `const chavePixFinal = (it.forma_pagamento || '').toUpperCase() === 'PIX' ? (it.chave_pix || null) : null;`
- Incluir `chave_pix` na lista de colunas/valores do `INSERT` (ao lado de `processo_id, origem_processo`).

## Fora de escopo

- Anexo Fatura/Boleto por linha (lote vincula em etapa posterior).
- `pix_tipo_chave` (não é definido no `CreateVoucherDialog`; é inferido depois em `insert_dados_rm`).
- Importar chave PIX automaticamente da planilha (campo será preenchido manualmente no editor).
- Sem mudanças de schema — todas as colunas usadas (`chave_pix`, `urgencia_tipo`, `etapa_atual`, `status_envio_cliente`) já existem em `t_vouchers`.