

## Corrigir roteamento de tracking para MSC e ONE no grid

### Causa raiz

No `DraftDataGrid.tsx` (linha 179), a função `trackSingleMBL` sempre chama `draft-track-hapag-multi`, independente do armador. MBLs da MSC (prefixo MEDU/MSC) e ONE (prefixo ONEY) precisam ser roteados para `draft-track-msc` e `draft-track-one` respectivamente.

O `HapagTrackerPanel.tsx` já faz esse roteamento corretamente via `detectCarrier` + `getEdgeFunctionName`, mas o grid ignora isso.

### Arquivo alterado

**1 arquivo:** `src/components/draft/DraftDataGrid.tsx`

### Alteração

Na função `trackSingleMBL` (linha 176), adicionar detecção do armador e roteamento para a edge function correta:

```typescript
const trackSingleMBL = async (mblId: string) => {
  setProcessingMBL(mblId);
  try {
    // Detectar armador e rotear para a edge function correta
    const carrier = detectCarrier(mblId);
    let fnName = 'draft-track-hapag-multi';
    if (carrier.name === 'MSC') fnName = 'draft-track-msc';
    else if (carrier.name === 'ONE') fnName = 'draft-track-one';

    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { searchType: 'BL', searchValue: mblId }
    });
    // ... resto da lógica permanece igual
```

A função `detectCarrier` já existe no mesmo arquivo (linha 68) e identifica corretamente MSC (MEDU/MSC/EBKG) e ONE (ONEY).

### O que NÃO muda

- Nenhuma edge function
- Nenhum outro componente ou hook
- A lógica de save (`draft-save-tracking`) permanece igual
- O `HapagTrackerPanel` (consulta manual) já funciona corretamente

