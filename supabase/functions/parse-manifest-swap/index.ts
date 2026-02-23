import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.byteLength));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    console.log(`[parse-manifest-swap] File: ${file.name}, size: ${bytes.byteLength}`);

    const systemPrompt = `You are a specialist in parsing DACHSER air cargo manifest PDFs.

Extract from the manifest:
1. The MAWB (AWB Number) - format XXX-XXXXXXXX (e.g. 045-15161226, 001-15981431)
2. ALL HAWB entries with their details

For each HAWB entry extract:
- hawb_number: the HAWB Number / Cargo Reference (e.g. KFB-00941361, SHA-38474004)
- shipper: the shipper company name (first company listed under each HAWB)
- consignee: the consignee company name (second company listed, usually Brazilian)
- cnpj: the CNPJ if present (format XX.XXX.XXX/XXXX-XX)
- dep_des: departure/destination airport codes (e.g. MUC/GRU, PVG/GRU)
- pieces: number of pieces
- weight: weight in kg

Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Parse this DACHSER manifest PDF and extract the MAWB and all HAWBs with their details.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_manifest',
              description: 'Extract MAWB and HAWB data from a DACHSER manifest PDF',
              parameters: {
                type: 'object',
                properties: {
                  mawb: {
                    type: 'string',
                    description: 'The AWB Number (MAWB) from the manifest header, format XXX-XXXXXXXX',
                  },
                  hawbs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        hawb_number: { type: 'string', description: 'HAWB Number / Cargo Reference' },
                        shipper: { type: 'string', description: 'Shipper company name' },
                        consignee: { type: 'string', description: 'Consignee company name' },
                        cnpj: { type: 'string', description: 'CNPJ of consignee if present' },
                        dep_des: { type: 'string', description: 'Departure/Destination airports e.g. PVG/GRU' },
                        pieces: { type: 'number', description: 'Number of pieces' },
                        weight: { type: 'number', description: 'Weight in kg' },
                      },
                      required: ['hawb_number', 'shipper', 'consignee'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['mawb', 'hawbs'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'extract_manifest' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[parse-manifest-swap] AI error:', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Tente novamente em alguns minutos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];

    let extracted: any;
    if (toolCall?.function?.arguments) {
      extracted = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content as JSON
      const content = aiResponse.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Não foi possível extrair dados do manifesto');
      }
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[parse-manifest-swap] Extracted MAWB=${extracted.mawb}, ${extracted.hawbs?.length || 0} HAWBs in ${processingTimeMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      data: extracted,
      processingTimeMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[parse-manifest-swap] Error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Erro desconhecido' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
