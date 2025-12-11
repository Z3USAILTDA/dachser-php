import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de status LeadComex → Eventos CCT
// Note: API returns "Informada" (with "a"), not "Informado"
const STATUS_TO_CCT_EVENT: Record<string, { codigo: string; descricao: string }> = {
  'Informado': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Informada': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Em área de transferência': { codigo: 'AREA_TRANSFERENCIA', descricao: 'Carga em área de transferência' },
  'Chegada informada': { codigo: 'CHEGADA_INFORMADA', descricao: 'Chegada da carga informada ao terminal' },
  'Recepcionado': { codigo: 'RECEPCIONADO', descricao: 'Carga recepcionada no terminal' },
  'Em trânsito terrestre': { codigo: 'EM_TRANSITO', descricao: 'Carga em trânsito terrestre' },
  'Entregue': { codigo: 'ENTREGUE', descricao: 'Carga entregue ao destinatário' },
  'Processado': { codigo: 'ENTREGUE', descricao: 'Carga processada/entregue' },
};

// Ordem sequencial dos eventos no fluxo CCT (para inferir eventos intermediários)
const EVENT_SEQUENCE = [
  'AGUARDANDO_EMBARQUE',
  'MANIFESTADO',
  'AREA_TRANSFERENCIA', 
  'CHEGADA_INFORMADA',
  'RECEPCIONADO',
  'EM_TRANSITO',
  'ENTREGUE'
];

// Descrições para eventos inferidos
const EVENT_DESCRIPTIONS: Record<string, string> = {
  'AGUARDANDO_EMBARQUE': 'Processo recebido via DEP - Aguardando manifestação no CCT',
  'MANIFESTADO': 'Conhecimento manifestado no CCT',
  'AREA_TRANSFERENCIA': 'Carga em área de transferência',
  'CHEGADA_INFORMADA': 'Chegada da carga informada ao terminal',
  'RECEPCIONADO': 'Carga recepcionada no terminal',
  'EM_TRANSITO': 'Carga em trânsito terrestre',
  'ENTREGUE': 'Carga entregue ao destinatário',
};

// API LeadComex
const LEADCOMEX_API_URL = 'https://api.leadcomex.com.br';

// Parsear data no formato brasileiro (DD/MM/YYYY HH:mm:ss) ou ISO para ISO
function parseBrazilianDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  
  // Se já está em formato ISO (YYYY-MM-DD ou com T), retornar como está
  if (dateStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr;
  }
  
  // Formato brasileiro: DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):?(\d{2})?)?$/);
  if (brMatch) {
    const [, day, month, year, hour = '00', min = '00', sec = '00'] = brMatch;
    return `${year}-${month}-${day}T${hour}:${min}:${sec}`;
  }
  
  // Tenta parsear como está (pode já ser ISO)
  console.log(`[LEADCOMEX] Formato de data não reconhecido: ${dateStr}`);
  return dateStr;
}

interface LeadComexHouse {
  hawb: string;
  dataEmissao: string;
}

interface LeadComexCarga {
  identificacao: {
    hawb: string;
    dataEmissao: string;
    situacaoLead: string;
    situacaoPortal: string;
    dataUltimaAtualizacaoCargaDetalhada?: string;
    dataIntegracaoLead?: string;
  };
  // API returns "conhecimentoCargaDetalhada" (with "a" at the end)
  conhecimentoCargaDetalhada?: {
    bloqueiosAtivos?: Array<{
      codigo: string;
      descricao: string;
      dataHoraBloqueio: string;
    }>;
    bloqueiosBaixados?: Array<{
      codigo: string;
      descricao: string;
      dataHoraDesbloqueio: string;
    }>;
    divergencias?: Array<{
      campo: string;
      valorInformado: string;
      valorDetectado: string;
    }>;
    codigoAeroportoOrigemConhecimento?: string;
    codigoAeroportoDestinoConhecimento?: string;
    nroMawbAssociado?: string;
    mawbAssociados?: Array<{ identificacao: string }>;
    pesoBrutoConhecimento?: number;
    pesoBruto?: number;
    pesoTaxado?: number;
    quantidadeVolumesConhecimento?: number;
    quantidadeVolumes?: number;
    identificacaoDocumentoConsignatario?: string;
    nomeConsignatarioConhecimento?: string;
    descricaoResumida?: string;
    mawbAssociado?: string;
    situacao?: string;
    situacaoCarga?: number;
  };
  // Keep backwards compatibility with old field name
  conhecimentoCargaDetalhado?: {
    bloqueiosAtivos?: Array<{
      codigo: string;
      descricao: string;
      dataHoraBloqueio: string;
    }>;
    bloqueiosBaixados?: Array<{
      codigo: string;
      descricao: string;
      dataHoraDesbloqueio: string;
    }>;
    divergencias?: Array<{
      campo: string;
      valorInformado: string;
      valorDetectado: string;
    }>;
    codigoAeroportoOrigemConhecimento?: string;
    codigoAeroportoDestinoConhecimento?: string;
    pesoBruto?: number;
    pesoTaxado?: number;
    quantidadeVolumes?: number;
    identificacaoDocumentoConsignatario?: string;
    descricaoResumida?: string;
    mawbAssociado?: string;
  };
}

// Formata data para o padrão ISO8601: yyyy-MM-ddTHH:mm:ss
function formatDateForLeadComex(date: Date, isEndOfDay: boolean = false): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const time = isEndOfDay ? '23:59:59' : '00:00:00';
  return `${year}-${month}-${day}T${time}`;
}

// Normaliza HAWB removendo hífens, pontos, espaços e outros caracteres especiais
// Retorna versão em maiúsculas sem caracteres especiais para matching
function normalizeHawb(hawb: string): string {
  if (!hawb) return '';
  // Remove hífens, pontos, espaços, underscores e outros caracteres especiais
  return hawb.trim().toUpperCase().replace(/[\s\-_\.\/\\]+/g, '');
}

// Extrai parte numérica do HAWB para matching adicional
// Formato MariaDB: "FMO-16537219" ou "STR-15230632" → extrai "16537219" ou "15230632"
// Formato LeadComex: pode ser "16537219" direto ou formato semelhante
function extractHawbNumericPart(hawb: string): string {
  if (!hawb) return '';
  
  // Remove prefixo de 2-4 letras seguido de hífen (ex: FMO-, STR-, HEL-)
  let cleaned = hawb.trim().replace(/^[A-Z]{2,4}[\-_]?/i, '');
  
  // Remove qualquer caractere não numérico
  const numericOnly = cleaned.replace(/\D/g, '');
  
  // Retorna os últimos 8-11 dígitos (formato comum de HAWB)
  return numericOnly.slice(-11);
}

// Gera múltiplas variações do HAWB para matching
function generateHawbVariations(hawb: string): string[] {
  const variations: Set<string> = new Set();
  if (!hawb) return [];
  
  const original = hawb.trim().toUpperCase();
  
  // 1. Original
  variations.add(original);
  
  // 2. Normalizado (sem hífens, pontos, espaços)
  const normalized = normalizeHawb(hawb);
  variations.add(normalized);
  
  // 3. Sem qualquer prefixo de aeroporto (ex: HAM-15490551 → 15490551)
  const withoutPrefix = original.replace(/^[A-Z]{2,4}[\-_]?/, '');
  variations.add(withoutPrefix);
  variations.add(normalizeHawb(withoutPrefix));
  
  // 4. Extrair parte numérica
  const numericPart = extractHawbNumericPart(hawb);
  if (numericPart && numericPart.length >= 6) {
    variations.add(numericPart);
    // Últimos 8 dígitos
    if (numericPart.length > 8) {
      variations.add(numericPart.slice(-8));
    }
  }
  
  // 5. Tentar adicionar formatos com e sem hífen
  // Se tem hífen, adicionar versão sem
  if (original.includes('-')) {
    variations.add(original.replace(/-/g, ''));
  }
  // Se não tem hífen mas tem padrão ABC12345678, adicionar versão com hífen
  const prefixMatch = original.match(/^([A-Z]{2,4})(\d+)$/);
  if (prefixMatch) {
    variations.add(`${prefixMatch[1]}-${prefixMatch[2]}`);
    variations.add(`${prefixMatch[1]}${prefixMatch[2]}`);
  }
  
  return [...variations].filter(v => v.length > 0);
}

// Formata HAWB no padrão MariaDB (com hífen após prefixo de aeroporto)
// Ex: CDG61527633 → CDG-61527633, STR15250273 → STR-15250273
function formatHawbMariaDBStyle(hawb: string): string {
  if (!hawb) return '';
  
  const trimmed = hawb.trim().toUpperCase();
  
  // Se já tem hífen, retornar como está
  if (trimmed.includes('-')) return trimmed;
  
  // Padrão: 3 letras seguidas de números (ex: CDG61527633)
  const match3 = trimmed.match(/^([A-Z]{3})(\d+)$/);
  if (match3) return `${match3[1]}-${match3[2]}`;
  
  // Padrão: 2-4 letras seguidas de números (ex: FMO16537219)
  const match24 = trimmed.match(/^([A-Z]{2,4})(\d+.*)$/);
  if (match24) return `${match24[1]}-${match24[2]}`;
  
  // Se não encaixa no padrão, retornar original
  return trimmed;
}

async function fetchHousesByPeriod(token: string, periodoInicio: string, periodoFim: string): Promise<LeadComexHouse[]> {
  const url = new URL(`${LEADCOMEX_API_URL}/api/ext/houses`);
  url.searchParams.append('periodoInicio', periodoInicio);
  url.searchParams.append('periodoFim', periodoFim);

  console.log(`[LEADCOMEX] Buscando houses de ${periodoInicio} a ${periodoFim}`);
  console.log(`[LEADCOMEX] URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 204) {
    console.log('[LEADCOMEX] Nenhum house encontrado no período');
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    
    // Parse error message for friendlier display
    if (response.status === 400) {
      try {
        const errorJson = JSON.parse(errorText);
        const message = errorJson.message || errorText;
        
        // Specific error for date limit
        if (message.includes('15 dias') || message.includes('anterior')) {
          throw new Error(`Período inválido: A API LeadComex só permite consultas dos últimos 15 dias. Selecione um período menor.`);
        }
        throw new Error(`Erro de validação LeadComex: ${message}`);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes('Período inválido')) {
          throw parseError;
        }
        throw new Error(`Erro de validação LeadComex (400): ${errorText}`);
      }
    }
    
    throw new Error(`Erro LeadComex API (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Busca status de um HAWB específico na API LeadComex
async function fetchHawbStatus(token: string, hawb: string): Promise<LeadComexCarga | null> {
  // LeadComex requires searching by HAWB - try to find it
  const url = new URL(`${LEADCOMEX_API_URL}/api/ext/conhecimentos-carga`);
  url.searchParams.append('hawb', hawb);
  url.searchParams.append('exibirCargaDetalhada', 'true');

  console.log(`[LEADCOMEX] Buscando status do HAWB: ${hawb}`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 204) {
      console.log(`[LEADCOMEX] HAWB ${hawb} não encontrado na API`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LEADCOMEX] Erro ao buscar ${hawb}: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    // API pode retornar array ou objeto único
    if (Array.isArray(data)) {
      return data[0] || null;
    }
    return data;
  } catch (error) {
    console.error(`[LEADCOMEX] Erro de conexão para ${hawb}:`, error);
    return null;
  }
}

async function fetchCargaDetalhada(token: string, hawb: string, dataEmissao: string): Promise<LeadComexCarga | null> {
  const url = new URL(`${LEADCOMEX_API_URL}/api/ext/conhecimentos-carga`);
  url.searchParams.append('hawb', hawb);
  url.searchParams.append('dataEmissao', dataEmissao.split(' ')[0]); // Format: YYYY-MM-DD
  url.searchParams.append('exibirCargaDetalhada', 'true');

  console.log(`[LEADCOMEX] Buscando detalhes do HAWB: ${hawb}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 204) {
    console.log(`[LEADCOMEX] HAWB ${hawb} não encontrado`);
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LEADCOMEX] Erro ao buscar ${hawb}: ${response.status} - ${errorText}`);
    return null;
  }

  return await response.json();
}

// Processa dados do LeadComex e atualiza o shipment no Supabase
async function processLeadComexData(
  supabase: any,
  shipmentId: string,
  hawb: string,
  carga: LeadComexCarga,
  syncStats: any
) {
  // Support both field names (API returns "conhecimentoCargaDetalhada" with "a")
  // Cast to any to handle both field name variations
  const cargaAny = carga as any;
  const detalhe = cargaAny.conhecimentoCargaDetalhada || cargaAny.conhecimentoCargaDetalhado;
  const identificacao = carga.identificacao;

  // 1. Atualizar dados do shipment
  const updateData: Record<string, any> = {};
  
  // Support multiple field name variations from API
  const pesoBruto = detalhe?.pesoBrutoConhecimento || detalhe?.pesoBruto;
  const quantidadeVolumes = detalhe?.quantidadeVolumesConhecimento || detalhe?.quantidadeVolumes;
  
  if (pesoBruto) updateData.peso_declarado = pesoBruto;
  if (quantidadeVolumes) updateData.volume_declarado = quantidadeVolumes;
  if (detalhe?.identificacaoDocumentoConsignatario) {
    updateData.cnpj_consignatario = detalhe.identificacaoDocumentoConsignatario;
  }
  if (detalhe?.codigoAeroportoOrigemConhecimento) {
    updateData.aeroporto_origem = detalhe.codigoAeroportoOrigemConhecimento;
  }
  
  // Se temos dados de manifestação ou entrega, atualizar status
  // Note: API returns "Informada" with "a", and also "Processado" for delivered
  const statusLower = identificacao.situacaoPortal?.toLowerCase() || '';
  if (statusLower.includes('informad') || statusLower.includes('recepcionad') ||
      statusLower.includes('entregue') || statusLower.includes('processad')) {
    updateData.status_manifestacao = 'MANIFESTADO_CCT';
    updateData.data_manifestacao_cct = parseBrazilianDate(identificacao.dataUltimaAtualizacaoCargaDetalhada) || new Date().toISOString();
  }
  
  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabase
      .from('shipments')
      .update(updateData)
      .eq('id', shipmentId);
    
    if (!updateError) {
      syncStats.updated++;
      console.log(`[LEADCOMEX] Shipment ${hawb} atualizado com dados CCT`);
    }
  }

  // 2. Criar eventos baseados no status do Portal (incluindo intermediários)
  const statusPortal = identificacao.situacaoPortal;
  const eventMapping = STATUS_TO_CCT_EVENT[statusPortal];

  if (eventMapping) {
    const currentEventIndex = EVENT_SEQUENCE.indexOf(eventMapping.codigo);
    const baseDate = parseBrazilianDate(identificacao.dataUltimaAtualizacaoCargaDetalhada) || new Date().toISOString();
    
    // Buscar eventos existentes para este shipment
    const { data: existingEvents } = await supabase
      .from('cct_evento_normalizado')
      .select('codigo_evento')
      .eq('shipment_id', shipmentId);
    
    const existingEventCodes = new Set(existingEvents?.map((e: { codigo_evento: string }) => e.codigo_evento) || []);
    
    // Criar todos os eventos intermediários que não existem (do início até o status atual)
    // Começamos do índice 1 (MANIFESTADO) pois AGUARDANDO_EMBARQUE é criado pelo mariadb-dep-sync
    for (let i = 1; i <= currentEventIndex; i++) {
      const eventCode = EVENT_SEQUENCE[i];
      
      if (!existingEventCodes.has(eventCode)) {
        // Calcular data do evento: distribuir proporcionalmente antes da data final
        // Evento mais antigo = baseDate - (currentEventIndex - i) * 5 minutos
        const minutesOffset = (currentEventIndex - i) * 5;
        const eventDate = new Date(new Date(baseDate).getTime() - (minutesOffset * 60 * 1000));
        
        await supabase
          .from('cct_evento_normalizado')
          .insert({
            shipment_id: shipmentId,
            codigo_evento: eventCode,
            descricao_evento: EVENT_DESCRIPTIONS[eventCode] || `Evento ${eventCode}`,
            fonte: 'RFB', // LeadComex é integrador RFB
            aeroporto: detalhe?.codigoAeroportoDestinoConhecimento || 'GRU',
            data_hora_evento: eventDate.toISOString(),
            nivel_confianca: i === currentEventIndex ? 'PRIMARIA' : 'COMPLEMENTAR',
            detalhes_raw: { 
              source: 'leadcomex', 
              situacaoLead: identificacao.situacaoLead,
              inferred: i < currentEventIndex, // Marca eventos inferidos
            },
          });
        syncStats.events++;
        console.log(`[LEADCOMEX] Evento ${eventCode} criado para ${hawb}${i < currentEventIndex ? ' (inferido)' : ''}`);
      }
    }

    // Atualizar status CCT para o evento mais recente
    await supabase
      .from('cct_status_atual')
      .upsert({
        shipment_id: shipmentId,
        status_cct_oficial: eventMapping.codigo,
        ultima_atualizacao: new Date().toISOString(),
      }, { onConflict: 'shipment_id' });
  }

  // 3. Processar bloqueios ativos
  if (detalhe?.bloqueiosAtivos && detalhe.bloqueiosAtivos.length > 0) {
    for (const bloqueio of detalhe.bloqueiosAtivos) {
      const { data: existingBloqueio } = await supabase
        .from('cct_excecao_operacional')
        .select('id')
        .eq('shipment_id', shipmentId)
        .ilike('descricao', `%${bloqueio.codigo}%`)
        .eq('status_excecao', 'ABERTA')
        .maybeSingle();

      if (!existingBloqueio) {
        await supabase
          .from('cct_excecao_operacional')
          .insert({
            shipment_id: shipmentId,
            tipo_excecao: 'ATRASO_EVENTO',
            descricao: `🚫 BLOQUEIO ATIVO [${bloqueio.codigo}]: ${bloqueio.descricao}`,
            fonte_detectou: 'LEADCOMEX',
            status_excecao: 'ABERTA',
          });
        syncStats.bloqueios++;
      }
    }
  }

  // 4. Processar divergências
  if (detalhe?.divergencias && detalhe.divergencias.length > 0) {
    for (const divergencia of detalhe.divergencias) {
      const { data: existingDiv } = await supabase
        .from('cct_excecao_operacional')
        .select('id')
        .eq('shipment_id', shipmentId)
        .ilike('descricao', `%${divergencia.campo}%`)
        .eq('status_excecao', 'ABERTA')
        .maybeSingle();

      if (!existingDiv) {
        await supabase
          .from('cct_excecao_operacional')
          .insert({
            shipment_id: shipmentId,
            tipo_excecao: 'DIVERGENCIA_DADOS',
            descricao: `⚠️ DIVERGÊNCIA [${divergencia.campo}]: Informado: ${divergencia.valorInformado}, Detectado: ${divergencia.valorDetectado}`,
            fonte_detectou: 'LEADCOMEX',
            status_excecao: 'ABERTA',
          });
        syncStats.divergencias++;
      }
    }
  }

  // 5. Log da sincronização
  await supabase
    .from('cct_log_entry')
    .insert({
      conector: 'LEADCOMEX',
      tipo: 'SYNC',
      shipment_id: shipmentId,
      house: hawb,
      mensagem: `Sincronizado via LeadComex - Status: ${statusPortal}`,
    });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const leadcomexToken = Deno.env.get('LEADCOMEX_API_TOKEN');

    if (!leadcomexToken) {
      return new Response(
        JSON.stringify({ error: 'LEADCOMEX_API_TOKEN não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sync';

    console.log(`[LEADCOMEX] Action: ${action}`);

    // Health check - testa conexão com a API
    if (action === 'health') {
      try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const periodoInicio = formatDateForLeadComex(oneDayAgo, false);
        const periodoFim = formatDateForLeadComex(now, true);

        const startTime = Date.now();
        await fetchHousesByPeriod(leadcomexToken, periodoInicio, periodoFim);
        const latency = Date.now() - startTime;

        return new Response(
          JSON.stringify({ 
            status: 'online', 
            latency,
            message: 'Conexão com LeadComex OK' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({ 
            status: 'offline', 
            error: errorMessage 
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // =============================================
    // MATCH REVERSO: Busca houses por período e faz match com shipments existentes
    // =============================================
    if (action === 'enrich') {
      // LeadComex API limita consultas a no máximo 15 dias - usamos 14 para segurança
      const MAX_DAYS_BACK = 14;
      const requestedDays = body.daysBack || 14;
      const daysBack = Math.min(requestedDays, MAX_DAYS_BACK);
      const limit = body.limit || 500;
      
      if (requestedDays > MAX_DAYS_BACK) {
        console.log(`[LEADCOMEX] Período solicitado (${requestedDays} dias) excede limite da API (${MAX_DAYS_BACK} dias). Usando ${MAX_DAYS_BACK} dias.`);
      }
      
      const now = new Date();
      const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      
      const periodoInicio = body.periodoInicio || formatDateForLeadComex(startDate, false);
      const periodoFim = body.periodoFim || formatDateForLeadComex(now, true);

      console.log(`[LEADCOMEX] Match reverso - Período: ${periodoInicio} a ${periodoFim}`);

      // 1. Buscar todos os houses do período na LeadComex
      const leadcomexHouses = await fetchHousesByPeriod(leadcomexToken, periodoInicio, periodoFim);
      console.log(`[LEADCOMEX] ${leadcomexHouses.length} houses encontrados na LeadComex`);

      if (leadcomexHouses.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Nenhum house encontrado na LeadComex para o período',
            stats: { total: 0, matched: 0 },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Criar mapa de HAWBs da LeadComex para lookup rápido (múltiplas chaves por house)
      const leadcomexMap = new Map<string, LeadComexHouse>();
      for (const house of leadcomexHouses) {
        // Gerar todas as variações possíveis do HAWB
        const variations = generateHawbVariations(house.hawb);
        for (const variation of variations) {
          if (!leadcomexMap.has(variation)) {
            leadcomexMap.set(variation, house);
          }
        }
      }

      console.log(`[LEADCOMEX] Mapa de ${leadcomexMap.size} variações de HAWBs criado para match`);
      
      // Debug: logar alguns exemplos de HAWBs da LeadComex
      const sampleLeadcomex = leadcomexHouses.slice(0, 5).map(h => h.hawb);
      console.log(`[LEADCOMEX] Exemplos de HAWBs LeadComex: ${JSON.stringify(sampleLeadcomex)}`);

      // 3. Buscar shipments capturados via DEP (todos os status ativos)
      // Shipments entram via mariadb-dep-sync e permanecem para monitoramento
      const { data: shipments, error: fetchError } = await supabase
        .from('shipments')
        .select('id, house, master, status_manifestacao')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        throw new Error(`Erro ao buscar shipments: ${fetchError.message}`);
      }

      console.log(`[LEADCOMEX] Buscando match para ${shipments?.length || 0} shipments capturados via DEP`);

      console.log(`[LEADCOMEX] ${shipments?.length || 0} shipments pendentes no Supabase`);
      
      // Debug: logar alguns exemplos de HAWBs do Supabase
      const sampleSupabase = shipments?.slice(0, 5).map(s => s.house) || [];
      console.log(`[LEADCOMEX] Exemplos de HAWBs Supabase: ${JSON.stringify(sampleSupabase)}`);

      const syncStats = {
        total_leadcomex: leadcomexHouses.length,
        total_supabase: shipments?.length || 0,
        matched: 0,
        not_matched: 0,
        updated: 0,
        events: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
        matches_detail: [] as Array<{ supabase_hawb: string; leadcomex_hawb: string }>,
      };

      // 4. Para cada shipment, tentar encontrar match na LeadComex usando múltiplas variações
      for (const shipment of shipments || []) {
        try {
          // Gerar variações do HAWB do shipment e tentar match
          const shipmentVariations = generateHawbVariations(shipment.house);
          let matchedHouse: LeadComexHouse | undefined;
          
          for (const variation of shipmentVariations) {
            matchedHouse = leadcomexMap.get(variation);
            if (matchedHouse) break;
          }

          if (!matchedHouse) {
            syncStats.not_matched++;
            continue;
          }

          syncStats.matched++;
          syncStats.matches_detail.push({
            supabase_hawb: shipment.house,
            leadcomex_hawb: matchedHouse.hawb,
          });

          console.log(`[LEADCOMEX] Match: ${shipment.house} ↔ ${matchedHouse.hawb}`);

          // 5. Buscar detalhes da carga na LeadComex
          const carga = await fetchCargaDetalhada(leadcomexToken, matchedHouse.hawb, matchedHouse.dataEmissao);

          if (!carga) {
            console.log(`[LEADCOMEX] Sem detalhes para ${matchedHouse.hawb}`);
            continue;
          }

          // 6. Processar dados do LeadComex
          await processLeadComexData(supabase, shipment.id, shipment.house, carga, syncStats);

        } catch (error) {
          console.error(`[LEADCOMEX] Erro ao processar ${shipment.house}:`, error);
          syncStats.errors++;
        }
      }

      // Log resumo
      await supabase.from('cct_log_entry').insert({
        conector: 'LEADCOMEX',
        tipo: 'INFO',
        mensagem: `Match reverso: ${syncStats.matched}/${syncStats.total_supabase} shipments encontrados na LeadComex`,
      });

      console.log('[LEADCOMEX] Match reverso concluído:', syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Match reverso concluído: ${syncStats.matched} matches encontrados`,
          stats: {
            ...syncStats,
            matches_detail: syncStats.matches_detail.slice(0, 20), // Limitar output
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sync original - busca houses por período e sincroniza
    if (action === 'sync') {
      // LeadComex API limita consultas a no máximo 15 dias - usamos 14 para segurança
      const MAX_DAYS_BACK = 14;
      const requestedDays = body.daysBack || 7;
      const daysBack = Math.min(requestedDays, MAX_DAYS_BACK);
      
      if (requestedDays > MAX_DAYS_BACK) {
        console.log(`[LEADCOMEX] Período solicitado (${requestedDays} dias) excede limite da API (${MAX_DAYS_BACK} dias). Usando ${MAX_DAYS_BACK} dias.`);
      }
      
      const now = new Date();
      const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

      const periodoInicio = body.periodoInicio || formatDateForLeadComex(startDate, false);
      const periodoFim = body.periodoFim || formatDateForLeadComex(now, true);

      console.log(`[LEADCOMEX] Sincronizando período: ${periodoInicio} - ${periodoFim}`);

      // 1. Buscar lista de houses
      const houses = await fetchHousesByPeriod(leadcomexToken, periodoInicio, periodoFim);
      console.log(`[LEADCOMEX] Encontrados ${houses.length} houses`);

      let syncStats = {
        total: houses.length,
        created: 0,
        updated: 0,
        events: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
      };

      // 2. Para cada house, buscar detalhes e sincronizar
      for (const house of houses) {
        try {
          const carga = await fetchCargaDetalhada(leadcomexToken, house.hawb, house.dataEmissao);
          
          // Support both field names (API returns "conhecimentoCargaDetalhada" with "a")
          const cargaAny = carga as any;
          const detalhe = cargaAny?.conhecimentoCargaDetalhada || cargaAny?.conhecimentoCargaDetalhado;
          
          if (!carga || !detalhe) {
            console.log(`[LEADCOMEX] Sem detalhes para ${house.hawb}`);
            continue;
          }

          const identificacao = carga.identificacao;

          // Verificar se o shipment já existe (buscar por ambos formatos: com e sem hífen)
          const formattedHawb = formatHawbMariaDBStyle(house.hawb);
          const { data: existingShipment } = await supabase
            .from('shipments')
            .select('id, status_manifestacao')
            .or(`house.eq.${house.hawb},house.eq.${formattedHawb}`)
            .maybeSingle();

          let shipmentId: string;

          if (existingShipment) {
            // Atualizar shipment existente usando a função reutilizável
            shipmentId = existingShipment.id;
            await processLeadComexData(supabase, shipmentId, house.hawb, carga, syncStats);
          } else {
            // Criar novo shipment - support multiple field name variations
            const mawb = detalhe.nroMawbAssociado || detalhe.mawbAssociado || 
                        (detalhe.mawbAssociados && detalhe.mawbAssociados[0]?.identificacao) || 'N/A';
            const pesoBruto = detalhe.pesoBrutoConhecimento || detalhe.pesoBruto;
            const quantidadeVolumes = detalhe.quantidadeVolumesConhecimento || detalhe.quantidadeVolumes;
            
            // Formatar HAWB no padrão MariaDB (com hífen)
            const formattedHawb = formatHawbMariaDBStyle(house.hawb);
            
            const newShipment = {
              house: formattedHawb,
              master: mawb,
              cliente: detalhe.nomeConsignatarioConhecimento || 'LeadComex Import',
              aeroporto_origem: detalhe.codigoAeroportoOrigemConhecimento || 'XXX',
              aeroporto_destino: detalhe.codigoAeroportoDestinoConhecimento || 'GRU',
              peso_declarado: pesoBruto || null,
              volume_declarado: quantidadeVolumes || null,
              cnpj_consignatario: detalhe.identificacaoDocumentoConsignatario || null,
              status_manifestacao: 'RECEBIDO_NOVA' as const,
            };

            const { data: created, error: createError } = await supabase
              .from('shipments')
              .insert(newShipment)
              .select('id')
              .single();

            if (createError) {
              console.error(`[LEADCOMEX] Erro ao criar shipment ${house.hawb}:`, createError);
              syncStats.errors++;
              continue;
            }

            shipmentId = created.id;
            syncStats.created++;

            // Processar dados adicionais
            await processLeadComexData(supabase, shipmentId, house.hawb, carga, syncStats);
          }

        } catch (houseError) {
          console.error(`[LEADCOMEX] Erro processando ${house.hawb}:`, houseError);
          syncStats.errors++;
        }
      }

      console.log('[LEADCOMEX] Sincronização concluída:', syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Sincronização LeadComex concluída',
          stats: syncStats,
          periodo: { inicio: periodoInicio, fim: periodoFim },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Consulta única de house
    if (action === 'query') {
      const { hawb, dataEmissao } = body;

      if (!hawb) {
        return new Response(
          JSON.stringify({ error: 'hawb é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Se não tiver dataEmissao, usa a nova função que busca só por HAWB
      const carga = dataEmissao 
        ? await fetchCargaDetalhada(leadcomexToken, hawb, dataEmissao)
        : await fetchHawbStatus(leadcomexToken, hawb);

      return new Response(
        JSON.stringify({ success: true, data: carga }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =============================================
    // ENRICH-INDIVIDUAL: Consulta cada shipment individualmente na LeadComex
    // Útil para enriquecer histórico quando o match por período não funciona
    // =============================================
    if (action === 'enrich-individual') {
      const limit = body.limit || 100;
      const offset = body.offset || 0;
      
      console.log(`[LEADCOMEX] Enrich individual - limit: ${limit}, offset: ${offset}`);

      // Buscar shipments que ainda não foram enriquecidos ou todos
      const { data: shipments, error: fetchError } = await supabase
        .from('shipments')
        .select('id, house, master, status_manifestacao, cliente')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (fetchError) {
        throw new Error(`Erro ao buscar shipments: ${fetchError.message}`);
      }

      console.log(`[LEADCOMEX] Processando ${shipments?.length || 0} shipments individualmente`);

      const syncStats = {
        total: shipments?.length || 0,
        found: 0,
        not_found: 0,
        updated: 0,
        events: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
        details: [] as Array<{ house: string; status: string; found: boolean }>,
      };

      // Processar cada shipment individualmente
      for (const shipment of shipments || []) {
        try {
          // Gerar variações do HAWB para tentar encontrar na LeadComex
          const variations = generateHawbVariations(shipment.house);
          let carga: LeadComexCarga | null = null;
          let matchedVariation = '';

          // Tentar cada variação até encontrar
          for (const variation of variations) {
            console.log(`[LEADCOMEX] Tentando ${shipment.house} → ${variation}`);
            carga = await fetchHawbStatus(leadcomexToken, variation);
            if (carga) {
              matchedVariation = variation;
              break;
            }
            // Pequeno delay para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          if (!carga) {
            syncStats.not_found++;
            syncStats.details.push({ 
              house: shipment.house, 
              status: 'not_found', 
              found: false 
            });
            console.log(`[LEADCOMEX] ${shipment.house} não encontrado na LeadComex`);
            continue;
          }

          syncStats.found++;
          console.log(`[LEADCOMEX] ✓ ${shipment.house} encontrado como ${matchedVariation}`);

          // Processar dados do LeadComex
          await processLeadComexData(supabase, shipment.id, shipment.house, carga, syncStats);

          syncStats.details.push({ 
            house: shipment.house, 
            status: carga.identificacao?.situacaoPortal || 'unknown',
            found: true 
          });

        } catch (error) {
          console.error(`[LEADCOMEX] Erro ao processar ${shipment.house}:`, error);
          syncStats.errors++;
          syncStats.details.push({ 
            house: shipment.house, 
            status: 'error', 
            found: false 
          });
        }
      }

      // Log resumo
      await supabase.from('cct_log_entry').insert({
        conector: 'LEADCOMEX',
        tipo: 'INFO',
        mensagem: `Enrich individual: ${syncStats.found}/${syncStats.total} encontrados, ${syncStats.events} eventos criados`,
      });

      console.log('[LEADCOMEX] Enrich individual concluído:', syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Enrich individual: ${syncStats.found} de ${syncStats.total} shipments encontrados na LeadComex`,
          stats: {
            ...syncStats,
            details: syncStats.details.slice(0, 50), // Limitar output
          },
          next_offset: offset + limit,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action inválida. Use: health, sync, enrich, enrich-individual, query' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LEADCOMEX] Erro:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
