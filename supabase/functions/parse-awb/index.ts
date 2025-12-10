import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    let file_base64: string;
    let file_type: string;
    let document_type: string = 'house_awb';

    // Support both FormData and JSON input
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle FormData from client
      const formData = await req.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        throw new Error('No file provided in FormData');
      }

      console.log(`Received file: ${file.name}, type: ${file.type}, size: ${file.size}`);
      
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      file_base64 = btoa(String.fromCharCode(...uint8Array));
      file_type = file.type;
      document_type = formData.get('document_type')?.toString() || 'house_awb';
    } else {
      // Handle JSON input
      const json = await req.json();
      file_base64 = json.file_base64;
      file_type = json.file_type;
      document_type = json.document_type || 'house_awb';
    }

    if (!file_base64) {
      throw new Error('No file data provided');
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
  "awbNumber": "string or null",
  "cnpj": "string or null (just numbers, no formatting)",
  "origin": "string or null (3-letter IATA code)",
  "destination": "string or null (3-letter IATA code)", 
  "shipper": "string or null",
  "consignee": "string or null",
  "customer": "string or null (KLABIN, ZF, or other identified customer)",
  "deliveryAddress": "string or null",
  "carrier": "string or null",
  "grossWeight": "number or null",
  "chargeableWeight": "number or null",
  "routingLegs": "array of strings or null",
  "flightNumbers": "array of strings or null",
  "mrn": "string or null",
  "hsCodes": "array of strings or null",
  "dimensions": "string or null",
  "incoterms": "string or null",
  "references": "array of strings or null",
  "confidence": "high | medium | low"
}

If a field cannot be found, use null. Be precise with the CNPJ - extract only the numbers.
For customer: Look for KLABIN or ZF in the consignee/shipper names. If you find "KLABIN" anywhere, set customer to "KLABIN". If you find "ZF" anywhere, set customer to "ZF".`;
    } else {
      // instruction document for ZF
      systemPrompt = `You are an expert document parser specialized in logistics instruction documents.
Your task is to extract CNPJ suffix patterns from ZF instruction documents that indicate which CNPJ suffix should be used based on delivery criteria.`;

      userPrompt = `Extract CNPJ suffix information from this instruction document. Return a JSON object:
{
  "cnpjSuffix": "string (4-digit suffix like 0001, 0002, etc) or null",
  "cnpjSuffixes": [
    {
      "suffix": "string (4-digit suffix like 0001, 0002, etc)",
      "criteria": "string (description of when to use this suffix)",
      "addressPattern": "string or null (address keywords if mentioned)"
    }
  ],
  "defaultSuffix": "string or null",
  "references": "array of strings that might contain CNPJ patterns like XX-XX",
  "confidence": "high | medium | low"
}`;
    }

    // Determine media type for Gemini API
    let mediaType: string;
    if (file_type.includes('pdf')) {
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

    // Build message content with inline image/document
    const messageContent = [
      {
        type: 'text',
        text: userPrompt,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mediaType};base64,${file_base64}`,
        },
      },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageContent },
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Lovable AI response received');

    // Extract the text content from the response
    const textContent = data.choices?.[0]?.message?.content;
    if (!textContent) {
      throw new Error('No text content in response');
    }

    // Parse the JSON from the response
    let parsedData;
    try {
      // Try to extract JSON from the response (model might wrap it in markdown)
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw text:', textContent);
      throw new Error('Failed to parse AI response as JSON');
    }

    console.log('Parsed data:', JSON.stringify(parsedData));

    // Return data directly (not wrapped in success/data for backward compatibility)
    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Parse AWB error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
