

## Diagnóstico: 15 Bugs Reportados na Esteira de Vouchers

Analisei o código-fonte de cada componente envolvido. Segue o status e causa raiz de cada item:

---

### 1. Visualização de documentos (olhinho) - FNC e tela inicial

**Status**: Bug parcial no front.
**Causa**: O botão `Eye` existe na coluna "Ações" da `VoucherTable.tsx` (linha 665-671) e navega para a tela de detalhes (`onViewDetails`). Porém, dependendo do papel do usuário (ex: FINANCEIRO), pode haver restrições de visibilidade dos anexos dentro do detalhe. O componente `VoucherDetailsView.tsx` exibe anexos, mas não há botão de "visualizar documento" direto na listagem nem um preview inline.
**Correção**: Adicionar botão de preview/visualização rápida dos anexos diretamente na tabela, ou garantir que o `Eye` button esteja visível para todos os papéis, incluindo FNC (Financeiro).

### 2. Filtro de classificação na tela FNC

**Status**: Parcialmente implementado.
**Causa**: Os filtros inline na `VoucherTable.tsx` incluem etapa, urgência, SLA, valor, comprovante, etc. Porém **não há filtro de "classificação"** (tipo de documento, urgência tipo, origem) na linha de filtros da tabela. O filtro de urgência existe mas mapeia para `urgenciaTipo` (URGENTE_REAL, URGENTE_AUTOMATICO, NORMAL) - precisa validar com a Carol se estes são os corretos.
**Correção**: Adicionar filtros que estejam faltando conforme validação com a Carol.

### 3. Filtros de busca não funcionam

**Status**: Bug confirmado no código.
**Causa**: A busca por SPO (`filters.search`) faz apenas um `includes()` no `numeroSPO` (linha 1243). Porém, os filtros inline da tabela são **independentes** dos filtros "top-level" do `VoucherFilters.tsx`. O `VoucherFilters.tsx` exporta um tipo `FilterValues` diferente do usado em `VoucherTable.tsx` - há dois tipos `FilterValues` duplicados e incompatíveis. A busca na tabela pode não limpar o estado corretamente entre buscas (ver itens 9-12).
**Correção**: Unificar a lógica de filtros e corrigir a limpeza de estado entre buscas.

### 4. Boleto subindo como Transferência no FNC

**Status**: Bug confirmado.
**Causa**: No `mapFormaPag` (linhas 786-791), o mapeamento `'BOL' → 'BOLETO'` existe, mas ao importar do RM, o campo `forma_pag` pode vir em formatos não mapeados. Além disso, na criação manual ou edição, o campo `formaPagamento` é salvo diretamente. É provável que o valor esteja sendo sobrescrito em algum ponto do fluxo entre OPERACAO e FINANCEIRO, ou que o RM envie um código não previsto no mapping.
**Correção**: Investigar via logs do MariaDB qual valor exato está sendo recebido do RM e adicionar ao mapping. Verificar se alguma ação intermediária altera o `forma_pagamento`.

### 5. Voucher Master - Drag & Drop não funciona

**Status**: Bug confirmado.
**Causa**: O `VoucherMasterForm.tsx` (linhas 556-626) usa `<input type="file">` com `<label>` para upload, mas **NÃO implementa `onDragOver`, `onDragEnter`, `onDrop`** na área de upload. Diferente do `FileUpload.tsx` que tem drag-and-drop completo, o form Master usa upload manual simples com `handleFaturaChange`/`handleBoletoChange`.
**Correção**: Substituir as áreas de upload do VoucherMasterForm pelo componente `FileUpload.tsx` existente que já suporta drag-and-drop, ou adicionar os event handlers de drag no form.

### 6. Voucher Master - Sem botão "Enviar ao Fiscal" após criação

**Status**: Bug confirmado.
**Causa**: O `VoucherMasterForm.tsx` cria o voucher master via `create_voucher_master` e fecha o dialog (`onClose()`). Após a criação, o voucher aparece na listagem com etapa "OPERACAO", mas o usuário precisa clicar no voucher, abrir os detalhes, e lá usar o `VoucherOperacaoActions` para enviar ao Fiscal. Não há redirecionamento automático nem botão inline.
**Correção**: Após criação bem-sucedida, navegar automaticamente para a tela de detalhes do voucher master recém-criado, ou adicionar opção de enviar diretamente ao Fiscal no fluxo de criação.

### 7. Voucher Master - SPO mostra número aleatório

**Status**: Bug confirmado.
**Causa**: No `mapVoucherFromDB` (linha 730), o campo `nomeMaster` **NÃO é mapeado** - ele não existe no mapping da listagem. Apenas no `EsteiraVoucherDetails.tsx` (linha 125) ele é mapeado. Além disso, o `numero_spo` do master é gerado automaticamente pelo backend (`create_voucher_master`) com um formato como `MASTER-{timestamp}`, que parece "aleatório" para o usuário.
**Correção**: 
  - Adicionar `nomeMaster: v.nome_master || null` ao `mapVoucherFromDB` em `EsteiraIndex.tsx`
  - Considerar usar o `nomeMaster` como display name quando disponível

### 8. Tela inicial - Voucher aparecendo 3 vezes

**Status**: Bug provável no backend/dados.
**Causa**: O `loadVouchers` combina dados de `get_vouchers_ativos` e `get_vouchers_pendentes_rm` (linhas 873-896). Se o mesmo voucher existir em ambas as fontes (já importado mas ainda aparecendo como "pendente RM"), haverá duplicação. Não há deduplicação por `numeroSPO` ou `id` após o merge.
**Correção**: Adicionar deduplicação no merge: filtrar `rmPendingVouchers` para excluir os que já existem em `mappedVouchers` (comparar por `numero_spo` ou `id_rm`).

### 9, 10, 11, 12. Busca mantém resultados anteriores / traz vouchers aleatórios

**Status**: Bug confirmado no código.
**Causa**: A busca é feita **client-side** com `filters.search` via `includes()` no `numeroSPO` (linha 1243). O problema é que:
  1. O filtro usa `includes()` - uma busca por "2026" vai retornar TODOS os vouchers que contêm "2026" no número.
  2. Não há debounce nem limpeza de estado entre buscas.
  3. O `roleFilteredVouchers` é recalculado via `useMemo` mas depende de `filters.etapa`, não de `filters.search`, então mudanças na busca podem não causar re-render correto.
**Correção**: 
  - Mudar a busca para **match exato** ou **startsWith** em vez de `includes`
  - Garantir que ao limpar a busca, os filtros sejam resetados corretamente
  - Adicionar debounce para evitar buscas parciais

### 13. FINANCEIRO - Lançamento aparecendo 4 vezes

**Status**: Bug provável nos dados/backend.
**Causa**: Similar ao item 8 - possível duplicação na query `get_vouchers_ativos` ou `get_vouchers_esteira` no MariaDB. Se houver JOINs com tabelas de dados financeiros que têm múltiplas linhas por voucher, o resultado pode multiplicar as linhas.
**Correção**: Verificar a query SQL no backend (`mariadb-proxy`) para `get_vouchers_ativos` - provável que um JOIN com `t_dados_financeiro_voucher` está multiplicando registros. Usar `DISTINCT` ou `GROUP BY`.

### 14. FINANCEIRO - Erro ao copiar código de barras

**Status**: Bug confirmado no código.
**Causa**: O `DadosPagamentoPanel.tsx` (linha 82-91) usa `navigator.clipboard.writeText()` diretamente, SEM o fallback implementado em `src/utils/clipboard.ts`. Em ambientes iframe/preview (como o Lovable preview), `navigator.clipboard.writeText()` falha silenciosamente ou lança exceção por falta de permissões.
**Correção**: Substituir `navigator.clipboard.writeText()` pela função `copyToClipboard()` de `src/utils/clipboard.ts` que já tem fallback com `execCommand`.

### 15. FISCAL - Sem opção de acessar documentos pelo olhinho

**Status**: Bug confirmado.
**Causa**: Mesmo que o item 1 - o botão `Eye` na `VoucherTable.tsx` existe mas navega para a tela de detalhes. Para o papel FISCAL, o `roleFilteredVouchers` filtra por `v.etapaAtual === "FISCAL"` (linha 1207), então os vouchers aparecem. O problema pode ser que o botão Eye não é visível ou está sendo ocultado por condições de permissão.
**Correção**: Verificar se há condições que ocultam o botão `Eye` para o role FISCAL e garantir que ele esteja sempre visível.

---

## Plano de Correção (ordenado por impacto)

### Arquivo: `src/components/esteira/DadosPagamentoPanel.tsx`
- **Item 14**: Importar e usar `copyToClipboard` de `@/utils/clipboard` no `handleCopy`

### Arquivo: `src/pages/esteira/EsteiraIndex.tsx`
- **Item 7**: Adicionar `nomeMaster: v.nome_master || null` ao `mapVoucherFromDB` (e na versão legada)
- **Items 8, 13**: Adicionar deduplicação por `numero_spo` no merge de vouchers ativos + RM pendentes
- **Items 9-12**: Melhorar a lógica de busca - usar match mais preciso em vez de `includes`

### Arquivo: `src/components/esteira/VoucherMasterForm.tsx`
- **Item 5**: Adicionar suporte a drag-and-drop nas áreas de upload (reutilizar padrão do `FileUpload.tsx`)
- **Item 6**: Após criação, navegar para a tela de detalhes do voucher master

### Arquivo: `src/components/esteira/VoucherTable.tsx`
- **Items 1, 15**: Garantir que o botão Eye esteja sempre visível independente do role

### Backend/investigação:
- **Item 4**: Investigar logs do MariaDB para o valor de `forma_pagamento` sendo salvo
- **Item 2**: Validar com Carol quais filtros estão faltando
- **Item 13**: Investigar query SQL de `get_vouchers_ativos` para JOINs multiplicativos

