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

// ============ SHIPPING DATA EXTRACTION HELPER ============

function getShippingDataExtractionInstructions(analysisType: string): string {
  if (analysisType === 'invoices_hbl') {
    // For Invoices × HBL: extract from HBL OR Invoice (fallback)
    return `

███████████████████████████████████████████████████████████████████████████████
███ MANDATORY: SHIPPING DATA EXTRACTION (HBL OR INVOICE)                      ███
███████████████████████████████████████████████████████████████████████████████

At the VERY END of your analysis, after all discrepancy analysis is complete, you MUST output a JSON block with shipping data.

EXTRACTION PRIORITY (use first available source):
1. PRIMARY SOURCE: Draft HBL document
2. FALLBACK SOURCE: Commercial Invoice(s) — if HBL field is missing/unreadable

DATA EXTRACTION RULES:

CONTAINER NUMBER:
- PRIMARY: From HBL "Marks and Numbers" or "Container No." field
- FALLBACK: From Invoice header, shipping details, or container reference
- Format: 4 letters + 7 digits (ISO 6346), e.g., "GLDU9941805"

CONSIGNEE:
- PRIMARY: From HBL "Consignee" field (full company name)
- FALLBACK: From Invoice "Buyer", "Ship To", "Consignee", or "Customer" field
- Extract: Full company name without address

VESSEL NAME:
- PRIMARY: From HBL "Vessel / Voyage-No." field, BEFORE the "/"
- FALLBACK: From Invoice shipping details if stated
- Example: "MAERSK LETICIA" from "MAERSK LETICIA / 0EWMHS1MA"

VOYAGE NUMBER:
- PRIMARY: From HBL "Vessel / Voyage-No." field, AFTER the "/"
- FALLBACK: From Invoice shipping details if stated
- Example: "0EWMHS1MA" from "MAERSK LETICIA / 0EWMHS1MA"

PORT OF LOADING (ORIGEM):
- PRIMARY: From HBL "Port of Loading" field
- FALLBACK: From Invoice "Ship From", "Origin", or shipper address country/port

PORT OF DISCHARGE (DESTINO):
- PRIMARY: From HBL "Port of Discharge" field
- FALLBACK: From Invoice "Ship To", "Destination", or consignee address country/port

OUTPUT FORMAT (MANDATORY - ADD THIS BLOCK AT THE END):
\`\`\`json
{"hbl_shipping_data": {"container": "XXXX1234567", "consignee": "COMPANY NAME", "vessel": "VESSEL NAME", "voyage": "VOYAGE_CODE", "origem": "PORT_OF_LOADING", "destino": "PORT_OF_DISCHARGE"}}
\`\`\`

RULES:
- Always try HBL first, then Invoice as fallback
- If multiple HBLs: use data from the FIRST HBL file
- If multiple Invoices: use data from the Invoice with most complete shipping info
- If any field cannot be extracted from ANY source, use empty string ""
- Always output this JSON block, even if analysis has errors
- The JSON must be on a single line between the \`\`\`json and \`\`\` markers
- Include "consignee" field in the JSON output
`;
  } else {
    // For other analysis types: extract from HBL only
    return `

███████████████████████████████████████████████████████████████████████████████
███ MANDATORY: HBL SHIPPING DATA EXTRACTION                                  ███
███████████████████████████████████████████████████████████████████████████████

At the VERY END of your analysis, after all discrepancy analysis is complete, you MUST output a JSON block with the following shipping data extracted from the HBL document(s):

EXTRACTION SOURCES FROM HBL:
- container: Extract from "Marks and Numbers" section (e.g., "GLDU9941805" from "GLDU9941805 / 40' HC/HIGH CUBE")
- consignee: Extract from "Consignee" field (full company name, no address)
- vessel: Extract from "Vessel / Voyage-No." field, BEFORE the "/" (e.g., "MAERSK LETICIA" from "MAERSK LETICIA / 0EWMHS1MA")
- voyage: Extract from "Vessel / Voyage-No." field, AFTER the "/" (e.g., "0EWMHS1MA" from "MAERSK LETICIA / 0EWMHS1MA")
- origem: Extract from "Port of Loading" field (e.g., "HAMBURG")
- destino: Extract from "Port of Discharge" field (e.g., "SANTOS")

OUTPUT FORMAT (MANDATORY - ADD THIS BLOCK AT THE END):
\`\`\`json
{"hbl_shipping_data": {"container": "XXXX1234567", "consignee": "COMPANY NAME", "vessel": "VESSEL NAME", "voyage": "VOYAGE_CODE", "origem": "PORT_OF_LOADING", "destino": "PORT_OF_DISCHARGE"}}
\`\`\`

RULES:
- If multiple HBLs are analyzed, use data from the FIRST HBL file
- Container format: 4 letters + 7 digits (ISO 6346), e.g., "GLDU9941805"
- If any field cannot be extracted, use empty string ""
- Always output this JSON block, even if analysis has errors
- The JSON must be on a single line between the \`\`\`json and \`\`\` markers
`;
  }
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
    
    // Read workbook with NO ROW LIMITS - capture ALL manifest data
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      // NO sheetRows limit - read ALL rows with data
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
        
        // NO LINE LIMIT - process ALL lines with data
        const linesToProcess = lines; // Process ALL lines, no slicing
        
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

// ============ APPROVED EXAMPLES FETCHER ============

async function getApprovedExamples(analysisType: string, hblCount: number): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('⚠️ Missing Supabase credentials for approved examples');
      return '';
    }
    
    console.log(`📚 Fetching approved examples for ${analysisType} with ${hblCount} HBLs`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        action: 'get_approved_examples',
        analysisType,
        hblCount,
        limit: 2 // Get up to 2 relevant examples
      })
    });
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch approved examples: ${response.status}`);
      return '';
    }
    
    const data = await response.json();
    const examples = data?.examples || [];
    
    if (examples.length === 0) {
      console.log('📚 No approved examples found');
      return '';
    }
    
    console.log(`📚 Found ${examples.length} approved examples`);
    
    // Format examples for the prompt - CRITICAL: Examples are for TONE ONLY, not structure
    let examplesText = `

████████████████████████████████████████████████████████████████████████████████
██ CRITICAL WARNING: OUTPUT FORMAT INSTRUCTIONS ABOVE ARE MANDATORY            ██
██ The examples below may use an OUTDATED format - DO NOT copy their structure ██
██ Follow ONLY the MANDATORY OUTPUT STRUCTURE defined in the prompt above      ██
████████████████████████████████████████████████████████████████████████████████

The following are previously approved analyses provided for TONE and TERMINOLOGY reference ONLY.

IMPORTANT:
- Use these examples for TONE, LANGUAGE, and TERMINOLOGY only
- DO NOT copy the output structure from these examples
- The format in these examples may be OUTDATED and no longer valid
- You MUST follow the MANDATORY OUTPUT STRUCTURE defined above

`;
    
    examples.forEach((ex: any, idx: number) => {
      const scenarioDesc = ex.scenario_type?.replace(/_/g, ' ').toUpperCase() || 'GENERAL';
      examplesText += `
─── EXAMPLE ${idx + 1} (Scenario: ${scenarioDesc}) - FOR TONE REFERENCE ONLY ───
${ex.result_text?.substring(0, 2000) || ''}
${ex.result_text?.length > 2000 ? '\n[... truncated ...]' : ''}
`;
    });
    
    examplesText += `
████████████████████████████████████████████████████████████████████████████████
REMINDER: The examples above are for TONE ONLY.
Your output MUST follow the MANDATORY OUTPUT STRUCTURE from the main prompt.
████████████████████████████████████████████████████████████████████████████████

`;
    
    return examplesText;
  } catch (e) {
    console.error('Error fetching approved examples:', e);
    return '';
  }
}

// ============ ANTHROPIC CLAUDE - ANALYSIS ============

async function analyzeWithAnthropic(
  prompt: string, 
  manifestText: string,
  pdfFiles: Array<{ base64: string; name: string; file_type?: string }>,
  metadata: { consignee?: string; container?: string },
  approvedExamplesText: string = '',
  analysisType: string = ''
): Promise<{ text: string; model: string }> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
  
  let fullPrompt = prompt;
  
  // TEMPORARILY DISABLED: Approved examples may be causing model to stop early
  // Inject approved examples right after the base prompt
  // if (approvedExamplesText) {
  //   fullPrompt += approvedExamplesText;
  // }
  console.log(`⚠️ Approved examples DISABLED to test full exporter output`);
  
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  // Add extracted manifest text
  if (manifestText && manifestText.length > 0) {
    fullPrompt += `\n\n=== CONTEÚDO DO MANIFESTO (extraído do arquivo XLSX) ===\n${manifestText}\n=== FIM DO MANIFESTO ===`;
  }
  
  // Add shipping data extraction instructions based on analysis type
  fullPrompt += getShippingDataExtractionInstructions(analysisType);
  
  // Build content parts: prompt + PDF documents
  const contentParts: any[] = [
    { type: 'text', text: fullPrompt }
  ];
  
  // Add PDFs as base64 documents (Claude supports PDF natively)
  // CRITICAL: Identify each document explicitly for HBL vs MBL analysis
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    
    // Determine document type based on file_type passed from analysis
    let docLabel = `Document ${i + 1}`;
    if (file.file_type === 'base') {
      docLabel = '★★★ THIS IS THE HBL (House Bill of Lading) - Extract NCM codes FROM THIS DOCUMENT for "HBL NCMs" ★★★';
    } else if (file.file_type === 'mbl') {
      docLabel = '★★★ THIS IS THE MBL (Master Bill of Lading) - Extract NCM codes FROM THIS DOCUMENT for "MBL NCMs" ★★★';
    } else if (file.file_type === 'hbl') {
      docLabel = '★★★ THIS IS THE HBL (House Bill of Lading) ★★★';
    }
    
    contentParts.push({ 
      type: 'document', 
      source: { 
        type: 'base64', 
        media_type: 'application/pdf', 
        data: file.base64 
      } 
    });
    contentParts.push({ type: 'text', text: `[${docLabel}]\n[Arquivo PDF: ${file.name}]` });
  }
  
  console.log(`🤖 Calling Anthropic Claude with ${pdfFiles.length} PDFs + manifest text (${manifestText.length} chars) + examples (${approvedExamplesText.length} chars)`);
  
  // Add system instruction to ensure complete response WITH MANDATORY FORMAT
  const systemPrompt = `You are CRONOS, a thorough logistics document auditor specialized in maritime Bills of Lading.

██████████████████████████████████████████████████████████████████████████████████████
██ NCM CODES - CRITICAL EXTRACTION FROM ALL DOCUMENTS (PDF/XLSX)                     ██
██████████████████████████████████████████████████████████████████████████████████████

★★★ NCM/HS CODE EXTRACTION - SCAN ALL PAGES ★★★

1. FOR MANIFEST × HBL ANALYSIS:
   - MANIFEST: Extract ALL NCM/HS Code values from the XLSX file
   - HBL: Extract ALL NCM/HS Code values from the PDF document
   
2. FOR HBL × MBL ANALYSIS:
   - HBL: Extract ALL NCM/HS Code values from the HBL PDF document
   - MBL: Extract ALL NCM/HS Code values from the MBL PDF document
   - CRITICAL: Both HBL and MBL are PDFs - scan ALL PAGES (not just page 1)
   - NCM codes are often on LATER PAGES (page 4, 5, 6 in "Rider" or "Continuation" sections)
   - Look for "NCM-CODES:" section label followed by a vertical list of codes
   - Look for "HS-CODE:" labels in cargo descriptions
   - Look for semicolon-separated 8-digit codes (e.g., "74152900; 84819090")

3. EXTRACTION RULES:
   - Include ALL columns that contain NCM or HS codes
   - Keep the EXACT values as they appear (4-digit: 8481, 8-digit: 84819090)
   - DO NOT truncate or modify code lengths
   - Extract codes of ANY length exactly as written

4. COMPARISON:
   - Show both lists side by side
   - If the lists are IDENTICAL = MATCH
   - If there is ANY difference = UPDATE REQUIRED
   - List what is different (missing in one, extra in another)

5. OUTPUT FORMAT FOR NCM SECTION (MANDATORY):
NCM CODES
- HBL NCMs: [comma-separated list of ALL unique codes from HBL]
- MBL NCMs: [comma-separated list of ALL unique codes from MBL] (for HBL×MBL)
- Manifest NCMs: [comma-separated list of ALL unique codes] (for Manifest×HBL)
- Missing in MBL/HBL: [codes that appear in one but not the other, or "none"]
- Extra in MBL/HBL: [codes that appear in one but not the other, or "none"]
- Status: MATCH or UPDATE REQUIRED

EXAMPLE FOR HBL × MBL:
NCM CODES
- HBL NCMs: 8481, 8483, 8414, 8708, 3926, 7318, 8526, 8543, 8536, 8421, 7419, 9026, 9032, 3917, 7412, 7326, 8412, 8544, 7320, 74152900, 84819090, 84818092, 85443000
- MBL NCMs: 8481, 8483, 8414, 8708, 3926, 7318, 8526, 8421, 7419, 9026, 9032, 3917, 7412, 7326, 8412, 7320
- Missing in MBL: 8543, 8536, 8544, 74152900, 84819090, 84818092, 85443000
- Extra in MBL: none
- Status: UPDATE REQUIRED

██████████████████████████████████████████████████████████████████████████████████████
██ ABSOLUTE REQUIREMENT #1: COMPLETE PER-EXPORTER ANALYSIS                          ██
██████████████████████████████████████████████████████████████████████████████████████

BEFORE STARTING YOUR ANALYSIS:
1. Scan the Manifest XLSX file and COUNT how many unique "Supplier Name" values exist
2. This count = the EXACT number of EXPORTER sections you MUST produce
3. Log internally: "Found N unique suppliers/exporters"

FOR EACH OF THE N EXPORTERS, YOU MUST OUTPUT A COMPLETE SECTION:

EXPORTER #1: <COMPANY_NAME>
- CNPJ: Manifest: <value> | HBL: <value> | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>
- Seal: Manifest: <value> | HBL: <value> | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>

Item 1: <DESCRIPTION>
- Gross Weight: Manifest: X kg | HBL: Y kg | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>
- CBM: Manifest: X m³ | HBL: Y m³ | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>
- Volume Qty: Manifest: N | HBL: N | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>
- Volume Type: Manifest: TYPE | HBL: TYPE | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>
- Invoice Ref: Manifest: REF | HBL: REF | Status: <MATCH|UPDATE REQUIRED|NOT FOUND>

Subtotals EXPORTER #1:
- Total Weight: Manifest: X kg | HBL: Y kg | Delta: Z kg
- Total CBM: Manifest: X m³ | HBL: Y m³ | Delta: Z m³
- Total Volumes: Manifest: N | HBL: N | Delta: N

EXPORTER #2: ... (REPEAT FULL STRUCTURE)
EXPORTER #3: ... (REPEAT FULL STRUCTURE)
...until...
EXPORTER #N: ... (LAST ONE - STILL COMPLETE)

██████████████████████████████████████████████████████████████████████████████████████
██ ABSOLUTE REQUIREMENT #2: NEVER USE SUMMARIZED/GROUPED OUTPUT                     ██
██████████████████████████████████████████████████████████████████████████████████████

THE FOLLOWING OUTPUT PATTERNS ARE FORBIDDEN:
❌ "Exporter (from HBL): Multiple suppliers identified"
❌ "Involved supplier(s) in Manifest: [list]"
❌ "[Same structure for other exporters]"
❌ "[Continuing with remaining exporters...]"
❌ Any form of grouping or summarizing multiple exporters

CORRECT: Show EXPORTER #1, EXPORTER #2, EXPORTER #3... separately with FULL details each.

██████████████████████████████████████████████████████████████████████████████████████
██ ABSOLUTE REQUIREMENT #3: ANALYSIS SUMMARY MUST BE AT THE END                     ██
██████████████████████████████████████████████████████████████████████████████████████

AFTER all exporter sections, include:

CONTAINER TOTALS:
- Total Gross Weight: Manifest: X kg | HBL(s): Y kg | Status: <MATCH|UPDATE REQUIRED>
- Total CBM: Manifest: X m³ | HBL(s): Y m³ | Status: <MATCH|UPDATE REQUIRED>
- Total Volumes: Manifest: N | HBL(s): N | Status: <MATCH|UPDATE REQUIRED>

ANALYSIS SUMMARY:
- Total exporters identified: <N> (MUST EQUAL the count from step 1)
- Total items analyzed: <count>
- Fields with discrepancies: <count>

If your "Total exporters identified" is LESS than the actual count in the manifest, YOUR ANALYSIS IS INCOMPLETE AND INVALID.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 64000,
      temperature: 0,
      system: systemPrompt,
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
  
  // DETAILED LOGGING FOR DEBUGGING
  console.log(`========== ANTHROPIC RESPONSE DEBUG ==========`);
  console.log(`📊 Response length: ${resultText.length} chars`);
  console.log(`🛑 Stop reason: ${data.stop_reason}`);
  console.log(`📈 Usage - Input tokens: ${data.usage?.input_tokens}, Output tokens: ${data.usage?.output_tokens}`);
  
  // Count exporters in the result
  const exporterMatches = resultText.match(/EXPORTER\s*\d+|Exporter\s*\d+|### EXPORTER|##\s*\d+\./gi) || [];
  console.log(`👥 Exporters found in output: ${exporterMatches.length}`);
  
  // Check if response was truncated
  if (data.stop_reason === 'max_tokens') {
    console.error(`⚠️ RESPONSE WAS TRUNCATED DUE TO MAX_TOKENS!`);
  } else if (data.stop_reason === 'end_turn') {
    console.log(`✅ Model finished naturally (end_turn)`);
  }
  
  // Log first and last 500 chars to see structure
  console.log(`📝 First 500 chars: ${resultText.substring(0, 500)}`);
  console.log(`📝 Last 500 chars: ${resultText.substring(resultText.length - 500)}`);
  console.log(`==============================================`);
  
  return { text: resultText, model: 'claude-sonnet-4-5' };
}

// ============ STEP 3: GEMINI PRO - FALLBACK ANALYSIS ============

async function analyzeWithGeminiPro(
  prompt: string, 
  manifestText: string,
  pdfFiles: Array<{ base64: string; name: string; file_type?: string }>,
  metadata: { consignee?: string; container?: string },
  approvedExamplesText: string = '',
  analysisType: string = ''
): Promise<{ text: string; model: string }> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured');
  
  let fullPrompt = prompt;
  
  if (approvedExamplesText) {
    fullPrompt += approvedExamplesText;
  }
  
  if (metadata.consignee) fullPrompt += `\n\nConsignee: ${metadata.consignee}`;
  if (metadata.container) fullPrompt += `\nContainer: ${metadata.container}`;
  
  if (manifestText && manifestText.length > 0) {
    fullPrompt += `\n\n=== CONTEÚDO DO MANIFESTO (extraído do arquivo XLSX) ===\n${manifestText}\n=== FIM DO MANIFESTO ===`;
  }
  
  // Add shipping data extraction instructions based on analysis type
  fullPrompt += getShippingDataExtractionInstructions(analysisType);
  
  console.log(`🔄 Fallback: Calling Gemini Pro API directly with ${pdfFiles.length} PDFs + manifest text (${manifestText.length} chars)`);
  
  // Build parts for Gemini native format
  const parts: any[] = [{ text: fullPrompt }];
  
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    
    // Determine document type based on file_type
    let docLabel = `Document ${i + 1}`;
    if (file.file_type === 'base') {
      docLabel = '★★★ THIS IS THE HBL (House Bill of Lading) - Extract NCM codes FROM THIS DOCUMENT for "HBL NCMs" ★★★';
    } else if (file.file_type === 'mbl') {
      docLabel = '★★★ THIS IS THE MBL (Master Bill of Lading) - Extract NCM codes FROM THIS DOCUMENT for "MBL NCMs" ★★★';
    } else if (file.file_type === 'hbl') {
      docLabel = '★★★ THIS IS THE HBL (House Bill of Lading) ★★★';
    }
    
    parts.push({ text: `[${docLabel}]\n[Arquivo PDF: ${file.name}]` });
    parts.push({
      inline_data: {
        mime_type: 'application/pdf',
        data: file.base64
      }
    });
  }
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-06-05:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 32000,
      },
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`❌ Gemini Pro error: ${response.status} - ${errorText}`);
    throw new Error(`Gemini Pro error: ${response.status}`);
  }
  
  const data = await response.json();
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  
  // Count HBLs for fetching relevant examples
  const hblCount = files.filter(f => !f.file_name.toLowerCase().includes('manifest') && !f.file_name.toLowerCase().includes('pack')).length;
  
  // Fetch approved examples in parallel with file processing
  const approvedExamplesPromise = getApprovedExamples(analysisType, hblCount);
  
  const xlsxUrls = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop() || '';
    return ['xlsx', 'xls', 'xlsm', 'csv'].includes(ext);
  });
  
  const pdfUrls = files.filter(f => {
    const ext = f.file_name.toLowerCase().split('.').pop() || '';
    return !['xlsx', 'xls', 'xlsm', 'csv'].includes(ext);
  });
  
  console.log(`📊 XLSX files: ${xlsxUrls.length}, PDF files: ${pdfUrls.length}`);
  
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
  
  // Fetch PDFs and preserve file_type information
  const pdfPromises = pdfUrls.map(async f => {
    const result = await fetchFileAsBase64(f.file_url, f.file_name);
    if (result) {
      return { ...result, file_type: f.file_type };
    }
    return null;
  });
  const pdfResults = await Promise.all(pdfPromises);
  const validPdfs = pdfResults.filter((f): f is { base64: string; name: string; mediaType: string; ext: string; file_type: string } => f !== null);
  
  console.log(`📎 PDFs loaded: ${validPdfs.length}`);
  console.log(`📎 PDF types: ${validPdfs.map(f => `${f.name} -> ${f.file_type}`).join(', ')}`);
  
  // Wait for approved examples
  const approvedExamplesText = await approvedExamplesPromise;
  console.log(`📚 Approved examples text: ${approvedExamplesText.length} chars`);
  
  if (validPdfs.length === 0 && manifestText.length === 0) {
    throw new Error('Não foi possível carregar nenhum documento');
  }
  
  let result: { text: string; model: string };
  
  try {
    result = await analyzeWithAnthropic(
      basePrompt, 
      manifestText,
      validPdfs.map(f => ({ base64: f.base64, name: f.name, file_type: f.file_type })),
      metadata,
      approvedExamplesText,
      analysisType
    );
  } catch (anthropicError) {
    console.error(`❌ Anthropic failed, falling back to Gemini Pro:`, anthropicError);
    
    result = await analyzeWithGeminiPro(
      basePrompt, 
      manifestText,
      validPdfs.map(f => ({ base64: f.base64, name: f.name, file_type: f.file_type })),
      metadata,
      approvedExamplesText,
      analysisType
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
      file_count: xlsxUrls.length + validPdfs.length,
      used_examples: approvedExamplesText.length > 0
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

/**
 * Extract HBL shipping data JSON from analysis result text
 */
function extractHblShippingData(resultText: string): { container: string; consignee: string; vessel: string; voyage: string; origem: string; destino: string; mbl_number: string; carrier: string; ata_date: string } | null {
  try {
    let result = {
      container: '',
      consignee: '',
      vessel: '',
      voyage: '',
      origem: '',
      destino: '',
      mbl_number: '',
      carrier: '',
      ata_date: ''
    };
    
    // Extract all JSON blocks from the response
    const jsonBlocks = resultText.matchAll(/```json\s*(\{[^`]+\})\s*```/g);
    for (const match of jsonBlocks) {
      try {
        const parsed = JSON.parse(match[1]);
        
        // Extract hbl_shipping_data
        if (parsed.hbl_shipping_data) {
          result.container = parsed.hbl_shipping_data.container || result.container;
          result.consignee = parsed.hbl_shipping_data.consignee || result.consignee;
          result.vessel = parsed.hbl_shipping_data.vessel || result.vessel;
          result.voyage = parsed.hbl_shipping_data.voyage || result.voyage;
          result.origem = parsed.hbl_shipping_data.origem || result.origem;
          result.destino = parsed.hbl_shipping_data.destino || result.destino;
        }
        
        // Extract document_metadata (separate block for mbl/carrier/ata)
        if (parsed.document_metadata) {
          result.mbl_number = parsed.document_metadata.mbl_number || result.mbl_number;
          result.carrier = parsed.document_metadata.carrier || result.carrier;
          result.ata_date = parsed.document_metadata.ata_date || result.ata_date;
        }
      } catch (parseErr) {
        console.warn('Failed to parse JSON block:', parseErr);
      }
    }
    
    // If we found any data, return it
    if (result.container || result.consignee || result.vessel || result.mbl_number || result.carrier) {
      return result;
    }
    
    // Fallback: try to find the JSON objects directly
    const hblMatch = resultText.match(/\{"hbl_shipping_data":\s*\{[^}]+\}\}/);
    if (hblMatch) {
      try {
        const parsed = JSON.parse(hblMatch[0]);
        if (parsed.hbl_shipping_data) {
          result.container = parsed.hbl_shipping_data.container || '';
          result.consignee = parsed.hbl_shipping_data.consignee || '';
          result.vessel = parsed.hbl_shipping_data.vessel || '';
          result.voyage = parsed.hbl_shipping_data.voyage || '';
          result.origem = parsed.hbl_shipping_data.origem || '';
          result.destino = parsed.hbl_shipping_data.destino || '';
        }
      } catch (e) { /* ignore */ }
    }
    
    const metaMatch = resultText.match(/\{"document_metadata":\s*\{[^}]+\}\}/);
    if (metaMatch) {
      try {
        const parsed = JSON.parse(metaMatch[0]);
        if (parsed.document_metadata) {
          result.mbl_number = parsed.document_metadata.mbl_number || '';
          result.carrier = parsed.document_metadata.carrier || '';
          result.ata_date = parsed.document_metadata.ata_date || '';
        }
      } catch (e) { /* ignore */ }
    }
    
    if (result.container || result.consignee || result.mbl_number || result.carrier) {
      return result;
    }
    
    return null;
  } catch (e) {
    console.error('Failed to extract HBL shipping data:', e);
    return null;
  }
}

/**
 * Save container data to MariaDB via mariadb-proxy
 */
async function saveContainerData(data: { container: string; vessel: string; voyage: string; origem: string; destino: string }): Promise<boolean> {
  try {
    if (!data.container || data.container.trim() === '') {
      console.log('⚠️ No container data to save');
      return false;
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials for container save');
      return false;
    }
    
    console.log(`📦 Saving container data: ${data.container}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        action: 'save_container_data',
        container: data.container,
        vessel: data.vessel,
        voyage: data.voyage,
        origem: data.origem,
        destino: data.destino
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to save container data: ${response.status} - ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`✅ Container data saved: ${result.action} (id: ${result.id})`);
    return true;
  } catch (e) {
    console.error('Error saving container data:', e);
    return false;
  }
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
          // Create file record (rel_path required, use empty string for base files)
          const fileResult = await dbClient.execute(`
            INSERT INTO ai_agente.t_dachser_sea_files 
            (filename, mime, size_bytes, rel_path, url, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
          `, [baseFileName, 'application/pdf', 0, '', baseFileUrl || '']);
          
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
        
        // Save file record to MariaDB with item_id for linking
        await dbClient.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, size_bytes, rel_path, url, item_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [file.name, file.type, file.size, storagePath, publicUrl, actualItemId || null]);
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
        
        // Save file URL record to MariaDB with item_id for linking
        await dbClient.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, size_bytes, rel_path, url, item_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [fileUrl.name, 'application/octet-stream', actualSize, '', fileUrl.url, actualItemId || null]);
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
          
          // Extract and save HBL shipping data (container, vessel, voyage, origem, destino)
          const hblShippingData = extractHblShippingData(result.result_text || '');
          if (hblShippingData) {
            console.log(`📦 Extracted HBL shipping data:`, hblShippingData);
            
            // Update item with extracted metadata (consignee, container) but NOT status
            // Status 'realizado' should only be set when user clicks "Concluir Análise"
            if (actualItemId) {
              const updateFields: string[] = [];
              const updateValues: any[] = [];
              
              if (hblShippingData.container) {
                updateFields.push('container = ?');
                updateValues.push(hblShippingData.container);
              }
              if (hblShippingData.consignee) {
                updateFields.push('consignee = ?');
                updateValues.push(hblShippingData.consignee);
              }
              if (hblShippingData.mbl_number) {
                updateFields.push('mbl_number = ?');
                updateValues.push(hblShippingData.mbl_number);
              }
              if (hblShippingData.carrier) {
                updateFields.push('carrier = ?');
                updateValues.push(hblShippingData.carrier);
              }
              if (hblShippingData.ata_date) {
                updateFields.push('ata_date = ?');
                updateValues.push(hblShippingData.ata_date);
              }
              
              if (updateFields.length > 0) {
                // Set status to 'analisado' (analysis done, pending user review)
                updateValues.push(actualItemId);
                await bgClient.execute(`
                  UPDATE ai_agente.t_dachser_sea_items 
                  SET ${updateFields.join(', ')}, status = 'analisado'
                  WHERE id = ?
                `, updateValues);
                console.log(`✅ Updated item ${actualItemId} with metadata (incl. mbl/carrier/ata), status = 'analisado'`);
              } else {
                // No metadata but update status to 'analisado'
                await bgClient.execute(`
                  UPDATE ai_agente.t_dachser_sea_items SET status = 'analisado' WHERE id = ?
                `, [actualItemId]);
                console.log(`✅ Updated item ${actualItemId} status to 'analisado'`);
              }
            }
            
            // Container data will be saved to t_dachser_container only when user completes the analysis
            // via the complete_maritimo_analysis action (not automatically here)
            console.log(`ℹ️ Container data extracted but will be saved on analysis completion only`);
          } else {
            console.log(`⚠️ No HBL shipping data found in analysis result`);
            // Update item status to 'analisado' even without metadata
            if (actualItemId) {
              await bgClient.execute(`
                UPDATE ai_agente.t_dachser_sea_items SET status = 'analisado' WHERE id = ?
              `, [actualItemId]);
              console.log(`✅ Updated item ${actualItemId} status to 'analisado' (no metadata)`);
            }
          }

          
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
