import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'PDF file is required (field: file)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[parse-bl-cadastro] Processing file: ${file.name}, size: ${file.size}`);

    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    const prompt = `You are an expert at extracting data from Bill of Lading (BL) documents for maritime/ocean freight.
Extract ALL fields from this BL PDF and return a JSON object with the following structure.
If a field is not found, use null.

IMPORTANT FIELD DESCRIPTIONS:
- "bl_number": The Bill of Lading number, typically prominently displayed. May be labeled as "B/L No.", "BL Number", "Bill of Lading Number".
- "shipper_name": Name of the shipper/exporter.
- "shipper_address": Full address of the shipper.
- "consignee_name": Name of the consignee (receiver).
- "consignee_address": Full address of the consignee.
- "consignee_cnpj": CNPJ number of the consignee if present (Brazilian tax ID).
- "notify_party": Notify party details.
- "delivery_agent": Delivery agent name and address.
- "port_loading": Port of Loading.
- "port_discharge": Port of Discharge.
- "vessel_voyage": Vessel name and Voyage number combined.
- "place_receipt": Place of Receipt (for combined transport).
- "place_delivery": Place of Delivery (for combined transport).
- "container_numbers": All container numbers found, comma-separated.
- "seal_numbers": All seal numbers found, comma-separated.
- "marks_numbers": Marks and Numbers section content.
- "nature_of_goods": Description of goods / Nature of goods.
- "hs_code": HS Code or NCM code if present.
- "gross_weight_kg": Total gross weight in KG as a number.
- "volume_cbm": Total volume in CBM as a number.
- "pieces": Number of packages/pieces as integer.
- "packaging": Packaging type description (e.g., "WOODEN PALLET", "CARTON").
- "freight_charges": All freight charges listed, as a single string with line breaks.
- "freight_payment": Freight payment terms - "PREPAID" or "COLLECT".
- "service_type": Service type (e.g., "LCL", "FCL", "LCL/FCL").
- "total_prepaid": Total prepaid amount as number.
- "total_collect": Total collect amount as number.
- "num_original_bls": Number of original Bills of Lading as integer.
- "shipped_on_board_date": Shipped on Board date (format: YYYY-MM-DD).
- "place_date_issue": Place and date of issue as string.
- "issued_by": Name of the issuer / carrier.

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parse-bl-cadastro] Anthropic error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text || '';

    if (!content) {
      throw new Error('Empty response from Anthropic');
    }

    let extracted: any;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    } catch {
      console.error('[parse-bl-cadastro] Failed to parse:', content.substring(0, 500));
      throw new Error('Falha ao interpretar resposta da IA');
    }

    const elapsed = Date.now() - startTime;
    console.log(`[parse-bl-cadastro] Extraction done in ${elapsed}ms`);

    return new Response(JSON.stringify({ success: true, data: extracted, processingTimeMs: elapsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[parse-bl-cadastro] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
