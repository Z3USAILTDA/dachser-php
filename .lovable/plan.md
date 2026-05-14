## Problema

Hoje, em `src/pages/esteira/EsteiraVoucherDetails.tsx`, o callback `onUpdate` passado ao `VoucherDetailsView` é a função `loadVoucher`, que refaz o `get_voucher_by_id` completo e chama `setVoucher(...)` com um objeto novo. Isso:

- A cada campo salvo inline (hook `useVoucherInlineSave` → `onSaved` → `onUpdate` → `loadVoucher`) a tela toda re-renderiza, fechando o modo de edição, perdendo foco e dando a sensação de "recarregar".
- Ao anexar documento (`ExtraAnexoUpload onUploaded={onUpdate}`) acontece a mesma coisa.

## Mudanças (somente UI/estado, sem mexer em backend)

### 1. `src/pages/esteira/EsteiraVoucherDetails.tsx`
- Criar duas funções leves além do `loadVoucher` atual:
  - `patchVoucher(patch: Partial<Voucher>)` → `setVoucher(prev => prev ? { ...prev, ...patch } : prev)`. Sem fetch.
  - `refreshAnexos()` → invoca `get_voucher_by_id` apenas para extrair `anexos` e `logs`, e atualiza só esses campos via `setVoucher(prev => ({ ...prev, anexos: ..., logs: ... }))`. Não substitui o resto do objeto, então não desmonta os campos em edição.
- Continuar passando `onUpdate={loadVoucher}` para os componentes de ação (Rascunho, Operacao, Fiscal, Supervisor, Financeiro, Robo, etc.) — esses fazem transição de etapa e precisam do reload completo.
- Para o `VoucherDetailsView`, passar dois callbacks novos:
  - `onPatch={patchVoucher}`
  - `onAnexosChanged={refreshAnexos}`
  - Manter `onUpdate={loadVoucher}` apenas para casos que realmente mudam etapa (ex.: `EditVoucherDialog`).

### 2. `src/components/esteira/VoucherDetailsView.tsx`
- Aceitar props novas `onPatch?: (patch: Partial<Voucher>) => void` e `onAnexosChanged?: () => void`.
- Ajustar a chamada do hook:
  ```ts
  const { save, savingField, savedField } = useVoucherInlineSave(voucher.id, undefined);
  ```
  e criar um wrapper:
  ```ts
  const saveField = async (field: string, value: any, patchKey?: keyof Voucher) => {
    const ok = await save(field, value);
    if (ok && patchKey) onPatch?.({ [patchKey]: value } as Partial<Voucher>);
    return ok;
  };
  ```
  Substituir os usos atuais de `save(...)` por `saveField(...)` mapeando o nome do campo do banco para a chave do objeto `Voucher` (ex.: `fornecedor`, `valor`, `vencimento`, `data_emissao_documento`→`dataEmissaoDocumento`, `forma_pagamento`→`formaPagamento`, `cobranca_em_nome_de`→`cobrancaEmNomeDe`, `comentarios_*`, etc.).
- Trocar `<ExtraAnexoUpload ... onUploaded={onUpdate} />` por `onUploaded={onAnexosChanged ?? onUpdate}` — quando o pai fornecer o refresh leve, ele será usado; caso contrário cai no comportamento antigo.
- Mesma troca na ação de excluir/baixar anexo se houver `onUpdate` no fluxo de anexo (verificar handlers do bloco "Anexos" e usar `onAnexosChanged`).

### 3. `src/hooks/useVoucherInlineSave.ts`
- Sem mudança de assinatura. Já retorna `boolean` em `save`, então o wrapper acima funciona sem refatorar o hook.

## Resultado esperado

- Editar um campo → mostra "salvando…/salvo" no próprio campo, atualiza o valor local, sem refetch e sem desmontar o card.
- Anexar documento → a lista de Anexos é atualizada sozinha; o resto da tela não pisca.
- Ações que mudam etapa (Aprovar, Devolver, etc.) continuam refazendo o load completo, como hoje.

## Arquivos afetados

- `src/pages/esteira/EsteiraVoucherDetails.tsx`
- `src/components/esteira/VoucherDetailsView.tsx`

Nenhuma mudança em edge function, banco ou hook de save.