## Objetivo

Permitir que **qualquer role** (FISCAL, SUPERVISOR, OPERACAO, etc.) consiga ver **todos os processos** — incluindo os cards virtuais `A_PROCESSAR` vindos do RM — quando escolher "Todas Etapas" no filtro, sem perder a visão padrão restrita ao seu role ao abrir a tela.

## Contexto rápido

- `A_PROCESSAR` é uma etapa **virtual**: vem de `t_dados_financeiro_voucher` (RM pendente) e é injetada no client em `loadVouchers` (`EsteiraIndex.tsx` ~linha 1048). Só vira linha real em `t_vouchers` quando OPERACAO importa.
- Hoje, em `roleFilteredVouchers` (linhas 1230-1255 de `EsteiraIndex.tsx`), o bypass está em `if (filters.etapa && filters.etapa !== "all") return vouchers;` — ou seja, **só** desliga a restrição de role quando o usuário escolhe uma etapa específica. "Todas Etapas" (`"all"`) **mantém** a restrição. Resultado: FISCAL/SUPERVISOR puros ficam presos a `FISCAL`/`AJUSTE_FISCAL`/`SUPERVISOR` e nunca enxergam `A_PROCESSAR` nem o resto do pipeline.

## Mudança proposta (cirúrgica)

**Arquivo único:** `src/pages/esteira/EsteiraIndex.tsx`

1. Adicionar um estado local que rastreia se o usuário **interagiu** com o select de etapa:
   ```ts
   const [etapaFilterTouched, setEtapaFilterTouched] = useState(false);
   ```

2. Em `roleFilteredVouchers` (linha 1231), trocar:
   ```ts
   if (filters.etapa && filters.etapa !== "all") return vouchers;
   ```
   por:
   ```ts
   // Qualquer interação manual com o filtro de etapa (incluindo "Todas Etapas")
   // desliga a restrição de role e mostra o pipeline completo, inclusive A_PROCESSAR.
   if (etapaFilterTouched) return vouchers;
   ```
   E adicionar `etapaFilterTouched` ao array de dependências do `useMemo`.

3. No callback `onFilterChange` passado ao `<VoucherTable>` (linha ~2176), interceptar mudanças em `etapa` para marcar `etapaFilterTouched`:
   ```ts
   onFilterChange={(newFilters) => {
     if (newFilters.etapa !== filters.etapa) setEtapaFilterTouched(true);
     setFilters(newFilters);
     setDrillDownFilter("all");
   }}
   ```

4. No botão "Limpar filtros" (linha ~2137), resetar também:
   ```ts
   setEtapaFilterTouched(false);
   ```

## Comportamento resultante

| Ação do usuário | FISCAL puro vê | SUPERVISOR puro vê | OPERACAO puro vê |
|---|---|---|---|
| Abre a tela (sem mexer em filtro) | só `FISCAL`+`AJUSTE_FISCAL` (igual hoje) | só `SUPERVISOR` (igual hoje) | `OPERACAO`+`A_PROCESSAR` (igual hoje) |
| Seleciona **"Todas Etapas"** | **pipeline completo, inclusive os 12 `A_PROCESSAR`** ✅ | **pipeline completo, inclusive `A_PROCESSAR`** ✅ | **pipeline completo** ✅ |
| Seleciona uma etapa específica | só aquela etapa (igual hoje) | só aquela etapa (igual hoje) | só aquela etapa (igual hoje) |
| Clica "Limpar filtros" | volta à visão restrita do role | volta à visão restrita do role | volta à visão restrita do role |

ADMIN / GESTOR / FINANCEIRO permanecem inalterados (já viam tudo).

## Observação importante

Os `A_PROCESSAR` continuam sendo **read-only** para FISCAL/SUPERVISOR (são cards virtuais; só OPERACAO pode importar/editar). A mudança é apenas de **visibilidade**, não de permissão de ação — as regras `canEdit`, `canDelete`, etc. já existentes seguem intactas.

## Memória

Atualizar `mem://vouchers/ui-spec-and-access-v4`:

> Quando qualquer role interage com o filtro de Etapa (inclusive selecionando "Todas Etapas"), a restrição de visibilidade por role é desligada e o usuário passa a ver o pipeline completo, incluindo os cards virtuais `A_PROCESSAR` vindos do RM. Sem interação, mantém a visão restrita do seu role. "Limpar filtros" restaura a visão restrita. Permissões de ação (editar/deletar/aprovar) **não** mudam — apenas visibilidade.
