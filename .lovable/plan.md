O problema ainda existe porque a liberação foi aplicada no menu da tabela, mas há duas travas adicionais que continuam bloqueando ao salvar:

1. **Frontend:** `EditVoucherDialog.tsx` ainda permite salvar apenas em `A_PROCESSAR` e `OPERACAO`, então `AJUSTE_OPERACAO` abre o modal, mas bloqueia no submit.
2. **Backend:** `mariadb-proxy` também valida apenas `A_PROCESSAR` e `OPERACAO`, então mesmo removendo a trava visual o servidor ainda negaria a edição.

Plano de correção:

- Atualizar a validação do modal de edição para incluir `AJUSTE_OPERACAO`.
- Atualizar a mensagem do toast para citar `Ajuste Operacional`.
- Atualizar a validação do backend em `update_voucher_esteira` para incluir `AJUSTE_OPERACAO` nas etapas editáveis.
- Atualizar a mensagem de erro do backend para refletir a regra correta.
- Manter o restante do fluxo intacto, sem alterar permissões, campos, layout ou workflow.