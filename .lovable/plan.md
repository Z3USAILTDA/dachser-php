

## Plano: Ajustes na Esteira de Vouchers (13 itens)

São muitas alterações. Vou detalhar cada uma cirurgicamente.

---

### 1. Master: numero_spo assume o filho com menor id_rm na criação

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts` (~linha 10961-10964)

Atualmente o master é criado com `MASTER-<random>`. Alterar para:
- Após resolver os filhos (linha ~10968), consultar o `id_rm` de cada filho via JOIN com `t_dados_financeiro_voucher`
- Selecionar o `numero_spo` do filho cujo `id_rm` é o menor
- Usar esse valor como `numeroSpoMaster` em vez de `MASTER-<random>`
- Manter o `nome_master` como campo de apelido/display

### 2. Fiscal pode editar numero_spo do Master (já existe, ajustar label)

**Arquivo:** `src/components/esteira/VoucherFiscalActions.tsx` (linhas 282-307)

O campo "Atualizar Nº SPO" já existe. Ajustes:
- Alterar label para "Nº SPO (identificado automaticamente, edite se divergente)"
- Pré-preencher o `novoNumeroSpo` com o `voucher.numeroSPO` atual para que o fiscal veja o valor identificado e só altere se necessário
- Garantir que ao aprovar na etapa fiscal, o `numero_spo` atualizado seja o que aparece na tela inicial e pagamentos

### 3. Tela inicial e pagamentos: mostrar numero_spo em vez de nome_master

**Arquivo:** `src/components/esteira/VoucherTable.tsx` (linhas 508-512)

Atualmente: `voucher.nomeMaster ? voucher.nomeMaster : voucher.numeroSPO`
Alterar para sempre mostrar `voucher.numeroSPO` (que agora será o valor correto do RM). O `nomeMaster` pode ficar como tooltip ou subtítulo.

**Arquivo:** `src/components/esteira/PagamentosTab.tsx` — mesma lógica onde exibe `nome_master`.

### 4. Robô: identificação de comprovante usa numero_spo do master

**Arquivo:** `supabase/functions/parse-comprovante-pdf/index.ts`

Na lógica de matching, quando o voucher é master, deve usar o `numero_spo` (que agora é o correto) para fazer match com o nome do arquivo. Verificar se a lógica de `get_vouchers_for_comprovante` já faz isso corretamente agora que o `numero_spo` não é mais `MASTER-xxx`.

### 5. Botões de copiar — correção definitiva

**Arquivos afetados:**
- `src/components/maritimo/HistoryModal.tsx` (linhas 78-81)
- `src/components/draft/DraftDataGrid.tsx` (linha 677)
- `src/components/draft/BookingResultCard.tsx` (linha 51)
- `src/components/esteira/DadosPagamentoPanel.tsx`
- `src/components/esteira/PagamentosTab.tsx`

Substituir TODOS os usos de `navigator.clipboard.writeText` por `copyToClipboard` de `@/utils/clipboard`. Busca global e substituição.

### 6. Remover "Sem Voucher" do Histórico de Baixas

**Arquivo:** `src/components/esteira/HistoricoBaixasTab.tsx`

Remover:
- Estado `modalOpen`, `semVoucherData`, `semVoucherLoading`, `semVoucherSearch`, `semVoucherPage` (linhas 46-50)
- Botão "Sem Voucher" (linha ~364-367)
- Modal "Baixas sem Voucher" (linha ~443+)
- Função de carregamento `get_baixas_sem_voucher`

### 7. "A definir" → "Pendente" como tipo exec padrão

**Arquivo:** `src/types/voucher.ts`
- Renomear label: `A_DEFINIR: "Pendente"` (linha 137)

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`
- No caso `list_pagamentos`, garantir que `tipo_execucao_pagamento` default seja `A_DEFINIR` (já é NULL, mas ao exibir, tratar NULL como `A_DEFINIR` = "Pendente")

**Arquivo:** `src/components/esteira/PagamentosTab.tsx`
- Atualizar todos os labels "A definir" para "Pendente" nos selects e dropdowns

### 8. Robô: mensagem de comprovantes enviados com contagem errada (0)

**Arquivo:** `src/components/esteira/VoucherRoboActions.tsx`

O `handleComprovanteUpload` faz upload individual. A mensagem "0 arquivos enviados" sugere que o bulk upload (se existir) não está contando. Investigar o fluxo de upload em batch e corrigir a contagem de sucesso/erro.

**Arquivo:** `src/components/esteira/VoucherRoboActions.tsx` — o `hasComprovante` verifica `voucher.anexos.some(a => a.tipo === "COMPROVANTE")` (busca UM só). Para suportar múltiplos comprovantes (item 10), precisa listar todos.

### 9. Remover restrição de acesso à tela da esteira

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx` (linhas 1502-1524)

Remover o bloco `if (!hasEsteiraAccess)` que bloqueia o acesso. Permitir visualização para qualquer usuário logado. Manter restrições de funcionalidades (criação, edição, mudança de etapa) via `canCreateVoucher`, `canEditVoucher`, etc.

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx` (linha 1151)
- Mudar `if (hasEsteiraAccess)` para `if (user)` (apenas verificar login)

**Arquivo:** `src/hooks/useUserRole.ts`
- Não precisa alterar — as permissões individuais já retornam false para usuários sem cargo

### 10. Voucher simples com múltiplos comprovantes

**Arquivo:** `src/components/esteira/VoucherRoboActions.tsx`

Atualmente usa `voucher.anexos.find(a => a.tipo === "COMPROVANTE")` (pega apenas 1). Alterar para:
- Listar TODOS os comprovantes: `voucher.anexos.filter(a => a.tipo === "COMPROVANTE")`
- Permitir upload adicional mesmo quando já tem comprovante
- Mostrar lista de comprovantes anexados com opção de remover individualmente

### 11. Processos: vouchers FINANCEIRO não aparecem

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx` (linhas 1186-1228)

O `roleFilteredVouchers` para `isOperacao` filtra apenas `OPERACAO` e `A_PROCESSAR` quando não há filtro de etapa. Para `isFiscal`, filtra apenas `FISCAL`. 

O problema descrito é que sem filtro de etapa, os roles não veem vouchers de outras etapas. Já verificado: quando `filters.etapa !== "all"`, retorna todos os vouchers. 

A correção é: a busca na tela inicial (filtro de texto) NÃO deve ser limitada pelo filtro de etapa automático do role. Se o usuário busca por SPO, deve encontrar em qualquer etapa. Alterar o `roleFilteredVouchers` para não filtrar por etapa quando há texto de busca.

### 12. Cancelamento de voucher por OPERAÇÃO e FISCAL

**Arquivo:** `src/hooks/useUserRole.ts` (linha ~150)
- `canCancelVoucher` atualmente: `isAdmin || isSupervisor || isFinanceiro`
- Alterar para: `isAdmin || isSupervisor || isFinanceiro || isOperacao || isFiscal`

**Arquivo:** `src/components/esteira/VoucherTable.tsx` — já exibe filtro "CANCELADO" na etapa. Adicionar visual de badge "Cancelado" na tabela para vouchers cancelados + filtro rápido.

O `CancelarVoucherDialog` já existe e funciona. Os detalhes (motivo) já são exibidos via logs.

### 13. Pagamentos: voltar para Fiscal OU Operacional

**Arquivo:** `src/components/esteira/PagamentosTab.tsx` (linhas 507-547, 1256-1330)

Atualmente o diálogo "Voltar para Operacional" envia sempre para `OPERACAO`. Alterar para:
- Adicionar um select no diálogo: "Retornar para: [Fiscal | Operacional]"
- Ao selecionar Fiscal, enviar `etapa_atual = "FISCAL"` e logar como `RETORNO_FISCAL`
- Alterar título e labels do diálogo

### 14. Retornar comprovante para pendente: apenas FINANCEIRO

**Arquivo:** `src/components/esteira/VoucherTable.tsx` (linhas 843-853)
- Adicionar prop `canRetornarPendente` condicionada ao role `isFinanceiro || isAdmin`

**Arquivo:** `src/pages/esteira/EsteiraIndex.tsx` 
- Passar a flag adequada na prop do VoucherTable

**Arquivo:** `src/components/esteira/VoucherRoboActions.tsx`
- Condicionar o botão "Retornar para Pendente" ao role do usuário (precisa receber prop ou usar hook)

---

### Resumo de arquivos alterados

| # | Alteração | Arquivos |
|---|-----------|----------|
| 1 | Master assume SPO do filho com menor id_rm | `mariadb-proxy/index.ts` |
| 2 | Fiscal edita numero_spo (pré-preenchido) | `VoucherFiscalActions.tsx` |
| 3 | Tela mostra numero_spo em vez de nome_master | `VoucherTable.tsx`, `PagamentosTab.tsx` |
| 4 | Robô usa numero_spo correto do master | `parse-comprovante-pdf/index.ts` |
| 5 | Copiar: substituir navigator.clipboard | 3-4 arquivos |
| 6 | Remover "Sem Voucher" | `HistoricoBaixasTab.tsx` |
| 7 | "A definir" → "Pendente" | `voucher.ts`, `PagamentosTab.tsx` |
| 8 | Contagem comprovantes robô | `VoucherRoboActions.tsx` |
| 9 | Acesso livre à visualização | `EsteiraIndex.tsx` |
| 10 | Múltiplos comprovantes | `VoucherRoboActions.tsx` |
| 11 | Busca encontra qualquer etapa | `EsteiraIndex.tsx` |
| 12 | Cancelamento por OPERAÇÃO/FISCAL | `useUserRole.ts`, `VoucherTable.tsx` |
| 13 | Voltar para Fiscal ou Operacional | `PagamentosTab.tsx` |
| 14 | Retornar pendente só FINANCEIRO | `VoucherTable.tsx`, `VoucherRoboActions.tsx` |

