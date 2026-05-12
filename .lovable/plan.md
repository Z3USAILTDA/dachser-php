# Plano: Permitir vincular comprovante mesmo com SPO em qualquer etapa

## Diagnóstico

Arquivo `101-292954.PDF` falhou porque o handler `find_voucher_by_spo` (em `supabase/functions/mariadb-proxy/index.ts`) retorna o voucher correto (`101-292954 DIM-BY`, etapa `CONCLUIDO`), mas em `src/components/tabs/RoboTab.tsx` há filtro restrito:

```ts
const roboVoucher = data.vouchers.find(v => v.etapa_atual === 'ROBO' && v.is_master)
                 || data.vouchers.find(v => v.etapa_atual === 'ROBO');
```

Vouchers fora de `ROBO` são descartados → badge "Voucher não encontrado".

O usuário quer que o vínculo ocorra mesmo se o voucher já estiver em `CONCLUIDO` (ou outra etapa).

## Mudanças (escopo cirúrgico, só frontend)

Arquivo único: `src/components/tabs/RoboTab.tsx`.

### 1. Remover restrição de etapa em `searchVoucherBySPO` e `searchVoucherByND`
Trocar o filtro por uma seleção que prioriza ROBO mas aceita qualquer etapa:

```ts
const roboMaster   = data.vouchers.find(v => v.etapa_atual === 'ROBO' && v.is_master);
const roboAny      = data.vouchers.find(v => v.etapa_atual === 'ROBO');
const anyMaster    = data.vouchers.find(v => v.is_master);
const fallback     = data.vouchers[0];
const chosen = roboMaster || roboAny || anyMaster || fallback;
```

Adicionar `etapaAtual: chosen.etapa_atual` no objeto retornado.

### 2. Estender `FileMatch`
Novo campo `etapaAtual?: string` para refletir a etapa do voucher encontrado e usar em badges/avisos.

### 3. Badge informativo em `getStatusBadge`
Quando `voucherId` existir e `etapaAtual !== 'ROBO'`, exibir um badge adicional `outline` com a etapa (ex.: "CONCLUIDO") ao lado do SPO/Master, para o operador saber que está revinculando algo já processado. Sem bloquear.

### 4. Toast em `handleManualSpoSearch`
Quando match for de etapa diferente de ROBO, manter o toast de "Voucher encontrado" e acrescentar `(etapa atual: X)` na descrição.

### 5. `processFiles` — comportamento ao processar voucher fora de ROBO
Manter o fluxo atual de upload + `save_voucher_anexo` + `save_voucher_log` (`COMPROVANTE_ANEXADO`).

Ajustar a chamada `update_voucher_esteira`:
- Se `etapaAtual === 'CONCLUIDO'`: **não** sobrescrever `etapa_atual`, `status_baixa` ou `status_financeiro`. Atualizar somente `status_comprovante: 'VALIDADO'` para registrar o anexo.
- Caso contrário (qualquer etapa anterior, incluindo `ROBO`): manter o update completo atual (move para `CONCLUIDO`).
- Pular o log `CONCLUIDO_ROBO` quando o voucher já estava concluído; manter apenas o log `COMPROVANTE_ANEXADO` com detalhe `"... (revínculo em voucher já concluído)"` quando for o caso.

### 6. `canProcess` e botão "Processar"
Sem mudança — depende apenas de `voucherId`, que agora é populado mesmo fora de ROBO.

## Fora de escopo

- Nenhuma mudança em edge functions, parser de PDF ou `mariadb-proxy`.
- Nenhuma mudança em outras telas, regras de etapa do robô em outros pontos do sistema, ou regras de RM/financeiro.

## Validação

- `101-292954.PDF`: badge passa a mostrar SPO `101-292954 DIM-BY` + chip "CONCLUIDO"; botão Processar habilita; após processar, anexo é salvo, log `COMPROVANTE_ANEXADO` é gerado e a etapa do voucher permanece `CONCLUIDO`.
- Comprovante de SPO em ROBO: comportamento atual preservado (move para CONCLUIDO).
- Comprovante de SPO inexistente: continua "Voucher não encontrado" + opção "Editar SPO".
