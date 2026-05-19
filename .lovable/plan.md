## Fase 2C.3 — Envio interno controlado por bucket

### Observação importante após auditoria do código atual

Não existe atualmente nenhuma restrição que limite o envio interno real ao stage `D45` em `supabase/functions/regua-send-emails/index.ts`. Os testes anteriores funcionaram com D45 porque foi o stage escolhido, mas a função já aceita qualquer stage suportado pelo `getStageCondition` (`PRE`, `D1`, `D7`, `D15`, `D30`, `D45`, `D60`). Stages desconhecidos já caem no `default: 1=0` (zero títulos).

Portanto, "remover a restrição D45" se traduz, na prática, em **tornar explícita a whitelist de stages permitidos** e validá-la antes de qualquer execução, mantendo todas as travas da Fase 2C.2.

### Mudança proposta (única, cirúrgica)

Arquivo: `supabase/functions/regua-send-emails/index.ts`

1. Adicionar, logo após a validação de `stage` obrigatório (linha ~351), uma whitelist explícita:
   ```ts
   const ALLOWED_STAGES = ["PRE","D1","D7","D15","D30","D45","D60"] as const;
   if (!ALLOWED_STAGES.includes(stage as any)) {
     return 400 { error: "stage não permitido", permitidos: ALLOWED_STAGES };
   }
   ```
2. Atualizar o comentário do bloco "Fase 2C.2 → Fase 2C.3" para refletir que envio interno real está liberado para todos os buckets da whitelist, mantendo as três travas obrigatórias.
3. Atualizar a string de log `[Fase 2C.2 ...]` para `[Fase 2C.3 ...]`.

Nada mais muda. As travas continuam idênticas:
- `dryRun:false` + `testMode:true` + `confirmInternalSend:"SEND_TO_DEVS_ONLY"` → envia exclusivamente para `devs@z3us.ai`.
- Qualquer ausência → bloqueia com 200 + `success:false`.
- `dryRun:true` → continua simulando para qualquer stage permitido.

### Travas mantidas (inalteradas)

- Fonte: `dados_dachser.v_fin_regua_contas_receber`.
- Destinatário hardcoded: `["devs@z3us.ai"]`.
- Sem `email_cliente`, sem `t_dados_financeiro_contatos`, sem `forceRecipient`.
- Apenas primeiro cliente do stage é processado.
- Sem loop multi-cliente.
- Sem gravação em `t_regua_email_log`.
- Subject prefixado com `[TESTE INTERNO - Cliente: …]`.

### Fora de escopo (não tocar)

- `src/pages/ReguaCobranca.tsx` e qualquer frontend.
- `mariadb-proxy`, `regua-send-aging`, módulos de Disputas e Olimpo.
- Demais edge functions.

### Plano de teste pós-deploy

Para cada stage abaixo, chamar `regua-send-emails` via `supabase--curl_edge_functions` com:
```json
{ "stage": "<STAGE>", "dryRun": false, "testMode": true, "confirmInternalSend": "SEND_TO_DEVS_ONLY" }
```
Stages a validar: `PRE`, `D1`, `D7`, `D15`, `D30`, `D60` (D45 já validado).

Critério: cada chamada retorna `success:true`, `mode:"internal_test_send"`, `destinatario_real:"devs@z3us.ai"`, `resend_message_id` presente e `log_gravado:false`. Se algum stage não tiver títulos no momento, a resposta esperada é `success:true` com `total_titulos_stage:0` e nenhum e-mail enviado — registrar como "vazio, sem envio".

Testes negativos rápidos:
- Sem `testMode` → bloqueia.
- Sem `confirmInternalSend` → bloqueia.
- `confirmInternalSend:"OTHER"` → bloqueia.
- Stage fora da whitelist (ex.: `D999`) → 400 com lista de permitidos.