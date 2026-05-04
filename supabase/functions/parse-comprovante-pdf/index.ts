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
  candidatosSPO: string[];
  candidatosND: string[];
}

// ============================================================================
// Padrões de nome de arquivo (DACHSER):
//   - Comprovante SPO Remessa: "101-286102D26122025.35"           → SPO 286102
//   - Comprovante SPO Manual:  "101-286105"                       → SPO 286105
//   - Comprovante Voucher Remessa: "<ND><DDMMYYYY>.<seq>"         → ND variável (10–13 dígitos)
//       ex.: "2025156579326122025.53"  → ND 2025156579 (10 dígitos)
//       ex.: "2026377674530042026.13"  → ND 20263776745 (11 dígitos)  ← caso reportado
//   - Comprovante Voucher Manual: "OT 433-20251877370 + 473-20253775241"
// ============================================================================

// Valida se 8 dígitos formam uma data DDMMYYYY plausível (ano 2020–2099).
function isPlausibleDate(ddmmyyyy: string): boolean {
  return /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})$/.test(ddmmyyyy);
}

// Coleta TODAS as substrings numéricas com 5–13 dígitos do texto, deduplicadas.
function collectNumericCandidates(text: string): string[] {
  const set = new Set<string>();
  const matches = text.matchAll(/(?<![0-9])(\d{5,13})(?![0-9])/g);
  for (const m of matches) {
    const n = m[1];
    // Excluir datas puras
    if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})$/.test(n)) continue;
    if (/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) continue;
    set.add(n);
  }
  return Array.from(set);
}

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
    candidatosSPO: [],
    candidatosND: [],
  };

  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  console.log(`[Extract] Analyzing filename: "${fileName}"`);

  // Sempre coletar candidatos numéricos para fallback no frontend
  const allNumericCandidates = collectNumericCandidates(nameWithoutExt);

  // ==========================================
  // Pattern LINHA DIGITÁVEL: filename é só dígitos com 44+ caracteres → boleto
  // ==========================================
  const onlyDigits = nameWithoutExt.replace(/\D/g, '');
  if (/^\d+$/.test(nameWithoutExt) && onlyDigits.length >= 44 && onlyDigits.length <= 48) {
    result.linhaDigitavel = onlyDigits;
    result.confidence = 0.85;
    result.candidatosND = allNumericCandidates;
    result.candidatosSPO = allNumericCandidates;
    console.log(`[Extract] Linha digitável detectada: ${onlyDigits}`);
    return result;
  }

  // ==========================================
  // Pattern 0: PURE NUMBER curto (≤ 13 dígitos)
  // ==========================================
  const pureNumberMatch = nameWithoutExt.match(/^(\d+)$/);
  if (pureNumberMatch && pureNumberMatch[1].length <= 13) {
    const extractedNumber = pureNumberMatch[1];
    result.numeroSPO = extractedNumber;
    result.numeroND = extractedNumber;
    result.confidence = 0.9;
    result.candidatosSPO = allNumericCandidates;
    result.candidatosND = allNumericCandidates;
    console.log(`[Extract] Pure number: ${extractedNumber}`);
    return result;
  }

  // ==========================================
  // Pattern 1: SPO Remessa - "101-286102D26122025.35" → SPO 286102
  // ==========================================
  const spoRemessaMatch = fileName.match(/(\d{3})-(\d{6})[A-Z]\d{8}\.\d{2}/i);
  if (spoRemessaMatch) {
    result.numeroSPO = spoRemessaMatch[2];
    result.confidence = 0.95;
    result.candidatosSPO = [spoRemessaMatch[2], ...allNumericCandidates];
    result.candidatosND = allNumericCandidates;
    console.log(`[Extract] SPO Remessa: ${result.numeroSPO}`);
    return result;
  }

  // ==========================================
  // Pattern 2: SPO Manual - "101-286105"
  // ==========================================
  const spoManualMatch = fileName.match(/(\d{3})-(\d{5,6})(?:\.|$|[^0-9])/);
  if (spoManualMatch) {
    result.numeroSPO = spoManualMatch[2];
    result.confidence = 0.9;
    result.candidatosSPO = [spoManualMatch[2], ...allNumericCandidates];
    result.candidatosND = allNumericCandidates;
    console.log(`[Extract] SPO Manual: ${result.numeroSPO}`);
    return result;
  }

  // ==========================================
  // Pattern 3: Voucher Remessa - "<ND><DDMMYYYY>.<seq>"
  // ND tem tamanho variável (10–13 dígitos). Validamos a data ao final.
  // Tentamos comprimentos de ND de 13 → 10 e validamos os 8 dígitos restantes.
  // ==========================================
  const voucherRemessaFull = nameWithoutExt.match(/^(\d{18,21})\.(\d{2})$/);
  if (voucherRemessaFull) {
    const digits = voucherRemessaFull[1];
    // Tenta ND com 13, 12, 11, 10 dígitos
    for (const ndLen of [13, 12, 11, 10]) {
      if (digits.length - ndLen !== 8) continue;
      const ndCandidate = digits.slice(0, ndLen);
      const datePart = digits.slice(ndLen);
      if (ndCandidate.startsWith('20') && isPlausibleDate(datePart)) {
        result.numeroND = ndCandidate;
        result.confidence = 0.92;
        // Lista candidatos: o ND escolhido em primeiro, depois variantes (10–13) e demais
        const ndVariants: string[] = [];
        for (const len of [10, 11, 12, 13]) {
          if (digits.length - len === 8 && isPlausibleDate(digits.slice(len))) {
            const v = digits.slice(0, len);
            if (v.startsWith('20')) ndVariants.push(v);
          }
        }
        result.candidatosND = Array.from(new Set([ndCandidate, ...ndVariants, ...allNumericCandidates]));
        result.candidatosSPO = allNumericCandidates;
        console.log(`[Extract] Voucher Remessa: ND=${ndCandidate} (len=${ndLen}), data=${datePart}`);
        return result;
      }
    }
  }

  // ==========================================
  // Pattern 4: Voucher Manual - "OT 433-20251877370 + 473-20253775241"
  // ==========================================
  const voucherManualMatches = [...fileName.matchAll(/OT\s*\d{3}-(\d{10,})/gi)];
  if (voucherManualMatches.length > 0) {
    result.numeroND = voucherManualMatches[0][1];
    result.confidence = 0.85;
    result.candidatosND = Array.from(new Set([
      ...voucherManualMatches.map(m => m[1]),
      ...allNumericCandidates,
    ]));
    result.candidatosSPO = allNumericCandidates;
    console.log(`[Extract] Voucher Manual: ${result.numeroND}`);
    return result;
  }

  // ==========================================
  // Pattern 5: SPO explícito
  // ==========================================
  const explicitPatterns = [
    /SPO[-_\s]*(\d{5,7})/i,
    /comprovante[-_\s]*(\d{5,7})/i,
    /spo\s*n[°ºo]?\s*(\d{5,7})/i,
  ];
  for (const pattern of explicitPatterns) {
    const match = fileName.match(pattern);
    if (match) {
      result.numeroSPO = match[1];
      result.confidence = 0.85;
      result.candidatosSPO = Array.from(new Set([match[1], ...allNumericCandidates]));
      result.candidatosND = allNumericCandidates;
      console.log(`[Extract] Explicit SPO: ${result.numeroSPO}`);
      return result;
    }
  }

  // ==========================================
  // Pattern 6: GENÉRICO 6–7 dígitos
  // ==========================================
  const sixSevenMatches = [...nameWithoutExt.matchAll(/(?<![0-9])(\d{6,7})(?![0-9])/g)];
  if (sixSevenMatches.length > 0) {
    const validMatches = sixSevenMatches.filter(m => {
      const num = m[1];
      if (/^20\d{4,5}$/.test(num)) return false;
      if (/^\d{2}(0[1-9]|1[0-2])(20\d{2})$/.test(num)) return false;
      return true;
    });
    if (validMatches.length > 0) {
      const extractedNumber = validMatches[0][1];
      result.numeroSPO = extractedNumber;
      result.numeroND = extractedNumber;
      result.confidence = 0.75;
      result.candidatosSPO = Array.from(new Set([extractedNumber, ...allNumericCandidates]));
      result.candidatosND = result.candidatosSPO;
      console.log(`[Extract] Generic 6-7 digit: ${extractedNumber}`);
      return result;
    }
  }

  // ==========================================
  // Pattern 7: ND genérico (10+ dígitos iniciando com ano)
  // ==========================================
  const ndMatches = [...nameWithoutExt.matchAll(/(?<![0-9])(20\d{8,11})(?![0-9])/g)];
  if (ndMatches.length > 0) {
    result.numeroND = ndMatches[0][1];
    result.confidence = 0.7;
    result.candidatosND = Array.from(new Set([
      ...ndMatches.map(m => m[1]),
      ...allNumericCandidates,
    ]));
    result.candidatosSPO = allNumericCandidates;
    console.log(`[Extract] ND genérico: ${result.numeroND}`);
    return result;
  }

  // ==========================================
  // Pattern 8: 5 dígitos
  // ==========================================
  const fiveMatches = [...nameWithoutExt.matchAll(/(?<![0-9])(\d{5})(?![0-9])/g)];
  if (fiveMatches.length > 0) {
    const extractedNumber = fiveMatches[0][1];
    result.numeroSPO = extractedNumber;
    result.numeroND = extractedNumber;
    result.confidence = 0.6;
    result.candidatosSPO = Array.from(new Set([extractedNumber, ...allNumericCandidates]));
    result.candidatosND = result.candidatosSPO;
    return result;
  }

  // Ainda assim retorna candidatos para o frontend tentar
  result.candidatosSPO = allNumericCandidates;
  result.candidatosND = allNumericCandidates;
  console.log(`[Extract] Nenhum padrão direto matched. Candidatos: ${allNumericCandidates.length}`);
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

    const filenameResult = extractFromFilename(fileName);
    const HIGH_CONF_THRESHOLD = 0.85;

    // Se confiança alta, retorna direto (não precisa chamar IA — economia de tokens)
    if (filenameResult.confidence >= HIGH_CONF_THRESHOLD) {
      console.log(`[Parse] Alta confiança (${filenameResult.confidence}) — retornando filename`);
      return new Response(
        JSON.stringify({ success: true, data: filenameResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Confiança baixa OU sem matches: tentar IA do PDF para complementar
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.warn('[Parse] LOVABLE_API_KEY não configurada — retornando filename');
      return new Response(
        JSON.stringify({ success: true, data: filenameResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `Analyze this bank payment receipt/proof PDF and extract the following information in JSON format:

1. "numeroSPO" - Look for SPO number, usually 5-7 digits
2. "numeroND" - Look for ND (Número do Documento) or Voucher number, usually 10-13 digits starting with year
3. "linhaDigitavel" - The barcode/boleto line (linha digitável), usually 44-48 digits
4. "valor" - The payment amount in BRL (just the number)
5. "fornecedor" - The supplier/vendor name
6. "dataVencimento" - Due date in YYYY-MM-DD format

Return ONLY a JSON object with these fields. Use null for any field you cannot find.`;

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${pdfBase64.substring(0, 50000)}` },
              },
            ],
          }],
          max_tokens: 8000,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Combinar resultado da IA com candidatos do filename
          const aiSPO = parsed.numeroSPO ? String(parsed.numeroSPO) : null;
          const aiND = parsed.numeroND ? String(parsed.numeroND) : null;

          const mergedCandidatosSPO = Array.from(new Set([
            ...(aiSPO ? [aiSPO] : []),
            ...(filenameResult.numeroSPO ? [filenameResult.numeroSPO] : []),
            ...filenameResult.candidatosSPO,
          ]));
          const mergedCandidatosND = Array.from(new Set([
            ...(aiND ? [aiND] : []),
            ...(filenameResult.numeroND ? [filenameResult.numeroND] : []),
            ...filenameResult.candidatosND,
          ]));

          const contentResult: ExtractedData = {
            numeroSPO: aiSPO || filenameResult.numeroSPO,
            numeroND: aiND || filenameResult.numeroND,
            linhaDigitavel: parsed.linhaDigitavel || filenameResult.linhaDigitavel || null,
            valor: parsed.valor ? Number(parsed.valor) : null,
            fornecedor: parsed.fornecedor || null,
            dataVencimento: parsed.dataVencimento || null,
            confidence: 0.8,
            source: 'content',
            candidatosSPO: mergedCandidatosSPO,
            candidatosND: mergedCandidatosND,
          };

          console.log(`[Parse] IA: SPO=${contentResult.numeroSPO}, ND=${contentResult.numeroND}, candND=${mergedCandidatosND.length}`);
          return new Response(
            JSON.stringify({ success: true, data: contentResult }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.error('[Parse] AI API error:', aiResponse.status, await aiResponse.text());
      }
    } catch (aiError) {
      console.error('[Parse] AI extraction error:', aiError);
    }

    // Fallback final: retorna o que foi possível extrair do filename (com candidatos)
    return new Response(
      JSON.stringify({ success: true, data: filenameResult }),
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
