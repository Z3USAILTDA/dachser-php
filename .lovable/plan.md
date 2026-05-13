## Objetivo

Permitir o tipo de anexo **DAI** no lote e, especificamente para vouchers em **pré-lançamento**, considerar o voucher pronto mesmo que tenha **somente o DAI** anexado (sem FATURA e/ou BOLETO).

## Mudanças

### 1. Frontend — adicionar opção "DAI"
Arquivo: `src/utils/batchVoucherImport.ts`

```ts
export const TIPOS_ANEXO = [
  "FATURA",
  "BOLETO",
  "DAI",
  "OUTROS",
];
```

Isso já faz o `Select` em `BatchDocumentBinderDialog.tsx` (linha 696) listar **DAI** como tipo selecionável no upload/vinculação.

Nenhuma outra mudança de UI necessária — o badge/coluna "Vinculado" já mostra `tipo_anexo` dinamicamente (linha 452).

### 2. Backend — flexibilizar checklist e finalize para PRE_LANCAMENTO
Arquivo: `supabase/functions/mariadb-proxy/index.ts`

**a) Checklist (linhas ~19357–19370)** — usar `etapa_destino` do item para decidir a regra:

- Se `etapa_destino === 'PRE_LANCAMENTO'`: o voucher é considerado **COMPLETO** se tiver **qualquer um**: `FATURA` (ou `FATURA_DEMONSTRATIVO`), `BOLETO` (ou `BOLETO_INSTRUCOES`), **ou `DAI`**. Sem nenhum desses, fica `PENDENTE_DOCUMENTO`.
- Caso contrário: mantém a regra atual (exige FATURA, e BOLETO quando `forma_pagamento = 'BOLETO'`). DAI sozinho **não** satisfaz vouchers que vão para FISCAL/FINANCEIRO/SUPERVISOR.

**b) Finalize (linhas ~19402–19421)** — espelhar a mesma lógica:

```ts
// dentro do loop por item:
const isPreLanc = String(it.etapa_destino || '').toUpperCase() === 'PRE_LANCAMENTO';
const temDai = tipos.some(t => t === 'DAI');

if (isPreLanc) {
  if (!temFatura && !temBoleto && !temDai) {
    motivos.push('PENDENTE_DOCUMENTO');
  }
} else {
  if (!temFatura) motivos.push('PENDENTE_FATURA');
  if (requerBoleto && !temBoleto) motivos.push('PENDENTE_BOLETO');
}
```

A query de `items` em `finalize_batch_import` (linha 19382) já seleciona `etapa_destino`, então não precisa alterar SQL.

## O que NÃO muda

- Lógica de criação de master, promoção de etapas, anexação `attach_pre_lancamento_to_batch`, e cópia de anexos filhos para o master permanecem iguais.
- Vouchers que **não** são pré-lançamento continuam exigindo FATURA (e BOLETO quando aplicável); DAI sozinho não os libera.
- Sem mudança de schema MariaDB — `tipo` em `t_voucher_anexos` é texto livre.

## Validação

1. Criar lote em modo **Pré-lançamento**, anexar **apenas DAI** a um voucher → checklist mostra **COMPLETO**, finalize passa.
2. Mesmo lote sem nenhum anexo → continua **PENDENTE_DOCUMENTO**.
3. Lote normal (destino FISCAL), anexar apenas DAI → continua **PENDENTE_FATURA** (comportamento atual preservado).
4. Selecionar **DAI** no dropdown de "Tipo do anexo" e vincular um documento → registro com `tipo_anexo = 'DAI'` aparece corretamente.
