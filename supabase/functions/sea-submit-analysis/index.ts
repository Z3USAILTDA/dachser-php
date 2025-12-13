import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============ OPTIMIZED LLM ANALYZER ============

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

// ============ FAST TEXT EXTRACTION ============

async function extractXlsxText(fileUrl: string, fileName: string): Promise<string> {
  try {
    console.log(`📄 Extracting XLSX: ${fileName}`);
    const response = await fetch(fileUrl);
    if (!response.ok) return '';
    const arrayBuffer = await response.arrayBuffer();
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const workbook = XLSX.read(arrayBuffer, { type: 'array', sheetRows: 3000 });
    
    let fullText = `\n=== FILE: ${fileName} ===\n`;
    for (const sheetName of workbook.SheetNames.slice(0, 8)) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        fullText += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
      }
    }
    console.log(`✅ XLSX extracted: ${fullText.length} chars`);
    return fullText.substring(0, 200000);
  } catch (e) { 
    console.error(`❌ XLSX extraction failed: ${e}`);
    return ''; 
  }
}

// Fast PDF text extraction using Gemini Flash for OCR
async function extractPdfTextWithAI(fileUrl: string, fileName: string): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) return '';

  try {
    console.log(`📄 Extracting PDF with AI: ${fileName}`);
    
    // Fetch PDF as base64
    const response = await fetch(fileUrl);
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) return '';
    
    const base64 = arrayBufferToBase64Chunked(buffer);
    
    // Use Gemini Flash (fast model) for text extraction only
    const extractionPrompt = `Extract ALL text content from this PDF document. 
Include ALL:
- Weights (gross, net, chargeable)
- NCM/HS codes (all 4, 6, or 8 digit codes)
- Invoice numbers and references
- Container numbers
- Consignee/shipper names
- CBM/measurement values
- Descriptions of goods
- Any numeric values

Output the raw extracted text in a structured format. Do not summarize - extract EVERYTHING.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // Use Flash for speed
        messages: [{ 
          role: 'user', 
          content: [
            { type: 'text', text: extractionPrompt },
            { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } }
          ]
        }],
        max_tokens: 8000,
        temperature: 0,
      }),
    });
    
    if (!aiResponse.ok) {
      console.error(`❌ PDF extraction API error: ${aiResponse.status}`);
      return '';
    }
    
    const data = await aiResponse.json();
    const extractedText = data.choices?.[0]?.message?.content || '';
    console.log(`✅ PDF extracted: ${extractedText.length} chars from ${fileName}`);
    
    return `\n=== FILE: ${fileName} ===\n${extractedText}\n`;
  } catch (e) {
    console.error(`❌ PDF extraction failed for ${fileName}:`, e);
    return '';
  }
}

async function extractTextFromFile(file: FileInfo): Promise<string> {
  const ext = file.file_name.toLowerCase().split('.').pop();
  if (['xlsx', 'xls', 'xlsm'].includes(ext || '')) {
    return await extractXlsxText(file.file_url, file.file_name);
  } else if (ext === 'csv') {
    const response = await fetch(file.file_url);
    const text = await response.text();
    return `\n=== FILE: ${file.file_name} ===\n${text}\n`;
  } else if (ext === 'pdf') {
    return await extractPdfTextWithAI(file.file_url, file.file_name);
  }
  return '';
}

import { getPromptForAnalysisType } from "./prompts.ts";

// Final analysis using extracted text only (no binary files)
async function analyzeWithGemini(
  prompt: string, 
  extractedTexts: string, 
  metadata: { consignee?: string; container?: string }
): Promise<{ text: string; model: string }> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Combine prompt with all extracted text
  const combinedContent = `${fullPrompt}

═══════════════════════════════════════════════════════════════════
EXTRACTED DOCUMENT DATA (PRE-PROCESSED)
═══════════════════════════════════════════════════════════════════

${extractedTexts}

═══════════════════════════════════════════════════════════════════
END OF EXTRACTED DATA
═══════════════════════════════════════════════════════════════════

Now perform the complete analysis comparing all documents above following the specified format.
IMPORTANT: All data has been extracted for you. Focus on comparison and generating the analysis report.`;

  console.log(`📊 Sending ${combinedContent.length} chars to analysis LLM`);
  
  // Use Gemini Pro for final analysis (better reasoning)
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [{ role: 'user', content: combinedContent }],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });
  
  if (response.ok) {
    const data = await response.json();
    return { text: data.choices?.[0]?.message?.content || '', model: 'google/gemini-2.5-pro' };
  }
  
  if (response.status === 429) {
    throw new Error('Limite de requisições excedido, tente novamente mais tarde');
  }
  if (response.status === 402) {
    throw new Error('Créditos esgotados, adicione créditos ao workspace');
  }
  
  const errorText = await response.text().catch(() => '');
  throw new Error(`Erro na API de IA: ${response.status} - ${errorText}`);
}

async function analyzeWithLLM(
  analysisType: string, files: FileInfo[], metadata: { consignee?: string; container?: string }
): Promise<AnalysisResult> {
  const basePrompt = getPromptForAnalysisType(analysisType);
  const startTime = Date.now();
  
  console.log(`🚀 Starting optimized analysis for ${files.length} files`);
  
  // STEP 1: Extract text from ALL files in parallel
  const extractionPromises = files.map(f => extractTextFromFile(f));
  const extractedTexts = await Promise.all(extractionPromises);
  
  const combinedExtractedText = extractedTexts.filter(t => t.length > 0).join('\n');
  console.log(`📝 Total extracted text: ${combinedExtractedText.length} chars`);
  
  if (combinedExtractedText.length < 100) {
    throw new Error('Não foi possível extrair texto suficiente dos documentos');
  }
  
  // STEP 2: Send extracted TEXT (not binary files) for analysis
  const result = await analyzeWithGemini(basePrompt, combinedExtractedText, metadata);
  
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Analysis completed in ${elapsed}s`);
  
  return {
    result_text: result.text,
    json_result: { status: 'completed', model: result.model, total_time_ms: Date.now() - startTime, extraction_chars: combinedExtractedText.length },
    model: result.model
  };
}

// ============ END OPTIMIZED LLM ANALYZER ============

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

serve(async (req) => {
  console.log('🚀 SEA Submit Analysis - Optimized Text Extraction');
  
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
          
          // Run optimized LLM analysis
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
