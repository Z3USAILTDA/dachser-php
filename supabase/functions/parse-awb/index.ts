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
      systemPrompt = `Você é um especialista em extração de dados de documentos AWB (Air Waybill) e House AWB para operações logísticas. 
Extraia as informações com ALTA PRECISÃO seguindo estas REGRAS:

1. CNPJ: EXATAMENTE 14 dígitos numéricos. Ignore sufixos como "01-76".
2. ORIGEM: Código IATA. Se não explícito, deduza do prefixo AWB (HAJ-xxxxx → HAJ)
3. DESTINO: Código IATA da cidade do destinatário (São Paulo=GRU, Rio=GIG, Curitiba=CWB, Viracopos=VCP)
4. CLIENTE: Procure "KLABIN" ou "ZF" no shipper/consignee
5. AWB NUMBER: Formato XXX-XXXXXXXX ou XXX XXXX XXXX

CAMPOS CRÍTICOS DE EXTRAÇÃO:
- SHIPPER/REMETENTE: Normalmente no topo do documento, campo "Shipper" ou "Expedidor". Extraia nome completo da empresa.
- CONSIGNEE/DESTINATÁRIO: Campo "Consignee" ou "Destinatário". Extraia nome completo + endereço.
- CARRIER/TRANSPORTADORA: Procure por "Carrier", "Airline", "Companhia Aérea" ou identifique pelo logo/cabeçalho (ex: Lufthansa, LATAM, Emirates, DHL, FedEx, UPS)
- GROSS WEIGHT/PESO BRUTO: Campo "Gross Weight", "Peso Bruto", "GRS WT" - valor em KG
- CHARGEABLE WEIGHT/PESO TAXÁVEL: Campo "Chargeable Weight", "Peso Taxável", "CHG WT" - valor em KG

Retorne APENAS JSON válido.`;

      userPrompt = `Analise este documento AWB/HAWB e extraia TODOS os dados com máxima precisão.

PROCURE ESPECIFICAMENTE:
1. **SHIPPER (Remetente)**: Campo no topo, nome da empresa exportadora/remetente
2. **CONSIGNEE (Destinatário)**: Nome + endereço completo do importador/destinatário  
3. **CARRIER (Transportadora)**: Companhia aérea ou forwarder (olhe cabeçalho, logo, "Issued by")
4. **GROSS WEIGHT (Peso Bruto)**: Número em KG, campo "Gross Weight" ou "GRS WT"
5. **CHARGEABLE WEIGHT (Peso Taxável)**: Número em KG, campo "Chargeable Weight" ou "CHG WT"

Retorne JSON:
{
  "awbNumber": "string (XXX-XXXXXXXX) ou null",
  "cnpj": "string (14 dígitos sem formatação) ou null",
  "origin": "string (código IATA 3 letras) ou null",
  "destination": "string (código IATA 3 letras) ou null", 
  "shipper": "string (NOME COMPLETO do remetente/expedidor) ou null",
  "consignee": "string (NOME COMPLETO + endereço do destinatário) ou null",
  "customer": "KLABIN ou ZF ou null",
  "deliveryAddress": "string (endereço de entrega) ou null",
  "carrier": "string (nome da transportadora/companhia aérea - ex: Lufthansa, LATAM, DHL) ou null",
  "grossWeight": "number (peso bruto em KG, apenas número) ou null",
  "chargeableWeight": "number (peso taxável em KG, apenas número) ou null",
  "routingLegs": ["array de códigos IATA de conexões"] ou null,
  "flightNumbers": ["array de números de voo"] ou null,
  "mrn": "string ou null",
  "hsCodes": ["array de códigos NCM/HS"] ou null,
  "dimensions": "string (LxWxH) ou null",
  "incoterms": "string (EXW, FOB, CIF, etc) ou null",
  "references": ["array de referências, POs, invoices"] ou null,
  "confidence": "high | medium | low"
}

REGRAS:
- grossWeight e chargeableWeight devem ser NÚMEROS, não strings
- shipper e consignee devem conter o NOME COMPLETO da empresa
- carrier deve ser o nome da companhia aérea ou forwarder (ex: "Lufthansa Cargo", "LATAM Cargo", "DHL Express")`;
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
