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
    frete: 'Frete',
    quantidade: 'Quantidade',
    ncm: 'NCM',
    descricao: 'Descrição',
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

3) TOLERÂNCIA NUMÉRICA — APLICAÇÃO CORRETA:
   ⚠️ TOLERÂNCIA SE APLICA APENAS PARA DIFERENÇAS DE ARREDONDAMENTO/FORMATAÇÃO!
   - TOLERÂNCIA DE PESO: ${toleranciaPeso}% (para pequenas diferenças de arredondamento)
   - TOLERÂNCIA DE VALOR: ${toleranciaValor}% (para pequenas diferenças de arredondamento)
   - Valores como 97,3 e 97,30 são EQUIVALENTES (✅) — zeros à direita NÃO são divergência!
   - Valores como 97,3 e 97.30 são EQUIVALENTES (✅) — vírgula vs ponto decimal é formatação!
   - 10.841,00 e 10841 e 10.841 são EQUIVALENTES (✅)
   - Ignore zeros à direita e diferenças de formatação de decimais
   
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

5) Regras de PESO — CRÍTICO (linhas separadas obrigatórias):
   - PESO BRUTO (Gross Weight): linha própria na tabela
   - PESO LÍQUIDO (Net Weight): linha própria na tabela (NÃO assumir Gross como padrão)
   - TARA: linha própria quando presente
   - Se Gross(BL) ≈ Net(PL) e há diferença de tara → 🟨 com nota explicativa
   - Divergência > ${toleranciaPeso}% sem explicação → 🔴
   - Se DI usa líquido como bruto → 🔴 CRÍTICO

6) INCOTERM e FRETE — LINHAS SEPARADAS OBRIGATÓRIAS:
   - INCOTERM: linha própria (ex.: FOB, CFR, CIF, EXW, etc.)
   - FRETE/FREIGHT: linha própria com VALOR DO FRETE (não confundir com valor da mercadoria!)
   - NUNCA unificar em uma única linha de validação
   - Incoterms diferentes (ex.: CFR × FOB) → 🔴
   - Incoterm coerente mas rótulo faltante → 🟨

7) VALORES — REGRAS CRÍTICAS (ATENÇÃO MÁXIMA — DIFERENCIE CLARAMENTE):

   ⚠️ EXISTEM TRÊS VALORES DISTINTOS — NÃO CONFUNDA!
   
   A) VALOR TOTAL DA MERCADORIA (Invoice Amount / Merchandise Value):
      - É o valor TOTAL dos produtos na Invoice comercial
      - Sinônimos: "Total Items", "Merchandise Total", "Subtotal", "Total Goods Value", "Commercial Value"
      - Linha da tabela: "Valor Mercadoria"
      - ⚠️ NÃO usar "Final Amount" ou "Total Amount" para mercadoria (podem incluir frete!)
   
   B) VALOR DO FRETE (Freight / Ocean Freight / Air Freight):
      - É o custo do TRANSPORTE da carga
      - Aparece no BL, HBL, AWB, ou documentos de frete
      - Linha da tabela: "Frete" ou "Freight"
      - ATENÇÃO: Frete pode ser "COLLECT" ou "PREPAID" — indicar na observação
   
   C) VALOR TOTAL FRETE (Total do Documento):
      - É a soma de TODOS os custos (mercadoria + frete + taxas + impostos)
      - ONDE PROCURAR:
        → CCT/BL/AWB: Linha "Total" na coluna "Prepaid" ou "Collect"
        → Invoice: "Final Amount", "Total Amount", "Grand Total", "Amount Due"
        → Packing List: geralmente não tem (ND é aceitável)
      - Sinônimos: "Total Prepaid", "Total Collect", "Total Charges", "Grand Total",
                   "Final Amount", "Total Amount", "Amount Due", "Total Invoice"
       - Linha da tabela: "Valor Total Frete"
   
   D) REGRA ESPECIAL PARA RELATÓRIO DI / RASCUNHO DI:
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

8) NCM — Regra aduaneira:
   - Divergência na RAIZ (4 primeiros dígitos) → 🔴 CRÍTICO
   - Divergência apenas no sufixo com descrição compatível → 🟨

9) CNPJ/Consignee:
   - CNPJ divergente → 🔴 CRÍTICO
   - Razão social diferente (mesmo CNPJ) → 🟨

10) IDENTIFICAÇÃO DE MODAL — AUTOMÁTICA:
   - Se documento contém "AWB", "Airway Bill", "MAWB", "HAWB" → MODAL = AIR
   - Se documento contém "BL", "Bill of Lading", "HBL", "MBL", "Container" → MODAL = SEA
   - Reportar o modal detectado no bloco METADATA
${fiscalRulesSection}${armadorSection}${taxasSection}

14) REGRAS ESPECÍFICAS PARA AWB/HAWB (ATENÇÃO MÁXIMA):
   
   A) ESTRUTURA DE CHARGES EM DUAS COLUNAS:
      - HAWB/AWB típico tem estrutura: PREPAID (esquerda) | COLLECT (direita)
      - Cada coluna lista os respectivos encargos
      - SEMPRE verificar AMBAS as colunas ao extrair valores!
   
   B) EXTRAÇÃO DE "TOTAL CHARGES":
      ⚠️ NÃO existe campo literal "Total Charges" no AWB padrão IATA!
      ONDE PROCURAR:
      → Linha "Total" na coluna "Prepaid" → valor do frete pré-pago
      → Linha "Total" na coluna "Collect" → valor a cobrar no destino
      → "Total Other Charges Due Agent/Carrier" → taxas adicionais
      
      COMO REPORTAR:
      - Se PREPAID: Linha "Total Prepaid" com o valor
      - Se COLLECT: Linha "Total Collect" com o valor
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

FOCO PRINCIPAL:
1. Comparar valores do Draft DI com Invoice + BL/AWB originais
2. Validar NCM e CFOP estão corretos para a operação
3. Verificar cálculo de tributos (se visível no draft)
4. Confirmar que dados do importador/exportador estão corretos
5. Identificar QUALQUER divergência que poderia causar multa ou retenção

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
}

// Validate total input size to avoid API errors
function validateInputSize(files: FileForAnalysis[]): { isValid: boolean; estimatedTokens: number; warning?: string } {
  // Estimate tokens: ~1.5 tokens per character for base64 content
  // Claude has ~200k token context, but we need room for output
  const MAX_INPUT_TOKENS = 300000;
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
async function callAnthropicAPI(prompt: string, files: FileForAnalysis[]): Promise<ApiResponse> {
  const anthropicApiKey = Deno.env.get('CHB_ANTHROPIC_API_KEY');
  
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  
  const warnings: ChbFileError[] = [];
  
  // Build content array with files
  const content: any[] = [];
  
  // Add files as images or text
  for (const file of files) {
    if (file.mimeType.startsWith('image/')) {
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
    } else if (file.mimeType === 'application/pdf') {
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
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || 
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Extract text from Excel
      try {
        const excelText = await extractExcelText(file.content, file.name);
        content.push({
          type: 'text',
          text: excelText,
        });
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
    } else {
      // Text-based files
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
  
  // Add the analysis prompt at the end
  content.push({
    type: 'text',
    text: prompt,
  });
  
  const startTime = Date.now();
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 32000,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });
  
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
  
  return { text: textContent.text, warnings };
}

// Call Lovable AI (Gemini) as fallback
async function callLovableAI(prompt: string, files: FileForAnalysis[]): Promise<ApiResponse> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  
  const warnings: ChbFileError[] = [];
  
  // Build parts for Gemini
  const parts: any[] = [];
  
  for (const file of files) {
    if (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf') {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.content,
        },
      });
      parts.push({
        text: `[Arquivo: ${file.name}]`,
      });
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') ||
               file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const excelText = await extractExcelText(file.content, file.name);
        parts.push({ text: excelText });
      } catch (e) {
        console.error(`Error processing Excel ${file.name}:`, e);
        warnings.push({
          fileName: file.name,
          error: 'Erro ao processar arquivo Excel',
          type: 'conversion',
          suggestion: 'Verifique se o arquivo não está corrompido.',
        });
        parts.push({
          text: `[Arquivo Excel: ${file.name}] - Não foi possível extrair conteúdo`,
        });
      }
    } else {
      try {
        const textContent = atob(file.content);
        parts.push({
          text: `[Arquivo: ${file.name}]\n${textContent}`,
        });
      } catch {
        parts.push({
          text: `[Arquivo: ${file.name}] - Conteúdo binário não legível`,
        });
      }
    }
  }
  
  parts.push({ text: prompt });
  
  const startTime = Date.now();
  
  const response = await fetch(`${supabaseUrl}/functions/v1/lovable-ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: 32000,
        temperature: 0.1,
      },
    }),
  });
  
  const responseTime = Date.now() - startTime;
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', errorText);
    throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  // Extract text from Gemini response format
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 
               result.text || 
               '';
  
  if (!text) {
    throw new Error('No text content in Lovable AI response');
  }
  
  return { text, warnings };
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

// =============================================================================
// DATA PERSISTENCE
// =============================================================================

async function saveExtractedData(
  itemId: number,
  filename: string,
  etapa: string,
  extractedFields: Record<string, any>,
  rawText?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;
    
    // Upsert extracted data
    const response = await fetch(
      `${supabaseUrl}/rest/v1/chb_extracted_data`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          item_id: itemId,
          filename,
          etapa,
          extracted_fields: extractedFields,
          raw_text: rawText,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    
    if (!response.ok) {
      console.error('[saveExtractedData] Error:', await response.text());
    }
  } catch (e) {
    console.error('[saveExtractedData] Failed:', e);
  }
}

async function getCachedExtractedData(itemId: number): Promise<Record<string, { fields: Record<string, any>; rawText?: string }>> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return {};
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/chb_extracted_data?item_id=eq.${itemId}&select=filename,extracted_fields,raw_text`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    const cache: Record<string, { fields: Record<string, any>; rawText?: string }> = {};
    
    for (const item of data) {
      cache[item.filename] = {
        fields: item.extracted_fields || {},
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
function parseExtractedFields(response: string, filename: string): Record<string, any> {
  const fields: Record<string, any> = {};
  
  // Try to extract common fields from the HTML response
  const fieldPatterns: Record<string, RegExp[]> = {
    peso_bruto: [/peso\s*bruto[:\s]*([0-9.,]+)\s*(kg)?/gi],
    peso_liquido: [/peso\s*l[íi]quido[:\s]*([0-9.,]+)\s*(kg)?/gi],
    valor_total: [/valor\s*total[:\s]*([A-Z]{3})?\s*([0-9.,]+)/gi],
    moeda: [/moeda[:\s]*([A-Z]{3})/gi, /(USD|EUR|BRL)/g],
    incoterm: [/incoterm[:\s]*([A-Z]{3})/gi, /(FOB|CIF|DDP|DAP|CFR|EXW|FCA)/g],
    quantidade: [/quantidade[:\s]*([0-9.,]+)/gi, /qty[:\s]*([0-9.,]+)/gi],
    ncm: [/ncm[:\s]*([0-9]{4,8})/gi],
    consignee: [/consignee[:\s]*([^\n<]+)/gi, /consignat[áa]rio[:\s]*([^\n<]+)/gi],
    shipper: [/shipper[:\s]*([^\n<]+)/gi, /exportador[:\s]*([^\n<]+)/gi],
    container: [/container[:\s]*([A-Z]{4}[0-9]{7})/gi],
    bl_number: [/bl\s*n[°o]?[:\s]*([^\n<]+)/gi, /b\/l[:\s]*([^\n<]+)/gi],
    hawb: [/hawb[:\s]*([^\n<]+)/gi],
    mawb: [/mawb[:\s]*([^\n<]+)/gi],
    invoice_number: [/invoice\s*n[°o]?[:\s]*([^\n<]+)/gi, /fatura[:\s]*([^\n<]+)/gi],
    data_emissao: [/data\s*emiss[ãa]o[:\s]*([0-9\/.-]+)/gi, /date[:\s]*([0-9\/.-]+)/gi],
    valor_frete: [/frete[:\s]*([A-Z]{3})?\s*([0-9.,]+)/gi, /freight[:\s]*([0-9.,]+)/gi],
  };
  
  for (const [field, patterns] of Object.entries(fieldPatterns)) {
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        fields[field] = match[1].trim();
        break;
      }
    }
  }
  
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
  cachedData?: Record<string, { fields: Record<string, any>; rawText?: string }>
): Promise<void> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[BG] Starting background analysis for request ${requestId}`);
    
    // Update status to processing
    await supabase.from('chb_analysis_requests').update({
      status: 'processing',
    }).eq('id', requestId);
    
    console.log(`[BG] Processing ${files.length} files for step ${stepId}`);
    
    // Get cached data from DB if itemId provided and no cachedData sent
    let existingCache: Record<string, { fields: Record<string, any>; rawText?: string }> = cachedData || {};
    if (itemId && !cachedData) {
      console.log(`[BG] Fetching cached data for item ${itemId}...`);
      existingCache = await getCachedExtractedData(itemId);
      console.log(`[BG] Found ${Object.keys(existingCache).length} cached documents`);
    }
    
    // Build cached context
    const cachedFiles: { name: string; fields: Record<string, any>; rawText?: string }[] = [];
    for (const file of files) {
      const cached = existingCache[file.name];
      if (cached && cached.rawText && Object.keys(cached.fields).length > 0) {
        cachedFiles.push({
          name: file.name,
          fields: cached.fields,
          rawText: cached.rawText,
        });
      }
    }
    
    let cachedContext = '';
    if (cachedFiles.length > 0) {
      cachedContext = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ DADOS DE REFERÊNCIA — EXTRAÍDOS NA ETAPA 1 (USAR PARA COMPARAÇÃO!)
═══════════════════════════════════════════════════════════════════════════════
`;
      for (const cached of cachedFiles) {
        cachedContext += `\n[${cached.name}] Campos extraídos:\n`;
        for (const [key, value] of Object.entries(cached.fields)) {
          cachedContext += `  • ${key}: ${value}\n`;
        }
      }
      cachedContext += `
═══════════════════════════════════════════════════════════════════════════════
`;
    }
    
    const fileNames = files.map((f: any) => f.name);
    const basePrompt = getPromptByStep(stepId, fileNames, clientConfig);
    const prompt = cachedContext ? cachedContext + '\n\n' + basePrompt : basePrompt;
    
    console.log(`[BG] Prompt length: ${prompt.length} chars`);
    
    let responseText: string;
    let usedFallback = false;
    let fileWarnings: ChbFileError[] = [];

    // Try Anthropic first
    try {
      console.log('[BG] Attempting Anthropic API...');
      const result = await callAnthropicAPI(prompt, files);
      responseText = result.text;
      fileWarnings = result.warnings;
      console.log('[BG] Anthropic API succeeded');
    } catch (anthropicError) {
      console.error('[BG] Anthropic API failed, trying Lovable AI (Gemini) fallback:', anthropicError);
      usedFallback = true;
      
      try {
        console.log('[BG] Attempting Lovable AI (Gemini) fallback...');
        const result = await callLovableAI(prompt, files);
        responseText = result.text;
        fileWarnings = result.warnings;
        console.log('[BG] Lovable AI succeeded');
      } catch (geminiError) {
        console.error('[BG] Lovable AI also failed:', geminiError);
        
        // Update request with error
        await supabase.from('chb_analysis_requests').update({
          status: 'error',
          error_message: `Falha na análise: ${geminiError instanceof Error ? geminiError.message : 'Erro desconhecido'}`,
          completed_at: new Date().toISOString(),
        }).eq('id', requestId);
        
        return;
      }
    }

    const { html, tags, summary, detailedSummary, parecer, modal, cliente } = extractHtmlAndTags(responseText, stepId);

    console.log(`[BG] Analysis completed - ${tags.map(t => t.label).join(', ')}`);

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
    };

    // Update request with result
    await supabase.from('chb_analysis_requests').update({
      status: 'completed',
      result_html: JSON.stringify(resultData),
      completed_at: new Date().toISOString(),
    }).eq('id', requestId);

    console.log(`[BG] Request ${requestId} completed successfully`);

    // Save extracted data to cache for future steps (fire and forget)
    if (itemId) {
      try {
        console.log(`[BG Cache] Saving extracted data for ${files.length} files...`);
        for (const file of files) {
          const extractedFields = parseExtractedFields(responseText, file.name);
          
          let rawText = '';
          if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || 
              file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            try {
              rawText = await extractExcelText(file.content, file.name);
            } catch (e) {
              console.error(`[BG Cache] Error extracting excel text for ${file.name}:`, e);
            }
          }
          
          await saveExtractedData(itemId, file.name, stepId.toString(), extractedFields, rawText);
        }
        console.log(`[BG Cache] Saved extracted data for item ${itemId}`);
      } catch (e) {
        console.error('[BG Cache] Error saving extracted data:', e);
      }
    }

  } catch (error) {
    console.error(`[BG] Error processing analysis ${requestId}:`, error);
    
    // Update request with error
    await supabase.from('chb_analysis_requests').update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Erro desconhecido',
      completed_at: new Date().toISOString(),
    }).eq('id', requestId);
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
    // MODE: POLL - Check status of existing request
    // =========================================================================
    if (body.requestId) {
      const { requestId } = body;
      console.log(`[POLL] Checking status for request ${requestId}`);
      
      const { data, error } = await supabase
        .from('chb_analysis_requests')
        .select('status, result_html, error_message')
        .eq('id', requestId)
        .single();
      
      if (error || !data) {
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
          error: data.error_message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // =========================================================================
    // MODE: SUBMIT - Start new analysis (async)
    // =========================================================================
    const { stepId, files, clientConfig, itemId, cachedData } = body;

    if (!stepId || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'stepId e files são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`═══ CHB ANALYSIS (ASYNC) ═══`);
    console.log(`[SUBMIT] Total files: ${files.length}`);
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

    // Create analysis request in database
    const { data: requestData, error: insertError } = await supabase
      .from('chb_analysis_requests')
      .insert({
        item_id: itemId || 0,
        step_id: stepId,
        status: 'pending',
        request_payload: { 
          filesCount: files.length, 
          fileNames: files.map((f: any) => f.name),
          hasClientConfig: !!clientConfig,
        },
      })
      .select()
      .single();

    if (insertError || !requestData) {
      console.error('[SUBMIT] Error creating request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar requisição de análise' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestId = requestData.id;
    console.log(`[SUBMIT] Created request ${requestId}`);

    // Start background processing
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      processAnalysisInBackground(requestId, stepId, files, clientConfig, itemId, cachedData)
    ) || processAnalysisInBackground(requestId, stepId, files, clientConfig, itemId, cachedData);

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
