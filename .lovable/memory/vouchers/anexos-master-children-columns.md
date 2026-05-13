---
name: Anexos master/filhos columns
description: t_voucher_anexos has is_master + filhos_spos columns populated at insert time, preserving hierarchy even after voucher deletion
type: feature
---
**Tabela `dados_dachser.t_voucher_anexos`** tem 2 colunas extras:
- `is_master TINYINT(1) NOT NULL DEFAULT 0` — `1` se o voucher referenciado é/era master.
- `filhos_spos TEXT NULL` — JSON array de SPOs dos filhos no momento do upload, ex.: `["20261566858","20261566859"]`. NULL para vouchers comuns.

**Populado em `save_voucher_anexo`** (mariadb-proxy/index.ts): consulta `t_vouchers.is_master` + lista filhos via `voucher_master_id` antes do INSERT. Falha silenciosa apenas loga (não bloqueia upload).

**Backfill executado**: 112 anexos via JOIN com `t_vouchers`, +53 órfãos via parsing de `t_voucher_logs.detalhe` (acao=`MASTER_CRIADO`, padrão `vouchers: <SPOs separados por ", ">`).

**Motivo**: anexos sobrevivem à exclusão do voucher (não há FK cascade); manter contexto de hierarquia direto na linha do anexo evita perda de informação e dependência de logs.
