import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

const systemPrompt = `Você é um especialista em análise e conferência de documentos fiscais e financeiros brasileiros.
Sua tarefa é analisar COMPLETAMENTE os documentos fornecidos e realizar uma comparação detalhada.

INSTRUÇÕES IMPORTANTES:
1. EXTRAIA TODOS os dados do PDF (faturas, notas fiscais, invoices)
2. EXTRAIA TODOS os dados da planilha Excel que foi fornecida como texto
3. COMPARE item por item, identificando:
   - Itens que conferem perfeitamente (mesmo nome/descrição e valor)
   - Itens com diferenças de valor (mesmo nome, valores diferentes)
   - Itens que existem apenas no PDF
   - Itens que existem apenas no Excel
   - Discrepâncias de nomenclatura, unidade, quantidade
4. ANALISE o contexto geral:
   - Os totais conferem?
   - Há informações conflitantes?
   - Há itens suspeitos ou fora do padrão?

RETORNE OBRIGATORIAMENTE um JSON válido no seguinte formato:
{
  "pdfSummary": {
    "documentType": "tipo do documento",
    "totalValue": número_total,
    "itemCount": quantidade_de_itens,
    "metadata": {
      "emissor": "nome do emissor",
      "destinatario": "nome do destinatário",
      "data": "data do documento",
      "numero": "número do documento"
    },
    "extractedItems": [
      { "description": "descrição do item", "value": valor_numerico, "quantity": quantidade }
    ]
  },
  "excelSummary": {
    "totalValue": número_total,
    "itemCount": quantidade_de_itens,
    "extractedItems": [
      { "description": "descrição do item", "value": valor_numerico }
    ]
  },
  "comparison": {
    "matchedItems": [
      {
        "rowNumber": 1,
        "pdfItem": "nome no PDF",
        "excelItem": "nome no Excel",
        "pdfValue": valor_pdf,
        "excelValue": valor_excel,
        "difference": diferenca_absoluta,
        "status": "success|warning|error",
        "observation": "observação opcional"
      }
    ],
    "pdfOnlyItems": [
      { "description": "item só no PDF", "value": valor }
    ],
    "excelOnlyItems": [
      { "description": "item só no Excel", "value": valor }
    ],
    "totalDifference": diferenca_total
  },
  "analysis": {
    "overallStatus": "success|warning|error",
    "summary": "resumo da análise em português",
    "discrepancies": [
      { "type": "tipo", "description": "descrição", "severity": "low|medium|high" }
    ],
    "recommendations": ["recomendação 1", "recomendação 2"]
  }
}

REGRAS DE STATUS:
- "success": valores idênticos ou diferença menor que R$ 1
- "warning": diferença entre R$ 1 e R$ 50
- "error": diferença maior que R$ 50 ou item não encontrado

Responda APENAS com o JSON, sem markdown, sem explicações adicionais.`;

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

    const body = await req.json();
    const { pdfBase64, pdfFileName, excelContent, excelFileName } = body;

    if (!pdfBase64 || !excelContent) {
      return new Response(
        JSON.stringify({ error: "Both PDF (base64) and Excel content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing: PDF=${pdfFileName}, Excel=${excelFileName}, ExcelContent=${excelContent.length} chars`);

    const userPrompt = `Analise os seguintes documentos:

=== CONTEÚDO DA PLANILHA EXCEL (${excelFileName}) ===
${excelContent}

=== DOCUMENTO PDF ===
O PDF (${pdfFileName}) está anexado para sua análise.

Por favor, extraia TODOS os itens e valores de ambos os documentos e realize a comparação completa.`;

    console.log("Calling Anthropic Claude Sonnet 4...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: systemPrompt + "\n\n" + userPrompt },
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Anthropic error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;

    if (!content) {
      throw new Error("Empty response from AI");
    }

    console.log("Claude response received, parsing JSON...");

    let analysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Falha ao interpretar resposta da IA. Tente novamente.");
    }

    const processingTime = Date.now() - startTime;
    console.log(`Analysis completed in ${processingTime}ms`);

    analysisResult.metadata = {
      model: "claude-sonnet-4",
      processingTimeMs: processingTime,
      pdfFileName,
      excelFileName,
      tokensUsed: (aiResponse.usage?.input_tokens || 0) + (aiResponse.usage?.output_tokens || 0),
    };

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in compare-documents-llm:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro desconhecido ao processar documentos"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
