## Regra confirmada
Nenhum voucher pode sair de `OPERACAO` nem de `A_PROCESSAR` (robô) sem ter ≥ 1 anexo em `t_voucher_anexos`.

## Diagnóstico (já confirmado por query)
- **Nada é apagado** de `t_voucher_anexos` (0 casos de log `ANEXO_ADICIONADO` com anexos = 0 hoje; ação `ANEXO_REMOVIDO` nem existe).
- Os casos reportados ("sumiu") são vouchers que **nunca tiveram anexo** e mesmo assim chegaram em FISCAL. Duas portas:
  - Sync RM cria direto em `FISCAL` sem PDFs (7 SPOs identificados).
  - Form de entrada manual aceita salvar em `FISCAL` sem anexo (SPO `20261883825`, julia, hoje).

## Fix (cirúrgico, só backend)

Tudo em `supabase/functions/mariadb-proxy/index.ts`.

### 1) Helper de validação
```ts
async function assertVoucherTemAnexos(voucherId: string, etapaDestino: string) {
  const ETAPAS_QUE_EXIGEM = ['FISCAL','FINANCEIRO','PAGAMENTO','CONCLUIDO',
    'AGUARDA_APROV_SUPERVISOR','AGUARDA_APROV_GERENTE','AJUSTE_OPERACAO'];
  if (!ETAPAS_QUE_EXIGEM.includes(etapaDestino)) return;
  const r = await mariadbQuery(
    `SELECT COUNT(*) c FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`,
    [voucherId]);
  if (Number(r[0]?.c || 0) === 0) {
    throw new Error('ANEXOS_OBRIGATORIOS: Anexe ao menos 1 documento antes de avançar.');
  }
}
```

### 2) Chamar em toda transição de etapa
Aplicar em todas as actions que rodam `UPDATE t_vouchers SET etapa_atual = ?`:
- `update_voucher_esteira`
- `advance_voucher_stage`
- `bulk_advance_vouchers` (se existir)
- `process_robo_match` / qualquer promoção que tira voucher de `A_PROCESSAR`
- Cron de status automation (`auto_advance_vouchers` / etc.) — antes de promover de `A_PROCESSAR` ou `OPERACAO`, validar.

Erro retorna `{ success:false, error:'ANEXOS_OBRIGATORIOS', message:'…' }`. O front já mostra toast de erro via `useVoucherInlineSave` / hooks de avanço.

### 3) Sync RM cria em `OPERACAO`, não em `FISCAL`
Na action que insere vouchers vindos do RM (`sync_vouchers_from_rm` ou equivalente), trocar `etapa_atual='FISCAL'` por `etapa_atual='OPERACAO'`. Combinado com o item 2, o cron de promoção automática só sobe quando houver anexo.

### 4) Form de entrada manual no front
No componente de criação manual (provavelmente `EsteiraVoucherDetails` ou modal de "Novo voucher"), forçar `etapa_atual = 'OPERACAO'` no payload de criação. Se já estiver, OK — o gate do backend cobre. Confirmar caminho exato na implementação e ajustar só se necessário (mudança de 1 linha).

## Backfill (uma única operação)
Vouchers ativos sem anexo voltam para `OPERACAO`:
```sql
UPDATE dados_dachser.t_vouchers v
SET etapa_atual='OPERACAO', updated_at=NOW()
WHERE etapa_atual IN ('FISCAL','FINANCEIRO','PAGAMENTO',
                      'AGUARDA_APROV_SUPERVISOR','AGUARDA_APROV_GERENTE',
                      'A_PROCESSAR','AJUSTE_OPERACAO')
  AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_voucher_anexos a WHERE a.voucher_id = v.id);
```
+ log `ETAPA_ALTERADA_SISTEMA` para cada: "Movido para OPERACAO — voucher sem anexo (correção retroativa)". Vouchers `CONCLUIDO` ficam intocados.

## O que NÃO faço
- Não toco em `t_voucher_anexos` (intacto)
- Não refatoro UI, não crio etapa nova
- Não mexo em master/filhos, robô matching, comprovantes

## Arquivos tocados
- `supabase/functions/mariadb-proxy/index.ts` — helper + chamadas + mudança na etapa inicial do sync RM
- `mem://vouchers/etapa-advance-requires-anexos` — nova memória com a regra
- Operação de backfill via insert tool

## Validação
1. `curl` tentando avançar voucher sem anexo → retorna `ANEXOS_OBRIGATORIOS`
2. `SELECT COUNT(*) FROM t_vouchers WHERE etapa_atual NOT IN ('OPERACAO','CANCELADO','CONCLUIDO') AND NOT EXISTS(anexos)` → 0
3. Próximo sync RM: vouchers novos caem em OPERACAO
