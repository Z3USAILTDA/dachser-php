import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "PDF file is required (field: file)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[parse-hawb-cadastro] Processing file: ${file.name}, size: ${file.size}`);

    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    const prompt = `You are an expert at extracting data from HAWB (House Air Waybill) documents.
Extract ALL fields from this HAWB PDF and return a JSON object with the following structure.
If a field is not found, use null.

## CRITICAL: How to find the MAWB (awb_number)

You MUST attempt BOTH methods below before returning null for awb_number:

### Method 1 — Labeled MAWB
Look for labels like "MAWB", "Master AWB", "Air Waybill No", or in "Accounting Information" sections. The number format is XXX-XXXXXXXX (3-digit airline prefix + dash + 8 digits).

### Method 2 — Header triple pattern (VERY COMMON, DO NOT SKIP)
Many HAWB documents have a TOP HEADER with THREE separate fields arranged horizontally:
  Field 1: 3-digit airline prefix (e.g. "001", "020", "057", "074")
  Field 2: 3-letter IATA airport code (e.g. "MAD", "GRU", "MIA", "FRA")  
  Field 3: 7-8 digit number, possibly with spaces (e.g. "2208 4156", "78901234")

These may be separated by vertical bars "|", spaces, or table cell borders.
Example header: "001 | MAD | 2208 4156"
→ awb_number = "001-22084156" (prefix + dash + digits without spaces)
→ airport_departure can be deduced from "MAD" = Madrid Barajas

If you see this pattern, you MUST use it to construct awb_number as: prefix + "-" + number_without_spaces.
Only return null for awb_number if NEITHER method yields a result.

## HAWB vs MAWB distinction
- "awb_number" = the MASTER airway bill number (XXX-XXXXXXXX format)
- "hawb_number" = the HOUSE airway bill number (the forwarder's reference, usually the main/prominent number on a HAWB document)

Return ONLY valid JSON with these fields:
{
  "awb_number": "the MAWB/Master Air Waybill number (format: XXX-XXXXXXXX)",
  "hawb_number": "the HAWB/House Air Waybill number",
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
  "handling_info": "additional handling info",
  "pieces": "number of pieces as integer",
  "gross_weight_kg": "gross weight in kg as number",
  "rate_class": "rate class code",
  "chargeable_weight": "chargeable weight as number",
  "rate": "rate as number",
  "total_charge": "total charge as number",
  "nature_of_goods": "description of goods",
  "itn_number": "ITN/AES number if present",
  "packaging": "packaging description",
  "hs_code": "HS code if present",
  "volume_cbm": "volume in cbm as number",
  "dimensions": "dimensions string",
  "other_charges_agent": "other charges due agent as number",
  "other_charges_carrier": "other charges due carrier",
  "signature_name": "name in signature field",
  "signature_date": "date of signature",
  "signature_place": "place of signature",
  "total_prepaid": "total prepaid amount as number",
  "total_collect": "total collect amount as number",
  "consignee_name": "consignee name from document",
  "consignee_address": "consignee address from document",
  "consignee_cnpj": "consignee CNPJ if present"
}

Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-hawb-cadastro] Anthropic error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text || "";

    if (!content) {
      throw new Error("Empty response from Anthropic");
    }

    let extracted: any;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    } catch {
      console.error("[parse-hawb-cadastro] Failed to parse:", content.substring(0, 500));
      throw new Error("Falha ao interpretar resposta da IA");
    }

    const elapsed = Date.now() - startTime;
    console.log(`[parse-hawb-cadastro] Extraction done in ${elapsed}ms`);

    return new Response(JSON.stringify({ success: true, data: extracted, processingTimeMs: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[parse-hawb-cadastro] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
