## Preencher "Emissão" e "Enviado por" vazios na esteira

Aplica-se aos vouchers fora da etapa `A_PROCESSAR` exibidos em `VoucherTable`.

### 1. Backend — query (`supabase/functions/mariadb-proxy/index.ts`)

Atualizar `get_vouchers_ativos` e `get_vouchers_combined` (ramo ativos) para usar fallbacks já no SELECT:

- **Emissão**: trocar `v.data_emissao_documento` exibido por
  `COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento`.
  (incluir `MAX(data_emissao) AS data_emissao` no subselect `dfv` em `get_vouchers_ativos`, igual já existe em `combined`).

- **Enviado por**: relaxar o filtro de ações no subselect `enviado_por_user_name` — remover o `IN (...)` e usar o último log de qualquer ação:
  ```
  (SELECT l.user_name FROM dados_dachser.t_voucher_logs l
   WHERE l.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci
     AND l.user_name IS NOT NULL AND l.user_name <> ''
   ORDER BY l.data_hora DESC LIMIT 1) AS enviado_por_user_name
  ```

### 2. Backend — nova action de backfill

Adicionar action `backfill_emissao_enviado_por` em `mariadb-proxy/index.ts` (registrar na lista de actions permitidas). Executa duas atualizações em `dados_dachser.t_vouchers`, restritas a vouchers fora de `A_PROCESSAR`:

```sql
-- A) Emissão: copiar de dfv.data_emissao quando vazia
UPDATE dados_dachser.t_vouchers v
JOIN (
  SELECT nd, MAX(data_emissao) AS data_emissao
  FROM dados_dachser.t_dados_financeiro_voucher
  WHERE data_emissao IS NOT NULL
  GROUP BY nd
) dfv ON TRIM(dfv.nd) COLLATE utf8mb4_general_ci = TRIM(v.numero_spo) COLLATE utf8mb4_general_ci
SET v.data_emissao_documento = dfv.data_emissao
WHERE v.etapa_atual <> 'A_PROCESSAR'
  AND (v.data_emissao_documento IS NULL OR v.data_emissao_documento = '0000-00-00');

-- B) Enviado por: gravar em coluna dedicada (criar se não existir)
ALTER TABLE dados_dachser.t_vouchers
  ADD COLUMN IF NOT EXISTS enviado_por_user_name VARCHAR(120) NULL;

UPDATE dados_dachser.t_vouchers v
JOIN (
  SELECT l.voucher_id, l.user_name
  FROM dados_dachser.t_voucher_logs l
  JOIN (
    SELECT voucher_id, MAX(data_hora) AS max_dh
    FROM dados_dachser.t_voucher_logs
    WHERE user_name IS NOT NULL AND user_name <> ''
    GROUP BY voucher_id
  ) m ON m.voucher_id = l.voucher_id AND m.max_dh = l.data_hora
) lg ON lg.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci
SET v.enviado_por_user_name = lg.user_name
WHERE v.etapa_atual <> 'A_PROCESSAR'
  AND (v.enviado_por_user_name IS NULL OR v.enviado_por_user_name = '');
```

A action retorna `{ updated_emissao, updated_enviado_por }` (via `affectedRows`).

### 3. UI — fallback final em runtime (`src/components/esteira/VoucherTable.tsx`)

Como rede de segurança, manter o que já existe na coluna "Enviado por":
`voucher.enviadoPorUserName || voucher.criadoPorUserName || voucher.criadoPorDfv || "-"`.
Nenhuma outra mudança visual.

### 4. Disparo do backfill

Executar a action `backfill_emissao_enviado_por` uma vez logo após o deploy (via chamada manual a partir do console do navegador autenticado, ou um botão temporário — preferência: chamada manual única, sem UI).

### Observações
- Sem mudanças em `t_vouchers` além do `ADD COLUMN IF NOT EXISTS enviado_por_user_name` (idempotente).
- Sem alteração no fluxo de cadastro/transição: novos registros continuam recebendo o valor pelas queries de leitura (subselect).
- `A_PROCESSAR` permanece intocado (sem registro em `t_vouchers`).