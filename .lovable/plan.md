
## Filtro de mês na Esteira de Vouchers (filtragem no banco)

### Objetivo
Adicionar um filtro rápido de **Mês/Ano** baseado em `data_emissao`, aplicado **antes** da consulta retornar dados (no SQL do edge function). Ao abrir a tela, o filtro vem preenchido com o mês atual e a primeira busca já traz só esse mês.

### Onde a filtragem acontece (banco, não frontend)
Edge function `supabase/functions/mariadb-proxy/index.ts`, action `get_vouchers_combined` (a única usada no fastMode pela tela). Vamos aceitar dois novos parâmetros opcionais:

- `data_emissao_inicio` (YYYY-MM-DD)
- `data_emissao_fim` (YYYY-MM-DD, exclusivo)

Aplicação no SQL:

**Bloco `combinedAtivos`** (vouchers em `t_vouchers` com JOIN em DFV):
```sql
AND (
  (dfv.data_emissao >= ? AND dfv.data_emissao < ?)
  OR
  (dfv.data_emissao IS NULL
   AND v.data_emissao_documento >= ? AND v.data_emissao_documento < ?)
)
```
Isso cobre vouchers vindos do RM (têm `dfv.data_emissao`) e manuais (que têm `v.data_emissao_documento` antes do enriquecimento).

**Bloco `combinedPendentes`** (DFV ainda não importados):
```sql
AND dfv.data_emissao >= ? AND dfv.data_emissao < ?
```

Funciona corretamente para `DATE`, `DATETIME` e `TIMESTAMP`, pois usa intervalo `>= start AND < endExclusive`.

### Frontend (`src/pages/esteira/EsteiraIndex.tsx`)

1. Novo state:
```ts
const [quickFilterMesEmissao, setQuickFilterMesEmissao] = useState<string>(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});
```
Default = mês atual → garante que a primeira busca já abre filtrada.

2. Helper para converter `YYYY-MM` em `{ inicio, fimExclusivo }`:
```ts
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const inicio = `${y}-${String(m).padStart(2,'0')}-01`;
  const next = m === 12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,'0')}-01`;
  return { inicio, fimExclusivo: next };
};
```

3. `loadVouchers` passa o range no body da invoke:
```ts
const { inicio, fimExclusivo } = monthRange(quickFilterMesEmissao);
supabase.functions.invoke("mariadb-proxy", {
  body: {
    action: "get_vouchers_combined",
    data_emissao_inicio: inicio,
    data_emissao_fim: fimExclusivo,
  }
});
```

4. `useEffect` que dispara `loadVouchers()` quando `quickFilterMesEmissao` muda (re-consulta o banco a cada troca).

5. **UI**: novo seletor na linha de "Filtros Rápidos" (logo após Cobrança), no mesmo padrão visual dos outros (`rounded-full`, ícone `Calendar`):
   - `<input type="month" value={quickFilterMesEmissao} onChange={...}>` estilizado igual aos demais selects.
   - Lista também ano/mês anteriores se preferirem `Select` — mas `input type="month"` é o mais simples, estável e nativo.

6. Incluir `quickFilterMesEmissao` no botão "Limpar Filtros" para resetar ao **mês atual** (não vazio — a regra obriga sempre ter um mês selecionado).

### Garantias
- A primeira renderização já dispara `loadVouchers` com o mês atual (o estado já nasce preenchido).
- Trocar de mês refaz a query no banco — não há pós-filtro frontend para essa lógica.
- Paginação, ordenação, demais filtros, layout, detalhes do voucher e tabs permanecem intactos.
- Vouchers manuais sem DFV ainda aparecem via fallback em `v.data_emissao_documento`.

### Arquivos alterados
1. `supabase/functions/mariadb-proxy/index.ts` — action `get_vouchers_combined` recebe e aplica os params de range em ambos os SELECTs.
2. `src/pages/esteira/EsteiraIndex.tsx` — novo state, helper, UI do filtro, dependência no `useEffect` de carregamento e reset.

Nada além disso será tocado.
