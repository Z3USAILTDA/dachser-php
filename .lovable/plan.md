

# Filtrar DLV e aplicar retencao de 5 dias para ARR - DESTINO

## Problema

Atualmente, a edge function `fetch-status-aereo` retorna **todos** os AWBs sem filtrar por status final. Isso causa:

1. AWBs com status **DLV** (entregues) continuam aparecendo na lista de tracking
2. AWBs com status **ARR - DESTINO** nao somem apos 5 dias

## Solucao

Aplicar dois filtros no backend (`supabase/functions/fetch-status-aereo/index.ts`) apos o processamento (PASSO 3), antes de retornar os dados:

1. **Remover DLV**: Excluir todos os registros cujo `finalStatus` seja `DLV` ou `DELIVERED`
2. **Retencao ARR - DESTINO por 5 dias**: Para registros com status `ARR - DESTINO`, manter visivel apenas se a `ultima atualizacao` (scraped_at) for dos ultimos 5 dias. Apos 5 dias, o registro e removido da resposta.

## Detalhes Tecnicos

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

Apos a construcao do array `processedRows` (linha ~650), adicionar um filtro antes de retornar:

```typescript
// Filtrar: remover DLV e ARR-DESTINO com mais de 5 dias
const now = Date.now();
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const visibleRows = processedRows.filter((row: any) => {
  const status = (row['último_status'] || '').toUpperCase().trim();

  // 1. Nunca mostrar DLV
  if (status === 'DLV' || status === 'DELIVERED') return false;

  // 2. ARR - DESTINO: manter por 5 dias
  if (status === 'ARR - DESTINO') {
    const updatedAt = row['última atualização'];
    if (!updatedAt) return true; // sem data, manter por seguranca
    const updatedTime = new Date(updatedAt).getTime();
    if (isNaN(updatedTime)) return true;
    return (now - updatedTime) <= FIVE_DAYS_MS;
  }

  return true;
});
```

Alterar o `return` final para usar `visibleRows` em vez de `processedRows`.

Apos a mudanca, redeploy da edge function `fetch-status-aereo`.

