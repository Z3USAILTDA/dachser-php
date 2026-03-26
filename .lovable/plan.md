

## Ocultar processos com status DLV (exceto quando pesquisados)

### Arquivo: `src/pages/air/TrackingAereo.tsx`

**Mudança única** no `filteredAwbs` (linhas 440-450): adicionar uma condição que exclui AWBs com status `DLV` quando **não há termo de busca ativo**.

```typescript
// Dentro do filtro principal (linha 440-450), adicionar:
const code = getStatusCode(awb.last_event).toUpperCase();
const isDLV = code === "DLV" || code === "POD";
// Se é DLV e não tem busca ativa, ocultar
if (isDLV && !searchTerm) return false;
```

Também atualizar o `cardCounts` (que calcula os números dos cards) para não contar DLV no total, mantendo consistência entre cards e tabela.

Nenhum outro arquivo será alterado.

