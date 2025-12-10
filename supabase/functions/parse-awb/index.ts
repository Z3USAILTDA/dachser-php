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
      
      // Convert file to base64 - handle large files by processing in chunks
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Process in chunks to avoid stack overflow
      const CHUNK_SIZE = 8192;
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
        const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      file_base64 = btoa(binaryString);
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
      systemPrompt = `Você é um especialista em extração de dados de documentos AWB (Air Waybill) para operações logísticas. 
Extraia as informações com alta precisão seguindo estas REGRAS CRÍTICAS:

1. CNPJ: Deve ter EXATAMENTE 14 dígitos numéricos. Ignore sufixos como "01-76", esses são padrões de instrução, não CNPJs.
2. ORIGEM: Se não encontrar explicitamente, deduza do PREFIXO do AWB (ex: HAJ-xxxxx → origem = HAJ, MIA-xxxxx → origem = MIA)
3. DESTINO: Deduza da cidade do consignee/destinatário no Brasil usando códigos IATA (São Paulo=GRU/CGH, Rio=GIG/SDU, Curitiba=CWB)
4. CLIENTE: Identifique pelo texto do consignee/shipper - procure por "KLABIN" ou "ZF" no nome da empresa
5. AWB NUMBER: Formato típico: XXX-XXXXXXXX ou XXX-XXXX XXXX (prefixo de 3 letras + números)

Retorne APENAS um objeto JSON válido sem texto adicional.`;

      userPrompt = `Extraia as informações do AWB deste documento e retorne um JSON com estes campos exatos:
{
  "awbNumber": "string (formato: XXX-XXXXXXXX) ou null",
  "cnpj": "string (EXATAMENTE 14 dígitos, sem formatação) ou null",
  "origin": "string (código IATA 3 letras, deduza do prefixo AWB se não explícito) ou null",
  "destination": "string (código IATA 3 letras, deduza da cidade do destinatário) ou null", 
  "shipper": "string (nome do remetente/expedidor) ou null",
  "consignee": "string (nome completo + endereço do destinatário) ou null",
  "customer": "KLABIN ou ZF ou null (procure esses termos no consignee/shipper)",
  "deliveryAddress": "string (endereço completo de entrega) ou null",
  "carrier": "string (transportadora/companhia aérea) ou null",
  "grossWeight": "number (peso bruto em kg) ou null",
  "chargeableWeight": "number (peso taxável em kg) ou null",
  "routingLegs": "array de strings (aeroportos de conexão) ou null",
  "flightNumbers": "array de strings (números dos voos) ou null",
  "mrn": "string (Ref Othello ou MRN) ou null",
  "hsCodes": "array de strings (códigos NCM/HS) ou null",
  "dimensions": "string (dimensões da carga) ou null",
  "incoterms": "string (EXW, FOB, CIF, DAP, etc) ou null",
  "references": "array de strings (todas referências, POs, invoices) ou null",
  "confidence": "high | medium | low"
}

IMPORTANTE:
- CNPJ deve ter EXATAMENTE 14 dígitos numéricos (ignore padrões XX-XX que são sufixos de instrução)
- Para customer: Se encontrar "KLABIN" em qualquer lugar, retorne "KLABIN". Se encontrar "ZF", retorne "ZF".
- Use o prefixo do AWB como origem se não encontrar explicitamente (HAJ-xxxxx → HAJ)`;
    } else {
      // instruction document for ZF
      systemPrompt = `Você é um especialista em documentos de instrução logística.
Sua tarefa é extrair padrões de sufixo CNPJ de documentos de instrução ZF que indicam qual sufixo CNPJ deve ser usado baseado em critérios de entrega.
Procure por padrões como "CNPJ XX-XX" ou "XX-XX" que indicam filiais.`;

      userPrompt = `Extraia informações de sufixo CNPJ deste documento de instrução. Retorne um JSON:
{
  "cnpjSuffix": "string (sufixo de 4 dígitos como 0001, 0176, etc) ou null",
  "cnpjSuffixes": [
    {
      "suffix": "string (sufixo de 4 dígitos)",
      "criteria": "string (descrição de quando usar este sufixo)",
      "addressPattern": "string ou null (palavras-chave de endereço se mencionadas)"
    }
  ],
  "defaultSuffix": "string ou null",
  "references": "array de strings com padrões CNPJ como XX-XX ou menções de filial",
  "confidence": "high | medium | low"
}

IMPORTANTE: Procure especificamente por padrões "XX-XX" que indicam filial/sufixo CNPJ.`;
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
