/**
 * pdfExtractor.ts — LLM-based PDF extraction returning structured JSON per document.
 * Each PDF is sent individually with a focused extraction-only prompt (no comparison).
 */

// ============ TYPES ============

export interface PdfExporterData {
  name: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  cbm: number;
  packages_qty: number;
  packages_type: string;
  ncm_codes: string[];
  invoice_ref: string;
}

export interface PdfExtractedData {
  document_type: string; // "hbl", "mbl", "invoice"
  bl_number: string;
  shipper: string;
  consignee: string;
  notify_party: string;
  vessel: string;
  voyage: string;
  port_of_loading: string;
  port_of_discharge: string;
  container: string;
  seal: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  cbm: number;
  packages: { qty: number; type: string };
  ncm_codes: string[];
  invoice_numbers: string[];
  exporters: PdfExporterData[];
  // For invoice documents
  invoice_items?: InvoiceItem[];
  raw_extraction: boolean; // true if extraction succeeded
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  ncm_code: string;
}

// ============ EXTRACTION PROMPT ============

const EXTRACTION_PROMPT = `You are a document data extractor. Extract ALL data from this document and return ONLY a valid JSON object. No explanations, no markdown, no text before or after the JSON.

CRITICAL RULES:
1. Return ONLY a JSON object — nothing else
2. Extract EXACT values as they appear (do not round, truncate, or modify)
3. For weight: parse European format (1.980,000 → 1980.0) and US format correctly
4. For NCM codes: extract ONLY from "NCM:", "NCM-CODES:", "NCM CODE:" labels. NEVER from "HS:", "HS Code:" labels
5. Scan ALL pages of the document
6. If a field cannot be found, use empty string "" for text or 0 for numbers
7. For seal numbers, container numbers, and reference numbers: extract the EXACT character sequence as printed. NEVER add, remove, or modify any digit — even zeros. "200030614" (9 digits) is DIFFERENT from "2000030614" (10 digits).

Return this exact JSON structure:
{
  "document_type": "hbl" or "mbl" or "invoice",
  "bl_number": "string",
  "shipper": "string (full company name)",
  "consignee": "string (full company name)",
  "notify_party": "string",
  "vessel": "string (vessel name only, before /)",
  "voyage": "string (voyage code only, after /)",
  "port_of_loading": "string",
  "port_of_discharge": "string",
  "container": "string (ISO 6346: 4 letters + 7 digits)",
  "seal": "string",
  "gross_weight_kg": number,
  "net_weight_kg": number,
  "cbm": number,
  "packages": { "qty": number, "type": "string" },
  "ncm_codes": ["string array of ALL unique NCM codes found"],
  "invoice_numbers": ["string array of ALL invoice/reference numbers"],
  "exporters": [
    {
      "name": "SUPPLIER NAME",
      "gross_weight_kg": number,
      "net_weight_kg": number,
      "cbm": number,
      "packages_qty": number,
      "packages_type": "string",
      "ncm_codes": ["string array"],
      "invoice_ref": "string"
    }
  ]
}

WEIGHT EXTRACTION PRIORITY:
1. "TOTAL GROSS WEIGHT" or "GROSS WEIGHT TOTAL" at bottom
2. "GROSS WEIGHT" column total
3. Near container/seal info: "GW: X KGS"
4. "SAID TO WEIGH" value

NCM EXTRACTION:
- From "NCM-CODES:" section (often multi-page, check ALL pages)
- From cargo descriptions labeled "NCM:"
- NEVER from "HS:", "HS-CODE:" labels
- Preserve exact digit count (4-digit: "8481", 8-digit: "84812090")

CONTAINER NUMBER:
- Format: 4 uppercase letters + 7 digits (e.g., GLDU9941805)
- Found in "Marks and Numbers", "Container No.", or header

SEAL NUMBER EXTRACTION (CRITICAL - EXACT DIGITS):
- Extract the seal number EXACTLY as printed in the document
- DO NOT modify, correct, or "fix" any digits
- Every zero matters: "200030614" is DIFFERENT from "2000030614"
- Copy the exact sequence of characters — do not add or remove any digit
- If unclear, prefer the value closest to what is visually printed
- NEVER cross-reference with other documents — extract ONLY what THIS document shows

EXPORTERS:
- Each unique shipper/supplier = one exporter entry
- If single shipper, put all data in one exporter entry
- Sum weights/CBM per exporter from their cargo lines`;

// ============ JSON REPAIR ============

function repairJson(text: string): any | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try extracting JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch { /* continue */ }
  }

  // Try finding the first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonStr = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch { /* continue */ }

    // Try fixing common issues: trailing commas, single quotes
    const cleaned = jsonStr
      .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
      .replace(/'/g, '"') // Single to double quotes
      .replace(/(\w+):/g, '"$1":') // Unquoted keys
      .replace(/""+/g, '"'); // Double double-quotes
    try {
      return JSON.parse(cleaned);
    } catch { /* continue */ }
  }

  return null;
}

// ============ LLM CALLERS ============

async function callClaude(prompt: string, pdfBase64: string, fileName: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: `[File: ${fileName}]` },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Claude extraction error: ${response.status} - ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(prompt: string, pdfBase64: string, fileName: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: `${prompt}\n\n[File: ${fileName}]` },
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 8000 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Gemini extraction error: ${response.status} - ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============ MAIN EXTRACTOR ============

function buildEmptyExtraction(): PdfExtractedData {
  return {
    document_type: '',
    bl_number: '',
    shipper: '',
    consignee: '',
    notify_party: '',
    vessel: '',
    voyage: '',
    port_of_loading: '',
    port_of_discharge: '',
    container: '',
    seal: '',
    gross_weight_kg: 0,
    net_weight_kg: 0,
    cbm: 0,
    packages: { qty: 0, type: '' },
    ncm_codes: [],
    invoice_numbers: [],
    exporters: [],
    raw_extraction: false,
  };
}

function parseExtraction(raw: any): PdfExtractedData {
  if (!raw || typeof raw !== 'object') return buildEmptyExtraction();

  return {
    document_type: String(raw.document_type || '').toLowerCase(),
    bl_number: String(raw.bl_number || ''),
    shipper: String(raw.shipper || ''),
    consignee: String(raw.consignee || ''),
    notify_party: String(raw.notify_party || ''),
    vessel: String(raw.vessel || ''),
    voyage: String(raw.voyage || ''),
    port_of_loading: String(raw.port_of_loading || ''),
    port_of_discharge: String(raw.port_of_discharge || ''),
    container: String(raw.container || ''),
    seal: String(raw.seal || ''),
    gross_weight_kg: Number(raw.gross_weight_kg) || 0,
    net_weight_kg: Number(raw.net_weight_kg) || 0,
    cbm: Number(raw.cbm) || 0,
    packages: {
      qty: Number(raw.packages?.qty) || 0,
      type: String(raw.packages?.type || ''),
    },
    ncm_codes: Array.isArray(raw.ncm_codes)
      ? raw.ncm_codes.map((c: any) => String(c).replace(/[\.\-\s]/g, '').trim()).filter((c: string) => /^\d{4,10}$/.test(c))
      : [],
    invoice_numbers: Array.isArray(raw.invoice_numbers) ? raw.invoice_numbers.map((n: any) => String(n)) : [],
    exporters: Array.isArray(raw.exporters) ? raw.exporters.map((e: any) => ({
      name: String(e.name || ''),
      gross_weight_kg: Number(e.gross_weight_kg) || 0,
      net_weight_kg: Number(e.net_weight_kg) || 0,
      cbm: Number(e.cbm) || 0,
      packages_qty: Number(e.packages_qty) || 0,
      packages_type: String(e.packages_type || ''),
      ncm_codes: Array.isArray(e.ncm_codes) ? e.ncm_codes.map((c: any) => String(c).replace(/[\.\-\s]/g, '').trim()).filter((c: string) => /^\d{4,10}$/.test(c)) : [],
      invoice_ref: String(e.invoice_ref || ''),
    })) : [],
    raw_extraction: true,
  };
}

/**
 * Extract structured data from a single PDF document.
 * Uses Claude as primary, Gemini as fallback. Retries with JSON repair.
 */
export async function extractPdfStructured(
  pdfBase64: string,
  fileName: string,
  fileType: string,
): Promise<PdfExtractedData> {
  const startTime = Date.now();
  console.log(`📄 [PDF Extractor] Extracting: ${fileName} (type: ${fileType})`);

  const prompt = `${EXTRACTION_PROMPT}\n\nThis document is a ${fileType.toUpperCase()} (${fileType === 'hbl' || fileType === 'base' ? 'House Bill of Lading' : fileType === 'mbl' ? 'Master Bill of Lading' : 'Commercial Invoice'}).`;

  // Try Gemini first (cost-effective), then Claude fallback
  for (const provider of ['gemini', 'claude'] as const) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`📄 [PDF Extractor] ${provider} attempt ${attempt + 1} for ${fileName}`);
        const rawText = provider === 'claude'
          ? await callClaude(prompt, pdfBase64, fileName)
          : await callGemini(prompt, pdfBase64, fileName);

        if (!rawText || rawText.length < 10) {
          console.warn(`⚠️ [PDF Extractor] Empty response from ${provider} for ${fileName}`);
          continue;
        }

        const parsed = repairJson(rawText);
        if (parsed) {
          const result = parseExtraction(parsed);
          const elapsed = Date.now() - startTime;
          console.log(`✅ [PDF Extractor] ${fileName}: ${result.exporters.length} exporters, ${result.ncm_codes.length} NCMs, weight=${result.gross_weight_kg}kg in ${elapsed}ms (${provider})`);
          return result;
        }

        console.warn(`⚠️ [PDF Extractor] JSON parse failed for ${fileName} (${provider}, attempt ${attempt + 1}), raw: ${rawText.substring(0, 200)}`);
      } catch (err) {
        console.error(`❌ [PDF Extractor] ${provider} error for ${fileName}:`, err);
        if (provider === 'claude') break; // Move to Gemini fallback
      }
    }
  }

  console.error(`❌ [PDF Extractor] All attempts failed for ${fileName}`);
  return buildEmptyExtraction();
}
