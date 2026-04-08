

## Plano Atualizado: 14 Ajustes na Tela de Voucher

Atualização principal: a regra de deduplicação agora considera que múltiplos registros em `t_dados_financeiro_voucher` com mesmo `nd` **e mesmo `numero_processo`** devem resultar em apenas 1 voucher na listagem.

---

### 1. Visualização de documentos na tela inicial

**`src/components/esteira/VoucherTable.tsx`** — Adicionar botão `Paperclip` na coluna de ações. Ao clicar, abre Dialog com lista de anexos via `get_voucher_anexos`, sem precisar abrir detalhes.

### 2. Filtros por Criador e Enviado por

**`src/components/esteira/VoucherTable.tsx`** — Adicionar inputs de filtro inline para "Criado por" e "Enviado por".

**`src/pages/esteira/EsteiraIndex.tsx`** — Adicionar `enviadoPor` e `criadoPor` ao estado `filters` e aplicar no `filterVouchers`:
```typescript
if (filters.enviadoPor && !voucher.enviadoPorUserName?.toLowerCase().includes(filters.enviadoPor.toLowerCase())) return false;
if (filters.criadoPor && !voucher.criadoPorDfv?.toLowerCase().includes(filters.criadoPor.toLowerCase())) return false;
```

### 3. Correção de filtros inconsistentes

**`src/pages/esteira/EsteiraIndex.tsx`** — Adicionar aplicação do filtro `statusBaixa` que existe na interface mas nunca é aplicado em `filterVouchers`. Garantir que `drillDownFilter` reseta quando filtros inline mudam.

### 4. Duplicidade de registros (ATUALIZADO)

**Causa raiz**: `get_vouchers_esteira` (linha 6301) faz `LEFT JOIN` direto com `t_dados_financeiro_voucher`, sem agrupamento. Se existem N registros com mesmo `nd`, o voucher aparece N vezes.

**Regra**: Se múltiplos registros em `t_dados_financeiro_voucher` possuem o mesmo `nd` E o mesmo `numero_processo`, devem ser agrupados em 1 único registro (sem duplicação).

**`supabase/functions/mariadb-proxy/index.ts`** — `get_vouchers_esteira`: substituir o LEFT JOIN direto por subquery agrupada (igual ao `get_vouchers_ativos`):
```sql
LEFT JOIN (
  SELECT nd, 
    MIN(id_rm) as id_rm, 
    MIN(created_by) as created_by,
    MIN(numero_processo) as numero_processo
  FROM dados_dachser.t_dados_financeiro_voucher
  GROUP BY nd
) dfv ON dfv.nd COLLATE utf8mb4_general_ci = v.numero_spo COLLATE utf8mb4_general_ci
```

**`src/pages/esteira/EsteiraIndex.tsx`** — Deduplicação client-side adicional como segurança:
```typescript
const seenIds = new Set<string>();
const allVouchers = [...deduplicatedRMPending, ...mappedVouchers].filter(v => {
  if (seenIds.has(v.id)) return false;
  seenIds.add(v.id);
  return true;
});
```

### 5. Cópia de código de barras / dados bancários

**`src/components/esteira/DadosPagamentoPanel.tsx`** — Sincronizar `linhaDigitavelInput` com prop via `useEffect`.

**`src/components/esteira/PagamentosTab.tsx`** — Substituir `navigator.clipboard.writeText` por `copyToClipboard` com fallback.

### 6. Busca inconsistente

**`src/pages/esteira/EsteiraIndex.tsx`** — No filtro de busca, usar `startsWith` também no `nomeMaster` (em vez de `includes`) para evitar matches parciais indevidos.

### 7. Erro no envio — mensagem clara

**`src/components/esteira/VoucherOperacaoActions.tsx`**, **`VoucherFiscalActions.tsx`**, **`VoucherSupervisorActions.tsx`**, **`VoucherFinanceiroActions.tsx`** — Mapear códigos de erro técnicos (`WORKER_LIMIT`, `timeout`) para mensagens amigáveis no `catch`.

### 8. Voucher Master — número SPO correto

**`src/components/esteira/VoucherTable.tsx`** — Sempre exibir `numeroSPO` como identificador principal; `nomeMaster` como subtítulo abaixo (já existe parcialmente).

### 9. Voucher Master — separação visual

**`src/components/esteira/VoucherTable.tsx`** e **`PagamentosTab.tsx`** — Adicionar destaque visual (`border-l-4 border-l-purple-500 bg-purple-500/5`) e badge com nome do Master.

### 10. Tela de pagamentos (olhinho) — vouchers do master

**`src/components/esteira/PagamentosTab.tsx`** — No dialog de detalhes, quando for voucher master, fazer chamada `get_voucher_filhos` e exibir lista dos vouchers vinculados.

### 11. Performance — ações

**`src/components/esteira/PagamentosTab.tsx`** — Otimizar `handleSetTipoExecucao` e `handleSetReady` para update local do estado (sem reload completo). Manter `loadPagamentos()` apenas em batch.

### 12. Tipo Exec — "A definir" + bloqueio

**`src/types/voucher.ts`** — Adicionar `"A_DEFINIR"` ao `TipoExecucaoPagamento` e `TIPO_EXECUCAO_LABELS`.

**`src/components/esteira/PagamentosTab.tsx`** — Adicionar opção no select. Bloquear "marcar como pronto" se tipo for `A_DEFINIR`.

### 13. Voucher Master — comprovantes pelos filhos

**`src/components/esteira/ComprovantesTab.tsx`** e **`mariadb-proxy`** — Ao listar comprovantes de um master, incluir comprovantes dos vouchers filhos via subquery com `voucher_master_id`.

### 14. Listagem de comprovantes — últimos 5 dias úteis

**`supabase/functions/mariadb-proxy/index.ts`** — No action `list_comprovantes`, adicionar filtro `WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`.

### 15. FNC — voltar para Fiscal/OPS

**`src/pages/esteira/EsteiraVoucherDetails.tsx`** — Remover a condição `cobrancaEmNomeDe === "DACHSER"` que bloqueia o checkbox de ajuste fiscal. Verificar que duplo clique na tabela funciona em todos os casos.

---

### Arquivos alterados (resumo)

| Arquivo | Alterações |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Dedup query com GROUP BY, comprovantes master+filhos, limite 7 dias |
| `src/pages/esteira/EsteiraIndex.tsx` | Filtros criador/enviado, dedup client-side, busca precisa, statusBaixa |
| `src/components/esteira/VoucherTable.tsx` | Botão documentos, filtros inline, master visual, SPO correto |
| `src/components/esteira/PagamentosTab.tsx` | Master visual/filhos, performance, A_DEFINIR, copy fix |
| `src/components/esteira/DadosPagamentoPanel.tsx` | Sync linhaDigitavel prop |
| `src/components/esteira/ComprovantesTab.tsx` | Filhos de master |
| `src/components/esteira/VoucherOperacaoActions.tsx` | Mensagens erro amigáveis |
| `src/components/esteira/VoucherFiscalActions.tsx` | Mensagens erro amigáveis |
| `src/components/esteira/VoucherFinanceiroActions.tsx` | Mensagens erro amigáveis, checkbox fix |
| `src/types/voucher.ts` | A_DEFINIR tipo execução |
| `src/pages/esteira/EsteiraVoucherDetails.tsx` | Checkbox ajuste fiscal sem guarda DACHSER |

