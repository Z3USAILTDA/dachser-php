import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParseRequest {
  pdfBase64: string;
  fileName: string;
}

interface ExtractedData {
  numeroSPO: string | null;
  numeroND: string | null;
  linhaDigitavel: string | null;
  valor: number | null;
  fornecedor: string | null;
  dataVencimento: string | null;
  confidence: number;
  source: 'filename' | 'content';
}

// Specific patterns for DACHSER proofs as per user requirements:
// - Comprovante SPO Remessa: "101-286102D26122025.35" → SPO 286102
// - Comprovante SPO Manual: "101-286105" → SPO 286105
// - Comprovante Voucher Remessa: "2025156579326122025.53" → ND 2025156579
// - Comprovante Voucher Manual: "OT 433-20251877370 + 473-20253775241" → ND múltiplos

function extractFromFilename(fileName: string): ExtractedData {
  const result: ExtractedData = {
    numeroSPO: null,
    numeroND: null,
    linhaDigitavel: null,
    valor: null,
    fornecedor: null,
    dataVencimento: null,
    confidence: 0,
    source: 'filename',
  };

  // Pattern 1: SPO Remessa - "101-286102D26122025.35" → SPO 286102
  // Format: XXX-XXXXXXDDDMMYYYY.XX where the 6 digits after XXX- is the SPO
  const spoRemessaPattern = /(\d{3})-(\d{6})[A-Z]\d{8}\.\d{2}/i;
  const spoRemessaMatch = fileName.match(spoRemessaPattern);
  if (spoRemessaMatch) {
    result.numeroSPO = spoRemessaMatch[2];
    result.confidence = 0.95;
    return result;
  }

  // Pattern 2: SPO Manual - "101-286105" → SPO 286105
  // Format: XXX-XXXXXX (simpler format)
  const spoManualPattern = /(\d{3})-(\d{5,6})(?:\.|$|[^0-9])/;
  const spoManualMatch = fileName.match(spoManualPattern);
  if (spoManualMatch) {
    result.numeroSPO = spoManualMatch[2];
    result.confidence = 0.9;
    return result;
  }

  // Pattern 3: Voucher Remessa - "2025156579326122025.53" → ND 2025156579
  // Format: YYYYNNNNNN... where first 10 digits is the ND
  const voucherRemessaPattern = /^(20\d{8})\d{8}\.\d{2}/;
  const voucherRemessaMatch = fileName.match(voucherRemessaPattern);
  if (voucherRemessaMatch) {
    result.numeroND = voucherRemessaMatch[1];
    result.confidence = 0.9;
    return result;
  }

  // Pattern 4: Voucher Manual - "OT 433-20251877370 + 473-20253775241"
  // Format: OT XXX-NNNNNNNNNN (can have multiple)
  const voucherManualPattern = /OT\s*\d{3}-(\d{10,})/gi;
  const voucherManualMatches = [...fileName.matchAll(voucherManualPattern)];
  if (voucherManualMatches.length > 0) {
    // Take the first ND found
    result.numeroND = voucherManualMatches[0][1];
    result.confidence = 0.85;
    return result;
  }

  // Fallback patterns for generic SPO extraction
  const genericPatterns = [
    /SPO[-_\s]?(\d{5,7})/i,
    /comprovante[-_\s]+(\d{5,7})/i,
    /^(\d{5,7})[-_]/,
    /[-_](\d{5,7})\./,
  ];

  for (const pattern of genericPatterns) {
    const match = fileName.match(pattern);
    if (match) {
      result.numeroSPO = match[1];
      result.confidence = 0.7;
      return result;
    }
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName } = await req.json() as ParseRequest;

    if (!pdfBase64 || !fileName) {
      return new Response(
        JSON.stringify({ error: 'pdfBase64 and fileName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, try to extract from filename (fastest)
    const filenameResult = extractFromFilename(fileName);
    
    if (filenameResult.numeroSPO || filenameResult.numeroND) {
      console.log(`Extracted from filename: SPO=${filenameResult.numeroSPO}, ND=${filenameResult.numeroND}`);
      return new Response(
        JSON.stringify({ success: true, data: filenameResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If filename didn't work, use Lovable AI to extract from PDF content
    console.log('Filename extraction failed, attempting AI content extraction...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.warn('LOVABLE_API_KEY not configured, returning filename-only result');
      return new Response(
        JSON.stringify({ success: true, data: filenameResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Lovable AI to analyze PDF content
    const prompt = `Analyze this bank payment receipt/proof PDF and extract the following information in JSON format:
    
    1. "numeroSPO" - Look for SPO number, usually 5-7 digits
    2. "numeroND" - Look for ND (Número do Documento) or Voucher number, usually 10+ digits starting with year
    3. "linhaDigitavel" - The barcode/boleto line (linha digitável), usually 47+ digits
    4. "valor" - The payment amount in BRL (just the number)
    5. "fornecedor" - The supplier/vendor name
    6. "dataVencimento" - Due date in YYYY-MM-DD format
    
    Return ONLY a JSON object with these fields. Use null for any field you cannot find.
    
    Example response:
    {
      "numeroSPO": "286102",
      "numeroND": "2025156579",
      "linhaDigitavel": "23793.38128 60000.000003 28610.201019 1 98290000050000",
      "valor": 500.00,
      "fornecedor": "Empresa XYZ Ltda",
      "dataVencimento": "2025-01-15"
    }`;

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: prompt },
                { 
                  type: 'image_url', 
                  image_url: { url: `data:application/pdf;base64,${pdfBase64.substring(0, 50000)}` }
                }
              ]
            }
          ],
          max_tokens: 1000,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        // Try to parse JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          const contentResult: ExtractedData = {
            numeroSPO: parsed.numeroSPO || null,
            numeroND: parsed.numeroND || null,
            linhaDigitavel: parsed.linhaDigitavel || null,
            valor: parsed.valor ? Number(parsed.valor) : null,
            fornecedor: parsed.fornecedor || null,
            dataVencimento: parsed.dataVencimento || null,
            confidence: 0.75,
            source: 'content',
          };

          console.log(`Extracted from AI content analysis: SPO=${contentResult.numeroSPO}, ND=${contentResult.numeroND}`);
          return new Response(
            JSON.stringify({ success: true, data: contentResult }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.error('AI API error:', aiResponse.status, await aiResponse.text());
      }
    } catch (aiError) {
      console.error('AI extraction error:', aiError);
    }

    // Return empty result if all extraction methods failed
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: {
          numeroSPO: null,
          numeroND: null,
          linhaDigitavel: null,
          valor: null,
          fornecedor: null,
          dataVencimento: null,
          confidence: 0,
          source: 'filename',
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Parse comprovante error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
