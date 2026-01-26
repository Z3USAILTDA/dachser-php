

# Plano: Processar Correções Pendentes e Corrigir Sistema de Aprendizado

## Problema Identificado

O sistema de "Parallel Learning" foi implementado, mas:
1. **A tabela `t_dachser_chb_extraction_rules` não existe** no MariaDB
2. As 6 correções do usuário estão todas com `location_confidence = 'baixa'`
3. A re-extração paralela está falhando (provavelmente porque tenta salvar na tabela inexistente)

## Correções do Usuário Pendentes

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CORREÇÕES A SEREM PROCESSADAS                                              │
├──────────────────────┬──────────────────┬──────────────────────────────────┤
│ Campo                │ Documento        │ Valor Corrigido                  │
├──────────────────────┼──────────────────┼──────────────────────────────────┤
│ incoterm             │ inv_01.pdf       │ FCA                              │
│ valor_total_frete    │ cct.pdf          │ EUR 1.755,70                     │
│ valor_total_frete    │ HAWB.pdf         │ EUR 1.840,70                     │
│ valor_total_frete    │ SEGURO...pdf     │ ND                               │
│ peso_bruto_kg        │ cct.pdf          │ 501,5                            │
└──────────────────────┴──────────────────┴──────────────────────────────────┘
```

## Solução Proposta

### Fase 1: Garantir Criação da Tabela de Regras

Atualizar `chb-corrections/index.ts` na função `ensureTableExists` para verificar explicitamente se a tabela existe e criar se não existir.

### Fase 2: Criar Endpoint para Reprocessar Correções Pendentes

Adicionar nova action `reprocess-pending` que:
1. Busca todas as correções com `location_confidence = 'baixa'`
2. Para cada correção, busca o conteúdo do arquivo
3. Dispara `reextractAndUpdateCorrection` para encontrar a localização
4. Atualiza a correção e salva a regra de extração

### Fase 3: Disparar Reprocessamento

Chamar o endpoint após o deploy para processar as 6 correções pendentes.

## Detalhamento Técnico

### Alteração 1: Garantir Tabela de Regras

**Arquivo**: `supabase/functions/chb-corrections/index.ts`

A função `ensureTableExists` já tenta criar a tabela, mas pode estar falhando silenciosamente. Vamos melhorar o tratamento de erro:

```typescript
async function ensureTableExists(client: Client): Promise<void> {
  try {
    // Create corrections table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_chb_user_corrections (...)
    `);
    
    // Create extraction rules table - EXPLICITLY LOG SUCCESS/FAILURE
    console.log('[chb-corrections] Creating extraction rules table if not exists...');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_chb_extraction_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        field_name VARCHAR(100) NOT NULL,
        document_type VARCHAR(50),
        extraction_pattern VARCHAR(500),
        location_hint VARCHAR(500),
        example_value VARCHAR(255),
        times_used INT DEFAULT 0,
        success_rate DECIMAL(5,2) DEFAULT 50.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_field_doc (field_name, document_type)
      )
    `);
    console.log('[chb-corrections] Extraction rules table ensured successfully');
  } catch (e) {
    console.error('[chb-corrections] Table creation error:', e);
    // Attempt to verify table exists
    try {
      await client.query('SELECT 1 FROM ai_agente.t_dachser_chb_extraction_rules LIMIT 1');
      console.log('[chb-corrections] Extraction rules table already exists');
    } catch {
      console.error('[chb-corrections] CRITICAL: Extraction rules table does NOT exist and could not be created');
    }
  }
}
```

### Alteração 2: Endpoint de Reprocessamento

**Arquivo**: `supabase/functions/chb-corrections/index.ts`

Adicionar nova action no handler POST:

```typescript
// POST /reprocess-pending - Reprocess all corrections with low confidence
if (action === 'reprocess-pending') {
  console.log('[chb-corrections] Starting reprocessing of pending corrections');
  
  // Get all corrections with low confidence
  const pendingCorrections = await client.query(`
    SELECT id, item_id, filename, field_name, corrected_value
    FROM ai_agente.t_dachser_chb_user_corrections
    WHERE location_confidence = 'baixa' 
       OR location_reference LIKE '%Erro%'
       OR location_reference LIKE '%manual%'
    ORDER BY created_at DESC
    LIMIT 50
  `);
  
  console.log(`[chb-corrections] Found ${pendingCorrections?.length || 0} pending corrections`);
  
  const results = [];
  
  for (const correction of (pendingCorrections || [])) {
    try {
      // Fetch file content
      const docRows = await client.query(`
        SELECT f.url as file_url
        FROM ai_agente.t_dachser_chb_docs d
        JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
        WHERE d.item_id = ? AND f.filename = ?
        LIMIT 1
      `, [correction.item_id, correction.filename]);
      
      if (docRows && docRows.length > 0 && docRows[0].file_url) {
        const fileResponse = await fetch(docRows[0].file_url);
        if (fileResponse.ok) {
          const fileContent = await fileResponse.text();
          
          // Run re-extraction
          const reextractionResult = await reextractFieldWithContext(
            correction.filename,
            correction.field_name,
            correction.corrected_value,
            fileContent
          );
          
          if (reextractionResult.found) {
            // Update correction with location
            await client.execute(`
              UPDATE ai_agente.t_dachser_chb_user_corrections
              SET location_reference = ?,
                  location_context = ?,
                  location_confidence = ?,
                  updated_at = NOW()
              WHERE id = ?
            `, [
              reextractionResult.location,
              reextractionResult.nearbyText,
              reextractionResult.confidence,
              correction.id
            ]);
            
            // Save extraction rule
            const docType = detectDocumentType(correction.filename);
            await saveExtractionRule(
              client,
              correction.field_name,
              docType,
              reextractionResult.pattern,
              reextractionResult.extractionHint,
              correction.corrected_value
            );
            
            results.push({
              id: correction.id,
              field: correction.field_name,
              file: correction.filename,
              status: 'processed',
              location: reextractionResult.location,
              confidence: reextractionResult.confidence
            });
          } else {
            results.push({
              id: correction.id,
              field: correction.field_name,
              file: correction.filename,
              status: 'not_found'
            });
          }
        }
      } else {
        results.push({
          id: correction.id,
          field: correction.field_name,
          file: correction.filename,
          status: 'no_file_url'
        });
      }
    } catch (err) {
      results.push({
        id: correction.id,
        field: correction.field_name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown'
      });
    }
  }
  
  await client.close();
  return new Response(
    JSON.stringify({ 
      success: true, 
      processed: results.length,
      results 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Alteração 3: Ajustar Prompt com Regras Existentes

Após processar as correções, as regras serão automaticamente injetadas no prompt de análise futuro via `analyze-chb-documents/index.ts` (já implementado).

## Resumo de Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/chb-corrections/index.ts` | Melhorar `ensureTableExists` + Adicionar action `reprocess-pending` |

## Ordem de Execução

1. Atualizar `chb-corrections/index.ts` com as melhorias
2. Deploy da edge function
3. Chamar `POST /chb-corrections/reprocess-pending` para processar as 6 correções
4. Verificar se as regras foram criadas em `t_dachser_chb_extraction_rules`
5. Testar nova análise CHB para verificar se regras são injetadas no prompt

## Resultado Esperado

- Tabela `t_dachser_chb_extraction_rules` será criada
- As 6 correções pendentes serão reprocessadas
- Regras de extração serão salvas para:
  - `incoterm` → Invoice
  - `valor_total_frete` → CCT, HAWB
  - `peso_bruto_kg` → CCT
- Próximas análises usarão essas regras para extrair corretamente

