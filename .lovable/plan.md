## Problemas

### 1) Processos em "Aguardando Documentos do Lote" continuam aparecendo
Vouchers criados pelo lote ficam em `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'` (estado de transição). Hoje as queries `get_vouchers_combined` e `get_vouchers_esteira` **não filtram essa etapa**, então quando o usuário não finaliza o lote (ou a finalização falha), os vouchers aparecem na grade principal e nas métricas. A limpeza só roda quando o usuário abre um *novo* preview/criação de lote.

### 2) Master excluído ainda bloqueia a re-importação da mesma planilha
Em `disassemble_master_voucher`, ao excluir o master os filhos recebem `voucher_master_id = NULL` mas **a `etapa_atual` continua `'CONSOLIDADO_NO_MASTER'`**. Esses filhos viram órfãos: ficam visíveis na grade e, no preview de re-importação, o `fetchExistingVouchers` os identifica por `(id_rm, numero_spo)` e marca cada linha como "Já existente na etapa Consolidado no master", impedindo recriar o lote.

## Correções (cirúrgicas, só backend)

### A. Esconder etapas de transição da grade/dashboard
Em `supabase/functions/mariadb-proxy/index.ts`:
- `get_vouchers_combined` (≈ linha 15876): adicionar `AND etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')` no `WHERE`.
- `get_vouchers_esteira` (≈ linha 7415): adicionar a mesma exclusão (`v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')`).

### B. Desmembrar master devolve filhos para etapa correta
Em `disassemble_master_voucher` (≈ linha 13128):
- Buscar `urgencia_tipo` e `cobranca_em_nome_de` dos filhos antes do UPDATE.
- Para cada filho calcular `destino`:
  - `URGENTE_REAL` → `SUPERVISOR`
  - senão, `cobranca = CLIENTE` → `FINANCEIRO`
  - senão → `FISCAL`
- Atualizar com `SET voucher_master_id = NULL, etapa_atual = <destino>, updated_at = NOW()` (em vez de só zerar `voucher_master_id`).
- Mantém o restante do fluxo (deletar master se `keep_master=false` ou sem filhos restantes).

### C. Preview de import limpa filhos órfãos do master
Estender `runAbandonedCleanup` (≈ linha 18205) para também remover vouchers órfãos em `CONSOLIDADO_NO_MASTER` cujo `voucher_master_id` aponta para master inexistente (ou é NULL). Esses são restos de masters de teste já excluídos.

```sql
DELETE v FROM dados_dachser.t_vouchers v
LEFT JOIN dados_dachser.t_vouchers m ON m.id = v.voucher_master_id
WHERE v.etapa_atual = 'CONSOLIDADO_NO_MASTER'
  AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '' OR m.id IS NULL)
  AND v.criado_por_user_id = ?     -- escopo USER
```
(Antes do DELETE, apagar `t_voucher_logs`, `t_voucher_anexos` e `t_voucher_batch_import_item` desses ids — mesmo padrão já usado para `AGUARDANDO_DOCUMENTOS_LOTE`.)

Como a limpeza já é chamada no início de `preview_voucher_batch_import` e `create_voucher_batch_import`, o re-upload da mesma planilha passará a funcionar normalmente.

## Sem mudanças
- Frontend (grade, dialog de bind, dashboard) não muda.
- Lógica de criação de master no `finalize_batch_import` permanece igual.
- RLS, schemas e contratos de API permanecem.
