

## Corrigir correspondência de tarifa por medida do container

### Causa raiz

Na edge function `demurrage-send-alert/index.ts`, linha 472, o `containerType` é preenchido com `c.size` que vem de `tipo_conteiner` (ex: "20DV", "40HC", "40DV"). Porém, a tabela `t_dachser_demurrage_rates` usa o campo `container_type` com formato "DRY 20", "RF 40", "IMO 40", "NOR 20", "SPECIAL 40".

A comparação `r.container_type?.toLowerCase() === containerType?.toLowerCase()` nunca bate ("dry 20" !== "20dv"), fazendo o cálculo cair no fallback genérico.

### Solução

**Arquivo:** `supabase/functions/demurrage-send-alert/index.ts`

Extrair apenas o tamanho (20 ou 40) do `tipo_conteiner` do container, e comparar com o tamanho contido no `container_type` da tarifa. Ambos os formatos contêm "20" ou "40" como parte da string.

Alterar `calculatePeriods` (linha 168) para usar matching por tamanho:

```typescript
function calculatePeriods(daysIncident: number, armador: string, containerType: string, allRates: RateRow[]): PeriodData[] {
  // Extract size (20 or 40) from container tipo_conteiner (e.g. "20DV" -> "20", "40HC" -> "40")
  const sizeMatch = containerType.match(/(\d{2})/);
  const containerSize = sizeMatch ? sizeMatch[1] : '';

  // Match DACHSER rates where container_type ends with the same size (e.g. "DRY 20" ends with "20")
  const matchingRates = allRates.filter(r =>
    r.armador?.toLowerCase() === 'dachser' &&
    r.container_type?.includes(containerSize)
  );

  if (matchingRates.length === 0 || daysIncident <= 0) return [];
  // ... resto permanece igual
}
```

Também atualizar o hook `useSendTestAlert` (linha 760 em `useDemurrageData.ts`) para enviar `size` com o valor correto da medida do container:

```typescript
// Quando items existem (linha 760):
size: match?.tipo_conteiner || item.container_type || '',
```

### Lógica de matching detalhada

Dado que as tarifas DACHSER têm tipos como "DRY 20", "DRY 40", "RF 20", etc., e o container tem `tipo_conteiner` como "20DV", "40HC":

1. Extrair "20" ou "40" do `tipo_conteiner`
2. Filtrar as tarifas DACHSER que contenham esse tamanho no `container_type`
3. Se houver múltiplas correspondências (ex: "DRY 20" e "RF 20" para um container "20"), usar a primeira encontrada (já ordenadas por `period_start_day`)

**Nota**: Se o container tiver informação mais específica de tipo (RF, DRY, IMO), ela deveria ser usada. Porém, como `tipo_conteiner` usa formato "20DV"/"40HC" sem correspondência direta com "DRY"/"RF"/"IMO", o matching por tamanho é o mais confiável com os dados atuais.

### Arquivos alterados

1. **`supabase/functions/demurrage-send-alert/index.ts`** — `calculatePeriods`: matching por tamanho extraído
2. Nenhum outro arquivo precisa mudar

