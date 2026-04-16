

## Plano Completo: 5 Ajustes na Esteira do Voucher

---

### 1. Deduplicação de Vouchers (SQL)

**Problema**: O `LEFT JOIN` com `t_dados_financeiro_voucher` pode gerar linhas duplicadas quando há múltiplos registros com mesmo `nd` mas `documento`/`valor_nf` diferentes.

**Alterações em `supabase/functions/mariadb-proxy/index.ts`**:

- **`get_vouchers_esteira` (L6398)**: Adicionar `GROUP BY v.id` antes do `ORDER BY`
- **`list_pagamentos` (L9176-9182)**: Trocar `SELECT DISTINCT` por `GROUP BY v.id` antes do `ORDER BY` (mais confiável que DISTINCT com subqueries)
- **Stats query (L9208-9217)**: Já usa subquery `NOT EXISTS`, sem JOIN direto — OK como está

---

### 2. Navegação entre Documentos no Modal

**Problema**: Cada `FilePreview` abre modal isolado. Para ver outro documento precisa fechar e abrir.

**Alterações em `src/components/esteira/FilePreview.tsx`**:
- Adicionar props opcionais: `allFiles?: {fileName: string, fileUrl: string, fileType: string}[]` e `initialIndex?: number`
- Quando `allFiles` é fornecido, mostrar setas de navegação (←/→) no header do modal para trocar entre documentos
- Ao navegar, resetar estados de PDF (pageNumber, numPages, pdfError) e XML (xmlContent)
- Manter compatibilidade: quando `allFiles` não é passado, funciona como hoje

**Alterações nos 4 consumidores**:
- `VoucherDetailsView.tsx` (L457): Passar `allFiles` com todos os anexos do voucher e `initialIndex` com o índice do anexo clicado
- `PagamentosTab.tsx` (L1197): Idem para anexos do pagamento
- `VoucherTable.tsx` (L925): Idem para anexos no modal da tabela
- `ComprovantesTab.tsx` (L264): Idem para comprovantes

---

### 3. Badge "Urgente" em Toda Visualização

**Problema**: Badge de urgência só aparece em `PagamentosTab` (L983-986) e só para `URGENTE_REAL`. Não aparece na tabela principal `VoucherTable` nem para `URGENTE_AUTOMATICO`.

**Alterações em `src/components/esteira/VoucherTable.tsx` (L511-534)**:
- Após o badge Master e ADF, adicionar:
  - `URGENTE_REAL`: Badge vermelho `bg-red-500/15 text-red-400 border-red-500/30` com texto "⚡ Urgente"
  - `URGENTE_AUTOMATICO`: Badge laranja `bg-orange-500/15 text-orange-400 border-orange-500/30` com texto "⚡ Auto"

**Alterações em `src/components/esteira/PagamentosTab.tsx` (L983-987)**:
- Adicionar badge para `URGENTE_AUTOMATICO` (atualmente só mostra para `URGENTE_REAL`)

---

### 4. Validação de Campos Obrigatórios no Envio

**Problema**: Campos como `tipoDocumento` podem ter valor do banco mas não preenchidos pelo usuário, permitindo envio indevido.

**Alterações em `src/components/esteira/VoucherOperacaoActions.tsx` (L238, dentro de `handleEnviar`)**:
- Antes das verificações de anexos (L252), adicionar validação:
  - `tipoDocumento` não pode ser vazio/null
  - `formaPagamento` não pode ser vazio/null
  - `vencimento` não pode ser vazio/null
- Se faltar, bloquear com `toast` de erro listando os campos faltantes

**Alterações em `src/components/esteira/VoucherRascunhoActions.tsx`**:
- Mesma validação no handler de envio do rascunho

---

### 5. Filtro "Pendente" (A_DEFINIR) + Valor Padrão no Banco

**Problema**: Filtro "Pendente" busca `tipo_execucao_pagamento = 'A_DEFINIR'` mas no banco o valor é `NULL`. Resultado: 0 resultados.

**Alterações**:

**5a. `src/utils/voucherRmSync.ts` (L23)**:
- Trocar `voucher.tipoExecucaoPagamento || null` por `voucher.tipoExecucaoPagamento || "A_DEFINIR"`

**5b. `supabase/functions/mariadb-proxy/index.ts` — `insert_dados_rm` (L8771)**:
- Trocar `tipoExec || null` por `tipoExec || 'A_DEFINIR'`

**5c. `supabase/functions/mariadb-proxy/index.ts` — `set_tipo_execucao_pagamento` (L9248)**:
- Trocar mapeamento `'A_DEFINIR': 'MANUAL'` por `'A_DEFINIR': 'A_DEFINIR'` (manter o valor real)

**5d. `supabase/functions/mariadb-proxy/index.ts` — filtro `list_pagamentos` (L9108-9116)**:
- Quando `filterTipoExecucao === 'A_DEFINIR'`:
```sql
(v.tipo_execucao_pagamento IS NULL OR v.tipo_execucao_pagamento = '' OR v.tipo_execucao_pagamento = 'A_DEFINIR')
```
- Garante compatibilidade com registros antigos (NULL) e novos (`A_DEFINIR`)

---

### Resumo de Arquivos Alterados

| # | Arquivo | Motivo |
|---|---------|--------|
| 1 | `supabase/functions/mariadb-proxy/index.ts` | GROUP BY dedup + filtro A_DEFINIR + default tipo_exec + mapa A_DEFINIR |
| 2 | `src/components/esteira/FilePreview.tsx` | Navegação entre documentos (setas ←/→) |
| 3 | `src/components/esteira/VoucherTable.tsx` | Badge urgente + passar allFiles ao FilePreview |
| 4 | `src/components/esteira/VoucherDetailsView.tsx` | Passar allFiles ao FilePreview |
| 5 | `src/components/esteira/PagamentosTab.tsx` | Badge URGENTE_AUTOMATICO + passar allFiles ao FilePreview |
| 6 | `src/components/esteira/ComprovantesTab.tsx` | Passar allFiles ao FilePreview |
| 7 | `src/components/esteira/VoucherOperacaoActions.tsx` | Validação campos obrigatórios |
| 8 | `src/components/esteira/VoucherRascunhoActions.tsx` | Validação campos obrigatórios |
| 9 | `src/utils/voucherRmSync.ts` | Default "A_DEFINIR" para tipo_exec |

