## Mudanças na Esteira

### 1. Exclusão de voucher restrita a SUPERVISOR + ADMIN

**Arquivo:** `src/hooks/useUserRole.ts`

Alterar a flag `canDeleteVoucher` removendo `isFinanceiro`:

```ts
// antes
const canDeleteVoucher = isAdmin || isSupervisor || isFinanceiro;
// depois
const canDeleteVoucher = isAdmin || isSupervisor;
```

Efeito imediato em:
- `EsteiraIndex.tsx` (prop `canDelete` passada ao `VoucherTable`)
- `VoucherTable.tsx` → `VoucherActionsMenu` (item "Excluir" do menu de ações)
- Qualquer outro consumidor da flag

Não mexer em `canCancelVoucher` (cancelar continua liberado para os demais perfis).

### 2. Bloquear edição do "Buscar Voucher/SPO no RM" após dados carregados

**Arquivo:** `src/components/esteira/CreateVoucherDialog.tsx`

No bloco do modo RM (linhas ~919-995), quando `rmDataLoaded === true` (já controlado pelo `handleSearchRM` ao encontrar o SPO/voucher em `t_dados_financeiro_voucher`):

- Adicionar `disabled={rmDataLoaded}` no `<Input>` do campo `numeroRM`.
- Adicionar `disabled={isSearchingRM || rmDataLoaded}` no botão "Buscar".
- Bloquear o atalho Enter quando `rmDataLoaded`.
- Manter o badge verde "Dados carregados" já existente como indicador visual.

O reset continua funcionando via `handleModeChange` (trocar entre RM/Manual) e ao fechar/reabrir o diálogo, então o usuário ainda pode corrigir um SPO digitado errado limpando o modo.

### Escopo não alterado
- `EditVoucherDialog` não expõe o campo de busca RM — sem mudança.
- Permissões de cancelar, editar, voltar etapa, desmembrar permanecem como hoje.
- Nenhuma mudança de backend/SQL.
