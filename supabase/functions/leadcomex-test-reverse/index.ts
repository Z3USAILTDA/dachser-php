import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEADCOMEX_API_URL = 'https://api.leadcomex.com.br';

interface AttemptLog {
  attempt_number: number;
  date: string;
  status: 'not_found' | 'error' | 'found';
  http_status: number;
  response_time_ms: number;
  error_message?: string;
  full_response?: any;
}

interface TestResult {
  success: boolean;
  hawb: string;
  original_dep_date: string;
  matched_date: string | null;
  offset_days: number;
  total_attempts: number;
  total_time_ms: number;
  attempts: AttemptLog[];
  data?: any;
}

// Formata data para YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Subtrai dias de uma data
function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

// Normaliza HAWB removendo hífens, pontos, espaços
function normalizeHawb(hawb: string): string {
  if (!hawb) return '';
  return hawb.trim().toUpperCase().replace(/[\s\-_\.\/\\]+/g, '');
}

// Gera variações do HAWB para matching
function generateHawbVariations(hawb: string): string[] {
  const variations: Set<string> = new Set();
  if (!hawb) return [];
  
  const original = hawb.trim().toUpperCase();
  variations.add(original);
  
  const normalized = normalizeHawb(hawb);
  variations.add(normalized);
  
  // Sem prefixo de aeroporto
  const withoutPrefix = original.replace(/^[A-Z]{2,4}[\-_]?/, '');
  variations.add(withoutPrefix);
  variations.add(normalizeHawb(withoutPrefix));
  
  // Parte numérica
  const numericPart = original.replace(/\D/g, '');
  if (numericPart.length >= 6) {
    variations.add(numericPart);
    if (numericPart.length > 8) {
      variations.add(numericPart.slice(-8));
    }
  }
  
  return [...variations].filter(v => v.length > 0);
}

// Tenta buscar HAWB na LeadComex com uma data específica
async function tryFetchHawb(
  token: string, 
  hawb: string, 
  dataEmissao: string
): Promise<{ found: boolean; status: number; data?: any; error?: string; responseTime: number }> {
  const url = new URL(`${LEADCOMEX_API_URL}/api/ext/conhecimentos-carga`);
  url.searchParams.append('hawb', hawb);
  url.searchParams.append('dataEmissao', dataEmissao);
  url.searchParams.append('exibirCargaDetalhada', 'true');

  const startTime = Date.now();
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Token': token,
        'Content-Type': 'application/json',
      },
    });
    const responseTime = Date.now() - startTime;

    if (response.status === 204) {
      return { found: false, status: 204, responseTime };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        found: false, 
        status: response.status, 
        error: errorText.substring(0, 200),
        responseTime 
      };
    }

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : data;
    
    if (!result) {
      return { found: false, status: 204, responseTime };
    }

    return { found: true, status: 200, data: result, responseTime };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return { 
      found: false, 
      status: 0, 
      error: error instanceof Error ? error.message : 'Connection error',
      responseTime 
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hawb, dep_date, max_retries = 30 } = await req.json();

    if (!hawb || !dep_date) {
      return new Response(
        JSON.stringify({ error: 'hawb e dep_date são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = Deno.env.get('LEADCOMEX_API_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token LeadComex não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LEADCOMEX-TEST] Iniciando teste para HAWB ${hawb} a partir de ${dep_date}`);
    
    const attempts: AttemptLog[] = [];
    const startTotal = Date.now();
    let matchedDate: string | null = null;
    let foundData: any = null;

    // Gera variações do HAWB para tentar
    const hawbVariations = generateHawbVariations(hawb);
    console.log(`[LEADCOMEX-TEST] Variações de HAWB a tentar: ${hawbVariations.join(', ')}`);

    // Escada reversa de datas
    for (let i = 0; i <= max_retries; i++) {
      const testDate = subtractDays(dep_date, i);
      
      console.log(`[LEADCOMEX-TEST] Tentativa ${i + 1}: Data ${testDate}`);
      
      let attemptResult: AttemptLog = {
        attempt_number: i + 1,
        date: testDate,
        status: 'not_found',
        http_status: 204,
        response_time_ms: 0,
        full_response: null,
      };

      // Tentar cada variação do HAWB
      for (const hawbVariation of hawbVariations) {
        const result = await tryFetchHawb(token, hawbVariation, testDate);
        
        attemptResult.response_time_ms = result.responseTime;
        attemptResult.http_status = result.status;
        
        if (result.found && result.data) {
          attemptResult.status = 'found';
          attemptResult.full_response = result.data;
          matchedDate = testDate;
          foundData = result.data;
          console.log(`[LEADCOMEX-TEST] ENCONTRADO com variação ${hawbVariation} na data ${testDate}`);
          break;
        } else if (result.error) {
          attemptResult.status = 'error';
          attemptResult.error_message = result.error;
          attemptResult.full_response = { error: result.error, status: result.status };
        } else {
          // 204 No Content
          attemptResult.full_response = { 
            message: 'Nenhum dado encontrado (204 No Content)', 
            hawb_tested: hawbVariation,
            date_tested: testDate 
          };
        }
      }

      attempts.push(attemptResult);

      // Se encontrou, para a escada
      if (attemptResult.status === 'found') {
        break;
      }

      // Delay entre tentativas (500ms)
      if (i < max_retries) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalTime = Date.now() - startTotal;
    
    const result: TestResult = {
      success: matchedDate !== null,
      hawb,
      original_dep_date: dep_date,
      matched_date: matchedDate,
      offset_days: matchedDate ? Math.floor((new Date(dep_date).getTime() - new Date(matchedDate).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      total_attempts: attempts.length,
      total_time_ms: totalTime,
      attempts,
      data: foundData,
    };

    console.log(`[LEADCOMEX-TEST] Resultado: ${result.success ? 'ENCONTRADO' : 'NÃO ENCONTRADO'} após ${attempts.length} tentativas`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LEADCOMEX-TEST] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
