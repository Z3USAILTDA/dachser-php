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
- SHIPPER/REMETENTE: Extraia NOME COMPLETO da empresa + ENDEREÇO COMPLETO (rua, cidade, estado, país, CEP)
- CONSIGNEE/DESTINATÁRIO: Extraia NOME COMPLETO + ENDEREÇO COMPLETO + TELEFONE/FAX se houver + CNPJ formatado
- CARRIER/TRANSPORTADORA: IMPORTANTE - Extraia o CÓDIGO da companhia aérea do número do voo (ex: TP224 = TP, LH400 = LH, LA8001 = LA). Use o prefixo de 2 letras do primeiro voo listado.
- GROSS WEIGHT/PESO BRUTO: Campo "Gross Weight", "Peso Bruto", "GRS WT" - valor em KG
- CHARGEABLE WEIGHT/PESO TAXÁVEL: Campo "Chargeable Weight", "Peso Taxável", "CHG WT" - valor em KG

Retorne APENAS JSON válido.`;

      userPrompt = `Analise este documento AWB/HAWB e extraia TODOS os dados com máxima precisão.

PROCURE ESPECIFICAMENTE E EXTRAIA DADOS COMPLETOS:

1. **SHIPPER (Remetente)**: 
   - Nome da empresa + ENDEREÇO COMPLETO (rua, número, cidade, estado, CEP, país)
   - Exemplo: "ANDRITZ INC, 336 WEST PENN ST, MUNCY PA 17756 USA"

2. **CONSIGNEE (Destinatário)**: 
   - Nome da empresa + ENDEREÇO COMPLETO + telefone/fax + CNPJ formatado
   - Exemplo: "KLABIN S.A., HARMONIA, FAZENDA MONTE ALEGRE S/N, 84279-000, TELEMACO BORBA PR BRAZIL, PHO:+55 11 3046-5620, FAX:+55 11 3046-5850, CNPJ: 89.637.490/0133-95"

3. **CARRIER (Transportadora)**: 
   - EXTRAIA O CÓDIGO DE 2 LETRAS da companhia aérea do número do voo
   - Se voo é "TP224/03" → carrier = "TP" (TAP Air Portugal)
   - Se voo é "LH400" → carrier = "LH" (Lufthansa)
   - Se voo é "LA8001" → carrier = "LA" (LATAM)
   - NÃO use o nome do agente/forwarder como DACHSER

4. **GROSS WEIGHT (Peso Bruto)**: Número em KG
5. **CHARGEABLE WEIGHT (Peso Taxável)**: Número em KG

Retorne JSON:
{
  "awbNumber": "string (XXX-XXXXXXXX) ou null",
  "cnpj": "string (14 dígitos sem formatação) ou null",
  "origin": "string (código IATA 3 letras) ou null",
  "destination": "string (código IATA 3 letras) ou null", 
  "shipper": "string (NOME + ENDEREÇO COMPLETO do remetente) ou null",
  "consignee": "string (NOME + ENDEREÇO + TELEFONE + CNPJ FORMATADO do destinatário) ou null",
  "customer": "KLABIN ou ZF ou null",
  "deliveryAddress": "string (endereço de entrega) ou null",
  "carrier": "string (CÓDIGO DE 2 LETRAS da companhia aérea - ex: TP, LH, LA, AA, UA) ou null",
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

REGRAS IMPORTANTES:
- grossWeight e chargeableWeight devem ser NÚMEROS, não strings
- shipper deve conter NOME + ENDEREÇO COMPLETO (rua, cidade, estado, CEP, país)
- consignee deve conter NOME + ENDEREÇO + TELEFONE/FAX + CNPJ formatado (se disponível)
- carrier deve ser o CÓDIGO DE 2 LETRAS extraído do número do voo, NÃO o nome do agente de carga`;
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
