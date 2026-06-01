
## Objetivo

Remover da `t_vouchers` (MariaDB) todos os vouchers SPO que estão **em aberto** (etapa OPERACIONAL ou FISCAL) para que sejam recriados corretamente a partir da nova fonte (`t_dados_financeiro_spo`, com prefix-match tolerante a sufixos tipo " DIM-BY", " SAN").

## Critério final

Excluir vouchers em `dados_dachser.t_vouchers` que atendam **todas** as condições:
- `numero_spo REGEXP '^[0-9]+-[0-9]+'` (formato SPO, ignora NDs puras)
- `etapa_atual IN ('OPERACIONAL','FISCAL')`

Não tocar em vouchers em `ROBO`, `SUPERVISOR`, `CONCLUIDO`, `A_PROCESSAR` etc.

## Passos

1. **Dry-run** — nova ação `cleanup-spo-open` (modo `dry`) na edge `voucher-integrate-rm`:
   - `SELECT id, numero_spo, fornecedor, etapa_atual, valor, created_at FROM t_vouchers WHERE ...` com o critério acima.
   - Retorna contagem + amostra (até 100) para o usuário conferir.

2. **Execução** (modo `execute`, após confirmação do usuário) dentro de transação:
   - Coleta `ids` alvo.
   - `DELETE FROM t_voucher_anexos WHERE voucher_id IN (ids)`
   - `DELETE FROM t_log_entries WHERE voucher_id IN (ids)`
   - `DELETE FROM t_dados_financeiro_voucher_espelho WHERE voucher_id IN (ids)` (se existir)
   - `DELETE FROM t_vouchers WHERE id IN (ids)`
   - Log da contagem removida por tabela.

3. **Reimportação automática** ao final do execute:
   - Chama internamente `action: "import"` da mesma edge, que agora prioriza `t_dados_financeiro_spo` via prefix-match (`SUBSTRING_INDEX(TRIM(nd),' ',1)`).

4. **Validação**:
   - Conferir que SPOs como `105-294424` (armazenado como `105-294424 DIM-BY`) reaparecem ligados corretamente.
   - Logs no console da edge function mostrando antes/depois.

## UI

Botão "Limpar SPOs em aberto e reimportar" no painel admin de Esteira (ou modal já existente de importação em lote), com:
- Botão "Pré-visualizar" → roda dry-run e mostra contagem/amostra.
- Botão "Confirmar exclusão e reimportar" → habilitado após o dry-run.

Se preferir sem UI, executo direto via call manual da edge e reporto resultado.

## Confirmações necessárias

1. Confirmar que `OPERACIONAL` + `FISCAL` cobre tudo que você considera "em aberto" (deixar `ROBO`/`SUPERVISOR` intactos).
2. Anexos vinculados podem ser apagados junto (serão recriados na reimportação)?
3. Quer botão na UI ou execução direta agora?

## Arquivos previstos

- `supabase/functions/voucher-integrate-rm/index.ts` — nova ação `cleanup-spo-open` com modos `dry`/`execute`.
- (opcional) `src/pages/esteira/EsteiraManual.tsx` ou similar — botão de disparo.
