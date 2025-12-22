import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('CHB_OPENAI_API_KEY');
    
    if (!openAIApiKey) {
      console.error('CHB_OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    let base64Image: string | null = null;
    let fileType = 'pdf';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      fileType = file.type.includes('pdf') ? 'pdf' : 'image';
    } else {
      // Handle JSON with base64 or URL
      const body = await req.json();
      
      if (body.base64) {
        base64Image = body.base64;
        fileType = body.fileType || 'pdf';
      } else if (body.fileUrl) {
        // Fetch file from URL
        const fileResponse = await fetch(body.fileUrl);
        const arrayBuffer = await fileResponse.arrayBuffer();
        base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        fileType = body.fileUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'image';
      }
    }

    if (!base64Image) {
      return new Response(
        JSON.stringify({ error: 'No file data provided', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${fileType} file for barcode extraction...`);

    // Use GPT-4o-mini with vision to extract the barcode
    const mediaType = fileType === 'pdf' ? 'application/pdf' : 'image/jpeg';
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em extração de dados de boletos bancários brasileiros.
Sua tarefa é extrair APENAS a linha digitável (código de barras) do boleto.

A linha digitável tem 47 ou 48 dígitos numéricos, geralmente formatada em grupos separados por pontos ou espaços.
Exemplo de formatos:
- 23793.38128 60000.000003 00009.001026 1 84350000050000
- 23793381286000000000300009001026184350000050000

RESPONDA APENAS com a linha digitável no formato limpo (apenas números) ou "NAO_ENCONTRADO" se não conseguir identificar.
NÃO inclua explicações, apenas os números.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia a linha digitável (código de barras) deste boleto bancário:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Error calling OpenAI API', details: errorText, success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log('Extracted text:', extractedText);

    // Clean up the extracted barcode (remove non-numeric characters)
    const cleanBarcode = extractedText.replace(/\D/g, '');
    
    // Validate barcode length (should be 47 or 48 digits)
    if (cleanBarcode.length === 47 || cleanBarcode.length === 48) {
      // Format the barcode for better readability
      const formattedBarcode = formatLinhaDigitavel(cleanBarcode);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          linhaDigitavel: cleanBarcode,
          linhaDigitavelFormatada: formattedBarcode,
          rawResponse: extractedText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (extractedText === 'NAO_ENCONTRADO' || cleanBarcode.length < 40) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Linha digitável não encontrada no documento',
          rawResponse: extractedText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Linha digitável com tamanho inválido (${cleanBarcode.length} dígitos, esperado 47 ou 48)`,
          linhaDigitavel: cleanBarcode,
          rawResponse: extractedText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in extract-boleto-barcode:', error);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Format linha digitável for better readability
function formatLinhaDigitavel(barcode: string): string {
  if (barcode.length === 47) {
    // Boleto bancário convencional
    return `${barcode.slice(0, 5)}.${barcode.slice(5, 10)} ${barcode.slice(10, 15)}.${barcode.slice(15, 21)} ${barcode.slice(21, 26)}.${barcode.slice(26, 32)} ${barcode.slice(32, 33)} ${barcode.slice(33)}`;
  } else if (barcode.length === 48) {
    // Arrecadação (concessionárias, taxas, etc)
    return `${barcode.slice(0, 11)}-${barcode.slice(11, 12)} ${barcode.slice(12, 23)}-${barcode.slice(23, 24)} ${barcode.slice(24, 35)}-${barcode.slice(35, 36)} ${barcode.slice(36, 47)}-${barcode.slice(47)}`;
  }
  return barcode;
}
