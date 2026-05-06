## Limpeza imediata + prevenção de duplicidade em `save_voucher_esteira`

### A. Limpeza dos vouchers duplicados atuais

Manter apenas o "completo" (com anexos + linha digitável + etapa mais avançada) em cada `numero_spo`:

**Manter:**
- `105-292894 DIM-BY` → `6a647810-5511-486d-9be7-5f81cda3b0cd` (FINANCEIRO, 2 anexos, boleto)
- `105-292895 DIM-BY` → `79865b98-63ce-4ba5-9348-6cb932fdf440` (FINANCEIRO, 2 anexos, boleto)

**Excluir** (sem anexos, sem boleto):
- `08dde019-8a23-43a8-b72a-8b295fb2a66d` (294, FINANCEIRO duplicado vazio)
- `10b438a7-f079-4689-a825-4f783f42de8f` (294, OPERACAO vazio)
- `91f7394f-b32a-46b6-9a68-0154dd5eaa32` (295, OPERACAO vazio)

Para cada um: DELETE em `t_voucher_logs`, `t_voucher_anexos`, `t_dados_financeiro_voucher` (se espelho), `t_vouchers`. Executado via `supabase--curl_edge_functions` → `mariadb-proxy` (raw_query).

### B. Correção de raiz em `save_voucher_esteira` (mariadb-proxy/index.ts ~linha 6290)

Hoje a checagem de duplicata e o INSERT não são atômicos: dois requests simultâneos veem zero "avançado" e ambos inserem. Corrigir com regra **idempotente pós-INSERT**:

1. Após o INSERT, executar uma query de reconciliação para o mesmo `numero_spo`:
   ```sql
   SELECT v.id, v.etapa_atual, v.linha_digitavel, v.created_at,
          (SELECT COUNT(*) FROM t_voucher_anexos a WHERE a.voucher_id = v.id) AS n_anexos
   FROM t_vouchers v WHERE numero_spo = ?
   ```
2. Se vier mais de 1 linha, aplicar a regra de "vencedor único":
   - Score = `(n_anexos > 0 ? 100 : 0) + (linha_digitavel IS NOT NULL ? 50 : 0) + ETAPA_RANK(etapa_atual)` onde `ETAPA_RANK`: A_PROCESSAR=0, RASCUNHO=1, OPERACAO=2, AJUSTE_OPERACAO=2, FISCAL=3, AJUSTE_FISCAL=3, SUPERVISOR=4, FINANCEIRO=5, ROBO=6, CONCLUIDO=7.
   - Em empate, mantém o `id` lexicograficamente menor (estável).
   - Deletar todos os perdedores (logs, anexos, vouchers).
3. Adicionar `UNIQUE INDEX` em `t_vouchers(numero_spo)` **depois** da limpeza (via `ALTER TABLE … ADD UNIQUE`). Se já existir índice, `try/catch` silencia. Isso previne duplicidade no banco mesmo sob concorrência futura.

### C. Job de limpeza recorrente (defesa em profundidade)

Adicionar action `cleanup_duplicate_vouchers` no `mariadb-proxy` que aplica a regra do passo B a todos os `numero_spo` com `COUNT(*) > 1`. Não precisa de cron novo — pode ser disparado pelo cron existente `vouchers-status-cron` (1 min).

### Arquivos afetados

- `supabase/functions/mariadb-proxy/index.ts` (handler `save_voucher_esteira` + novo handler `cleanup_duplicate_vouchers`)
- `supabase/functions/vouchers-status-cron/index.ts` (chamar o cleanup) — se existir; senão, ficam só A+B.

### O que NÃO será alterado

- UI/frontend de criação de voucher (ChangeOnly backend).
- Outros handlers de INSERT (`import_rm_voucher`, `sync_incremental`, `master`) — esses já filtram por `id_rm` ou criam masters; não estão envolvidos no caso reportado.
