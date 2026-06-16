## Objetivo

No diálogo de criação de voucher (`CreateVoucherDialog`), desabilitar permanentemente os campos abaixo nos dois modos (Manual e Integração/RM). Os valores passam a ser preenchidos somente pela integração pós-criação (sync do RM já existente).

Campos a desabilitar:
- Fornecedor
- CNPJ Fornecedor
- Valor
- Data de Emissão

## Mudanças

Arquivo: `src/components/esteira/CreateVoucherDialog.tsx`

1. **Fornecedor** (linha ~1082): trocar `disabled={isRmMode}` por `disabled={true}` e ajustar placeholder para algo como "Preenchido pela integração".
2. **CNPJ Fornecedor** (linha ~1108): trocar `disabled={isRmMode && !cnpjNotFound}` por `disabled={true}`; manter o badge "Não encontrado" quando aplicável (apenas informativo).
3. **Valor** (linha ~1161): adicionar `disabled` ao `<Input>`; manter validação Zod.
4. **Data de Emissão** (linha ~1223): passar `disabled` ao `DateInputField` (verificar suporte; se não existir, adicionar a prop e propagar ao input/calendário).

Comportamento mantido:
- Sync RM continua populando os campos via `form.setValue(...)` (linhas 248-269) antes do submit, então o payload de criação segue idêntico ao atual.
- Validações Zod (`valor` obrigatório, CNPJ válido) permanecem; como o sync preenche antes do submit, não há regressão no modo RM.
- Modo manual: como agora todos os 4 campos ficam vazios no submit, a integração pós-criação (job/sync existente do RM por SPO) preenche `fornecedor`, `cnpj_fornecedor`, `valor` e `data_emissao_documento` no registro recém-criado.

## Fora de escopo

- `EditVoucherDialog`: não foi solicitado alterar edição.
- Lógica de sync/integração RM: já existente, sem alterações.
- Backend / `mariadb-proxy`: sem alterações.
