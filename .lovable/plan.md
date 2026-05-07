## Mover "Importar SPO em Lote" para o formulário "A partir do RM"

Reposiciona o gatilho do fluxo de importação em lote de vouchers/SPO. Sem mudanças funcionais no backend, no parsing, no binder de documentos, nas validações ou na permissão (continua exclusivo para ADMIN).

### Mudanças

**1. `src/components/esteira/CreateVoucherDialog.tsx`**
- No bloco "Buscar Voucher/SPO no RM" (linha ~927), adicionar um link clicável `Importar SPO em Lote` à direita do título, na mesma linha do `Search` icon + label.
  - Renderiza apenas se `isAdmin` (consumir via `useUserRole`, padrão já existente em outros componentes).
  - Estilo: `button` com `variant="link"`, texto pequeno (`text-xs`), cor primária (`#ffc800`/primary), ícone `Upload` à esquerda. Sem alterar layout do bloco — usar `ml-auto` para empurrar para a direita.
  - `onClick`: chama um novo prop opcional `onOpenBatchImport?: () => void`. Se não houver prop, o link não renderiza (defesa).
- Adicionar prop opcional `onOpenBatchImport?: () => void` na interface do componente.

**2. `src/pages/esteira/EsteiraIndex.tsx`**
- Remover o botão `Importar SPO em Lote` do header (linhas ~1916-1918), incluindo o ícone `Upload` se ficar sem uso.
- Passar `onOpenBatchImport={() => setShowBatchImportDialog(true)}` para o `<CreateVoucherDialog />` existente (admin only — mesma condição já usada para o dialog).
- Manter `BatchImportVoucherDialog` e `BatchDocumentBinderDialog` montados como já estão (linhas ~2219+). Nada muda no fluxo após o clique.

### Não muda

- `BatchImportVoucherDialog`, `BatchImportPreviewTable`, `BatchDocumentBinderDialog`, `BatchDocumentUploadPanel`, `BatchVoucherChecklist`, `batchVoucherImport.ts`.
- `mariadb-proxy/index.ts` (todos os 7 cases do lote permanecem iguais).
- Permissão: ADMIN-only continua valendo no frontend e backend.
- Fluxo após criação do lote (binder + finalize) idêntico.

### Critérios de aceite

- Header da Esteira não exibe mais o botão "Importar SPO em Lote".
- Dentro do `CreateVoucherDialog`, na aba "A partir do RM", aparece o link `Importar SPO em Lote` ao lado direito do título "Buscar Voucher/SPO no RM", apenas para admin.
- Clique no link abre o `BatchImportVoucherDialog` (e fecha/permanece o `CreateVoucherDialog` conforme já se comporta hoje — sem ajuste extra; ambos são modais shadcn empilháveis).
- Não-admin: link não renderiza; demais usuários veem o formulário inalterado.
