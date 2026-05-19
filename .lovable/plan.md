## Fase 3.2 — Endpoints shadow de escrita unitária de Disputas (implementado e validado)

Arquivo único alterado: `supabase/functions/mariadb-proxy/index.ts`. Sem schema, sem frontend, sem endpoints oficiais, sem bulk, sem import planilha, sem `regua-send-aging`/`regua-send-emails`/Olimpo. Nenhum acesso a `dados_dachser.t_dados_financeiro_nfs` nem `dados_dachser.t_dados_rm`. **Sem DELETE físico em nenhuma operação (inclusive limpeza de teste).**

### 1) Allowlist (linha 508-509)

Adicionadas 5 novas actions:
`save_disputa_cr`, `resolve_disputa_cr`, `delete_disputa_cr`, `update_disputa_observacoes_cr`, `update_disputa_responsavel_cr`.

### 2) Cases (após `lookup_documento_cr`, linha 3607+)

#### `save_disputa_cr`
- Body: `{ doc_key, responsavel?, observacoes?, departamento?, escalation? }`.
- Busca título em `v_fin_regua_contas_receber WHERE doc_key=?`. Vazio ⇒ 404 controlado.
- `tipo = v.tipo_documento='FAT_NF' ? 'À vista' : 'A prazo'`.
- Se `t_fin_disputas.nf = doc_key` existe ⇒ UPDATE (campos opcionais via `COALESCE(?, col)`, `is_disputa=1`, `resolved_at=NULL`, `deleted_at=NULL`).
- Se não existe ⇒ INSERT com `is_disputa=1`.
- Retorno: `{ success, action, doc_key, mode:'insert'|'update', affectedRows, message }`.

#### `resolve_disputa_cr`
- Body: `{ nf? | doc_key? }`.
- `UPDATE t_fin_disputas SET resolved_at=NOW(), is_disputa=0, updated_at=NOW() WHERE nf=?`. Sem DELETE físico.
- Retorno: `{ success, action, nf, affectedRows, message }`.

#### `delete_disputa_cr`
- Body: `{ nf? | doc_key? }`.
- `UPDATE t_fin_disputas SET deleted_at=NOW(), is_disputa=0, updated_at=NOW() WHERE nf=?`.
- Upsert em `t_financeiro_soft_delete (documento, active, active_at)` com `active=0` via `ON DUPLICATE KEY UPDATE`.
- Retorno: `{ success, action, nf, affectedRows, softDeleteUpserted, message }`.

#### `update_disputa_observacoes_cr`
- Body: `{ nf? | doc_key?, observacoes }`.
- `UPDATE t_fin_disputas SET observacoes=?, updated_at=NOW() WHERE nf=?`. Sem auto-create.
- `affectedRows=0` ⇒ `success:false, message:'Disputa não encontrada'`.

#### `update_disputa_responsavel_cr`
- Body: `{ nf? | doc_key?, responsavel }`.
- `UPDATE t_fin_disputas SET responsavel=?, updated_at=NOW() WHERE nf=?`. Sem auto-create.

### 3) Logs
Padrão `[<action>] key=<chave> affected=<n>` / `mode=...` / `softDeleteUpserted=...` / `error: <msg>`. Sem dados sensíveis.

### 4) Garantias / fora de escopo
- Não tocados: `get_disputas`, `lookup_documento`, `save_disputa`, `delete_disputa`, `resolve_disputa`, `update_disputa_observacoes`, `update_disputa_responsavel`, `bulk_*`, `import_disputas_planilha`, `check_disputas_planilha`, `regua-send-aging`, `regua-send-emails`, Olimpo, frontend, schema, `v_fin_regua_contas_receber`, `t_fin_disputas`, `t_financeiro_soft_delete`, `t_dados_rm`, `t_dados_financeiro_nfs`.
- Zero DELETE físico — **inclusive limpeza de dados de teste deve usar apenas atualizações lógicas** (`deleted_at=NOW(), is_disputa=0` em `t_fin_disputas`; `active=1` em `t_financeiro_soft_delete` para reabrir visibilidade).

### 5) Validação executada (curl_edge_functions)

| # | Cenário | Resultado |
|---|--------|-----------|
| 1 | `save_disputa_cr` com `doc_key='CR\|4318338'` | `success:true, mode:'insert', affectedRows:1` |
| 2 | `save_disputa_cr` repetido mesmo `doc_key` | `success:true, mode:'update'`, COUNT=1 (sem duplicar) |
| 3 | `update_disputa_observacoes_cr` por `nf` | `affectedRows:1, success:true` |
| 4 | `update_disputa_responsavel_cr` por `doc_key` | `affectedRows:1, success:true` |
| 5 | `resolve_disputa_cr` | `resolved_at` setado, `is_disputa=0`, registro persistido |
| 6 | Reabrir via `save_disputa_cr` | `resolved_at=NULL`, `is_disputa=1` ⇒ funciona |
| 7 | `delete_disputa_cr` | `deleted_at` setado, `softDeleteUpserted:true`, `t_financeiro_soft_delete.active=0` |
| 8 | `save_disputa_cr` com `doc_key` inexistente | 404 `'Título não encontrado'` |
| 9 | `update_*_cr` em `nf` inexistente | `success:false, message:'Disputa não encontrada'` |

### Próximos passos (não nesta fase)
- Avaliar sincronização com `t_dados_rm` em fase futura.
- Migração das writes bulk e import por planilha em fase posterior.
- Adoção dos endpoints `_cr` pelo frontend após período shadow.
