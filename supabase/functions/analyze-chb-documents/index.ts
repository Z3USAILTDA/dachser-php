import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
   - Datas: DD/MM/AAAA ou AAAA-MM-DD
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
   - FRETE: linha própria (valor e moeda)
   - NUNCA unificar em uma única linha de validação
   - Incoterms diferentes (ex.: CFR × FOB) → 🔴
   - Incoterm coerente mas rótulo faltante → 🟨

7) VALORES — REGRAS CRÍTICAS:
   - VALOR TOTAL: uma linha com valor total por documento
   - MOEDA: sempre especificar (USD, EUR, BRL, etc.)
   - NUNCA inventar valores que não existam no documento
   - NUNCA duplicar valores entre documentos diferentes
   - Se documento não tem valor → "ND" (não "0" ou valor inventado)
   - Divergência de valor > ${toleranciaValor}% → 🔴

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
INSTRUÇÕES DE EXTRAÇÃO AVANÇADA — VERSÃO ULTRA-RIGOROSA

Você é um auditor SÊNIOR especialista em documentos de comércio exterior.
SUA MISSÃO: Extrair TODOS os dados possíveis. "ND" é FRACASSO.

╔═══════════════════════════════════════════════════════════════════════════════╗
║  REGRA DE OURO: CADA "ND" DESNECESSÁRIO É UMA FALHA CRÍTICA DO AUDITOR       ║
║  Sua taxa de ND deve ser < 5%. Acima disso = análise rejeitada.              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
EXEMPLOS REAIS DE DOCUMENTOS — REFERÊNCIA OBRIGATÓRIA
═══════════════════════════════════════════════════════════════════════════════

EXEMPLO 1 — INVOICE (UWT do Brasil):
Estrutura típica de Invoice alemã (UWT GmbH):
- Cabeçalho: "Invoice" + número (ex: 0100000249), data no formato DD.MM.YYYY
- Shipper: UWT GmbH, endereço na Alemanha (Betzigau)
- Consignee/Importador: UWT do Brasil Instrumentos de Medição Ltda.
- Incoterm: no campo "Delivery terms" (ex: "FCA Betzigau")
- Carrier/Transportadora: no campo próximo a "forwarded by" (ex: Dachser)
- Tabela de itens com colunas: Pos, Part No, Description, Quantity, Unit Price, Total
- NCM: pode estar como "HS Code" ou na descrição do item (ex: 9026.10.29)
- Valor total: na última linha da tabela, geralmente em EUR
- Peso: pode estar em "Net Weight" / "Gross Weight" no rodapé ou por item

EXTRAIR DA INVOICE:
- Invoice number: campo "Invoice" ou "Rechnung" no cabeçalho
- Date: campo "Date" no cabeçalho (converter DD.MM.YYYY → DD/MM/YYYY)
- Consignee: nome completo após "Consignee:" ou "Ship to:"
- Incoterm: campo "Delivery terms", "Terms", "Incoterms"
- Carrier: campo "forwarded by", "Carrier", "Via"
- Items: TODAS as linhas da tabela (Part No, Description, Qty, Price, Total)
- NCM/HS Code: buscar em cada linha de item ou no rodapé
- Total Value: última linha, campo "Total" ou "Grand Total" + moeda
- Currency: EUR, USD, etc. (sempre especificar)

EXEMPLO 2 — PACKING LIST:
Estrutura típica:
- Referência à Invoice correspondente
- Lista de volumes/caixas com dimensões
- Peso bruto e líquido POR CAIXA e TOTAL
- Quantidades por item
- Descrição simplificada dos produtos

EXTRAIR DO PACKING LIST:
- Gross Weight: campo "Gross Weight", "Brutto", somar se por caixa
- Net Weight: campo "Net Weight", "Netto", somar se por caixa  
- Dimensions: L x W x H em cm ou m
- Packages: número de volumes
- Quantities: validar contra Invoice

EXEMPLO 3 — INSTRUÇÃO DE EMBARQUE (Excel):
Estrutura típica de instrução Dachser:
- Aba ou seção com dados do importador (CNPJ, razão social)
- NCMs com descrições detalhadas
- Quantidades, pesos, valores
- Referências de PO/pedido
- Dados fiscais (CFOP, CST, etc.)

EXTRAIR DA INSTRUÇÃO:
- Todos os NCMs listados (fonte primária de NCMs!)
- CNPJ do importador
- Valores declarados (comparar com Invoice)
- Pesos declarados (comparar com Packing List)
- Referências de pedido/PO

═══════════════════════════════════════════════════════════════════════════════
CHECKLIST OBRIGATÓRIO ANTES DE COLOCAR "ND"
═══════════════════════════════════════════════════════════════════════════════

□ Verifiquei TODAS as páginas do PDF? (p.1, p.2, p.3... até última)
□ Verifiquei cabeçalho, rodapé, margens, marcas d'água?
□ Verifiquei tabelas secundárias, anexos, notas de rodapé?
□ Busquei TODOS os sinônimos do campo em PT, EN, ES, ZH?
□ Apliquei OCR em áreas de baixo contraste?
□ Tentei CALCULAR o valor a partir de outros dados?
□ Tentei INFERIR de outro documento do conjunto?
□ O dado é REALMENTE impossível de obter?

SE NÃO MARCOU TODOS → NÃO USE "ND"

═══════════════════════════════════════════════════════════════════════════════
DICIONÁRIO DE SINÔNIMOS — BUSCAR TODOS
═══════════════════════════════════════════════════════════════════════════════

PESO BRUTO (buscar EM ORDEM):
"GROSS WEIGHT", "GW", "G.W.", "GROSS WT", "GROSS WGT", "G/W", 
"PESO BRUTO", "BRUTO", "TOTAL WEIGHT", "BRUTTO", "WEIGHT", "WT.",
"GROSS", "毛重", "PESO TOTAL", "WEIGHT TOTAL", "TOTAL WT"

PESO LÍQUIDO (buscar EM ORDEM):
"NET WEIGHT", "NW", "N.W.", "NET WT", "NET WGT", "N/W",
"PESO LÍQUIDO", "LÍQUIDO", "PESO NETO", "NETO", "WEIGHT NET",
"净重", "NET", "PESO SEM EMBALAGEM"

VOLUME/CBM (buscar EM ORDEM):
"CBM", "M³", "M3", "CUBIC METERS", "CUBIC METRES", "MEASUREMENT",
"VOLUME", "CUBAGE", "CBMT", "MEAS.", "CU.M", "CUBIC METER",
"METRO CÚBICO", "METRAGEM", "立方米", "VOL", "MEDIDA"

VALOR TOTAL (buscar EM ORDEM):
"TOTAL VALUE", "INVOICE AMOUNT", "AMOUNT", "TOTAL AMOUNT",
"VALOR TOTAL", "TOTAL", "INVOICE VALUE", "FOB VALUE", "CIF VALUE",
"VALUE", "AMT", "IMPORTE", "GRAND TOTAL", "TOTAL USD", "TOTAL EUR",
"INVOICE TOTAL", "金额", "MONTANTE", "VALOR", "SUBTOTAL"

NCM/HS CODE (buscar EM ORDEM):
"HS CODE", "NCM", "TARIFF", "NCM/SH", "HARMONIZED CODE", "HTS",
"H.S. CODE", "H.S.", "CÓDIGO NCM", "TARIFF CODE", "COMMODITY CODE",
"HS", "HTS CODE", "海关编码", "CLASSIFICAÇÃO FISCAL", "CÓDIGO ADUANEIRO"

CONTAINER (buscar EM ORDEM):
"CONTAINER NO", "CONTAINER NUMBER", "CNTR", "CNTR NO", "CTR NO",
"CONTAINER", "CONTENEDOR", "EQUIPMENT NO", "CONTAINER ID",
"箱号", "Nº CONTAINER", "CONT.", "CTN", "CNTR#"

CONSIGNEE/IMPORTADOR (buscar EM ORDEM):
"CONSIGNEE", "CONSIGNATÁRIO", "IMPORTADOR", "BUYER", "IMPORTER",
"DESTINATÁRIO", "NOTIFY PARTY", "NOTIFY", "COMPRADOR",
"收货人", "RECEIVER", "CONSIGNED TO", "SHIPPED TO"

INCOTERM (buscar EM ORDEM):
"INCOTERM", "INCOTERMS", "TERMS", "DELIVERY TERMS", "TRADE TERMS",
"PAYMENT TERMS", "CONDIÇÃO DE ENTREGA", "TERMOS", "MODALIDADE",
"FOB", "CIF", "CFR", "EXW", "DDP", "DAP", "CPT", "FCA"

FRETE (buscar EM ORDEM):
"FREIGHT", "OCEAN FREIGHT", "AIR FREIGHT", "FRETE", "FRETE MARÍTIMO",
"FRETE AÉREO", "FREIGHT CHARGES", "SHIPPING COST", "FRT",
"FREIGHT AMOUNT", "FREIGHT VALUE", "VALOR DO FRETE", "运费"

QUANTIDADE (buscar EM ORDEM):
"QUANTITY", "QTY", "QUANTIDADE", "QTDE", "Q.TY", "PCS", "PIECES",
"UNITS", "CARTONS", "CTNS", "PACKAGES", "PKG", "VOLUMES", "VOLS",
"件数", "UNIDADES", "CAIXAS", "NO. OF PACKAGES"

MOEDA (buscar EM ORDEM):
"CURRENCY", "CUR", "MOEDA", "$", "USD", "EUR", "BRL", "CNY",
"DÓLAR", "EURO", "REAL", "货币", "DIVISA"

═══════════════════════════════════════════════════════════════════════════════
ESTRATÉGIAS DE EXTRAÇÃO — USE TODAS
═══════════════════════════════════════════════════════════════════════════════

ESTRATÉGIA 1 — BUSCA DIRETA:
Procure o campo por nome exato ou sinônimo em todas as páginas.
Exemplo: "Gross Weight: 1.250,00 kg" → extrair "1.250,00 kg"

ESTRATÉGIA 2 — BUSCA CONTEXTUAL:
Se não encontrar rótulo, procure pelo padrão de dado.
Exemplo: número seguido de "kg" ou "KGS" provavelmente é peso.

ESTRATÉGIA 3 — BUSCA EM TABELAS:
Examine TODAS as colunas de TODAS as tabelas.
Exemplo: coluna "Weight" ou "WT" em tabela de items.

ESTRATÉGIA 4 — CÁLCULO/SOMA:
Se tiver itens individuais, CALCULE o total.
Exemplo: Item 1 = 500kg, Item 2 = 750kg → "1.250,00 kg (soma p.2)"

ESTRATÉGIA 5 — CROSS-REFERENCE:
Se falta no Doc A, use dado equivalente do Doc B.
Exemplo: "1.250,00 kg (do Packing List, não consta na Invoice)"

ESTRATÉGIA 6 — INFERÊNCIA LÓGICA:
Use lógica para deduzir valores.
Exemplo: Se Gross = 1.500kg e Tara = 250kg → Net = "1.250,00 kg (inferido)"

ESTRATÉGIA 7 — OCR INTENSIVO:
Para PDFs escaneados, faça OCR agressivo.
Correções: 0↔O, 1↔I↔l, 5↔S, 8↔B, 6↔G

ESTRATÉGIA 8 — LEITURA PARCIAL:
Se parcialmente legível, extraia o que conseguir.
Exemplo: "~1.200 kg (parcialmente legível, p.2)"

═══════════════════════════════════════════════════════════════════════════════
EXEMPLOS PRÁTICOS — COMO NÃO USAR ND
═══════════════════════════════════════════════════════════════════════════════

❌ ERRADO: Peso Líquido = "ND"
✅ CERTO: Peso Líquido = "1.180,00 kg (calculado: Bruto 1.250 - Tara 70)"

❌ ERRADO: Valor Total = "ND" (só porque não tem campo "Total Value")
✅ CERTO: Valor Total = "USD 45.678,90 (soma items p.2-4)"

❌ ERRADO: NCM = "ND" (só olhou p.1)
✅ CERTO: NCM = "8471.30.19 (p.3, tabela de produtos)"

❌ ERRADO: CBM = "ND" (não encontrou "CBM")
✅ CERTO: CBM = "15,50 m³ (Measurement, p.2)"

❌ ERRADO: Incoterm = "ND" (não viu campo explícito)
✅ CERTO: Incoterm = "FOB (Terms: FOB SHANGHAI, p.1)"

❌ ERRADO: Frete = "ND" (Invoice não tem frete)
✅ CERTO: Frete = "USD 2.500,00 (do BL, não consta na Invoice)"

❌ ERRADO: Consignee = "ND" (nome ilegível)
✅ CERTO: Consignee = "ABC IND... LTDA (parcialmente legível, p.1)"

❌ ERRADO: Container = "ND" (não encontrou Container No)
✅ CERTO: Container = "MSKU1234567 (Equipment No., p.1)"

═══════════════════════════════════════════════════════════════════════════════
PROCESSAMENTO MULTI-PÁGINA — OBRIGATÓRIO
═══════════════════════════════════════════════════════════════════════════════

REGRA: Você DEVE verificar 100% de cada documento!

PDF com múltiplas páginas:
- p.1: geralmente cabeçalho (Consignee, Container, termos)
- p.2+: detalhes de itens, pesos, valores, NCMs
- Última página: totais, assinaturas, termos finais, observações

Planilhas:
- Verificar TODAS as abas (Sheet1, RESUMO, ITEMS, etc.)
- Consolidar dados distribuídos

SEMPRE CITE A PÁGINA: "12.345,67 (p.2)", "NCM (p.3)", "Total (p.4)"

═══════════════════════════════════════════════════════════════════════════════
IDENTIFICAÇÃO AUTOMÁTICA
═══════════════════════════════════════════════════════════════════════════════

MODAL: Identifique automaticamente:
- AWB, MAWB, HAWB, Airway Bill, Air Freight → MODAL = AIR
- BL, MBL, HBL, Bill of Lading, Ocean Freight, Container → MODAL = SEA

CLIENTE: Extraia nome do Consignee/Importador do documento principal.
Se múltiplos documentos, use o nome mais completo encontrado.

═══════════════════════════════════════════════════════════════════════════════
CAMPOS CRÍTICOS — EXTRAÇÃO OBRIGATÓRIA
═══════════════════════════════════════════════════════════════════════════════

PESO — CRÍTICO:
- Extrair Peso Bruto (Gross) e Peso Líquido (Net) SEPARADAMENTE
- Se só houver um peso, identificar claramente qual é
- Se puder calcular Net = Gross - Tara, CALCULE
- NUNCA deixe peso como ND se houver qualquer indicação no documento

VALORES — CRÍTICO:
- Extrair VALOR TOTAL sempre (calcule se necessário)
- SEMPRE incluir MOEDA (USD, EUR, BRL)
- Se items individuais disponíveis, some para obter total
- NUNCA invente valores, mas CALCULE sempre que possível

INCOTERM E FRETE — SEPARADOS:
- São campos DIFERENTES, linhas SEPARADAS na tabela
- Incoterm: FOB, CFR, CIF, EXW, etc.
- Frete: valor numérico + moeda

NCM — COMPLETO:
- Extrair TODOS os NCMs de TODOS os items
- Verificar TODAS as páginas do documento
- Se múltiplos NCMs, listar todos

═══════════════════════════════════════════════════════════════════════════════
PADRONIZAÇÃO DE SAÍDA
═══════════════════════════════════════════════════════════════════════════════

Números: vírgula decimal, ponto milhar (ex.: 10.841,00)
Peso: sempre em kg (converter se necessário)
Volume: sempre em m³
Moeda: prefixar valor (ex.: USD 12.345,67)
Datas: DD/MM/AAAA

RÓTULOS DE AUSÊNCIA (usar COM MUITA PARCIMÔNIA):
- ND = não disponível (APENAS após esgotar TODAS as estratégias)
- Ilegível = OCR falhou completamente
- N/A = não aplicável ao tipo de documento

═══════════════════════════════════════════════════════════════════════════════
SEMÁFORO DE STATUS
═══════════════════════════════════════════════════════════════════════════════

✅ = Conforme (valores batem ou diferença dentro da tolerância)
🟨 = Alerta (pequena divergência, dado parcial, ou inferido)
🔴 = Crítico (divergência material acima da tolerância)

TOLERÂNCIAS:
- Peso: até 2% de diferença = ✅
- Valor: até 1% de diferença = ✅
- Equivalência: 97,3 = 97,30 = 97.30 (IGUAIS)
- Equivalência: 10.841 = 10841 = 10.841,00 (IGUAIS)
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
SISTEMA — CRONOS (Etapa 1: Integridade do Pré-Alerta)

Você é o CRONOS, auditor de logística (importação, Brasil).
Objetivo: verificar consistência interna dos documentos do Pré-Alerta (entre si).
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

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stepId, files, clientConfig } = await req.json();

    if (!stepId || !files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'stepId e files são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${files.length} files for step ${stepId}`);
    console.log('Files:', files.map((f: any) => `${f.name} (${f.mimeType})`).join(', '));
    if (clientConfig) {
      console.log('Using client config:', JSON.stringify(clientConfig));
    }

    const fileNames = files.map((f: any) => f.name);
    const prompt = getPromptByStep(stepId, fileNames, clientConfig as ClientConfig | undefined);
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
