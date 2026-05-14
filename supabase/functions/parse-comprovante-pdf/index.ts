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

// ============================================================================
// PARSER EXAUSTIVO
// Roda TODOS os padrões em sequência e acumula candidatos com pontuação.
// Cada candidato (SPO ou ND) recebe um score; ao final, ordenamos por score
// e o de maior pontuação vira numeroSPO/numeroND. Os demais ficam em
// candidatosSPO/candidatosND ordenados por prioridade.
//
// Score guide (quanto maior, mais confiável):
//   100  SPO Remessa  "101-286102D26122025.35"
//    95  SPO Manual   "101-286105"
//    95  Voucher Remessa ND validado por data DDMMYYYY (qualquer comprimento)
//    90  Voucher Manual "OT 433-20251877370"
//    85  Pure number curto (≤13 dígitos)
//    85  SPO explícito ("SPO 123")
//    80  Linha digitável (44–48 dígitos puros)
//    60  Genérico 6–7 dígitos
//    55  ND genérico 20XXXXXXXX
//    40  Genérico 5 dígitos
//    20  Substring numérica 5–13 dígitos (fallback de baixa prioridade)
// ============================================================================
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

  // Mapas de pontuação: candidato → score máximo encontrado
  const spoScores = new Map<string, number>();
  const ndScores = new Map<string, number>();
  const addCandidate = (map: Map<string, number>, value: string | null | undefined, score: number) => {
    if (!value) return;
    const v = String(value).trim();
    if (!v || !/^\d+$/.test(v)) return;
    const prev = map.get(v) ?? 0;
    if (score > prev) map.set(v, score);
  };

  // ---------------------------------------------------------------
  // BASE: substrings numéricas 5–13 dígitos (score 20)
  // ---------------------------------------------------------------
  const allNumericCandidates = collectNumericCandidates(nameWithoutExt);
  for (const c of allNumericCandidates) {
    addCandidate(spoScores, c, 20);
    addCandidate(ndScores, c, 20);
  }

  // ---------------------------------------------------------------
  // Linha digitável NÃO é usada para identificação (regra do projeto).
  // Mantemos o campo apenas para compatibilidade — sempre null.
  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // Pure number curto (≤13 dígitos) — pode ser SPO ou ND
  // ---------------------------------------------------------------
  const pureNumberMatch = nameWithoutExt.match(/^(\d+)$/);
  if (pureNumberMatch && pureNumberMatch[1].length <= 13) {
    addCandidate(spoScores, pureNumberMatch[1], 85);
    addCandidate(ndScores, pureNumberMatch[1], 85);
    console.log(`[Extract] Pure number: ${pureNumberMatch[1]}`);
  }

  // ---------------------------------------------------------------
  // SPO Remessa: "101-286102D26122025.35"  → SPO 286102 (score 100)
  // Adiciona TANTO o número curto ("286102") quanto o composto com filial
  // ("101-286102") como candidato — o composto recebe score maior pois
  // identifica o voucher mesmo quando há sufixo livre (ex: "101-286102 DIM-BY")
  // ---------------------------------------------------------------
  for (const m of fileName.matchAll(/(\d{3})-(\d{6})[A-Z]\d{8}\.\d{1,2}/gi)) {
    addCandidate(spoScores, `${m[1]}-${m[2]}`, 102);
    addCandidate(spoScores, m[2], 100);
    console.log(`[Extract] SPO Remessa: ${m[1]}-${m[2]} (e ${m[2]})`);
  }

  // ---------------------------------------------------------------
  // SPO Manual: "101-286105" (score 95). Promove "101-286105" como
  // candidato principal (score 97) e mantém "286105" como secundário.
  // ---------------------------------------------------------------
  for (const m of fileName.matchAll(/(\d{3})-(\d{5,7})(?:\.|$|[^0-9])/g)) {
    addCandidate(spoScores, `${m[1]}-${m[2]}`, 97);
    addCandidate(spoScores, m[2], 95);
    console.log(`[Extract] SPO Manual: ${m[1]}-${m[2]} (e ${m[2]})`);
  }

  // ---------------------------------------------------------------
  // Voucher Remessa: "<SPO/ND><DDMMYYYY>[sufixo 0-2 dígitos].<seq 1-3>"
  // Aceita também sufixos extras entre data e ponto (ex.: "20261883270130520260.119"
  // = SPO 20261883270 + DDMMYYYY 13052026 + sufixo "0" + .119)
  // O número antes da data pode ser SPO ou ND — adiciona em ambos os mapas.
  // ---------------------------------------------------------------
  const voucherRemessaFull = nameWithoutExt.match(/^(\d{18,22})\.(\d{1,3})$/);
  if (voucherRemessaFull) {
    const digits = voucherRemessaFull[1];
    for (const ndLen of [13, 12, 11, 10]) {
      for (const extra of [0, 1, 2]) {
        if (digits.length - ndLen - 8 !== extra) continue;
        const ndCandidate = digits.slice(0, ndLen);
        const datePart = digits.slice(ndLen, ndLen + 8);
        if (ndCandidate.startsWith('20') && isPlausibleDate(datePart)) {
          // Maior comprimento ganha leve prioridade; sufixo penaliza levemente
          const score = 95 + ndLen - extra; // 102–108
          addCandidate(ndScores, ndCandidate, score);
          addCandidate(spoScores, ndCandidate, score);
          console.log(`[Extract] Voucher Remessa: ${ndCandidate} (len=${ndLen}, data=${datePart}, sufixo=${extra}), score=${score}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Fallback posicional: corridas longas puramente numéricas (>14)
  // varre janelas de 8 dígitos plausíveis como DDMMYYYY; o prefixo
  // de 10–13 dígitos começando com "20" vira candidato SPO/ND (score 90).
  // ---------------------------------------------------------------
  const longRuns = nameWithoutExt.match(/\d{15,}/g) || [];
  for (const run of longRuns) {
    for (let i = 10; i + 8 <= run.length && i <= 13; i++) {
      const datePart = run.slice(i, i + 8);
      if (!isPlausibleDate(datePart)) continue;
      const prefix = run.slice(0, i);
      if (!prefix.startsWith('20')) continue;
      addCandidate(ndScores, prefix, 90);
      addCandidate(spoScores, prefix, 90);
      console.log(`[Extract] Posicional: ${prefix} (len=${i}, data=${datePart})`);
    }
  }

  // ---------------------------------------------------------------
  // Voucher Manual: "OT 433-20251877370 + 473-20253775241" (score 90)
  // Captura TODOS os pares
  // ---------------------------------------------------------------
  for (const m of fileName.matchAll(/(?:OT\s*)?(\d{3})-(\d{10,13})/gi)) {
    addCandidate(ndScores, m[2], 90);
    console.log(`[Extract] Voucher Manual: ND=${m[2]}`);
  }

  // ---------------------------------------------------------------
  // SPO explícito: "SPO 123", "comprovante 123", "spo nº 123" (score 85)
  // ---------------------------------------------------------------
  const explicitPatterns = [
    /SPO[-_\s]*(\d{5,7})/gi,
    /comprovante[-_\s]*(\d{5,7})/gi,
    /spo\s*n[°ºo]?\s*(\d{5,7})/gi,
  ];
  for (const pattern of explicitPatterns) {
    for (const m of fileName.matchAll(pattern)) {
      addCandidate(spoScores, m[1], 85);
      console.log(`[Extract] Explicit SPO: ${m[1]}`);
    }
  }

  // ---------------------------------------------------------------
  // Genérico 6–7 dígitos (score 60) — exclui datas e anos
  // ---------------------------------------------------------------
  for (const m of nameWithoutExt.matchAll(/(?<![0-9])(\d{6,7})(?![0-9])/g)) {
    const num = m[1];
    if (/^20\d{4,5}$/.test(num)) continue;
    if (/^\d{2}(0[1-9]|1[0-2])(20\d{2})$/.test(num)) continue;
    addCandidate(spoScores, num, 60);
    addCandidate(ndScores, num, 60);
  }

  // ---------------------------------------------------------------
  // ND genérico: 10+ dígitos iniciando com ano "20" (score 55)
  // ---------------------------------------------------------------
  for (const m of nameWithoutExt.matchAll(/(?<![0-9])(20\d{8,11})(?![0-9])/g)) {
    addCandidate(ndScores, m[1], 55);
  }

  // ---------------------------------------------------------------
  // Genérico 5 dígitos (score 40)
  // ---------------------------------------------------------------
  for (const m of nameWithoutExt.matchAll(/(?<![0-9])(\d{5})(?![0-9])/g)) {
    addCandidate(spoScores, m[1], 40);
    addCandidate(ndScores, m[1], 40);
  }

  // ---------------------------------------------------------------
  // FINALIZAÇÃO: ordena candidatos por score (desc), pega o melhor
  // ---------------------------------------------------------------
  const sortedSPO = [...spoScores.entries()].sort((a, b) => b[1] - a[1]);
  const sortedND = [...ndScores.entries()].sort((a, b) => b[1] - a[1]);

  result.candidatosSPO = sortedSPO.map(([v]) => v);
  result.candidatosND = sortedND.map(([v]) => v);
  result.numeroSPO = sortedSPO[0]?.[0] ?? null;
  result.numeroND = sortedND[0]?.[0] ?? null;

  const topScore = Math.max(sortedSPO[0]?.[1] ?? 0, sortedND[0]?.[1] ?? 0);
  // Map score → confidence (0–1). 100+ = 0.95, 80 = 0.85, 60 = 0.7, etc.
  result.confidence = Math.min(0.99, topScore / 110);

  console.log(
    `[Extract] Done. Top SPO=${result.numeroSPO} (${sortedSPO[0]?.[1] ?? 0}), ` +
    `Top ND=${result.numeroND} (${sortedND[0]?.[1] ?? 0}), ` +
    `candidatosSPO=${result.candidatosSPO.length}, candidatosND=${result.candidatosND.length}`
  );

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

    // REGRA: identificação do robô vem EXCLUSIVAMENTE do nome do arquivo.
    // NUNCA usar conteúdo do PDF nem linha digitável (ver mem://vouchers/comprovante-robot-matching-rules).
    const filenameResult = extractFromFilename(fileName);
    // Garantia defensiva: nunca devolver linha digitável extraída de qualquer fonte.
    filenameResult.linhaDigitavel = null;

    console.log(`[Parse] filename-only: SPO=${filenameResult.numeroSPO}, ND=${filenameResult.numeroND}, conf=${filenameResult.confidence}`);
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
