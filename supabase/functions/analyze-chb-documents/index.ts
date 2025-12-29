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
INSTRUÇÕES DE EXTRAÇÃO AVANÇADA

Você é um auditor especialista em documentos de comércio exterior (importação Brasil).

═══════════════════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS — ZERO TOLERÂNCIA PARA "ND" PREGUIÇOSO
═══════════════════════════════════════════════════════════════════════════════

1) PROIBIDO marcar "ND" sem ter verificado EXAUSTIVAMENTE:
   - TODAS as páginas de TODOS os documentos (PDF: p.1, p.2, p.3...)
   - Cabeçalhos, rodapés, marcas d'água, carimbos, selos
   - Tabelas secundárias, anexos, notas de rodapé
   - Campos em idiomas alternativos (EN, ES, DE, FR, ZH, PT)
   - Bordas da página, áreas escaneadas com baixo contraste

2) SINÔNIMOS OBRIGATÓRIOS — buscar TODOS estes termos para cada campo:

   PESO BRUTO:
   "Gross Weight", "GW", "G.W.", "Peso Bruto", "Total Weight", "Brutto", 
   "BRUTO", "Wt.", "Weight", "Gross Wt", "Gross Wgt"

   PESO LÍQUIDO:
   "Net Weight", "NW", "N.W.", "Peso Líquido", "Peso Neto", "Neto", 
   "Net Wt", "Net Wgt", "LÍQUIDO"

   VOLUME:
   "CBM", "M³", "Cubic Meters", "Measurement", "Volume", "Cubage", 
   "CBMT", "Meas.", "Cu.M", "Cubic Metre"

   VALOR:
   "Total Value", "Invoice Amount", "Amount", "Valor Total", "Total", 
   "Invoice Value", "FOB Value", "CIF Value", "Value", "Amt", "Importe"

   NCM/HS:
   "HS Code", "NCM", "Tariff", "NCM/SH", "Harmonized Code", "HTS", 
   "H.S. Code", "Código NCM", "Tariff Code", "Commodity Code"

   CONTAINER:
   "Container No", "CNTR", "Container", "Contenedor", "箱号", 
   "Ctr No", "Container Number", "CNTR No.", "Equipment No"

   CONSIGNEE:
   "Consignee", "Consignatário", "Importador", "Buyer", "Destinatário", 
   "Notify Party", "Importer", "收货人"

   INCOTERM:
   "Incoterm", "Terms", "Delivery Terms", "Trade Terms", "Condição de Entrega",
   "Payment Terms", "FOB", "CIF", "CFR", "EXW", "DDP", "DAP"

   FRETE:
   "Freight", "Ocean Freight", "Air Freight", "Frete", "Frete Marítimo",
   "Frete Aéreo", "Freight Charges", "Shipping Cost", "Frt"

3) CÁLCULOS OBRIGATÓRIOS (marcar como "calculado" ou "soma"):
   - Se peso individual de items disponível → CALCULAR peso total
   - Se valor unitário + quantidade disponíveis → CALCULAR valor total
   - Se peso bruto - tara disponíveis → CALCULAR peso líquido
   - Se items têm NCM → LISTAR TODOS os NCMs encontrados
   - NUNCA marcar "ND" se o dado pode ser INFERIDO ou CALCULADO
   - Quando calcular, indicar: "12.345,67 (calculado p.2-3)"

4) CROSS-REFERENCE OBRIGATÓRIO:
   - Se dado falta no Documento A mas existe no Documento B → usar do Doc B com nota
   - Se dado falta mas há campo relacionado → INFERIR e explicar
   - Exemplo: "Peso Bruto: 1.250,00 kg (extraído do Packing List, não consta na Invoice)"

5) PENALIZAÇÃO POR ND DESNECESSÁRIO:
   - Cada "ND" compromete a qualidade da análise
   - Prefira "~valor estimado" ou "valor inferido de [fonte]" do que "ND"
   - Use "ND" APENAS quando ABSOLUTAMENTE IMPOSSÍVEL encontrar ou inferir
   - Se parcialmente legível: "~1.200 kg (parcial, p.2)"
   - Se ilegível mas contexto ajuda: "aprox. 1.000 kg (inferido do valor)"

═══════════════════════════════════════════════════════════════════════════════
PROCESSAMENTO MULTI-PÁGINA — OBRIGATÓRIO
═══════════════════════════════════════════════════════════════════════════════

1) PERCORRER 100% DO DOCUMENTO:
   - PDFs: verificar TODAS as páginas (p.1, p.2, p.3... até a última)
   - Planilhas: verificar TODAS as abas (Sheet1, Sheet2, RESUMO, etc.)
   - Imagens: aplicar OCR com máxima precisão
   - Documentos multi-arquivo: correlacionar dados entre arquivos

2) PRIORIDADE DE EXTRAÇÃO POR PÁGINA:
   - Página 1: dados do cabeçalho (Consignee, Container, Incoterm, nº doc)
   - Páginas intermediárias: itens, pesos, valores, NCMs, quantidades
   - Última página: totais consolidados, assinaturas, observações, termos

3) REFERÊNCIA OBRIGATÓRIA DE PÁGINA:
   - Citar origem: "12.345,67 (p.1)", "NCM 8471.30.19 (p.2)"
   - Para planilhas: "aba: RESUMO", "aba: ITEMS"
   - Se dado vem de múltiplas páginas: "Total: 25.000,00 (p.2-4)"
   - Se dado consolidado de várias fontes: "(calculado de p.1-3)"

4) OCR E DOCUMENTOS ESCANEADOS:
   - Aplicar OCR com máxima precisão
   - Corrigir erros comuns: 0↔O, 1↔I↔l, 5↔S, 8↔B
   - Se parcialmente legível: extrair o que for possível
   - Usar "Ilegível" SOMENTE quando completamente irrecuperável

═══════════════════════════════════════════════════════════════════════════════
IDENTIFICAÇÃO AUTOMÁTICA
═══════════════════════════════════════════════════════════════════════════════

MODAL: Identifique se o processo é SEA ou AIR baseado nos documentos:
  * AWB, Airway Bill, MAWB, HAWB, Air Freight → AIR
  * BL, Bill of Lading, HBL, MBL, Container, Ocean Freight → SEA

CLIENTE: Extraia o nome do Consignee/Importador do documento principal

═══════════════════════════════════════════════════════════════════════════════
REGRAS DE EXTRAÇÃO POR TIPO DE DADO
═══════════════════════════════════════════════════════════════════════════════

PESO — CRÍTICO:
- SEMPRE extraia Peso Bruto (Gross) e Peso Líquido (Net) SEPARADAMENTE
- NUNCA assuma que Gross = padrão quando Net está disponível
- Se só houver um peso, identifique claramente qual é (Gross ou Net)
- Exiba ambos os pesos no grid como linhas separadas
- Se Gross(BL) ≈ Net(PL) e diferença ≈ tara → 🟨 com nota explicativa

VALORES — CRÍTICO:
- Extraia VALOR TOTAL e VALOR POR ITEM separadamente quando disponível
- NUNCA INVENTE valores que não existem no documento
- NUNCA DUPLIQUE valores entre documentos diferentes
- Se um documento não tem valor, marque "ND" (não "0")
- Sempre inclua a MOEDA (USD, EUR, BRL, etc.)
- Para totais calculados: "USD 12.345,67 (soma items p.2-3)"

INCOTERM E FRETE — LINHAS SEPARADAS:
- INCOTERM e FRETE são campos SEPARADOS
- Nunca unifique em uma única linha
- Incoterm: FOB, CFR, CIF, EXW, DAP, DDP, etc.
- Frete: valor numérico + moeda

NCM:
- Comparar raiz de 4 dígitos + compatibilidade da descrição
- Divergência na RAIZ (4 primeiros dígitos) → 🔴 CRÍTICO
- Divergência apenas no sufixo com descrição compatível → 🟨

═══════════════════════════════════════════════════════════════════════════════
PADRONIZAÇÃO DE VALORES
═══════════════════════════════════════════════════════════════════════════════

- Números: vírgula decimal; milhar com ponto (ex.: 10.841,00)
- Unidades: peso em kg; volume em m³; converter quando necessário
- Moeda: normalize como "USD 12.345,67"
- Datas: DD/MM/AAAA ou AAAA-MM-DD
- CNPJ: formatado ou apenas dígitos
- Rótulos de ausência:
  * ND = não disponível (USAR COM PARCIMÔNIA após busca exaustiva)
  * Ilegível = OCR falhou completamente
  * N/A = não aplicável ao tipo de documento

═══════════════════════════════════════════════════════════════════════════════
TOLERÂNCIAS (decisão de status)
═══════════════════════════════════════════════════════════════════════════════

- Quantidades/preços unit.: discrepância relevante se > 1 un. OU > 0,5%
- Totais (valor/peso/CBM): discrepância relevante se > 0,5 (absoluto) OU > 0,3%
- Equivalência: 97,3 = 97,30 = 97.30 (IGUAIS ✅); 10.841 = 10841 = 10.841,00 (IGUAIS ✅)

═══════════════════════════════════════════════════════════════════════════════
SEMÁFORO (usar literalmente)
═══════════════════════════════════════════════════════════════════════════════

- ✅ Conforme = Consistente ou presente sem conflito entre as fontes
- 🟨 Parcial = falta em 1–2 fontes, baixa legibilidade ou pequena divergência dentro da margem
- 🔴 Discrepante = conflito material (acima da tolerância; códigos/textos que mudem enquadramento)

═══════════════════════════════════════════════════════════════════════════════
VALIDAÇÕES ADUANEIRAS BRASILEIRAS
═══════════════════════════════════════════════════════════════════════════════

1) ICMS POR ESTADO (detectar UF do consignatário):
   - Estados com ICMS DIFERIDO: MG, SC, ES
   - Se DI indica ICMS integral em estado com diferimento → 🟨
   - Se benefício fiscal declarado sem fundamento legal → 🔴 CRÍTICO

2) BENEFÍCIOS FISCAIS:
   - RECOF: CFOP 3129 + ICMS suspenso
   - DRAWBACK: Ato Concessório obrigatório + CFOP 3127
   - EX-TARIFÁRIO: II = 0% + fundamento legal 59

3) VALIDAÇÕES CRÍTICAS NO DRAFT DI:
   - 🔴 CRÍTICO: Peso Líquido > Peso Bruto (impossível)
   - 🔴 CRÍTICO: Volumes divergem >10% do BL/Packing List
   - 🟨 ALERTA: Embalagem "Outros" com qtd=1 mas docs mostram múltiplos volumes

4) CE MERCANTE / CONHECIMENTO (marítimo):
   - Verificar coerência: Incoterm × Frete declarado × CE Mercante
   - Se frete no CE diverge do declarado → 🔴

═══════════════════════════════════════════════════════════════════════════════
CÁLCULOS PERMITIDOS (para evitar ND)
═══════════════════════════════════════════════════════════════════════════════

- Some itens quando total não vier fechado (informe "(soma)" na observação)
- Se peso/CBM/valor vier por item, CALCULE o total e reporte com "(calculado)"
- Reconheça sinônimos: "Gross weight"/"GW"/"Bruto"; "Net weight"/"NW"/"Líquido"
- Planilhas multi-abas: consolide valores distribuídos de TODAS as abas
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
      // Excel files - add warning
      warnings.push(createFileError(file, 'binary_not_readable'));
      content.push({
        type: 'text',
        text: `[Arquivo: ${file.name}] - Planilha Excel (não legível diretamente). Análise pode ser incompleta para este arquivo.`,
      });
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
      warnings.push(createFileError(file, 'binary_not_readable'));
      content.push({
        type: 'text',
        text: `[Arquivo: ${file.name}] - Planilha Excel (dados binários). Análise pode ser limitada.`,
      });
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
