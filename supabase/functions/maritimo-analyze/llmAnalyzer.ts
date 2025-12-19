/**
 * LLM analyzer - SINGLE STEP for maritime analysis
 * Sends raw manifest text + PDFs directly to Claude for analysis
 * Optimized to avoid CPU timeout on edge functions
 */

import { getPromptForAnalysisType } from './prompts.ts';
import { extractXlsxText } from './simpleXlsxReader.ts';

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
async function extractTextFromFile(file: FileInfo): Promise<string> {
  const extension = file.file_name.toLowerCase().split('.').pop();
  
  if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') {
    const result = await extractXlsxText(file.file_url, file.file_name);
    return result.text;
  } else if (extension === 'csv') {
    const response = await fetch(file.file_url);
    return await response.text();
  }
  
  return '';
}

/**
 * Single-step analysis with Anthropic Claude (native PDF support)
 */
async function analyzeWithAnthropic(
  prompt: string,
  manifestText: string,
  pdfFiles: FileInfo[],
  metadata: { consignee?: string; container?: string },
  apiKey: string
): Promise<{ text: string; model: string }> {
  console.log(`[Analysis] Starting Anthropic analysis with ${pdfFiles.length} PDFs`);
  const startTime = Date.now();
  
  // Build content array
  const contentParts: any[] = [];
  
  // Add prompt with metadata
  let fullPrompt = prompt;
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
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
          max_tokens: 8000,
          temperature: 0.1,
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
        return { text, model: 'claude-sonnet-4-20250514' };
      } else {
        const errorText = await response.text();
        console.error(`[Analysis] Anthropic failed (${response.status}): ${errorText.substring(0, 300)}`);
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
  metadata: { consignee?: string; container?: string }
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
          max_tokens: 8000,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        console.log(`[Fallback] Gemini completed in ${elapsed}ms (${text.length} chars)`);
        return { text, model: 'google/gemini-2.5-flash' };
      } else {
        const errorText = await response.text();
        console.error(`[Fallback] Gemini failed (${response.status}): ${errorText.substring(0, 200)}`);
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

export async function analyzeWithLLM(
  analysisType: string,
  files: FileInfo[],
  metadata: { consignee?: string; container?: string }
): Promise<AnalysisResult> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  
  console.log(`═══ SINGLE-STEP ANALYSIS ═══`);
  console.log(`Analysis type: ${analysisType}, Files: ${files.length}`);
  
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
  if (manifestFiles.length > 0) {
    for (const manifestFile of manifestFiles) {
      const rawText = await extractTextFromFile(manifestFile);
      if (rawText) {
        manifestText += `\n\n--- ${manifestFile.file_name} ---\n${rawText}`;
      }
    }
    console.log(`Manifest text extracted: ${manifestText.length} chars`);
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
        ANTHROPIC_API_KEY
      );
    } catch (error) {
      console.warn(`[Main] Anthropic failed, trying Gemini:`, error);
      result = await analyzeWithGemini(
        basePrompt, 
        manifestText, 
        comparisonPdfs.length > 0 ? comparisonPdfs : pdfFiles,
        metadata
      );
    }
  } else {
    result = await analyzeWithGemini(
      basePrompt, 
      manifestText, 
      comparisonPdfs.length > 0 ? comparisonPdfs : pdfFiles,
      metadata
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
