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
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
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

    // Determine media type for Gemini API
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
