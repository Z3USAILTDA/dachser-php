import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParseRequest {
  file_base64: string;
  file_type: string; // 'pdf' | 'image'
  document_type: 'house_awb' | 'instruction';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type, document_type } = await req.json() as ParseRequest;
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`Parsing ${document_type} document of type ${file_type}`);

    let systemPrompt: string;
    let userPrompt: string;

    if (document_type === 'house_awb') {
      systemPrompt = `You are an expert document parser specialized in air waybill (AWB) documents for logistics operations. 
Extract the following information from the document with high accuracy:
- AWB Number (HAWB - House Air Waybill number)
- CNPJ (Brazilian tax ID, format: XX.XXX.XXX/XXXX-XX or just numbers)
- Origin Airport Code (3-letter IATA code)
- Destination Airport Code (3-letter IATA code)
- Shipper/Consignee Name
- Customer identification (look for company names like KLABIN, ZF, or similar)
- Full delivery address if available

Return ONLY a valid JSON object with no additional text.`;

      userPrompt = `Extract the AWB information from this document and return a JSON object with these exact fields:
{
  "awb_number": "string or null",
  "cnpj": "string or null (just numbers, no formatting)",
  "origin_airport": "string or null (3-letter code)",
  "destination_airport": "string or null (3-letter code)", 
  "shipper_name": "string or null",
  "consignee_name": "string or null",
  "customer": "string or null (KLABIN, ZF, or other identified customer)",
  "delivery_address": "string or null",
  "confidence": "high | medium | low"
}

If a field cannot be found, use null. Be precise with the CNPJ - extract only the numbers.`;
    } else {
      // instruction document for ZF
      systemPrompt = `You are an expert document parser specialized in logistics instruction documents.
Your task is to extract CNPJ suffix patterns from ZF instruction documents that indicate which CNPJ suffix should be used based on delivery criteria.`;

      userPrompt = `Extract CNPJ suffix information from this instruction document. Return a JSON object:
{
  "cnpj_suffixes": [
    {
      "suffix": "string (4-digit suffix like 0001, 0002, etc)",
      "criteria": "string (description of when to use this suffix)",
      "address_pattern": "string or null (address keywords if mentioned)"
    }
  ],
  "default_suffix": "string or null",
  "confidence": "high | medium | low"
}`;
    }

    // Determine media type for Claude API
    let mediaType: string;
    if (file_type === 'pdf') {
      mediaType = 'application/pdf';
    } else if (file_type.includes('png')) {
      mediaType = 'image/png';
    } else if (file_type.includes('gif')) {
      mediaType = 'image/gif';
    } else if (file_type.includes('webp')) {
      mediaType = 'image/webp';
    } else {
      mediaType = 'image/jpeg';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: file_type === 'pdf' ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: file_base64,
                },
              },
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Claude response received');

    // Extract the text content from Claude's response
    const textContent = data.content?.find((c: any) => c.type === 'text');
    if (!textContent) {
      throw new Error('No text content in response');
    }

    // Parse the JSON from Claude's response
    let parsedData;
    try {
      // Try to extract JSON from the response (Claude might wrap it in markdown)
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw text:', textContent.text);
      throw new Error('Failed to parse Claude response as JSON');
    }

    console.log('Parsed data:', JSON.stringify(parsedData));

    return new Response(JSON.stringify({ 
      success: true, 
      data: parsedData,
      document_type 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse AWB error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
