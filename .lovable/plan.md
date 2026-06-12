## Objetivo
No upload de anexos da Esteira (rascunho/A Processar), parar de excluir o anexo anterior do mesmo tipo. Em vez disso, manter ambos e sinalizar visualmente os anexos que possuem outro do mesmo tipo, destacando o título/nome em vermelho.

## Mudanças

### 1. `src/components/esteira/VoucherRascunhoActions.tsx` — `handleFileUpload`
- Remover o bloco que procura `existingAnexo`, apaga do storage (`voucher-anexos`) e chama `delete_voucher_anexo`.
- Sempre inserir o novo anexo via `save_voucher_anexo`, sem tocar nos existentes.
- Ajustar o log para sempre usar `ANEXO_ADICIONADO` (remover ramo `ANEXO_SUBSTITUIDO`).
- Ajustar o toast para sempre "Anexo adicionado".
- Manter intacta a extração automática de linha digitável quando for boleto.

### 2. Indicador visual de duplicidade
Na lista de anexos exibida ao usuário (componente que renderiza `voucher.anexos` — provavelmente um `AnexosList`/seção dentro da página de detalhes do voucher, a ser localizado no momento da implementação), aplicar:
- Calcular, por anexo, se existem 2+ anexos com o mesmo `tipo` no voucher.
- Quando `count > 1`, renderizar o **nome do arquivo (título)** com classe `text-destructive` (vermelho do design system) e um ícone `AlertCircle` ao lado, com `title`/tooltip: "Existe mais de um anexo deste tipo — revise e exclua o antigo se necessário".
- Não alterar nenhuma lógica de envio/validação — o checklist de "Anexos Obrigatórios" continua usando `some()` e portanto segue marcando como ✓ normalmente.

### 3. Sem mudanças de backend
- Não altera `mariadb-proxy` (`save_voucher_anexo` / `delete_voucher_anexo` continuam como estão).
- Não altera schema de `t_voucher_anexos`.
- Exclusão manual continua disponível pela ação de excluir anexo já existente na UI.

## Não incluso (fora de escopo)
- Bloquear envio quando houver duplicidade — apenas sinalizar.
- Mudar comportamento em outras etapas (Operação/Fiscal/Financeiro/Supervisor) — escopo é a tela onde hoje há substituição automática (`VoucherRascunhoActions`).
- Migração de dados antigos.

## Validação
1. Subir um segundo `BOLETO_INSTRUCOES` em um voucher que já tem um — confirmar que ambos aparecem na lista, com nome em vermelho + ícone de alerta, e que o antigo **não** foi removido do storage nem do banco.
2. Subir um anexo de tipo novo — comportamento normal, sem destaque vermelho.
3. Excluir manualmente um dos duplicados — o destaque vermelho some do que sobrou.
4. Conferir log: aparece `ANEXO_ADICIONADO` (nunca `ANEXO_SUBSTITUIDO`).
