/**
 * LLM analyzer - SINGLE STEP for maritime analysis
 * Sends raw manifest text + PDFs directly to Claude for analysis
 * Optimized to avoid CPU timeout on edge functions
 */

import { getPromptForAnalysisType, getShippingDataExtractionInstructions } from './prompts.ts';
import { extractXlsxText } from './simpleXlsxReader.ts';

// Helper to log API calls asynchronously (fire-and-forget)
async function logApiCall(
  api_name: string,
  endpoint: string,
  method: string,
  status_code: number,
  response_time_ms: number,
  error_message?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'log_api_call',
        api_name,
        endpoint,
        method,
        status_code,
        response_time_ms,
        error_message,
        edge_function: 'maritimo-analyze'
      }),
    });
  } catch (e) {
    // Silently fail - logging should not break main flow
    console.error('[logApiCall] Failed to log:', e);
  }
}

export interface AnalysisResult {
  result_text: string;
  json_result: any;
  model: string;
}

interface FileInfo {
  file_name: string;
  file_type: string;
  file_url: string;
}

/**
 * Normalize NCM codes for consistent comparison
 * - Removes non-numeric characters (dots, dashes, spaces, slashes)
 * - Deduplicates entries
 * - Sorts alphabetically
 * - Validates format (only digits, 4-8 characters)
 */
export function normalizeNCMList(ncmCodes: string[]): string[] {
  const normalized = ncmCodes
    .map(ncm => {
      // Remove all non-digit characters
      const cleaned = ncm.replace(/\D/g, '');
      return cleaned;
    })
    .filter(ncm => {
      // Valid NCM: only digits, 4-8 characters
      const isValid = /^\d{4,8}$/.test(ncm);
      if (!isValid && ncm.length > 0) {
        console.log(`[NCM] Invalid format rejected: "${ncm}"`);
      }
      return isValid;
    });

  // Deduplicate
  const unique = [...new Set(normalized)];
  
  // Sort for consistent ordering
  unique.sort((a, b) => a.localeCompare(b));
  
  console.log(`[NCM] Normalized: ${ncmCodes.length} input → ${unique.length} unique valid codes`);
  return unique;
}

/**
 * Check NCM extraction completeness
 * Returns warning if one document has significantly fewer NCMs than expected
 */
export function checkNCMCompleteness(
  doc1NCMs: string[],
  doc1Name: string,
  doc2NCMs: string[],
  doc2Name: string
): { isComplete: boolean; warning?: string } {
  const count1 = doc1NCMs.length;
  const count2 = doc2NCMs.length;
  
  console.log(`[NCM Completeness] ${doc1Name}: ${count1} NCMs, ${doc2Name}: ${count2} NCMs`);
  
  // If one has zero and the other doesn't, that's suspicious
  if ((count1 === 0 && count2 > 0) || (count2 === 0 && count1 > 0)) {
    const warning = `⚠️ NCM extraction may be incomplete: ${doc1Name} has ${count1} NCMs, ${doc2Name} has ${count2} NCMs`;
    console.warn(`[NCM Completeness] ${warning}`);
    return { isComplete: false, warning };
  }
  
  // If difference is more than 50% of the larger count, warn
  const maxCount = Math.max(count1, count2);
  const diff = Math.abs(count1 - count2);
  
  if (maxCount > 5 && diff > maxCount * 0.5) {
    const warning = `⚠️ NCM count difference is significant: ${doc1Name} has ${count1} NCMs, ${doc2Name} has ${count2} NCMs (${diff} difference)`;
    console.warn(`[NCM Completeness] ${warning}`);
    return { isComplete: false, warning };
  }
  
  return { isComplete: true };
}

/**
 * Extract NCM codes from text using regex patterns
 * IMPORTANT: Only extracts explicitly labeled NCM values - NEVER HS Codes
 * NCM = Nomenclatura Comum do Mercosul (Brazilian 8-digit tariff code)
 * HS Code = Harmonized System (International 4-6 digit code) - DO NOT EXTRACT
 */
export function extractNCMFromText(text: string): string[] {
  // ONLY extract values explicitly labeled as NCM - NEVER HS Code
  const ncmPatterns = [
    /\bNCM[:\s-]*(\d{4,8})/gi,           // NCM: 12345678
    /\bNCM\s*CODE[:\s]*(\d{4,8})/gi,     // NCM Code: 12345678
    /\bCODIGO\s*NCM[:\s]*(\d{4,8})/gi,   // Codigo NCM: 12345678
    /\bCÓDIGO\s*NCM[:\s]*(\d{4,8})/gi,   // Código NCM: 12345678
    /\bNCM[-_]?CODES?[:\s]*(\d{4,8})/gi, // NCM-CODES: 12345678
    // Note: DO NOT include HS pattern - HS codes are a DIFFERENT classification system
    // Removed: /\bHS[:\s-]*(\d{4,8})/gi - This was incorrectly extracting HS codes as NCMs
    /\b(\d{4}\.\d{2}\.\d{2})\b/g,        // 8-digit with dots (8481.20.90) - NCM format
    /\b(\d{8})\b/g,                       // 8-digit plain (84812090) - NCM format
  ];
  
  const found: string[] = [];
  
  for (const pattern of ncmPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const ncm = match[1] || match[0];
      // Only include codes that are likely NCMs (6-8 digits preferred)
      // 4-digit codes are often HS chapter codes, not full NCMs
      found.push(ncm);
    }
  }
  
  console.log(`[NCM Extract] Found ${found.length} potential NCM codes (HS codes excluded)`);
  return normalizeNCMList(found);
}

/**
 * Convert ArrayBuffer to base64 in chunks
 */
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

/**
 * Fetch file and return base64 + info
 */
async function fetchFileAsBase64(fileUrl: string): Promise<{ base64: string; size: number } | null> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.warn(`[Fetch] Failed to fetch file: ${response.status}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    
    // Validate file has content - reject empty files
    if (buffer.byteLength < 100) {
      console.warn(`[Fetch] File too small (${buffer.byteLength} bytes), skipping`);
      return null;
    }
    
    return {
      base64: arrayBufferToBase64Chunked(buffer),
      size: buffer.byteLength
    };
  } catch (error) {
    console.error('Error fetching file:', error);
    return null;
  }
}

/**
 * Extract text from XLSX/CSV files
 */
async function extractTextFromFile(file: FileInfo): Promise<{ text: string; ncmCodes?: string[]; debugInfo?: string }> {
  const extension = file.file_name.toLowerCase().split('.').pop();
  
  if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') {
    const result = await extractXlsxText(file.file_url, file.file_name);
    console.log(`[Extract] ${file.file_name}: ${result.rowCount} rows, ${result.ncmCodes?.length || 0} NCMs`);
    if (result.debugInfo) {
      console.log(`[Extract] Debug info: ${result.debugInfo}`);
    }
    
    // Normalize NCMs from XLSX
    const normalizedNCMs = result.ncmCodes ? normalizeNCMList(result.ncmCodes) : [];
    
    return { 
      text: result.text, 
      ncmCodes: normalizedNCMs,
      debugInfo: result.debugInfo 
    };
  } else if (extension === 'csv') {
    const response = await fetch(file.file_url);
    const text = await response.text();
    return { text };
  }
  
  return { text: '' };
}

/**
 * Single-step analysis with Anthropic Claude (native PDF support)
 */
async function analyzeWithAnthropic(
  prompt: string,
  manifestText: string,
  pdfFiles: FileInfo[],
  metadata: { consignee?: string; container?: string },
  apiKey: string,
  analysisType: string = ''
): Promise<{ text: string; model: string }> {
  console.log(`[Analysis] Starting Anthropic analysis with ${pdfFiles.length} PDFs`);
  const startTime = Date.now();
  
  // Build content array
  const contentParts: any[] = [];
  
  // Add prompt with metadata
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Add shipping data extraction instructions based on analysis type
  fullPrompt += getShippingDataExtractionInstructions(analysisType);
  
  contentParts.push({ type: 'text', text: fullPrompt });
  
  // Add manifest text directly (no pre-processing)
  if (manifestText.length > 0) {
    contentParts.push({ 
      type: 'text', 
      text: `\n\n=== MANIFEST/PACKING LIST DATA ===\n${manifestText}\n=== END MANIFEST ===\n` 
    });
    console.log(`  Added manifest text (${manifestText.length} chars)`);
  }
  
  // Add PDF files (skip empty/invalid files)
  let validPdfCount = 0;
  for (const file of pdfFiles) {
    const pdfData = await fetchFileAsBase64(file.file_url);
    if (pdfData && pdfData.size >= 100) {
      contentParts.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfData.base64
        }
      });
      contentParts.push({ 
        type: 'text', 
        text: `[Document: ${file.file_name} (${file.file_type})]` 
      });
      console.log(`  Added PDF: ${file.file_name} (${Math.round(pdfData.size/1024)}KB)`);
      validPdfCount++;
    } else {
      console.warn(`  Skipped invalid/empty PDF: ${file.file_name}`);
    }
  }
  
  if (validPdfCount === 0 && pdfFiles.length > 0) {
    throw new Error('Nenhum PDF válido encontrado. Verifique se os arquivos foram carregados corretamente.');
  }
  
  contentParts.push({ 
    type: 'text', 
    text: '\n\nAnalyze the documents above and provide your complete analysis following the specified format.' 
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
  
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Analysis] Anthropic attempt ${attempt}/${maxRetries}`);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          temperature: 0, // Zero for deterministic/consistent output
          messages: [{ role: 'user', content: contentParts }]
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        console.log(`[Analysis] Anthropic completed in ${elapsed}ms (${text.length} chars)`);
        
        // Log successful API call
        logApiCall('Anthropic', '/v1/messages', 'POST', response.status, elapsed);
        
        return { text, model: 'claude-sonnet-4-20250514' };
      } else {
        const errorText = await response.text();
        console.error(`[Analysis] Anthropic failed (${response.status}): ${errorText.substring(0, 300)}`);
        
        // Log failed API call
        logApiCall('Anthropic', '/v1/messages', 'POST', response.status, Date.now() - startTime, errorText.substring(0, 200));
        
        lastError = new Error(`Anthropic API error: ${response.status}`);
        
        // Don't retry on certain status codes
        if (response.status === 401 || response.status === 403) {
          throw lastError;
        }
        
        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Análise interrompida por tempo de processamento');
        break; // Don't retry on timeout
      }
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Wait before retry
      if (attempt < maxRetries) {
        console.log(`[Analysis] Retry ${attempt + 1} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  
  throw lastError || new Error('Falha após múltiplas tentativas');
}

/**
 * Fallback: Use Gemini if Anthropic fails
 */
async function analyzeWithGemini(
  prompt: string,
  manifestText: string,
  pdfFiles: FileInfo[],
  metadata: { consignee?: string; container?: string },
  analysisType: string = ''
): Promise<{ text: string; model: string }> {
  console.log(`[Fallback] Using Gemini for analysis`);
  const startTime = Date.now();
  
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) throw new Error('LOVABLE_API_KEY not configured');
  
  // Build content
  const contentParts: any[] = [];
  
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Add shipping data extraction instructions based on analysis type
  fullPrompt += getShippingDataExtractionInstructions(analysisType);
  
  contentParts.push({ type: 'text', text: fullPrompt });
  
  if (manifestText.length > 0) {
    contentParts.push({ type: 'text', text: `\n\n=== MANIFEST DATA ===\n${manifestText}\n=== END MANIFEST ===\n` });
  }
  
  for (const file of pdfFiles) {
    const pdfData = await fetchFileAsBase64(file.file_url);
    if (pdfData && pdfData.size >= 100) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:application/pdf;base64,${pdfData.base64}` }
      });
      contentParts.push({ type: 'text', text: `[Document: ${file.file_name}]` });
    } else {
      console.warn(`  Skipped invalid/empty PDF in Gemini: ${file.file_name}`);
    }
  }
  
  contentParts.push({ type: 'text', text: '\n\nProvide your complete analysis following the specified format.' });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
  
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Fallback] Gemini attempt ${attempt}/${maxRetries}`);
      
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: contentParts }],
          max_tokens: 16000,
          temperature: 0, // Zero for deterministic/consistent output
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[Fallback] Gemini completed in ${elapsed}ms (${text.length} chars)`);
        
        // Log successful API call
        logApiCall('LovableAI', '/v1/chat/completions', 'POST', response.status, elapsed);
        
        return { text, model: 'google/gemini-2.5-flash' };
      } else {
        const errorText = await response.text();
        console.error(`[Fallback] Gemini failed (${response.status}): ${errorText.substring(0, 200)}`);
        
        // Log failed API call
        logApiCall('LovableAI', '/v1/chat/completions', 'POST', response.status, elapsed, errorText.substring(0, 200));
        
        lastError = new Error(`Gemini API error: ${response.status}`);
        
        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Análise interrompida por tempo de processamento');
        break;
      }
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt < maxRetries) {
        console.log(`[Fallback] Retry ${attempt + 1} after error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  
  throw lastError || new Error('Falha após múltiplas tentativas');
}

/**
 * Estimate token count from text (approximately 4 chars per token for Portuguese)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate input size before sending to LLM
 * Returns warning if input is too large for reliable processing
 */
function validateInputSize(
  files: FileInfo[],
  manifestText: string,
  maxInputTokens: number = 150000
): { isValid: boolean; estimatedTokens: number; warning?: string } {
  let totalEstimate = estimateTokenCount(manifestText);
  
  // Estimate PDF size: ~1500 tokens per 50KB
  for (const file of files) {
    const ext = file.file_name.toLowerCase().split('.').pop();
    if (ext === 'pdf') {
      // Conservative estimate for PDF: assume 100KB avg = 3000 tokens
      totalEstimate += 3000;
    }
  }
  
  const isValid = totalEstimate <= maxInputTokens;
  
  return {
    isValid,
    estimatedTokens: totalEstimate,
    warning: !isValid 
      ? `⚠️ Input estimado (${totalEstimate} tokens) excede limite recomendado (${maxInputTokens}). Considere reduzir número de arquivos.`
      : undefined
  };
}

export async function analyzeWithLLM(
  analysisType: string,
  files: FileInfo[],
  metadata: { consignee?: string; container?: string }
): Promise<AnalysisResult> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  
  console.log(`═══ SINGLE-STEP ANALYSIS ═══`);
  console.log(`Analysis type: ${analysisType}, Files: ${files.length}`);
  console.log(`[Input Size] Total files: ${files.length}`);
  
  const basePrompt = getPromptForAnalysisType(analysisType);
  const startTime = Date.now();
  
  // Separate manifest (XLSX/CSV) from PDF files
  const manifestFiles = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop();
    return ['xlsx', 'xls', 'xlsm', 'csv'].includes(ext || '');
  });
  
  const pdfFiles = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop();
    return ext === 'pdf';
  });
  
  console.log(`Manifest files: ${manifestFiles.length}, PDF files: ${pdfFiles.length}`);
  
  // Extract manifest text directly (no LLM pre-processing)
  let manifestText = '';
  let allNCMCodes: string[] = [];
  
  if (manifestFiles.length > 0) {
    for (const manifestFile of manifestFiles) {
      const extracted = await extractTextFromFile(manifestFile);
      if (extracted.text) {
        manifestText += `\n\n--- ${manifestFile.file_name} ---\n${extracted.text}`;
      }
      if (extracted.ncmCodes && extracted.ncmCodes.length > 0) {
        allNCMCodes.push(...extracted.ncmCodes);
        console.log(`[Analysis] NCMs from ${manifestFile.file_name}: ${extracted.ncmCodes.join(', ')}`);
      }
      if (extracted.debugInfo) {
        console.log(`[Analysis] Extraction debug: ${extracted.debugInfo}`);
      }
    }
    console.log(`[Analysis] Manifest text extracted: ${manifestText.length} chars, Total NCMs: ${allNCMCodes.length}`);
  }
  
  // Validate input size after manifest extraction
  const inputValidation = validateInputSize(files, manifestText);
  console.log(`[Input Size] Estimated input tokens: ${inputValidation.estimatedTokens}`);
  console.log(`[Input Size] Max output tokens: 16000`);
  
  if (!inputValidation.isValid) {
    console.warn(`[Input Size] ${inputValidation.warning}`);
  }
  
  // If no manifest but we have PDFs, one might be the base document
  if (!manifestText && pdfFiles.length > 0) {
    const baseFile = pdfFiles.find(f => f.file_type === 'base');
    if (baseFile) {
      manifestText = `[Base document is PDF: ${baseFile.file_name}]`;
    }
  }
  
  // Get comparison PDFs
  const comparisonPdfs = analysisType === 'manifest_hbl' 
    ? pdfFiles.filter(f => f.file_type !== 'base')
    : pdfFiles;
  
  // Single-step analysis
  let result: { text: string; model: string };
  
  if (ANTHROPIC_API_KEY) {
    try {
      result = await analyzeWithAnthropic(
        basePrompt, 
        manifestText, 
        comparisonPdfs.length > 0 ? comparisonPdfs : pdfFiles,
        metadata, 
        ANTHROPIC_API_KEY,
        analysisType
      );
    } catch (error) {
      console.warn(`[Main] Anthropic failed, trying Gemini:`, error);
      result = await analyzeWithGemini(
        basePrompt, 
        manifestText, 
        comparisonPdfs.length > 0 ? comparisonPdfs : pdfFiles,
        metadata,
        analysisType
      );
    }
  } else {
    result = await analyzeWithGemini(
      basePrompt, 
      manifestText, 
      comparisonPdfs.length > 0 ? comparisonPdfs : pdfFiles,
      metadata,
      analysisType
    );
  }
  
  const totalElapsed = Date.now() - startTime;
  console.log(`═══ TOTAL TIME: ${totalElapsed}ms ═══`);
  
  if (result.text.length < 50) {
    throw new Error('AI produced insufficient output');
  }
  
  const jsonResult = {
    timestamp: new Date().toISOString(),
    progress_percent: 100,
    analysis_completed: true,
    status: 'completed',
    model: result.model,
    total_time_ms: totalElapsed
  };
  
  return {
    result_text: result.text,
    json_result: jsonResult,
    model: result.model
  };
}
