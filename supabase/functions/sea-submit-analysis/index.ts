import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { getPromptForAnalysisType } from "./prompts.ts";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ LLM ANALYZER - ALL FILES TO LLM (NO LOCAL XLSX PROCESSING) ============

interface AnalysisResult {
  result_text: string;
  json_result: any;
  model: string;
}

interface FileInfo {
  file_name: string;
  file_type: string;
  file_url: string;
}

// Chunked base64 encoding to avoid memory issues
function arrayBufferToBase64Chunked(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(result);
}

// Fetch any file as base64 for direct LLM submission
async function fetchFileAsBase64(fileUrl: string, fileName: string): Promise<{ base64: string; name: string; mimeType: string } | null> {
  try {
    console.log(`📄 Fetching file: ${fileName}`);
    const response = await fetch(fileUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) return null;
    
    const base64 = arrayBufferToBase64Chunked(buffer);
    const ext = fileName.toLowerCase().split('.').pop() || '';
    
    let mimeType = 'application/octet-stream';
    if (ext === 'pdf') mimeType = 'application/pdf';
    else if (['xlsx', 'xls', 'xlsm'].includes(ext)) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === 'csv') mimeType = 'text/csv';
    
    console.log(`✅ File loaded: ${fileName} (${Math.round(buffer.byteLength / 1024)} KB, ${mimeType})`);
    return { base64, name: fileName, mimeType };
  } catch (e) {
    console.error(`❌ File fetch failed: ${fileName}`, e);
    return null;
  }
}

// ============ GEMINI ANALYSIS (PRIMARY - ALL FILES SENT DIRECTLY) ============

async function analyzeWithGemini(
  prompt: string, 
  files: Array<{ base64: string; name: string; mimeType: string }>,
  metadata: { consignee?: string; container?: string }
): Promise<{ text: string; model: string }> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Build content parts - all files go directly to Gemini
  const contentParts: any[] = [
    { type: 'text', text: fullPrompt }
  ];
  
  // Add ALL files as base64 (Gemini Pro can process PDFs and spreadsheets)
  for (const file of files) {
    contentParts.push({ 
      type: 'image_url', 
      image_url: { url: `data:${file.mimeType};base64,${file.base64}` } 
    });
    contentParts.push({ type: 'text', text: `[Document: ${file.name}]` });
  }
  
  console.log(`🤖 Calling Gemini 2.5 Pro with ${files.length} files`);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [{ role: 'user', content: contentParts }],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`❌ Gemini API error: ${response.status} - ${errorText}`);
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  const data = await response.json();
  const resultText = data.choices?.[0]?.message?.content || '';
  console.log(`✅ Gemini response: ${resultText.length} chars`);
  
  return { text: resultText, model: 'google/gemini-2.5-pro' };
}

// ============ ANTHROPIC CLAUDE (FALLBACK - PDF ONLY) ============

async function analyzeWithAnthropic(
  prompt: string, 
  pdfFiles: Array<{ base64: string; name: string; mimeType: string }>,
  metadata: { consignee?: string; container?: string }
): Promise<{ text: string; model: string }> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Build content parts - only PDFs for Anthropic (no XLSX support)
  const contentParts: any[] = [
    { type: 'text', text: fullPrompt }
  ];
  
  const pdfs = pdfFiles.filter(f => f.mimeType === 'application/pdf');
  
  for (const pdf of pdfs) {
    contentParts.push({ 
      type: 'document', 
      source: { 
        type: 'base64', 
        media_type: 'application/pdf', 
        data: pdf.base64 
      } 
    });
    contentParts.push({ type: 'text', text: `[Document: ${pdf.name}]` });
  }
  
  console.log(`🤖 Calling Anthropic Claude with ${pdfs.length} PDFs`);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      temperature: 0.1,
      messages: [{ role: 'user', content: contentParts }]
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`❌ Anthropic API error: ${response.status} - ${errorText}`);
    throw new Error(`Anthropic API error: ${response.status}`);
  }
  
  const data = await response.json();
  const resultText = data.content?.[0]?.text || '';
  console.log(`✅ Anthropic response: ${resultText.length} chars`);
  
  return { text: resultText, model: 'claude-sonnet-4-20250514' };
}

// ============ MAIN LLM ANALYSIS FUNCTION ============

async function analyzeWithLLM(
  analysisType: string, 
  files: FileInfo[], 
  metadata: { consignee?: string; container?: string }
): Promise<AnalysisResult> {
  const basePrompt = getPromptForAnalysisType(analysisType);
  const startTime = Date.now();
  
  console.log(`🚀 Starting analysis for ${files.length} files`);
  
  // Fetch ALL files as base64 in parallel
  const fileDataPromises = files.map(f => fetchFileAsBase64(f.file_url, f.file_name));
  const fileDataResults = await Promise.all(fileDataPromises);
  const validFiles = fileDataResults.filter((f): f is { base64: string; name: string; mimeType: string } => f !== null);
  
  console.log(`📎 Files loaded: ${validFiles.length}`);
  
  if (validFiles.length === 0) {
    throw new Error('Não foi possível carregar nenhum arquivo');
  }
  
  // Use Gemini as primary (supports all file types including XLSX)
  // Fallback to Anthropic only for PDFs
  let result: { text: string; model: string };
  
  try {
    console.log('🎯 Using Gemini 2.5 Pro (primary - supports all file types)...');
    result = await analyzeWithGemini(basePrompt, validFiles, metadata);
  } catch (geminiError: any) {
    console.error(`⚠️ Gemini failed: ${geminiError.message}`);
    
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (anthropicKey) {
      console.log('🎯 Falling back to Anthropic Claude (PDFs only)...');
      result = await analyzeWithAnthropic(basePrompt, validFiles, metadata);
    } else {
      throw geminiError;
    }
  }
  
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Analysis completed in ${elapsed}s using ${result.model}`);
  
  return {
    result_text: result.text,
    json_result: { 
      status: 'completed', 
      model: result.model, 
      total_time_ms: Date.now() - startTime,
      file_count: validFiles.length
    },
    model: result.model
  };
}

// ============ HELPER FUNCTIONS ============

function extractContainerFromFilename(fileName: string): string | null {
  const match = fileName.match(/\b([A-Z]{4}\d{7})\b/);
  return match?.[1] || null;
}

function determineFileType(analysisType: string, isBase: boolean, fileName: string): string {
  if (isBase) return 'base';
  if (analysisType === 'manifest_hbl') return 'hbl';
  if (analysisType === 'hbl_mbl') return 'mbl';
  if (analysisType === 'invoices_hbl') {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol')) return 'hbl';
    if (lowerName.includes('inv') || lowerName.includes('invoice') || lowerName.includes('commercial')) return 'invoice';
    return 'outro';
  }
  return 'outro';
}

async function getDbClient() {
  const host = Deno.env.get('MARIADB_HOST');
  const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
  const database = Deno.env.get('MARIADB_DATABASE');
  const dbUser = Deno.env.get('MARIADB_USER');
  const dbPassword = Deno.env.get('MARIADB_PASSWORD');

  if (!host || !database || !dbUser || !dbPassword) {
    throw new Error('Database configuration error');
  }

  return await new Client().connect({
    hostname: host,
    port: port,
    db: database,
    username: dbUser,
    password: dbPassword,
    charset: "utf8mb4",
  });
}

// ============ MAIN SERVER ============

serve(async (req) => {
  console.log('🚀 SEA Submit Analysis - Anthropic Primary, Gemini Fallback');
  
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const formData = await req.formData();
    const itemId = formData.get('itemId') as string | null;
    const analysisType = formData.get('analysisType') as string;
    const files = formData.getAll('files') as File[];
    const linkDataRaw = formData.get('linkData') as string | null;
    const linkData = linkDataRaw ? JSON.parse(linkDataRaw) : null;
    const fileUrlsRaw = formData.get('fileUrls') as string | null;
    const fileUrls = fileUrlsRaw ? JSON.parse(fileUrlsRaw) : [];
    
    console.log(`📥 Received request - analysisType: ${analysisType}, itemId: ${itemId || 'null'}, files: ${files.length}, fileUrls: ${fileUrls.length}`);

    // Validate input
    if (analysisType === 'manifest_hbl' && files.length === 0) {
      return new Response(JSON.stringify({ error: 'At least 1 HBL file is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (analysisType === 'hbl_mbl' && files.length !== 1) {
      return new Response(JSON.stringify({ error: 'Exactly 1 MBL file is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (analysisType === 'invoices_hbl' && files.length === 0 && fileUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'At least 1 file is required for analysis' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let actualItemId = (!itemId || itemId.trim() === '') ? null : parseInt(itemId);
    const storagePrefix = actualItemId || `temp-${Date.now()}`;
    
    // Connect to MariaDB
    const dbClient = await getDbClient();

    try {
      // For invoices_hbl: create new item if no itemId
      if (analysisType === 'invoices_hbl' && !actualItemId) {
        let baseFileName = '';
        let baseFileUrl = '';
        
        // Find HBL file
        for (const file of files) {
          const lowerName = file.name.toLowerCase();
          if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol')) {
            baseFileName = file.name;
            const storagePath = `base-files/invoices-${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage.from('maritime-files').upload(storagePath, file, { contentType: file.type });
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(storagePath);
              baseFileUrl = publicUrl;
            }
            break;
          }
        }
        
        if (!baseFileName && fileUrls.length > 0) {
          for (const fileUrl of fileUrls) {
            const lowerName = fileUrl.name.toLowerCase();
            if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol') || fileUrl.type === 'hbl' || fileUrl.type === 'draft') {
              baseFileName = fileUrl.name;
              baseFileUrl = fileUrl.url;
              break;
            }
          }
        }
        
        if (!baseFileName) {
          if (files.length > 0) {
            baseFileName = files[0].name;
            const storagePath = `base-files/invoices-${Date.now()}-${files[0].name}`;
            const { error: uploadError } = await supabase.storage.from('maritime-files').upload(storagePath, files[0], { contentType: files[0].type });
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(storagePath);
              baseFileUrl = publicUrl;
            }
          } else if (fileUrls.length > 0) {
            baseFileName = fileUrls[0].name;
            baseFileUrl = fileUrls[0].url;
          }
        }
        
        if (baseFileName) {
          // Create file record
          const fileResult = await dbClient.execute(`
            INSERT INTO ai_agente.t_dachser_sea_files 
            (filename, mime, url, created_at)
            VALUES (?, ?, ?, NOW())
          `, [baseFileName, 'application/pdf', baseFileUrl || '']);
          
          const arquivoId = fileResult.lastInsertId;
          
          // Create item record
          const itemResult = await dbClient.execute(`
            INSERT INTO ai_agente.t_dachser_sea_items 
            (view, arquivo_id, arquivo_label, status, active, created_at)
            VALUES (?, ?, ?, 'queued', 1, NOW())
          `, ['invoices_hbl', arquivoId, baseFileName]);
          
          actualItemId = Number(itemResult.lastInsertId);
          console.log(`📦 Created maritime item for invoices_hbl: ${actualItemId}`);
        }
      }

      // Create analysis run record in MariaDB
      const modeValue = analysisType === 'invoices_hbl' ? 'hbl_mbl' : analysisType;
      const runResult = await dbClient.execute(`
        INSERT INTO ai_agente.t_dachser_sea_runs 
        (item_id, mode, status, created_at)
        VALUES (?, ?, 'pendente', NOW())
      `, [actualItemId, modeValue]);
      
      const runId = runResult.lastInsertId;
      console.log(`📝 Created analysis run: ${runId}`);

      // Upload files to storage and record in MariaDB
      const uploadedFiles = [];
      
      for (const file of files) {
        const storagePath = `submission-files/${storagePrefix}/${Date.now()}-${file.name}`;
        await supabase.storage.from('maritime-files').upload(storagePath, file, { contentType: file.type });
        const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(storagePath);
        uploadedFiles.push({ name: file.name, url: publicUrl, size: file.size, type: file.type });
        
        // Save file record to MariaDB
        await dbClient.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, size_bytes, rel_path, url, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, [file.name, file.type, file.size, storagePath, publicUrl]);
      }

      // Record fileUrls
      for (const fileUrl of fileUrls) {
        let actualSize = fileUrl.size || 0;
        if (!actualSize) {
          try {
            const checkResponse = await fetch(fileUrl.url, { method: 'HEAD' });
            if (checkResponse.ok) {
              const contentLength = checkResponse.headers.get('content-length');
              actualSize = contentLength ? parseInt(contentLength, 10) : 0;
            }
          } catch (e) {
            console.error(`[VALIDATE] Error checking file ${fileUrl.name}:`, e);
          }
        }
        
        uploadedFiles.push({ name: fileUrl.name, url: fileUrl.url, size: actualSize, type: fileUrl.type });
        
        // Save file URL record to MariaDB
        await dbClient.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, size_bytes, url, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [fileUrl.name, 'application/octet-stream', actualSize, fileUrl.url]);
      }

      // Update item status
      if (actualItemId) {
        await dbClient.execute(`
          UPDATE ai_agente.t_dachser_sea_items SET status = 'queued' WHERE id = ?
        `, [actualItemId]);
      }

      // Get base file info if exists
      let baseFileUrl = '';
      let baseFileName = '';
      let consignee = null;
      let container = null;
      
      if (actualItemId) {
        const items = await dbClient.query(`
          SELECT i.arquivo_label, i.consignee, i.container, f.url
          FROM ai_agente.t_dachser_sea_items i
          LEFT JOIN ai_agente.t_dachser_sea_files f ON f.id = i.arquivo_id
          WHERE i.id = ?
        `, [actualItemId]);
        
        if (items && items[0]) {
          baseFileName = items[0].arquivo_label || '';
          baseFileUrl = items[0].url || '';
          consignee = items[0].consignee;
          container = items[0].container;
        }
      }

      // Build allFiles array for analysis
      const allFiles: Array<{ name: string; url: string; size: number; type: string; file_type: string }> = [];
      
      if ((analysisType === 'manifest_hbl' || analysisType === 'hbl_mbl') && baseFileUrl && baseFileName) {
        allFiles.push({ 
          name: baseFileName, 
          url: baseFileUrl, 
          size: 0, 
          type: 'base',
          file_type: 'base'
        });
      }
      
      for (const f of uploadedFiles) {
        allFiles.push({
          name: f.name,
          url: f.url,
          size: f.size,
          type: determineFileType(analysisType, false, f.name),
          file_type: determineFileType(analysisType, false, f.name)
        });
      }

      console.log(`🚀 Analysis queued - runId: ${runId}, itemId: ${actualItemId || 'null'}, files: ${allFiles.length}`);

      // Close DB connection before background task
      await dbClient.close();

      // Background processing
      const processAnalysis = async () => {
        const startTime = Date.now();
        let bgClient: Client | null = null;
        
        try {
          console.log(`📊 Background analysis started for run ${runId}`);
          
          bgClient = await getDbClient();
          
          // Update status to analyzing
          await bgClient.execute(`
            UPDATE ai_agente.t_dachser_sea_runs SET status = 'analisando' WHERE id = ?
          `, [runId]);
          
          // Run LLM analysis with Anthropic primary, Gemini fallback
          const result = await analyzeWithLLM(
            analysisType,
            allFiles.map(f => ({ file_name: f.name, file_type: f.file_type, file_url: f.url })), 
            { consignee, container }
          );
          
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ Analysis complete in ${elapsed}s (${result.result_text?.length || 0} chars)`);

          let finalStatus = 'completed';
          const isValidNoChanges = result.result_text && (
            result.result_text.includes('No changes required') ||
            result.result_text.includes('Hello, team')
          );
          
          if (!result.result_text || (result.result_text.length < 200 && !isValidNoChanges)) {
            finalStatus = 'error';
          }

          // Update run with result
          await bgClient.execute(`
            UPDATE ai_agente.t_dachser_sea_runs 
            SET status = ?, result_text = ?
            WHERE id = ?
          `, [finalStatus === 'error' ? 'erro' : 'realizado', result.result_text || '', runId]);
          
          // Update item status
          if (actualItemId) {
            await bgClient.execute(`
              UPDATE ai_agente.t_dachser_sea_items 
              SET status = ? 
              WHERE id = ?
            `, [finalStatus === 'error' ? 'erro' : 'realizado', actualItemId]);
          }
          
          await bgClient.close();
          
        } catch (error: any) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.error(`❌ Analysis error after ${elapsed}s:`, error.message);
          
          try {
            if (!bgClient) bgClient = await getDbClient();
            
            await bgClient.execute(`
              UPDATE ai_agente.t_dachser_sea_runs 
              SET status = 'erro', result_text = ?
              WHERE id = ?
            `, [`Error: ${error.message}`, runId]);
            
            if (actualItemId) {
              await bgClient.execute(`
                UPDATE ai_agente.t_dachser_sea_items SET status = 'erro' WHERE id = ?
              `, [actualItemId]);
            }
            
            await bgClient.close();
          } catch (dbError) {
            console.error('Failed to update error status:', dbError);
          }
        }
      };
      
      EdgeRuntime.waitUntil(processAnalysis());
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          analysisId: String(runId),
          status: 'queued',
          message: 'Análise iniciada em background'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (innerError) {
      await dbClient.close();
      throw innerError;
    }

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
