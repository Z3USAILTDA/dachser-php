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

- Dentro do bloco gere SOMENTE HTML simples:

1) TABELA DE COMPARAÇÃO:
   <table>
   <thead><tr>
     <th>Campo</th>
     <th>[NOME_ARQUIVO_1]</th>
     <th>[NOME_ARQUIVO_2]</th>
     ... (uma coluna para CADA arquivo fornecido, usando o NOME REAL do arquivo)
     <th>Status</th>
   </tr></thead>
   <tbody>...</tbody>
   </table>

   REGRA CRÍTICA: O número de colunas deve corresponder EXATAMENTE ao número de arquivos + 2 (Campo e Status).
   Use o NOME EXATO de cada arquivo como cabeçalho de coluna (ex.: "Invoice_123.pdf", "PackingList.pdf").
   NÃO use "Fonte A", "Fonte B", "Fonte C" - use os nomes reais dos arquivos!

2) SEÇÃO OBSERVAÇÕES (apenas se houver 🟨 ou 🔴):
   <h4>Observações</h4>
   <p>🔴 [Campo]: [Descrição detalhada do problema, citando páginas/valores]. [Ação necessária].</p>
   <p>🟨 [Campo]: [Descrição do alerta]. [Recomendação].</p>
   
   Formato obrigatório:
   - Primeiro todos os 🔴 (críticos), depois os 🟨 (alertas)
   - Cada observação em seu próprio <p>
   - Citar páginas específicas (ex.: "p.1", "p.2")
   - Ser objetivo e específico sobre a divergência

3) SEÇÃO PARECER DO MODELO (obrigatório quando houver 🔴):
   <h4>Parecer do Modelo</h4>
   <p><strong>Impedimento para registrar a DI:</strong> Sim/Não — [justificativa detalhada]</p>
   <p><strong>Nível de risco consolidado:</strong> 🔴 ou 🟨 ou ✅</p>
   <p><strong>Principal(ais) causa(s) crítica(s):</strong> [Descrição detalhada citando o campo/linha da tabela]</p>

- Proibido: Markdown, <script>, estilos inline.
- Permitido SOMENTE: h4, p, strong, table, thead, tbody, tr, th, td.
`;

const CHB_TABLE_SPEC = `
REGRAS DE CONTEÚDO DA TABELA

1) COLUNAS DINÂMICAS — REGRA CRÍTICA:
   - A tabela deve ter: Campo | [Arquivo1] | [Arquivo2] | ... | Status
   - Use o NOME EXATO de cada arquivo como título da coluna
   - O número de colunas de dados = número de arquivos fornecidos
   - NUNCA use "Fonte A", "Fonte B" — sempre nomes reais dos arquivos

2) Padronização de valores:
   - Números: vírgula decimal; milhar com ponto (ex.: 10.841,00)
   - Datas: DD/MM/AAAA ou AAAA-MM-DD
   - CNPJ: formatado ou apenas dígitos
   - Ausência: "ND" (não disponível) ou "Ilegível"
   - Status: SOMENTE ícones ✅, 🟨, 🔴

3) TOLERÂNCIA NUMÉRICA — IMPORTANTE:
   - Valores como 97,3 e 97,30 são EQUIVALENTES (✅)
   - 10.841,00 e 10841 e 10.841 são EQUIVALENTES (✅)
   - Ignore zeros à direita e diferenças de formatação
   - Apenas divergências REAIS > 0,5 absoluto OU > 0,3% são relevantes

4) Regras de PESO (Gross/Net/tara):
   - Se Gross(BL) ≈ Net(PL) e há diferença de tara → 🟨 com nota explicativa
   - Divergência > tolerância sem explicação → 🔴
   - Se DI usa líquido como bruto → 🔴 CRÍTICO

5) NCM — Regra aduaneira:
   - Divergência na RAIZ (4 primeiros dígitos) → 🔴 CRÍTICO
   - Divergência apenas no sufixo com descrição compatível → 🟨

6) Incoterm × Condição de frete:
   - Incoterms diferentes (ex.: CFR × FOB) → 🔴
   - Incoterm coerente mas rótulo faltante → 🟨

7) CNPJ/Consignee:
   - CNPJ divergente → 🔴 CRÍTICO
   - Razão social diferente (mesmo CNPJ) → 🟨
`;

const EXTRACTION_INSTRUCTIONS = `
INSTRUÇÕES DE EXTRAÇÃO AVANÇADA

Você é um auditor especialista em documentos de comércio exterior (importação Brasil).

REGRA CRÍTICA — MINIMIZAR "ND":
- NUNCA retorne "ND" sem verificar TODAS as páginas de TODOS os documentos.
- Examine cabeçalhos, rodapés, selos, carimbos, tabelas secundárias.
- Procure sinônimos e variações de nomenclatura para cada campo:
  * Peso: "Gross Weight", "GW", "Peso Bruto", "Weight", "Brutto", "Total Weight"
  * Volume: "CBM", "Cubic Meters", "M³", "Volume", "Measurement"
  * Consignee: "Consignatário", "Importador", "Buyer", "Destinatário", "Notify Party"
  * NCM: "HS Code", "Tariff Code", "Código Aduaneiro", "NCM/SH"
  * Container: "Container No", "CNTR", "Contenedor", "Nº Container"
  * Incoterm: "Terms", "Delivery Terms", "Trade Terms", "Payment Terms"
- Cheque TODAS as abas de planilhas, mesmo que pareçam secundárias.
- Se encontrar em QUALQUER lugar do documento, NÃO marque como ND.
- Use "ND" SOMENTE se realmente não existir no documento após busca exaustiva.
- Se parcialmente legível, extraia o que for possível e marque referência da página.

ENTRADAS HETEROGÊNEAS:
- PDFs (digitáveis ou escaneados), DOC/DOCX, planilhas (XLS/XLSX), imagens, XML/JSON.
- Considere TODAS as fontes fornecidas.
- Planilhas multi-abas: trate CADA aba. Use "/aba <nome>" na referência.
- XML/JSON: interprete chaves usuais (ncm, hs_code, gross_weight, incoterm, consign*, invoice*, container*, seal*).
- OCR: aplique com máxima precisão. Corrija erros comuns (0↔O, 1↔I, 5↔S).
- Use "Ilegível" SOMENTE quando o OCR falhar completamente e o texto for irrecuperável.

PADRONIZAÇÃO:
- Números: vírgula p/ decimais; milhares com ponto; 2–3 casas.
- Unidades: peso em kg; volume em m³; converter quando necessário.
- Moeda: reporte moeda da fatura; normalize como "USD 12.345,67".
- Datas: AAAA-MM-DD.
- CNPJ: apenas dígitos.
- NCM: comparar raiz de 4 dígitos + compatibilidade da descrição.
- Rótulos de ausência: ND = não disponível (USAR COM PARCIMÔNIA); Ilegível = OCR ruim; N/A = não aplicável ao documento.

TOLERÂNCIAS (decisão de status):
- Quantidades/preços unit.: discrepância relevante se > 1 un. OU > 0,5%.
- Totais (valor/peso/CBM): discrepância relevante se > 0,5 (absoluto) OU > 0,3%.
- Equivalência: 97,3 = 97,30 = 97.30 (IGUAIS ✅); 10.841 = 10841 = 10.841,00 (IGUAIS ✅).

SEMÁFORO (usar literalmente):
- ✅ Conforme = Consistente ou presente sem conflito entre as fontes.
- 🟨 Parcial = falta em 1–2 fontes, baixa legibilidade ou pequena divergência dentro da margem.
- 🔴 Discrepante = conflito material (acima da tolerância; códigos/textos que mudem enquadramento; INC divergentes).

REGRAS POR CAMPO:
- Peso bruto: ✅ se convergem; 🟨 se ND/Ilegível sem conflito; 🔴 se diverge. Se Gross(BL)≈Net(PL) e diferença≈tara, marcar 🟨 e explicar.
- Consignee: ✅ equivalentes; 🟨 legível só em 1–2 fontes; 🔴 conflitantes.
- CNPJ: colunas sem CNPJ aplicável = N/A. ✅ válido; 🟨 Ilegível; 🔴 inválido ou conflitante.
- Incoterm/Frete: ✅ INC + condição convergem; 🟨 etiqueta faltante; 🔴 INC distintos.
- Container: ✅ coerente entre docs; 🟨 só em uma fonte; 🔴 conflitante.
- NCM: ✅ raiz 4 dígitos coincide; 🟨 listado em uma fonte; 🔴 códigos distintos com impacto.

CÁLCULOS PERMITIDOS (para evitar ND):
- Some itens quando total não vier fechado (informe "(soma)" na observação).
- Se peso/CBM/valor vier por item, CALCULE o total e reporte com "(calculado)".
- Reconheça sinônimos: "Gross weight"/"GW"/"Bruto"; "Net weight"/"NW"/"Líquido"; "CBM"/"Volume".
- Planilhas multi-abas: consolide valores distribuídos de TODAS as abas.
`;

function getPromptByStep(stepId: number, fileNames: string[]): string {
  const fileListText = fileNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  const columnHeaders = fileNames.join(' | ');

  if (stepId === 1) {
    return `
SISTEMA — CRONOS (Etapa 1: Integridade do Pré-Alerta)

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: verificar consistência interna dos documentos do Pré-Alerta (entre si).

ARQUIVOS PARA ANÁLISE:
${fileListText}

ESTRUTURA DA TABELA — CRÍTICO:
<table>
<thead><tr>
  <th>Campo</th>
  <th>${columnHeaders}</th>
  <th>Status</th>
</tr></thead>
...
</table>

Use EXATAMENTE os nomes dos arquivos acima como cabeçalhos de coluna.
NÃO use "Fonte A", "Fonte B" — use os nomes reais: ${columnHeaders}

CAMPOS A VERIFICAR:
- Consignee / CNPJ
- Incoterm / condição de frete
- Peso bruto total
- Volume/CBM total
- Container (nº/tipo/lacre)
- NCM (raiz + descrição)
- Valor total (moeda)
- Datas principais

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

ARQUIVOS PARA ANÁLISE:
${fileListText}

ESTRUTURA DA TABELA — CRÍTICO:
<table>
<thead><tr>
  <th>Campo</th>
  <th>${columnHeaders}</th>
  <th>Status</th>
</tr></thead>
...
</table>

Use EXATAMENTE os nomes dos arquivos: ${columnHeaders}
Os arquivos de Pré-Alerta são a BASE de comparação.

CAMPOS A COMPARAR:
- Consignee/CNPJ
- Incoterm/condição de frete
- Peso bruto
- Volume/CBM
- NCM (raiz+desc)
- Container (nº/tipo/lacre)
- Valor total
- Referências/PO
- Datas principais

${EXTRACTION_INSTRUCTIONS}
${CHB_FORMAT_HTML}
${CHB_TABLE_SPEC}
`;
  }

  // stepId === 3
  return `
SISTEMA — CRONOS (Etapa 3: DI × (Pré-Alerta + Instrução))

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: confrontar Rascunho DI com a Consolidação (PA+Instr.).
Esta é a VALIDAÇÃO FINAL antes do registro da Declaração de Importação.

ARQUIVOS PARA ANÁLISE:
${fileListText}

ESTRUTURA DA TABELA — CRÍTICO:
<table>
<thead><tr>
  <th>Campo</th>
  <th>${columnHeaders}</th>
  <th>Status</th>
</tr></thead>
...
</table>

Use EXATAMENTE os nomes dos arquivos: ${columnHeaders}

CAMPOS A COMPARAR:
- Consignee/CNPJ
- Incoterm/condição de frete
- Peso bruto (ATENÇÃO: DI ≈ Peso Líquido = 🔴)
- Volume/CBM
- NCM (raiz+desc)
- Container (nº/tipo/lacre)
- Portos (origem/dest.)
- Datas principais
- Frete/Seguros
- Referências/PO

ATENÇÃO MÁXIMA:
- DI deve refletir EXATAMENTE os dados dos documentos
- Qualquer divergência pode causar MULTA ou RETENÇÃO na RFB
- O parecer deve ser CONCLUSIVO sobre viabilidade de registro

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

async function callLovableAI(prompt: string, filesContent: { name: string; content: string; mimeType: string }[]): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const content: any[] = [];

  // Add files - Gemini supports PDFs, images and documents via inline_data
  for (const file of filesContent) {
    if (file.mimeType.startsWith('image/')) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.mimeType};base64,${file.content}`,
        },
      });
    } else if (file.mimeType === 'application/pdf') {
      // Gemini supports PDFs via inline_data with application/pdf mime type
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.mimeType};base64,${file.content}`,
        },
      });
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // For spreadsheets, try to decode as text or mark as binary
      try {
        const decoded = atob(file.content);
        // XLSX files are binary, so we'll note this
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Planilha Excel (dados binários). Por favor, analise baseado nos outros documentos disponíveis.`,
        });
      } catch {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Planilha Excel não legível diretamente.`,
        });
      }
    } else {
      // For other types, try to decode as text
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

  console.log(`Calling Lovable AI (Gemini) with ${filesContent.length} files...`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
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
    console.error('Lovable AI error:', response.status, errorText);
    
    // Check for specific rate limit errors
    if (response.status === 429) {
      throw new Error('Rate limit exceeded - tente novamente em alguns minutos');
    }
    if (response.status === 402) {
      throw new Error('Créditos insuficientes - adicione créditos ao workspace');
    }
    
    throw new Error(`Lovable AI error: ${response.status}`);
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
      console.error('Anthropic API failed, trying Lovable AI (Gemini) fallback:', anthropicError);
      usedFallback = true;
      
      try {
        console.log('Attempting Lovable AI (Gemini) fallback...');
        responseText = await callLovableAI(prompt, files);
        console.log('Lovable AI succeeded');
      } catch (geminiError) {
        console.error('Lovable AI also failed:', geminiError);
        throw new Error('Ambas as APIs (Anthropic e Gemini) falharam');
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
