import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Formato de saída detalhado
const CHB_FORMAT_HTML = `
FORMATO DE SAÍDA — HTML ESTRITO

- Produza EXATAMENTE um bloco entre:
  <<BEGIN_HTML>>
  ...conteúdo HTML...
  <<END_HTML>>

- Dentro do bloco gere SOMENTE HTML simples:

1) Um <table> com <thead> e <tbody>:
   - Primeira coluna: "Campo" (ex.: Consignee, CNPJ, Peso Bruto, NCM, etc.)
   - Colunas seguintes: Use o NOME REAL DO ARQUIVO como cabeçalho (ex.: "Invoice_123.pdf", "HBL_draft.pdf")
   - Última coluna: "Status" (✅, 🟨 ou 🔴)

2) Após a tabela, uma seção <h4>Observações</h4> com parágrafos <p>:
   - Formato obrigatório: "🔴 [Título do campo]: [Descrição detalhada do problema]. [Ação necessária ou impacto]."
   - Ou: "🟨 [Título do campo]: [Descrição do alerta]. [Recomendação]."
   - Cada observação em seu próprio <p>.

3) Após observações, uma seção <h4>Parecer do Modelo</h4> com:
   <p><strong>Impedimento para registrar a DI:</strong> Sim/Não — [justificativa detalhada explicando o motivo]</p>
   <p><strong>Nível de risco consolidado:</strong> 🔴 ou 🟨 ou ✅</p>
   <p><strong>Principal(ais) causa(s) crítica(s):</strong> [Lista detalhada das principais causas, separadas por ponto-e-vírgula se houver múltiplas]</p>

- Proibido: Markdown, <script>, estilos inline, CSS externo.
- Permitido SOMENTE: h4, p, strong, em, table, thead, tbody, tr, th, td, br, ul, li.
`;

const CHB_TABLE_SPEC = `
REGRAS DE CONTEÚDO E EXTRAÇÃO

1) EXTRAÇÃO MÁXIMA DE DADOS:
   - Leia CADA página de CADA documento com atenção máxima.
   - Use OCR quando necessário para documentos escaneados ou com baixa qualidade.
   - Extraia TODOS os campos relevantes, mesmo que parcialmente legíveis.
   - Se um valor estiver parcialmente visível, extraia o que for possível e marque como "parcial".

2) COLUNAS DA TABELA:
   - Campo | [Nome Arquivo 1] | [Nome Arquivo 2] | ... | Status
   - Use o nome REAL do arquivo em cada coluna header.

3) PADRONIZAÇÃO DE VALORES:
   - Números: vírgula decimal; milhar com ponto (ex.: 10.841,00).
   - Datas: DD/MM/AAAA.
   - CNPJ: formatado XX.XXX.XXX/XXXX-XX.
   - Ausência: "ND" (não disponível) ou "Ilegível".
   - Status: SOMENTE ícones ✅, 🟨, 🔴.

4) CAMPOS OBRIGATÓRIOS A VERIFICAR:
   - Consignee / Razão Social
   - CNPJ / Tax ID
   - Incoterm e Condição de Frete
   - Peso Bruto Total (kg)
   - Peso Líquido (se disponível)
   - Volume/CBM total
   - Número e Tipo de Container
   - Lacre(s)
   - NCM (raiz 4 dígitos + descrição)
   - Valor Total da Mercadoria (moeda)
   - Porto/Aeroporto de Origem
   - Porto/Aeroporto de Destino
   - Número do Conhecimento (HBL/HAWB/BL)
   - Datas principais (embarque, chegada)
   - Referências / PO numbers

5) REGRAS DE VALIDAÇÃO CRÍTICAS:
   
   a) PESO:
      - Se Gross(BL) ≈ Net(PL) → 🟨 com nota explicativa
      - Divergência > 0,5kg ou > 0,3% → 🔴
      - Tara implausível ou ausente → 🟨
   
   b) NCM:
      - Divergência na RAIZ (4 primeiros dígitos) → 🔴 CRÍTICO
      - Divergência apenas no sufixo → 🟨
      - Descrição incompatível com NCM → 🔴
   
   c) INCOTERM:
      - Incoterms diferentes entre docs → 🔴
      - Incoterm coerente mas sem rótulo explícito → 🟨
   
   d) CNPJ/CONSIGNEE:
      - CNPJ divergente → 🔴 CRÍTICO
      - Razão social diferente (mesmo CNPJ) → 🟨
   
   e) VALORES:
      - Divergência > 0,5 (absoluto) ou > 0,3% → avaliar criticidade
      - Moedas diferentes sem conversão → 🔴

6) TOLERÂNCIAS:
   - Quantidades/Preço unitário: > 1 unidade OU > 0,5%
   - Totais: > 0,5 absoluto OU > 0,3%
   - Pesos: > 0,5kg OU > 0,3%
`;

const EXTRACTION_INSTRUCTIONS = `
INSTRUÇÕES DE EXTRAÇÃO AVANÇADA

Você é um auditor especialista em documentos de comércio exterior com capacidade de:

1) ANÁLISE VISUAL PROFUNDA:
   - Examine cada página completamente, incluindo cabeçalhos, rodapés, selos e carimbos.
   - Identifique tabelas, listas de itens, totalizadores.
   - Reconheça logos e identifique o tipo de documento.
   - Leia texto em qualquer orientação (rotacionado, vertical).

2) OCR INTELIGENTE:
   - Para documentos escaneados, aplique OCR com máxima precisão.
   - Corrija erros comuns de OCR (0 vs O, 1 vs I, etc.).
   - Mantenha formatação de números e datas.

3) CROSS-REFERENCE:
   - Compare valores entre todos os documentos fornecidos.
   - Identifique referências cruzadas (ex.: BL number mencionado em Invoice).
   - Valide consistência de dados em múltiplas ocorrências.

4) DETECÇÃO DE PROBLEMAS:
   - Rasuras, correções manuais → 🟨 com nota
   - Campos obrigatórios em branco → 🔴
   - Inconsistências numéricas → calcule e reporte a diferença exata
   - Formatação suspeita ou alterações → 🟨

5) CONTEXTO BRASILEIRO:
   - Valide formato de CNPJ brasileiro.
   - Reconheça códigos NCM (8 dígitos, padrão brasileiro).
   - Identifique portos/aeroportos brasileiros.
   - Considere regras aduaneiras da Receita Federal.
`;

function getPromptByStep(stepId: number, fileNames: string[]): string {
  const fileListText = fileNames.map((name, i) => `${i + 1}. ${name}`).join('\n');

  const basePrompt = `
${EXTRACTION_INSTRUCTIONS}

ARQUIVOS PARA ANÁLISE:
${fileListText}

IMPORTANTE: Use os NOMES EXATOS DOS ARQUIVOS acima como cabeçalhos das colunas na tabela de resultados.

${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;

  if (stepId === 1) {
    return `
SISTEMA — CRONOS (Etapa 1: Integridade do Pré-Alerta)

Você é o CRONOS, auditor especialista em logística de importação brasileira.

OBJETIVO: Verificar a consistência INTERNA dos documentos do Pré-Alerta (entre si).
Analise se os dados estão coerentes dentro do mesmo conjunto documental.

${basePrompt}

FOCO DA ETAPA 1:
- Verificar se todos os documentos referem-se ao mesmo embarque
- Validar consistência de dados entre Invoice, Packing List, BL/AWB
- Identificar campos faltantes ou ilegíveis
- Reportar qualquer discrepância interna
`;
  }

  if (stepId === 2) {
    return `
SISTEMA — CRONOS (Etapa 2: Pré-Alerta × Instrução)

Você é o CRONOS, auditor especialista em logística de importação brasileira.

OBJETIVO: Comparar os documentos do Pré-Alerta (referência) com a Instrução de Despacho.
Os documentos de Pré-Alerta são a BASE; a Instrução deve ser CONFERIDA contra eles.

${basePrompt}

FOCO DA ETAPA 2:
- Usar Pré-Alerta como fonte primária de verdade
- Verificar se Instrução reflete corretamente os dados do Pré-Alerta
- Identificar divergências entre o que foi instruído e o que consta nos documentos
- Alertar sobre campos da Instrução que diferem do Pré-Alerta
- Consolidar orientações quando houver múltiplas instruções
`;
  }

  // stepId === 3
  return `
SISTEMA — CRONOS (Etapa 3: DI × (Pré-Alerta + Instrução))

Você é o CRONOS, auditor especialista em logística de importação brasileira.

OBJETIVO: Confrontar o Rascunho da DI com a Consolidação (Pré-Alerta + Instrução).
Esta é a VALIDAÇÃO FINAL antes do registro da Declaração de Importação.

${basePrompt}

FOCO DA ETAPA 3 — CRÍTICO:
- DI deve refletir EXATAMENTE os dados consolidados de PA + Instrução
- Peso Bruto na DI ≈ Peso Líquido no Packing = ERRO GRAVE 🔴
- NCM na DI deve coincidir com documentos comerciais
- Valores na DI devem bater com Invoice/Consolidação
- Qualquer divergência pode causar MULTA ou RETENÇÃO na RFB
- Aplicar todas as validações com rigor máximo

ATENÇÃO: O parecer final deve ser CONCLUSIVO sobre a viabilidade de registro.
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
      try {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}]\n${atob(file.content)}`,
        });
      } catch {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Conteúdo binário não legível como texto`,
        });
      }
    }
  }

  // Add the prompt
  content.push({
    type: 'text',
    text: prompt,
  });

  console.log(`Calling Anthropic API with ${filesContent.length} files...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
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
          detail: 'high', // Use high detail for better extraction
        },
      });
    } else {
      try {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}]\n${atob(file.content)}`,
        });
      } catch {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Conteúdo binário não legível como texto`,
        });
      }
    }
  }

  // Add the prompt
  content.push({
    type: 'text',
    text: prompt,
  });

  console.log(`Calling OpenAI API with ${filesContent.length} files...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 16000,
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

function extractHtmlAndTags(response: string, stepId: number): { 
  html: string; 
  tags: { label: string; variant: 'success' | 'warning' | 'error' }[]; 
  summary: string;
  detailedSummary: string;
} {
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
    tags.push({ label: `${warningCount} Alerta`, variant: 'warning' });
  }
  if (errorCount > 0) {
    tags.push({ label: `${errorCount} Crítico`, variant: 'error' });
  }

  // Extract key findings for detailed summary
  const findings: string[] = [];
  
  // Extract impedimento
  const impedimentoMatch = response.match(/Impedimento para registrar a DI:\s*(Sim|Não)\s*[—-]\s*([^<\n]+)/i);
  if (impedimentoMatch) {
    findings.push(`Impedimento: ${impedimentoMatch[1]} — ${impedimentoMatch[2].trim()}`);
  }

  // Extract nível de risco
  const riscoMatch = response.match(/Nível de risco consolidado:\s*(🔴|🟨|✅)/);
  if (riscoMatch) {
    const riscoLabel = riscoMatch[1] === '🔴' ? 'Crítico' : riscoMatch[1] === '🟨' ? 'Alerta' : 'OK';
    findings.push(`Risco: ${riscoMatch[1]} ${riscoLabel}`);
  }

  // Extract causas críticas
  const causasMatch = response.match(/Principal\(ais\) causa\(s\) crítica\(s\):\s*([^<]+)/i);
  if (causasMatch) {
    findings.push(`Causas: ${causasMatch[1].trim().substring(0, 150)}${causasMatch[1].trim().length > 150 ? '...' : ''}`);
  }

  // Extract observações (first 2)
  const obsMatches = response.match(/[🔴🟨]\s*[^:]+:\s*[^<\n]+/g);
  if (obsMatches && obsMatches.length > 0) {
    const topObs = obsMatches.slice(0, 2).map(o => o.trim());
    findings.push(...topObs);
  }

  // Build detailed summary
  const stepNames = { 1: 'Pré-Alerta', 2: 'Instrução', 3: 'DI' };
  const stepName = stepNames[stepId as keyof typeof stepNames] || `Etapa ${stepId}`;
  
  let detailedSummary = `[${stepName}] `;
  if (errorCount > 0) {
    detailedSummary += `${errorCount} discrepância(s) crítica(s). `;
  }
  if (warningCount > 0) {
    detailedSummary += `${warningCount} alerta(s). `;
  }
  if (successCount > 0) {
    detailedSummary += `${successCount} item(ns) conforme(s). `;
  }
  
  if (findings.length > 0) {
    detailedSummary += '\n' + findings.join('\n');
  }

  // Simple summary for backward compatibility
  let summary = '';
  if (errorCount > 0) {
    summary = `${errorCount} discrepância(s) encontrada(s). `;
  }
  if (warningCount > 0) {
    summary += `${warningCount} alerta(s). `;
  }
  if (successCount > 0) {
    summary += `${successCount} item(ns) conforme(s).`;
  }
  if (!summary) {
    summary = 'Análise concluída.';
  }

  return { html, tags, summary, detailedSummary };
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
    console.log('Files:', files.map((f: any) => `${f.name} (${f.mimeType})`).join(', '));

    const fileNames = files.map((f: any) => f.name);
    const prompt = getPromptByStep(stepId, fileNames);
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

    const { html, tags, summary, detailedSummary } = extractHtmlAndTags(responseText, stepId);

    return new Response(
      JSON.stringify({
        id: crypto.randomUUID(),
        stepId,
        html,
        tags,
        summary,
        detailedSummary,
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
