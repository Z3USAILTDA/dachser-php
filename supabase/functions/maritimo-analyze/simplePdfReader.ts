/**
 * Advanced PDF text extraction with multiple strategies
 * Maximizes LLM potential by ensuring robust extraction
 * 
 * IMPORTANT: Only Anthropic Claude supports native PDF document processing.
 * Lovable AI/Gemini via OpenAI-compatible API does NOT support PDF as image_url.
 */

export interface PdfReadResult {
  text: string;
  pages: number;
  ocr_attempted: boolean;
  readable: boolean;
  extraction_method?: string;
  chars_extracted?: number;
}

/**
 * Convert ArrayBuffer to base64 in chunks to avoid stack overflow
 */
function arrayBufferToBase64Chunked(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process 8KB at a time
  let result = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(result);
}

/**
 * Strategy 1: Claude Haiku - FAST native PDF processing
 * Haiku is the fastest Anthropic model that supports native PDF documents
 */
async function extractWithHaiku(fileUrl: string, fileName: string, pdfBuffer: ArrayBuffer): Promise<PdfReadResult | null> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.log('[PDF-Haiku] ANTHROPIC_API_KEY not configured');
    return null;
  }

  try {
    console.log(`[PDF-Haiku] Starting fast extraction for ${fileName} (${(pdfBuffer.byteLength / 1024).toFixed(1)} KB)...`);
    
    const base64Pdf = arrayBufferToBase64Chunked(pdfBuffer);

    const extractionPrompt = `Extract ALL visible text from this maritime document. SCAN EVERY PAGE (1 to N).

CRITICAL - NCM/HS CODES EXTRACTION:
- NCM codes may span MULTIPLE PAGES (e.g., starts on page 9, continues on page 10)
- Look for "NCM-CODES:", "NCM CODES:", "HS-CODE:" labels on ANY page
- Look for "Sheet X of Y" or "Continued From Previous Sheet" indicators
- Extract EVERY NCM code from ALL pages - do NOT stop at page breaks
- NCMs are typically 4 or 8 digit numbers like: 8708, 8481, 84812090, 73182900

Include ALL of:
- Company names, addresses
- Shipper, Consignee, Notify Party
- Container numbers (4 letters + 7 digits)
- Vessel, voyage, ports
- Weights, measurements, package counts
- Invoice numbers
- ALL NCM/HS codes from ALL pages
- All dates and reference numbers

Return COMPLETE text extraction from ALL PAGES. Preserve structure.`;

    const startTime = Date.now();
    
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 12000,
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf
                }
              },
              { type: 'text', text: extractionPrompt }
            ]
          }
        ]
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[PDF-Haiku] Failed (${elapsed}ms):`, aiResponse.status, errorText);
      return null;
    }

    const result = await aiResponse.json();
    const extractedText = result.content?.[0]?.text || '';
    
    if (extractedText.length < 100) {
      console.log(`[PDF-Haiku] Insufficient text (${extractedText.length} chars) in ${elapsed}ms`);
      return null;
    }

    console.log(`[PDF-Haiku] ✓ Extracted ${extractedText.length} chars in ${elapsed}ms`);
    
    return {
      text: extractedText,
      pages: 1,
      ocr_attempted: true,
      readable: true,
      extraction_method: 'Claude-Haiku-Fast',
      chars_extracted: extractedText.length
    };
  } catch (error) {
    console.error('[PDF-Haiku] Error:', error);
    return null;
  }
}

/**
 * Strategy 2: Claude Sonnet - High quality fallback for complex PDFs
 */
async function extractWithSonnet(fileUrl: string, fileName: string, pdfBuffer: ArrayBuffer): Promise<PdfReadResult | null> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) return null;

  try {
    console.log(`[PDF-Sonnet] High-quality extraction for ${fileName}...`);
    
    const base64Pdf = arrayBufferToBase64Chunked(pdfBuffer);

    const extractionPrompt = `Extract ALL text content from this maritime shipping document (Bill of Lading, Manifest, Invoice, etc.).
SCAN EVERY PAGE from first to last.

╔══════════════════════════════════════════════════════════════════════════════╗
║ CRITICAL: NCM/HS CODES EXTRACTION - READ ALL PAGES                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

NCM codes are OFTEN SPLIT ACROSS MULTIPLE PAGES. You MUST:
1. Look for "NCM-CODES:", "NCM CODES:", "HS-CODE:" on ANY page
2. Look for "Sheet X of Y" - if Y > 1, check ALL sheets
3. Look for "Continued From Previous Sheet" indicators
4. Extract NCMs from EVERY page where they appear

EXAMPLE from real document:
- Page 9: NCM-CODES: 8708, 8481, 8421, 8543, 4016, 8531, 3917 (Sheet 9 of 10)
- Page 10: 7412, 9032, 3926, 7419, 8536, 8414, 8483... (Sheet 10 of 10)
- COMPLETE LIST: [8708, 8481, 8421, 8543, 4016, 8531, 3917, 7412, 9032, 3926, ...]

Extract EVERY piece of visible text including:
- Company names, addresses, contact information
- Shipper, Consignee, Notify Party details
- Container numbers (format: 4 letters + 7 digits)
- Vessel name and voyage number
- Port of Loading, Port of Discharge, Place of Delivery
- Seal numbers
- Package counts, descriptions of goods
- Gross weight, net weight, measurements (CBM/volume)
- Freight terms and charges
- Invoice numbers, reference numbers, PO numbers
- NCM/HS codes (4-digit AND 8-digit codes from ALL pages)
- Dates: Shipped on Board, Date of Issue, ETD, ETA
- Bill of Lading numbers (HBL, MBL, Master BL)
- Marks and numbers
- Any tables, lists, or structured data
- Footer information, page numbers, document identifiers

Preserve the document structure and layout. Return COMPLETE, THOROUGH text extraction - do not summarize or skip any page.`;

    const startTime = Date.now();

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf
                }
              },
              { type: 'text', text: extractionPrompt }
            ]
          }
        ]
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[PDF-Sonnet] Failed (${elapsed}ms):`, aiResponse.status, errorText);
      return null;
    }

    const result = await aiResponse.json();
    const extractedText = result.content?.[0]?.text || '';
    
    if (extractedText.length < 100) {
      console.log(`[PDF-Sonnet] Insufficient text in ${elapsed}ms`);
      return null;
    }

    console.log(`[PDF-Sonnet] ✓ Extracted ${extractedText.length} chars in ${elapsed}ms`);
    
    return {
      text: extractedText,
      pages: 1,
      ocr_attempted: true,
      readable: true,
      extraction_method: 'Claude-Sonnet-Quality',
      chars_extracted: extractedText.length
    };
  } catch (error) {
    console.error('[PDF-Sonnet] Error:', error);
    return null;
  }
}

/**
 * Main extraction function - Haiku first (fast), Sonnet fallback (quality)
 */
export async function extractPdfText(fileUrl: string, fileName: string): Promise<PdfReadResult> {
  console.log(`[PDF] 🚀 Starting extraction for: ${fileName}`);
  
  try {
    // Fetch PDF file once
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    const contentLength = pdfBuffer.byteLength;
    
    console.log(`[PDF] File size: ${(contentLength / 1024).toFixed(2)} KB`);

    // Strategy 1: Claude Haiku FIRST (fastest, supports native PDF)
    const haikuResult = await extractWithHaiku(fileUrl, fileName, pdfBuffer);
    if (haikuResult && haikuResult.readable && haikuResult.chars_extracted! > 200) {
      console.log(`[PDF] ✓ Fast extraction complete: ${haikuResult.extraction_method}`);
      return haikuResult;
    }

    // Strategy 2: Claude Sonnet (higher quality for difficult PDFs)
    console.log('[PDF] Haiku insufficient, trying Sonnet...');
    const sonnetResult = await extractWithSonnet(fileUrl, fileName, pdfBuffer);
    if (sonnetResult && sonnetResult.readable && sonnetResult.chars_extracted! > 200) {
      console.log(`[PDF] ✓ Quality extraction complete: ${sonnetResult.extraction_method}`);
      return sonnetResult;
    }

    // All strategies failed
    console.error('[PDF] ❌ All extraction strategies failed');
    return {
      text: `[PDF FILE: ${fileName}]\n\nExtraction failed after trying multiple strategies.\nFile size: ${(contentLength / 1024).toFixed(2)} KB\n\nThe document may be:\n- Heavily encrypted or protected\n- Corrupted or malformed\n- Using unsupported encoding\n\nPlease provide a different version of this file or verify its integrity.`,
      pages: 0,
      ocr_attempted: true,
      readable: false,
      extraction_method: 'FAILED',
      chars_extracted: 0
    };
    
  } catch (error) {
    console.error(`[PDF] ❌ Critical error for ${fileName}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      text: `[PDF FILE: ${fileName}]\n\nCritical error during extraction: ${errorMessage}\n\nThis may indicate:\n- Network connectivity issues\n- File access problems\n- System resource limitations\n\nPlease retry or contact support if the issue persists.`,
      pages: 0,
      ocr_attempted: false,
      readable: false,
      extraction_method: 'ERROR',
      chars_extracted: 0
    };
  }
}
