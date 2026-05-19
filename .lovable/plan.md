# Fase 2C.2 — Envio Real Controlado (devs@z3us.ai apenas)

## Escopo
Alterar **somente** `supabase/functions/regua-send-emails/index.ts`.
Nenhuma outra função, frontend, proxy, disputa ou Olimpo é tocada.

## Mudanças no index.ts

### 1. Substituir a trava atual de dryRun por gate de três travas

Hoje (linhas ~352-360) existe:
```ts
if (payload?.dryRun !== true) {
  return 400/200 "dryRun obrigatório"
}
```

Substituir por lógica de três modos:

- **Modo DRY-RUN** (`dryRun === true`): comportamento atual preservado — consulta, agrupa, retorna amostra sanitizada. Não chama Resend. Não grava log.
- **Modo ENVIO INTERNO DE TESTE**: exige TODAS as três travas simultaneamente:
  - `dryRun === false`
  - `testMode === true`
  - `confirmInternalSend === "SEND_TO_DEVS_ONLY"`
  Se qualquer uma faltar ou divergir → retorna erro controlado 400 e **não chama Resend**.
- **Qualquer outro caso** (ex.: `dryRun:false` sem as outras duas): bloqueia com erro explícito `"Fase 2C.2: envio real bloqueado. Travas ausentes."`.

### 2. Pipeline de dados (sem alteração)

- Query continua usando `dados_dachser.v_fin_regua_contas_receber`.
- `getStageCondition` permanece igual (PRE, D1=1, D7, D15, D30, D45, D60 já validados).
- Soft delete via `NOT EXISTS` em `t_financeiro_soft_delete` preservado.
- Agrupamento por `razao_base + cnpj` preservado.
- **Apenas o primeiro cliente** continua sendo processado (loop multi-cliente NÃO é liberado).
- Nenhuma consulta a `t_dados_financeiro_contatos`. Nenhum uso de `email_cliente` da view.

### 3. Envio Resend (somente no modo interno de teste)

Quando as três travas estiverem corretas:

- Importar Resend (já importado no topo do arquivo).
- Instanciar `new Resend(Deno.env.get("RESEND_API_KEY"))`.
- Montar `subject`, `bodyBefore`, `bodyAfter` via `buildTemplateText(tipo_pagto, stage, titulos, hoje)` já existente.
- Montar tabela HTML via `buildTableHtml(clientInvoices)` já existente.
- Body do e-mail = `bodyBefore` + tabela HTML + `bodyAfter`, com quebras `\n` convertidas para `<br>` nas partes texto.
- Destinatário **hardcoded**: `to: ["devs@z3us.ai"]`. Não ler de payload, não ler de view, não aceitar override. Se algum código tentar passar `forceRecipient` ou similar, é ignorado.
- `from`: usar `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` se disponíveis, senão fallback `"Dachser Financeiro <onboarding@resend.dev>"`.
- Adicionar prefixo `[TESTE INTERNO — Cliente: ${clientName}]` no subject para deixar claro que é teste.
- **Nenhuma gravação em `t_regua_email_log`** — log permanece desligado nesta fase (Fase 2C.2 ainda é teste controlado).

### 4. Resposta JSON

Modo dry-run: igual ao atual (`destinatario_simulado`, `total_titulos_stage`, amostra sanitizada).

Modo envio interno:
```json
{
  "success": true,
  "mode": "internal_test_send",
  "stage": "D45",
  "destinatario_real": "devs@z3us.ai",
  "cliente_origem_dados": "<nome>",
  "total_titulos_enviados": <n>,
  "resend_message_id": "<id>",
  "log_gravado": false
}
```

Modo bloqueado:
```json
{
  "success": false,
  "error": "Fase 2C.2: envio real bloqueado. Travas ausentes ou inválidas.",
  "requeridos": {
    "dryRun": false,
    "testMode": true,
    "confirmInternalSend": "SEND_TO_DEVS_ONLY"
  }
}
```
Status 400.

## Travas mantidas (NÃO alteradas)
- Fonte única: `v_fin_regua_contas_receber`.
- Buckets já validados (PRE=2265, D1=29, D7=513, D15=507, D30=134, D45=22, D60=122).
- Apenas primeiro cliente processado.
- Sem `t_dados_financeiro_contatos`.
- Sem `email_cliente`.
- Sem `forceRecipient`.
- Sem loop multi-cliente.
- Sem gravação em `t_regua_email_log`.

## Deploy e validação
1. Deploy de `regua-send-emails`.
2. Teste 1 — bloqueio: `{ stage: "D45" }` → deve retornar erro 400 com travas ausentes.
3. Teste 2 — dryRun: `{ stage: "D45", dryRun: true }` → deve manter comportamento atual (22 títulos, amostra sanitizada).
4. Teste 3 — envio real para devs: `{ stage: "D45", dryRun: false, testMode: true, confirmInternalSend: "SEND_TO_DEVS_ONLY" }` → deve enviar 1 e-mail para `devs@z3us.ai` com tabela do primeiro cliente do D45, retornar `resend_message_id`.

## Arquivos alterados
- `supabase/functions/regua-send-emails/index.ts` (único arquivo)
