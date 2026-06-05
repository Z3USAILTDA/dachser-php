import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client for database operations
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
}

// Helper function to log API calls to mariadb-proxy
async function logApiCall(params: {
  api_name: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  error_message?: string;
}) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'log_api_call',
        ...params,
        edge_function: 'analyze-chb-documents',
      }),
    });
  } catch (e) {
    console.error('[logApiCall] Failed to log:', e);
  }
}

// ============================================================================
// OCR EXTRACTION - Extract text from scanned/image PDFs using Gemini Vision
// ============================================================================

interface OcrResult {
  text: string;
  method: 'native' | 'vision-ocr';
  confidence: 'high' | 'medium' | 'low';
}

async function extractTextWithOCR(
  base64Content: string,
  mimeType: string,
  fileName: string
): Promise<OcrResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  console.log(`[OCR] Starting extraction for ${fileName} (${mimeType})`);
  
  // For PDFs, try native extraction first using Lovable AI Gateway
  
  if (mimeType === 'application/pdf') {
    console.log(`[OCR] Using Lovable AI Gateway for PDF: ${fileName}`);
    
    if (!LOVABLE_API_KEY) {
      console.error('[OCR] LOVABLE_API_KEY not configured');
      return { text: '', method: 'vision-ocr', confidence: 'low' };
    }
    
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extraia TODO o texto deste documento PDF de forma precisa e completa.
                   
INSTRUÇÕES CRÍTICAS:
1. Extraia CADA palavra, número e símbolo exatamente como aparecem
2. Mantenha a estrutura do documento (parágrafos, listas, tabelas)
3. Para tabelas, use formato: "Coluna1 | Coluna2 | Coluna3"
4. Preserve números com formatação original (ex: 10.841,00 ou 10,841.00)
5. NÃO interprete, NÃO resuma - apenas extraia o texto RAW
6. Se houver logos ou imagens com texto, extraia esse texto também
7. Para documentos em português, mantenha acentuação correta

Retorne APENAS o texto extraído, sem explicações ou marcadores adicionais.`
              },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64Content}` },
              },
            ],
          }],
          max_tokens: 32000,
          temperature: 0.1,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OCR] AI Gateway error for ${fileName}:`, response.status, errorText);
        return { text: '', method: 'vision-ocr', confidence: 'low' };
      }
      
      const result = await response.json();
      const extractedText = result.choices?.[0]?.message?.content || '';
      
      // Validate extraction quality
      const hasGoodText = extractedText.length > 100 &&
        (extractedText.match(/[a-zA-ZáéíóúàèìòùãõâêîôûçÁÉÍÓÚÀÈÌÒÙÃÕÂÊÎÔÛÇ]/g) || []).length > 50;
      
      if (hasGoodText) {
        console.log(`[OCR] Successfully extracted ${extractedText.length} chars from ${fileName} via Vision OCR`);
        return {
          text: `[Arquivo: ${fileName}]\n${extractedText}`,
          method: 'vision-ocr',
          confidence: extractedText.length > 500 ? 'high' : 'medium',
        };
      } else {
        console.warn(`[OCR] Vision OCR returned minimal text for ${fileName}: ${extractedText.length} chars`);
        return { text: extractedText, method: 'vision-ocr', confidence: 'low' };
      }
      
    } catch (error) {
      console.error(`[OCR] Error extracting with Vision for ${fileName}:`, error);
      return { text: '', method: 'vision-ocr', confidence: 'low' };
    }
  }
  
  // For images, always use Vision OCR
  if (mimeType.startsWith('image/')) {
    console.log(`[OCR] Using Lovable AI Gateway for image: ${fileName}`);
    
    if (!LOVABLE_API_KEY) {
      console.error('[OCR] LOVABLE_API_KEY not configured');
      return { text: '', method: 'vision-ocr', confidence: 'low' };
    }
    
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extraia TODO o texto visível nesta imagem de forma precisa.
Mantenha a estrutura e formatação. Para tabelas, use: "Coluna1 | Coluna2".
Preserve números exatamente como aparecem. Retorne APENAS o texto extraído.`
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Content}` },
              },
            ],
          }],
          max_tokens: 16000,
          temperature: 0.1,
        }),
      });
      
      if (!response.ok) {
        console.error(`[OCR] AI Gateway error for image ${fileName}`);
        return { text: '', method: 'vision-ocr', confidence: 'low' };
      }
      
      const result = await response.json();
      const extractedText = result.choices?.[0]?.message?.content || '';
      
      console.log(`[OCR] Extracted ${extractedText.length} chars from image ${fileName}`);
      return {
        text: `[Arquivo: ${fileName}]\n${extractedText}`,
        method: 'vision-ocr',
        confidence: extractedText.length > 200 ? 'high' : 'medium',
      };
      
    } catch (error) {
      console.error(`[OCR] Error extracting from image ${fileName}:`, error);
      return { text: '', method: 'vision-ocr', confidence: 'low' };
    }
  }
  
  // For other file types, return empty
  return { text: '', method: 'native', confidence: 'low' };
}

// ============================================================================
// EXCEL READER - Extract text from XLSX/XLS files for CHB analysis
// ============================================================================

async function extractExcelText(base64Content: string, fileName: string): Promise<string> {
  console.log(`[XLSX] Extracting text from: ${fileName}`);
  
  try {
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Dynamic import of xlsx library
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    
    // Read workbook
    const workbook = XLSX.read(bytes, { 
      type: 'array',
      sheetRows: 500 // Limit rows per sheet
    });
    
    console.log(`[XLSX] ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);
    
    let fullText = `[Arquivo Excel: ${fileName}]\n\n`;
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames.slice(0, 5)) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        // Get data as array of arrays
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
        
        if (data.length > 0) {
          fullText += `=== ABA: ${sheetName} ===\n`;
          
          // Convert to readable format
          for (let rowIdx = 0; rowIdx < Math.min(data.length, 300); rowIdx++) {
            const row = data[rowIdx];
            if (row && Array.isArray(row)) {
              const rowText = row
                .map(cell => String(cell || '').trim())
                .filter(cell => cell.length > 0)
                .join(' | ');
              if (rowText.trim().length > 0) {
                fullText += `${rowText}\n`;
              }
            }
          }
          fullText += '\n';
        }
      }
    }
    
    console.log(`[XLSX] Extracted ${fullText.length} chars from ${fileName}`);
    return fullText;
    
  } catch (error) {
    console.error(`[XLSX] Error extracting from ${fileName}:`, error);
    return `[Arquivo: ${fileName}] - Erro ao processar planilha Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
  }
}

// =============================================================================
// Prompts para a esteira CHB (Desembaraço) — revisão 2025-10 (HTML)
// =============================================================================

const CHB_FORMAT_HTML = `
FORMATO DE SAÍDA — HTML ESTRITO

- Produza EXATAMENTE um bloco entre:
  <<BEGIN_HTML>>
  ...conteúdo HTML...
  <<END_HTML>>

- ANTES do bloco HTML, produza uma linha de METADADOS no formato:
  <<METADATA>>
  MODAL: SEA ou AIR
  CLIENTE: [Nome do cliente/consignee extraído dos documentos]
  <<END_METADATA>>

- Dentro do bloco HTML gere SOMENTE HTML simples:

1) TABELA DE COMPARAÇÃO:
   <table>
   <thead><tr>
     <th>Status</th>
     <th>Campo</th>
     <th>[NOME_ARQUIVO_1]</th>
     <th>[NOME_ARQUIVO_2]</th>
     ... (uma coluna para CADA arquivo fornecido, usando o NOME REAL do arquivo)
   </tr></thead>
   <tbody>...</tbody>
   </table>

   REGRA CRÍTICA: 
   - Status vem PRIMEIRO para leitura rápida
   - O número de colunas deve corresponder EXATAMENTE ao número de arquivos + 2 (Status e Campo).
   - Use o NOME EXATO de cada arquivo como cabeçalho de coluna (ex.: "Invoice_123.pdf", "PackingList.pdf").
   - NÃO use "Fonte A", "Fonte B", "Fonte C" - use os nomes reais dos arquivos!

2) SEÇÃO OBSERVAÇÕES (OBRIGATÓRIO se houver 🟨 ou 🔴):
   <div class="observations-section">
   <h4>Observações</h4>
   <p class="obs-critico">🔴 <strong>[Campo]:</strong> [Descrição detalhada do problema, citando páginas/valores]. [Ação necessária].</p>
   <p class="obs-alerta">🟨 <strong>[Campo]:</strong> [Descrição do alerta]. [Recomendação].</p>
   </div>
   
   Formato obrigatório:
   - SEMPRE incluir esta seção se houver 🔴 ou 🟨 na tabela
   - Primeiro todos os 🔴 (críticos), depois os 🟨 (alertas)
   - Cada observação em seu próprio <p>
   - Citar páginas específicas (ex.: "p.1", "p.2", "aba: Resumo")
   - Ser objetivo e específico sobre a divergência

3) SEÇÃO PARECER DO MODELO (OBRIGATÓRIO quando houver qualquer 🔴):
   <div class="parecer-section">
   <h4>Parecer do Modelo</h4>
   <p><strong>Impedimento para registrar a DI:</strong> Sim/Não — [justificativa detalhada]</p>
   <p><strong>Nível de risco consolidado:</strong> 🔴 ALTO ou 🟨 MÉDIO ou ✅ BAIXO</p>
   <p><strong>Principal(ais) divergência(s):</strong> [Descrição detalhada citando o campo/linha da tabela]</p>
   </div>

4) SEÇÃO PRÓXIMAS AÇÕES (OBRIGATÓRIO quando houver pendências):
   <div class="actions-section">
   <h4>Próximas Ações</h4>
   <ul>
     <li>[Documento pendente ou ação corretiva necessária]</li>
     <li>[Segunda ação se aplicável]</li>
   </ul>
   </div>
   
   Incluir sempre que houver:
   - Documentos faltantes (Packing List, CE Mercante, etc.)
   - Ações corretivas antes do registro da DI
   - Validações pendentes com armador/agente

- Proibido: Markdown, <script>, estilos inline.
- Permitido SOMENTE: h4, p, strong, ul, li, table, thead, tbody, tr, th, td, div (com classes específicas).
`;

// Client config interface for personalized validation
interface ClientConfig {
  tolerancia_peso?: number;
  tolerancia_valor?: number;
  campos_obrigatorios?: string[];
  cliente_nome?: string;
  instrucoes_personalizadas?: string;
  // Novos campos de armador
  armador?: string;
  agente_destino?: string;
  contato_email?: string;
  prazo_resposta_dias?: number;
  porto_descarga_real?: string;
  // Tolerâncias de taxas acessórias
  tolerancia_taxas_acessorias_abs?: number;
  tolerancia_taxas_acessorias_pct?: number;
  // Regras fiscais
  beneficio_fiscal?: string;
  cfop_padrao?: string;
  estado_uf?: string;
  icms_diferido?: boolean;
}

function buildTableSpec(clientConfig?: ClientConfig): string {
  const toleranciaPeso = clientConfig?.tolerancia_peso ?? 2.0;
  const toleranciaValor = clientConfig?.tolerancia_valor ?? 1.0;
  const toleranciaTaxasAbs = clientConfig?.tolerancia_taxas_acessorias_abs ?? 50;
  const toleranciaTaxasPct = clientConfig?.tolerancia_taxas_acessorias_pct ?? 1.0;
  const camposObrigatorios = clientConfig?.campos_obrigatorios || ['peso_bruto', 'peso_liquido', 'valor_total', 'moeda', 'incoterm'];
  
  const camposLabel: Record<string, string> = {
    peso_bruto: 'Peso Bruto',
    peso_liquido: 'Peso Líquido',
    valor_total: 'Valor Total',
    valor_item: 'Valor por Item',
    moeda: 'Moeda',
    incoterm: 'Incoterm',
    valor_total_frete: 'Valor Total Frete',
    valor_seguro: 'Valor Seguro',
    quantidade: 'Quantidade',
    ncm: 'NCM',
    descricao: 'Descrição',
    // Novos campos - Fase A Ponto 2 e 7
    aeroporto_origem: 'Aeroporto Origem',
    aeroporto_destino: 'Aeroporto Destino',
    numero_master: 'Número Master',
  };
  
  const camposObrigatoriosText = camposObrigatorios.map(c => camposLabel[c] || c).join(', ');
  
  // Build fiscal rules section based on client config
  let fiscalRulesSection = '';
  if (clientConfig?.beneficio_fiscal || clientConfig?.estado_uf || clientConfig?.cfop_padrao) {
    fiscalRulesSection = `

11) REGRAS FISCAIS ESPECÍFICAS DO CLIENTE:`;
    
    if (clientConfig?.estado_uf) {
      const isDiferido = clientConfig?.icms_diferido || ['MG', 'SC', 'ES'].includes(clientConfig.estado_uf);
      fiscalRulesSection += `
   - ESTADO DO CLIENTE: ${clientConfig.estado_uf}
   - ICMS: ${isDiferido ? 'DIFERIDO (alertar se DI indica ICMS integral)' : 'INTEGRAL esperado'}`;
    }
    
    if (clientConfig?.beneficio_fiscal) {
      fiscalRulesSection += `
   - BENEFÍCIO FISCAL ATIVO: ${clientConfig.beneficio_fiscal}`;
      
      if (clientConfig.beneficio_fiscal === 'RECOF') {
        fiscalRulesSection += `
     → CFOP esperado: 3129 (se diferente → 🔴 CRÍTICO)
     → ICMS deve estar SUSPENSO (se integral → 🔴 CRÍTICO)
     → Verificar regime especial no draft DI`;
      } else if (clientConfig.beneficio_fiscal === 'DRAWBACK') {
        fiscalRulesSection += `
     → CFOP esperado: 3127 (se diferente → 🔴 CRÍTICO)
     → OBRIGATÓRIO: Ato Concessório no draft DI (se ausente → 🔴 CRÍTICO)
     → II e IPI isentos conforme ato`;
      } else if (clientConfig.beneficio_fiscal === 'EX_TARIFARIO') {
        fiscalRulesSection += `
     → II deve ser 0% (se diferente → 🔴 CRÍTICO)
     → Fundamento Legal obrigatório: 59 (se ausente → 🔴 CRÍTICO)
     → Verificar Ex-Tarifário válido para o NCM`;
      }
    }
    
    if (clientConfig?.cfop_padrao) {
      fiscalRulesSection += `
   - CFOP PADRÃO: ${clientConfig.cfop_padrao} (divergência = 🟨 alerta para verificação)`;
    }
  }
  
  // Build armador section based on client config
  let armadorSection = '';
  if (clientConfig?.armador || clientConfig?.agente_destino || clientConfig?.porto_descarga_real) {
    armadorSection = `

12) CONFIGURAÇÕES DE ARMADOR/AGENTE:`;
    
    if (clientConfig?.armador) {
      armadorSection += `
   - ARMADOR PADRÃO: ${clientConfig.armador}
     → Se BL indica armador diferente → 🟨 alertar para verificação`;
    }
    
    if (clientConfig?.agente_destino) {
      armadorSection += `
   - AGENTE DE DESTINO: ${clientConfig.agente_destino}`;
    }
    
    if (clientConfig?.porto_descarga_real) {
      armadorSection += `
   - PORTO DE DESCARGA REAL: ${clientConfig.porto_descarga_real}
     → Se documentos indicam porto diferente → 🟨 alertar discrepância`;
    }
    
    if (clientConfig?.contato_email && clientConfig?.prazo_resposta_dias) {
      armadorSection += `
   - Para divergências com armador, sugerir contato: ${clientConfig.contato_email}
   - Prazo de resposta esperado: ${clientConfig.prazo_resposta_dias} dias`;
    }
  }
  
  // Build taxas acessórias section
  let taxasSection = `

13) TOLERÂNCIA PARA TAXAS ACESSÓRIAS:
   - Valor absoluto: até USD/EUR ${toleranciaTaxasAbs} de diferença = ✅ tolerado
   - Valor percentual: até ${toleranciaTaxasPct}% do total = ✅ tolerado
   - Taxas acima desses limites → 🔴 CRÍTICO
   - Sempre validar despesas acessórias contra CE Mercante quando disponível`;
  
  return `
REGRAS DE CONTEÚDO DA TABELA

0) ⚠️ REGRA CRÍTICA DE CORRELAÇÃO DE ARQUIVOS (PRIORIDADE MÁXIMA):
   - CADA valor deve aparecer APENAS na coluna do arquivo de onde foi extraído
   - Valor encontrado no CCT.pdf → coluna "CCT.pdf" APENAS
   - Valor encontrado no HAWB.pdf → coluna "HAWB.pdf" APENAS
   - NUNCA inferir, copiar ou mover valores entre colunas de arquivos diferentes
   - Se um campo não existe em um arquivo específico → marcar como "ND" nessa coluna
   - PROIBIDO: Colocar valor do CCT na coluna do HAWB ou vice-versa
   - Esta regra é ABSOLUTA e deve ser seguida para TODOS os campos

   🔴 REGRA DE EXTRAÇÃO DEFENSIVA (NÃO VIOLAR!):
   
   ANTES DE INCLUIR QUALQUER VALOR NA TABELA, VERIFIQUE:
   1. Você LITERALMENTE viu esse texto/número no conteúdo do arquivo? 
      → Se NÃO → use "ND"
      → Se SIM → prossiga
   
   2. Esse valor está na coluna/seção correta do documento original?
      → Se NÃO → use "ND"  
      → Se SIM → prossiga
   
   3. Você está colocando esse valor na coluna do arquivo CORRETO?
      → Se está no CCT.pdf, só pode ir na coluna "CCT.pdf"
      → NUNCA copie valores entre colunas de arquivos diferentes
   
   EXEMPLOS DO QUE NÃO FAZER (PROIBIDO!):
   ❌ CCT mostra peso 501.5 → colocar 501.5 na coluna do HAWB também
   ❌ Invoice não tem peso → "inferir" peso do packing list
   ❌ Valor não encontrado → inventar ou estimar
   ❌ Campo ausente → copiar de outro documento
   ❌ "Achar" que um valor deveria existir → inventar
   
   EXEMPLOS DO QUE FAZER (CORRETO):
   ✅ CCT mostra peso 501.5 → coluna CCT = "501.5", outras = "ND" se não encontrar
   ✅ Invoice não tem peso → coluna Invoice = "ND"
   ✅ HAWB mostra peso 501,500 → coluna HAWB = "501,500"
   ✅ Campo não encontrado → "ND" (nunca inventar)

0.1) 🔴🔴🔴 REGRA CRÍTICA — AGREGAÇÃO EM PACKING LIST / INVOICE (PRIORIDADE MÁXIMA):
   
   ⚠️ QUANDO O DOCUMENTO APRESENTA VALORES ITEMIZADOS (POR LINHA/ITEM):
   
   Documentos como Packing List e Invoice frequentemente apresentam valores POR ITEM
   em vez de um total único. VOCÊ DEVE SOMAR ESSES VALORES!
   
   INSTRUÇÕES OBRIGATÓRIAS PARA PESO BRUTO ITEMIZADO:
   1. Identifique CADA linha com "Gross Weight", "Peso Bruto", "GW" ou similar
   2. Extraia TODOS os valores numéricos de peso bruto por item
   3. SOME matematicamente todos os valores
   4. Use o RESULTADO DA SOMA como valor do campo "Peso Bruto" na coluna desse documento
   5. Adicione observação: "Peso Bruto calculado pela soma de X itens: [valor1] + [valor2] + ... = [total]"
   
   EXEMPLO PRÁTICO:
   Packing List contém:
   | Item   | Description    | Gross Weight |
   |--------|----------------|--------------|
   | 001    | Sensor XYZ     | 10,5 kg      |
   | 002    | Transmitter AB | 25,0 kg      |
   | 003    | Cable Set      | 15,0 kg      |
   
   → VOCÊ DEVE CALCULAR: 10,5 + 25,0 + 15,0 = 50,5 kg
   → Coluna "PackingList.pdf" para "Peso Bruto" = "50,5"
   → Observação: "Peso Bruto (PL) = soma de 3 itens: 10,5 + 25,0 + 15,0 = 50,5 kg"
   
   APLICA-SE TAMBÉM PARA:
   - Peso Líquido (Net Weight) itemizado → SOMAR todos
   - Quantidade de volumes por item → SOMAR todos  
   - Valor unitário por item → SOMAR para total
   
   EXCEÇÃO — NÃO AGREGAR QUANDO:
   - Documento já apresenta linha "Total", "Grand Total", "Subtotal" explícita
   - Nesse caso, usar o valor total explícito (não somar novamente)

1) COLUNAS DINÂMICAS — REGRA CRÍTICA:
   - A tabela deve ter: Status | Campo | [Arquivo1] | [Arquivo2] | ...
   - STATUS VEM PRIMEIRO para decisão rápida
   - Use o NOME EXATO de cada arquivo como título da coluna
   - O número de colunas de dados = número de arquivos fornecidos
   - NUNCA use "Fonte A", "Fonte B" — sempre nomes reais dos arquivos

2) Padronização de valores:
   - Números: vírgula decimal; milhar com ponto (ex.: 10.841,00)
   - Datas: DD/MM/AAAA preferencialmente
     → Se documento usa MM/DD/AAAA, converter para DD/MM/AAAA
     → ATENÇÃO: 05/12/2025 pode ser 5/Dez ou 12/Mai dependendo do formato original!
     → Na dúvida sobre formato, marcar como 🟨 com nota explicativa
   - CNPJ: formatado ou apenas dígitos
   - Ausência: "ND" (não disponível) ou "Ilegível"
   - Status: SOMENTE ícones ✅, 🟨, 🔴
   
   ⚠️ NORMALIZAÇÃO DE CARACTERES ANTES DE COMPARAR:
   - REMOVER caracteres especiais antes de qualquer comparação:
     → Hífen isolado no final: "10.841,00-" → "10.841,00"
     → Ponto-e-vírgula: "USD 1.500;00" → "USD 1.500,00"
     → Espaços extras entre números
     → Caracteres não-numéricos em valores monetários (exceto separadores decimais)
   - APÓS normalização, se valores são iguais → ✅ CONFORME
   - Aplicar normalização ANTES de qualquer comparação numérica

3) TOLERÂNCIA NUMÉRICA — APLICAÇÃO CORRETA:
   ⚠️ TOLERÂNCIA SE APLICA APENAS PARA DIFERENÇAS DE ARREDONDAMENTO/FORMATAÇÃO!
   - TOLERÂNCIA DE PESO: ${toleranciaPeso}% (para pequenas diferenças de arredondamento)
   - TOLERÂNCIA DE VALOR: ${toleranciaValor}% (para pequenas diferenças de arredondamento)
   - Valores como 97,3 e 97,30 são EQUIVALENTES (✅) — zeros à direita NÃO são divergência!
   - Valores como 97,3 e 97.30 são EQUIVALENTES (✅) — vírgula vs ponto decimal é formatação!
   - 10.841,00 e 10841 e 10.841 são EQUIVALENTES (✅)
   - Ignore zeros à direita e diferenças de formatação de decimais
   
   ⚠️ REGRA CRÍTICA DE ZEROS APÓS VÍRGULA (PONTO 4 — NÃO É DIVERGÊNCIA!):
   - 97,3 e 97,30 e 97,300 são EQUIVALENTES → ✅ CONFORME
   - 100 e 100,00 e 100,000 são EQUIVALENTES → ✅ CONFORME
   - 1.234,5 e 1.234,50 são EQUIVALENTES → ✅ CONFORME
   - NUNCA marcar como 🔴 ou 🟨 apenas por diferença em zeros decimais!
   - Normalizar ANTES de comparar: remover zeros trailing após decimal
   
   EXEMPLOS CORRETOS DE EQUIVALÊNCIA:
   | Valor 1     | Valor 2      | Status | Razão                    |
   |-------------|--------------|--------|--------------------------|
   | 97,3        | 97,30        | ✅     | Mesma quantidade         |
   | 1.000,00    | 1000         | ✅     | Formatação diferente     |
   | 97,3        | 97,4         | 🟨     | Diferença real (0,1)     |
   | 97,3        | 98,0         | 🟨/🔴  | Diferença real (0,7)     |
   
   ⚠️ REGRA CRÍTICA DE EQUIVALÊNCIA NUMÉRICA:
   - ANTES de comparar valores numéricos, NORMALIZAR:
     → Remover zeros à direita após decimal (97,30 → 97,3)
     → Tratar vírgula e ponto como decimal (97,3 = 97.3)
     → Remover separadores de milhar (10.841 = 10841)
   - SE valores normalizados são IGUAIS → ✅ CONFORME (obrigatório!)
   - NÃO marcar como divergente por diferença de formatação!
   
   ⚠️ TOLERÂNCIA NÃO SE APLICA QUANDO:
   - Valores são CLARAMENTE diferentes (ex.: 10.841 vs 12.500 → 🔴 DIVERGENTE)
   - Diferença > 20% → 🔴 OBRIGATÓRIO (independente da tolerância configurada)
   - Valores de ordens de magnitude diferentes → 🔴 CRÍTICO

4) CAMPOS OBRIGATÓRIOS (definidos pelo cliente):
   ${camposObrigatoriosText}
   - Se um campo obrigatório estiver ausente (ND) em QUALQUER documento → 🟨 (alerta)
   - Se um campo obrigatório tiver divergência acima da tolerância → 🔴 (crítico)

   ⚠️ CAMPOS A NÃO INCLUIR NA TABELA:
   - Data de Emissão / Issue Date — NÃO incluir como linha de comparação
   - Este campo não é relevante para a conferência documental

5) Regras de PESO — CRÍTICO (linhas separadas obrigatórias):
   - PESO BRUTO (Gross Weight): linha própria na tabela
   - PESO LÍQUIDO (Net Weight): linha própria na tabela (NÃO assumir Gross como padrão)
   - TARA: linha própria quando presente
   
   ⚠️ REGRA CRÍTICA — DIFERENÇA BRUTO vs LÍQUIDO É NORMAL:
   - Peso Bruto > Peso Líquido é comportamento ESPERADO
   - A diferença representa tara/embalagem
   - NÃO marcar como divergência quando Bruto ≠ Líquido NO MESMO DOCUMENTO
   - Divergência é quando o MESMO campo difere ENTRE documentos:
     → Peso Bruto no Doc A ≠ Peso Bruto no Doc B → 🔴 divergência
     → Peso Bruto ≠ Peso Líquido no mesmo doc → ✅ NORMAL (não alertar!)
   
   - Se Gross(BL) ≈ Net(PL) e há diferença de tara → 🟨 com nota explicativa
   - Divergência do MESMO campo > ${toleranciaPeso}% entre documentos → 🔴
   - Se DI usa líquido como bruto → 🔴 CRÍTICO
   
   (Regra de agregação de peso itemizado está na seção 0.1 acima — aplicar SEMPRE!)

6) INCOTERM e VALOR TOTAL FRETE — LINHAS SEPARADAS OBRIGATÓRIAS:
   - INCOTERM: linha própria (ex.: FOB, CFR, CIF, EXW, etc.)
   - VALOR TOTAL FRETE: linha própria (frete + taxas acessórias combinados)
   - NUNCA criar linha separada "Frete" isolado — usar apenas "Valor Total Frete"
   - Incoterms diferentes (ex.: CFR × FOB) → 🔴
   - Incoterm coerente mas rótulo faltante → 🟨

   🔴🔴🔴 REGRA DE CONSISTÊNCIA — INCOTERM vs TIPO DE FRETE (VALIDAÇÃO CRUZADA OBRIGATÓRIA):
   - FCA, EXW, FOB → frete tipicamente COLLECT (comprador paga/organiza o frete)
   - CIF, CFR, CPT, CIP, DDP, DAP → frete tipicamente PREPAID (vendedor paga o frete)
   
   VALIDAÇÃO CRUZADA:
   - Se BL/AWB mostra frete "Prepaid" mas Incoterm é FCA/EXW/FOB → 🔴 CRÍTICO (contradição: vendedor pagou frete mas Incoterm indica que comprador deveria pagar)
   - Se BL/AWB mostra frete "Collect" mas Incoterm é CIF/CFR/CPT/CIP/DDP/DAP → 🔴 CRÍTICO (contradição: comprador pagando frete mas Incoterm indica que vendedor deveria pagar)
   - Registrar na tabela com status 🔴 E nas observações com 🔴 explicando a contradição
   - Esta validação tem PRIORIDADE MÁXIMA — mesmo que cada campo individualmente esteja correto, a COMBINAÇÃO pode ser inconsistente

7) VALORES — REGRAS CRÍTICAS (ATENÇÃO MÁXIMA — DIFERENCIE CLARAMENTE):

   ⚠️ EXISTEM TRÊS VALORES DISTINTOS — NÃO CONFUNDA!
   
    A) VALOR TOTAL DA MERCADORIA (Invoice Amount / Merchandise Value):
       - É o valor TOTAL dos produtos na Invoice comercial
       - Sinônimos: "Total Items", "Merchandise Total", "Subtotal", "Total Goods Value", "Commercial Value"
       - Linha da tabela: "Valor Mercadoria"
       - ⚠️ NÃO usar "Final Amount" ou "Total Amount" para mercadoria (podem incluir frete!)
       
       ⚠️ REGRA ESPECIAL — DIVERGÊNCIAS SÃO NORMAIS E ESPERADAS:
       - Cada Invoice pode ter um valor diferente (múltiplas invoices por processo)
       - O Draft DI confere o VALOR TOTAL CONSOLIDADO de todas as invoices
       - Portanto, divergências entre invoices individuais NÃO devem gerar alerta
       - Status para "Valor Mercadoria": SEMPRE ✅ CONFORME (mesmo com valores diferentes)
       - Registrar os valores encontrados na seção Observações de forma INFORMATIVA (sem ícone de alerta)
   
    B) VALOR TOTAL FRETE (campo unificado — NÃO criar "Frete" isolado):
       - Incluir frete + taxas acessórias em uma ÚNICA linha
       - ONDE PROCURAR (regra de ouro — SEMPRE o valor consolidado no RODAPÉ da coluna):
         → CCT/BL/AWB: SEMPRE a linha final rotulada "Total Prepaid" ou "Total Collect"
           (rodapé da coluna), que já SOMA frete + Weight/Valuation Charge + Tax +
           Total Other Charges Due Agent + Total Other Charges Due Carrier + packaging.
         → ⛔ NUNCA usar a linha intermediária "Collect" / "Prepaid" / "Freight Charge" /
           "Weight Charge" / "WT/VAL" / "Valuation Charge" sozinha — esses são PARCIAIS
           (frete antes das taxas) e NÃO representam o valor total cobrado.
         → REGRA OBRIGATÓRIA PARA CCT/AWB EM PORTUGUÊS:
           Quando existir tabela "Totais na moeda de origem" com colunas "Prepaid" e "Collect",
           usar SEMPRE o valor da linha final "Total" da coluna que contém valor monetário.
           NUNCA usar isoladamente as linhas "Por Peso", "Por Valor", "Impostos",
           "Outros Serviços (Agente de Carga)" ou "Outros Serviços (Transportador)" —
           todas são componentes PARCIAIS do frete.
           Exemplo: "Por Peso" = EUR 25,00 e "Total" = EUR 220,00 →
           Valor Total Frete DEVE ser EUR 220,00, nunca EUR 25,00.
         → Packing List: geralmente não tem (ND é aceitável)
       - Sinônimos VÁLIDOS para frete (em ordem de PRIORIDADE):
         1º (preferencial): "Total Prepaid", "Total Collect"
            ou linha "Total" em tabela "Totais na moeda de origem" / Prepaid / Collect
         2º (fallback APENAS se não houver "Total ..."): "Total Charges", "Freight",
            "Frete", "Freight Charges", "Ocean Freight", "Air Freight"
       - Linha da tabela: "Valor Total Frete"
       - ⚠️ Campo "Frete" isolado NÃO deve existir na tabela — usar SEMPRE "Valor Total Frete"
       - ATENÇÃO: Frete pode ser "COLLECT" ou "PREPAID" — indicar na observação

       
       🔴🔴🔴 REGRAS ANTI-CONFUSÃO DE FRETE (PRIORIDADE MÁXIMA):
       
       CHECKLIST OBRIGATÓRIO antes de preencher "Valor Total Frete":
       1. O valor que estou colocando como frete vem de uma linha EXPLICITAMENTE rotulada 
          como "Freight", "Frete", "Charges", "Ocean Freight", "Air Freight"?
          → Se NÃO → NÃO é frete! Usar "ND" para esse documento.
          → Se SIM → Pode usar como frete.
       
       ERROS COMUNS QUE VOCÊ NÃO DEVE COMETER:
        ❌ "Por Peso" / "Weight Charge" em CCT/AWB → NÃO é valor total de frete; é apenas componente parcial
        ❌ "Por Valor" / "Valuation Charge" em CCT/AWB → NÃO é valor total de frete; é apenas componente parcial
        ❌ "Impostos" / "Tax" em CCT/AWB → NÃO é valor total de frete; é apenas componente parcial
        ❌ "Outros Serviços" em CCT/AWB → NÃO é valor total de frete; é apenas componente parcial
        ✅ Se existir linha "Total" na mesma tabela Prepaid/Collect, ela tem prioridade absoluta
       ❌ "Total net" em Invoice → NÃO é frete (é total da fatura ou valor mercadoria)
       ❌ "Amount Due" em Invoice → NÃO é frete (é total a pagar da fatura)
       ❌ "Total Amount" em Invoice → NÃO é frete (é total da fatura)
       ❌ "Final Amount" em Invoice → NÃO é frete (é total final da fatura)
       ❌ "Grand Total" em Invoice → NÃO é frete (é total geral da fatura)
       ❌ "Subtotal" em Invoice → NÃO é frete (é subtotal de mercadoria)
       ❌ Valor de mercadoria sendo colocado na linha de frete → PROIBIDO!
       
       REGRA PARA INVOICES COMERCIAIS:
       - Se a Invoice é uma fatura comercial e NÃO tem uma linha EXPLÍCITA de 
         "Freight/Frete/Charges", o campo "Valor Total Frete" DEVE ser "ND" para essa Invoice
       - "Amount Due", "Total Amount", "Final Amount", "Grand Total" em Invoice comercial 
         são geralmente o TOTAL DA FATURA (mercadoria + eventuais taxas), NÃO o frete isolado!
       
       ONDE FRETE REALMENTE APARECE:
       ✅ CCT/BL/AWB: Coluna "Prepaid" ou "Collect" → É frete
       ✅ Invoice com linha "Freight: USD 500" → É frete
       ✅ Documento de transporte com "Total Charges" → É frete
       ✅ Draft DI campo "Valor Frete" em moeda estrangeira → É frete
   
   C) VALOR SEGURO (apenas para arquivos de seguro):
      - Apenas quando há arquivo de seguro (Insurance.pdf, Seguro.pdf, Apólice.pdf)
      - Procurar por: "ADDED VALUE SERVICES FEE", "Insurance Amount", "Premium", "Coverage Value"
      - Linha da tabela: "Valor Seguro"
      - ⚠️ Se arquivo de seguro existe → campo "Valor Seguro" é OBRIGATÓRIO
      - Se NÃO existe arquivo de seguro → NÃO incluir linha "Valor Seguro" na tabela
   
   D) REGRA ESPECIAL PARA "TOTAL NET" EM INVOICES:
      ⚠️ REGRA ABSOLUTA: "Total net" em Invoice NUNCA é "Valor de Frete"!
      
      CENÁRIO A — Invoice COM linha de frete:
      Se a Invoice contém uma linha de frete/freight ANTES de "Total net":
      1. Procurar o valor que aparece ANTES da linha de frete
         - Geralmente rotulado como: "Total itens", "Subtotal", "Merchandise Total", "Goods Value"
      2. ESSE valor (antes do frete) = VALOR MERCADORIA
      3. "Total net" = Total geral da fatura (informativo, não usar como campo principal)
      
      Exemplo de estrutura:
        Item A: USD 500
        Item B: USD 300
        ─────────────────
        Subtotal: USD 800     ← ESTE é o VALOR MERCADORIA
        ─────────────────
        Freight: USD 100
        ─────────────────
        Total net: USD 900    ← Total geral (informativo)
      
      CENÁRIO B — Invoice SEM linha de frete:
      Se a Invoice NÃO contém frete/freight:
      1. "Total net" = VALOR MERCADORIA
      2. Não há valor de frete a extrair dessa Invoice
      
      CENÁRIO C — Contexto de PESO:
      Se "Total net" aparece ao lado de "Weight", "kg", "Gross":
      - É PESO LÍQUIDO (valor numérico em kg), não é valor monetário
   
   E) REGRA ESPECIAL PARA RELATÓRIO DI / RASCUNHO DI:
      ⚠️ O Relatório DI brasileiro frequentemente exibe DUAS COLUNAS:
      - Coluna "Moeda Estrangeira" (USD, EUR, etc.) → USAR ESTE VALOR!
      - Coluna "Moeda Nacional" (BRL) → IGNORAR para comparação
      
      EXEMPLO:
      | Campo              | Moeda Estrangeira | Moeda Nacional |
      | Valor total frete  | EUR 1.589,76      | BRL 8.723,45   |
      
      → EXTRAIR: "EUR 1.589,76" (NÃO usar "BRL 8.723,45")
      
      REGRA: Para manter consistência com outros documentos (Invoice, AWB, CCT),
      SEMPRE extrair o valor na MOEDA ESTRANGEIRA do DI.
      Se apenas BRL estiver disponível, indicar na observação.
   
   MOEDA: sempre especificar (USD, EUR, BRL, etc.)
   NUNCA inventar valores que não existam no documento
   Se documento não tem valor → "ND" (não "0" ou valor inventado)

8) EXCEÇÕES PARA INVOICES COMERCIAIS (NÃO ALERTAR — PONTO 3):
   ⚠️ Invoice comercial NÃO precisa ter campo "Frete" → ausência NÃO é alerta
   ⚠️ Invoice comercial NÃO precisa ter campo "NCM" → ausência NÃO é alerta
   ⚠️ Invoice comercial NÃO precisa ter campo "Peso Bruto" → ausência NÃO é alerta
   ⚠️ Invoice comercial NÃO precisa ter campo "Peso Líquido" → ausência NÃO é alerta
   - Campos de PESO são esperados no BL/AWB e Packing List, NÃO obrigatórios na Invoice
   - Invoice comercial é documento de VALOR, não de peso
   - Ausência de peso na Invoice = marcar "ND" SEM ícone de alerta (não é divergência!)
   - Esses campos são esperados no BL/AWB e no Draft DI, não na Invoice
   - Ausência desses campos na Invoice = marcar "ND" SEM ícone de alerta
   - Se demais campos estão conformes, linha pode ter ✅

9) NCM — Regra aduaneira:
   - Divergência na RAIZ (4 primeiros dígitos) → 🔴 CRÍTICO
   - Divergência apenas no sufixo com descrição compatível → 🟨
   - ⚠️ NCM ausente em Invoice comercial → NÃO é alerta (ver regra 8)

10) CNPJ/Consignee:
   - CNPJ divergente → 🔴 CRÍTICO
   - Razão social diferente (mesmo CNPJ) → 🟨

11) IDENTIFICAÇÃO DE MODAL — AUTOMÁTICA:
   - Se documento contém "AWB", "Airway Bill", "MAWB", "HAWB" → MODAL = AIR
   - Se documento contém "BL", "Bill of Lading", "HBL", "MBL", "Container" → MODAL = SEA
   - Reportar o modal detectado no bloco METADATA

${fiscalRulesSection}${armadorSection}${taxasSection}

18) CAMPOS DE VERIFICAÇÃO: AEROPORTO ORIGEM E DESTINO (PONTO 2):
   - Incluir linhas na tabela: "Aeroporto Origem" e "Aeroporto Destino"
   - Códigos IATA de 3 letras (ex.: GRU, VCP, MIA, FRA, JFK, CDG)
   - Extrair de: AWB, HAWB, BL, HBL e documentos de transporte
   - Comparar entre AWB/BL e demais documentos
   
   REGRAS DE COMPARAÇÃO:
   - Códigos IATA diferentes para MESMO aeroporto → ✅ CONFORME
     (ex.: GRU e SBGR referem-se ao mesmo aeroporto de Guarulhos)
   - Aeroportos claramente DIFERENTES → 🔴 CRÍTICO
     (ex.: GRU vs VCP = Guarulhos vs Campinas = DIVERGÊNCIA!)
   - Campo ausente em documento que deveria ter → 🟨 alerta
   - Campo ausente em Invoice/Packing List → OK (ND sem alerta)
   
   CÓDIGOS EQUIVALENTES CONHECIDOS:
   - GRU = SBGR (São Paulo/Guarulhos)
   - VCP = SBKP (Campinas/Viracopos)
   - GIG = SBGL (Rio de Janeiro/Galeão)
   - MIA = KMIA (Miami)
   - FRA = EDDF (Frankfurt)

19) REGRA DE MOEDA — COMPARAÇÃO RESTRITA (PONTO 5):
   
   ⚠️ DIFERENÇA DE MOEDA SÓ É RELEVANTE ENTRE CCT E HAWB/AWB:
   - CCT mostra EUR, HAWB mostra USD → 🔴 CRÍTICO (mesma operação, moedas diferentes)
   - Invoice em EUR, Seguro em USD → ✅ NORMAL (documentos independentes podem ter moedas diferentes)
   - BL em USD, Packing List em EUR → NÃO alertar (Packing List geralmente não tem valores)
   
   REGRA GERAL:
   - Documentos do MESMO emissor (armador/cia aérea) DEVEM ter mesma moeda
   - Documentos de emissores diferentes PODEM ter moedas diferentes
   - CCT + AWB/HAWB = mesmo emissor → moeda DEVE ser igual
   - Invoice + Seguro + PL = emissores diferentes → moeda PODE diferir
   
   QUANDO NÃO ALERTAR:
   - Invoice comercial em moeda diferente do AWB → NÃO é divergência
   - Certificado de seguro em moeda diferente → NÃO é divergência
   - Packing List geralmente não tem valores monetários
   - Apenas CCT vs AWB/HAWB com moedas diferentes → 🔴 CRÍTICO

20) QUANTIDADE DE MERCADORIA — SEVERIDADE ALERTA (PONTO 6):
   
   ⚠️ DIVERGÊNCIA DE QUANTIDADE NÃO É CRÍTICO:
   - Quantidade de volumes/packages divergente → 🟨 ALERTA (NÃO 🔴!)
   - Quantidade de itens divergente → 🟨 ALERTA (NÃO 🔴!)
   - Apenas verificar, não bloquear o processo
   
   RAZÃO: Divergências de quantidade frequentemente se resolvem com conferência física
   e não impedem o registro da DI. São itens de verificação, não de bloqueio.
   
   EXCEÇÃO — QUANDO QUANTIDADE É CRÍTICO:
   - Quantidade ZERO em documento oficial (AWB, BL) → 🔴 CRÍTICO
   - Quantidade NEGATIVA → 🔴 CRÍTICO (erro de digitação evidente)
   - Quantidade ausente em TODOS os documentos → 🔴 CRÍTICO

14) REGRAS ESPECÍFICAS PARA AWB/HAWB (ATENÇÃO MÁXIMA):
   
   A) ESTRUTURA DE CHARGES EM DUAS COLUNAS:
      - HAWB/AWB típico tem estrutura: PREPAID (esquerda) | COLLECT (direita)
      - Cada coluna lista os respectivos encargos
      - SEMPRE verificar AMBAS as colunas ao extrair valores!
   
   B) EXTRAÇÃO DE "TOTAL CHARGES":
      ⚠️ NÃO existe campo literal "Total Charges" no AWB padrão IATA!
      ONDE PROCURAR (SEMPRE o RODAPÉ da coluna — valor consolidado):
      → Linha final "Total Prepaid" → valor TOTAL pré-pago (frete + taxas + outros)
      → Linha final "Total Collect" → valor TOTAL a cobrar no destino (frete + taxas + outros)
      → Essas linhas SOMAM: Weight/Valuation Charge + Tax + Total Other Charges Due Agent
        + Total Other Charges Due Carrier (+ packaging quando houver)

      ⛔ REGRA CRÍTICA — NUNCA CONFUNDIR:
      ❌ ERRADO: pegar a linha "Collect" (frete puro, antes das taxas) como Valor Total Frete
      ❌ ERRADO: pegar "Weight Charge" / "WT/VAL Charge" / "Valuation Charge" isolados
      ❌ ERRADO: pegar "Por Peso" / "Por Valor" / "Impostos" / "Outros Serviços (...)" isolados
      ✅ CORRETO: SEMPRE a linha "Total Collect" / "Total Prepaid" / "Total" do rodapé

      Exemplo numérico (EN):
        Weight Charge (Collect): 1.200,00
        Tax / Other Charges:       250,00
        ─────────────────────────────────
        Total Collect:           1.450,00   ← USAR ESTE VALOR (1.450,00)

      ESTRUTURA EM PORTUGUÊS (AWB/HAWB BR — "Totais na moeda de origem"):
        | Linha                              | Prepaid | Collect |
        | Por Peso                           |    -    |  25,00  | ← PARCIAL, NÃO USAR
        | Por Valor                          |    -    |    -    | ← PARCIAL, NÃO USAR
        | Impostos                           |    -    |    -    | ← PARCIAL, NÃO USAR
        | Outros Serviços (Agente de Carga)  |    -    |    -    | ← PARCIAL, NÃO USAR
        | Outros Serviços (Transportador)    |    -    |    -    | ← PARCIAL, NÃO USAR
        | Total                              |    -    | 220,00  | ✅ USAR ESTE VALOR (220,00)

      MAPEAMENTO PT → EN (todos os itens acima de "Total" são PARCIAIS):
        • "Por Peso"                          ≡ Weight Charge          (parcial)
        • "Por Valor"                         ≡ Valuation Charge       (parcial)
        • "Impostos"                          ≡ Tax                    (parcial)
        • "Outros Serviços (Agente de Carga)" ≡ Other Charges Agent    (parcial)
        • "Outros Serviços (Transportador)"   ≡ Other Charges Carrier  (parcial)
        • "Total" (rodapé da coluna)          ≡ Total Prepaid / Total Collect  ✅ USAR

      COMO REPORTAR:
      - Se PREPAID: linha "Total Prepaid" (ou "Total" do rodapé Prepaid em AWB PT) com o valor consolidado
      - Se COLLECT: linha "Total Collect" (ou "Total" do rodapé Collect em AWB PT) com o valor consolidado
      - NÃO inventar "Total Charges" se não existir explicitamente

   
   C) COMPARAÇÃO COM CCT/BL:
      - AWB "Total Prepaid" deve bater com valor de frete no CCT
      - Diferenças em taxas acessórias → aplicar tolerância configurada
      - Se AWB é "Collect" mas CCT mostra "Prepaid" → 🔴 CRÍTICO

15) REGRAS PARA DRAFT DI / RASCUNHO DI (ATENÇÃO MÁXIMA):
   
   A) IDENTIFICAÇÃO DO DOCUMENTO:
      - Nomes típicos: "Rascunho_DI.pdf", "Draft_DI.pdf", "RelDI.pdf", "DI_Preliminar.xlsx"
      - Contém campos como: CFOP, NCM, II, IPI, PIS, COFINS, ICMS
      - Formato brasileiro com valores em BRL e moeda estrangeira
   
   B) EXTRAÇÃO DE VALORES — REGRA CRÍTICA:
      ⚠️ O documento DI brasileiro tem DUAS COLUNAS de valores:
      - "Moeda Estrangeira" (USD, EUR, etc.) — USAR ESTE!
      - "Moeda Nacional" (BRL) — IGNORAR para comparação
      
      Para CADA campo de valor, SEMPRE extrair a coluna "Moeda Estrangeira"!
   
   C) CAMPOS CHAVE PARA COMPARAÇÃO:
      - Valor Total Mercadoria (FOB/CIF)
      - Valor Frete
      - Valor Seguro (se aplicável)
      - Valor VMLE (Valor da Mercadoria no Local de Embarque)
      - Valor VMCV (se CIF)
      - NCM (comparar com Invoice)
      - Peso (comparar com BL/PL)
   
    D) VALIDAÇÕES FISCAIS:
       - CFOP deve bater com tipo de operação
       - Alíquotas de II, IPI devem ser consistentes com NCM
       - Se cliente tem benefício fiscal → verificar aplicação correta

16) REGRAS DE STATUS — PRIORIDADE MÁXIMA (SEGUIR À RISCA!):

    ⚠️ STATUS 🔴 CRÍTICO — USAR OBRIGATORIAMENTE QUANDO:
    - Valores numéricos diferem em mais de 20% (ex.: 28.234 vs 508 → claramente diferentes!)
      ⚠️ EXCEÇÃO: "Valor Mercadoria" / "Valor Total" → SEMPRE ✅ CONFORME (ver regra abaixo)
    - Moedas diferentes para o MESMO campo em documentos que DEVERIAM ter mesma moeda
    - CNPJ divergente entre documentos
    - NCM divergente na raiz (4 primeiros dígitos)
    - Frete marcado COLLECT em um doc vs PREPAID em outro
    - Incoterms diferentes (CFR vs FOB vs CIF)
    - Valores de ordens de magnitude diferentes (ex.: 10.000 vs 100)
      ⚠️ EXCEÇÃO: "Valor Mercadoria" / "Valor Total" → SEMPRE ✅ CONFORME

    🔴🔴🔴 REGRA ABSOLUTA PARA VALOR MERCADORIA (PRIORIDADE MÁXIMA):
    - Qualquer divergência em "Valor Mercadoria", "Valor Total Mercadoria", "Valor FOB", 
      "Valor CIF", "Valor Total" → SEMPRE ✅ CONFORME, NUNCA 🟨 e NUNCA 🔴
    - Motivo: cada Invoice pode ter um valor diferente (múltiplas invoices por processo);
      o Draft DI confere o valor total consolidado de todas as invoices.
    - Divergências entre invoices individuais são ESPERADAS e NORMAIS.
    - Na seção Observações, registrar os valores encontrados de forma INFORMATIVA:
      → Usar formato: "ℹ️ Valor Mercadoria: Invoice1 = EUR 28.234, Invoice2 = EUR 508 (valores individuais por invoice, conferência pelo total no Draft DI)"
      → NÃO usar ícone 🟨 ou 🔴 na observação de Valor Mercadoria
      → NÃO usar classe "obs-alerta" ou "obs-critico" para essa observação

    ⚠️ STATUS 🟨 ALERTA — USAR OBRIGATORIAMENTE QUANDO:
    - Valores numéricos diferem mais que a tolerância MAS menos que 20%
      (EXCETO "Valor Mercadoria" que é SEMPRE ✅)
    - Datas diferentes entre documentos (ex.: 19/12/2025 vs 17/12/2025)
    - Moedas diferentes em campos DIFERENTES entre documentos (ex.: Invoice em EUR, Seguro em USD)
    - Campo obrigatório ausente (ND) em algum documento mas presente em outros
    - Razão social diferente (mesmo CNPJ)
    - Diferença em Total Collect/Prepaid acima de EUR/USD 50
    - Valores em moedas diferentes que não podem ser comparados diretamente

    ⚠️ STATUS ✅ CONFORME — USAR SOMENTE QUANDO:
    - Valores são IDÊNTICOS após normalização numérica (vírgula vs ponto, zeros trailing)
    - OU diferença está DENTRO da tolerância configurada E mesma moeda
    - OU campo é "ND" em TODOS os documentos (nenhum documento tem o dado)
    - OU campo é "Valor Mercadoria" (SEMPRE ✅ conforme regra absoluta acima)
    - NUNCA marcar ✅ se houver diferença significativa entre valores (exceto Valor Mercadoria)!

    ⚠️ REGRA DE OURO — CONSISTÊNCIA TABELA × OBSERVAÇÕES:
    Se você mencionar algo na seção "Observações" com 🟨 ou 🔴,
    a LINHA CORRESPONDENTE na tabela DEVE ter o MESMO ícone!
    
    EXCEÇÃO: "Valor Mercadoria" → tabela SEMPRE ✅, observações usam ℹ️ (informativo)
    
    EXEMPLO CORRETO PARA VALOR MERCADORIA:
    - Tabela: "Valor Mercadoria" → ✅
    - Observações: "ℹ️ Valores de mercadoria por invoice: EUR 28.234 (Invoice1), EUR 508 (Invoice2)"
    → CONSISTENTE! (✅ na tabela, informativo nas observações)

    ⚠️ REGRA CRÍTICA PARA COMPARAÇÃO MULTI-DOCUMENTO:
    - Documentos DIFERENTES podem ter valores DIFERENTES — isso é NORMAL
    - MAS se o MESMO campo (ex.: Peso Bruto) aparece em 2+ docs com valores MUITO diferentes:
      → Se diferença >20% → 🔴 CRÍTICO (exceto Valor Mercadoria → SEMPRE ✅)
    - LEMBRETE: "Valor Mercadoria" e variações → SEMPRE ✅ CONFORME (nunca 🟨, nunca 🔴)
    - Se valores estão em moedas diferentes e não podem ser comparados:
      → Marcar como 🟨 e explicar que "moedas diferentes, comparação requer conversão"
      → EXCETO Valor Mercadoria → SEMPRE ✅

17) VERIFICAÇÃO FINAL OBRIGATÓRIA:
    Antes de gerar a saída, VERIFIQUE:
    1. Para cada item listado em "Observações" com 🟨 ou 🔴
    2. Encontre a linha correspondente na tabela
    3. Confirme que o STATUS da linha CORRESPONDE ao ícone da observação
    4. Se não corresponder, CORRIJA a tabela antes de gerar a saída
    5. CONFIRME que "Valor Mercadoria" está com ✅ na tabela (SEMPRE conforme!)
     6. CONFIRME que observações sobre Valor Mercadoria usam ℹ️ (informativo), NUNCA 🟨 ou 🔴
     7. CONFIRME que "Valor Total Frete" só contém valores de linhas EXPLICITAMENTE rotuladas como frete
     8. CONFIRME consistência entre Incoterm e tipo de frete (Prepaid/Collect) — se BL é Prepaid mas Incoterm é FCA/EXW/FOB → 🔴 CRÍTICO
    
    Esta verificação é OBRIGATÓRIA. Inconsistências entre tabela e observações
    indicam erro no processamento e devem ser corrigidas antes da saída final.
`;
}

// =============================================================================
// STEP-SPECIFIC PROMPTS
// =============================================================================

function getPromptByStep(stepId: number, fileNames: string[], clientConfig?: ClientConfig): string {
  const tableSpec = buildTableSpec(clientConfig);
  
  // Add client-specific instructions if available
  let clientInstructions = '';
  if (clientConfig?.instrucoes_personalizadas) {
    clientInstructions = `

═══════════════════════════════════════════════════════════════════════════════
⚠️ INSTRUÇÕES ESPECÍFICAS DO CLIENTE (PRIORIDADE MÁXIMA):
═══════════════════════════════════════════════════════════════════════════════
${clientConfig.instrucoes_personalizadas}
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  const baseContext = `
Você é um analista de conferência de documentos de comércio exterior especializado em desembaraço aduaneiro.

ARQUIVOS FORNECIDOS NESTA ANÁLISE:
${fileNames.map((f, i) => `${i + 1}. ${f}`).join('\n')}

IMPORTANTE: Use os NOMES EXATOS dos arquivos acima como cabeçalhos das colunas na tabela de comparação.
${clientInstructions}
${CHB_FORMAT_HTML}
${tableSpec}
`;

  switch (stepId) {
    case 1:
      return `${baseContext}

═══════════════════════════════════════════════════════════════════════════════
ETAPA 1 — CONFERÊNCIA DOCUMENTAL INICIAL
═══════════════════════════════════════════════════════════════════════════════

OBJETIVO: Comparar documentos comerciais básicos (Commercial Invoice, Packing List, BL/AWB) 
para identificar divergências antes do registro da DI.

FOCO PRINCIPAL:
1. Extrair e comparar: Peso Bruto, Peso Líquido, Valor Total Mercadoria, Incoterm, NCM
2. Validar consistência entre Invoice × Packing List × BL/AWB
3. Identificar campos ausentes (ND) que precisarão ser obtidos
4. Detectar divergências críticas que impediriam o registro da DI

REGRA DE OURO: 
- Compare TODOS os documentos fornecidos entre si
- Crie uma coluna para CADA documento (usando o nome exato do arquivo)
- Status na PRIMEIRA coluna para decisão rápida

Analise os documentos e produza a saída HTML conforme especificado.`;

    case 2:
      return `${baseContext}

═══════════════════════════════════════════════════════════════════════════════
ETAPA 2 — CONFERÊNCIA DO DRAFT DI
═══════════════════════════════════════════════════════════════════════════════

OBJETIVO: Comparar o rascunho/draft da DI (Declaração de Importação) com os documentos 
originais já validados na Etapa 1.

CONTEXTO: O cliente está prestes a registrar a DI no Siscomex. Esta é a última 
verificação antes do registro oficial.

🔴 REGRA DE OURO (OBRIGATÓRIA — NÃO OMITIR NENHUM ARQUIVO):
- A tabela DEVE conter UMA coluna para CADA arquivo listado em "ARQUIVOS FORNECIDOS NESTA ANÁLISE" (use o nome EXATO do arquivo).
- Isso inclui TODOS os documentos da Etapa 1 (Pré-Alerta) + TODOS os novos documentos da Etapa 2 (Instrução / Draft DI).
- Se um arquivo não contiver um determinado campo, preencha a célula com "ND" — NUNCA remova a coluna.
- A ordem das colunas deve seguir a ordem dos arquivos fornecidos.

FOCO PRINCIPAL:
1. Comparar valores do Draft DI com Invoice + BL/AWB originais
2. Validar NCM e CFOP estão corretos para a operação
3. Verificar cálculo de tributos (se visível no draft)
4. Confirmar que dados do importador/exportador estão corretos
5. Identificar QUALQUER divergência que poderia causar multa ou retenção


═══════════════════════════════════════════════════════════════════════════════
⚠️ FOCO ADICIONAL — COMPARAÇÃO HOUSE × MASTER (PONTO 7):
═══════════════════════════════════════════════════════════════════════════════

Assim como comparamos HAWB/HBL, agora também devemos verificar o MAWB/MBL:

1. NÚMERO DO MASTER:
   - Extrair MAWB (Master Airway Bill) ou MBL (Master Bill of Lading)
   - Incluir como linha na tabela: "Número Master"
   - Comparar com referência no Draft DI se existir
   - Se não houver documento Master fornecido, marcar como "ND" sem alerta

2. DADOS DO MASTER (quando documento Master estiver presente):
   - Peso Bruto no Master vs Peso Bruto no House
   - Valor Total no Master (soma de houses, se consolidado)
   - Consignee/Agente no Master
   - Aeroporto/Porto de Origem e Destino

3. REGRAS DE COMPARAÇÃO MASTER vs HOUSE:
   - Master vs House: pesos podem diferir se houver consolidação → 🟨 apenas alerta
   - Master indica destino diferente do House → 🔴 CRÍTICO
   - Master não encontrado nos documentos → 🟨 (campo "ND" com nota)
   - Número do Master diverge entre documentos → 🔴 CRÍTICO

4. IDENTIFICAÇÃO DO DOCUMENTO MASTER:
   - Nomes típicos: "MAWB.pdf", "MasterBL.pdf", "MBL.pdf", "Master_AWB.pdf"
   - Contém indicadores: "Master", "MAWB", "MBL", "Consolidation"
   - Se documento contém referência a múltiplos houses → é provável Master

═══════════════════════════════════════════════════════════════════════════════

⚠️ REGRA CRÍTICA PARA DRAFT DI:
- O DI brasileiro tem valores em "Moeda Estrangeira" e "Moeda Nacional"
- SEMPRE usar a coluna "Moeda Estrangeira" para comparação!
- Se aparecerem valores em BRL, são apenas para referência fiscal

SEVERIDADE MÁXIMA: Erros no DI podem causar:
- Multas da Receita Federal
- Retenção de mercadoria
- Necessidade de retificação (custo e tempo)

Analise os documentos e produza a saída HTML conforme especificado.`;

    case 3:
      return `${baseContext}

═══════════════════════════════════════════════════════════════════════════════
ETAPA 3 — CONFERÊNCIA FINAL (DI REGISTRADA × DOCUMENTOS)
═══════════════════════════════════════════════════════════════════════════════

OBJETIVO: Validação final comparando a DI já registrada com todos os documentos 
do processo para garantir consistência completa.

CONTEXTO: A DI já foi registrada. Esta etapa identifica se há necessidade de 
retificação ou se o processo pode seguir para liberação.

🔴 REGRA DE OURO (OBRIGATÓRIA — NÃO OMITIR NENHUM ARQUIVO):
- A tabela DEVE conter UMA coluna para CADA arquivo listado em "ARQUIVOS FORNECIDOS NESTA ANÁLISE" (nome EXATO).
- Inclua TODOS os documentos das Etapas 1, 2 e 3. Se um arquivo não tiver o campo, use "ND" — NUNCA remova a coluna.
- A ordem das colunas deve seguir a ordem dos arquivos fornecidos.

FOCO PRINCIPAL:
1. Comparar DI registrada com Invoice, BL/AWB, Packing List
2. Verificar se valores bateram com a etapa 2 (se disponível)
3. Identificar discrepâncias que exigiriam retificação
4. Validar numerário e dados bancários (se visíveis)
5. Confirmar que NCM e alíquotas estão corretos

PARECER FINAL:
- Se tudo conforme: ✅ Processo pode prosseguir para liberação
- Se divergências: 🔴 Indicar necessidade de retificação + itens específicos

Analise os documentos e produza a saída HTML conforme especificado.`;

    default:
      return `${baseContext}

Analise os documentos fornecidos e produza a saída HTML conforme especificado.`;
  }
}

// =============================================================================
// API CALLERS
// =============================================================================

interface FileForAnalysis {
  name: string;
  content: string;
  mimeType: string;
}

interface ChbFileError {
  fileName: string;
  error: string;
  type: 'conversion' | 'size' | 'format' | 'api';
  suggestion: string;
}

interface ApiResponse {
  text: string;
  warnings: ChbFileError[];
  extractedTexts?: Record<string, string>;
}

// Validate total input size to avoid API errors
function validateInputSize(files: FileForAnalysis[]): { isValid: boolean; estimatedTokens: number; warning?: string } {
  // Estimate tokens: ~4 chars per token for base64 content
  // Claude Sonnet 4 has ~200k context, but base64 PDFs are large
  // Allow up to 1M tokens to handle large document sets
  const MAX_INPUT_TOKENS = 1000000;
  const CHARS_PER_TOKEN = 4;
  
  let totalChars = 0;
  for (const file of files) {
    totalChars += file.content.length;
    totalChars += file.name.length;
  }
  
  const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  
  if (estimatedTokens > MAX_INPUT_TOKENS) {
    return {
      isValid: false,
      estimatedTokens,
      warning: `Input muito grande (${estimatedTokens} tokens estimados). Limite: ${MAX_INPUT_TOKENS} tokens.`
    };
  }
  
  return { isValid: true, estimatedTokens };
}

// Call Anthropic Claude API with vision capabilities
async function callAnthropicAPI(prompt: string, files: FileForAnalysis[], persistedOcr: Record<string, string> = {}): Promise<ApiResponse> {
  const anthropicApiKey = Deno.env.get('CHB_ANTHROPIC_API_KEY');
  
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  
  const warnings: ChbFileError[] = [];
  const extractedTexts: Record<string, string> = {};
  
  // Build content array with files
  const content: any[] = [];
  
  // Add files as images or text (with OCR fallback for PDFs)
  for (const file of files) {
    if (file.mimeType.startsWith('image/')) {
      // For images, try OCR extraction first for better text analysis
      const ocrResult = await extractTextWithOCR(file.content, file.mimeType, file.name);
      if (ocrResult.text) extractedTexts[file.name] = ocrResult.text;
      
      if (ocrResult.confidence !== 'low' && ocrResult.text.length > 50) {
        // Use OCR extracted text for better structured analysis
        content.push({
          type: 'text',
          text: ocrResult.text,
        });
        console.log(`[Anthropic] Using OCR text for image ${file.name}: ${ocrResult.text.length} chars`);
      } else {
        // Fallback to native image handling
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mimeType,
            data: file.content,
          },
        });
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}]`,
        });
      }
    } else if (file.mimeType === 'application/pdf') {
      // For PDFs, use OCR extraction to handle both native and scanned PDFs
      const ocrResult = await extractTextWithOCR(file.content, file.mimeType, file.name);
      if (ocrResult.text) extractedTexts[file.name] = ocrResult.text;
      
      if (ocrResult.confidence !== 'low' && ocrResult.text.length > 100) {
        // Use OCR extracted text - works for both native and scanned PDFs
        content.push({
          type: 'text',
          text: ocrResult.text,
        });
        console.log(`[Anthropic] Using OCR text for PDF ${file.name}: ${ocrResult.text.length} chars (confidence: ${ocrResult.confidence})`);
      } else {
        // Fallback to Anthropic's native PDF handling
        console.log(`[Anthropic] Falling back to native PDF handling for ${file.name}`);
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: file.content,
          },
        });
        content.push({
          type: 'text',
          text: `[Arquivo PDF: ${file.name}]`,
        });
      }
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || 
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // FLUXO ÚNICO: usar somente OCR persistido (já contém o texto deste Excel).
      const persisted = persistedOcr[file.name];
      if (persisted && persisted.trim().length >= 10) {
        content.push({
          type: 'text',
          text: `[Arquivo Excel: ${file.name}] — conteúdo já fornecido no bloco "📚 OCR BRUTO PERSISTIDO".`,
        });
        console.log(`[Anthropic] Excel ${file.name}: usando OCR persistido (stub no payload, ${persisted.length} chars no bloco persistido)`);
      } else {
        console.warn(`[Anthropic] Excel ${file.name}: persistência ausente — caindo para extração ao vivo`);
        try {
          const excelText = await extractExcelText(file.content, file.name);
          content.push({ type: 'text', text: excelText });
        } catch (e) {
          console.error(`Error processing Excel ${file.name}:`, e);
          warnings.push({
            fileName: file.name,
            error: 'Erro ao processar arquivo Excel',
            type: 'conversion',
            suggestion: 'Verifique se o arquivo não está corrompido ou tente exportar como PDF.',
          });
          content.push({
            type: 'text',
            text: `[Arquivo Excel: ${file.name}] - Não foi possível extrair conteúdo`,
          });
        }
      }
    } else {
      // Outros formatos: preferir OCR persistido; só cair no atob se não houver.
      const persisted = persistedOcr[file.name];
      if (persisted && persisted.trim().length >= 10) {
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] — conteúdo já fornecido no bloco "📚 OCR BRUTO PERSISTIDO".`,
        });
        console.log(`[Anthropic] ${file.name}: usando OCR persistido (stub no payload)`);
      } else {
        try {
          const textContent = atob(file.content);
          content.push({
            type: 'text',
            text: `[Arquivo: ${file.name}]\n${textContent}`,
          });
        } catch {
          content.push({
            type: 'text',
            text: `[Arquivo: ${file.name}] - Conteúdo binário não legível`,
          });
        }
      }
    }
  }
  
  // Add the analysis prompt at the end
  content.push({
    type: 'text',
    text: prompt,
  });
  
  const startTime = Date.now();
  
  const ANTHROPIC_TIMEOUT_MS = 240_000;
  const anthropicAbort = new AbortController();
  const anthropicTimer = setTimeout(() => anthropicAbort.abort(), ANTHROPIC_TIMEOUT_MS);
  console.log(`[BG] anthropic.start (timeout=${ANTHROPIC_TIMEOUT_MS}ms, files=${files.length})`);
  
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: anthropicAbort.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });
  } catch (fetchErr: any) {
    clearTimeout(anthropicTimer);
    if (fetchErr?.name === 'AbortError') {
      console.error(`[BG] anthropic.timeout after ${Date.now() - startTime}ms`);
      throw new Error(`LLM_TIMEOUT: Anthropic não respondeu em ${ANTHROPIC_TIMEOUT_MS / 1000}s`);
    }
    throw fetchErr;
  }
  clearTimeout(anthropicTimer);
  console.log(`[BG] anthropic.end ms=${Date.now() - startTime} status=${response.status}`);
  
  const responseTime = Date.now() - startTime;

  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', errorText);
    
    await logApiCall({
      api_name: 'anthropic',
      endpoint: '/v1/messages',
      method: 'POST',
      status_code: response.status,
      response_time_ms: responseTime,
      error_message: errorText,
    });
    
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  await logApiCall({
    api_name: 'anthropic',
    endpoint: '/v1/messages',
    method: 'POST',
    status_code: 200,
    response_time_ms: responseTime,
  });
  
  const textContent = result.content?.find((c: any) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Anthropic response');
  }
  
        return { text: textContent.text, warnings, extractedTexts };
}

// Call Gemini API directly as fallback (with OCR support for scanned PDFs)
async function callGeminiAPI(prompt: string, files: FileForAnalysis[], persistedOcr: Record<string, string> = {}): Promise<ApiResponse> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }
  
  const warnings: ChbFileError[] = [];
  const extractedTexts: Record<string, string> = {};
  
  // Build content parts for Lovable AI Gateway
  const contentParts: any[] = [];
  
  for (const file of files) {
    if (file.mimeType === 'application/pdf') {
      const ocrResult = await extractTextWithOCR(file.content, file.mimeType, file.name);
      if (ocrResult.text) extractedTexts[file.name] = ocrResult.text;
      
      if (ocrResult.confidence !== 'low' && ocrResult.text.length > 100) {
        contentParts.push({ type: 'text', text: ocrResult.text });
        console.log(`[Gemini Fallback] Using OCR text for PDF ${file.name}: ${ocrResult.text.length} chars`);
      } else {
        console.log(`[Gemini Fallback] Using image_url for PDF ${file.name}`);
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${file.mimeType};base64,${file.content}` },
        });
        contentParts.push({ type: 'text', text: `[Arquivo: ${file.name}]` });
      }
    } else if (file.mimeType.startsWith('image/')) {
      const ocrResult = await extractTextWithOCR(file.content, file.mimeType, file.name);
      if (ocrResult.text) extractedTexts[file.name] = ocrResult.text;
      
      if (ocrResult.confidence !== 'low' && ocrResult.text.length > 50) {
        contentParts.push({ type: 'text', text: ocrResult.text });
        console.log(`[Gemini Fallback] Using OCR text for image ${file.name}: ${ocrResult.text.length} chars`);
      } else {
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${file.mimeType};base64,${file.content}` },
        });
        contentParts.push({ type: 'text', text: `[Arquivo: ${file.name}]` });
      }
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') ||
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const persisted = persistedOcr[file.name];
      if (persisted && persisted.trim().length >= 10) {
        contentParts.push({
          type: 'text',
          text: `[Arquivo Excel: ${file.name}] — conteúdo já fornecido no bloco "📚 OCR BRUTO PERSISTIDO".`,
        });
        console.log(`[Gemini Fallback] Excel ${file.name}: usando OCR persistido (stub no payload, ${persisted.length} chars no bloco persistido)`);
      } else {
        console.warn(`[Gemini Fallback] Excel ${file.name}: persistência ausente — extração ao vivo`);
        try {
          const excelText = await extractExcelText(file.content, file.name);
          contentParts.push({ type: 'text', text: excelText });
        } catch (e) {
          console.error(`Error processing Excel ${file.name}:`, e);
          warnings.push({
            fileName: file.name,
            error: 'Erro ao processar arquivo Excel',
            type: 'conversion',
            suggestion: 'Verifique se o arquivo não está corrompido.',
          });
          contentParts.push({ type: 'text', text: `[Arquivo Excel: ${file.name}] - Não foi possível extrair conteúdo` });
        }
      }
    } else {
      const persisted = persistedOcr[file.name];
      if (persisted && persisted.trim().length >= 10) {
        contentParts.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] — conteúdo já fornecido no bloco "📚 OCR BRUTO PERSISTIDO".`,
        });
        console.log(`[Gemini Fallback] ${file.name}: usando OCR persistido (stub no payload)`);
      } else {
        try {
          const textContent = atob(file.content);
          contentParts.push({ type: 'text', text: `[Arquivo: ${file.name}]\n${textContent}` });
        } catch {
          contentParts.push({ type: 'text', text: `[Arquivo: ${file.name}] - Conteúdo binário não legível` });
        }
      }
    }
  }
  
  contentParts.push({ type: 'text', text: prompt });
  
  const startTime = Date.now();
  
  const GEMINI_TIMEOUT_MS = 240_000;
  const geminiAbort = new AbortController();
  const geminiTimer = setTimeout(() => geminiAbort.abort(), GEMINI_TIMEOUT_MS);
  console.log(`[BG] gemini.start (timeout=${GEMINI_TIMEOUT_MS}ms, files=${files.length})`);
  
  let response: Response;
  try {
    response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      signal: geminiAbort.signal,
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{
          role: 'user',
          content: contentParts,
        }],
        max_tokens: 65536,
        temperature: 0.1,
      }),
    });
  } catch (fetchErr: any) {
    clearTimeout(geminiTimer);
    if (fetchErr?.name === 'AbortError') {
      console.error(`[BG] gemini.timeout after ${Date.now() - startTime}ms`);
      throw new Error(`LLM_TIMEOUT: Gemini não respondeu em ${GEMINI_TIMEOUT_MS / 1000}s`);
    }
    throw fetchErr;
  }
  clearTimeout(geminiTimer);
  console.log(`[BG] gemini.end ms=${Date.now() - startTime} status=${response.status}`);
  
  const responseTime = Date.now() - startTime;
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI Gateway error:', errorText);
    throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
  }

  
  const result = await response.json();
  
  const text = result.choices?.[0]?.message?.content || '';
  
  if (!text) {
    throw new Error('No text content in AI Gateway response');
  }
  
  return { text, warnings, extractedTexts };
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

interface AnalysisTag {
  type: 'success' | 'warning' | 'danger';
  label: string;
}

function extractHtmlAndTags(response: string, stepId: number): {
  html: string;
  tags: AnalysisTag[];
  summary: string;
  detailedSummary: string;
  parecer: string;
  modal: string;
  cliente: string;
} {
  // Extract metadata
  let modal = 'SEA';
  let cliente = '';
  const metadataMatch = response.match(/<<METADATA>>([\s\S]*?)<<END_METADATA>>/);
  if (metadataMatch) {
    const metadata = metadataMatch[1];
    const modalMatch = metadata.match(/MODAL:\s*(SEA|AIR)/i);
    if (modalMatch) modal = modalMatch[1].toUpperCase();
    const clienteMatch = metadata.match(/CLIENTE:\s*([^\n]+)/i);
    if (clienteMatch) cliente = clienteMatch[1].trim();
  }
  
  // Extract HTML
  let html = '';
  const htmlMatch = response.match(/<<BEGIN_HTML>>([\s\S]*?)<<END_HTML>>/);
  if (htmlMatch) {
    html = htmlMatch[1].trim();
  } else {
    // Try to find table directly
    const tableMatch = response.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) {
      html = tableMatch[0];
      
      // Also try to get observations and parecer sections
      const obsMatch = response.match(/<div class="observations-section">[\s\S]*?<\/div>/i);
      if (obsMatch) html += '\n' + obsMatch[0];
      
      const parecerMatch = response.match(/<div class="parecer-section">[\s\S]*?<\/div>/i);
      if (parecerMatch) html += '\n' + parecerMatch[0];
      
      const actionsMatch = response.match(/<div class="actions-section">[\s\S]*?<\/div>/i);
      if (actionsMatch) html += '\n' + actionsMatch[0];
    }
  }
  
  // Count status indicators
  const criticalCount = (html.match(/🔴/g) || []).length;
  const warningCount = (html.match(/🟨/g) || []).length;
  const okCount = (html.match(/✅/g) || []).length;
  
  // Build tags
  const tags: AnalysisTag[] = [];
  if (criticalCount > 0) {
    tags.push({ type: 'danger', label: `${criticalCount} crítico(s)` });
  }
  if (warningCount > 0) {
    tags.push({ type: 'warning', label: `${warningCount} alerta(s)` });
  }
  if (okCount > 0 && criticalCount === 0 && warningCount === 0) {
    tags.push({ type: 'success', label: 'Documentos conformes' });
  } else if (okCount > 0) {
    tags.push({ type: 'success', label: `${okCount} conforme(s)` });
  }
  
  // Build summary
  let summary = '';
  if (criticalCount > 0) {
    summary = `⚠️ ${criticalCount} divergência(s) crítica(s) encontrada(s)`;
  } else if (warningCount > 0) {
    summary = `${warningCount} alerta(s) para verificação`;
  } else {
    summary = 'Documentos em conformidade';
  }
  
  // Build detailed summary
  const stepNames: Record<number, string> = {
    1: 'Conferência Documental Inicial',
    2: 'Conferência do Draft DI',
    3: 'Conferência Final',
  };
  
  const detailedSummary = `${stepNames[stepId] || `Etapa ${stepId}`}: ${criticalCount} crítico(s), ${warningCount} alerta(s), ${okCount} conforme(s)`;
  
  // Extract parecer
  let parecer = '';
  const parecerTextMatch = html.match(/<div class="parecer-section">([\s\S]*?)<\/div>/i);
  if (parecerTextMatch) {
    parecer = parecerTextMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  return { html, tags, summary, detailedSummary, parecer, modal, cliente };
}

function parseNumberBR(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[A-Za-z€$\s]/g, '').trim();
  if (!cleaned) return null;
  const norm = cleaned.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(norm);
  return isNaN(n) ? null : n;
}

function extractAwbPortugueseTotalFreight(text: string): string | null {
  if (!text) return null;
  if (!/por\s+peso/i.test(text) || !/total/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const currencyValue = '([A-Z]{3}\\s*)?\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})';
  const valueRe = new RegExp(currencyValue, 'gi');

  const pickBestValue = (line: string): { raw: string; num: number } | null => {
    const matches = line.match(valueRe) || [];
    let best: { raw: string; num: number } | null = null;
    for (const m of matches) {
      const num = parseNumberBR(m);
      if (num != null && (!best || num > best.num)) best = { raw: m.trim(), num };
    }
    return best;
  };

  // 1) Linha "Total" consolidada, valor na mesma linha ou nas próximas 2
  let lastTotalValue: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^(total|total\s+geral|totais)\b/i.test(line)) continue;
    if (/total\s+(prepaid|collect|other|charges|amount|due)/i.test(line)) continue;
    let best = pickBestValue(line);
    if (!best && lines[i + 1]) best = pickBestValue(lines[i + 1]);
    if (!best && lines[i + 2]) best = pickBestValue(lines[i + 2]);
    if (best) lastTotalValue = best.raw;
  }
  if (lastTotalValue) return lastTotalValue;

  // 2) Total Prepaid / Total Collect
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/total\s+(prepaid|collect)/i.test(line)) continue;
    let best = pickBestValue(line);
    if (!best && lines[i + 1]) best = pickBestValue(lines[i + 1]);
    if (best) lastTotalValue = best.raw;
  }
  if (lastTotalValue) return lastTotalValue;

  // 3) Soma dos componentes (Por Peso + Por Valor + Impostos + Outros)
  const componentRe = /^(por\s+peso|por\s+valor|impostos?|outros(\s+servi[cç]os)?)/i;
  let sum = 0;
  let currency = '';
  let hasAny = false;
  for (const line of lines) {
    if (!componentRe.test(line)) continue;
    const best = pickBestValue(line);
    if (best) {
      sum += best.num;
      hasAny = true;
      const cur = best.raw.match(/[A-Z]{3}/);
      if (cur && !currency) currency = cur[0];
    }
  }
  if (hasAny && sum > 0) {
    const formatted = sum.toFixed(2).replace('.', ',');
    return currency ? `${currency} ${formatted}` : formatted;
  }
  return null;
}

function looksLikeMonetary(value: string): boolean {
  if (!value) return false;
  return /\b(EUR|USD|BRL|GBP|R\$|US\$|€|\$)\b/i.test(value) || /^\s*[A-Z]{3}\s*\d/i.test(value);
}

function extractAwbGrossWeight(text: string): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labelRe = /(?:peso\s*bruto(?:\s*total)?|p\.\s*bruto|\bpb\b|gross\s*weight(?:\s*total)?|gross\s*wt|\bgw\b|weight\s*\(kg\))/i;
  const numRe = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(kg|kgs|quilos?)?/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(EUR|USD|BRL|GBP|R\$|US\$|€)/i.test(line)) continue;
    if (!labelRe.test(line)) continue;

    const afterLabel = line.replace(labelRe, '');
    let m = afterLabel.match(numRe);
    if (m && m[1]) {
      const n = parseNumberBR(m[1]);
      if (n != null && n > 0) return `${m[1]} kg`;
    }
    for (let j = 1; j <= 2; j++) {
      const next = lines[i + j];
      if (!next) break;
      if (/(EUR|USD|BRL|GBP|R\$|US\$|€)/i.test(next)) continue;
      m = next.match(numRe);
      if (m && m[1]) {
        const n = parseNumberBR(m[1]);
        if (n != null && n > 0) return `${m[1]} kg`;
      }
    }
  }
  return null;
}

function stripParentheticalAnnotation(value: string): string {
  if (!value) return value;
  return value
    .replace(/\s*\((?:por\s+peso|por\s+valor|impostos?|outros[^)]*|total[^)]*|fonte[^)]*|origem[^)]*)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeaderText(s: string): string {
  return s.replace(/<[^>]+>/g, '').toLowerCase()
    .replace(/[…]+/g, '')
    .replace(/\.\.\.$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkDivergence(values: string[], type: 'weight' | 'money' | 'text'): boolean {
  if (type === 'text') {
    const normalized = values.map(v => v.replace(/[^a-z0-9]/gi, '').toUpperCase()).filter(Boolean);
    if (normalized.length < 2) return false;
    return new Set(normalized).size > 1;
  }
  const nums: number[] = [];
  for (const v of values) {
    const m = v.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?/);
    if (!m) continue;
    const n = parseNumberBR(m[0]);
    if (n != null && n > 0) nums.push(n);
  }
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === 0) return false;
  const relDiff = (max - min) / max;
  if (type === 'weight') return relDiff > 0.02;
  return (max - min) > 1.0 || relDiff > 0.01;
}

function applyDivergenceStatusOverrides(html: string): string {
  if (!html) return html;
  const fieldSpecs: Array<{ labelRe: RegExp; type: 'weight' | 'money' | 'text' }> = [
    { labelRe: /Peso\s+Bruto/i, type: 'weight' },
    { labelRe: /Peso\s+L[ií]quido/i, type: 'weight' },
    { labelRe: /Valor\s+Mercadoria/i, type: 'money' },
    { labelRe: /Valor\s+Total\s+Frete/i, type: 'money' },
    { labelRe: /NCM/i, type: 'text' },
    { labelRe: /Incoterm/i, type: 'text' },
    { labelRe: /CNPJ\s+Consignee/i, type: 'text' },
  ];

  let out = html;
  for (const spec of fieldSpecs) {
    const rowRe = new RegExp(`<tr[^>]*>[\\s\\S]*?<td[^>]*>\\s*${spec.labelRe.source}\\s*</td>[\\s\\S]*?</tr>`, 'i');
    out = out.replace(rowRe, (row) => {
      const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      if (cells.length < 4) return row;
      const docValues: string[] = [];
      let hasMissing = false;
      for (let i = 2; i < cells.length; i++) {
        const v = cells[i].replace(/<[^>]+>/g, '').trim();
        if (!v || /^nd$/i.test(v) || v === '-' || v === '—') {
          hasMissing = true;
          continue;
        }
        docValues.push(v);
      }
      if (docValues.length < 2) return row;
      const isDivergent = checkDivergence(docValues, spec.type);
      if (isDivergent) {
        const newStatus = cells[0].replace(/✅/g, '🟨').replace(/Conforme/gi, 'Alerta');
        if (newStatus === cells[0]) return row;
        return row.replace(cells[0], newStatus);
      }
      // Reverse path: valores iguais após normalização → rebaixa Alerta para Conforme
      // Apenas quando não há valores ausentes (presente vs ausente é divergência legítima)
      if (!hasMissing && /🟨|Alerta/i.test(cells[0])) {
        const newStatus = cells[0].replace(/🟨/g, '✅').replace(/Alerta/gi, 'Conforme');
        if (newStatus === cells[0]) return row;
        return row.replace(cells[0], newStatus);
      }
      return row;
    });
  }
  return out;
}

function applyAwbPortugueseTotalFreightCorrection(html: string, extractedTexts?: Record<string, string>): string {
  if (!html) return html;

  let corrected = html;
  const tableMatch = corrected.match(/<table[\s\S]*?<\/table>/i);
  const headerMatch = tableMatch?.[0]?.match(/<thead[^>]*>[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  const headerCells = headerMatch?.[1]?.match(/<th[^>]*>[\s\S]*?<\/th>/gi) || [];

  const findColumnIndex = (filename: string): number => {
    const target = filename.toLowerCase().replace(/\.(pdf|xlsx?|png|jpe?g)$/i, '').replace(/\s+/g, ' ').trim();
    const prefix15 = target.substring(0, Math.min(target.length, 15));
    return headerCells.findIndex((cell) => {
      const h = normalizeHeaderText(cell);
      if (!h) return false;
      if (h.includes(target) || target.includes(h)) return true;
      if (prefix15 && h.includes(prefix15)) return true;
      return false;
    });
  };

  const fixCellForRow = (fieldLabelRe: RegExp, colIdx: number, computeNewValue: (current: string) => string | null) => {
    if (colIdx < 2) return;
    const tdIndex = colIdx;
    const rowRe = new RegExp(`<tr[^>]*>[\\s\\S]*?<td[^>]*>\\s*${fieldLabelRe.source}\\s*</td>[\\s\\S]*?</tr>`, 'i');
    corrected = corrected.replace(rowRe, (row) => {
      const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      if (!cells[tdIndex]) return row;
      const currentValue = cells[tdIndex].replace(/<[^>]+>/g, '').trim();
      const newValue = computeNewValue(currentValue);
      if (newValue == null || newValue === currentValue) return row;
      const correctedCell = cells[tdIndex].replace(/(>)([\s\S]*?)(<\/td>)/i, `$1${newValue}$3`);
      return row.replace(cells[tdIndex], correctedCell);
    });
  };

  // PASSO 1: por documento — usa OCR para corrigir parciais e buscar peso bruto real
  if (extractedTexts) {
    for (const [filename, text] of Object.entries(extractedTexts)) {
      const colIdx = findColumnIndex(filename);
      if (colIdx < 2) continue;

      const totalFreight = extractAwbPortugueseTotalFreight(text);
      const grossFromOcr = extractAwbGrossWeight(text);

      // Valor Total Frete: substitui pelo total real; sempre limpa anotação parentética
      fixCellForRow(/Valor\s+Total\s+Frete/i, colIdx, (current) => {
        const stripped = stripParentheticalAnnotation(current);
        if (totalFreight) {
          const escaped = totalFreight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(escaped, 'i').test(stripped)) {
            return stripped !== current ? stripped : null;
          }
          return totalFreight;
        }
        return stripped !== current ? stripped : null;
      });

      // Peso Bruto: nunca força ND. Se OCR tem valor, usa-o (especialmente quando atual é ND/monetário/igual ao frete)
      fixCellForRow(/Peso\s+Bruto/i, colIdx, (current) => {
        const stripped = stripParentheticalAnnotation(current);
        const isEmpty = !stripped || /^nd$/i.test(stripped) || stripped === '-';
        const isMonetary = looksLikeMonetary(stripped);
        const matchesFreight = !!(totalFreight && stripped.replace(/\s+/g, '').includes(totalFreight.replace(/\s+/g, '')));
        if ((isEmpty || isMonetary || matchesFreight) && grossFromOcr) {
          return grossFromOcr;
        }
        return stripped !== current ? stripped : null;
      });

      // Outras células: apenas limpa anotação parentética
      for (const labelRe of [/Peso\s+L[ií]quido/i, /Valor\s+Mercadoria/i]) {
        fixCellForRow(labelRe, colIdx, (current) => {
          const stripped = stripParentheticalAnnotation(current);
          return stripped !== current ? stripped : null;
        });
      }
    }
  }

  // PASSO 2: divergência determinística entre colunas (✅ → 🟨)
  corrected = applyDivergenceStatusOverrides(corrected);

  return corrected;
}

// =============================================================================
// DATA PERSISTENCE - Using MariaDB via mariadb-proxy
// =============================================================================

async function callMariaDBProxy(action: string, params: Record<string, any> = {}): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const response = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`mariadb-proxy error: ${errorText}`);
  }
  
  return response.json();
}

function normalizeChbFilename(name: string): string {
  const decoded = (() => {
    try { return decodeURIComponent(name); } catch { return name; }
  })();
  return decoded
    .split(/[\\/]/)
    .pop()!
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function extractRawTextForPersistence(file: FileForAnalysis): Promise<string> {
  if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
    const ocrResult = await extractTextWithOCR(file.content, file.mimeType, file.name);
    return ocrResult.text || '';
  }

  if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') ||
      file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
    const excelText = await extractExcelText(file.content, file.name);
    return `[Arquivo: ${file.name}]\n${excelText}`;
  }

  try {
    return `[Arquivo: ${file.name}]\n${atob(file.content)}`;
  } catch {
    return '';
  }
}

async function persistRawOcrForFiles(
  itemId: number,
  stepId: number,
  files: FileForAnalysis[],
  extractedTexts: Record<string, string> = {}
): Promise<Array<{ filename: string; extractionId: number | null; status: string; rawOcrText: string }>> {
  console.log(`[BG][raw-ocr-save] v2-all-files :: Persisting raw OCR for ${files.length} file(s) (item ${itemId})...`);

  const filesResult = await callMariaDBProxy('get_chb_files', { itemId });
  const dbFiles: Array<{ id: number; filename: string; doc_role?: string; etapa?: string }> = filesResult.data || [];
  const dbFilesForStep = dbFiles.filter(df => String(df.etapa) === String(stepId));
  const orderedDbFiles = dbFilesForStep.length > 0 ? dbFilesForStep : dbFiles;

  const byExact = new Map<string, { id: number; doc_role?: string; etapa?: string }>();
  const byNormalized = new Map<string, { id: number; doc_role?: string; etapa?: string }>();
  for (const df of orderedDbFiles) {
    byExact.set(df.filename, { id: df.id, doc_role: df.doc_role, etapa: df.etapa });
    byNormalized.set(normalizeChbFilename(df.filename), { id: df.id, doc_role: df.doc_role, etapa: df.etapa });
  }

  const textByNormalized = new Map<string, string>();
  for (const [filename, text] of Object.entries(extractedTexts)) {
    textByNormalized.set(normalizeChbFilename(filename), text);
  }

  const persisted: Array<{ filename: string; extractionId: number | null; status: string; rawOcrText: string }> = [];
  const duplicateNames = new Set(
    files
      .map(file => normalizeChbFilename(file.name))
      .filter((name, index, all) => all.indexOf(name) !== index)
  );

  for (const [index, file] of files.entries()) {
    const normalizedName = normalizeChbFilename(file.name);
    let rawOcr = duplicateNames.has(normalizedName)
      ? ''
      : (extractedTexts[file.name] || textByNormalized.get(normalizedName) || '');

    if (!rawOcr || rawOcr.trim().length < 10) {
      console.log(`[BG][raw-ocr-save] Re-extracting raw text for ${file.name} because main OCR map was missing/short`);
      rawOcr = await extractRawTextForPersistence(file);
    }

    let dbFile = byExact.get(file.name) || byNormalized.get(normalizedName) || orderedDbFiles[index];
    if (!dbFile) {
      console.warn(`[BG][raw-ocr-save] No DB file match for "${file.name}" — auto-registering (known: ${orderedDbFiles.map(f => f.filename).join(' | ') || '(none)'})`);
      try {
        const created = await callMariaDBProxy('create_chb_file', {
          itemId,
          filename: file.name,
          etapa: String(stepId),
          docRole: (file as any).docRole || 'O',
          mime: (file as any).mimeType || null,
          sizeBytes: (file as any).sizeBytes || null,
          url: '',
          relPath: '',
          userId: null,
        });
        if (created?.fileId) {
          dbFile = { id: created.fileId, doc_role: (file as any).docRole || 'O', etapa: String(stepId) };
          console.log(`[BG][raw-ocr-save] auto-registered fileId=${created.fileId} for "${file.name}"`);
        }
      } catch (regErr) {
        console.error(`[BG][raw-ocr-save] Failed to auto-register "${file.name}":`, (regErr as Error).message);
        throw regErr;
      }
    }

    const hasRawOcr = rawOcr.trim().length >= 10;
    const ins = await callMariaDBProxy('insert_chb_extraction', {
      itemId,
      fileId: dbFile?.id ?? null,
      filename: file.name,
      docRole: dbFile?.doc_role ?? null,
      etapa: String(stepId),
      fileSha256: null,
      extractorModel: 'google/gemini-2.5-flash',
      extractorPromptVersion: 'main-raw-ocr-v3-auto-register',
      extractorConfidence: null,
      rawOcrText: hasRawOcr ? rawOcr : null,
      structuredFields: null,
      fieldEvidence: null,
      extractionStatus: hasRawOcr ? 'OK' : 'PARCIAL',
      errorMessage: hasRawOcr ? null : 'OCR vazio ou insuficiente no fluxo principal e na reextração',
    });

    persisted.push({ filename: file.name, extractionId: ins.extractionId ?? null, status: hasRawOcr ? 'OK' : 'PARCIAL' });
    console.log(`[BG][raw-ocr-save] ${file.name} → extractionId=${ins.extractionId} status=${hasRawOcr ? 'OK' : 'PARCIAL'} (${rawOcr.length} chars)`);
  }

  if (persisted.length !== files.length) {
    throw new Error(`OCR bruto não foi gravado para todos os arquivos (${persisted.length}/${files.length})`);
  }

  return persisted;
}

async function saveExtractedData(
  itemId: number,
  filename: string,
  etapa: string,
  extractedFields: Record<string, any>,
  rawText?: string
): Promise<void> {
  try {
    // Save to MariaDB using specific action
    await callMariaDBProxy('save_chb_extracted_data', {
      itemId,
      filename,
      etapa,
      extractedFields,
      rawText: rawText || null
    });
    console.log(`[saveExtractedData] Saved to MariaDB for item ${itemId}, file ${filename}`);
  } catch (e) {
    console.error('[saveExtractedData] Failed:', e);
  }
}

async function getCachedExtractedData(itemId: number): Promise<Record<string, { fields: Record<string, any>; rawText?: string }>> {
  try {
    const result = await callMariaDBProxy('get_chb_extracted_data', { itemId });
    
    const cache: Record<string, { fields: Record<string, any>; rawText?: string }> = {};
    const data = result.data || [];
    
    for (const item of data) {
      let fields = {};
      try {
        fields = typeof item.extracted_fields === 'string' 
          ? JSON.parse(item.extracted_fields) 
          : (item.extracted_fields || {});
      } catch {
        fields = {};
      }
      
      cache[item.filename] = {
        fields,
        rawText: item.raw_text,
      };
    }
    
    return cache;
  } catch (e) {
    console.error('[getCachedExtractedData] Failed to fetch:', e);
    return {};
  }
}

// Parse extracted data from LLM response for caching
// IMPROVED: Extract from HTML table for better accuracy
function parseExtractedFields(response: string, filename: string): Record<string, any> {
  const fields: Record<string, any> = {};
  
  // CAMPOS CRÍTICOS que devem ser persistidos
  const criticalFields = [
    'peso_bruto', 'peso_liquido', 'valor_mercadoria', 'valor_total_frete',
    'ncm', 'incoterm', 'moeda', 'valor_seguro', 'quantidade', 'consignee', 'cnpj'
  ];
  
  // Try to extract from HTML table first (more reliable)
  const tableMatch = response.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (tableMatch) {
    const tableHtml = tableMatch[1];
    
    // Extract headers to find column for this filename
    const headerMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    let filenameColumnIndex = -1;
    
    if (headerMatch) {
      const headerCells = headerMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      for (let i = 0; i < headerCells.length; i++) {
        const cellText = headerCells[i].replace(/<[^>]+>/g, '').trim();
        if (cellText.toLowerCase().includes(filename.toLowerCase().replace('.pdf', '').replace('.xlsx', ''))) {
          filenameColumnIndex = i;
          break;
        }
      }
    }
    
    // Extract rows
    const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length >= 3) {
        // First cell is status, second is field name
        const fieldName = cells[1]?.replace(/<[^>]+>/g, '').trim().toLowerCase();
        
        // Get value from the column matching this filename (or last column as fallback)
        const valueIndex = filenameColumnIndex >= 0 ? filenameColumnIndex : cells.length - 1;
        const value = cells[valueIndex]?.replace(/<[^>]+>/g, '').trim();
        
        if (fieldName && value && value !== 'ND' && value !== '-') {
          // Map field names to normalized keys
          const fieldMapping: Record<string, string> = {
            'peso bruto': 'peso_bruto',
            'gross weight': 'peso_bruto',
            'peso líquido': 'peso_liquido',
            'peso liquido': 'peso_liquido',
            'net weight': 'peso_liquido',
            'valor mercadoria': 'valor_mercadoria',
            'valor total mercadoria': 'valor_mercadoria',
            'merchandise value': 'valor_mercadoria',
            'invoice amount': 'valor_mercadoria',
            'valor total frete': 'valor_total_frete',
            'total prepaid': 'valor_total_frete',
            'total collect': 'valor_total_frete',
            'total charges': 'valor_total_frete',
            'valor seguro': 'valor_seguro',
            'insurance': 'valor_seguro',
            'insurance amount': 'valor_seguro',
            'ncm': 'ncm',
            'hs code': 'ncm',
            'incoterm': 'incoterm',
            'moeda': 'moeda',
            'currency': 'moeda',
            'quantidade': 'quantidade',
            'quantity': 'quantidade',
            'packages': 'quantidade',
            'consignee': 'consignee',
            'consignatário': 'consignee',
            'cnpj': 'cnpj',
          };
          
          const normalizedKey = fieldMapping[fieldName];
          if (normalizedKey && criticalFields.includes(normalizedKey)) {
            // Guard: campos de peso nunca podem conter moeda (proteção contra contaminação por frete)
            if ((normalizedKey === 'peso_bruto' || normalizedKey === 'peso_liquido') &&
                /\b(EUR|USD|BRL|GBP|R\$|US\$|€|\$)\b/i.test(value)) {
              continue;
            }
            fields[normalizedKey] = value;
          }
        }
      }
    }
  }
  
  // Fallback: Try to extract common fields from raw text using regex
  if (Object.keys(fields).length < 3) {
    const fieldPatterns: Record<string, RegExp[]> = {
      peso_bruto: [/peso\s*bruto[:\s]*([0-9.,]+)\s*(kg)?/gi, /gross\s*weight[:\s]*([0-9.,]+)/gi],
      peso_liquido: [/peso\s*l[íi]quido[:\s]*([0-9.,]+)\s*(kg)?/gi, /net\s*weight[:\s]*([0-9.,]+)/gi],
      valor_mercadoria: [/valor\s*mercadoria[:\s]*([A-Z]{3})?\s*([0-9.,]+)/gi, /merchandise[:\s]*([0-9.,]+)/gi],
      valor_total_frete: [/valor\s*total\s*frete[:\s]*([A-Z]{3})?\s*([0-9.,]+)/gi, /total\s*prepaid[:\s]*([0-9.,]+)/gi],
      valor_seguro: [/valor\s*seguro[:\s]*([A-Z]{3})?\s*([0-9.,]+)/gi, /insurance[:\s]*([0-9.,]+)/gi],
      moeda: [/moeda[:\s]*([A-Z]{3})/gi, /(USD|EUR|BRL)/g],
      incoterm: [/incoterm[:\s]*([A-Z]{3})/gi, /(FOB|CIF|DDP|DAP|CFR|EXW|FCA)/g],
      quantidade: [/quantidade[:\s]*([0-9.,]+)/gi, /qty[:\s]*([0-9.,]+)/gi, /packages[:\s]*([0-9]+)/gi],
      ncm: [/ncm[:\s]*([0-9]{4,8})/gi, /hs\s*code[:\s]*([0-9]{4,8})/gi],
      consignee: [/consignee[:\s]*([^\n<]+)/gi, /consignat[áa]rio[:\s]*([^\n<]+)/gi],
      cnpj: [/cnpj[:\s]*([0-9./-]+)/gi],
    };
    
    for (const [field, patterns] of Object.entries(fieldPatterns)) {
      if (fields[field]) continue; // Skip if already found from table
      for (const pattern of patterns) {
        const match = response.match(pattern);
        if (match && match[1]) {
          fields[field] = match[1].trim();
          break;
        }
      }
    }
  }
  
  console.log(`[parseExtractedFields] Extracted ${Object.keys(fields).length} fields from ${filename}:`, Object.keys(fields));
  return fields;
}

// =============================================================================
// BACKGROUND ANALYSIS PROCESSOR
// =============================================================================

async function processAnalysisInBackground(
  requestId: string,
  stepId: number,
  files: FileForAnalysis[],
  clientConfig?: ClientConfig,
  itemId?: number,
  _cachedDataUnused?: unknown
): Promise<void> {
  console.log(`[BG] startedAt=${new Date().toISOString()} requestId=${requestId} step=${stepId} itemId=${itemId} files=${files?.length ?? 0}`);
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[BG] v2-extractions-enabled :: Starting background analysis for request ${requestId} (itemId=${itemId})`);

    
    // Update status to processing in MariaDB
    await callMariaDBProxy('update_chb_run', {
      runId: requestId,
      status: 'processing'
    });
    
    console.log(`[BG] Processing ${files.length} files for step ${stepId}`);

    // =========================================================================
    // STEP 0: PER-FILE EXTRACTION → t_chb_file_extractions (auditable truth)
    // =========================================================================
    let perFileExtractions: Array<{
      filename: string;
      docRole: string | null;
      structured: Record<string, any> | null;
      evidence: Record<string, any> | null;
      model: string | null;
      status: string;
      extractionId: number | null;
    }> = [];

    // NOTE: per-file extraction persistence moved to AFTER OCR runs (see [BG][extract] block below the LLM call).
    // This avoids racing with file registration and lets us persist the actual raw OCR text.

    // =========================================================================
    // FLUXO ÚNICO: extrair → gravar em t_chb_file_extractions → reler raw_ocr_text
    // → alimentar análise SOMENTE com o conteúdo persistido (fonte única de verdade).
    // Sem fallback para extração em memória — se a gravação ou releitura falhar,
    // a análise é marcada como erro.
    // =========================================================================
    if (!itemId) {
      console.error('[BG][pre-analysis] itemId ausente — fluxo persistido obrigatório');
      await callMariaDBProxy('update_chb_run', {
        runId: requestId,
        status: 'error',
        resultText: 'itemId obrigatório para o fluxo de extração persistida.'
      });
      return;
    }

    let dbOcrByFilename: Record<string, string> = {};
    try {
      const persistResults = await persistRawOcrForFiles(itemId, stepId, files, {});
      console.log(`[BG][pre-analysis] Persisted raw OCR for ${persistResults.length} file(s)`);

      const dbRowsResp = await callMariaDBProxy('get_chb_extractions', { itemId, etapa: String(stepId) });
      const dbRows: Array<{ filename: string; raw_ocr_text: string | null }> = dbRowsResp?.data || [];
      for (const row of dbRows) {
        if (row.filename && row.raw_ocr_text) {
          dbOcrByFilename[row.filename] = row.raw_ocr_text;
        }
      }
      console.log(`[BG][pre-analysis] Read back ${Object.keys(dbOcrByFilename).length} raw_ocr_text rows from t_chb_file_extractions`);
    } catch (e) {
      console.error('[BG][pre-analysis] Pre-extraction/read failed — aborting analysis:', (e as Error).message);
      await callMariaDBProxy('update_chb_run', {
        runId: requestId,
        status: 'error',
        resultText: `Falha ao gravar/reler OCR persistido: ${(e as Error).message}`
      });
      return;
    }

    if (Object.keys(dbOcrByFilename).length === 0) {
      console.error('[BG][pre-analysis] Nenhum raw_ocr_text relido — abortando análise');
      await callMariaDBProxy('update_chb_run', {
        runId: requestId,
        status: 'error',
        resultText: 'Nenhum OCR persistido pôde ser relido de t_chb_file_extractions.'
      });
      return;
    }


    
    // Fetch user corrections if itemId provided
    let userCorrections: { filename: string; field_name: string; corrected_value: string; location_reference?: string; location_context?: string; location_confidence?: string }[] = [];
    if (itemId) {
      try {
        console.log(`[BG] Fetching user corrections for item ${itemId}...`);
        const correctionsResult = await callMariaDBProxy('get_chb_corrections', { itemId });
        userCorrections = correctionsResult.data || [];
        console.log(`[BG] Found ${userCorrections.length} validated user corrections`);
      } catch (e) {
        console.error('[BG] Error fetching user corrections:', e);
      }
    }
    
    // Fetch learned extraction rules
    let extractionRules: { field_name: string; document_type: string; extraction_pattern: string; location_hint: string; example_value: string; success_rate: number }[] = [];
    try {
      console.log(`[BG] Fetching learned extraction rules...`);
      const rulesResult = await callMariaDBProxy('get_chb_extraction_rules', {});
      extractionRules = rulesResult.rules || [];
      console.log(`[BG] Found ${extractionRules.length} learned extraction rules`);
    } catch (e) {
      console.error('[BG] Error fetching extraction rules:', e);
    }
    
    let cachedContext = '';




    // =========================================================================
    // RAW OCR PERSISTIDO — fonte única de verdade vinda de t_chb_file_extractions
    // =========================================================================
    if (Object.keys(dbOcrByFilename).length > 0) {
      cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
📚 OCR BRUTO PERSISTIDO (t_chb_file_extractions) — FONTE ÚNICA DE VERDADE
═══════════════════════════════════════════════════════════════════════════════

Os textos abaixo foram extraídos de cada arquivo e gravados em banco ANTES desta
análise. Toda informação que você usar nas células da grade deve estar contida
neste texto. NÃO invente valores fora deste OCR.

`;
      for (const [fname, txt] of Object.entries(dbOcrByFilename)) {
        const truncated = txt.length > 8000 ? txt.slice(0, 8000) + '\n…[truncado]' : txt;
        cachedContext += `--- 📄 ${fname} ---\n${truncated}\n\n`;
      }
      cachedContext += `═══════════════════════════════════════════════════════════════════════════════\n\n`;
    }



    
    // Add learned extraction rules context (helps LLM find fields based on past corrections)
    if (extractionRules.length > 0) {
      // Separate rules with processing instructions (highest priority)
      const rulesWithProcessing = extractionRules.filter((r: any) => r.processing_instruction);
      const rulesWithoutProcessing = extractionRules.filter((r: any) => !r.processing_instruction);
      
      // FIRST: Rules with processing instructions (CRITICAL - calculation rules)
      if (rulesWithProcessing.length > 0) {
        cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
🔴🔴🔴 INSTRUÇÕES DE CÁLCULO OBRIGATÓRIAS (PRIORIDADE MÁXIMA) 🔴🔴🔴
═══════════════════════════════════════════════════════════════════════════════

O sistema APRENDEU que os seguintes campos requerem CÁLCULOS ESPECIAIS.
VOCÊ DEVE SEGUIR ESTAS INSTRUÇÕES EXATAMENTE:

`;
        for (const rule of rulesWithProcessing) {
          cachedContext += `📍 Campo: ${rule.field_name}\n`;
          cachedContext += `   Documento: ${rule.document_type}\n`;
          cachedContext += `   ⚠️ INSTRUÇÃO OBRIGATÓRIA: ${(rule as any).processing_instruction}\n`;
          if (rule.extraction_pattern) {
            cachedContext += `   Padrão de busca: ${rule.extraction_pattern}\n`;
          }
          if (rule.example_value) {
            cachedContext += `   Exemplo de resultado: "${rule.example_value}"\n`;
          }
          cachedContext += `   Confiança: ${rule.success_rate}%\n\n`;
        }
        
        cachedContext += `
🔴 VOCÊ DEVE:
1. EXECUTAR o cálculo indicado na "INSTRUÇÃO OBRIGATÓRIA"
2. Se a instrução diz "SOME", você DEVE somar todos os valores individuais
3. Se a instrução diz "CONVERTA", você DEVE aplicar a conversão indicada
4. DOCUMENTAR o cálculo na coluna "Observações" (ex: "Peso calculado: 50 + 30 + 21.5 = 101.5")
5. NÃO IGNORAR estas instruções - elas foram validadas pelo usuário

═══════════════════════════════════════════════════════════════════════════════

`;
      }
      
      // SECOND: Regular extraction rules (location hints)
      if (rulesWithoutProcessing.length > 0) {
        cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
📚 REGRAS DE EXTRAÇÃO APRENDIDAS (ALTA PRIORIDADE)
═══════════════════════════════════════════════════════════════════════════════

Com base em CORREÇÕES ANTERIORES do usuário, o sistema aprendeu onde encontrar cada campo.
USE ESTAS DICAS para localizar os campos CORRETAMENTE:

`;
        for (const rule of rulesWithoutProcessing) {
          cachedContext += `📍 Campo: ${rule.field_name}\n`;
          cachedContext += `   Documento típico: ${rule.document_type}\n`;
          if (rule.extraction_pattern) {
            cachedContext += `   Padrão de busca: ${rule.extraction_pattern}\n`;
          }
          if (rule.location_hint) {
            cachedContext += `   Localização comum: ${rule.location_hint}\n`;
          }
          if (rule.example_value) {
            cachedContext += `   Exemplo de valor: "${rule.example_value}"\n`;
          }
          cachedContext += `   Confiança: ${rule.success_rate}%\n\n`;
        }
        
        cachedContext += `
⚠️ APLIQUE ESTAS DICAS:
1. Procure cada campo seguindo o PADRÃO indicado acima
2. A LOCALIZAÇÃO COMUM indica onde o campo geralmente aparece
3. O EXEMPLO mostra o formato típico do valor
4. Use estas dicas para NÃO errar na extração!

═══════════════════════════════════════════════════════════════════════════════

`;
      }
    }
    
    // Add user corrections context first (highest priority)
    if (userCorrections.length > 0) {
      cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
⚠️ CORREÇÕES VALIDADAS PELO USUÁRIO — PRIORIDADE MÁXIMA
═══════════════════════════════════════════════════════════════════════════════

O usuário CORRIGIU os seguintes valores. VOCÊ DEVE USAR ESSES VALORES CORRIGIDOS!

`;
      for (const corr of userCorrections) {
        cachedContext += `Arquivo: ${corr.filename}\n`;
        cachedContext += `  ✓ ${corr.field_name}: ${corr.corrected_value}\n`;
        if (corr.location_reference) {
          cachedContext += `    📍 Localização confirmada: ${corr.location_reference}\n`;
        }
        if (corr.location_context) {
          cachedContext += `    📝 Contexto: "${corr.location_context}"\n`;
        }
        if (corr.location_confidence) {
          cachedContext += `    🎯 Confiança: ${corr.location_confidence}\n`;
        }
        cachedContext += '\n';
      }
      
      cachedContext += `
🔴 REGRA ABSOLUTA DE CORREÇÕES DO USUÁRIO (FONTE DE VERDADE FINAL):
1. O usuário CORRIGIU manualmente os valores acima
2. VOCÊ DEVE usar EXATAMENTE esses valores na tabela
3. Se você encontrar valor DIFERENTE no documento → IGNORAR e usar o valor corrigido
4. A correção do usuário é FONTE DE VERDADE FINAL
5. NUNCA substituir uma correção do usuário por valor do documento
6. Se houver divergência entre documento e correção → Usar correção + nota explicativa
7. A confiança da localização indica quão certo o sistema está sobre onde o valor está

⚠️ CHECKLIST DE VERIFICAÇÃO PARA CORREÇÕES:
□ Usei o valor corrigido pelo usuário? (obrigatório)
□ Coloquei o valor na coluna correta do arquivo?
□ Se encontrei valor diferente, mantive o corrigido?
□ Adicionei nota se houve divergência?

═══════════════════════════════════════════════════════════════════════════════

`;
    }
    
    // === Approved snapshots from previous steps (ground-truth absoluto) ===
    try {
      if (itemId && Number(stepId) > 1) {
        const snapResp = await callMariaDBProxy('get_chb_approved_snapshots', {
          itemId,
          maxEtapa: String(stepId),
        });
        const snapshots = Array.isArray(snapResp?.data) ? snapResp.data : [];
        console.log(`[BG] Approved snapshots loaded for item ${itemId} (etapa<${stepId}):`, snapshots.length);

        if (snapshots.length > 0) {
          const stepNamesPt: Record<string, string> = { '1': 'Pré-Alerta', '2': 'Instrução', '3': 'DI/Fechamento' };
          let snapBlock = `
═══════════════════════════════════════════════════════════════════════════════
🔒 ETAPAS ANTERIORES JÁ APROVADAS — GROUND TRUTH ABSOLUTO
═══════════════════════════════════════════════════════════════════════════════

Os valores abaixo já foram analisados e APROVADOS pelo usuário em etapas anteriores.
Eles são FONTE DE VERDADE. Reutilize-os sem reanalisar:

`;
          for (const snap of snapshots) {
            const etapaKey = String(snap.etapa);
            const stepName = stepNamesPt[etapaKey] || `Etapa ${etapaKey}`;
            let payload: any = {};
            try {
              payload = typeof snap.snapshot === 'string' ? JSON.parse(snap.snapshot) : (snap.snapshot || {});
            } catch { payload = {}; }
            const rows: any[] = Array.isArray(payload.rows) ? payload.rows : [];
            snapBlock += `\n— ${stepName} (aprovado em ${snap.approved_at || '?'}) —\n`;
            const MAX_ROWS = 40;
            const MAX_VAL_LEN = 240;
            const visible = rows.slice(0, MAX_ROWS);
            for (const r of visible) {
              const valores = r.valores && typeof r.valores === 'object' ? r.valores : {};
              let valStr = Object.entries(valores)
                .map(([k, v]) => `${k}=${v}`)
                .join(' | ');
              if (valStr.length > MAX_VAL_LEN) valStr = valStr.slice(0, MAX_VAL_LEN) + '…';
              snapBlock += `  • ${r.campo}: ${valStr || '(sem valor)'}\n`;
            }
            if (rows.length > MAX_ROWS) {
              snapBlock += `  … (+${rows.length - MAX_ROWS} campos omitidos)\n`;
            }
          }

          snapBlock += `
🔴 REGRAS PARA ETAPAS APROVADAS:
1. Valores já aprovados são VERDADE ABSOLUTA — NÃO reanalisar nem questionar.
2. Se o documento desta etapa divergir do valor aprovado anterior, sinalizar DIVERGÊNCIA ENTRE ETAPAS.
3. Use os valores aprovados como referência para validar consistência da etapa atual.

═══════════════════════════════════════════════════════════════════════════════

`;
          cachedContext = snapBlock + cachedContext;
        }
      }
    } catch (snapErr) {
      console.warn('[BG] Failed to load approved snapshots (non-blocking):', snapErr);
    }

    const fileNames = files.map((f: any) => f.name);
    const basePrompt = getPromptByStep(stepId, fileNames, clientConfig);
    const prompt = cachedContext ? cachedContext + '\n\n' + basePrompt : basePrompt;

    
    console.log(`[BG] Prompt length: ${prompt.length} chars`);
    
    let responseText: string;
    let usedFallback = false;
    let fileWarnings: ChbFileError[] = [];
    let extractedTexts: Record<string, string> | undefined;

    // Try Anthropic first
    try {
      console.log('[BG] Attempting Anthropic API...');
      const result = await callAnthropicAPI(prompt, files, dbOcrByFilename);
      responseText = result.text;
      fileWarnings = result.warnings;
      extractedTexts = result.extractedTexts;
      console.log('[BG] Anthropic API succeeded');
    } catch (anthropicError) {
      console.error('[BG] Anthropic API failed, trying Gemini API fallback:', anthropicError);
      usedFallback = true;
      
      try {
        console.log('[BG] Attempting Gemini API fallback...');
        const result = await callGeminiAPI(prompt, files, dbOcrByFilename);
        responseText = result.text;
        fileWarnings = result.warnings;
        extractedTexts = result.extractedTexts;
        console.log('[BG] Gemini API succeeded');
      } catch (geminiError) {
        console.error('[BG] Gemini API also failed:', geminiError);
        
        // Update request with error in MariaDB
        await callMariaDBProxy('update_chb_run', {
          runId: requestId,
          status: 'error',
          resultText: `Falha na análise: ${geminiError instanceof Error ? geminiError.message : 'Erro desconhecido'}`
        });
        
        return;
      }
    }

    const parsedResult = extractHtmlAndTags(responseText, stepId);
    const html = applyAwbPortugueseTotalFreightCorrection(parsedResult.html, dbOcrByFilename);
    const correctedResult = extractHtmlAndTags(`<<BEGIN_HTML>>${html}<<END_HTML>>`, stepId);
    const { tags, summary, detailedSummary, parecer } = correctedResult;
    const { modal, cliente } = parsedResult;

    console.log(`[BG] Analysis completed - ${tags.map(t => t.label).join(', ')}`);

    // Persistência de raw OCR agora roda ANTES da análise (ver bloco [BG][pre-analysis]).
    const rawOcrPersistResults: Array<{ filename: string; extractionId: number | null; status: string }> = [];


    // Build result object
    const resultData = {
      id: crypto.randomUUID(),
      stepId,
      html,
      tags,
      summary,
      detailedSummary,
      parecer,
      modal,
      cliente,
      generatedAt: new Date().toLocaleString('pt-BR'),
      filesAnalyzed: files.map((f: any) => f.name),
      usedFallback,
      fileWarnings: fileWarnings.length > 0 ? fileWarnings : undefined,
      extractionIds: rawOcrPersistResults,
    };

    // Update request with result in MariaDB
    await callMariaDBProxy('update_chb_run', {
      runId: requestId,
      status: 'completed',
      resultHtml: JSON.stringify(resultData),
      resultJson: resultData
    });

    console.log(`[BG] Request ${requestId} completed successfully`);


  } catch (error) {
    console.error(`[BG] Error processing analysis ${requestId}:`, error);
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    // Update request with error in MariaDB — never let this throw out
    try {
      await callMariaDBProxy('update_chb_run', {
        runId: requestId,
        status: 'error',
        resultText: errMsg,
      });
      console.log(`[BG] Marked run ${requestId} as error`);
    } catch (updateErr) {
      console.error(`[BG] FAILED to mark run ${requestId} as error:`, updateErr);
    }
  }

}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const supabase = getSupabaseClient();
    
    // =========================================================================
    // MODE: POLL - Check status of existing request (using MariaDB)
    // =========================================================================
    if (body.requestId) {
      const { requestId } = body;
      console.log(`[POLL] Checking status for request ${requestId}`);
      
      try {
        const pollResult = await callMariaDBProxy('get_chb_run_by_id', { runId: requestId });
        
        const data = (pollResult.data || pollResult)?.[0];
        
        if (!data) {
          return new Response(
            JSON.stringify({ 
              status: 'error', 
              error: 'Requisição não encontrada' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Parse result_html if completed
        let result = null;
        if (data.status === 'completed' && data.result_html) {
          try {
            result = JSON.parse(data.result_html);
          } catch {
            result = { html: data.result_html };
          }
        }
        
        return new Response(
          JSON.stringify({
            status: data.status,
            result,
            error: data.status === 'error' ? data.result_text : null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (pollError) {
        console.error('[POLL] Error querying MariaDB:', pollError);
        return new Response(
          JSON.stringify({ 
            status: 'error', 
            error: 'Erro ao consultar status' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // =========================================================================
    // MODE: SUBMIT - Start new analysis (async)
    // =========================================================================
    const { stepId, files, clientConfig, itemId } = body;

    if (!stepId || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'stepId e files são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`═══ CHB ANALYSIS (ASYNC) v3-persisted-extractions ═══`);
    console.log(`[SUBMIT] v3-persisted-extractions :: Total files: ${files.length}, itemId=${itemId}`);
    console.log(`[SUBMIT] Files: ${files.map((f: any) => `${f.name} (${f.mimeType})`).join(', ')}`);
    
    // Validate input size
    const inputValidation = validateInputSize(files);
    console.log(`[SUBMIT] Estimated input tokens: ${inputValidation.estimatedTokens}`);
    
    if (!inputValidation.isValid) {
      return new Response(
        JSON.stringify({ 
          error: inputValidation.warning,
          errors: [{
            type: 'size',
            message: 'Arquivos muito grandes para análise',
            suggestion: 'Reduza o número ou tamanho dos arquivos.'
          }]
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create analysis request in MariaDB - use DB auto-increment ID
    let requestId: string;
    
    try {
      const createRunResult = await callMariaDBProxy('create_chb_run', {
        itemId: itemId || 0,
        etapa: stepId.toString(),
        status: 'pending',
        resultText: JSON.stringify({ 
          filesCount: files.length, 
          fileNames: files.map((f: any) => f.name),
          hasClientConfig: !!clientConfig,
        })
      });
      requestId = String(createRunResult.runId);
      console.log(`[SUBMIT] Created request ${requestId} in MariaDB (auto-generated ID)`);
    } catch (insertError) {
      console.error('[SUBMIT] Error creating request in MariaDB:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar requisição de análise' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background processing (single-fire — never call twice)
    console.log(`[SUBMIT] Dispatching background analysis for request ${requestId}`);
    // deno-lint-ignore no-explicit-any
    const bgPromise = processAnalysisInBackground(requestId, stepId, files, clientConfig, itemId)
      .catch((bgErr) => {
        console.error(`[SUBMIT] Background analysis crashed for ${requestId}:`, bgErr);
      });
    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(bgPromise);
    }



    // Return request ID immediately
    return new Response(
      JSON.stringify({
        requestId,
        status: 'pending',
        message: 'Análise iniciada. Use o requestId para consultar o status.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-chb-documents:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        errors: [{
          type: 'unknown',
          message: errorMessage,
          suggestion: 'Tente novamente. Se o problema persistir, entre em contato com o suporte.'
        }]
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
