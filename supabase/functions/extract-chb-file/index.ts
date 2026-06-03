import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'chb-extract-v1';
const PRIMARY_MODEL = 'google/gemini-2.5-flash';
const FALLBACK_MODEL = 'google/gemini-2.5-pro';

async function callMariaDBProxy(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase credentials');

  const resp = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`mariadb-proxy error: ${t}`);
  }
  return resp.json();
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function detectMime(filename: string, fallback?: string): string {
  if (fallback) return fallback;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  return 'application/octet-stream';
}

const EXTRACTION_PROMPT = `Você é um extrator determinístico de campos logísticos a partir de UM ÚNICO documento (HBL, HAWB, Invoice, Packing List, Extrato de Conhecimento, etc).

TAREFA:
1) Leia o documento integralmente.
2) Retorne EXCLUSIVAMENTE um JSON válido com a estrutura abaixo.
3) NUNCA invente valor. Se o campo NÃO estiver presente ou for ambíguo, devolva null (NÃO use "ND", "-", "N/A", "" ou qualquer placeholder).
4) Para cada campo extraído, devolva também a EVIDÊNCIA: o trecho literal do documento (snippet) e, se possível, o rótulo de origem (ex.: "Peso Bruto Total", "Total Collect").
5) Normalize números no formato pt-BR: vírgula como decimal, ponto como milhar — devolva os números como STRING tal como aparecem no documento, sem reformatar (ex.: "7,000", "1.250,50").
6) Moeda: código ISO de 3 letras (BRL, USD, EUR, CNY...). Unidade de peso: "kg".

ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "raw_ocr_text": "<texto integral lido do documento, preservando quebras de linha>",
  "structured_fields": {
    "peso_bruto":         { "value": "<string|null>", "unit": "kg" } | null,
    "peso_liquido":       { "value": "<string|null>", "unit": "kg" } | null,
    "valor_mercadoria":   { "value": "<string|null>", "currency": "<ISO|null>" } | null,
    "valor_total_frete":  { "value": "<string|null>", "currency": "<ISO|null>", "kind": "consolidado" | "parcial" | null } | null,
    "ncm":                ["<string>", ...] | null,
    "incoterm":           "<string|null>",
    "cnpj_consignee":     "<string|null>",
    "master":             "<string|null>",
    "house":              "<string|null>",
    "descricao":          "<string|null>"
  },
  "field_evidence": {
    "<nome_do_campo>": { "source_label": "<rótulo encontrado>", "source_snippet": "<trecho literal>", "line_number": <int|null> }
  },
  "confidence": <0..1>
}

REGRAS ESPECÍFICAS:
- valor_total_frete:
  * Procure PRIMEIRO uma linha consolidada: "Total", "Total Geral", "Totais na moeda de origem", "Total Prepaid", "Total Collect", "Grand Total".
  * Se encontrar, marque kind="consolidado".
  * Se SÓ existirem componentes parciais ("Por Peso", "Por Valor", "Impostos", "Outros"), SOME-OS e marque kind="parcial". Documente a soma no field_evidence.source_snippet.
  * NUNCA devolva apenas um componente parcial como valor total.
- peso_bruto / peso_liquido:
  * Aceite rótulos: "Peso Bruto", "Peso Bruto Total", "P. Bruto", "PB", "Gross Weight", "Gross Wt", "GW", "Weight (kg)".
  * Se o valor estiver numa linha separada do rótulo, ainda assim extraia.
  * Rejeite valores que tenham símbolo de moeda — esses são monetários, não peso.
- ncm: lista de strings (códigos 4/6/8 dígitos), pode haver múltiplos.
- Se o documento NÃO contiver determinado campo, devolva null no campo E omita a entrada em field_evidence.

RESPONDA APENAS COM O JSON. Sem markdown, sem comentários.`;

interface LlmExtractionResult {
  raw_ocr_text: string;
  structured_fields: Record<string, any>;
  field_evidence: Record<string, any>;
  confidence: number | null;
}

async function callGemini(model: string, base64: string, mime: string, filename: string): Promise<LlmExtractionResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${EXTRACTION_PROMPT}\n\nNome do arquivo: ${filename}` },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      }],
      max_tokens: 16000,
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Lovable AI Gateway error (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Empty response from LLM');
  }

  // Extract JSON block (LLM may wrap in ```json … ```)
  let parsed: any;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i) || content.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse LLM JSON: ${(e as Error).message}. Raw: ${raw.slice(0, 200)}`);
  }

  return {
    raw_ocr_text: typeof parsed.raw_ocr_text === 'string' ? parsed.raw_ocr_text : '',
    structured_fields: parsed.structured_fields && typeof parsed.structured_fields === 'object'
      ? parsed.structured_fields : {},
    field_evidence: parsed.field_evidence && typeof parsed.field_evidence === 'object'
      ? parsed.field_evidence : {},
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { itemId, fileId, fileUrl, fileBase64, mimeType, filename, docRole, etapa } = body || {};

    if (!itemId || !fileId || !filename || !etapa || (!fileUrl && !fileBase64)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'itemId, fileId, filename, etapa e (fileUrl OU fileBase64) são obrigatórios',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[extract-chb-file] item=${itemId} file=${fileId} name=${filename} etapa=${etapa} via=${fileBase64 ? 'base64' : 'url'}`);

    // 1) Obtain bytes (either base64 direto ou download)
    let base64: string;
    let sha: string;
    let mime: string;
    if (fileBase64) {
      base64 = fileBase64;
      const bin = Uint8Array.from(atob(base64.slice(0, Math.min(base64.length, 4_000_000))), c => c.charCodeAt(0));
      sha = await sha256Hex(bin.buffer);
      mime = detectMime(filename, mimeType);
    } else {
      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        throw new Error(`Failed to download file (${fileResp.status}): ${fileUrl}`);
      }
      const buf = await fileResp.arrayBuffer();
      sha = await sha256Hex(buf);
      base64 = arrayBufferToBase64(buf);
      mime = detectMime(filename, fileResp.headers.get('content-type') || undefined);
      console.log(`[extract-chb-file] downloaded ${buf.byteLength} bytes, sha=${sha.slice(0, 12)}…, mime=${mime}`);
    }

    // 2) LLM extraction (Gemini Flash → Pro fallback)
    let llm: LlmExtractionResult | null = null;
    let usedModel = '';
    let extractionStatus: 'OK' | 'PARCIAL' | 'ERRO' = 'OK';
    let errorMessage: string | null = null;

    try {
      llm = await callGemini(PRIMARY_MODEL, base64, mime, filename);
      usedModel = PRIMARY_MODEL;
    } catch (e1) {
      console.warn(`[extract-chb-file] Primary model failed: ${(e1 as Error).message}. Trying fallback…`);
      try {
        llm = await callGemini(FALLBACK_MODEL, base64, mime, filename);
        usedModel = FALLBACK_MODEL;
      } catch (e2) {
        console.error(`[extract-chb-file] Both models failed.`, e2);
        extractionStatus = 'ERRO';
        errorMessage = `${(e1 as Error).message} | fallback: ${(e2 as Error).message}`;
      }
    }

    // Heuristic: if structured_fields is empty or all-null, mark PARCIAL
    if (llm && extractionStatus === 'OK') {
      const sf = llm.structured_fields || {};
      const hasAny = Object.values(sf).some(v => v !== null && v !== undefined);
      if (!hasAny) extractionStatus = 'PARCIAL';
    }

    // 3) Persist extraction (sempre grava, mesmo em erro, para auditoria)
    const insertResp = await callMariaDBProxy('insert_chb_extraction', {
      itemId,
      fileId,
      filename,
      docRole: docRole || null,
      etapa: String(etapa),
      fileSha256: sha,
      extractorModel: usedModel || null,
      extractorPromptVersion: PROMPT_VERSION,
      extractorConfidence: llm?.confidence ?? null,
      rawOcrText: llm?.raw_ocr_text || null,
      structuredFields: llm?.structured_fields || null,
      fieldEvidence: llm?.field_evidence || null,
      extractionStatus,
      errorMessage,
    });

    console.log(`[extract-chb-file] persisted extractionId=${insertResp.extractionId} status=${extractionStatus}`);

    return new Response(JSON.stringify({
      success: extractionStatus !== 'ERRO',
      extractionId: insertResp.extractionId,
      filename,
      docRole: docRole || null,
      fileId,
      fileSha256: sha,
      extractorModel: usedModel,
      extractionStatus,
      structuredFields: llm?.structured_fields || null,
      fieldEvidence: llm?.field_evidence || null,
      confidence: llm?.confidence ?? null,
      error: errorMessage,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[extract-chb-file] Fatal:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
