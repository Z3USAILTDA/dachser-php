import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prompts por etapa (adaptados do chb.txt)
const CHB_FORMAT_HTML = `
FORMATO DE SAÍDA — HTML ESTRITO

- Produza EXATAMENTE um bloco entre:
  <<BEGIN_HTML>>
  ...conteúdo HTML...
  <<END_HTML>>

- Antes do bloco, imprima SOMENTE:
  1) "Olá, equipe."
  2) "Fontes | ..." (em linha única).

- Dentro do bloco gere SOMENTE HTML simples:
  • <p> para a linha "Fontes | …" (opcional).
  • Um <table> com <thead> e <tbody> seguindo as colunas da ETAPA.
  • (Opcional) <p> "Observações" + <ul><li>…</li></ul> (máx. 3 itens) apenas se houver 🟨/🔴.
  • (Opcional) <p> "Parecer do Modelo" + <ul><li>…</li></ul> com até 3 linhas.

- Proibido Markdown, <script>, estilos externos ou tags complexas. Use SOMENTE: p, table, thead, tbody, tr, th, td, ul, li.
`;

const CHB_TABLE_SPEC = `
REGRAS DE CONTEÚDO DA TABELA

1) Colunas fixas e ordem obrigatória:
   - Etapa 1: Campo | Fonte A | Fonte B | Fonte C | ... | Observação | Status
   - Etapa 2: Campo | Pré-Alerta | Instrução | Observação | Status
   - Etapa 3: Campo | Consolidação (PA+Instr.) | Rascunho DI | Observação | Status

2) Referência de fontes: Use apelidos curtos (ex.: ab12cd/p.4).

3) Padronização:
   - Números: vírgula decimal; milhar com ponto (ex.: 10.841,0).
   - Datas: AAAA-MM-DD.
   - CNPJ: apenas dígitos.
   - Ausência: ND (ou Ilegível).
   - Status: use SÓ os ícones: ✅, 🟨, 🔴.

4) Larguras e corte: Mantenha células concisas. Se >~40 caracteres, encurte com "…".

5) Regras de PESO (Gross/Net/tara):
   - Se Gross(BL) ≈ Net(PL) e Gross(PL)-Net(PL) ≈ tara, marcar 🟨 com nota.
   - Sem tara confiável ou divergência > tolerância → 🔴.
   - Tolerâncias: discrepância relevante se > 0,5 (absoluto) OU > 0,3%.

6) NCM — Regra aduaneira:
   - Validar RAIZ (4 dígitos) + compatibilidade da descrição técnica.
   - Divergência de raiz → 🔴. Divergência apenas no sufixo → 🟨.

7) Incoterm × Condição de frete:
   - Incoterm coerente mas rótulo ausente → 🟨.
   - Incoterms diferentes → 🔴.

8) Gere colunas dinamicamente baseado na quantidade de arquivos fornecidos.
`;

function getPromptByStep(stepId: number, fileCount: number): string {
  const dynamicColumns = fileCount > 3 
    ? `Gere colunas dinâmicas para ${fileCount} fontes (Fonte A, Fonte B, Fonte C, Fonte D, etc.).`
    : '';

  if (stepId === 1) {
    return `
SISTEMA — CRONOS (Etapa 1: Integridade do Pré-Alerta)
Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: verificar consistência interna dos documentos do Pré-Alerta (entre si).
Saída em pt-BR, **HTML simples**.

${dynamicColumns}

PADRÕES
- Números: vírgula decimal; milhar com ponto.
- Datas: AAAA-MM-DD.
- CNPJ: apenas dígitos.
- NCM: validar raiz (4 dígitos) + compatibilidade de descrição.
- Unidades: peso em kg; volume em m³.
- Ausência: ND / Ilegível / N/A.
- Tolerâncias: Quant./preço unit. (> 1 un. OU > 0,5%); Totais (> 0,5 abs OU > 0,3%).

ITENS A VERIFICAR
- Consignee / CNPJ
- Incoterm / condição de frete
- Peso bruto total
- Volume/CBM total
- Dados de container (nº/tipo/lacre)
- NCM (raiz + descrição)
- Totais de mercadoria (moeda/valor)
- Datas principais

${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
  }

  if (stepId === 2) {
    return `
SISTEMA — CRONOS (Etapa 2: Pré-Alerta × Instrução)
Objetivo: comparar Pré-Alerta (referência) com Instrução.
Saída em pt-BR, **HTML simples**.

${dynamicColumns}

PADRÕES
- Iguais à Etapa 1 (números, datas, CNPJ, NCM, tolerâncias).
- Quando houver múltiplas instruções, consolide a orientação prevalente.

CAMPOS A COMPARAR
- Consignee/CNPJ; Incoterm/condição de frete; Peso bruto; Volume/CBM;
  NCM (raiz+desc); Container (nº/tipo/lacre); Totais de mercadoria; Referências/PO; Datas principais.

${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
  }

  // stepId === 3
  return `
SISTEMA — CRONOS (Etapa 3: DI × (Pré-Alerta + Instrução))
Objetivo: confrontar Rascunho DI com a Consolidação (PA+Instr.).
Saída em pt-BR, **HTML simples**.

${dynamicColumns}

PADRÕES
- Iguais às Etapas 1 e 2; aplique a Regra de Peso quando aplicável.
- Se Peso Bruto (DI) ≈ Peso Líquido (Packing), classifique 🔴.

CAMPOS A COMPARAR
- Consignee/CNPJ; Incoterm/condição de frete; Peso bruto; Volume/CBM;
  NCM (raiz+desc); Container (nº/tipo/lacre); Portos (origem/dest.); Datas principais;
  Frete/Seguros/Despesas; Referências/PO.

${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
}

async function callAnthropicAPI(prompt: string, filesContent: { name: string; content: string; mimeType: string }[]): Promise<string> {
  const apiKey = Deno.env.get('CHB_ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('CHB_ANTHROPIC_API_KEY not configured');
  }

  const content: any[] = [];
  
  // Add files as images or documents
  for (const file of filesContent) {
    if (file.mimeType.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mimeType,
          data: file.content,
        },
      });
    } else if (file.mimeType === 'application/pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: file.content,
        },
      });
    } else {
      // For other types, try to send as text
      content.push({
        type: 'text',
        text: `[Arquivo: ${file.name}]\n${atob(file.content)}`,
      });
    }
  }

  // Add the prompt
  content.push({
    type: 'text',
    text: prompt,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: content,
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
  return data.content[0].text;
}

async function callOpenAIAPI(prompt: string, filesContent: { name: string; content: string; mimeType: string }[]): Promise<string> {
  const apiKey = Deno.env.get('CHB_OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('CHB_OPENAI_API_KEY not configured');
  }

  const content: any[] = [];

  // Add files as images
  for (const file of filesContent) {
    if (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf') {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.mimeType};base64,${file.content}`,
        },
      });
    } else {
      content.push({
        type: 'text',
        text: `[Arquivo: ${file.name}]\n${atob(file.content)}`,
      });
    }
  }

  // Add the prompt
  content.push({
    type: 'text',
    text: prompt,
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: content,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function extractHtmlAndTags(response: string): { html: string; tags: { label: string; variant: 'success' | 'warning' | 'error' }[]; summary: string } {
  // Extract HTML between markers
  const htmlMatch = response.match(/<<BEGIN_HTML>>([\s\S]*?)<<END_HTML>>/);
  const html = htmlMatch ? htmlMatch[1].trim() : response;

  // Count status icons
  const successCount = (response.match(/✅/g) || []).length;
  const warningCount = (response.match(/🟨/g) || []).length;
  const errorCount = (response.match(/🔴/g) || []).length;

  const tags: { label: string; variant: 'success' | 'warning' | 'error' }[] = [];
  
  if (successCount > 0) {
    tags.push({ label: `${successCount} Conforme`, variant: 'success' });
  }
  if (warningCount > 0) {
    tags.push({ label: `${warningCount} Parcial`, variant: 'warning' });
  }
  if (errorCount > 0) {
    tags.push({ label: `${errorCount} Discrepante`, variant: 'error' });
  }

  // Generate summary
  let summary = '';
  if (errorCount > 0) {
    summary = `${errorCount} discrepância(s) encontrada(s). `;
  }
  if (warningCount > 0) {
    summary += `${warningCount} item(ns) parcial(is). `;
  }
  if (successCount > 0) {
    summary += `${successCount} item(ns) conforme(s).`;
  }
  if (!summary) {
    summary = 'Análise concluída.';
  }

  return { html, tags, summary };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stepId, files } = await req.json();

    if (!stepId || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'stepId e files são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${files.length} files for step ${stepId}`);

    const prompt = getPromptByStep(stepId, files.length);
    let responseText: string;
    let usedFallback = false;

    // Try Anthropic first
    try {
      console.log('Attempting Anthropic API...');
      responseText = await callAnthropicAPI(prompt, files);
      console.log('Anthropic API succeeded');
    } catch (anthropicError) {
      console.error('Anthropic API failed, trying OpenAI fallback:', anthropicError);
      usedFallback = true;
      
      try {
        console.log('Attempting OpenAI API fallback...');
        responseText = await callOpenAIAPI(prompt, files);
        console.log('OpenAI API succeeded');
      } catch (openaiError) {
        console.error('OpenAI API also failed:', openaiError);
        throw new Error('Ambas as APIs (Anthropic e OpenAI) falharam');
      }
    }

    const { html, tags, summary } = extractHtmlAndTags(responseText);

    return new Response(
      JSON.stringify({
        id: crypto.randomUUID(),
        stepId,
        html,
        tags,
        summary,
        generatedAt: new Date().toLocaleString('pt-BR'),
        filesAnalyzed: files.map((f: any) => f.name),
        usedFallback,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-chb-documents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
