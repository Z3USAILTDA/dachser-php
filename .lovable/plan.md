

## Corrigir mapeamento de campos ao salvar tracking no MariaDB

### Causa raiz

No `DraftDataGrid.tsx` (linhas 209-225), ao salvar dados no `draft-save-tracking`, os nomes dos campos estão errados:

| Campo usado (errado) | Campo real da API (`BookingInfo`) |
|---|---|
| `data.bookingInfo.polName` | `data.bookingInfo.originLocation` |
| `data.bookingInfo.podName` | `data.bookingInfo.destinationLocation` |
| `data.bookingInfo.bookingReference` | `data.bookingInfo.bookingNumber` |
| `data.bookingInfo.voyage` | `data.bookingInfo.voyageNumber` |

Como `polName`, `podName`, `bookingReference` e `voyage` não existem no objeto `bookingInfo`, seus valores são `undefined`, e o `draft-save-tracking` salva string vazia (`''`) no MariaDB. Por isso a tabela `t_consulta_armador` tem esses campos nulos/vazios, enquanto o painel de detalhes (que lê direto da API) mostra os dados corretos.

### Arquivo alterado

**1 arquivo:** `src/components/draft/DraftDataGrid.tsx` — apenas o bloco de save (linhas 212-223)

### Alteração

Corrigir os 4 campos para usar os nomes corretos:

```typescript
trackingData: {
  mbl_id: mblId,
  booking: data.bookingInfo.bookingNumber,           // era bookingReference
  origem: data.bookingInfo.originLocation,            // era polName
  destino: data.bookingInfo.destinationLocation,      // era podName
  navio: data.bookingInfo.vesselName,                 // OK
  voyage: data.bookingInfo.voyageNumber,              // era voyage
  etd: data.bookingInfo.etd,                          // OK
  eta: data.bookingInfo.eta,                          // OK
  status_armador: data.bookingInfo.documentStatus,    // OK
  transaction_id: data.apiMetadata?.transactionId     // OK
}
```

### O que NÃO muda

- Nenhuma edge function
- Nenhum tipo, layout ou outro componente
- A lógica de save no `draft-save-tracking` já está correta — o problema é só nos nomes dos campos enviados

### Após o deploy

Os MBLs precisarão ser re-consultados (botão ↻) para que os dados corretos sejam salvos no MariaDB.

