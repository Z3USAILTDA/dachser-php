## Ajustes no Pré-Lançamento

### Problemas a corrigir
1. SPOs em **Pré-Lançamento somem** após importação — hoje são gravados em `PRE_LANCAMENTO` e essa etapa está excluída de todos os filtros principais.
2. **Pré-Lançamento não anexa documentos** — o fluxo pula direto para fechar o lote, mas o usuário precisa anexar a fatura/boleto agora (eles já têm documento).

### Mudanças

**Backend (`supabase/functions/mariadb-proxy/index.ts`)**
- `create_voucher_batch_import` (com `pre_lancamento: true`):
  - Continua marcando os vouchers em `etapa_atual = 'PRE_LANCAMENTO'`.
  - **Não** fecha o batch automaticamente — mantém o batch ativo para que o `BatchDocumentBinderDialog` rode normal e o usuário anexe os documentos.
- `bind_batch_document_to_master_group` / `bind_batch_document_to_voucher`:
  - Quando o voucher está em `PRE_LANCAMENTO`, **mantém a etapa em `PRE_LANCAMENTO`** após anexar o documento (não promove para FISCAL/FINANCEIRO/SUPERVISOR). O documento fica ligado ao voucher pré-lançado, pronto para ser "ativado" depois via "Buscar SPOs do fornecedor".
- `finalize_batch_import`:
  - Para vouchers em `PRE_LANCAMENTO`, exige documento anexado (mesma regra dos demais), mas após finalizar eles continuam em `PRE_LANCAMENTO`.
- `attach_pre_lancamento_to_batch`:
  - Já existe; ao trazer um pré-lançado para um lote vigente, segue o caminho normal (anexa documento → promove para etapa de destino, limpando `PRE_LANCAMENTO`).
- **Visibilidade — adicionar `PRE_LANCAMENTO` aos filtros de etapa**:
  - Remover a exclusão hard-coded de `PRE_LANCAMENTO` em:
    - linha ~7431 (lista de vouchers da Esteira)
    - linha ~16164 (contadores/dashboard)
  - Manter exclusão apenas em listas de "trabalho ativo" onde fizer sentido (será mantida em `AGUARDANDO_DOCUMENTOS_LOTE` e `CONSOLIDADO_NO_MASTER`, conforme já está).
  - Resultado: vouchers em `PRE_LANCAMENTO` aparecem nas listas e podem ser filtrados pela etapa "Pré-Lançamento" no filtro de etapa atual.

**Frontend**
- `BatchImportVoucherDialog.tsx`:
  - Botão "Pré-Lançamento" passa a abrir o `BatchDocumentBinderDialog` (igual ao botão "Confirmar importação"), apenas propagando a flag para o backend.
- `src/types/voucher.ts`:
  - Adicionar `PRE_LANCAMENTO` ao tipo `EtapaAtual` e ao `ETAPA_LABELS` (label: "Pré-Lançamento"), `SLA_POR_ETAPA: 0`.
- Filtros de etapa (Esteira / dashboards): se houver lista whitelist de etapas no front, incluir `PRE_LANCAMENTO` para aparecer no dropdown de filtro.

### Fluxo final
1. Usuário importa em "Pré-Lançamento" → abre o binder → anexa documentos normalmente → finaliza.
2. Vouchers ficam visíveis na Esteira com etapa "Pré-Lançamento" (filtrável).
3. Em uma importação futura, o bloco "Buscar SPOs do fornecedor" no binder traz esses pré-lançados (já com documento) para o novo lote, onde, ao serem incluídos, são promovidos para a etapa de destino normal.

### Fora de escopo
- Notificações específicas para PRE_LANCAMENTO.
- Mudanças no `EsteiraManual`.
