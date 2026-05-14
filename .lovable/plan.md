# Executar a limpeza/re-vínculo no MariaDB

## Estado atual
- Código de `cleanup_orphan_anexos_and_relink` está **deployed** em `supabase/functions/mariadb-proxy/index.ts` (7873-7937).
- Matchers endurecidos e cascade nos deletes — **já em produção**.
- **Não foi executado** nenhum UPDATE/DELETE no MariaDB ainda. Logs da edge function não mostram a action sendo chamada.
- Os 4 anexos errados (`fbf934c9…`, `cf189dd4…`, `bbe1cee7…`, `ef2fff80…`) continuam vinculados aos vouchers vizinhos. Os 44 órfãos continuam em `t_voucher_anexos`.

## Ação proposta
Disparar a ação uma única vez via `supabase.functions.invoke('mariadb-proxy', { body: { action: 'cleanup_orphan_anexos_and_relink' } })` (ou `curl` direto). Ela:

1. Para cada um dos 4 alvos:
   - 324 → busca voucher por `numero_spo='20261566968'` ou `id_rm='20261566968'` e faz `UPDATE t_voucher_anexos SET voucher_id=? WHERE id='fbf934c9-...'`
   - 370 → idem para `20263777175` no anexo `cf189dd4-...`
   - 402 → idem para `20261882950` no anexo `bbe1cee7-...`
   - 434 → idem para `20261882956` no anexo `ef2fff80-...`
2. `DELETE FROM t_voucher_anexos WHERE voucher_id NOT IN (SELECT id FROM t_vouchers)` — remove os 44 órfãos.
3. Retorna JSON com `relinked`, `relinkErrors`, `deletedOrphans`.

## Verificação após execução
- Conferir resposta da action: `relinked.length === 4` e sem `relinkErrors`.
- `SELECT voucher_id FROM t_voucher_anexos WHERE id IN (...4 ids...)` deve refletir os IDs novos.
- `SELECT COUNT(*) FROM t_voucher_anexos a LEFT JOIN t_vouchers v ON v.id=a.voucher_id WHERE v.id IS NULL` deve retornar 0.

## Sem mudança de código
Nenhum arquivo precisa ser editado — só executar a action já implantada. Se algum dos 4 vouchers-alvo não existir em `t_vouchers`, o item correspondente cai em `relinkErrors` e tratamos manualmente caso a caso.
