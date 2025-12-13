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

// ============ INTERFACES ============

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

// ============ UTILITY FUNCTIONS ============

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

// Fetch file as base64
async function fetchFileAsBase64(fileUrl: string, fileName: string): Promise<{ base64: string; name: string; mediaType: string; ext: string } | null> {
  try {
    console.log(`📄 Fetching: ${fileName}`);
    const response = await fetch(fileUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) return null;
    
    const base64 = arrayBufferToBase64Chunked(buffer);
    const ext = fileName.toLowerCase().split('.').pop() || '';
    
    let mediaType = 'application/pdf';
    if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
      mediaType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === 'csv') {
      mediaType = 'text/csv';
    }
    
    console.log(`✅ Loaded: ${fileName} (${Math.round(buffer.byteLength / 1024)} KB)`);
    return { base64, name: fileName, mediaType, ext };
  } catch (e) {
    console.error(`❌ Fetch failed: ${fileName}`, e);
    return null;
  }
}

// ============ XLSX TEXT EXTRACTION (OPTIMIZED FOR MARITIME DATA) ============

async function extractXlsxText(fileUrl: string, fileName: string): Promise<string> {
  console.log(`📊 [XLSX] Extracting from: ${fileName}`);
  const startTime = Date.now();
  
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch XLSX: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
    console.log(`📊 [XLSX] File loaded: ${fileSizeKB} KB`);
    
    // For very large files (>1.5MB), use stricter limits
    const isLargeFile = fileSizeKB > 1500;
    
    // Import xlsx library
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    
    // Read workbook with OPTIMIZED settings - read more rows to capture summary data
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      sheetRows: isLargeFile ? 150 : 300,  // Need enough rows for summary/totals
      cellFormula: false,
      cellStyles: false,
      cellNF: false,
      cellDates: false,
      dense: true,
    });
    
    console.log(`📊 [XLSX] ${workbook.SheetNames.length} sheets found (large file: ${isLargeFile})`);
    
    // Prioritize sheets with summary/total data first, then detail sheets
    // "Resumo" and "Container List" usually have weight/CBM totals
    const highPriority = ['resumo', 'summary', 'container', 'total', 'overview'];
    const mediumPriority = ['ncm', 'package', 'cargo', 'item', 'supplier'];
    const skipPatterns = ['instruction', 'info', 'guide', 'readme', 'help', 'template'];
    
    const sortedSheets = workbook.SheetNames
      .filter((name: string) => !skipPatterns.some(p => name.toLowerCase().includes(p)))
      .sort((a: string, b: string) => {
        const aHigh = highPriority.some(p => a.toLowerCase().includes(p));
        const bHigh = highPriority.some(p => b.toLowerCase().includes(p));
        const aMed = mediumPriority.some(p => a.toLowerCase().includes(p));
        const bMed = mediumPriority.some(p => b.toLowerCase().includes(p));
        
        if (aHigh && !bHigh) return -1;
        if (!aHigh && bHigh) return 1;
        if (aMed && !bMed) return -1;
        if (!aMed && bMed) return 1;
        return 0;
      });
    
    // Process 4 sheets for large files, 5 for normal - need more to capture all data
    const maxSheets = isLargeFile ? 4 : 5;
    const sheetsToProcess = sortedSheets.slice(0, maxSheets);
    console.log(`📊 [XLSX] Processing ${sheetsToProcess.length} sheets: ${sheetsToProcess.join(', ')}`);
    
    let fullText = '';
    let totalRows = 0;
    const MAX_CHARS = isLargeFile ? 45000 : 60000;
    
    for (const sheetName of sheetsToProcess) {
      if (fullText.length >= MAX_CHARS) break;
      
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        const lines = csv.split('\n')
          .filter((line: string) => line.trim().length > 0);
        
        // For summary sheets, take more lines; for detail sheets, limit more
        const isSummarySheet = highPriority.some(p => sheetName.toLowerCase().includes(p));
        const maxLines = isSummarySheet ? 200 : 120;
        const linesToProcess = lines.slice(0, maxLines);
        
        if (linesToProcess.length > 0) {
          const sheetText = `\n=== ${sheetName} (${linesToProcess.length} rows) ===\n${linesToProcess.join('\n')}`;
          fullText += sheetText.substring(0, MAX_CHARS - fullText.length);
          totalRows += linesToProcess.length;
        }
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`📊 [XLSX] Done: ${fullText.length} chars, ${totalRows} rows in ${elapsed}ms`);
    return fullText.trim();
    
  } catch (error) {
    console.error(`📊 [XLSX] Error:`, error);
    return '';
  }
}

// ============ ANTHROPIC CLAUDE - ANALYSIS ============

async function analyzeWithAnthropic(
  prompt: string, 
  manifestText: string,
  pdfFiles: Array<{ base64: string; name: string }>,
  metadata: { consignee?: string; container?: string }
): Promise<{ text: string; model: string }> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Add extracted manifest text
  if (manifestText && manifestText.length > 0) {
    fullPrompt += `\n\n=== CONTEÚDO DO MANIFESTO (extraído do arquivo XLSX) ===\n${manifestText}\n=== FIM DO MANIFESTO ===`;
  }
  
  // Build content parts: prompt + PDF documents
  const contentParts: any[] = [
    { type: 'text', text: fullPrompt }
  ];
  
  // Add PDFs as base64 documents (Claude supports PDF natively)
  for (const file of pdfFiles) {
    contentParts.push({ 
      type: 'document', 
      source: { 
        type: 'base64', 
        media_type: 'application/pdf', 
        data: file.base64 
      } 
    });
    contentParts.push({ type: 'text', text: `[Arquivo PDF: ${file.name}]` });
  }
  
  console.log(`🤖 Calling Anthropic Claude with ${pdfFiles.length} PDFs + manifest text (${manifestText.length} chars)`);
  
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
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  const resultText = data.content?.[0]?.text || '';
  console.log(`✅ Anthropic response: ${resultText.length} chars`);
  
  return { text: resultText, model: 'claude-sonnet-4-20250514' };
}

// ============ STEP 3: GEMINI PRO - FALLBACK ANALYSIS ============

async function analyzeWithGeminiPro(
  prompt: string, 
  manifestText: string,
  pdfFiles: Array<{ base64: string; name: string }>,
  metadata: { consignee?: string; container?: string }
): Promise<{ text: string; model: string }> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Add extracted manifest text
  if (manifestText && manifestText.length > 0) {
    fullPrompt += `\n\n=== CONTEÚDO DO MANIFESTO (extraído do arquivo XLSX) ===\n${manifestText}\n=== FIM DO MANIFESTO ===`;
  }
  
  console.log(`🔄 Fallback: Calling Gemini Pro with ${pdfFiles.length} PDFs + manifest text (${manifestText.length} chars)`);
  
  // Build content parts for Gemini
  const contentParts: any[] = [{ type: 'text', text: fullPrompt }];
  
  // Add PDFs as base64 (Gemini accepts PDFs via image_url)
  for (const file of pdfFiles) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:application/pdf;base64,${file.base64}`
      }
    });
  }
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [{ role: 'user', content: contentParts }]
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`❌ Gemini Pro error: ${response.status} - ${errorText}`);
    throw new Error(`Gemini Pro error: ${response.status}`);
  }
  
  const data = await response.json();
  const resultText = data.choices?.[0]?.message?.content || '';
  console.log(`✅ Gemini Pro response: ${resultText.length} chars`);
  
  return { text: resultText, model: 'gemini-2.5-pro' };
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
  
  // Separate XLSX files from PDFs for special handling
  const xlsxUrls = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop() || '';
    return ['xlsx', 'xls', 'xlsm', 'csv'].includes(ext);
  });
  
  const pdfUrls = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop() || '';
    return !['xlsx', 'xls', 'xlsm', 'csv'].includes(ext);
  });
  
  console.log(`📊 XLSX files: ${xlsxUrls.length}, PDF files: ${pdfUrls.length}`);
  
  // Step 1: Extract text from XLSX files
  let manifestText = '';
  for (const xlsxFile of xlsxUrls) {
    try {
      const extractedText = await extractXlsxText(xlsxFile.file_url, xlsxFile.file_name);
      if (extractedText) {
        manifestText += `\n\n=== ${xlsxFile.file_name} ===\n${extractedText}`;
      }
    } catch (e) {
      console.error(`❌ Failed to extract XLSX: ${xlsxFile.file_name}`, e);
    }
  }
  
  console.log(`📊 Manifest text extracted: ${manifestText.length} chars`);
  
  // Step 2: Fetch PDFs as base64
  const pdfPromises = pdfUrls.map(f => fetchFileAsBase64(f.file_url, f.file_name));
  const pdfResults = await Promise.all(pdfPromises);
  const validPdfs = pdfResults.filter((f): f is { base64: string; name: string; mediaType: string; ext: string } => f !== null);
  
  console.log(`📎 PDFs loaded: ${validPdfs.length}`);
  
  if (validPdfs.length === 0 && manifestText.length === 0) {
    throw new Error('Não foi possível carregar nenhum documento');
  }
  
  // Step 3: Try Anthropic Claude (primary)
  let result: { text: string; model: string };
  
  try {
    result = await analyzeWithAnthropic(
      basePrompt, 
      manifestText,
      validPdfs.map(f => ({ base64: f.base64, name: f.name })),
      metadata
    );
  } catch (anthropicError) {
    console.error(`❌ Anthropic failed, falling back to Gemini Pro:`, anthropicError);
    
    // Fallback to Gemini Pro
    result = await analyzeWithGeminiPro(
      basePrompt, 
      manifestText,
      validPdfs.map(f => ({ base64: f.base64, name: f.name })),
      metadata
    );
  }
  
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Analysis completed in ${elapsed}s using ${result.model}`);
  
  return {
    result_text: result.text,
    json_result: { 
      status: 'completed', 
      model: result.model, 
      total_time_ms: Date.now() - startTime,
      file_count: xlsxUrls.length + validPdfs.length
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
  console.log('🚀 SEA Submit Analysis - 3-Step Pipeline (Flash → Claude → Pro)');
  
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
          
          // Run 3-step LLM analysis
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

          // Update run with result (using only existing columns)
          await bgClient.execute(`
            UPDATE ai_agente.t_dachser_sea_runs 
            SET status = 'realizado',
                result_text = ?,
                result_json = ?
            WHERE id = ?
          `, [
            result.result_text || '',
            JSON.stringify(result.json_result || {}),
            runId
          ]);
          
          // NOTE: Item status is NOT updated here automatically.
          // It will only be marked as 'realizado' when user clicks "Concluir Análise"
          console.log(`📋 Item ${actualItemId} status unchanged - waiting for user to complete`);

          
          console.log(`✅ Run ${runId} completed successfully with ${result.model}`);
          
        } catch (err) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.error(`❌ Analysis error after ${elapsed}s:`, err);
          
          if (!bgClient) bgClient = await getDbClient();
          
          await bgClient.execute(`
            UPDATE ai_agente.t_dachser_sea_runs 
            SET status = 'erro',
                result_text = ?,
                updated_at = NOW()
            WHERE id = ?
          `, [err instanceof Error ? err.message : 'Unknown error', runId]);
          
          if (actualItemId) {
            await bgClient.execute(`
              UPDATE ai_agente.t_dachser_sea_items SET status = 'erro' WHERE id = ?
            `, [actualItemId]);
          }
        } finally {
          if (bgClient) await bgClient.close();
        }
      };

      // Start background processing
      EdgeRuntime.waitUntil(processAnalysis());

      return new Response(JSON.stringify({ 
        success: true, 
        analysisId: String(runId),
        runId: Number(runId),
        itemId: actualItemId,
        status: 'queued',
        message: 'Análise iniciada em background',
        files: allFiles.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });

    } catch (innerError) {
      await dbClient.close();
      throw innerError;
    }

  } catch (error) {
    console.error('🔴 Request error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
