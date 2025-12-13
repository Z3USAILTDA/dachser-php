import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// Prompts para a esteira CHB (Desembaraço) — revisão 2025-10 (HTML)
// =============================================================================

const CHB_FORMAT_HTML = `
FORMATO DE SAÍDA — HTML ESTRITO

- Produza EXATAMENTE um bloco entre:
  <<BEGIN_HTML>>
  ...conteúdo HTML...
  <<END_HTML>>

- Antes do bloco, imprima SOMENTE:
  1) "Olá, equipe."
  2) "Fontes | ..." (em linha única). (Opcional repetir no HTML; se repetir, mantenha igual.)

- Dentro do bloco gere SOMENTE HTML simples:
  • <p> para a linha "Fontes | …" (opcional).
  • Um <table> com <thead> e <tbody> seguindo as colunas da ETAPA:
    - Etapa 1: Campo | Fonte A | Fonte B | Fonte C | Observação | Status
    - Etapa 2: Campo | Pré-Alerta | Instrução | Observação | Status
    - Etapa 3: Campo | Consolidação (PA+Instr.) | Rascunho DI | Observação | Status
  • (Opcional) <p> "Observações" + <ul><li>…</li></ul> (máx. 3 itens) apenas se houver 🟨/🔴.
    - Liste PRIMEIRO os itens 🔴 (Discrepante), depois 🟨 (Parcial). Seja objetivo (≤ 120 caracteres por item).
    - Quando o erro estiver no rascunho da DI, inclua um bullet iniciando com "Onde está o erro: ",
      especificando o CAMPO da DI, o valor incorreto, o valor correto, e as bases.

  • (Opcional) <p> "Parecer do Modelo" + <ul><li>…</li></ul> com até 3 linhas:
    - "Impedimento para registrar a DI: Sim/Não — justificativa curta."
    - "Nível de risco consolidado: 🔴/🟨/✅ (1 linha)."
    - "Principal(ais) causa(s) crítica(s): …" (máx. 2 bullets; referencie o campo/célula).

- Proibido Markdown, <script>, estilos externos ou tags complexas. Use SOMENTE: p, table, thead, tbody, tr, th, td, ul, li.
- Números, datas, ND/Ilegível, tolerâncias e regras de NCM/peso conforme especificação.
`;

const CHB_TABLE_SPEC = `
REGRAS DE CONTEÚDO DA TABELA

1) Colunas fixas e ordem obrigatória:
   - Etapa 1:
     Campo | Fonte A | Fonte B | Fonte C | Observação | Status
   - Etapa 2:
     Campo | Pré-Alerta | Instrução | Observação | Status
   - Etapa 3:
     Campo | Consolidação (PA+Instr.) | Rascunho DI | Observação | Status

2) Referência de fontes:
   - Use apelidos curtos (ex.: ab12cd/p.4, /aba Itens).
   - Use o NOME REAL do arquivo fornecido.

3) Padronização:
   - Números: vírgula decimal; milhar com ponto (ex.: 10.841,0).
   - Datas: AAAA-MM-DD.
   - CNPJ: apenas dígitos.
   - Ausência: ND (ou Ilegível).
   - Status: use SÓ os ícones: ✅, 🟨, 🔴.

4) Larguras e corte:
   - Mantenha células concisas. Se >~40 caracteres, encurte e finalize com "…".
   - Priorize valor-chave primeiro; detalhe de fonte ao final (ex.: "10.841,0 kg (/p.2)").

5) Regras de PESO (Gross/Net/tara):
   - Se Gross(BL) ≈ Net(PL) e Gross(PL)-Net(PL) ≈ tara, ETAPA 1 deve ficar 🟨 com nota "BL possivelmente líquido; tara ≈ X kg".
   - Sem tara confiável ou divergência > tolerância → 🔴.
   - Tolerâncias (peso/CBM/valor total): discrepância relevante se > 0,5 (absoluto) OU > 0,3%.
   - Converter unidades quando necessário (lb → kg; tn → kg; ft³ → m³); reportar normalizado.
   - **Regra específica da ETAPA 3 (DI):** se **Peso Bruto (DI) ≈ Peso Líquido (PL)** e o PL trouxer Gross e Tara,
     classifique **🔴** e escreva explicitamente "DI usa líquido como bruto; corrigir para <Gross_PL> kg".

6) NCM — Regra aduaneira:
   - Validar RAIZ (4 dígitos) + compatibilidade da descrição técnica.
   - Múltiplos códigos: liste o principal + "(outros: …)" até 20 caracteres.
   - Divergência de raiz (ex.: 8536 × 8544) → 🔴. Divergência apenas no sufixo com descrição compatível → 🟨.

7) Incoterm × Condição de frete:
   - Comparar Incoterm (EXW/FCA/FOB/CFR/CIF/DAP/DDP etc.) e condição (Prepaid/Collect).
   - Incoterm coerente mas rótulo de frete ausente em alguma fonte → 🟨.
   - Incoterms diferentes (ex.: CFR × FOB) → 🔴.

8) Consolidação e cálculo:
   - Pode somar itens quando total não vier fechado (indicar "(soma)" na Observação).
   - Moeda: respeite a moeda da fatura; não converter câmbio; normalize símbolo (ex.: USD 12.345,67).

9) TOLERÂNCIA NUMÉRICA:
   - Valores como 97,3 e 97,30 são EQUIVALENTES (✅).
   - 10.841,00 e 10841 são EQUIVALENTES (✅).
   - Diferença < 0,01 em valores decimais = EQUIVALENTE (✅).
   - Apenas divergências > tolerância (0,5 absoluto OU 0,3%) devem ser marcadas.

10) Observações e Parecer:
   - Gere <p>Observações</p><ul>…</ul> (máx. 3 itens) APENAS se houver 🟨/🔴; **ordenar com 🔴 primeiro**.
   - Quando houver 🔴 com risco material (NCM raiz divergente; INCOTERMS conflitantes; Peso DI=Net PL; container/lacre ausente),
     inclua <p>Parecer do Modelo</p><ul>…</ul>.
`;

const EXTRACTION_INSTRUCTIONS = `
INSTRUÇÕES DE EXTRAÇÃO AVANÇADA

Você é um auditor especialista em documentos de comércio exterior (importação Brasil) com capacidade de:

1) ANÁLISE VISUAL PROFUNDA:
   - Examine CADA página completamente, incluindo cabeçalhos, rodapés, selos e carimbos.
   - Identifique tabelas, listas de itens, totalizadores.
   - Reconheça logos e identifique o tipo de documento (BL, Invoice, Packing List, AWB, DI, Instrução).
   - Leia texto em qualquer orientação (rotacionado, vertical).
   - NUNCA retorne ND se o valor estiver presente no documento.

2) OCR INTELIGENTE:
   - Para documentos escaneados, aplique OCR com máxima precisão.
   - Corrija erros comuns de OCR (0 vs O, 1 vs I, 5 vs S, etc.).
   - Mantenha formatação de números e datas.
   - Se um campo estiver parcialmente legível, extraia o que for possível.

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
   - Valide formato de CNPJ brasileiro (XX.XXX.XXX/XXXX-XX ou 14 dígitos).
   - Reconheça códigos NCM (8 dígitos, padrão brasileiro).
   - Identifique portos/aeroportos brasileiros.
   - Considere regras aduaneiras da Receita Federal.

6) EQUIVALÊNCIA DE VALORES:
   - Trate como IGUAIS: 97,3 = 97,30 = 97.30
   - Trate como IGUAIS: 10.841 = 10841 = 10.841,00
   - Ignore diferenças de formatação (vírgula vs ponto, zeros à direita).
   - Apenas marque como divergente se houver diferença REAL no valor numérico.
`;

function getPromptByStep(stepId: number, fileNames: string[]): string {
  const fileListText = fileNames.map((name, i) => `${i + 1}. ${name}`).join('\n');

  if (stepId === 1) {
    return `
SISTEMA — CRONOS (Etapa 1: Integridade do Pré-Alerta)

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: verificar consistência interna dos documentos do Pré-Alerta (entre si).
Use EXCLUSIVAMENTE os anexos fornecidos. Saída em pt-BR, **HTML simples**.

PADRÕES
- Números: vírgula decimal; milhar com ponto.
- Datas: AAAA-MM-DD.
- CNPJ: apenas dígitos.
- NCM: validar raiz (4 dígitos) + compatibilidade de descrição (resumo técnico).
- Unidades: peso em kg; volume em m³. Converter quando vier em outras unidades.
- Ausência: ND / Ilegível / N/A.
- Tolerâncias: Quant./preço unit. (> 1 un. OU > 0,5%); Totais (peso/CBM/valor) (> 0,5 abs OU > 0,3%).
- Regra de Peso (Gross vs Net / tara): aplicar conforme especificação.

ARQUIVOS PARA ANÁLISE (PRES-ALERTA):
${fileListText}

ITENS A VERIFICAR (ETAPA 1):
- Consignee / CNPJ
- Incoterm / condição de frete (Prepaid/Collect)
- Peso bruto total
- Volume/CBM total
- Dados de container (nº/tipo/lacre)
- NCM (raiz + descrição)
- Totais de mercadoria (moeda/valor)
- Datas principais (emissão/embarque, quando houver)

COLUNAS DA TABELA (ETAPA 1):
Campo | Fonte A | Fonte B | Fonte C | Observação | Status

Use os nomes REAIS dos arquivos nas colunas (ex.: Invoice.pdf, PackingList.pdf, BL.pdf).
Se houver apenas 2 arquivos, use 2 colunas de fonte.

${EXTRACTION_INSTRUCTIONS}
${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
  }

  if (stepId === 2) {
    return `
SISTEMA — CRONOS (Etapa 2: Pré-Alerta × Instrução)

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: comparar Pré-Alerta (referência) com Instrução de Despacho.
Os documentos de Pré-Alerta são a BASE; a Instrução deve ser CONFERIDA contra eles.

ARQUIVOS PARA ANÁLISE:
${fileListText}

PADRÕES
- Iguais à Etapa 1 (números, datas, CNPJ, NCM, tolerâncias, conversões de unidade).
- Reaplique a Regra de Peso (Gross vs Net / tara) quando pertinente.
- Quando houver múltiplas instruções, consolide a orientação prevalente (a mais recente ou marcada como válida).

CAMPOS A COMPARAR (ETAPA 2):
- Consignee/CNPJ
- Incoterm/condição de frete
- Peso bruto
- Volume/CBM
- NCM (raiz+desc)
- Container (nº/tipo/lacre)
- Totais de mercadoria
- Referências/PO
- Datas principais

COLUNAS DA TABELA (ETAPA 2):
Campo | Pré-Alerta | Instrução | Observação | Status

Consolide os dados do Pré-Alerta (Invoice, PL, BL) em uma coluna "Pré-Alerta".
Compare com a(s) Instrução(ões) na coluna "Instrução".

${EXTRACTION_INSTRUCTIONS}
${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
  }

  // stepId === 3
  return `
SISTEMA — CRONOS (Etapa 3: DI × (Pré-Alerta + Instrução))

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: confrontar Rascunho DI (e Checklist, se houver) com a Consolidação (PA+Instr.).
Esta é a VALIDAÇÃO FINAL antes do registro da Declaração de Importação.

ARQUIVOS PARA ANÁLISE:
${fileListText}

PADRÕES
- Iguais às Etapas 1 e 2; aplique a Regra de Peso (Gross vs Net / tara) quando aplicável.
- **REGRA CRÍTICA:** Se **Peso Bruto (DI) ≈ Peso Líquido (Packing)** e houver Tara no Packing, classifique **🔴** e escreva:
  "DI usa líquido como bruto; corrigir para <Gross_PL> kg (PL/p.X; BL/p.Y); dif=<Tara_PL> kg".
  Inclua bullet em "Observações" iniciando com "Onde está o erro: …" com a localização.
- Normalização de valores: reporte moeda conforme DI/Invoice; sem conversão cambial.

CAMPOS A COMPARAR (ETAPA 3):
- Consignee/CNPJ
- Incoterm/condição de frete
- Peso bruto
- Volume/CBM
- NCM (raiz+desc)
- Container (nº/tipo/lacre)
- Portos (origem/dest.)
- Datas principais
- Frete/Seguros/Despesas
- Referências/PO
- Observações críticas da Instrução (se afetarem o registro na DI)

COLUNAS DA TABELA (ETAPA 3):
Campo | Consolidação (PA+Instr.) | Rascunho DI | Observação | Status

Consolide os dados de Pré-Alerta + Instrução em "Consolidação (PA+Instr.)".
Compare com o Rascunho DI na segunda coluna.

ATENÇÃO MÁXIMA:
- DI deve refletir EXATAMENTE os dados consolidados.
- Qualquer divergência pode causar MULTA ou RETENÇÃO na RFB.
- O parecer final deve ser CONCLUSIVO sobre a viabilidade de registro.

${EXTRACTION_INSTRUCTIONS}
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
          detail: 'high',
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
  parecer: string;
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

  // Extract Parecer do Modelo section completely
  let parecer = '';
  const parecerMatch = response.match(/Parecer do Modelo[\s\S]*?(?=<<END_HTML>>|$)/i);
  if (parecerMatch) {
    // Extract the content after "Parecer do Modelo"
    const parecerContent = parecerMatch[0];
    
    // Extract impedimento
    const impedimentoMatch = parecerContent.match(/Impedimento para registrar a DI:\s*(Sim|Não)\s*[—-]\s*([^<\n]+)/i);
    if (impedimentoMatch) {
      parecer += `• Impedimento: ${impedimentoMatch[1]} — ${impedimentoMatch[2].trim()}\n`;
    }

    // Extract nível de risco
    const riscoMatch = parecerContent.match(/Nível de risco consolidado:\s*(🔴|🟨|✅)([^<\n]*)/i);
    if (riscoMatch) {
      parecer += `• Risco: ${riscoMatch[1]}${riscoMatch[2] ? ' ' + riscoMatch[2].trim() : ''}\n`;
    }

    // Extract causas críticas
    const causasMatch = parecerContent.match(/Principal\(ais\) causa\(s\) crítica\(s\):\s*([^<]+)/i);
    if (causasMatch) {
      parecer += `• Causas críticas: ${causasMatch[1].trim()}\n`;
    }
  }

  // Extract Observações section
  let observacoes: string[] = [];
  const obsSection = response.match(/Observações[\s\S]*?(?=Parecer|<<END_HTML>>|$)/i);
  if (obsSection) {
    const obsMatches = obsSection[0].match(/[🔴🟨✅]\s*[^:]+:\s*[^<\n]+/g);
    if (obsMatches) {
      observacoes = obsMatches.slice(0, 3).map(o => o.trim());
    }
  }

  // Build detailed summary
  const stepNames: Record<number, string> = { 1: 'Pré-Alerta', 2: 'Instrução', 3: 'DI/Fechamento' };
  const stepName = stepNames[stepId] || `Etapa ${stepId}`;
  
  let detailedSummary = `═══ ${stepName} ═══\n\n`;
  
  // Status summary
  detailedSummary += `📊 Resultado: `;
  if (errorCount > 0) detailedSummary += `${errorCount} crítico(s) 🔴  `;
  if (warningCount > 0) detailedSummary += `${warningCount} alerta(s) 🟨  `;
  if (successCount > 0) detailedSummary += `${successCount} conforme(s) ✅`;
  detailedSummary += '\n\n';
  
  // Add parecer if exists
  if (parecer) {
    detailedSummary += `📋 Parecer do Modelo:\n${parecer}\n`;
  }
  
  // Add key observations
  if (observacoes.length > 0) {
    detailedSummary += `📝 Principais observações:\n`;
    observacoes.forEach(obs => {
      detailedSummary += `${obs}\n`;
    });
  }

  // Simple summary for backward compatibility
  let summary = '';
  if (errorCount > 0) summary = `${errorCount} discrepância(s) encontrada(s). `;
  if (warningCount > 0) summary += `${warningCount} alerta(s). `;
  if (successCount > 0) summary += `${successCount} item(ns) conforme(s).`;
  if (!summary) summary = 'Análise concluída.';

  return { html, tags, summary, detailedSummary, parecer };
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

    const { html, tags, summary, detailedSummary, parecer } = extractHtmlAndTags(responseText, stepId);

    return new Response(
      JSON.stringify({
        id: crypto.randomUUID(),
        stepId,
        html,
        tags,
        summary,
        detailedSummary,
        parecer,
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
