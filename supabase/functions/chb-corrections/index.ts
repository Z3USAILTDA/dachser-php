import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Direct MariaDB connection
async function getMariaDBClient(): Promise<Client> {
  const client = await new Client().connect({
    hostname: Deno.env.get('MARIADB_HOST')!,
    port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
    db: Deno.env.get('MARIADB_DATABASE')!,
    username: Deno.env.get('MARIADB_USER')!,
    password: Deno.env.get('MARIADB_PASSWORD')!,
  });
  return client;
}

// Use LLM to locate corrected value in file
async function locateValueInFile(
  filename: string,
  fieldName: string,
  correctedValue: string,
  fileContent: string
): Promise<{ found: boolean; location: string; context: string; confidence: 'alta' | 'media' | 'baixa' }> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    console.log('[chb-corrections] GEMINI_API_KEY not found, using fallback location');
    return {
      found: false,
      location: 'Localização automática não disponível',
      context: '',
      confidence: 'baixa'
    };
  }
  
  const prompt = `Você é um especialista em análise de documentos de comércio exterior.

TAREFA: Localizar onde o valor "${correctedValue}" aparece no arquivo "${filename}" para o campo "${fieldName}".

CONTEÚDO DO ARQUIVO:
${fileContent.substring(0, 50000)}

INSTRUÇÕES:
1. Procure o valor exato "${correctedValue}" no conteúdo
2. Se encontrar, identifique a localização (página, seção, tabela)
3. Extraia o contexto ao redor (texto antes e depois)
4. Avalie a confiança da localização

RETORNE APENAS JSON no formato:
{
  "found": true/false,
  "location": "Página X, seção Y" ou "Tabela de totais, coluna Z" ou "Campo 'Weight' no cabeçalho",
  "context": "...texto antes... [VALOR] ...texto depois...",
  "confidence": "alta" | "media" | "baixa"
}

Se não encontrar o valor exato, busque valores similares e indique com confidence "baixa".
Se o valor for numérico, considere formatações diferentes (97,3 vs 97.30 vs 97,30).`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      console.error('[chb-corrections] Gemini API error:', await response.text());
      return {
        found: false,
        location: 'Erro na localização automática',
        context: '',
        confidence: 'baixa'
      };
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        found: parsed.found ?? false,
        location: parsed.location || 'Não localizado',
        context: parsed.context || '',
        confidence: parsed.confidence || 'baixa'
      };
    }
    
    return {
      found: false,
      location: 'Não foi possível processar resposta',
      context: '',
      confidence: 'baixa'
    };
  } catch (error) {
    console.error('[chb-corrections] locateValueInFile error:', error);
    return {
      found: false,
      location: 'Erro ao localizar',
      context: '',
      confidence: 'baixa'
    };
  }
}

// ============================================================================
// RE-EXTRACTION: Parallel deep analysis to find field location
// ============================================================================

interface ReextractionResult {
  success: boolean;
  found: boolean;
  location: string;
  pattern: string;
  extractionHint: string;
  nearbyText: string;
  confidence: 'alta' | 'media' | 'baixa';
}

async function reextractFieldWithContext(
  filename: string,
  fieldName: string,
  correctedValue: string,
  fileContent: string
): Promise<ReextractionResult> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    console.log('[chb-corrections] GEMINI_API_KEY not found for re-extraction');
    return {
      success: false,
      found: false,
      location: '',
      pattern: '',
      extractionHint: '',
      nearbyText: '',
      confidence: 'baixa'
    };
  }

  const prompt = `TAREFA DE EXTRAÇÃO PRECISA - ANÁLISE PROFUNDA

Você é um especialista em documentos de comércio exterior (AWBs, Invoices, Packing Lists, CCTs, BLs).

OBJETIVO: Encontrar EXATAMENTE onde o valor "${correctedValue}" aparece para o campo "${fieldName}" no arquivo "${filename}".

CONTEÚDO COMPLETO DO DOCUMENTO (analisar com atenção):
${fileContent}

INSTRUÇÕES DETALHADAS:
1. Procure o valor "${correctedValue}" em TODO o documento
2. Considere variações de formatação:
   - Números: 97,3 = 97.3 = 97,30 = 97.30
   - Milhares: 10.841 = 10,841 = 10841
   - Com/sem unidades: "97,3 kg" vs "97,3"
3. Identifique o PADRÃO de extração (como o campo é identificado no documento)
4. Identifique a LOCALIZAÇÃO exata (página, seção, tabela, linha)
5. Capture o CONTEXTO próximo (10-15 palavras antes e depois)

RESPONDA EXATAMENTE no formato JSON:
{
  "found": true ou false,
  "location": "descrição precisa: ex: 'Página 1, seção TOTALS, linha 5' ou 'Tabela principal, coluna Gross Weight'",
  "pattern": "padrão para localizar: ex: 'Após o label Gross Weight:' ou 'Na coluna G após o total'",
  "extractionHint": "dica para futuras extrações: ex: 'Procurar após TOTALS na seção de pesos, valor com 1 casa decimal'",
  "nearbyText": "texto próximo: ex: 'Total Gross Weight: [VALOR] kg | Net Weight:'",
  "confidence": "alta" se encontrou exato, "media" se formato diferente, "baixa" se não encontrou
}

IMPORTANTE:
- Se o valor não existir LITERALMENTE, retorne found=false
- Se existir mas com formatação diferente (97,3 vs 97.30), indique found=true com confidence="media"
- Seja específico na localização para que possamos encontrar automaticamente em documentos similares`;

  try {
    console.log(`[chb-corrections] Re-extracting "${correctedValue}" for field "${fieldName}" in ${filename}`);
    
    // Use more powerful model for deep analysis
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[chb-corrections] Gemini Pro API error:', errorText);
      return {
        success: false,
        found: false,
        location: '',
        pattern: '',
        extractionHint: '',
        nearbyText: '',
        confidence: 'baixa'
      };
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[chb-corrections] Re-extraction result:`, parsed);
      return {
        success: true,
        found: parsed.found ?? false,
        location: parsed.location || '',
        pattern: parsed.pattern || '',
        extractionHint: parsed.extractionHint || '',
        nearbyText: parsed.nearbyText || '',
        confidence: parsed.confidence || 'baixa'
      };
    }
    
    console.log('[chb-corrections] Could not parse re-extraction response');
    return {
      success: false,
      found: false,
      location: '',
      pattern: '',
      extractionHint: '',
      nearbyText: '',
      confidence: 'baixa'
    };
  } catch (error) {
    console.error('[chb-corrections] reextractFieldWithContext error:', error);
    return {
      success: false,
      found: false,
      location: '',
      pattern: '',
      extractionHint: '',
      nearbyText: '',
      confidence: 'baixa'
    };
  }
}

// Update correction with re-extracted location and save extraction rule
async function reextractAndUpdateCorrection(
  correctionId: number,
  itemId: number,
  filename: string,
  fieldName: string,
  correctedValue: string,
  fileContent: string
): Promise<void> {
  console.log(`[chb-corrections] Starting parallel re-extraction for correction ${correctionId}`);
  
  let client: Client | null = null;
  
  try {
    const reextractionResult = await reextractFieldWithContext(
      filename,
      fieldName,
      correctedValue,
      fileContent
    );

    if (!reextractionResult.success) {
      console.log(`[chb-corrections] Re-extraction failed for correction ${correctionId}`);
      return;
    }

    client = await getMariaDBClient();

    // Update the correction with better location info if found
    if (reextractionResult.found) {
      console.log(`[chb-corrections] Re-extraction found location, updating correction ${correctionId}`);
      
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
        correctionId
      ]);
      
      // Determine document type from filename
      const docType = detectDocumentType(filename);
      
      // Save extraction rule for future use
      await saveExtractionRule(
        client,
        fieldName,
        docType,
        reextractionResult.pattern,
        reextractionResult.extractionHint,
        correctedValue
      );
      
      console.log(`[chb-corrections] Updated correction ${correctionId} and saved extraction rule`);
    } else {
      console.log(`[chb-corrections] Re-extraction did not find value for correction ${correctionId}`);
    }

    await client.close();
  } catch (error) {
    console.error(`[chb-corrections] Error in reextractAndUpdateCorrection:`, error);
    await client?.close();
  }
}

// Detect document type from filename
function detectDocumentType(filename: string): string {
  const lowerName = filename.toLowerCase();
  
  if (lowerName.includes('cct') || lowerName.includes('conhecimento')) return 'CCT';
  if (lowerName.includes('hawb') || lowerName.includes('house')) return 'HAWB';
  if (lowerName.includes('mawb') || lowerName.includes('master')) return 'MAWB';
  if (lowerName.includes('invoice') || lowerName.includes('fatura')) return 'Invoice';
  if (lowerName.includes('packing') || lowerName.includes('romaneio')) return 'PackingList';
  if (lowerName.includes('bl') || lowerName.includes('bill')) return 'BL';
  if (lowerName.includes('ce') || lowerName.includes('mercante')) return 'CE_Mercante';
  if (lowerName.includes('di') || lowerName.includes('declaracao')) return 'DI';
  
  return 'Outros';
}

// Save extraction rule for future learning
async function saveExtractionRule(
  client: Client,
  fieldName: string,
  documentType: string,
  pattern: string,
  extractionHint: string,
  exampleValue: string
): Promise<void> {
  try {
    // Check if rule already exists
    const existing = await client.query(`
      SELECT id, times_used, success_rate 
      FROM ai_agente.t_dachser_chb_extraction_rules
      WHERE field_name = ? AND document_type = ?
      LIMIT 1
    `, [fieldName, documentType]);

    if (existing && existing.length > 0) {
      // Update existing rule
      const rule = existing[0];
      const newTimesUsed = (rule.times_used || 0) + 1;
      const newSuccessRate = Math.min(100, ((rule.success_rate || 50) + 100) / 2); // Moving average
      
      await client.execute(`
        UPDATE ai_agente.t_dachser_chb_extraction_rules
        SET extraction_pattern = ?,
            location_hint = ?,
            example_value = ?,
            times_used = ?,
            success_rate = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [pattern, extractionHint, exampleValue, newTimesUsed, newSuccessRate, rule.id]);
      
      console.log(`[chb-corrections] Updated extraction rule ${rule.id} for ${fieldName}/${documentType}`);
    } else {
      // Insert new rule
      await client.execute(`
        INSERT INTO ai_agente.t_dachser_chb_extraction_rules
        (field_name, document_type, extraction_pattern, location_hint, example_value, times_used, success_rate)
        VALUES (?, ?, ?, ?, ?, 1, 80.00)
      `, [fieldName, documentType, pattern, extractionHint, exampleValue]);
      
      console.log(`[chb-corrections] Created new extraction rule for ${fieldName}/${documentType}`);
    }
  } catch (error) {
    console.error('[chb-corrections] Error saving extraction rule:', error);
    // Don't throw - this is not critical
  }
}

// Setup table if not exists
async function ensureTableExists(client: Client): Promise<void> {
  try {
    // Create corrections table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_chb_user_corrections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        original_value VARCHAR(500),
        corrected_value VARCHAR(500) NOT NULL,
        location_reference TEXT,
        location_context TEXT,
        location_confidence ENUM('alta', 'media', 'baixa') DEFAULT 'baixa',
        corrected_by VARCHAR(100),
        correction_reason TEXT,
        applied_count INT DEFAULT 0,
        is_validated BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_item_id (item_id),
        INDEX idx_filename (filename),
        INDEX idx_field (field_name)
      )
    `);
    console.log('[chb-corrections] Corrections table ensured');
    
    // Create extraction rules table for learning - EXPLICITLY LOG SUCCESS/FAILURE
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
    // Attempt to verify extraction rules table exists
    try {
      await client.query('SELECT 1 FROM ai_agente.t_dachser_chb_extraction_rules LIMIT 1');
      console.log('[chb-corrections] Extraction rules table already exists');
    } catch {
      console.error('[chb-corrections] CRITICAL: Extraction rules table does NOT exist and could not be created');
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1] || 'list';
    
    // Connect to MariaDB
    client = await getMariaDBClient();
    
    // Ensure table exists
    await ensureTableExists(client);

    if (req.method === 'GET') {
      // GET /list?item_id=123 - List corrections for an item
      const itemId = url.searchParams.get('item_id');
      
      if (!itemId) {
        await client.close();
        return new Response(
          JSON.stringify({ success: false, error: 'item_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rows = await client.query(`
        SELECT id, item_id, filename, field_name, original_value, corrected_value,
               location_reference, location_context, location_confidence,
               corrected_by, applied_count, is_validated, created_at
        FROM ai_agente.t_dachser_chb_user_corrections
        WHERE item_id = ?
        ORDER BY created_at DESC
      `, [parseInt(itemId)]);

      await client.close();
      return new Response(
        JSON.stringify({ success: true, corrections: rows || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();
      
      // POST /save - Save a correction with automatic location detection
      if (action === 'save' || action === 'chb-corrections') {
        const { 
          item_id, 
          filename, 
          field_name, 
          original_value, 
          corrected_value, 
          corrected_by,
          file_content // Content of the file for location detection
        } = body;

        if (!item_id || !filename || !field_name || !corrected_value) {
          await client.close();
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Missing required fields: item_id, filename, field_name, corrected_value' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Try to locate value automatically
        let locationResult: { found: boolean; location: string; context: string; confidence: 'alta' | 'media' | 'baixa' } = {
          found: false,
          location: 'Localização manual não realizada',
          context: '',
          confidence: 'baixa'
        };

        // Get file content - either from request or fetch from storage
        let effectiveFileContent = file_content;
        
        if (!effectiveFileContent && item_id && filename) {
          console.log(`[chb-corrections] file_content not provided, fetching from storage for ${filename}`);
          
          try {
            // Query MariaDB to get the file URL
            const docRows = await client.query(`
              SELECT f.url as file_url
              FROM ai_agente.t_dachser_chb_docs d
              JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
              WHERE d.item_id = ? AND f.filename = ?
              LIMIT 1
            `, [item_id, filename]);
            
            if (docRows && docRows.length > 0 && docRows[0].file_url) {
              const fileUrl = docRows[0].file_url;
              console.log(`[chb-corrections] Found file URL: ${fileUrl}`);
              
              const fileResponse = await fetch(fileUrl);
              if (fileResponse.ok) {
                effectiveFileContent = await fileResponse.text();
                console.log(`[chb-corrections] Fetched file content, length: ${effectiveFileContent.length}`);
              } else {
                console.log(`[chb-corrections] Failed to fetch file: ${fileResponse.status}`);
              }
            } else {
              console.log(`[chb-corrections] No file URL found in database for item ${item_id}, file ${filename}`);
            }
          } catch (fetchError) {
            console.error('[chb-corrections] Error fetching file content:', fetchError);
          }
        }

        if (effectiveFileContent) {
          console.log(`[chb-corrections] Locating value "${corrected_value}" in ${filename}`);
          const locateResult = await locateValueInFile(
            filename,
            field_name,
            corrected_value,
            effectiveFileContent
          );
          locationResult = locateResult;
          console.log(`[chb-corrections] Location result:`, locationResult);
        } else {
          console.log(`[chb-corrections] No file content available for location detection`);
        }

        // Check if correction already exists
        const existing = await client.query(`
          SELECT id FROM ai_agente.t_dachser_chb_user_corrections
          WHERE item_id = ? AND filename = ? AND field_name = ?
          LIMIT 1
        `, [item_id, filename, field_name]);

        let correctionId: number;

        if (existing && existing.length > 0) {
          // Update existing
          correctionId = existing[0].id;
          await client.execute(`
            UPDATE ai_agente.t_dachser_chb_user_corrections
            SET corrected_value = ?,
                original_value = ?,
                location_reference = ?,
                location_context = ?,
                location_confidence = ?,
            corrected_by = ?,
            is_validated = TRUE,
            updated_at = NOW()
        WHERE id = ?
      `, [
        corrected_value,
        original_value || null,
        locationResult.location,
        locationResult.context,
        locationResult.confidence,
        corrected_by || null,
        correctionId
      ]);
        } else {
          // Insert new
          const insertResult = await client.execute(`
            INSERT INTO ai_agente.t_dachser_chb_user_corrections
            (item_id, filename, field_name, original_value, corrected_value,
             location_reference, location_context, location_confidence,
             corrected_by, is_validated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
          `, [
            item_id,
            filename,
            field_name,
            original_value || null,
            corrected_value,
            locationResult.location,
            locationResult.context,
            locationResult.confidence,
            corrected_by || null
          ]);
          correctionId = insertResult.lastInsertId as number;
        }

        // ============================================================================
        // PARALLEL RE-EXTRACTION: When location not found, trigger deep analysis
        // ============================================================================
        if (!locationResult.found && effectiveFileContent) {
          console.log(`[chb-corrections] Location not found, starting parallel re-extraction for correction ${correctionId}`);
          
          // Dispatch parallel re-extraction (non-blocking)
          // deno-lint-ignore no-explicit-any
          const edgeRuntime = (globalThis as any).EdgeRuntime;
          if (edgeRuntime?.waitUntil) {
            edgeRuntime.waitUntil(
              reextractAndUpdateCorrection(
                correctionId,
                item_id,
                filename,
                field_name,
                corrected_value,
                effectiveFileContent
              )
            );
            console.log(`[chb-corrections] Parallel re-extraction dispatched for correction ${correctionId}`);
          } else {
            // Fallback: run async without waiting (best effort)
            reextractAndUpdateCorrection(
              correctionId,
              item_id,
              filename,
              field_name,
              corrected_value,
              effectiveFileContent
            ).catch(err => console.error('[chb-corrections] Re-extraction error:', err));
          }
        }

        await client.close();
        return new Response(
          JSON.stringify({
            success: true,
            correction_id: correctionId,
            location: locationResult,
            parallelReextractionStarted: !locationResult.found && !!effectiveFileContent
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // POST /delete - Delete a correction
      if (action === 'delete') {
        const { correction_id } = body;

        if (!correction_id) {
          await client.close();
          return new Response(
            JSON.stringify({ success: false, error: 'correction_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          'DELETE FROM ai_agente.t_dachser_chb_user_corrections WHERE id = ?',
          [correction_id]
        );

        await client.close();
        return new Response(
          JSON.stringify({ success: true, deleted: correction_id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // POST /increment-applied - Increment applied count
      if (action === 'increment-applied') {
        const { correction_id } = body;

        if (!correction_id) {
          await client.close();
          return new Response(
            JSON.stringify({ success: false, error: 'correction_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          UPDATE ai_agente.t_dachser_chb_user_corrections
          SET applied_count = applied_count + 1, updated_at = NOW()
          WHERE id = ?
        `, [correction_id]);

        await client.close();
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
             OR location_reference LIKE '%não disponível%'
          ORDER BY created_at DESC
          LIMIT 50
        `);
        
        console.log(`[chb-corrections] Found ${pendingCorrections?.length || 0} pending corrections`);
        
        const results: Array<{
          id: number;
          field: string;
          file: string;
          status: string;
          location?: string;
          confidence?: string;
          error?: string;
        }> = [];
        
        for (const correction of (pendingCorrections || [])) {
          try {
            // Fetch file content from storage
            const docRows = await client.query(`
              SELECT f.url as file_url
              FROM ai_agente.t_dachser_chb_docs d
              JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
              WHERE d.item_id = ? AND f.filename = ?
              LIMIT 1
            `, [correction.item_id, correction.filename]);
            
            if (docRows && docRows.length > 0 && docRows[0].file_url) {
              console.log(`[chb-corrections] Fetching content for ${correction.filename}`);
              
              const fileResponse = await fetch(docRows[0].file_url);
              if (fileResponse.ok) {
                const fileContent = await fileResponse.text();
                console.log(`[chb-corrections] File content length: ${fileContent.length}`);
                
                // Run re-extraction using Gemini Pro
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
                  
                  // Save extraction rule for future use
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
                  
                  console.log(`[chb-corrections] Successfully processed correction ${correction.id}`);
                } else {
                  results.push({
                    id: correction.id,
                    field: correction.field_name,
                    file: correction.filename,
                    status: 'not_found'
                  });
                  console.log(`[chb-corrections] Value not found for correction ${correction.id}`);
                }
              } else {
                results.push({
                  id: correction.id,
                  field: correction.field_name,
                  file: correction.filename,
                  status: 'fetch_failed',
                  error: `HTTP ${fileResponse.status}`
                });
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
              file: correction.filename,
              status: 'error',
              error: err instanceof Error ? err.message : 'Unknown'
            });
            console.error(`[chb-corrections] Error processing correction ${correction.id}:`, err);
          }
        }
        
        // Also check and list extraction rules
        let rulesCount = 0;
        try {
          const rules = await client.query(`
            SELECT COUNT(*) as cnt FROM ai_agente.t_dachser_chb_extraction_rules
          `);
          rulesCount = rules?.[0]?.cnt || 0;
        } catch {
          console.log('[chb-corrections] Could not count extraction rules');
        }
        
        await client.close();
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: results.length,
            results,
            extractionRulesCount: rulesCount
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Default response
    await client?.close();
    return new Response(
      JSON.stringify({ success: false, error: `Ação não suportada: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[chb-corrections] Error:', error);
    await client?.close();
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
