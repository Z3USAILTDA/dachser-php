import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Módulo 10 - valida dígito verificador de um campo
function calcModulo10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    let prod = parseInt(digits[i]) * weight;
    // Soma os algarismos do produto (ex: 14 -> 1+4=5)
    if (prod >= 10) prod = Math.floor(prod / 10) + (prod % 10);
    sum += prod;
    weight = weight === 2 ? 1 : 2;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

// Converte linha digitável (47) para código de barras (44)
function linhaDigitavelToCodigoBarras(linha: string): string {
  // Posições da linha digitável -> código de barras:
  // Banco(3) + Moeda(1) = linha[0..3]
  // Dígito verificador geral = linha[32] (posição 33, 1-indexed)
  // Fator vencimento(4) + Valor(10) = linha[33..46]
  // Campo livre(25) = linha[4..8] + linha[10..19] + linha[21..30] (sem dígitos verificadores)
  const banco = linha.substring(0, 3);
  const moeda = linha[3];
  const dvGeral = linha[32];
  const fatorValor = linha.substring(33);
  const campoLivre = linha.substring(4, 9) + linha.substring(10, 20) + linha.substring(21, 31);
  return banco + moeda + dvGeral + fatorValor + campoLivre;
}

// Módulo 11 - valida dígito verificador geral do código de barras
function calcModulo11(codigoBarras44sem_dv: string): number {
  // codigoBarras44sem_dv = 43 dígitos (sem o DV na posição 5)
  let sum = 0;
  let weight = 2;
  for (let i = codigoBarras44sem_dv.length - 1; i >= 0; i--) {
    sum += parseInt(codigoBarras44sem_dv[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const dv = 11 - remainder;
  if (dv === 0 || dv === 1 || dv > 9) return 1;
  return dv;
}

interface ValidationResult {
  valid: boolean;
  campo1: boolean;
  campo2: boolean;
  campo3: boolean;
  dvGeral: boolean;
  details: string[];
}

function validateLinhaDigitavel(barcode: string): ValidationResult {
  const details: string[] = [];
  
  if (barcode.length !== 47) {
    return { valid: false, campo1: false, campo2: false, campo3: false, dvGeral: false, details: [`Tamanho inválido: ${barcode.length}`] };
  }

  // Campo 1: posições 1-9, DV na posição 10
  const campo1Digits = barcode.substring(0, 9);
  const campo1DV = parseInt(barcode[9]);
  const campo1Calc = calcModulo10(campo1Digits);
  const campo1Valid = campo1DV === campo1Calc;
  if (!campo1Valid) details.push(`Campo 1 (pos 1-10): DV esperado ${campo1Calc}, encontrado ${campo1DV}`);

  // Campo 2: posições 11-20, DV na posição 21
  const campo2Digits = barcode.substring(10, 20);
  const campo2DV = parseInt(barcode[20]);
  const campo2Calc = calcModulo10(campo2Digits);
  const campo2Valid = campo2DV === campo2Calc;
  if (!campo2Valid) details.push(`Campo 2 (pos 11-21): DV esperado ${campo2Calc}, encontrado ${campo2DV}`);

  // Campo 3: posições 22-31, DV na posição 32
  const campo3Digits = barcode.substring(21, 31);
  const campo3DV = parseInt(barcode[31]);
  const campo3Calc = calcModulo10(campo3Digits);
  const campo3Valid = campo3DV === campo3Calc;
  if (!campo3Valid) details.push(`Campo 3 (pos 22-32): DV esperado ${campo3Calc}, encontrado ${campo3DV}`);

  // DV Geral (posição 33): módulo 11 sobre código de barras sem o DV
  const codigoBarras = linhaDigitavelToCodigoBarras(barcode);
  // Remove DV (posição 5 do código de barras, index 4)
  const semDV = codigoBarras.substring(0, 4) + codigoBarras.substring(5);
  const dvGeralCalc = calcModulo11(semDV);
  const dvGeralActual = parseInt(barcode[32]);
  const dvGeralValid = dvGeralActual === dvGeralCalc;
  if (!dvGeralValid) details.push(`DV Geral (pos 33): esperado ${dvGeralCalc}, encontrado ${dvGeralActual}`);

  return {
    valid: campo1Valid && campo2Valid && campo3Valid && dvGeralValid,
    campo1: campo1Valid,
    campo2: campo2Valid,
    campo3: campo3Valid,
    dvGeral: dvGeralValid,
    details
  };
}

const EXTRACTION_PROMPT = `Analise este boleto bancário e extraia a linha digitável (código de barras numérico).

A linha digitável de boleto bancário tem EXATAMENTE 47 dígitos numéricos, formatada em 5 grupos:
- Campo 1: 5 dígitos + ponto + 5 dígitos (XXXXX.XXXXX)
- Campo 2: 5 dígitos + ponto + 6 dígitos (XXXXX.XXXXXX)  
- Campo 3: 5 dígitos + ponto + 6 dígitos (XXXXX.XXXXXX)
- Campo 4: 1 dígito
- Campo 5: 14 dígitos

Exemplo: 23793.38128 60000.000003 00009.001026 1 84350000050000

RESPONDA no seguinte formato (duas linhas):
FORMATADA: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX
LIMPA: 47 dígitos sem pontos ou espaços

Se não encontrar, responda apenas: NAO_ENCONTRADO`;

function buildRetryPrompt(validation: ValidationResult): string {
  const failedFields: string[] = [];
  if (!validation.campo1) failedFields.push('Campo 1 (primeiros 10 dígitos)');
  if (!validation.campo2) failedFields.push('Campo 2 (dígitos 11-21)');
  if (!validation.campo3) failedFields.push('Campo 3 (dígitos 22-32)');
  if (!validation.dvGeral) failedFields.push('Dígito verificador geral (posição 33)');

  return `A leitura anterior da linha digitável falhou na validação matemática dos seguintes campos: ${failedFields.join(', ')}.

Por favor, releia o boleto com EXTREMO CUIDADO, dígito por dígito. Preste atenção especial aos campos que falharam.

Detalhes dos erros: ${validation.details.join('; ')}

RESPONDA no seguinte formato (duas linhas):
FORMATADA: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX
LIMPA: 47 dígitos sem pontos ou espaços

Se não encontrar, responda apenas: NAO_ENCONTRADO`;
}

function parseExtractionResponse(text: string): string {
  // Try to extract "LIMPA:" line first
  const limpaMatch = text.match(/LIMPA:\s*(\d+)/);
  if (limpaMatch) return limpaMatch[1];
  
  // Try "FORMATADA:" line and clean it
  const formatadaMatch = text.match(/FORMATADA:\s*([0-9.\s]+)/);
  if (formatadaMatch) return formatadaMatch[1].replace(/\D/g, '');
  
  // Fallback: just extract all digits
  return text.replace(/\D/g, '');
}

async function callClaude(anthropicApiKey: string, mediaType: string, base64Data: string, promptText: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: promptText }
        ]
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || '';
}

function formatLinhaDigitavel(barcode: string): string {
  if (barcode.length === 47) {
    return `${barcode.slice(0, 5)}.${barcode.slice(5, 10)} ${barcode.slice(10, 15)}.${barcode.slice(15, 21)} ${barcode.slice(21, 26)}.${barcode.slice(26, 32)} ${barcode.slice(32, 33)} ${barcode.slice(33)}`;
  } else if (barcode.length === 48) {
    return `${barcode.slice(0, 11)}-${barcode.slice(11, 12)} ${barcode.slice(12, 23)}-${barcode.slice(23, 24)} ${barcode.slice(24, 35)}-${barcode.slice(35, 36)} ${barcode.slice(36, 47)}-${barcode.slice(47)}`;
  }
  return barcode;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_FINANCEIRO_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'Anthropic API key not configured', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    let base64Data: string | null = null;
    let mediaType = 'application/pdf';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      base64Data = arrayBufferToBase64(await file.arrayBuffer());
      mediaType = file.type || 'application/pdf';
    } else {
      const body = await req.json();
      if (body.base64) {
        base64Data = body.base64;
        mediaType = body.mediaType || 'application/pdf';
      } else if (body.fileUrl) {
        const fileResponse = await fetch(body.fileUrl);
        if (!fileResponse.ok) {
          return new Response(JSON.stringify({ error: 'Failed to fetch file from URL', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        base64Data = arrayBufferToBase64(await fileResponse.arrayBuffer());
        const ct = fileResponse.headers.get('content-type');
        if (ct) mediaType = ct.split(';')[0].trim();
        else if (body.fileUrl.toLowerCase().includes('.pdf')) mediaType = 'application/pdf';
        else if (body.fileUrl.toLowerCase().match(/\.(jpg|jpeg)$/)) mediaType = 'image/jpeg';
        else if (body.fileUrl.toLowerCase().includes('.png')) mediaType = 'image/png';
      }
    }

    if (!base64Data) {
      return new Response(JSON.stringify({ error: 'No file data provided', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[extract-boleto] Processing ${mediaType} (${base64Data.length} chars)...`);

    // --- Attempt 1 ---
    const rawResponse1 = await callClaude(anthropicApiKey, mediaType, base64Data, EXTRACTION_PROMPT);
    console.log('[extract-boleto] Attempt 1 raw:', rawResponse1);
    
    let cleanBarcode = parseExtractionResponse(rawResponse1);
    console.log(`[extract-boleto] Attempt 1 clean: ${cleanBarcode} (${cleanBarcode.length} digits)`);

    let validation: ValidationResult | null = null;
    let validated = false;
    let attemptUsed = 1;

    if (cleanBarcode.length === 47) {
      validation = validateLinhaDigitavel(cleanBarcode);
      validated = validation.valid;
      console.log(`[extract-boleto] Attempt 1 validation: ${validated}`, validation.details);

      // --- Attempt 2 (retry) if validation failed ---
      if (!validated) {
        console.log('[extract-boleto] Validation failed, retrying with corrective prompt...');
        const retryPrompt = buildRetryPrompt(validation);
        const rawResponse2 = await callClaude(anthropicApiKey, mediaType, base64Data, retryPrompt);
        console.log('[extract-boleto] Attempt 2 raw:', rawResponse2);

        const cleanBarcode2 = parseExtractionResponse(rawResponse2);
        console.log(`[extract-boleto] Attempt 2 clean: ${cleanBarcode2} (${cleanBarcode2.length} digits)`);

        if (cleanBarcode2.length === 47) {
          const validation2 = validateLinhaDigitavel(cleanBarcode2);
          console.log(`[extract-boleto] Attempt 2 validation: ${validation2.valid}`, validation2.details);

          if (validation2.valid) {
            cleanBarcode = cleanBarcode2;
            validation = validation2;
            validated = true;
            attemptUsed = 2;
          } else {
            // Use whichever has fewer errors
            const errors1 = validation.details.length;
            const errors2 = validation2.details.length;
            if (errors2 < errors1) {
              cleanBarcode = cleanBarcode2;
              validation = validation2;
              attemptUsed = 2;
            }
          }
        }
      }
    }

    // Build response
    if (cleanBarcode.length === 47 || cleanBarcode.length === 48) {
      const formattedBarcode = formatLinhaDigitavel(cleanBarcode);
      return new Response(JSON.stringify({
        success: true,
        linhaDigitavel: cleanBarcode,
        linhaDigitavelFormatada: formattedBarcode,
        validated,
        validation_warning: !validated,
        validation_details: validation ? { campo1: validation.campo1, campo2: validation.campo2, campo3: validation.campo3, dvGeral: validation.dvGeral, errors: validation.details } : null,
        attemptUsed,
        rawResponse: rawResponse1
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else if (rawResponse1.includes('NAO_ENCONTRADO') || cleanBarcode.length < 40) {
      return new Response(JSON.stringify({ success: false, error: 'Linha digitável não encontrada no documento', rawResponse: rawResponse1 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ success: false, error: `Linha digitável com tamanho inválido (${cleanBarcode.length} dígitos)`, linhaDigitavel: cleanBarcode, rawResponse: rawResponse1 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in extract-boleto-barcode:', error);
    return new Response(JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
