

## Corrigir erro 400: documentNumber maior que 20 caracteres

### Causa raiz

O campo `mbl_id` na tabela `t_consulta_armador` contém valores compostos como `"HLCUSS5251240550 - 20122846"` (BL + booking separados por ` - `). Quando o grid envia esse valor para a API Hapag, ela rejeita porque o campo `documentNumber` aceita no maximo 20 caracteres.

### Arquivo alterado

**1 arquivo:** `src/components/draft/DraftDataGrid.tsx`

### Alteração

Na função `trackSingleMBL` (linha 186), limpar o `mblId` antes de enviar para a API. Extrair apenas a primeira parte (antes do ` - `) e truncar a 20 caracteres:

```typescript
const trackSingleMBL = async (mblId: string) => {
    setProcessingMBL(mblId);
    try {
      // Limpar o MBL: pegar apenas a primeira parte antes de " - " e limitar a 20 chars
      const cleanMbl = mblId.split(' - ')[0].trim().substring(0, 20);
      
      const carrier = detectCarrier(cleanMbl);
      let fnName = 'draft-track-hapag-multi';
      if (carrier.name === 'MSC') fnName = 'draft-track-msc';
      else if (carrier.name === 'ONE') fnName = 'draft-track-one';

      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { searchType: 'BL', searchValue: cleanMbl }
      });
      // ... resto permanece igual
```

### O que NÃO muda

- Nenhuma edge function
- O `mblId` original continua sendo usado para `setProcessingMBL` e para salvar no banco
- Apenas o valor enviado para a API do armador e limpo

