import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

3) TOLERÂNCIA NUMÉRICA — CONFIGURAÇÃO DO CLIENTE:
   - TOLERÂNCIA DE PESO: ${toleranciaPeso}% (divergências acima disso = 🔴)
   - TOLERÂNCIA DE VALOR: ${toleranciaValor}% (divergências acima disso = 🔴)
   - Valores como 97,3 e 97,30 são EQUIVALENTES (✅)
   - 10.841,00 e 10841 e 10.841 são EQUIVALENTES (✅)
   - Ignore zeros à direita e diferenças de formatação

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
   
   MOEDA: sempre especificar (USD, EUR, BRL, etc.)
   NUNCA inventar valores que não existam no documento
   Se documento não tem valor → "ND" (não "0" ou valor inventado)
   
   TOLERÂNCIA DE VALOR (configurada pelo cliente): ${toleranciaValor}%
   - Divergência > ${toleranciaValor}% → 🔴 CRÍTICO
   - Divergência > 20% → 🔴 OBRIGATÓRIO (independente da tolerância)
   - Valores de ordens de magnitude diferentes → 🔴 CRÍTICO (verificar extração!)

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
${clientConfig?.instrucoes_personalizadas ? `

14) INSTRUÇÕES ESPECÍFICAS DO CLIENTE:
${clientConfig.instrucoes_personalizadas}
` : ''}`;
}

const EXTRACTION_INSTRUCTIONS = `
═══════════════════════════════════════════════════════════════════════════════
REGRAS DE EXTRAÇÃO — LEIA COM ATENÇÃO MÁXIMA
═══════════════════════════════════════════════════════════════════════════════

⚠️ REGRA #1: CADA ARQUIVO = UMA COLUNA NA TABELA
- Se recebe 7 arquivos, a tabela tem 7 colunas de dados
- Use o NOME EXATO de cada arquivo como cabeçalho

⚠️ REGRA #2: LEIA TODO O DOCUMENTO
- Totais ficam no RODAPÉ/FINAL da tabela
- Procure em TODAS as páginas

⚠️ REGRA #3: EXTRAIA DO DOCUMENTO CERTO
| Campo            | Documento Fonte                      |
|------------------|--------------------------------------|
| Valor Mercadoria | INVOICE (soma dos itens no rodapé)   |
| Peso Bruto/Líq   | PACKING LIST                         |
| Frete            | HAWB, AWB, BL, HBL                   |
| Incoterm         | INVOICE ou documento de transporte   |

⚠️ REGRA #4: VALOR MERCADORIA ≠ FRETE
- VALOR MERCADORIA = total da Invoice (produtos vendidos)
- FRETE = custo do transporte (campo "Freight" no AWB/BL)
- São LINHAS SEPARADAS na tabela!

⚠️ REGRA #5: QUANDO USAR "ND"
- SOMENTE quando o dado NÃO EXISTE naquele documento
- Invoice não tem peso? → ND na coluna da Invoice (normal!)
- Packing List não tem frete? → ND (normal!)
- Se dado EXISTE mas está difícil de ler → Extraia assim mesmo!

⚠️ REGRA #6: STATUS — CRITÉRIOS ESTRITOS PARA "CONFORME" (✅)

CONFORME (✅) SOMENTE quando:
- Valores são EXATAMENTE iguais (ex.: "USD 1.500,00" = "USD 1.500,00")
- OU valores são numericamente equivalentes (ex.: "10.841" = "10.841,00" = "10841")
- OU dado existe em apenas UM documento (ND + Valor = ✅)
- OU diferença está DENTRO da tolerância configurada pelo cliente

🔴 NÃO É CONFORME quando:
- Existem 2 ou mais valores DIFERENTES para o mesmo campo
- Datas diferentes (ex.: 08/12/2025 vs 05/12/2025 vs 12/05/2025 = 🔴)
- Valores com diferença acima da tolerância
- Formatos de data invertidos que resultam em datas diferentes

⚠️ REGRA DE DATA CRÍTICA:
- Se um campo de data mostra valores diferentes entre documentos = 🔴 DIVERGENTE
- Exemplo: 08/12/2025 (Invoice) vs 05/12/2025 (Packing) = 🔴 NÃO É CONFORME
- Mesmo se apenas DIA diferir, é divergência
- Verificar se não é inversão DD/MM vs MM/DD (ambos são divergentes!)

⚠️ REGRA #7: SEMPRE INCLUA MOEDA
- Exemplo: "EUR 28.234,23" não apenas "28.234,23"

═══════════════════════════════════════════════════════════════════════════════
SINÔNIMOS PARA BUSCAR (PROCURE TODAS AS VARIAÇÕES!)
═══════════════════════════════════════════════════════════════════════════════

PESO BRUTO: 
  Gross Weight, G.W., GW, Total Weight, Bruto, Total Bruto, Peso Total,
  Weight, Wgt, Total Wt, Chargeable Weight (se único peso disponível)

PESO LÍQUIDO: 
  Net Weight, N.W., NW, Líquido, Net, Nett Weight, Product Weight

QUANTIDADE:
  Quantity, Qty, QTY, Pcs, Pieces, Units, UN, Packages, Pkgs, Cartons, CTN,
  No. of Packages, Number of Packages, Volume (un.)

FRETE:
  Freight, Ocean Freight, Air Freight, Freight Charges, Sea Freight,
  Prepaid Amount, Collect Amount, Charges, Transportation

VALOR MERCADORIA:
  Total Items, Merchandise Total, Subtotal, Total Goods, Invoice Total,
  Total Value, Valor Total Mercadoria, Commercial Value, FOB Value,
  Net Amount, Valor da Mercadoria

VALOR TOTAL FRETE (na tabela Prepaid/Collect):
  Total (coluna Prepaid), Total (coluna Collect), Total Prepaid,
  Total Collect, Total Charges, Freight Total, Grand Total (em BL/CCT)

INCOTERM:
  Delivery Terms, Trade Terms, Terms of Delivery, Shipment Terms,
  Freight Terms, Condition of Sale

DATA EMISSÃO:
  Issue Date, Date of Issue, Issued, Dated, Invoice Date, Date,
  B/L Date, AWB Date, Document Date, Creation Date

CONSIGNATÁRIO:
  Consignee, CNPJ, Destinatário, Notify Party, Ship To, Deliver To,
  Importer, Buyer, Comprador

NCM:
  HS Code, HTS, Tariff Code, Commodity Code, Classification,
  NCM/SH, Código NCM

CONTAINERS:
  Container No., Container Number, CNTR No., Equipment,
  Container ID, Seal No., Lacre, Container/Seal

═══════════════════════════════════════════════════════════════════════════════
ESTRUTURA TÍPICA DE CADA DOCUMENTO (onde encontrar cada valor)
═══════════════════════════════════════════════════════════════════════════════

INVOICE COMERCIAL:
├── Cabeçalho: Shipper, Consignee, Invoice Number, Date
├── Tabela de Itens: Description, Quantity, Unit Price, Amount
├── Rodapé: Incoterm, Total Items, Currency
└── ATENÇÃO: "Total" ou "Total Items" aqui é VALOR MERCADORIA!

PACKING LIST:
├── Cabeçalho: Shipper, Consignee, Reference
├── Tabela: Description, Quantity, Net Weight, Gross Weight
├── Totais: Total Packages, Total Net Weight, Total Gross Weight
└── ATENÇÃO: Peso BRUTO e LÍQUIDO devem vir DAQUI!

CCT / BL (Conhecimento de Transporte):
├── Cabeçalho: Shipper, Consignee, Notify, Port of Loading/Discharge
├── Descrição da Carga: Container, Description, Weight, Volume
├── TABELA PREPAID/COLLECT:
│   ├── Ocean Freight / Air Freight
│   ├── BAF, CAF, THC, etc.
│   ├── Impostos
│   └── TOTAL ← Este é o VALOR TOTAL FRETE!
└── ATENÇÃO: O "Total" na coluna Prepaid/Collect é FRETE, não mercadoria!

AWB (Air Waybill):
├── Shipper, Consignee, Carrier
├── Weight, Dimensions, Chargeable Weight
├── Freight: Prepaid / Collect
└── Total Charges
`;


function getPromptByStep(stepId: number, fileNames: string[], clientConfig?: ClientConfig): string {
  const fileListText = fileNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  const columnHeaders = fileNames.join(' | ');
  const tableSpec = buildTableSpec(clientConfig);
  
  // Add client context if available
  const clientContext = clientConfig?.cliente_nome 
    ? `\nCLIENTE IDENTIFICADO: ${clientConfig.cliente_nome}\nAplicando regras de validação personalizadas para este cliente.\n`
    : '';

  if (stepId === 1) {
    return `
SISTEMA — CRONOS v4.0 (Auditor de Importação)
${clientContext}

Você é o CRONOS, auditor especialista em comércio exterior brasileiro.
Sua missão: EXTRAIR e COMPARAR dados dos documentos recebidos.

═══════════════════════════════════════════════════════════════════════════════
ARQUIVOS RECEBIDOS (${fileNames.length} documentos):
═══════════════════════════════════════════════════════════════════════════════
${fileListText}

IDENTIFICAÇÃO DE TIPOS:
- inv_XX.pdf ou Invoice = INVOICE COMERCIAL → extrair VALOR DA MERCADORIA
- pack_XX.pdf ou Packing = PACKING LIST → extrair PESOS
- HAWB.pdf ou AWB = CONHECIMENTO AÉREO → extrair FRETE AÉREO
- BL ou HBL = CONHECIMENTO MARÍTIMO → extrair FRETE MARÍTIMO
- cct.pdf = COMPROVANTE CCT
- relatorio_di = DRAFT DI
- SEGURO ou Certificado = APÓLICE DE SEGURO

═══════════════════════════════════════════════════════════════════════════════
CAMPOS OBRIGATÓRIOS NA TABELA (cada um em sua linha):
═══════════════════════════════════════════════════════════════════════════════
1. Consignee/CNPJ
2. Incoterm (FOB, CFR, CIF, etc.)
3. Peso Bruto (kg) - do PACKING LIST
4. Peso Líquido (kg) - do PACKING LIST
5. Valor Mercadoria (COM MOEDA!) - da INVOICE, procure "Total Items" (ex: EUR 28.234,23)
6. Frete (COM MOEDA!) - do AWB/BL, linha Ocean/Air Freight (ex: USD 1.500,00)
7. Valor Total Frete (COM MOEDA!) - do CCT/BL, linha "Total" na coluna Prepaid ou Collect
8. NCM Principal
9. Nº Conhecimento (AWB ou BL)
10. Data Emissão (de cada documento)

⚠️ ATENÇÃO — TRÊS VALORES DIFERENTES:
- Valor Mercadoria = soma dos produtos na Invoice ("Total Items")
- Frete = custo do transporte (linha "Ocean Freight" ou "Air Freight")
- Valor Total Frete = total na coluna Prepaid/Collect (inclui frete + taxas)

═══════════════════════════════════════════════════════════════════════════════
ESTRUTURA DA TABELA DE SAÍDA:
═══════════════════════════════════════════════════════════════════════════════
<table>
<thead><tr>
  <th>Status</th>
  <th>Campo</th>
  <th>${columnHeaders.split(' | ').map(h => `</th>\n  <th>${h}`).join('').slice(5)}</th>
</tr></thead>
<tbody>
  <tr><td>✅/🟨/🔴</td><td>Campo</td><td>Valor do doc 1</td>...</tr>
</tbody>
</table>

REGRAS DE STATUS:
- ✅ = Valores iguais OU dado existe em apenas um documento
- 🟨 = Divergência pequena (< tolerância configurada)
- 🔴 = Divergência significativa entre documentos

REGRA CRÍTICA: "ND" em um documento + valor em outro = ✅ (não é divergência!)

${EXTRACTION_INSTRUCTIONS}
${CHB_FORMAT_HTML}
${tableSpec}
`;
  }

  if (stepId === 2) {
    return `
SISTEMA — CRONOS (Etapa 2: Pré-Alerta × Instrução)

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: comparar Pré-Alerta (referência) com Instrução de Despacho.
${clientContext}
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
${tableSpec}
`;
  }

  // stepId === 3
  return `
SISTEMA — CRONOS (Etapa 3: DI × (Pré-Alerta + Instrução))

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: confrontar Rascunho DI com a Consolidação (PA+Instr.).
Esta é a VALIDAÇÃO FINAL antes do registro da Declaração de Importação.
${clientContext}
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
${tableSpec}
`;
}

// Error types for structured error responses
interface ChbFileError {
  type: 'file_read' | 'file_format' | 'api_error' | 'network' | 'timeout' | 'unknown';
  message: string;
  documentName?: string;
  details?: string;
  suggestion?: string;
}

function createFileError(file: { name: string; mimeType: string }, errorType: string, details?: string): ChbFileError {
  const supportedFormats = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  
  if (errorType === 'unsupported_format') {
    return {
      type: 'file_format',
      message: `Formato não suportado: ${file.mimeType}`,
      documentName: file.name,
      details: `O arquivo "${file.name}" está em formato ${file.mimeType} que não é totalmente suportado.`,
      suggestion: 'Converta o arquivo para PDF ou imagem (PNG, JPG) para melhor análise.'
    };
  }
  
  if (errorType === 'empty_content') {
    return {
      type: 'file_read',
      message: 'Arquivo vazio ou sem conteúdo legível',
      documentName: file.name,
      details: `Não foi possível extrair texto do arquivo "${file.name}".`,
      suggestion: 'Verifique se o arquivo não está corrompido. Para PDFs escaneados, certifique-se de que há texto OCR incorporado.'
    };
  }
  
  if (errorType === 'binary_not_readable') {
    return {
      type: 'file_read',
      message: 'Conteúdo binário não legível',
      documentName: file.name,
      details: `O arquivo "${file.name}" contém dados binários que não podem ser interpretados diretamente.`,
      suggestion: 'Para planilhas Excel, exporte para PDF ou CSV. Para outros formatos, converta para PDF.'
    };
  }
  
  return {
    type: 'unknown',
    message: details || 'Erro ao processar arquivo',
    documentName: file.name,
    suggestion: 'Tente enviar o arquivo novamente ou use um formato diferente.'
  };
}

async function callAnthropicAPI(prompt: string, filesContent: { name: string; content: string; mimeType: string }[]): Promise<{ text: string; warnings: ChbFileError[] }> {
  const apiKey = Deno.env.get('CHB_ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('CHB_ANTHROPIC_API_KEY not configured');
  }

  const content: any[] = [];
  const warnings: ChbFileError[] = [];
  
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
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Excel files - extract text content using the Excel reader
      try {
        const excelText = await extractExcelText(file.content, file.name);
        if (excelText && excelText.length > 100) {
          console.log(`[CHB] Excel "${file.name}" extracted ${excelText.length} chars`);
          content.push({
            type: 'text',
            text: excelText,
          });
        } else {
          warnings.push(createFileError(file, 'empty_content'));
          content.push({
            type: 'text',
            text: `[Arquivo: ${file.name}] - Planilha Excel com pouco conteúdo legível.`,
          });
        }
      } catch (xlsxError) {
        console.error(`[CHB] Error reading Excel ${file.name}:`, xlsxError);
        warnings.push(createFileError(file, 'binary_not_readable'));
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Erro ao ler planilha Excel.`,
        });
      }
    } else {
      // For other types, try to send as text
      try {
        const decoded = atob(file.content);
        if (decoded.trim().length === 0) {
          warnings.push(createFileError(file, 'empty_content'));
        }
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}]\n${decoded}`,
        });
      } catch {
        warnings.push(createFileError(file, 'binary_not_readable'));
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
  console.log(`Prompt length: ${prompt.length} chars`);

  const startTime = Date.now();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 32000,
      temperature: 0, // Maximum determinism for data extraction
      messages: [
        {
          role: 'user',
          content: content,
        },
      ],
    }),
  });
  const elapsed = Date.now() - startTime;

  // Log the API call
  logApiCall({
    api_name: 'Anthropic',
    endpoint: '/v1/messages',
    method: 'POST',
    status_code: response.status,
    response_time_ms: elapsed,
    error_message: response.ok ? undefined : `Status ${response.status}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', response.status, errorText);
    
    if (response.status === 400 && errorText.includes('document')) {
      throw new Error(`Erro ao processar documento: O serviço não conseguiu interpretar um ou mais arquivos. Verifique se os PDFs não estão protegidos.`);
    } else if (response.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde alguns minutos e tente novamente.');
    } else if (response.status === 401) {
      throw new Error('Erro de autenticação com o serviço de IA. Entre em contato com o suporte.');
    }
    
    throw new Error(`Erro na API de análise (código ${response.status})`);
  }

  const data = await response.json();
  return { text: data.content[0].text, warnings };
}

async function callLovableAI(prompt: string, filesContent: { name: string; content: string; mimeType: string }[]): Promise<{ text: string; warnings: ChbFileError[] }> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const content: any[] = [];
  const warnings: ChbFileError[] = [];

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
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.mimeType};base64,${file.content}`,
        },
      });
    } else if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Excel files - extract text content
      try {
        const excelText = await extractExcelText(file.content, file.name);
        if (excelText && excelText.length > 100) {
          console.log(`[CHB-Gemini] Excel "${file.name}" extracted ${excelText.length} chars`);
          content.push({
            type: 'text',
            text: excelText,
          });
        } else {
          warnings.push(createFileError(file, 'empty_content'));
          content.push({
            type: 'text',
            text: `[Arquivo: ${file.name}] - Planilha Excel com pouco conteúdo legível.`,
          });
        }
      } catch (xlsxError) {
        console.error(`[CHB-Gemini] Error reading Excel ${file.name}:`, xlsxError);
        warnings.push(createFileError(file, 'binary_not_readable'));
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Erro ao ler planilha Excel.`,
        });
      }
    } else {
      try {
        const decoded = atob(file.content);
        if (decoded.trim().length === 0) {
          warnings.push(createFileError(file, 'empty_content'));
        }
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}]\n${decoded}`,
        });
      } catch {
        warnings.push(createFileError(file, 'binary_not_readable'));
        content.push({
          type: 'text',
          text: `[Arquivo: ${file.name}] - Conteúdo binário não legível como texto`,
        });
      }
    }
  }

  content.push({
    type: 'text',
    text: prompt,
  });

  console.log(`Calling Lovable AI (Gemini) with ${filesContent.length} files...`);

  const startTime = Date.now();
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
      max_tokens: 32000,
    }),
  });
  const elapsed = Date.now() - startTime;

  // Log the API call
  logApiCall({
    api_name: 'LovableAI',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    status_code: response.status,
    response_time_ms: elapsed,
    error_message: response.ok ? undefined : `Status ${response.status}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde alguns minutos e tente novamente.');
    }
    if (response.status === 402) {
      throw new Error('Créditos de IA esgotados. Entre em contato com o administrador.');
    }
    
    throw new Error(`Erro no serviço de IA (código ${response.status})`);
  }

  const data = await response.json();
  return { text: data.choices[0].message.content, warnings };
}

function extractHtmlAndTags(response: string, stepId: number): { 
  html: string; 
  tags: { label: string; variant: 'success' | 'warning' | 'error' }[]; 
  summary: string;
  detailedSummary: string;
  parecer: string;
  modal: 'SEA' | 'AIR' | null;
  cliente: string | null;
} {
  // Extract metadata
  const metadataMatch = response.match(/<<METADATA>>([\s\S]*?)<<END_METADATA>>/);
  let modal: 'SEA' | 'AIR' | null = null;
  let cliente: string | null = null;
  
  if (metadataMatch) {
    const modalMatch = metadataMatch[1].match(/MODAL:\s*(SEA|AIR)/i);
    if (modalMatch) modal = modalMatch[1].toUpperCase() as 'SEA' | 'AIR';
    
    const clienteMatch = metadataMatch[1].match(/CLIENTE:\s*([^\n]+)/i);
    if (clienteMatch) cliente = clienteMatch[1].trim();
  }
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

  return { html, tags, summary, detailedSummary, parecer, modal, cliente };
}

/**
 * Estimate token count from text (approximately 4 chars per token for Portuguese)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate input size before sending to LLM
 */
function validateInputSize(
  files: { name: string; content: string; mimeType: string }[],
  maxInputTokens: number = 200000
): { isValid: boolean; estimatedTokens: number; warning?: string } {
  let totalEstimate = 0;
  
  for (const file of files) {
    if (file.mimeType === 'application/pdf') {
      // PDF: estimate ~1500 tokens per 50KB of base64
      const sizeKB = (file.content.length * 0.75) / 1024; // base64 to actual bytes
      totalEstimate += Math.ceil((sizeKB / 50) * 1500);
    } else if (file.mimeType.includes('image/')) {
      // Images: estimate ~500 tokens per image
      totalEstimate += 500;
    } else {
      // Text content
      try {
        const decoded = atob(file.content);
        totalEstimate += estimateTokenCount(decoded);
      } catch {
        totalEstimate += estimateTokenCount(file.content);
      }
    }
  }
  
  const isValid = totalEstimate <= maxInputTokens;
  
  return {
    isValid,
    estimatedTokens: totalEstimate,
    warning: !isValid 
      ? `⚠️ Input estimado (${totalEstimate} tokens) excede limite recomendado (${maxInputTokens}). Considere reduzir número de arquivos.`
      : undefined
  };
}

// Helper to save extracted data to database
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
    
    // Upsert to avoid duplicates
    await fetch(`${supabaseUrl}/rest/v1/chb_extracted_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        item_id: itemId,
        filename,
        etapa,
        extracted_fields: extractedFields,
        raw_text: rawText?.substring(0, 50000), // Limit raw text size
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('[saveExtractedData] Failed to save:', e);
  }
}

// Helper to get cached extracted data
async function getCachedExtractedData(
  itemId: number
): Promise<Record<string, { fields: Record<string, any>; rawText?: string }>> {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stepId, files, clientConfig, itemId, cachedData } = await req.json();

    if (!stepId || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'stepId e files são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`═══ CHB ANALYSIS ═══`);
    console.log(`[Input Size] Total files: ${files.length}`);
    console.log(`[Input Size] Files: ${files.map((f: any) => `${f.name} (${f.mimeType})`).join(', ')}`);
    
    // Get cached data from DB if itemId provided and no cachedData sent
    let existingCache: Record<string, { fields: Record<string, any>; rawText?: string }> = cachedData || {};
    if (itemId && !cachedData) {
      console.log(`[Cache] Fetching cached data for item ${itemId}...`);
      existingCache = await getCachedExtractedData(itemId);
      console.log(`[Cache] Found ${Object.keys(existingCache).length} cached documents`);
    }
    
    // Separate files into: needs processing vs already cached
    const filesToProcess: typeof files = [];
    const cachedFiles: { name: string; fields: Record<string, any>; rawText?: string }[] = [];
    
    for (const file of files) {
      const cached = existingCache[file.name];
      if (cached && cached.rawText && Object.keys(cached.fields).length > 0) {
        console.log(`[Cache] Using cached data for: ${file.name}`);
        cachedFiles.push({
          name: file.name,
          fields: cached.fields,
          rawText: cached.rawText,
        });
      } else {
        filesToProcess.push(file);
      }
    }
    
    console.log(`[Cache] ${cachedFiles.length} files from cache, ${filesToProcess.length} to process`);
    
    // If all files are cached and we have analysis from previous step, we can optimize
    // For now, we still need to send all files for comparison but can use extracted text
    
    // Validate input size
    const inputValidation = validateInputSize(files);
    console.log(`[Input Size] Estimated input tokens: ${inputValidation.estimatedTokens}`);
    console.log(`[Input Size] Max output tokens: 32000`);
    
    if (!inputValidation.isValid) {
      console.warn(`[Input Size] ${inputValidation.warning}`);
    }
    
    if (clientConfig) {
      console.log('Using client config:', JSON.stringify(clientConfig));
    }

    const fileNames = files.map((f: any) => f.name);
    
    // Build enhanced prompt with cached data context
    let cachedContext = '';
    if (cachedFiles.length > 0) {
      cachedContext = '\n\n=== DADOS JÁ EXTRAÍDOS (etapas anteriores) ===\n';
      for (const cached of cachedFiles) {
        cachedContext += `\n[${cached.name}] Campos extraídos:\n`;
        for (const [key, value] of Object.entries(cached.fields)) {
          cachedContext += `  - ${key}: ${value}\n`;
        }
      }
      cachedContext += '\n=== USE ESTES DADOS COMO REFERÊNCIA ===\n';
    }
    
    const basePrompt = getPromptByStep(stepId, fileNames, clientConfig as ClientConfig | undefined);
    const prompt = cachedContext ? cachedContext + '\n\n' + basePrompt : basePrompt;
    
    console.log(`Prompt length: ${prompt.length} chars`);
    
    let responseText: string;
    let usedFallback = false;
    let fileWarnings: ChbFileError[] = [];

    // Try Anthropic first
    try {
      console.log('Attempting Anthropic API...');
      const result = await callAnthropicAPI(prompt, files);
      responseText = result.text;
      fileWarnings = result.warnings;
      console.log('Anthropic API succeeded');
    } catch (anthropicError) {
      console.error('Anthropic API failed, trying Lovable AI (Gemini) fallback:', anthropicError);
      usedFallback = true;
      
      try {
        console.log('Attempting Lovable AI (Gemini) fallback...');
        const result = await callLovableAI(prompt, files);
        responseText = result.text;
        fileWarnings = result.warnings;
        console.log('Lovable AI succeeded');
      } catch (geminiError) {
        console.error('Lovable AI also failed:', geminiError);
        
        // Return structured error
        const errorMessage = geminiError instanceof Error ? geminiError.message : 'Erro desconhecido';
        return new Response(
          JSON.stringify({
            error: 'Falha na análise dos documentos',
            errors: [{
              type: 'api_error',
              message: 'Não foi possível processar os documentos',
              details: `Os serviços de análise (Anthropic e Gemini) falharam: ${errorMessage}`,
              suggestion: 'Verifique a qualidade dos arquivos (PDFs digitais funcionam melhor que scans). Tente novamente em alguns minutos.'
            }]
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { html, tags, summary, detailedSummary, parecer, modal, cliente } = extractHtmlAndTags(responseText, stepId);

    // Save extracted data to cache for future steps (fire and forget)
    if (itemId) {
      (async () => {
        try {
          console.log(`[Cache] Saving extracted data for ${files.length} files...`);
          for (const file of files) {
            const extractedFields = parseExtractedFields(responseText, file.name);
            
            // Get raw text for this file from the response context
            let rawText = '';
            if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || 
                file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
              try {
                rawText = await extractExcelText(file.content, file.name);
              } catch (e) {
                console.error(`[Cache] Error extracting excel text for ${file.name}:`, e);
              }
            }
            
            await saveExtractedData(itemId, file.name, stepId.toString(), extractedFields, rawText);
          }
          console.log(`[Cache] Saved extracted data for item ${itemId}`);
        } catch (e) {
          console.error('[Cache] Error saving extracted data:', e);
        }
      })();
    }

    return new Response(
      JSON.stringify({
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
