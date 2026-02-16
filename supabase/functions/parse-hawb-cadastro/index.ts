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
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'PDF file is required (field: file)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[parse-hawb-cadastro] Processing file: ${file.name}, size: ${file.size}`);

    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    const prompt = `You are an expert at extracting data from HAWB (House Air Waybill) documents.
Extract ALL fields from this HAWB PDF and return a JSON object with the following structure.
If a field is not found, use null.

IMPORTANT DISTINCTION:
- "awb_number" (also called MAWB - Master Air Waybill): This is the MASTER airway bill number, typically in format XXX-XXXXXXXX (3 digit airline prefix + dash + 8 digits). It is usually found in the "Accounting Information" section, or labeled as "MAWB", "Master AWB", or "Air Waybill No". It references the airline's master document.
- "hawb_number" (House Air Waybill): This is the HOUSE airway bill number assigned by the freight forwarder. It may appear at the top of the document, in a header, or labeled as "HAWB", "House AWB", "House Airway Bill", or simply as the main document reference number. It is NOT the same as the MAWB.

If the document is a HAWB, the main prominent number on the document is likely the HAWB number, while the MAWB may be referenced inside (e.g. in Accounting Information).

{
  "awb_number": "the MAWB/Master Air Waybill number (format: XXX-XXXXXXXX), found in Accounting Information or labeled as MAWB",
  "hawb_number": "the HAWB/House Air Waybill number, typically the main document reference number",
  "airport_departure": "full name of airport of departure",
  "shipper_name": "shipper name",
  "shipper_address": "full shipper address",
  "shipper_account": "shipper account number",
  "issuing_agent": "issuing carrier's agent name",
  "agent_city": "agent city/location",
  "agent_iata_code": "IATA code of agent",
  "agent_account": "agent account number",
  "nie_code": "NIE code if present",
  "nif_code": "NIF code if present",
  "routing_destination": "routing and destination info (airport code + carrier code)",
  "currency": "currency code (e.g. USD)",
  "chgs_wt_val": "charges weight/valuation indicator (PP or CC)",
  "declared_value_carriage": "declared value for carriage (e.g. NVD)",
  "declared_value_customs": "declared value for customs (e.g. NCV)",
  "handling_references": "handling information / references",
  "handling_info": "additional handling info (e.g. export licenses text)",
  "pieces": number of pieces as integer,
  "gross_weight_kg": gross weight in kg as number,
  "rate_class": "rate class code",
  "chargeable_weight": chargeable weight as number,
  "rate": rate as number,
  "total_charge": total charge as number,
  "nature_of_goods": "description of goods",
  "itn_number": "ITN/AES number if present",
  "packaging": "packaging description",
  "hs_code": "HS code if present",
  "volume_cbm": volume in cbm as number,
  "dimensions": "dimensions string (e.g. 1/87x87x51cm)",
  "other_charges_agent": other charges due agent as number,
  "other_charges_carrier": "other charges due carrier (may be reference numbers)",
  "signature_name": "name in signature field",
  "signature_date": "date of signature",
  "signature_place": "place of signature",
  "total_prepaid": total prepaid amount as number,
  "total_collect": total collect amount as number,
  "consignee_name": "consignee name from document (for reference only)",
  "consignee_address": "consignee address from document",
  "consignee_cnpj": "consignee CNPJ if present"
}

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
            ],
          }],
          generationConfig: { maxOutputTokens: 4000 },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parse-hawb-cadastro] Gemini error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      ?.map((p: any) => p.text)
      ?.join('') || '';

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    let extracted: any;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    } catch {
      console.error('[parse-hawb-cadastro] Failed to parse:', content.substring(0, 500));
      throw new Error('Falha ao interpretar resposta da IA');
    }

    const elapsed = Date.now() - startTime;
    console.log(`[parse-hawb-cadastro] Extraction done in ${elapsed}ms`);

    return new Response(JSON.stringify({ success: true, data: extracted, processingTimeMs: elapsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[parse-hawb-cadastro] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
