## Adicionar "Pré-Lançamento" ao filtro de etapa

**`src/components/esteira/VoucherTable.tsx`** (filtro multi-select da coluna Etapa, ~linha 446)
- Adicionar `{ value: "PRE_LANCAMENTO", label: "Pré-Lançamento" }` em `ETAPA_OPTIONS`, logo após `OPERACAO` (mantendo a ordem do pipeline).
- Adicionar a cor do badge em `ETAPA_COLORS` (~linha 83): `PRE_LANCAMENTO: "bg-amber-500/10 text-amber-400 border-amber-500/20"`.

**`src/components/esteira/VoucherFilters.tsx`** (Select de Etapa)
- Adicionar `<SelectItem value="PRE_LANCAMENTO">Pré-Lançamento</SelectItem>` após Rascunho.

**`src/pages/esteira/EsteiraIndex.tsx`** (filtro por role)
- Não restringir `PRE_LANCAMENTO` por role: quando o usuário escolher essa etapa no filtro, todos podem ver. Adicionar `etapasPermitidas.add("PRE_LANCAMENTO")` para todos os roles relevantes (Operação, Fiscal, Supervisor) para garantir que o filtro funcione.

### Fora de escopo
- Lógica de backend (já entregue na rodada anterior).
- Outros filtros/dashboards.
