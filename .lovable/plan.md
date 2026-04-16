
## Plano: Anexar arquivos extras nas etapas Fiscal e Financeiro

### Comportamento atual
- Anexos só podem ser **adicionados** na criação/edição do voucher (etapas Operação/Rascunho/Ajuste).
- Em `VoucherDetailsView`, o botão de upload não aparece para Fiscal/Financeiro — apenas exclusão é restrita a `OPERACAO`/`RASCUNHO`/`AJUSTE_OPERACAO` (mantém regra atual).
- O backend já tem ação `save_voucher_anexo` no `mariadb-proxy` e bucket `voucher-anexos` configurado.
- Em `PagamentosTab` (modal do "olhinho"), há a seção "Documentos Anexados" mas **sem opção de upload**.

### Comportamento desejado
- Nas etapas **FISCAL** e **FINANCEIRO** (e respectivos GESTOR/ADMIN), o usuário pode **adicionar** arquivos extras ao voucher (sem alterar permissões existentes de exclusão/edição de outros campos).
- O arquivo anexado entra na lista de documentos do voucher (visível em todas as telas que listam anexos).
- O upload deve estar disponível em:
  1. **Detalhes do voucher** (`EsteiraVoucherDetails` / `VoucherDetailsView`) → seção "Anexos"
  2. **Tela Pagamentos** (`PagamentosTab`) → modal aberto pelo "olhinho", seção "Documentos Anexados"

### Alterações

**1. `src/components/esteira/VoucherDetailsView.tsx`**
- No card "Anexos", quando `canEditAttachments=true` E etapa atual ∈ `{FISCAL, SUPERVISOR, FINANCEIRO, AJUSTE_FISCAL}` (ou seja, fora das etapas onde já edita normalmente), exibir um botão "+ Adicionar arquivo" no header do card.
- Manter regra atual: exclusão segue restrita a `OPERACAO/RASCUNHO/AJUSTE_OPERACAO`. Fiscal/Financeiro só podem **adicionar**, não excluir.
- Tipo do anexo extra: gravar como `OUTROS` (tipo já existente em `TipoAnexo`).
- Reaproveitar `FileUpload` (com `onFileUpload` chamando `save_voucher_anexo` no `mariadb-proxy`).
- Após upload, chamar `onUpdate?.()` para recarregar a lista.
- Registrar log: "Arquivo extra anexado em [ETAPA]".

**2. `src/components/esteira/PagamentosTab.tsx`**
- Dentro do dialog do `selectedPagamento` (a partir da linha ~1166, header "Documentos Anexados"), adicionar um pequeno botão "+ Adicionar" ao lado do contador.
- Ao clicar, abre um sub-componente compacto de upload (reutilizando `FileUpload` ou um botão `<input type=file>` simples) que:
  1. Faz upload pro bucket `voucher-anexos` via `supabase.storage`
  2. Chama `mariadb-proxy` action `save_voucher_anexo` com `tipo: "OUTROS"` e `voucher_id = selectedPagamento.id`
  3. Recarrega `anexosDialog` (refazendo o `get_voucher_anexos`)
- Não mostrar botão de excluir (mantém regra atual onde Pagamentos é só leitura).

**3. Permissões (defesa em profundidade)**
- O botão só aparece se o usuário tem role `FISCAL`, `GESTOR_FISCAL`, `FINANCEIRO`, `GESTOR_FINANCEIRO`, `SUPERVISOR`, `GESTOR_SUPERVISOR` ou `ADMIN`.
- Não é necessária alteração de schema nem de RLS (bucket já público, ação já existente no proxy).

### Resumo do impacto
- **Sem migração** de banco.
- **Sem mudanças** em validações, fluxo de etapas ou permissões existentes.
- Apenas **adição** de UI de upload em 2 pontos + chamada à ação já existente `save_voucher_anexo`.
- Anexos novos aparecem automaticamente em todas as telas que já listam `voucher.anexos` / `get_voucher_anexos`.
