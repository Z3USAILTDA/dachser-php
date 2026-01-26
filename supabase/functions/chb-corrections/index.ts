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

// Setup table if not exists
async function ensureTableExists(client: Client): Promise<void> {
  try {
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
    console.log('[chb-corrections] Table ensured');
  } catch (e) {
    console.error('[chb-corrections] Table creation error:', e);
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

        // Try to locate value automatically if file content is provided
        let locationResult: { found: boolean; location: string; context: string; confidence: 'alta' | 'media' | 'baixa' } = {
          found: false,
          location: 'Localização manual não realizada',
          context: '',
          confidence: 'baixa'
        };

        if (file_content) {
          console.log(`[chb-corrections] Locating value "${corrected_value}" in ${filename}`);
          const locateResult = await locateValueInFile(
            filename,
            field_name,
            corrected_value,
            file_content
          );
          locationResult = locateResult;
          console.log(`[chb-corrections] Location result:`, locationResult);
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

        await client.close();
        return new Response(
          JSON.stringify({
            success: true,
            correction_id: correctionId,
            location: locationResult
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
