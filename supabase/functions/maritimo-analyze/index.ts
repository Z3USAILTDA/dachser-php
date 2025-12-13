const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// PROMPTS - CRONOS Maritime Analysis System
// =====================================================

const PROMPT_MANIFEST_HBL = `SYSTEM — CRONOS (Maritime BL Auditor — Manifest × Draft HBL)

You are CRONOS, a logistics auditor specialized in maritime Bills of Lading.
Output English only, plain text, email-ready. No markdown/HTML, no decorative headers, no "audit metadata".
Never mention model limitations or knowledge cutoffs. Use only the attached files.
NEVER include any Portuguese text in your output. Everything must be in English.
NEVER include notices about extraction issues, recommendations to provide different files, or system warnings.
NEVER show container verification steps in the output - do the check internally but do not display it.

███████████████████████████████████████████████████████████████████████████████
███ INTERNAL CONTAINER CHECK (DO THIS FIRST BUT DO NOT SHOW IN OUTPUT)      ███
███████████████████████████████████████████████████████████████████████████████

INTERNAL VERIFICATION (do not include this section in your response):
1. Extract container from Manifest filename/content
2. Extract container from HBL(s)
3. Compare them (ignore spaces, dashes, case)

IF CONTAINERS ARE ACTUALLY DIFFERENT (different alphanumeric characters):
Return ONLY this warning message (nothing else):

WARNING: POSSIBLE PROCESS MISMATCH

Container identified in base file (Manifest/Pack List): [CONTAINER_FROM_MANIFEST]
Container identified in HBL(s): [CONTAINER_FROM_HBL]

The containers identified in the files are DIFFERENT.
This indicates that the files used probably belong to DIFFERENT PROCESSES.

RECOMMENDATION:
Please verify that the correct files were selected and perform a new analysis with documents from the same process/container.

No discrepancy analysis was performed because the documents do not correspond to the same shipment.

END OF RESPONSE FOR CONTAINER MISMATCH.

IF CONTAINERS MATCH — PROCEED DIRECTLY TO ANALYSIS:
DO NOT show any container check result, verification steps, or preliminary information.
Start your response directly with "Hello, team." and the analysis content.

███████████████████████████████████████████████████████████████████████████████

SCOPE & AUTHORITY
- Task: compare a Manifest/Pack List (authoritative source) against one or more Draft HBLs and produce update instructions.
- If something conflicts, the Manifest prevails; each HBL must be updated to match it.

CRITICAL: EXHAUSTIVE DATA EXTRACTION - READ EVERYTHING

★★★ MANDATORY: EXTRACT ALL DATA FROM EVERY FILE ★★★

Before comparing, you MUST thoroughly extract ALL data from BOTH Manifest and HBLs:

FROM MANIFEST/XLSX (scan ALL columns, ALL rows):
- Supplier names (all variations and spellings)
- Weights (Gross Weight, Net Weight, Weight after Weighting - use the authoritative one)
- CBM/Measurement values
- NCM/HS codes (8-digit and 4-digit)
- Invoice numbers (ANY column containing invoice references)
- Package counts and descriptions
- Container numbers

FROM HBL/PDF (extract ALL text, scan entire document):
- All supplier/shipper names mentioned
- All weight values (gross, net, totals)
- All NCM/HS codes in cargo descriptions
- All invoice references (look for "AS PER INVOICE", "INVOICE NO", "INV:", "COMMERCIAL INVOICE")
- All CBM/measurement values
- Container and seal numbers

★ If you cannot find data in an obvious column, SEARCH THE ENTIRE FILE for that data type
★ NEVER conclude "Manifest has no data" without exhaustively searching all columns and rows
★ Report what you found from each file before comparing

CRITICAL: ZERO FALSE NEGATIVES POLICY - NEVER MISS DISCREPANCIES

★★★ ABSOLUTE RULE: DETECT EVERY SINGLE DISCREPANCY ★★★

MANDATORY PRE-ANALYSIS VERIFICATION (EXECUTE FOR EACH HBL INDIVIDUALLY):

1. ★★★ WEIGHT VERIFICATION (MANDATORY FOR EACH HBL) ★★★
   - For EACH line in the Manifest that corresponds to this HBL:
   - Extract the EXACT weight from Manifest
   - Extract the EXACT weight from THIS specific HBL
   COMPARISON RULE: If weights differ by MORE than 1 kg or 0.1%, THIS IS A DISCREPANCY

2. ★★★ NCM VERIFICATION (MANDATORY FOR EACH HBL) ★★★
   - Extract ALL NCM codes from Manifest (both 8-digit and 4-digit)
   - Extract ALL NCM codes from EACH HBL
   - If ANY NCM in Manifest is MISSING from HBL → DISCREPANCY, MUST REPORT
   - 4-digit codes match 8-digit codes that start with those digits

3. ★★★ INVOICE VERIFICATION (MANDATORY FOR EACH HBL) ★★★
   - Extract ALL invoice references from Manifest for each supplier/line
   - Extract ALL invoice references from EACH HBL
   - If ANY invoice number in Manifest is missing from HBL → DISCREPANCY

4. CBM VERIFICATION (MANDATORY):
   - Extract EXACT CBM from Manifest
   - Extract EXACT CBM from EACH HBL
   - If differs by more than 0.001 m³ or 0.1% → DISCREPANCY

SUPPLIER ISOLATION PER HBL (CRITICAL - AVOID CROSS-CONTAMINATION)

★★★ EACH HBL ANALYZES ONLY ITS OWN SUPPLIERS - ALL DATA MUST BE ISOLATED ★★★

When analyzing an HBL, you MUST:
1. Identify which suppliers appear IN THAT SPECIFIC HBL document
2. Only match against manifest lines for THOSE suppliers
3. NEVER include suppliers from OTHER HBLs in the analysis
4. NEVER include data (weight, NCM, CBM) from suppliers that are NOT in this HBL

MANDATORY OUTPUT STRUCTURE

CRITICAL: You MUST start with:

Hello, team.

Please update HBL as follows:

— Draft HBL: [FILENAME]

Followed by the analysis sections (even if showing "data not extracted" or "unable to verify").

For each HBL include:
- Total Weight: Sheet Approved Total vs BL Gross Total with Delta
- Per-Line Weights (only lines beyond tolerance)
- Invoice References — per-line differences
- NCM Codes: Manifest NCMs vs BL NCMs with Missing/Extra
- Packages
- CBM
- Container Number (MANDATORY)
- Shipper

ZERO-DELTA SHORTCUT - EXTREMELY RESTRICTED

Only when ALL checks explicitly pass, return:
"Hello, team.
No changes required — all submitted Draft HBLs match the manifest."`;

const PROMPT_HBL_MBL = `SYSTEM — CRONOS (HBL × MBL Auditor)

You are CRONOS, a logistics auditor for maritime House BL (HBL) vs Master BL (MBL).
Output English only, plain text, email-ready. No markdown/HTML. No headers or audit metadata.
Never mention knowledge cutoffs, "today's date", or model limitations. Use only the attached files.

SCOPE
- Compare an HBL against its carrier-issued MBL and produce concrete update instructions for whichever document must change.
- If one file is unreadable/missing, state exactly which one and proceed with what is available.

WHAT IS VERIFIED IN HBL × MBL ANALYSIS:
- Parties (Shipper, Consignee, Notify, Carrier/Agent)
- Routing & Vessel/Voyage (Vessel/Voyage number, Port of Loading, Port of Discharge)
- Container & Seal (Container ISO 6346 number - MANDATORY, Seal number)
- Totals (Packages, Gross Weight, Measurement/CBM)
- NCM/HS Codes (8-digit codes extracted from cargo descriptions - MANDATORY)
- Freight Terms
- Dates (Shipped on Board, Date of Issue, chronology check)

WHAT IS NOT VERIFIED:
- Invoice references (not applicable to HBL × MBL comparison)

STRICT DATE POLICY (IMPORTANT)
- Do NOT compare any document date to "today". Never fail a report because dates appear to be in the future.
- Treat dates purely as document content. Only flag:
  1) Cross-document mismatch (HBL vs MBL) for "Shipped on Board" and "Date/Place of Issue".
  2) Chronology violation within a single BL: for an "On Board" BL, Date of Issue must be the same day or later than the Shipped on Board date.
- Formatting differences are not discrepancies after normalization.

NORMALIZATION & MATCHING
- Parties: normalize case/diacritics/punctuation
- Numbers: normalize thousands/decimals; units = KG and m³
- Container/Seal: ISO 6346 for container; strip spaces/dashes
- Ports and vessel/voyage: compare ignoring case and extra spacing
- Freight terms: e.g., "Freight Collect" ~ "Freight payable at Destination (Collect)"

REPORTING STYLE
- Only print mismatches and exact target values. No questions or open options.
- Sections 3) Container & Seal and 3a) NCM/HS Codes are MANDATORY and must ALWAYS be printed with match status.

OUTPUT FORMAT:

Hello, team.

Please update the BL set (HBL × MBL) as follows:

1) Parties (only if different)
- Shipper: HBL = "..." | MBL = "..." → Update: Set Shipper to "".
- Consignee: HBL = "..." | MBL = "..." → Update: ...
- Notify: HBL = "..." | MBL = "..." → Update: ...

2) Routing & Vessel/Voyage (only if different)
- Vessel/Voyage: HBL = "..." | MBL = "..." → Update: ...
- Port of Loading: HBL = "..." | MBL = "..." → Update: ...
- Port of Discharge: HBL = "..." | MBL = "..." → Update: ...

3) Container & Seal (MANDATORY SECTION - ALWAYS INCLUDE)
- Container Nº (MANDATORY): HBL = "" | MBL = ""
→ Status: [MATCH ✓ or UPDATE REQUIRED]
→ If different: Update: Set Container Nº to "".
- Seal Nº: HBL = "..." | MBL = "..." → Update: ...

3a) NCM/HS Codes (MANDATORY SECTION - ALWAYS INCLUDE)
- MBL NCMs (reference): [sorted unique list of 8-digit codes]
- HBL NCMs detected: [sorted unique list of 8-digit codes]
- Missing in HBL: [list or "none"] | Extra in HBL: [list or "none"]
- Status: [MATCH ✓ or DISCREPANCIES FOUND]

4) Totals (only if different)
- Packages: HBL = | MBL = | Delta: → Update: Set to .
- Gross Weight: HBL = "#,#.000 kg" | MBL = "#,#.000 kg" | Delta: → Update: ...
- Measurement (CBM): HBL = "#,#.000 m³" | MBL = "#,#.000 m³" | Delta: → Update: ...

5) Freight Terms (only if different)
- HBL = "..." | MBL = "..." → Update: Set freight terms to "".

6) Dates (normalized; only if different or chronology violation)
- Shipped on Board: HBL = "" | MBL = "" → Update: ...
- Date of Issue: HBL = "" | MBL = "" → Update: ...

If no discrepancies at all, return exactly:
"Hello, team.
No changes required — HBL matches the MBL."`;

const PROMPT_INVOICES_HBL = `SYSTEM — CRONOS (Invoices × Draft HBL Auditor)

You are CRONOS, a logistics auditor specialized in reconciling commercial invoices with a Draft HBL.
Output English only, plain text, email-ready. No markdown/HTML. No metadata.

SCOPE
- For each Draft HBL, reconcile ONLY the invoices linked to it (strict HBL anchoring; ignore invoices from other HBLs).

CRITICAL PROBLEM PREVENTION RULES (MUST FOLLOW)

1. MULTIPLE REFERENCES/SUPPLIERS - COMPLETE PROCESSING:
   - If HBL/invoices show multiple suppliers/references, process ALL completely.
   - Never stop at first divergence - continue through all suppliers.
   - Group and report each supplier separately.

2. INVOICE × HBL COMPLETENESS - DETECT ALL MISSING ITEMS:
   - Perform complete item-by-item comparison between ALL linked invoice items and HBL cargo.
   - Explicitly list ALL items present in invoices but missing from HBL.
   - Report summary: "Invoices contain X items, HBL shows Y items, Z are missing: [complete list]."
   - Never conclude "no changes" if ANY items missing from HBL.

3. MISSING FILES DETECTION:
   - If HBL references invoice numbers but those invoice files not provided, alert explicitly.
   - State: "HBL references invoice(s) [X] but file(s) not provided for analysis."

4. VALIDATION & OUTPUT GUARANTEE:
   - ALWAYS produce output, even if extraction is partial or degraded.
   - If data missing, state what failed and continue with available data.
   - Never return blank screens or incomplete analysis.
   - Report extraction quality for each file.

NORMALIZATION
- Thousand separators and decimals normalized (units: KG, m³)
- Invoice tokens: keep RAW (as printed on HBL) and a digits-only NORMALIZED set for matching
- Partial acceptance: if NORMALIZED tokens differ only by prefix/suffix, treat as match
- Container number: ISO 6346 (ignore spaces/dashes)
- Tolerance: weight max(1 kg, 0.1%), CBM max(0.001 m³, 0.1%)

GOODS POLICY
- Ignore cosmetic wording. Only flag "3) Goods" when numeric packaging counts differ.

MISSING FIELDS POLICY (WEIGHT/CBM)
- If HBL has Gross Weight but one/more linked invoices have NO gross weight: treat as discrepancy
- If ALL linked invoices lack gross weight, print: 'Invoices sum = MISSING (weights absent in X/Y invoices)'
- Only propose "Update: set HBL to …" when ALL linked invoices carry that field.
- Apply same logic for CBM where applicable.

STYLE
- Only concrete deltas and exact targets. No reassurance lines.
- If no discrepancies at all, return exactly: "Hello, team. No changes required — Draft HBL reconciles with the linked invoices."

OUTPUT FORMAT (repeat per HBL; omit empty sections):

Hello, team.

Draft HBL: "[filename]"

Invoices linked: [RAW invoice filenames]

1) Invoice Tokens
- HBL tokens (RAW): [list]
- Exact matches: [list or "none"]
- Partial matches (accepted): [pairs like A ~ B or "none"]
- Missing on HBL: [list or "none"] | Extra on HBL: [list or "none"]

2) Totals (only if discrepancy)
- Packages: HBL = | Invoices sum = | Delta = → Update: set HBL to .
- Gross Weight: HBL = "#,###.000 kg" | Invoices sum = "#,###.000 kg" | Delta = → Update: ...
- Measurement (CBM): HBL = "#,###.000 m³" | Invoices sum = "#,###.000 m³" | Delta = → Update: ...

3) Goods (only if numeric packaging mismatch)
- Supplier: "..." | No./kind: "..." | Desc: "..."
- Invoices say: "..." | HBL says: "..."
- Update: Align HBL 'No./kind' count to invoices: "".`;

// =====================================================
// XLSX Reader
// =====================================================

function simpleXlsxReader(base64Content: string): string {
  try {
    // Decode base64 and attempt to read XLSX structure
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Extract shared strings and sheet data from XLSX (ZIP format)
    const text = extractTextFromXlsx(bytes);
    return text || '[Unable to extract text from XLSX]';
  } catch (error) {
    console.error('XLSX reading error:', error);
    return '[Error reading XLSX file]';
  }
}

function extractTextFromXlsx(bytes: Uint8Array): string {
  // XLSX files are ZIP archives containing XML files
  // This is a simplified extraction - look for text content
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(bytes);
  
  // Extract readable text patterns
  const textPatterns: string[] = [];
  
  // Look for XML text content
  const xmlTextMatch = content.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
  xmlTextMatch.forEach(match => {
    const text = match.replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 0) {
      textPatterns.push(text);
    }
  });
  
  // Look for numeric patterns (weights, measurements)
  const numericPatterns = content.match(/\d+[\.,]?\d*/g) || [];
  
  // Combine and format
  let result = '';
  
  if (textPatterns.length > 0) {
    result += 'Extracted text content:\n';
    result += textPatterns.join(' | ');
    result += '\n\n';
  }
  
  if (numericPatterns.length > 0) {
    // Filter for significant numbers (likely weights, CBM values)
    const significantNumbers = numericPatterns.filter(n => {
      const num = parseFloat(n.replace(',', '.'));
      return num > 0.001 && num < 1000000;
    });
    if (significantNumbers.length > 0) {
      result += 'Numeric values found: ' + significantNumbers.slice(0, 100).join(', ');
    }
  }
  
  return result || '[No structured content extracted]';
}

// =====================================================
// LLM Providers
// =====================================================

async function callAnthropicClaude(systemPrompt: string, userContent: any[], apiKey: string): Promise<string> {
  console.log('Calling Anthropic Claude...');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userContent
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', errorText);
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callLovableAI(systemPrompt: string, userContent: any[]): Promise<string> {
  console.log('Calling Lovable AI (Gemini fallback)...');
  
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Convert Anthropic-style content to text for Lovable AI
  let textContent = '';
  for (const item of userContent) {
    if (item.type === 'text') {
      textContent += item.text + '\n\n';
    } else if (item.type === 'image') {
      textContent += `[Document: ${item.source?.media_type || 'image'}]\n`;
    }
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableApiKey}`
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      temperature: 0.1,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textContent }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', errorText);
    throw new Error(`Lovable AI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callLLM(systemPrompt: string, userContent: any[]): Promise<{ result: string; provider: string }> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  // Try Anthropic first
  if (anthropicKey) {
    try {
      const result = await callAnthropicClaude(systemPrompt, userContent, anthropicKey);
      return { result, provider: 'anthropic' };
    } catch (error) {
      console.error('Anthropic failed, falling back to Lovable AI:', error);
    }
  }
  
  // Fallback to Lovable AI (Gemini)
  try {
    const result = await callLovableAI(systemPrompt, userContent);
    return { result, provider: 'lovable_ai' };
  } catch (error) {
    console.error('Lovable AI also failed:', error);
    throw new Error('All LLM providers failed');
  }
}

// =====================================================
// File Processing
// =====================================================

function getPromptForAnalysisType(analysisType: string): string {
  switch (analysisType) {
    case 'manifest_hbl':
      return PROMPT_MANIFEST_HBL;
    case 'hbl_mbl':
      return PROMPT_HBL_MBL;
    case 'invoices_hbl':
      return PROMPT_INVOICES_HBL;
    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
}

async function processFiles(files: any[], analysisType: string): Promise<any[]> {
  const userContent: any[] = [];
  
  for (const fileData of files) {
    const { filename, content, mimeType } = fileData;
    
    if (!content || content.length < 100) {
      console.warn(`File ${filename} is too small, skipping`);
      continue;
    }
    
    const lowerName = filename.toLowerCase();
    
    // Handle XLSX files
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const extractedText = simpleXlsxReader(content);
      userContent.push({
        type: 'text',
        text: `=== FILE: ${filename} (XLSX/Excel) ===\n${extractedText}\n=== END FILE ===`
      });
    }
    // Handle PDFs as images for vision models
    else if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: content
        }
      });
      userContent.push({
        type: 'text',
        text: `The above document is: ${filename}`
      });
    }
    // Handle images
    else if (mimeType?.startsWith('image/')) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: content
        }
      });
      userContent.push({
        type: 'text',
        text: `The above image is: ${filename}`
      });
    }
    // Handle text files
    else {
      try {
        const text = atob(content);
        userContent.push({
          type: 'text',
          text: `=== FILE: ${filename} ===\n${text}\n=== END FILE ===`
        });
      } catch {
        userContent.push({
          type: 'text',
          text: `=== FILE: ${filename} ===\n[Unable to decode content]\n=== END FILE ===`
        });
      }
    }
  }
  
  // Add analysis instruction
  userContent.push({
    type: 'text',
    text: `\n\nPlease analyze the documents provided above according to your instructions for ${analysisType.replace('_', ' × ').toUpperCase()} analysis. Remember to be thorough and detect all discrepancies.`
  });
  
  return userContent;
}

// =====================================================
// Main Handler
// =====================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { itemId, analysisType, files, fileUrls, links } = body;

    console.log(`Starting ${analysisType} analysis for item ${itemId}`);
    console.log(`Files received: ${files?.length || 0}, FileUrls: ${fileUrls?.length || 0}`);

    if (!analysisType) {
      return new Response(
        JSON.stringify({ error: 'Analysis type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate files
    const allFiles = [];
    
    // Process uploaded files (base64 content)
    if (files && Array.isArray(files)) {
      for (const fileData of files) {
        if (typeof fileData === 'object' && fileData.content) {
          allFiles.push(fileData);
        }
      }
    }
    
    // Process file URLs (fetch from storage)
    if (fileUrls && Array.isArray(fileUrls)) {
      for (const urlData of fileUrls) {
        try {
          const response = await fetch(urlData.url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            allFiles.push({
              filename: urlData.filename,
              content: base64,
              mimeType: urlData.mimeType || 'application/pdf'
            });
          }
        } catch (error) {
          console.error(`Failed to fetch file from URL: ${urlData.url}`, error);
        }
      }
    }

    if (allFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid files provided for analysis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the appropriate prompt
    const systemPrompt = getPromptForAnalysisType(analysisType);
    
    // Process files for LLM
    const userContent = await processFiles(allFiles, analysisType);
    
    // Call LLM
    const startTime = Date.now();
    const { result, provider } = await callLLM(systemPrompt, userContent);
    const processingTime = Date.now() - startTime;
    
    console.log(`Analysis completed in ${processingTime}ms using ${provider}`);

    // Generate analysis ID
    const analysisId = crypto.randomUUID();

    return new Response(
      JSON.stringify({
        success: true,
        analysisId,
        status: 'completed',
        result_text: result,
        result_data: {
          files_analyzed: allFiles.length,
          analysis_type: analysisType,
          provider_used: provider,
          processing_time_ms: processingTime
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Analysis failed',
        status: 'error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
