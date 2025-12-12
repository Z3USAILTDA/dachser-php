import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceItem {
  itemName: string;
  value: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing PDF: ${file.name}, size: ${file.size} bytes`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Process in chunks to avoid stack overflow
    const CHUNK_SIZE = 8192;
    let base64 = "";
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
      base64 += String.fromCharCode(...chunk);
    }
    const base64File = btoa(base64);

    const systemPrompt = `Você é um especialista em extração de dados de documentos fiscais e financeiros.
Sua tarefa é analisar o PDF fornecido (fatura, nota fiscal, invoice, etc.) e extrair TODOS os itens/linhas com seus respectivos valores monetários.

IMPORTANTE:
- Extraia CADA linha de item separadamente
- Capture o nome/descrição completa do item
- Capture o valor monetário de cada item (valor unitário ou total)
- Ignore cabeçalhos, totais gerais e informações não relacionadas a itens
- Se houver múltiplos valores por linha (quantidade, unitário, total), prefira o valor TOTAL da linha

Retorne um JSON válido no formato:
{
  "items": [
    { "itemName": "Nome do item/serviço", "value": 1234.56 },
    { "itemName": "Outro item", "value": 789.00 }
  ],
  "documentType": "invoice|nf|fatura|outro",
  "totalExtracted": 2023.56
}`;

    const userPrompt = `Analise este documento PDF e extraia todos os itens com seus valores. 
Retorne APENAS o JSON válido, sem explicações adicionais.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64File}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI Response:", content);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    const items: InvoiceItem[] = (parsed.items || []).map((item: any) => ({
      itemName: String(item.itemName || item.name || item.description || "Item sem nome"),
      value: parseFloat(String(item.value || item.valor || item.total || 0).replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
    }));

    console.log(`Extracted ${items.length} items from PDF`);

    return new Response(
      JSON.stringify({ 
        items,
        documentType: parsed.documentType || "unknown",
        totalExtracted: parsed.totalExtracted || items.reduce((sum, i) => sum + i.value, 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing invoice PDF:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
