

## Plano: Garantir que containers apareçam para todas as pré-faturas

### Problema raiz
A query `demurrage_get_containers` retorna no maximo 500 containers ordenados por `updated_at DESC`. Quando o usuario abre uma pre-fatura mais antiga, os containers daquele MBL podem nao estar entre os 500 carregados, resultando em lista vazia.

O filtro atual: `allContainers.filter(c => c.mbl === selectedInvoice.shipment_mbl)` so funciona se os containers ja estiverem na memoria.

### Solucao
Criar uma nova action `demurrage_get_containers_by_mbl` no mariadb-proxy que busca containers especificamente por MBL, sem limite de 500 e sem filtro `active = 1` (containers devolvidos podem ter `active = 0`). Usar essa action no dialog de detalhes.

### Alteracoes

**1. `supabase/functions/mariadb-proxy/index.ts`**
- Adicionar novo case `demurrage_get_containers_by_mbl` que recebe `mbl: string` e faz query:
  ```sql
  SELECT dc.* FROM t_dachser_demurrage_containers dc WHERE dc.mbl = ?
  ```
- Enriquecer com `partner_id` e `hbl` (mesma logica do `demurrage_get_containers`)

**2. `src/hooks/useDemurrageData.ts`**
- Criar hook `useDemurrageContainersByMbl(mbl: string | null)` que chama a nova action
- Retorna `DemurrageContainer[]` com react-query, habilitado apenas quando `mbl` nao e null

**3. `src/components/demurrage/PreInvoiceDetailsDialog.tsx`**
- Remover prop `containers` recebida externamente
- Usar o novo hook `useDemurrageContainersByMbl(preInvoice?.shipment_mbl)` para buscar containers diretamente quando o dialog abre
- Mostrar loading state enquanto busca

**4. `src/pages/demurrage/DemurragePreInvoicing.tsx`**
- Remover a prop `containers` do `PreInvoiceDetailsDialog` (nao e mais necessaria)

### Resultado
Cada pre-fatura buscara seus containers diretamente pelo MBL ao abrir o dialog, independente dos 500 containers carregados na pagina principal.

