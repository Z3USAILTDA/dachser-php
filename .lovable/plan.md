# Esteira de Vouchers — busca exata por ND/SPO e estado de carregamento

Dois ajustes pequenos e cirúrgicos no filtro de busca da tabela de vouchers (Esteira). Sem mexer em layout, colunas ou outros filtros.

## 1. Remover o `LIKE` da busca por ND/SPO — somente valor completo

Hoje a busca aceita início parcial (`startsWith` no front e `LIKE '%termo%'` / `LIKE 'termo%'` no backend). Vamos passar a aceitar apenas correspondência exata do ND/SPO digitado.

**Frontend — `src/pages/esteira/EsteiraIndex.tsx`** (função `filterVouchers`, linhas ~1378–1386):
- Trocar `startsWith(searchLower)` por igualdade case-insensitive (`=== searchLower`) nos três checks: `spoMatch`, `masterNameMatch` e `childSPOMatch`.
- Normalizar comparando apenas o primeiro token (antes do espaço) do `numeroSPO`, para casar com a regra já existente "SPO/ND prefix identity" (`SUBSTRING_INDEX(x, ' ', 1)`).

**Backend — `supabase/functions/mariadb-proxy/index.ts`:**
- `search_masters_by_child_spo` (linha ~17661): substituir `numero_spo LIKE ?` por igualdade exata com `SUBSTRING_INDEX(TRIM(numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`, passando o termo sem o `%`.
- `search_vouchers_including_concluded` (linhas ~17504–17613): manter apenas o **fast-path** (igualdade indexada por `SUBSTRING_INDEX`). Remover o fallback `LIKE` (slow-path) inteiro, para que a busca não retorne mais matches parciais por fornecedor/CNPJ/processo. Resultado: ou bate exatamente o ND, ou não retorna nada.

Nenhuma mudança nos outros filtros da tabela (Processo, Fornecedor, etc.) — esses continuam com `includes`/`LIKE` como hoje.

## 2. Mostrar "Carregando…" enquanto a busca consulta o backend

Hoje, assim que o usuário digita, a tabela já mostra **"Nenhum voucher/SPO encontrado"** antes das chamadas `search_masters_by_child_spo` e `search_vouchers_including_concluded` voltarem, dando a falsa impressão de inexistência.

**Frontend — `src/pages/esteira/EsteiraIndex.tsx`:**
- Adicionar estado `searchLoading` (boolean) acionado quando:
  - há `filters.search` com ≥ 2 caracteres, **e**
  - o debounce ainda não disparou **ou** alguma das duas invocações (`search_masters_by_child_spo`, `search_vouchers_including_concluded`) está em andamento.
- Setar `true` no início de cada `setTimeout` de debounce e nas chamadas; setar `false` no `finally` de cada uma. Quando ambas terminam, `searchLoading = false`.

**Frontend — `src/components/esteira/VoucherTable.tsx`:**
- Adicionar prop opcional `isSearching?: boolean`.
- No bloco de empty-state (linhas ~618–623), trocar por:
  - se `isSearching` → renderizar "Carregando…" (com o mesmo estilo de `text-muted-foreground py-8`, e ícone `Loader2` animado se já estiver importado).
  - senão → manter "Nenhum voucher/SPO encontrado".
- Em `EsteiraIndex.tsx`, passar `isSearching={searchLoading}` para `<VoucherTable />`.

A mensagem "Nenhum voucher/SPO encontrado" só aparecerá quando ambas as buscas no backend tiverem efetivamente retornado zero linhas.

## Escopo e não-objetivos

- Não altera ordenação, paginação ou demais filtros.
- Não altera RLS, schema, edge functions além do `mariadb-proxy` nas duas actions citadas.
- Não toca em layouts, cores ou design tokens.

## Validação

1. Digitar um ND parcial (ex: `2026156`) → tabela mostra "Carregando…" durante o debounce/chamada e depois "Nenhum voucher/SPO encontrado" (pois não é o valor completo).
2. Digitar o ND completo (`202615671`) → mostra "Carregando…" e em seguida o voucher correspondente (mesmo que CONCLUIDO/CANCELADO via fast-path).
3. Digitar termo que não existe em nenhuma fonte (`t_vouchers` nem `t_dados_financeiro_voucher`) → "Carregando…" → "Nenhum voucher/SPO encontrado".
