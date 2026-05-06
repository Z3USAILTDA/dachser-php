## Ajustes na Esteira do Voucher

Mudanças cirúrgicas em 6 pontos, sem refactor de estrutura.

### 1. Relatório — Etapa "Operação" inclui também `A_PROCESSAR`

**Arquivo:** `supabase/functions/mariadb-proxy/index.ts`, case `export_vouchers_report`.

Substituir o filtro:
```ts
if (etapa && etapa !== 'all') {
  whereConditions.push('v.etapa_atual = ?');
  params.push(etapa);
}
```
por:
```ts
if (etapa && etapa !== 'all') {
  if (etapa === 'OPERACAO') {
    whereConditions.push("v.etapa_atual IN ('OPERACAO','A_PROCESSAR')");
  } else {
    whereConditions.push('v.etapa_atual = ?');
    params.push(etapa);
  }
}
```
Mesmo critério já usado no grid principal (`EsteiraIndex.tsx` linha 1334-1336).

### 2. Relatório — coluna "Criado por" usa `created_by`

**Arquivos:**
- `supabase/functions/mariadb-proxy/index.ts` (case `export_vouchers_report`): incluir LEFT JOIN com `t_dados_financeiro_voucher` agregado por `nd` igual ao do `get_vouchers_esteira`, retornando `dfv_created_by`.
- `src/pages/esteira/EsteiraReports.tsx` (linha 102-103): mapear `criadoPorUserName: v.dfv_created_by || v.criado_por_username` para que o exporter use o `created_by` real do RM/DFV em vez do user_id.

A montagem do JOIN e do `dfv_created_by` segue a mesma lógica já existente em `get_vouchers_esteira` (linhas ~7095-7106).

### 3. Filtro "Etapa Atual" multi-seleção (tela Processos)

**Arquivos:**
- `src/components/esteira/VoucherFilters.tsx` e `src/components/esteira/VoucherTable.tsx` (linha 443-460): trocar o `<Select>` simples por um Popover com checkboxes (padrão shadcn) — multi-seleção.
- `src/pages/esteira/EsteiraIndex.tsx`:
  - Trocar `etapa: "all"` por `etapa: [] as string[]` no estado `filters`.
  - Atualizar a aplicação do filtro (linhas 1233 e 1328-1339) para considerar array vazio = todas; senão verificar `etapas.includes(vEtapa)` mantendo as expansões `OPERACAO → +A_PROCESSAR` e `FINANCEIRO → +ROBO`.
  - Atualizar todas as referências a `filters.etapa !== "all"` (limpar filtros, badges).

Nenhuma mudança em backend.

### 4. Filtro por data (calendário) na tela Pagamentos

**Arquivo:** `src/components/esteira/PagamentosTab.tsx`.

- Adicionar dois estados: `filterDataInicio?: Date`, `filterDataFim?: Date`.
- Adicionar dois `Popover + Calendar` (padrão shadcn datepicker, com `pointer-events-auto`) ao lado dos filtros existentes (área ~linhas 716+).
- Aplicar localmente no `useMemo` de `filteredPagamentos` filtrando por `pag.vencimento` (parseado com `parseDBDate`) entre as datas escolhidas.
- Resetar paginação ao alterar (já existe `useEffect` de reset).

Sem chamada nova ao backend; o filtro é client-side sobre os pagamentos já carregados.

### 5. Retorno em lote na tela Pagamentos não funciona silenciosamente

**Arquivo:** `src/components/esteira/PagamentosTab.tsx`, função `handleVoltarOperacional` (linhas 535-625).

Diagnóstico: o loop `for...of` chama `update_voucher_esteira`. Se `voltarDestinoEtapa` ainda estiver com o valor inicial e o usuário não tiver clicado para escolher, ou se a justificativa não for validada, ele simplesmente retorna em silêncio. Além disso, em modo lote, o disparo na linha 1027-1034 define `setVoltarDestinoEtapa("OPERACAO")`, mas o select de destino dentro do dialog pode resetar.

Correções:
- Garantir que o dialog em modo lote exibe o seletor de destino (Operação/Fiscal) e que o estado é mantido.
- Adicionar toast de erro quando nenhum target é processado (`if (targets.length === 0) { toast({ title: 'Selecione ao menos um voucher', variant: 'destructive' }); return; }`).
- Adicionar `await Promise.all` ou manter o loop, mas mostrar toast de erro detalhado por falha (atualmente só faz `console.error`).
- Verificar se o `voucher_id` no payload é o id real (lote pode estar enviando `pag.id` que pode ser sintético `rm_pending_*`); se for, pular com aviso ao usuário.

### 6. Colunas vazias no grid Processos: processo / fornecedor / valor total / enviado por

**Diagnóstico em `supabase/functions/mariadb-proxy/index.ts` (case `get_vouchers_esteira`, linhas 7090-7125):**

- A subquery `dfv` agrega `MIN(numero_processo) as numero_processo`, mas o SELECT externo **não traz** essa coluna. Por isso `processoId` chega vazio quando `v.processo_id` é null.
- O SELECT externo é `v.*` — que **não inclui** `criado_por_user_name` (a tabela `t_vouchers` só tem `criado_por_user_id`). Por isso `criadoPorUserName` no front fica undefined e o fallback de "enviado por" não funciona quando não há log.
- `fornecedor` e `valor` vêm direto de `v.fornecedor` e `v.valor`. Para vouchers Master ou recém-vindos do RM, esses campos podem estar nulos no `t_vouchers` mas presentes em `t_dados_financeiro_voucher` / `t_dados_rm`.

Correções:
- Adicionar ao SELECT do `get_vouchers_esteira`: `dfv.numero_processo as dfv_numero_processo`, `(SELECT username FROM ai_agente.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS criado_por_user_name`.
- Incluir na subquery `dfv` também `MAX(razao_social) as fornecedor_dfv` e `MAX(valor_nf) as valor_dfv`.
- No SELECT externo expor `dfv.fornecedor_dfv`, `dfv.valor_dfv`.
- Em `mapVoucherFromDB` (`EsteiraIndex.tsx` linhas 736-790), aplicar fallbacks:
  - `fornecedor: v.fornecedor || v.fornecedor_dfv`
  - `valor: v.valor ? parseFloat(v.valor) : (v.valor_dfv ? parseFloat(v.valor_dfv) : null)`
  - `processoId: v.processo_id || v.dfv_numero_processo || null`

Nenhuma alteração de schema.

### Memória

Atualizar `mem://vouchers/data-consistency-and-filtering` para refletir:
- "Operação" no relatório engloba `OPERACAO + A_PROCESSAR`
- Filtro de etapa no grid principal aceita multi-seleção
- Fallbacks para fornecedor/valor/processo/criado_por usam `t_dados_financeiro_voucher` quando `t_vouchers` está vazio.