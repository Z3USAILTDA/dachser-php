
# Plano de Correção: Identificação do Local das Informações CHB

## Problema Identificado

A identificação automática do local correto das informações **não está funcionando** porque o frontend não está enviando o conteúdo do documento (`file_content`) quando o usuário salva uma correção.

### Diagnóstico Técnico

| Componente | Problema |
|------------|----------|
| `ChbComparisonGrid.tsx` linha 331-337 | Chama `saveCorrection` **SEM** o parâmetro `file_content` |
| `ChbAnalysisPanel.tsx` linha 162-166 | Passa apenas `htmlContent` e `itemId` para o Grid |
| `ConferenciaChb.tsx` | Tem acesso aos documentos (`documents`) com URLs, mas não passa para o Grid |
| `chb-corrections` Edge Function | Localização só ocorre SE `file_content` estiver presente (linha 235) |

### Fluxo Atual (Quebrado)

```text
Usuario edita celula no Grid
        |
        v
handleSaveCorrection() SEM file_content
        |
        v
Edge Function recebe body.file_content = undefined
        |
        v
locationResult = { found: false, location: "Localização manual não realizada" }
```

## Solução Proposta

### Fase 1: Passar Documentos do ConferenciaChb para o Grid

O componente `ConferenciaChb.tsx` já tem acesso à lista de documentos com suas URLs (`documents[stepId]`). Precisamos passar essa informação através da cadeia de componentes:

**Mudanças:**

1. **`ConferenciaChb.tsx`**: Passar `documents` para `ChbAnalysisPanel`
2. **`ChbAnalysisPanel.tsx`**: Receber e repassar `documents` para `ChbComparisonGrid`
3. **`ChbComparisonGrid.tsx`**: Receber `documents`, buscar conteúdo do arquivo correspondente ao salvar correção

### Fase 2: Buscar Conteúdo do Arquivo ao Salvar Correção

Quando o usuário editar uma célula:
1. Identificar qual documento está sendo corrigido pelo `filename`
2. Buscar a URL do documento na lista de `documents`
3. Fazer fetch do conteúdo do arquivo e converter para texto/base64
4. Passar `file_content` para a Edge Function

### Fase 3: Alternativa Backend (Se Fase 1 For Muito Complexa)

Se buscar o conteúdo no frontend causar lentidão, podemos fazer a busca na própria Edge Function:
1. A Edge Function `chb-corrections` recebe apenas o `item_id` e `filename`
2. Ela consulta o MariaDB para obter a URL do arquivo
3. Faz o fetch do conteúdo diretamente no servidor
4. Usa o conteúdo para localização

**Esta alternativa é mais robusta** pois não depende do frontend ter acesso ao arquivo.

---

## Detalhamento Técnico

### Alteração 1: `ConferenciaChb.tsx`

Passar a lista de documentos para o panel de análise:

```typescript
// Linha ~900 (dentro do render do ChbAnalysisPanel)
<ChbAnalysisPanel 
  stepId={activeStep}
  analysisResult={analysisResults[activeStep]}
  onRunAnalysis={handleRunAnalysis}
  onApproveAndAdvance={handleApproveAndAdvance}
  isAnalyzing={isAnalyzing}
  hasFiles={hasFilesForStep}
  isStepCompleted={isCurrentStepCompleted}
  isLastStepCompleted={isFinalStepCompleted}
  analysisProgress={analysisProgress}
  reference={reference}
  itemId={itemId}
  documents={documents}  // NOVA PROP
/>
```

### Alteração 2: `ChbAnalysisPanel.tsx`

Receber e repassar documentos:

```typescript
// Interface (linha 8-20)
interface ChbAnalysisPanelProps {
  // ... props existentes
  documents?: Record<number, ChbDocument[]>;  // NOVA PROP
}

// Render do Grid (linha 162-167)
<ChbComparisonGrid 
  htmlContent={analysisResult.html} 
  itemId={itemId} 
  editable={!isStepCompleted}
  documents={documents?.[stepId] || []}  // NOVA PROP
/>
```

### Alteração 3: `ChbComparisonGrid.tsx`

Receber documentos e buscar conteúdo ao salvar:

```typescript
// Interface (linha 19-24)
interface ChbComparisonGridProps {
  htmlContent: string;
  itemId?: number;
  editable?: boolean;
  onCorrectionSaved?: () => void;
  documents?: ChbDocument[];  // NOVA PROP
}

// Função helper para buscar conteúdo
async function fetchDocumentContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
  } catch {
    return null;
  }
}

// handleSaveCorrection (linhas 323-344)
const handleSaveCorrection = useCallback(async (
  filename: string,
  fieldName: string,
  originalValue: string,
  newValue: string
): Promise<boolean> => {
  if (!itemId) return false;

  // NOVO: Buscar conteúdo do documento
  let fileContent: string | undefined;
  const doc = documents?.find(d => d.name === filename);
  if (doc?.url) {
    fileContent = await fetchDocumentContent(doc.url) || undefined;
  }

  const result = await saveCorrection({
    item_id: itemId,
    filename,
    field_name: normalizeFieldName(fieldName),
    original_value: originalValue,
    corrected_value: newValue,
    file_content: fileContent,  // NOVO
  });

  if (result.success) {
    onCorrectionSaved?.();
  }

  return result.success;
}, [itemId, saveCorrection, onCorrectionSaved, documents]);
```

---

## Solução Alternativa (Backend-Only)

Se preferir não modificar o frontend extensivamente, a Edge Function pode buscar o documento diretamente:

### Alteração em `chb-corrections/index.ts`

```typescript
// Após linha 214, adicionar busca automática do documento
if (!file_content && item_id && filename) {
  // Buscar URL do documento no MariaDB
  const docRows = await client.query(
    `SELECT f.url as file_url
     FROM ai_agente.t_dachser_chb_docs d
     JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
     WHERE d.item_id = ? AND f.filename = ?
     LIMIT 1`,
    [item_id, filename]
  );
  
  if (docRows && docRows.length > 0 && docRows[0].file_url) {
    try {
      const response = await fetch(docRows[0].file_url);
      if (response.ok) {
        file_content = await response.text();
      }
    } catch (e) {
      console.log('[chb-corrections] Could not fetch file content:', e);
    }
  }
}
```

---

## Recomendação

**Implementar a Solução Alternativa (Backend-Only)** porque:

1. Menor número de arquivos modificados (apenas 1 Edge Function)
2. Funciona mesmo que o frontend não tenha acesso direto ao arquivo
3. Mais robusto para documentos grandes
4. Não impacta performance do frontend

---

## Ordem de Implementação

1. **Primeiro**: Atualizar `chb-corrections/index.ts` para buscar documento automaticamente
2. **Segundo**: Deploy da Edge Function
3. **Terceiro**: Testar salvando uma correção e verificar logs de localização

## Testes de Validação

Após implementação:
1. Abrir um item CHB existente (ex: item 82)
2. Ir para a aba de Análise com dados já analisados
3. Editar um valor em uma célula (ex: alterar peso)
4. Verificar logs da Edge Function por `[chb-corrections] Locating value`
5. Confirmar toast mostrando localização encontrada

