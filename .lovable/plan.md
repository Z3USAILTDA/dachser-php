## Objetivo

Quando um voucher estiver retornando de um ajuste (`AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`) e o marcador identifica a etapa solicitante, o usuário que aprova deve **escolher** entre:

1. **Voltar para a etapa solicitante** (quem pediu o ajuste — ex.: Financeiro ou Supervisor)
2. **Seguir o fluxo normal** (próxima etapa padrão — ex.: Fiscal → Financeiro)

Hoje a decisão é automática (sempre volta para o solicitante).

---

## Fluxos atuais (resumo técnico)

**`VoucherOperacaoActions.handleEnviar`** (etapa `AJUSTE_OPERACAO`):
- Se há `requester` no marcador → vai direto para `FINANCEIRO`/`SUPERVISOR`.
- Senão → fluxo normal: `FISCAL` (DACHSER) ou `FINANCEIRO` (CLIENTE) ou `SUPERVISOR` (URGENTE_REAL) etc.

**`VoucherFiscalActions.handleAprovar`** (etapa `AJUSTE_FISCAL`):
- Se há `requester` → volta para `FINANCEIRO`/`SUPERVISOR`.
- Senão → `FINANCEIRO`.

A função `parseRequesterFromAjuste` (em `src/utils/voucherAjusteRouting.ts`) extrai a etapa solicitante do texto do ajuste.

---

## Mudanças

### 1. UI — Diálogo de escolha de roteamento

Em `VoucherOperacaoActions.tsx` e `VoucherFiscalActions.tsx`:

- Quando o usuário clicar em **Aprovar/Enviar** e o voucher estiver em `AJUSTE_OPERACAO`/`AJUSTE_FISCAL` **com `requester` identificado**, abrir um `AlertDialog` com duas opções (RadioGroup):

  ```
  Para onde enviar este voucher?
  ◉ Retornar para [Etapa Solicitante]   (recomendado)
     "Voltar diretamente para quem solicitou o ajuste."
  ◯ Seguir o fluxo normal → [Próxima Etapa]
     "Reenviar pelo fluxo padrão da esteira."
  ```

- Default: "Retornar para a etapa solicitante" (mantém comportamento atual).
- Botão **Confirmar** dispara a aprovação com a etapa escolhida.
- Se **não houver requester** (ajuste sem marcador de etapa), nada muda — segue direto para o fluxo normal sem mostrar o diálogo.

### 2. Lógica de roteamento

Em ambos os handlers (`handleEnviar` da Operação e `handleAprovar` do Fiscal):

- Calcular `proximaEtapaSolicitante` (via `parseRequesterFromAjuste`) **e** `proximaEtapaFluxoNormal` (lógica atual sem o desvio do requester).
- Usar a opção escolhida pelo usuário no diálogo como `proximaEtapa`.
- Atualizar o log para registrar a decisão tomada:
  - `APROVADO_FISCAL` / `REENVIO_APOS_AJUSTE` com `detalhe` distinto:
    - "...retornado para [Etapa Solicitante] (escolhido pelo usuário)"
    - "...enviado pelo fluxo normal para [Etapa] (escolhido pelo usuário, ignorando solicitante)"

### 3. Nada muda para vouchers sem ajuste

Vouchers que não estão em `AJUSTE_*` ou que não têm marcador de requester continuam aprovando direto, sem diálogo.

---

## Detalhes técnicos

**Arquivos a alterar**
- `src/components/esteira/VoucherOperacaoActions.tsx` — adicionar `AlertDialog` de escolha + ajuste em `handleEnviar`.
- `src/components/esteira/VoucherFiscalActions.tsx` — adicionar `AlertDialog` de escolha + ajuste em `handleAprovar`.

**Sem mudanças**
- `voucherAjusteRouting.ts` (utilitário continua o mesmo)
- Backend `mariadb-proxy` (a etapa final continua chegando via `update_voucher_esteira`)
- `VoucherSupervisorActions` e `VoucherFinanceiroActions` (a devolução para ajuste continua como está; só a aprovação é que ganha a escolha)

**Memória a atualizar** após implementação: `mem://vouchers/workflow-logic-and-stages-v6` — registrar que o aprovador pode escolher entre voltar ao solicitante ou seguir o fluxo normal.

---

## Pontos de confirmação

1. O diálogo de escolha deve aparecer também quando o **Supervisor/Financeiro** aprovam um voucher que veio originalmente via fluxo de ajuste? Ou apenas para Operação (saindo de AJUSTE_OPERACAO) e Fiscal (saindo de AJUSTE_FISCAL)?
2. O default sugerido é "Retornar ao solicitante" (mantém comportamento atual). Confirma?
3. Quando **não houver marcador** de requester (ajuste sem etapa registrada), devo **ainda assim** abrir o diálogo perguntando para qual etapa enviar, ou seguir direto pelo fluxo normal sem perguntar?
