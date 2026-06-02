## Reanálise após reprodução real

Rodei a planilha real (7 linhas) contra `mariadb-proxy` `preview_voucher_batch_import` e o backend já retorna tudo corretamente via lookup por `numero_processo` (cobrindo também `detalhes`):

```
row 0  spo=101-294202 DIM-BY  forn=AEROPORTOS BRASIL VIRACOPOS S.A.  valor=540.50   venc=2026-06-10
row 1  spo=101-294526 DIM-BY  forn=GEODIS  ...                       valor=553.14   venc=2026-06-10
... (7 linhas, todas com SPO/fornecedor/CNPJ/valor/vencimento preenchidos via DFV)
```

Todas saem com `status=ERROR` **apenas porque** falta `tipo_documento` (a planilha do Z3US não tem essa coluna). O `detectMissingColumns` no dialog enxerga isso e deveria mandar para o passo `"fill"` — onde o usuário escolhe um único Tipo de Documento aplicado a todas as linhas — e depois sim para o `"preview"` com todas VÁLIDAS.

### Problema 1 — não é "não encontrou dados"

A planilha é lida e enriquecida corretamente. O que provavelmente acontece na tela:

a) O passo `"fill"` abre pedindo "Tipo Documento" e o usuário não percebe que precisa preencher ali, ou
b) O dialog cai direto no `"preview"` mostrando 7 linhas **vermelhas** com `"tipo de documento obrigatório"` e a leitura é "nada foi carregado".

A correção é melhorar a clareza do estado, não o parsing:

- **`src/components/esteira/BatchImportVoucherDialog.tsx`** — após `handleFile`, se `items.length > 0` mas todas em `ERROR` por campos preenchíveis em massa (`tipo_documento`, `cobranca_em_nome_de`, `forma_pagamento`), exibir um toast informativo: `"7 linhas carregadas. Preencha Tipo de Documento para continuar."` e garantir entrada no step `"fill"` mesmo quando só 1 campo estiver faltando (hoje já entra, mas reforçar).
- No `"fill"` step, deixar visível o contador `"7 linhas aguardando esses campos"`.
- No `"preview"`, se `validCount === 0` e o motivo dominante for um campo do bulk-fill, mostrar banner `"Use 'Preencher em lote' para aplicar Tipo Documento a todas as linhas"` em vez de só listar erros.

Nenhuma mudança no parser/backend é necessária para o problema 1.

### Problema 2 — upload "sucesso" sem arquivos visíveis

Não consegui reproduzir sem repetir a sessão do usuário, mas o código tem dois pontos cegos confirmados:

- **`src/components/esteira/BatchDocumentUploadPanel.tsx`**:
  - Toast `"Upload concluído (0 de N)"` é exibido mesmo quando todos os uploads ao storage falharam.
  - `supabase.functions.invoke('upload_batch_document_bulk')` só checa `error` — ignora `data?.success === false`.

Correções:

- Se `uploaded.length === 0` → toast destrutivo `"Nenhum arquivo enviado — verifique permissões do storage"` (sem chamar `onUploaded`).
- Se `0 < uploaded.length < list.length` → toast `default` com `"X de N enviados; Y falharam"`.
- Após `invoke`, checar `data?.success` e exibir `data?.error` quando false.
- `console.error` detalhado do erro de `supabase.storage.upload` (status, message, name do arquivo) para diagnóstico.

Depois de aplicar, reproduzir o upload uma vez e ler `edge_function_logs(mariadb-proxy, search='upload_batch_document_bulk')` + console do browser para identificar se a falha é no `storage.upload` (RLS/tamanho) ou no INSERT do MariaDB. Ajustar a causa raiz com base nesse log.

## Resumo de arquivos a tocar

- `src/components/esteira/BatchImportVoucherDialog.tsx` — banner/toast quando todas linhas em ERROR por campo bulk-fillable.
- `src/components/esteira/BatchDocumentUploadPanel.tsx` — feedback honesto + checagem de `data.success`.

Nada de mudança no backend nem no parser.