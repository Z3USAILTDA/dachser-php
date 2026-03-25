

## Correção dos 5 Filtros Quebrados na Esteira

Analisei todo o fluxo de dados: `get_vouchers_ativos` (backend) → `mapVoucherFromDB` → `roleFilteredVouchers` → `sortedVouchers` → `filterVouchers` → `VoucherTable`.

---

### Bug Confirmado: Filtro SLA (Tempo na Etapa)

**Causa raiz encontrada no código:**

Em `filterVouchers` (linha ~1297) e `getSlaStatus` (VoucherTable linha ~116):
```typescript
const sla = SLA_POR_ETAPA[voucher.etapaAtual] || 24;
```

O operador `|| 24` transforma SLA=0 em SLA=24. Etapas como CONCLUIDO, A_PROCESSAR, RASCUNHO e CANCELADO têm SLA definido como `0` (sem controle de SLA), mas o `|| 24` as trata como se tivessem SLA de 24h. Resultado: vouchers CONCLUIDO/CANCELADO aparecem como "atenção" ou "crítico" quando na verdade deveriam ser "ok".

**Correção:** Substituir `|| 24` por verificação adequada de `undefined`:
```typescript
const slaVal = SLA_POR_ETAPA[voucher.etapaAtual as keyof typeof SLA_POR_ETAPA];
const sla = slaVal !== undefined && slaVal !== null ? slaVal : 24;
if (sla === 0) { /* always "ok", skip comparison */ }
```

Aplicar em **ambos** os locais: `filterVouchers` no EsteiraIndex e `getSlaStatus` no VoucherTable.

---

### Bug Provável: drillDownFilter Interferindo nos Filtros

O `drillDownFilter` (cards métricos "Em Andamento", "SLA", etc.) filtra vouchers ANTES dos filtros da tabela. Se o usuário clicou em um card e depois tenta usar os filtros inline, os resultados ficam silenciosamente reduzidos. Embora exista um indicador visual, pode não ser percebido.

**Correção:** Ao alterar qualquer filtro na tabela, resetar `drillDownFilter` para `"all"`:
```typescript
// Em EsteiraIndex, ao receber onFilterChange da VoucherTable:
const handleFilterChange = (newFilters: FilterValues) => {
  setFilters(newFilters);
  setDrillDownFilter("all"); // Reset drill-down when table filters change
};
```

---

### Filtro de Data (Vencimento)

O filtro cria `Date` objects com `new Date(year, month, day, 0, 0, 0)` (meia-noite local). O `voucher.vencimento` vem de `parseDBDate` que pode retornar horários não-meia-noite dependendo do formato do banco. Comparações `<` e `>` podem falhar por diferença de horas.

**Correção:** Normalizar ambos os lados para comparação date-only:
```typescript
const vencDate = new Date(voucher.vencimento.getFullYear(), voucher.vencimento.getMonth(), voucher.vencimento.getDate());
// Comparar vencDate com inicio/fimDoDia
```

---

### Filtros de Urgência, Etapa, Comprovante

A lógica do código está correta sintaticamente. A causa mais provável dos erros é a interferência do `drillDownFilter` descrita acima, combinada com possíveis diferenças de case/trim nos valores do banco.

**Correção defensiva:** Adicionar normalização em todas as comparações de string:
```typescript
// Urgência
if (filters.urgente !== "all" && (voucher.urgenciaTipo || "NORMAL").trim() !== filters.urgente) return false;

// Etapa  
if (filters.etapa !== "all" && (voucher.etapaAtual || "").trim() !== filters.etapa) return false;

// Comprovante
if (filters.statusComprovante !== "all") {
  const status = (voucher.statusComprovante || "PENDENTE").trim();
  if (status !== filters.statusComprovante) return false;
}
```

---

### Arquivos a editar

1. **`src/pages/esteira/EsteiraIndex.tsx`**:
   - `filterVouchers`: corrigir SLA `|| 24`, normalizar datas, adicionar `.trim()` nas comparações
   - Handler de `setFilters`: resetar `drillDownFilter` ao mudar filtros da tabela

2. **`src/components/esteira/VoucherTable.tsx`**:
   - `getSlaStatus`: corrigir `|| 24` com verificação de `sla === 0`

Nenhuma alteração de backend, banco ou RLS.

