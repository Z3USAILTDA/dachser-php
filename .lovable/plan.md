

## Corrigir XLSX vazio — containers não chegam à edge function

### Causa raiz

O log da edge function confirma: `containers: 0`.

Na página `DemurragePreInvoicing.tsx` (linha 616), os containers são filtrados assim:
```
allContainers.filter(c => emailInvoice?.shipment_mbl && c.mbl === emailInvoice.shipment_mbl)
```

`allContainers` vem de `useDemurrageData()` sem filtros — que é a listagem geral do monitor. Se o MBL da pré-fatura não bater exatamente (case, espaços, ou simplesmente o container não estar nessa tabela geral), o array fica vazio. E como `items` (pre_invoice_items) também pode estar vazio, o resultado é zero containers enviados à edge function.

### Solução

**Arquivo 1: `src/components/demurrage/SendTestEmailDialog.tsx`**

Usar `useDemurrageContainersByMbl` dentro do próprio dialog para buscar containers dedicados pelo MBL da pré-fatura, em vez de depender do prop `containers` que vem filtrado da listagem geral.

- Adicionar `useDemurrageContainersByMbl(preInvoice?.shipment_mbl, preInvoice?.invoice_number)` dentro do componente
- Usar os containers retornados por esse hook como `demurrageContainers` na chamada do `sendMutation`
- Manter o prop `containers` como fallback caso o hook retorne vazio

**Arquivo 2: `src/pages/demurrage/DemurragePreInvoicing.tsx`**

Simplificar — não precisa mais passar `containers` filtrado, pois o dialog busca seus próprios dados. O prop pode ser removido ou mantido como fallback.

### Resultado esperado

O dialog sempre terá containers disponíveis para montar o XLSX, independentemente do estado da listagem geral do monitor.

