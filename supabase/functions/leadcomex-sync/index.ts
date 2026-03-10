import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        edge_function: 'leadcomex-sync',
      }),
    });
  } catch (e) {
    console.error('[logApiCall] Failed to log:', e);
  }
}

// Mapeamento de status LeadComex → Eventos CCT
// IMPORTANTE: Usar situacaoPortal (status operacional) como fonte primária
// situacaoLead ("Processado") é status interno do sistema, não indica entrega física
const STATUS_TO_CCT_EVENT: Record<string, { codigo: string; descricao: string }> = {
  // Variantes masculinas e femininas (API retorna ambas dependendo do contexto)
  'Informado': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Informada': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Em área de transferência': { codigo: 'AREA_TRANSFERENCIA', descricao: 'Carga em área de transferência' },
  'Chegada informada': { codigo: 'CHEGADA_INFORMADA', descricao: 'Chegada da carga informada ao terminal' },
  'Recepcionado': { codigo: 'RECEPCIONADO', descricao: 'Carga recepcionada no terminal' },
  'Recepcionada': { codigo: 'RECEPCIONADO', descricao: 'Carga recepcionada no terminal' },
  'Em trânsito terrestre': { codigo: 'EM_TRANSITO', descricao: 'Carga em trânsito terrestre' },
  'Entregue': { codigo: 'ENTREGUE', descricao: 'Carga entregue ao destinatário' },
  // REMOVIDO: 'Processado' não indica entrega física, apenas processamento interno do sistema
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

// Normaliza MAWB para matching (formato padrão internacional: 057-12345678 ou 05712345678)
// Remove hífens, espaços e deixa apenas dígitos para comparação uniforme
function normalizeMawb(mawb: string): string {
  if (!mawb) return '';
  // Remove todos os caracteres não-numéricos para matching consistente
  return mawb.trim().replace(/\D/g, '');
}

// Gera variações do MAWB para matching flexível
function generateMawbVariations(mawb: string): string[] {
  const variations: Set<string> = new Set();
  if (!mawb) return [];
  
  const original = mawb.trim().toUpperCase();
  
  // 1. Original
  variations.add(original);
  
  // 2. Normalizado (apenas dígitos)
  const normalized = normalizeMawb(mawb);
  if (normalized.length >= 8) {
    variations.add(normalized);
    
    // 3. Formato com hífen após 3 primeiros dígitos (057-12345678)
    if (normalized.length === 11) {
      variations.add(`${normalized.slice(0, 3)}-${normalized.slice(3)}`);
      variations.add(`${normalized.slice(0, 3)} ${normalized.slice(3)}`);
    }
    
    // 4. Últimos 8 dígitos (parte numérica sem prefixo)
    if (normalized.length > 8) {
      variations.add(normalized.slice(-8));
    }
  }
  
  // 5. Se já tem hífen, adicionar versão sem
  if (original.includes('-')) {
    variations.add(original.replace(/-/g, ''));
  }
  
  return [...variations].filter(v => v.length > 0);
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

// Gera variações do HAWB para matching - MESMO FORMATO DO TESTE QUE FUNCIONOU
function generateHawbVariations(hawb: string): string[] {
  const variations: Set<string> = new Set();
  if (!hawb) return [];
  
  const original = hawb.trim().toUpperCase();
  
  // 1. Original (com hífen se tiver)
  variations.add(original);
  
  // 2. Normalizado (sem hífen, mas COM prefixo)
  const normalized = original.replace(/[\s\-_\.\/\\]+/g, '');
  variations.add(normalized);
  
  // 3. Sem prefixo de aeroporto (ex: VCP-43302749 → 43302749)
  const withoutPrefix = original.replace(/^[A-Z]{2,4}[\-_]?/, '');
  if (withoutPrefix && withoutPrefix !== original) {
    variations.add(withoutPrefix);
    variations.add(withoutPrefix.replace(/[\s\-_\.\/\\]+/g, ''));
  }
  
  // 4. Parte numérica pura
  const numericPart = original.replace(/\D/g, '');
  if (numericPart.length >= 6) {
    variations.add(numericPart);
    // Últimos 8 dígitos se muito longo
    if (numericPart.length > 8) {
      variations.add(numericPart.slice(-8));
    }
  }
  
  // Filtrar variações válidas (máx 11 chars para LeadComex)
  const filtered = [...variations]
    .filter(v => v.length > 0 && v.length <= 11)
    .sort((a, b) => b.length - a.length);  // Priorizar mais longas
  
  console.log(`[LEADCOMEX] HAWB ${hawb} → Variações (${filtered.length}): ${filtered.join(', ')}`);
  return filtered;
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

  const startTime = Date.now();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  });
  const elapsed = Date.now() - startTime;

  // Log the API call
  logApiCall({
    api_name: 'Leadcomex',
    endpoint: '/api/ext/houses',
    method: 'GET',
    status_code: response.status,
    response_time_ms: elapsed,
    error_message: response.ok ? undefined : `Status ${response.status}`,
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

  const startTime = Date.now();
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Token': token,
        'Content-Type': 'application/json',
      },
    });
    const elapsed = Date.now() - startTime;

    // Log the API call
    logApiCall({
      api_name: 'Leadcomex',
      endpoint: '/api/ext/conhecimentos-carga',
      method: 'GET',
      status_code: response.status,
      response_time_ms: elapsed,
      error_message: response.ok || response.status === 204 ? undefined : `Status ${response.status}`,
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
    const elapsed = Date.now() - startTime;
    logApiCall({
      api_name: 'Leadcomex',
      endpoint: '/api/ext/conhecimentos-carga',
      method: 'GET',
      status_code: 0,
      response_time_ms: elapsed,
      error_message: error instanceof Error ? error.message : 'Connection error',
    });
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

  const startTime = Date.now();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  });
  const elapsed = Date.now() - startTime;

  // Log the API call
  logApiCall({
    api_name: 'Leadcomex',
    endpoint: '/api/ext/conhecimentos-carga',
    method: 'GET',
    status_code: response.status,
    response_time_ms: elapsed,
    error_message: response.ok || response.status === 204 ? undefined : `Status ${response.status}`,
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

// Processa dados do LeadComex e atualiza o shipment no MariaDB
// Nota: Como o CCT usa MariaDB como fonte de dados, fazemos update apenas no MariaDB
// NOVO: Registra eventos na timeline (t_cct_eventos_historico) para cada consulta bem-sucedida
async function processLeadComexData(
  supabase: any,
  hawb: string,
  master: string,
  carga: LeadComexCarga,
  syncStats: any
) {
  // Support both field names (API returns "conhecimentoCargaDetalhada" with "a")
  // Cast to any to handle both field name variations
  const cargaAny = carga as any;
  const detalhe = cargaAny.conhecimentoCargaDetalhada || cargaAny.conhecimentoCargaDetalhado;
  const identificacao = carga.identificacao;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // 1. Preparar dados para atualização
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
  if (detalhe?.codigoAeroportoDestinoConhecimento) {
    updateData.aeroporto_destino = detalhe.codigoAeroportoDestinoConhecimento;
  }
  
  // Extrair data de decolagem do último trecho (viagensAssociadas)
  // O último voo da lista representa o último trecho antes de chegar ao destino final
  if (cargaAny?.viagensAssociadas && Array.isArray(cargaAny.viagensAssociadas) && cargaAny.viagensAssociadas.length > 0) {
    // Pegar o último voo da lista (último trecho)
    const ultimoVoo = cargaAny.viagensAssociadas[cargaAny.viagensAssociadas.length - 1];
    // Preferir dataPartidaReal, fallback para dataPartidaPrevista
    const dataDecolagem = ultimoVoo.dataPartidaReal || ultimoVoo.dataPartidaPrevista;
    if (dataDecolagem) {
      const parsedDate = parseBrazilianDate(dataDecolagem);
      if (parsedDate) {
        updateData.data_decolagem_ultimo_trecho = parsedDate;
        console.log(`[LEADCOMEX] Data decolagem encontrada: ${parsedDate} (voo ${ultimoVoo.nroVoo || 'N/A'})`);
      }
    }
  }
  
  // Se temos dados de manifestação ou entrega, atualizar status
  // Note: API returns "Informada" with "a", and also "Processado" for delivered
  const statusLower = identificacao.situacaoPortal?.toLowerCase() || '';
  if (statusLower.includes('informad') || statusLower.includes('recepcionad') ||
      statusLower.includes('entregue') || statusLower.includes('processad')) {
    updateData.status_manifestacao_cct = 'MANIFESTADO_CCT';
    updateData.data_manifestacao_cct = parseBrazilianDate(identificacao.dataUltimaAtualizacaoCargaDetalhada) || new Date().toISOString();
  }
  
  if (Object.keys(updateData).length === 0) {
    console.log(`[LEADCOMEX] Nenhum dado novo para ${hawb}`);
    return;
  }
    
  // === Atualizar no MariaDB via mariadb-proxy ===
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseKey) {
      const mariadbResponse = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          action: 'update_leadcomex_data',
          house: hawb,
          master: master,
          updates: updateData,
        }),
      });
      
      if (mariadbResponse.ok) {
        syncStats.updated++;
        console.log(`[LEADCOMEX] Shipment ${hawb} atualizado no MariaDB com: ${JSON.stringify(updateData)}`);
      } else {
        const errorText = await mariadbResponse.text();
        console.warn(`[LEADCOMEX] Erro ao atualizar MariaDB para ${hawb}: ${errorText}`);
        syncStats.errors++;
      }
    }
  } catch (mariadbError) {
    console.warn(`[LEADCOMEX] Erro ao atualizar MariaDB para ${hawb}:`, mariadbError);
    syncStats.errors++;
  }

  // Nota: Bloqueios, divergências e eventos CCT são processados diretamente no MariaDB
  // As tabelas cct_excecao_operacional e cct_evento_normalizado do Supabase não são usadas pelo CCT
  
  // === NOVO: Registrar evento na timeline (t_cct_eventos_historico) ===
  // Mapear status LeadComex para evento CCT
  // IMPORTANTE: Priorizar situacaoPortal (status operacional real) sobre situacaoLead (status interno)
  const situacaoLead = identificacao.situacaoLead;
  const situacaoPortal = identificacao.situacaoPortal;
  const eventMapping = STATUS_TO_CCT_EVENT[situacaoPortal] || STATUS_TO_CCT_EVENT[situacaoLead];
  
  console.log(`[LEADCOMEX] Status para ${hawb}: Lead="${situacaoLead}", Portal="${situacaoPortal}" → ${eventMapping?.codigo || 'SEM_MAPEAMENTO'}`);
  
  if (eventMapping && supabaseUrl && supabaseKey) {
    try {
      // Inserir evento no histórico da timeline
      const insertEventResponse = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          action: 'insert_cct_event',
          awb: hawb,
          codigo_evento: eventMapping.codigo,
          descricao_evento: eventMapping.descricao,
          data_hora_evento: parseBrazilianDate(identificacao.dataUltimaAtualizacaoCargaDetalhada) || new Date().toISOString(),
          fonte: 'LEADCOMEX',
          aeroporto: detalhe?.codigoAeroportoDestinoConhecimento || null,
          nivel_confianca: 'PRIMARIA',
        }),
      });

      if (insertEventResponse.ok) {
        console.log(`[LEADCOMEX] Evento ${eventMapping.codigo} registrado na timeline para ${hawb}`);
        syncStats.events = (syncStats.events || 0) + 1;
      }
    } catch (eventError) {
      console.warn(`[LEADCOMEX] Erro ao inserir evento na timeline para ${hawb}:`, eventError);
    }
  }
  
  // Log bloqueios ativos E registrar cada bloqueio na timeline
  if (detalhe?.bloqueiosAtivos && detalhe.bloqueiosAtivos.length > 0) {
    syncStats.bloqueios += detalhe.bloqueiosAtivos.length;
    console.log(`[LEADCOMEX] ${detalhe.bloqueiosAtivos.length} bloqueios ativos para ${hawb}`);
    
    // Registrar cada bloqueio como evento separado na timeline
    for (const bloqueio of detalhe.bloqueiosAtivos) {
      if (supabaseUrl && supabaseKey) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'insert_cct_event',
              awb: hawb,
              codigo_evento: 'BLOQUEIO',
              descricao_evento: `Bloqueio ${bloqueio.codigo || bloqueio.codigoBloqueio || 'N/A'}: ${bloqueio.descricao || bloqueio.descricaoBloqueio || bloqueio.motivo || 'Motivo não informado'}`,
              data_hora_evento: parseBrazilianDate(bloqueio.dataHoraBloqueio) || new Date().toISOString(),
              fonte: 'LEADCOMEX',
              nivel_confianca: 'PRIMARIA',
            }),
          });
        } catch (e) {
          console.warn(`[LEADCOMEX] Erro ao inserir bloqueio na timeline:`, e);
        }
      }
    }
  }

  // Registrar cada DESBLOQUEIO como evento na timeline
  if (detalhe?.bloqueiosBaixados && detalhe.bloqueiosBaixados.length > 0) {
    console.log(`[LEADCOMEX] ${detalhe.bloqueiosBaixados.length} desbloqueios para ${hawb}`);
    
    for (const desbloqueio of detalhe.bloqueiosBaixados) {
      if (supabaseUrl && supabaseKey) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'insert_cct_event',
              awb: hawb,
              codigo_evento: 'DESBLOQUEIO',
              descricao_evento: `Desbloqueio ${desbloqueio.codigo || desbloqueio.codigoBloqueio || 'N/A'}: ${desbloqueio.descricao || desbloqueio.descricaoBloqueio || desbloqueio.motivo || 'Motivo não informado'}`,
              data_hora_evento: parseBrazilianDate(desbloqueio.dataHoraDesbloqueio) || new Date().toISOString(),
              fonte: 'LEADCOMEX',
              nivel_confianca: 'PRIMARIA',
            }),
          });
        } catch (e) {
          console.warn(`[LEADCOMEX] Erro ao inserir desbloqueio na timeline:`, e);
        }
      }
    }
  }

  // Log divergências
  if (detalhe?.divergencias && detalhe.divergencias.length > 0) {
    syncStats.divergencias += detalhe.divergencias.length;
    console.log(`[LEADCOMEX] ${detalhe.divergencias.length} divergências para ${hawb}`);
  }
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

      // 2. NOVA ESTRATÉGIA: Buscar detalhes de cada house para obter MAWB
      // Criar mapa: MAWB normalizado → {house, carga}
      console.log(`[LEADCOMEX] Buscando detalhes e MAWB para ${leadcomexHouses.length} houses...`);
      
      interface LeadComexEntry {
        house: LeadComexHouse;
        carga: LeadComexCarga;
        mawb: string;
      }
      
      const mawbToDataMap = new Map<string, LeadComexEntry>();
      let detailsFetched = 0;
      let detailsWithMawb = 0;
      
      for (const house of leadcomexHouses) {
        try {
          // Buscar detalhes completos (inclui MAWB)
          const carga = await fetchCargaDetalhada(leadcomexToken, house.hawb, house.dataEmissao);
          detailsFetched++;
          
          if (!carga) continue;
          
          // Extrair MAWB do response (suporta múltiplos nomes de campo)
          const cargaAny = carga as any;
          const detalhe = cargaAny.conhecimentoCargaDetalhada || cargaAny.conhecimentoCargaDetalhado;
          
          const mawb = detalhe?.nroMawbAssociado || 
                       detalhe?.mawbAssociado || 
                       (detalhe?.mawbAssociados && detalhe.mawbAssociados[0]?.identificacao);
          
          if (!mawb) {
            // Log apenas para debug, não é erro - alguns houses podem não ter MAWB
            continue;
          }
          
          detailsWithMawb++;
          
          // Gerar variações do MAWB para lookup flexível
          const mawbVariations = generateMawbVariations(mawb);
          const entry: LeadComexEntry = { house, carga, mawb };
          
          for (const variation of mawbVariations) {
            if (!mawbToDataMap.has(variation)) {
              mawbToDataMap.set(variation, entry);
            }
          }
          
          // Delay para não sobrecarregar a API (rate limiting)
          if (detailsFetched % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.error(`[LEADCOMEX] Erro ao buscar detalhes de ${house.hawb}:`, error);
        }
      }
      
      console.log(`[LEADCOMEX] Detalhes buscados: ${detailsFetched}, com MAWB: ${detailsWithMawb}`);
      console.log(`[LEADCOMEX] Mapa de ${mawbToDataMap.size} variações de MAWB criado para match`);
      
      // Debug: logar alguns exemplos de MAWBs da LeadComex
      const sampleMawbs = [...mawbToDataMap.entries()].slice(0, 5).map(([k, v]) => ({ key: k, mawb: v.mawb, hawb: v.house.hawb }));
      console.log(`[LEADCOMEX] Exemplos de MAWBs LeadComex: ${JSON.stringify(sampleMawbs)}`);

      // 3. Buscar HAWBs pendentes do MariaDB (via mariadb-proxy)
      // Esses são os registros do t_status_aereo que precisam de enriquecimento
      console.log(`[LEADCOMEX] Buscando HAWBs pendentes do MariaDB...`);
      
      let shipments: Array<{house: string; master: string; status_manifestacao?: string}> = [];
      try {
        const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'get_cct_pending_hawbs',
            limit: limit,
            prioritize_pending: body.prioritize_pending || false,
            process_all: body.process_all || false,
          }),
        });
        
        if (!proxyResponse.ok) {
          const errorText = await proxyResponse.text();
          console.error(`[LEADCOMEX] Erro ao buscar HAWBs do MariaDB: ${errorText}`);
          throw new Error(`MariaDB proxy error: ${proxyResponse.status}`);
        }
        
        const proxyData = await proxyResponse.json();
        shipments = proxyData.shipments || [];
        console.log(`[LEADCOMEX] ${shipments.length} HAWBs pendentes encontrados no MariaDB`);
      } catch (proxyError) {
        console.error('[LEADCOMEX] Falha ao buscar do MariaDB, tentando Supabase como fallback:', proxyError);
        // Fallback: try Supabase if MariaDB fails
        const { data: sbShipments, error: fetchError } = await supabase
          .from('shipments')
          .select('id, house, master, status_manifestacao')
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (fetchError) {
          throw new Error(`Erro ao buscar shipments: ${fetchError.message}`);
        }
        shipments = (sbShipments || []).map(s => ({ house: s.house, master: s.master, status_manifestacao: s.status_manifestacao }));
      }

      console.log(`[LEADCOMEX] Iniciando matching por MAWB para ${shipments.length} processos`);
      
      // Debug: logar alguns exemplos de MAWBs do MariaDB
      const sampleMariaDb = shipments.slice(0, 5).map(s => ({ house: s.house, master: s.master }));
      console.log(`[LEADCOMEX] Exemplos do MariaDB: ${JSON.stringify(sampleMariaDb)}`);

      const syncStats = {
        total_leadcomex: leadcomexHouses.length,
        total_with_mawb: detailsWithMawb,
        total_mariadb: shipments?.length || 0,
        matched: 0,
        not_matched: 0,
        updated: 0,
        events: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
        matches_detail: [] as Array<{ mariadb_hawb: string; mariadb_mawb: string; leadcomex_hawb: string; leadcomex_mawb: string }>,
      };

      // 4. Para cada shipment, tentar match via MAWB (não mais via HAWB)
      for (const shipment of shipments || []) {
        try {
          // Gerar variações do MAWB do shipment e tentar match
          const mawbVariations = generateMawbVariations(shipment.master);
          let matchedEntry: LeadComexEntry | undefined;
          let matchedVariation = '';
          
          for (const variation of mawbVariations) {
            matchedEntry = mawbToDataMap.get(variation);
            if (matchedEntry) {
              matchedVariation = variation;
              break;
            }
          }

          if (!matchedEntry) {
            syncStats.not_matched++;
            continue;
          }

          syncStats.matched++;
          syncStats.matches_detail.push({
            mariadb_hawb: shipment.house,
            mariadb_mawb: shipment.master,
            leadcomex_hawb: matchedEntry.house.hawb,
            leadcomex_mawb: matchedEntry.mawb,
          });

          console.log(`[LEADCOMEX] Match via MAWB: ${shipment.master} → ${matchedEntry.mawb} (HAWB: ${shipment.house} ↔ ${matchedEntry.house.hawb})`);

          // 5. Processar dados do LeadComex (já temos os dados, não precisa buscar novamente)
          await processLeadComexData(supabase, shipment.house, shipment.master, matchedEntry.carga, syncStats);

        } catch (error) {
          console.error(`[LEADCOMEX] Erro ao processar ${shipment.house}:`, error);
          syncStats.errors++;
        }
      }

      // Log resumo (só log console, não persiste no Supabase)
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

    // =============================================
    // ENRICH REVERSE LADDER: Escada reversa de datas para máxima recuperação
    // =============================================
    if (action === 'enrich-reverse-ladder') {
      const limit = body.limit || 2; // ALTERADO: limite padrão de 2 para debug detalhado
      const maxRetries = body.max_retries || 10;
      const executionSource = body.execution_source || 'cron-hourly';
      const processAll = body.process_all === true; // When true, process ALL HAWBs (not just pending)
      
      console.log(`[LEADCOMEX] ========================================`);
      console.log(`[LEADCOMEX] VERSION: 2026-01-21-v4 - PROCESS_ALL`);
      console.log(`[LEADCOMEX] Enrich Reverse Ladder - LOTE DE ${limit}`);
      console.log(`[LEADCOMEX] max_retries: ${maxRetries} | process_all: ${processAll}`);
      console.log(`[LEADCOMEX] ========================================`);

      // 1. Buscar AWBs pendentes com DEP date do MariaDB
      const hawbFilter = body?.hawb_filter || null;
      let shipments: Array<{house: string; master: string; dep_datetime: string | null}> = [];
      try {
        const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'get_cct_pending_hawbs',
            limit: hawbFilter ? 1 : limit,
            hawb_filter: hawbFilter,
            process_all: processAll, // Propagate to mariadb-proxy
          }),
        });
        
        if (!proxyResponse.ok) {
          const errorText = await proxyResponse.text();
          console.error(`[LEADCOMEX] Erro ao buscar HAWBs: ${errorText}`);
          throw new Error(`MariaDB proxy error: ${proxyResponse.status}`);
        }
        
        const proxyData = await proxyResponse.json();
        shipments = proxyData.shipments || [];
        console.log(`[LEADCOMEX] ${shipments.length} HAWBs ${hawbFilter ? `(filtrado: ${hawbFilter})` : 'pendentes'} encontrados`);
      } catch (proxyError) {
        console.error('[LEADCOMEX] Falha ao buscar HAWBs:', proxyError);
        return new Response(
          JSON.stringify({ success: false, error: 'Falha ao buscar HAWBs pendentes' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (shipments.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Nenhum HAWB pendente para enriquecer',
            stats: { processed: 0, success: 0, failed: 0 },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const syncStats = {
        processed: 0,
        success: 0,
        failed: 0,
        updated: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
        details: [] as Array<{ house: string; success: boolean; offset: number; matched_date: string | null }>,
      };

      // 2. Para cada HAWB, aplicar escada reversa
      for (const shipment of shipments) {
        syncStats.processed++;
        
        // Formatar dep_date para YYYY-MM-DD
        let depDate: string | null = null;
        if (shipment.dep_datetime) {
          try {
            const dt = new Date(shipment.dep_datetime);
            if (!isNaN(dt.getTime())) {
              depDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            }
          } catch {
            console.log(`[LEADCOMEX] dep_datetime inválido para ${shipment.house}: ${shipment.dep_datetime}`);
          }
        }

        // Se não tem dep_date, usar data atual
        if (!depDate) {
          const now = new Date();
          depDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        console.log(`[LEADCOMEX] Processando ${shipment.house} (DEP: ${depDate})`);

        // Executar escada reversa
        const ladderResult = await tryReverseLadder(leadcomexToken, shipment.house, depDate, maxRetries);

        // 3. Salvar log no MariaDB
        try {
          await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'save_leadcomex_log',
              hawb: shipment.house,
              mawb: shipment.master || null,
              dep_date: depDate,
              success: ladderResult.success,
              matched_date: ladderResult.matchedDate,
              offset_days: ladderResult.offsetDays,
              total_attempts: ladderResult.attempts.length,
              total_time_ms: ladderResult.totalTimeMs,
              execution_source: executionSource,
              attempts: ladderResult.attempts,
              leadcomex_data: ladderResult.data || null,
            }),
          });
          console.log(`[LEADCOMEX] Log salvo para ${shipment.house}`);
        } catch (logError) {
          console.error(`[LEADCOMEX] Erro ao salvar log para ${shipment.house}:`, logError);
        }

        // 4. Se encontrou, atualizar dados no MariaDB
        if (ladderResult.success && ladderResult.data) {
          syncStats.success++;
          await processLeadComexData(supabase, shipment.house, shipment.master, ladderResult.data, syncStats);
        } else {
          syncStats.failed++;
        }

        syncStats.details.push({
          house: shipment.house,
          success: ladderResult.success,
          offset: ladderResult.offsetDays,
          matched_date: ladderResult.matchedDate,
        });

        // Delay entre processamentos (100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[LEADCOMEX] Enrich Reverse Ladder concluído:`, syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Escada reversa: ${syncStats.success}/${syncStats.processed} HAWBs encontrados`,
          stats: {
            ...syncStats,
            details: syncStats.details.slice(0, 100),
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =============================================
    // REFRESH ALL ACTIVE: Atualiza todos os HAWBs ativos no CCT (cron 10min)
    // =============================================
    if (action === 'refresh-all-active') {
      const executionSource = body.execution_source || 'cron-10min';
      
      console.log(`[LEADCOMEX] ========================================`);
      console.log(`[LEADCOMEX] REFRESH-ALL-ACTIVE - Polling a cada 10min`);
      console.log(`[LEADCOMEX] Fonte: ${executionSource}`);
      console.log(`[LEADCOMEX] ========================================`);

      // Buscar TODOS os HAWBs ativos no CCT (não apenas pendentes)
      let shipments: Array<{house: string; master: string; dep_datetime: string | null}> = [];
      try {
        const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'get_cct_pending_hawbs',
            limit: 500,
            process_all: true, // Processar TODOS os HAWBs ativos
          }),
        });
        
        if (!proxyResponse.ok) {
          const errorText = await proxyResponse.text();
          console.error(`[LEADCOMEX] Erro ao buscar HAWBs: ${errorText}`);
          throw new Error(`MariaDB proxy error: ${proxyResponse.status}`);
        }
        
        const proxyData = await proxyResponse.json();
        shipments = proxyData.shipments || [];
        console.log(`[LEADCOMEX] ${shipments.length} HAWBs ativos para refresh`);
      } catch (proxyError) {
        console.error('[LEADCOMEX] Falha ao buscar HAWBs:', proxyError);
        return new Response(
          JSON.stringify({ success: false, error: 'Falha ao buscar HAWBs ativos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (shipments.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Nenhum HAWB ativo para atualizar',
            stats: { processed: 0, success: 0, failed: 0 },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const syncStats = {
        processed: 0,
        success: 0,
        failed: 0,
        updated: 0,
        events: 0,
        bloqueios: 0,
        divergencias: 0,
        errors: 0,
      };

      // Processar cada HAWB com escada reversa
      for (const shipment of shipments) {
        syncStats.processed++;
        
        // Formatar dep_date
        let depDate: string | null = null;
        if (shipment.dep_datetime) {
          try {
            const dt = new Date(shipment.dep_datetime);
            if (!isNaN(dt.getTime())) {
              depDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            }
          } catch {
            console.log(`[LEADCOMEX] dep_datetime inválido para ${shipment.house}`);
          }
        }

        if (!depDate) {
          const now = new Date();
          depDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        // Executar escada reversa (até 15 tentativas para polling frequente)
        const ladderResult = await tryReverseLadder(leadcomexToken, shipment.house, depDate, 15);

        // Salvar log
        try {
          await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'save_leadcomex_log',
              hawb: shipment.house,
              mawb: shipment.master || null,
              dep_date: depDate,
              success: ladderResult.success,
              matched_date: ladderResult.matchedDate,
              offset_days: ladderResult.offsetDays,
              total_attempts: ladderResult.attempts.length,
              total_time_ms: ladderResult.totalTimeMs,
              execution_source: executionSource,
              attempts: ladderResult.attempts,
              leadcomex_data: ladderResult.data || null,
            }),
          });
        } catch (logError) {
          console.error(`[LEADCOMEX] Erro ao salvar log para ${shipment.house}:`, logError);
        }

        // Processar dados se encontrou
        if (ladderResult.success && ladderResult.data) {
          syncStats.success++;
          await processLeadComexData(supabase, shipment.house, shipment.master, ladderResult.data, syncStats);
        } else {
          syncStats.failed++;
        }

        // Delay para rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`[LEADCOMEX] Refresh-all-active concluído:`, syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Refresh concluído: ${syncStats.success}/${syncStats.processed} HAWBs atualizados`,
          stats: syncStats,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action inválida. Use: health, sync, enrich, enrich-individual, enrich-reverse-ladder, refresh-all-active' }),
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

// =============================================
// HELPER: Escada Reversa de Datas
// =============================================
interface ReverseLadderAttempt {
  attempt_number: number;
  date: string;
  status: 'not_found' | 'error' | 'found';
  http_status: number;
  response_time_ms: number;
  error_message?: string;
}

interface ReverseLadderResult {
  success: boolean;
  matchedDate: string | null;
  offsetDays: number;
  attempts: ReverseLadderAttempt[];
  totalTimeMs: number;
  data?: LeadComexCarga;
}

function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function tryReverseLadder(
  token: string,
  hawb: string,
  depDate: string,
  maxRetries: number = 10
): Promise<ReverseLadderResult> {
  const attempts: ReverseLadderAttempt[] = [];
  const startTotal = Date.now();
  
  // Gerar variações do HAWB para tentar
  const hawbVariations = generateHawbVariations(hawb);
  console.log(`[LEADCOMEX] Tentando ${hawbVariations.length} variações de HAWB: ${hawbVariations.slice(0, 3).join(', ')}...`);

  // Escada reversa de datas
  for (let i = 0; i <= maxRetries; i++) {
    const testDate = subtractDays(depDate, i);
    
    let attemptResult: ReverseLadderAttempt = {
      attempt_number: i + 1,
      date: testDate,
      status: 'not_found',
      http_status: 204,
      response_time_ms: 0,
    };

    // Tentar cada variação do HAWB
    for (const hawbVariation of hawbVariations) {
      const startAttempt = Date.now();
      
      try {
        const carga = await fetchCargaDetalhada(token, hawbVariation, testDate);
        const responseTime = Date.now() - startAttempt;
        attemptResult.response_time_ms = responseTime;
        
        if (carga) {
          attemptResult.status = 'found';
          attemptResult.http_status = 200;
          console.log(`[LEADCOMEX] ENCONTRADO ${hawb} → ${hawbVariation} em ${testDate} (offset: ${i})`);
          
          attempts.push(attemptResult);
          
          return {
            success: true,
            matchedDate: testDate,
            offsetDays: i,
            attempts,
            totalTimeMs: Date.now() - startTotal,
            data: carga,
          };
        }
      } catch (error) {
        attemptResult.status = 'error';
        attemptResult.http_status = 0;
        attemptResult.error_message = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    attempts.push(attemptResult);

    // Delay entre tentativas (100ms)
    if (i < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`[LEADCOMEX] ${hawb} não encontrado após ${attempts.length} tentativas`);
  
  return {
    success: false,
    matchedDate: null,
    offsetDays: 0,
    attempts,
    totalTimeMs: Date.now() - startTotal,
  };
}
