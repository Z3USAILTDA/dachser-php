import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helpers
function normFlight(s: string): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidFlight(f: string): boolean {
  const n = normFlight(f);
  return /^(?:[A-Z]{2,3}|[0-9][A-Z])[0-9]{1,4}[A-Z]?$/.test(n);
}

function parseFlightsCsv(csv: string): string[] {
  const parts = csv.split(',').map(s => s.trim()).filter(Boolean);
  const valid: string[] = [];
  for (const p of parts) {
    const n = normFlight(p);
    if (n && n !== '0' && isValidFlight(n) && !valid.includes(n)) {
      valid.push(n);
    }
  }
  return valid;
}

// Normaliza códigos de armadores da API para nomes legíveis no banco
function normalizeShippingLine(code: string): string {
  const map: Record<string, string> = {
    'CMA_CGM': 'CMA CGM',
    'HAPAG_LLOYD': 'HAPAG-LLOYD',
    'YANG_MING': 'YANG MING',
  };
  return map[code] || code;
}

// Converte nomes legíveis de volta para código da API JSONCargo
function toApiShippingLine(displayName: string): string {
  const map: Record<string, string> = {
    'CMA CGM': 'CMA_CGM',
    'HAPAG-LLOYD': 'HAPAG_LLOYD',
    'YANG MING': 'YANG_MING',
  };
  return map[displayName] || displayName;
}

// Dicionário de coordenadas de portos conhecidos (fallback quando JSONCARGO não retorna)
const PORT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  // Brasil
  'SANTOS': { lat: -23.9618, lon: -46.3322 },
  'BRSSZ': { lat: -23.9618, lon: -46.3322 },
  'PARANAGUA': { lat: -25.5166, lon: -48.5110 },
  'BRPNG': { lat: -25.5166, lon: -48.5110 },
  'RIO GRANDE': { lat: -32.0351, lon: -52.0986 },
  'BRRIG': { lat: -32.0351, lon: -52.0986 },
  'ITAJAI': { lat: -26.9078, lon: -48.6619 },
  'BRITJ': { lat: -26.9078, lon: -48.6619 },
  'NAVEGANTES': { lat: -26.8978, lon: -48.6447 },
  'BRNVT': { lat: -26.8978, lon: -48.6447 },
  'ITAPOA': { lat: -26.1167, lon: -48.6167 },
  'BRIOA': { lat: -26.1167, lon: -48.6167 },
  'RIO DE JANEIRO': { lat: -22.8908, lon: -43.1729 },
  'BRRIO': { lat: -22.8908, lon: -43.1729 },
  'VITORIA': { lat: -20.3155, lon: -40.2922 },
  'BRVIX': { lat: -20.3155, lon: -40.2922 },
  'SALVADOR': { lat: -12.9714, lon: -38.5014 },
  'BRSSA': { lat: -12.9714, lon: -38.5014 },
  'SUAPE': { lat: -8.3936, lon: -34.9506 },
  'BRSUA': { lat: -8.3936, lon: -34.9506 },
  'PECEM': { lat: -3.5328, lon: -38.7922 },
  'BRPEC': { lat: -3.5328, lon: -38.7922 },
  'MANAUS': { lat: -3.1019, lon: -60.0250 },
  'BRMAO': { lat: -3.1019, lon: -60.0250 },
  // China
  'SHANGHAI': { lat: 31.2304, lon: 121.4737 },
  'CNSHA': { lat: 31.2304, lon: 121.4737 },
  'NINGBO': { lat: 29.8683, lon: 121.5440 },
  'CNNGB': { lat: 29.8683, lon: 121.5440 },
  'SHENZHEN': { lat: 22.5431, lon: 114.0579 },
  'CNSZX': { lat: 22.5431, lon: 114.0579 },
  'YANTIAN': { lat: 22.5805, lon: 114.2825 },
  'CNYTN': { lat: 22.5805, lon: 114.2825 },
  'QINGDAO': { lat: 36.0671, lon: 120.3826 },
  'CNTAO': { lat: 36.0671, lon: 120.3826 },
  'XIAMEN': { lat: 24.4798, lon: 118.0894 },
  'CNXMN': { lat: 24.4798, lon: 118.0894 },
  'GUANGZHOU': { lat: 23.1291, lon: 113.2644 },
  'CNCAN': { lat: 23.1291, lon: 113.2644 },
  'HONG KONG': { lat: 22.3193, lon: 114.1694 },
  'HKHKG': { lat: 22.3193, lon: 114.1694 },
  'TIANJIN': { lat: 38.9965, lon: 117.7327 },
  'CNTSN': { lat: 38.9965, lon: 117.7327 },
  'DALIAN': { lat: 38.9140, lon: 121.6147 },
  'CNDLC': { lat: 38.9140, lon: 121.6147 },
  // Ásia
  'SINGAPORE': { lat: 1.2897, lon: 103.8501 },
  'SGSIN': { lat: 1.2897, lon: 103.8501 },
  'BUSAN': { lat: 35.1028, lon: 129.0403 },
  'KRPUS': { lat: 35.1028, lon: 129.0403 },
  'TOKYO': { lat: 35.6762, lon: 139.6503 },
  'JPTYO': { lat: 35.6762, lon: 139.6503 },
  'YOKOHAMA': { lat: 35.4437, lon: 139.6380 },
  'JPYOK': { lat: 35.4437, lon: 139.6380 },
  'KAOHSIUNG': { lat: 22.6163, lon: 120.2661 },
  'TWKHH': { lat: 22.6163, lon: 120.2661 },
  'BANGKOK': { lat: 13.7563, lon: 100.5018 },
  'THBKK': { lat: 13.7563, lon: 100.5018 },
  'LAEM CHABANG': { lat: 13.0827, lon: 100.8837 },
  'THLCH': { lat: 13.0827, lon: 100.8837 },
  'HO CHI MINH': { lat: 10.7769, lon: 106.7009 },
  'VNSGN': { lat: 10.7769, lon: 106.7009 },
  'HAIPHONG': { lat: 20.8449, lon: 106.6881 },
  'VNHPH': { lat: 20.8449, lon: 106.6881 },
  'MANILA': { lat: 14.5995, lon: 120.9842 },
  'PHMNL': { lat: 14.5995, lon: 120.9842 },
  'PORT KLANG': { lat: 3.0319, lon: 101.4101 },
  'MYPKG': { lat: 3.0319, lon: 101.4101 },
  'TANJUNG PELEPAS': { lat: 1.3667, lon: 103.5500 },
  'MYTPP': { lat: 1.3667, lon: 103.5500 },
  'COLOMBO': { lat: 6.9271, lon: 79.8612 },
  'LKCMB': { lat: 6.9271, lon: 79.8612 },
  'MUNDRA': { lat: 22.8396, lon: 69.7050 },
  'INMUN': { lat: 22.8396, lon: 69.7050 },
  'NHAVA SHEVA': { lat: 18.9500, lon: 72.9500 },
  'INNSA': { lat: 18.9500, lon: 72.9500 },
  // Europa
  'ROTTERDAM': { lat: 51.9225, lon: 4.4792 },
  'NLRTM': { lat: 51.9225, lon: 4.4792 },
  'ANTWERP': { lat: 51.2194, lon: 4.4025 },
  'BEANR': { lat: 51.2194, lon: 4.4025 },
  'HAMBURG': { lat: 53.5511, lon: 9.9937 },
  'DEHAM': { lat: 53.5511, lon: 9.9937 },
  'BREMERHAVEN': { lat: 53.5396, lon: 8.5809 },
  'DEBRV': { lat: 53.5396, lon: 8.5809 },
  'LE HAVRE': { lat: 49.4944, lon: 0.1079 },
  'FRLEH': { lat: 49.4944, lon: 0.1079 },
  'VALENCIA': { lat: 39.4699, lon: -0.3763 },
  'ESVLC': { lat: 39.4699, lon: -0.3763 },
  'BARCELONA': { lat: 41.3851, lon: 2.1734 },
  'ESBCN': { lat: 41.3851, lon: 2.1734 },
  'FELIXSTOWE': { lat: 51.9607, lon: 1.3056 },
  'GBFXT': { lat: 51.9607, lon: 1.3056 },
  'SOUTHAMPTON': { lat: 50.8998, lon: -1.4044 },
  'GBSOU': { lat: 50.8998, lon: -1.4044 },
  'PIRAEUS': { lat: 37.9488, lon: 23.6428 },
  'GRPIR': { lat: 37.9488, lon: 23.6428 },
  'GENOA': { lat: 44.4056, lon: 8.9463 },
  'ITGOA': { lat: 44.4056, lon: 8.9463 },
  // América do Norte
  'LOS ANGELES': { lat: 33.7405, lon: -118.2607 },
  'USLAX': { lat: 33.7405, lon: -118.2607 },
  'LONG BEACH': { lat: 33.7675, lon: -118.1892 },
  'USLGB': { lat: 33.7675, lon: -118.1892 },
  'NEW YORK': { lat: 40.6892, lon: -74.0445 },
  'USNYC': { lat: 40.6892, lon: -74.0445 },
  'SAVANNAH': { lat: 32.0809, lon: -81.0912 },
  'USSAV': { lat: 32.0809, lon: -81.0912 },
  'HOUSTON': { lat: 29.7604, lon: -95.3698 },
  'USHOU': { lat: 29.7604, lon: -95.3698 },
  'MIAMI': { lat: 25.7617, lon: -80.1918 },
  'USMIA': { lat: 25.7617, lon: -80.1918 },
  'CHARLESTON': { lat: 32.7833, lon: -79.9333 },
  'USCHS': { lat: 32.7833, lon: -79.9333 },
  'SEATTLE': { lat: 47.6062, lon: -122.3321 },
  'USSEA': { lat: 47.6062, lon: -122.3321 },
  'VANCOUVER': { lat: 49.2827, lon: -123.1207 },
  'CAVAN': { lat: 49.2827, lon: -123.1207 },
  // América do Sul (outros)
  'BUENOS AIRES': { lat: -34.6037, lon: -58.3816 },
  'ARBUE': { lat: -34.6037, lon: -58.3816 },
  'MONTEVIDEO': { lat: -34.9011, lon: -56.1645 },
  'UYMVD': { lat: -34.9011, lon: -56.1645 },
  'CALLAO': { lat: -12.0464, lon: -77.0428 },
  'PECLL': { lat: -12.0464, lon: -77.0428 },
  'VALPARAISO': { lat: -33.0458, lon: -71.6197 },
  'CLVAP': { lat: -33.0458, lon: -71.6197 },
  'SAN ANTONIO': { lat: -33.5929, lon: -71.6217 },
  'CLSAI': { lat: -33.5929, lon: -71.6217 },
  'CARTAGENA': { lat: 10.3910, lon: -75.4794 },
  'COCTG': { lat: 10.3910, lon: -75.4794 },
  // Oriente Médio
  'JEBEL ALI': { lat: 25.0069, lon: 55.0606 },
  'AEJEA': { lat: 25.0069, lon: 55.0606 },
  'DUBAI': { lat: 25.2048, lon: 55.2708 },
  'AEDXB': { lat: 25.2048, lon: 55.2708 },
  // Hub Transshipment
  'KINGSTON': { lat: 17.9821, lon: -76.8409 },
  'JMKIN': { lat: 17.9821, lon: -76.8409 },
  'PANAMA': { lat: 9.0019, lon: -79.5012 },
  'PAPTY': { lat: 9.0019, lon: -79.5012 },
  'COLON': { lat: 9.3590, lon: -79.9012 },
  'PACOL': { lat: 9.3590, lon: -79.9012 },
  'FREEPORT': { lat: 26.5285, lon: -78.6967 },
  'BSFPO': { lat: 26.5285, lon: -78.6967 },
  'ALGECIRAS': { lat: 36.1408, lon: -5.4536 },
  'ESALG': { lat: 36.1408, lon: -5.4536 },
  'TANGER MED': { lat: 35.8833, lon: -5.5000 },
  'MATNG': { lat: 35.8833, lon: -5.5000 },
  'SALALAH': { lat: 17.0151, lon: 54.0924 },
  'OMSLL': { lat: 17.0151, lon: 54.0924 },
};

// Função para buscar coordenadas de porto
function getPortCoordinates(portCode: string): { lat: number; lon: number } | null {
  const code = (portCode || '').toUpperCase().trim();
  return PORT_COORDINATES[code] || null;
}

// Helper to log API calls asynchronously (fire-and-forget)
async function logApiCall(
  api_name: string,
  endpoint: string,
  method: string,
  status_code: number,
  response_time_ms: number,
  error_message?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'log_api_call',
        api_name,
        endpoint,
        method,
        status_code,
        response_time_ms,
        error_message,
        edge_function: 'olimpo-proxy'
      }),
    });
  } catch (e) {
    // Silently fail - logging should not break main flow
    console.error('[logApiCall] Failed to log:', e);
  }
}

async function curlJson(url: string, headers: Record<string, string> = {}, timeout = 25000): Promise<any> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(id);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      json.__status = res.status;
      return json;
    } catch {
      return { __curl_error: 'invalid_json', __status: res.status, __raw: text };
    }
  } catch (e: any) {
    return { __curl_error: e.message || 'curl_failed', __status: 0 };
  }
}

async function jcJson(url: string, qs: Record<string, string> = {}, timeout = 25000): Promise<any> {
  // FLAG: JsonCargo REATIVADO
  const JSONCARGO_DISABLED = false;
  if (JSONCARGO_DISABLED) {
    console.log('[jcJson] JsonCargo desativado até segunda ordem');
    return { __curl_error: 'jsoncargo_disabled', disabled: true };
  }
  
  const apiKey = Deno.env.get('JSONCARGO_API_KEY');
  if (!apiKey) return { __curl_error: 'no_api_key' };
  
  const params = new URLSearchParams(qs);
  const fullUrl = params.toString() ? `${url}?${params}` : url;
  
  const startTime = Date.now();
  const result = await curlJson(fullUrl, {
    'x-api-key': apiKey,
    'Accept': 'application/json'
  }, timeout);
  const elapsed = Date.now() - startTime;
  
  // Log the API call asynchronously
  logApiCall(
    'JSONCargo',
    url.replace('http://api.jsoncargo.com', ''),
    'GET',
    result.__status || 0,
    elapsed,
    result.__curl_error || (result.error ? JSON.stringify(result.error) : undefined)
  );
  
  return result;
}

// Helper function for retrying JSONCargo API calls with backoff on timeout
async function jcJsonWithRetry(
  url: string, 
  qs: Record<string, string> = {}, 
  timeout = 25000,
  maxRetries = 2,
  backoffMs = 2000
): Promise<any> {
  let lastResult: any = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await jcJson(url, qs, timeout);
    lastResult = result;
    
    // Check if this is a timeout/abort error that we should retry
    const isTimeoutError = result.__curl_error && (
      result.__curl_error.includes('abort') || 
      result.__curl_error.includes('timeout') ||
      result.__curl_error.includes('signal')
    );
    
    if (isTimeoutError && attempt < maxRetries) {
      console.log(`[jcJsonWithRetry] Timeout on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoffMs}ms...`);
      await new Promise(r => setTimeout(r, backoffMs));
      continue;
    }
    
    // Either success or non-retriable error
    return result;
  }
  
  return lastResult;
}

// Cache de IMO de navios já buscados (durante o batch de re-rastreio)
const vesselImoCache = new Map<string, string | null>();

async function findVesselImo(vesselName: string): Promise<string | null> {
  if (!vesselName) return null;
  
  // Normaliza o nome do navio
  const normalizedName = vesselName.toUpperCase().trim();
  
  // Verifica cache primeiro
  if (vesselImoCache.has(normalizedName)) {
    const cached = vesselImoCache.get(normalizedName);
    console.log(`[findVesselImo] Cache hit for "${vesselName}": ${cached || 'null'}`);
    return cached || null;
  }
  
  try {
    console.log(`[findVesselImo] Searching IMO for vessel "${vesselName}"...`);
    
    const res = await jcJson('http://api.jsoncargo.com/api/v1/vessel/finder', { 
      name: normalizedName, 
      fuzzy: '1' 
    }, 10000);
    
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      // Pega o primeiro resultado
      const vessel = res.data[0];
      const imo = vessel.imo || vessel.vessel_imo || vessel.IMO || null;
      vesselImoCache.set(normalizedName, imo);
      console.log(`[findVesselImo] Found IMO ${imo} for vessel "${vesselName}" (${res.data.length} results)`);
      return imo;
    }
    
    vesselImoCache.set(normalizedName, null);
    console.log(`[findVesselImo] No IMO found for vessel "${vesselName}"`);
    return null;
  } catch (e: any) {
    console.error(`[findVesselImo] Error searching for "${vesselName}":`, e.message || e);
    vesselImoCache.set(normalizedName, null);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    
    // Also check body for action (for POST requests from supabase.functions.invoke)
    let bodyData: any = null;
    if (!action && req.method === 'POST') {
      try {
        const clonedReq = req.clone();
        bodyData = await clonedReq.json();
        if (bodyData?.action) {
          action = bodyData.action;
        }
      } catch {
        // Not JSON body, ignore
      }
    }

    console.log(`[olimpo-proxy] Action: ${action}`);

    // ===== SEED_ALL: Leitura unificada da tabela centralizada t_olimpo_tracking =====
    if (action === 'seed_all') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        const rows = await client.query(`
          SELECT 
            id, mode, asset, flight, tipo_processo, cliente,
            origem_code, destino_code, origem_lat, origem_lon,
            destino_lat, destino_lon, status, eta, ata, etd, atd,
            current_lat, current_lon,
            vessel_name, shipping_line, container_status,
            last_api_update, active, updated_at
          FROM dados_dachser.t_olimpo_tracking
          WHERE active = TRUE
          ORDER BY updated_at DESC
        `);

        const out = rows.map((r: any) => ({
          id: r.id,
          mode: r.mode,
          asset: r.asset,
          flight: r.flight,
          tipo_processo: r.tipo_processo,
          cliente: r.cliente || 'N/A',
          origem_code: r.origem_code,
          destino_code: r.destino_code,
          origem_lat: r.origem_lat ? Number(r.origem_lat) : null,
          origem_lon: r.origem_lon ? Number(r.origem_lon) : null,
          destino_lat: r.destino_lat ? Number(r.destino_lat) : null,
          destino_lon: r.destino_lon ? Number(r.destino_lon) : null,
          status: r.status || 'Em trânsito',
          eta: r.eta,
          ata: r.ata,
          etd: r.etd,
          atd: r.atd,
          current_lat: r.current_lat ? Number(r.current_lat) : null,
          current_lon: r.current_lon ? Number(r.current_lon) : null,
          vessel_name: r.vessel_name,
          shipping_line: r.shipping_line,
          container_status: r.container_status,
          last_api_update: r.last_api_update,
          updated_at: r.updated_at,
        }));

        await client.close();
        console.log(`[seed_all] Returning ${out.length} items from t_olimpo_tracking`);
        return new Response(JSON.stringify({ 
          data: out,
          counts: {
            total: out.length,
            air: out.filter((x: any) => x.mode === 'air').length,
            sea: out.filter((x: any) => x.mode === 'sea').length,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[seed_all] Error:', e);
        return new Response(JSON.stringify({ error: 'Falha seed_all', detail: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA: seed do banco de containers =====
    if (action === 'sea_seed') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        const rows = await client.query(
          `SELECT DISTINCT container, consignee FROM ai_agente.t_dachser_sea_items WHERE TRIM(container) <> ''`
        );
        
        const out: any[] = [];
        for (const r of rows) {
          const c = String(r.container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (c.length < 7) continue;
          let cons = String(r.consignee || '');
          cons = cons.split('(')[0].trim();
          cons = cons.replace(/\d+/g, '').trim();
          out.push({ container: c, cliente: cons });
        }

        await client.close();
        return new Response(JSON.stringify({ data: out }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[sea_seed] Error:', e);
        return new Response(JSON.stringify({ error: 'Falha sea_seed', detail: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA SMART: Cache inteligente com atualização seletiva =====
    if (action === 'sea_seed_smart') {
      // FLAG: Chamadas JSONCargo ATIVADAS para tracking de todos armadores
      const SKIP_API_CALLS = false;
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');
      const apiKey = SKIP_API_CALLS ? null : Deno.env.get('JSONCARGO_API_KEY');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        // Criar tabela de cache se não existir
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_sea_tracking_cache (
            id INT AUTO_INCREMENT PRIMARY KEY,
            container VARCHAR(20) NOT NULL UNIQUE,
            consignee VARCHAR(255),
            loading_port VARCHAR(100),
            discharging_port VARCHAR(100),
            container_status VARCHAR(100),
            eta_final_destination DATETIME,
            atd_origin DATETIME,
            last_movement_timestamp DATETIME,
            origin_lat DECIMAL(10,6),
            origin_lon DECIMAL(10,6),
            origin_unlocode VARCHAR(10),
            dest_lat DECIMAL(10,6),
            dest_lon DECIMAL(10,6),
            dest_unlocode VARCHAR(10),
            vessel_name VARCHAR(100),
            vessel_lat DECIMAL(10,6),
            vessel_lon DECIMAL(10,6),
            last_api_update DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        // Buscar containers ativos
        const containers = await client.query(
          `SELECT DISTINCT container, consignee FROM ai_agente.t_dachser_sea_items WHERE TRIM(container) <> '' AND active = 1`
        );

        const nowTs = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const results: any[] = [];
        let apiCallCount = 0;
        let cacheHitCount = 0;

        for (const row of containers) {
          const containerId = String(row.container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (containerId.length < 7) continue;

          let consignee = String(row.consignee || '');
          consignee = consignee.split('(')[0].trim().replace(/\d+/g, '').trim();

          // Verificar cache
          const cached = await client.query(
            `SELECT * FROM ai_agente.t_dachser_sea_tracking_cache WHERE container = ?`,
            [containerId]
          );

          let useCache = false;
          let cacheRow = cached[0] || null;

          if (cacheRow) {
            const etaTs = cacheRow.eta_final_destination ? new Date(cacheRow.eta_final_destination).getTime() : null;
            const lastApiTs = cacheRow.last_api_update ? new Date(cacheRow.last_api_update).getTime() : 0;
            const statusLower = (cacheRow.container_status || '').toLowerCase();
            const isDelivered = /delivered|gate out|empty received/.test(statusLower);

            // Regras de cache:
            // 1. Status "Entregue" há mais de 24h → usar cache permanente
            // 2. ETA > 7 dias do futuro → usar cache
            // 3. ETA entre 1-7 dias → atualizar 1x por dia
            // 4. ETA < 24h → sempre atualizar
            if (isDelivered && lastApiTs && (nowTs - lastApiTs > ONE_DAY_MS)) {
              useCache = true; // Entregue há mais de 1 dia, cache permanente
            } else if (etaTs && (etaTs - nowTs > SEVEN_DAYS_MS)) {
              useCache = true; // ETA > 7 dias, usar cache
            } else if (etaTs && (etaTs - nowTs > ONE_DAY_MS) && (nowTs - lastApiTs < ONE_DAY_MS)) {
              useCache = true; // ETA entre 1-7 dias e já atualizou hoje
            }
            // Se ETA < 24h, sempre atualiza (useCache = false)
          }

          if (useCache && cacheRow) {
            cacheHitCount++;
            results.push({
              container: containerId,
              cliente: consignee,
              loading_port: cacheRow.loading_port,
              discharging_port: cacheRow.discharging_port,
              container_status: cacheRow.container_status,
              eta_final_destination: cacheRow.eta_final_destination,
              atd_origin: cacheRow.atd_origin,
              last_movement_timestamp: cacheRow.last_movement_timestamp,
              origin_lat: cacheRow.origin_lat ? Number(cacheRow.origin_lat) : null,
              origin_lon: cacheRow.origin_lon ? Number(cacheRow.origin_lon) : null,
              origin_unlocode: cacheRow.origin_unlocode,
              dest_lat: cacheRow.dest_lat ? Number(cacheRow.dest_lat) : null,
              dest_lon: cacheRow.dest_lon ? Number(cacheRow.dest_lon) : null,
              dest_unlocode: cacheRow.dest_unlocode,
              vessel_name: cacheRow.vessel_name,
              vessel_lat: cacheRow.vessel_lat ? Number(cacheRow.vessel_lat) : null,
              vessel_lon: cacheRow.vessel_lon ? Number(cacheRow.vessel_lon) : null,
              from_cache: true,
              last_api_update: cacheRow.last_api_update
            });
            continue;
          }

          // Se não usar cache ou não existir, chamar API (com limite de rate)
          if (!apiKey) {
            // Sem API key, usar dados básicos do cache ou retornar sem tracking
            results.push({
              container: containerId,
              cliente: consignee,
              loading_port: cacheRow?.loading_port || null,
              discharging_port: cacheRow?.discharging_port || null,
              container_status: cacheRow?.container_status || 'Sem tracking',
              eta_final_destination: cacheRow?.eta_final_destination || null,
              atd_origin: null,
              last_movement_timestamp: null,
              origin_lat: cacheRow?.origin_lat ? Number(cacheRow.origin_lat) : null,
              origin_lon: cacheRow?.origin_lon ? Number(cacheRow.origin_lon) : null,
              origin_unlocode: cacheRow?.origin_unlocode || null,
              dest_lat: cacheRow?.dest_lat ? Number(cacheRow.dest_lat) : null,
              dest_lon: cacheRow?.dest_lon ? Number(cacheRow.dest_lon) : null,
              dest_unlocode: cacheRow?.dest_unlocode || null,
              vessel_name: null,
              vessel_lat: null,
              vessel_lon: null,
              from_cache: !!cacheRow,
              no_api_key: true
            });
            continue;
          }

          // Limitar chamadas de API para evitar rate limit (10 por batch)
          if (apiCallCount >= 10) {
            // Já atingiu limite, usar cache ou dados básicos
            results.push({
              container: containerId,
              cliente: consignee,
              loading_port: cacheRow?.loading_port || null,
              discharging_port: cacheRow?.discharging_port || null,
              container_status: cacheRow?.container_status || 'Aguardando',
              eta_final_destination: cacheRow?.eta_final_destination || null,
              atd_origin: cacheRow?.atd_origin || null,
              last_movement_timestamp: cacheRow?.last_movement_timestamp || null,
              origin_lat: cacheRow?.origin_lat ? Number(cacheRow.origin_lat) : null,
              origin_lon: cacheRow?.origin_lon ? Number(cacheRow.origin_lon) : null,
              origin_unlocode: cacheRow?.origin_unlocode || null,
              dest_lat: cacheRow?.dest_lat ? Number(cacheRow.dest_lat) : null,
              dest_lon: cacheRow?.dest_lon ? Number(cacheRow.dest_lon) : null,
              dest_unlocode: cacheRow?.dest_unlocode || null,
              vessel_name: cacheRow?.vessel_name || null,
              vessel_lat: cacheRow?.vessel_lat ? Number(cacheRow.vessel_lat) : null,
              vessel_lon: cacheRow?.vessel_lon ? Number(cacheRow.vessel_lon) : null,
              from_cache: !!cacheRow,
              rate_limited: true
            });
            continue;
          }

          // Chamar API JSONCargo
          apiCallCount++;
          const cdetRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, {}, 15000);
          
          if (cdetRes.__curl_error || cdetRes.__status === 429) {
            // Rate limit ou erro, usar cache se disponível
            results.push({
              container: containerId,
              cliente: consignee,
              loading_port: cacheRow?.loading_port || null,
              discharging_port: cacheRow?.discharging_port || null,
              container_status: cacheRow?.container_status || 'Erro API',
              eta_final_destination: cacheRow?.eta_final_destination || null,
              atd_origin: cacheRow?.atd_origin || null,
              last_movement_timestamp: cacheRow?.last_movement_timestamp || null,
              origin_lat: cacheRow?.origin_lat ? Number(cacheRow.origin_lat) : null,
              origin_lon: cacheRow?.origin_lon ? Number(cacheRow.origin_lon) : null,
              origin_unlocode: cacheRow?.origin_unlocode || null,
              dest_lat: cacheRow?.dest_lat ? Number(cacheRow.dest_lat) : null,
              dest_lon: cacheRow?.dest_lon ? Number(cacheRow.dest_lon) : null,
              dest_unlocode: cacheRow?.dest_unlocode || null,
              vessel_name: cacheRow?.vessel_name || null,
              vessel_lat: cacheRow?.vessel_lat ? Number(cacheRow.vessel_lat) : null,
              vessel_lon: cacheRow?.vessel_lon ? Number(cacheRow.vessel_lon) : null,
              from_cache: !!cacheRow,
              api_error: cdetRes.__curl_error || 'rate_limit'
            });
            continue;
          }

          const cdet = cdetRes?.data || cdetRes;
          const loadingPort = cdet?.loading_port || cdet?.shipped_from || null;
          const dischargingPort = cdet?.discharging_port || cdet?.shipped_to || null;
          const containerStatus = cdet?.container_status || null;
          const etaFinal = cdet?.eta_final_destination || null;
          const atdOrigin = cdet?.atd_origin || null;
          const lastMovement = cdet?.last_movement_timestamp || null;
          const vesselName = cdet?.current_vessel_name || cdet?.last_vessel_name || null;

          // Buscar coordenadas de portos
          let originLat: number | null = null, originLon: number | null = null, originUnlocode: string | null = null;
          let destLat: number | null = null, destLon: number | null = null, destUnlocode: string | null = null;

          if (loadingPort) {
            const prRes = await jcJson('http://api.jsoncargo.com/api/v1/port/find', { name: loadingPort, fuzzy: '1' }, 10000);
            const p = Array.isArray(prRes?.data) ? prRes.data[0] : null;
            if (p) {
              originLat = +p.lat || null;
              originLon = +p.lon || null;
              originUnlocode = p.unlocode || p.port_code || null;
            }
          }

          if (dischargingPort) {
            const prRes = await jcJson('http://api.jsoncargo.com/api/v1/port/find', { name: dischargingPort, fuzzy: '1' }, 10000);
            const p = Array.isArray(prRes?.data) ? prRes.data[0] : null;
            if (p) {
              destLat = +p.lat || null;
              destLon = +p.lon || null;
              destUnlocode = p.unlocode || p.port_code || null;
            }
          }

          // Buscar posição do navio
          let vesselLat: number | null = null, vesselLon: number | null = null;
          if (vesselName) {
            const vfRes = await jcJson('http://api.jsoncargo.com/api/v1/vessel/finder', { name: vesselName, fuzzy: '1' }, 10000);
            const vRow = Array.isArray(vfRes?.data) ? vfRes.data[0] : null;
            if (vRow?.uuid) {
              const vbRes = await jcJson('http://api.jsoncargo.com/api/v1/vessel/basic', { uuid: vRow.uuid }, 10000);
              const vd = vbRes?.data;
              if (vd && Number.isFinite(+vd.lat) && Number.isFinite(+vd.lon)) {
                vesselLat = +vd.lat;
                vesselLon = +vd.lon;
              }
            }
          }

          // Salvar no cache
          await client.execute(`
            INSERT INTO ai_agente.t_dachser_sea_tracking_cache 
              (container, consignee, loading_port, discharging_port, container_status, 
               eta_final_destination, atd_origin, last_movement_timestamp,
               origin_lat, origin_lon, origin_unlocode, dest_lat, dest_lon, dest_unlocode,
               vessel_name, vessel_lat, vessel_lon, last_api_update)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              consignee = VALUES(consignee),
              loading_port = VALUES(loading_port),
              discharging_port = VALUES(discharging_port),
              container_status = VALUES(container_status),
              eta_final_destination = VALUES(eta_final_destination),
              atd_origin = VALUES(atd_origin),
              last_movement_timestamp = VALUES(last_movement_timestamp),
              origin_lat = VALUES(origin_lat),
              origin_lon = VALUES(origin_lon),
              origin_unlocode = VALUES(origin_unlocode),
              dest_lat = VALUES(dest_lat),
              dest_lon = VALUES(dest_lon),
              dest_unlocode = VALUES(dest_unlocode),
              vessel_name = VALUES(vessel_name),
              vessel_lat = VALUES(vessel_lat),
              vessel_lon = VALUES(vessel_lon),
              last_api_update = NOW()
          `, [
            containerId, consignee, loadingPort, dischargingPort, containerStatus,
            etaFinal ? new Date(etaFinal) : null, 
            atdOrigin ? new Date(atdOrigin) : null, 
            lastMovement ? new Date(lastMovement) : null,
            originLat, originLon, originUnlocode, destLat, destLon, destUnlocode,
            vesselName, vesselLat, vesselLon
          ]);

          results.push({
            container: containerId,
            cliente: consignee,
            loading_port: loadingPort,
            discharging_port: dischargingPort,
            container_status: containerStatus,
            eta_final_destination: etaFinal,
            atd_origin: atdOrigin,
            last_movement_timestamp: lastMovement,
            origin_lat: originLat,
            origin_lon: originLon,
            origin_unlocode: originUnlocode,
            dest_lat: destLat,
            dest_lon: destLon,
            dest_unlocode: destUnlocode,
            vessel_name: vesselName,
            vessel_lat: vesselLat,
            vessel_lon: vesselLon,
            from_cache: false,
            last_api_update: new Date().toISOString()
          });

          // Pequeno delay entre chamadas de API
          await new Promise(r => setTimeout(r, 200));
        }

        await client.close();
        console.log(`[sea_seed_smart] Processed ${results.length} containers. API calls: ${apiCallCount}, Cache hits: ${cacheHitCount}`);
        return new Response(JSON.stringify({ 
          data: results, 
          stats: { total: results.length, api_calls: apiCallCount, cache_hits: cacheHitCount }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[sea_seed_smart] Error:', e);
        return new Response(JSON.stringify({ error: 'Falha sea_seed_smart', detail: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA: container details =====
    if (action === 'jc_container') {
      const id = url.searchParams.get('id') || '';
      if (!id) {
        return new Response(JSON.stringify({ error: 'id container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const shipping = url.searchParams.get('shipping_line') || '';
      const qs: Record<string, string> = {};
      if (shipping) qs['shipping_line'] = shipping;
      
      const res = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(id)}`, qs);
      return new Response(JSON.stringify(res), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA: vessel finder =====
    if (action === 'jc_vessel_find') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        return new Response(JSON.stringify({ error: 'name obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const res = await jcJson('http://api.jsoncargo.com/api/v1/vessel/finder', { name, fuzzy: '1' });
      return new Response(JSON.stringify(res), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA: vessel basic =====
    if (action === 'jc_vessel_basic') {
      const uuid = url.searchParams.get('uuid') || '';
      const mmsi = url.searchParams.get('mmsi') || '';
      const imo = url.searchParams.get('imo') || '';
      if (!uuid && !mmsi && !imo) {
        return new Response(JSON.stringify({ error: 'uuid/mmsi/imo obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const qs: Record<string, string> = {};
      if (uuid) qs['uuid'] = uuid;
      if (mmsi) qs['mmsi'] = mmsi;
      if (imo) qs['imo'] = imo;
      
      const res = await jcJson('http://api.jsoncargo.com/api/v1/vessel/basic', qs);
      return new Response(JSON.stringify(res), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA: port finder =====
    if (action === 'jc_port_find') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        return new Response(JSON.stringify({ error: 'name obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const res = await jcJson('http://api.jsoncargo.com/api/v1/port/find', { name, fuzzy: '1' });
      return new Response(JSON.stringify(res), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== AIR: seed from database =====
    if (action === 'seed_air') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        const rows = await client.query(`
          SELECT DISTINCT
            af.awb AS awb,
            UPPER(REPLACE(af.num_voo, ' ', '')) AS flight,
            dm.cliente AS cliente,
            dm.tipo_processo AS tipo
          FROM dados_dachser.t_awb_voo af
          INNER JOIN dados_dachser.t_master_dados dm ON dm.mawb = af.awb
          WHERE af.num_voo IS NOT NULL
            AND TRIM(af.num_voo) <> ''
            AND TRIM(af.num_voo) <> '0'
            AND dm.cliente IS NOT NULL
            AND TRIM(dm.cliente) <> ''
        `);

        const out: any[] = [];
        for (const r of rows) {
          const f = normFlight(r.flight || '');
          if (!f || f === '0' || !isValidFlight(f)) continue;
          out.push({
            awb: String(r.awb || ''),
            flight: f,
            cliente: String(r.cliente || ''),
            tipo: String(r.tipo || '')
          });
        }

        await client.close();
        console.log(`[seed_air] Returning ${out.length} flights`);
        return new Response(JSON.stringify({ data: out }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[seed_air] Error:', e);
        return new Response(JSON.stringify({ error: 'Falha seed_air', detail: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== FR24 FULL (live positions) =====
    if (action === 'fr24_full') {
      const token = Deno.env.get('FLIGHTRADAR_API_KEY');
      if (!token) {
        return new Response(JSON.stringify({ error: 'FLIGHTRADAR_API_KEY não configurada' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const flightsRaw = url.searchParams.get('flights') || '';
      const all = parseFlightsCsv(flightsRaw);
      if (!all.length) {
        return new Response(JSON.stringify({ error: 'Informe flights (CSV) válido(s)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const batchSize = Math.max(5, Math.min(30, parseInt(url.searchParams.get('batch') || '12', 10)));
      const retries = Math.max(0, Math.min(5, parseInt(url.searchParams.get('retries') || '3', 10)));
      
      const chunks: string[][] = [];
      for (let i = 0; i < all.length; i += batchSize) {
        chunks.push(all.slice(i, i + batchSize));
      }

      const headers = {
        'Accept': 'application/json',
        'Accept-Version': 'v1',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Z3US-OLIMPO/1.3'
      };

      let merged: any[] = [];
      let partial = false;
      const dbg: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const qs = new URLSearchParams({ flights: chunk.join(',') });
        const apiUrl = `https://fr24api.flightradar24.com/api/live/flight-positions/full?${qs}`;

        let ok = false;
        let out: any = null;
        let lastErr: string | null = null;
        let lastStatus = 0;

        for (let tryNum = 0; tryNum <= retries; tryNum++) {
          out = await curlJson(apiUrl, headers, 25000);
          lastStatus = out.__status || 0;
          lastErr = out.__curl_error || null;
          if (!out.__curl_error && lastStatus >= 200 && lastStatus < 500) {
            ok = true;
            break;
          }
          await new Promise(r => setTimeout(r, 250));
        }

        // Log FlightRadar24 API call
        logApiCall(
          'FlightRadar24',
          '/api/live/flight-positions/full',
          'GET',
          lastStatus,
          0, // Response time not tracked per batch
          lastErr || undefined
        );

        if (ok) {
          const data = Array.isArray(out?.data) ? out.data : (Array.isArray(out) ? out : []);
          merged = merged.concat(data);
          dbg.push({ batch: i + 1, count: chunk.length, status: lastStatus, ok: true });
        } else {
          partial = true;
          dbg.push({ batch: i + 1, count: chunk.length, status: lastStatus, ok: false, err: lastErr });
        }
        await new Promise(r => setTimeout(r, 250));
      }

      console.log(`[fr24_full] Merged ${merged.length} flights, partial=${partial}`);
      return new Response(JSON.stringify({ data: merged, partial, debug_batches: dbg }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== FR24 SUMMARY (ATD/ETA) =====
    if (action === 'fr24_summary') {
      const token = Deno.env.get('FLIGHTRADAR_API_KEY');
      if (!token) {
        return new Response(JSON.stringify({ error: 'FLIGHTRADAR_API_KEY não configurada' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const toUtcIso = (x: any): string | null => {
        if (x === null || x === '') return null;
        let ts: number;
        if (typeof x === 'number' || /^\d+$/.test(String(x))) {
          const n = String(x);
          ts = n.length >= 13 ? Math.round(Number(x) / 1000) : Number(x);
        } else {
          const d = new Date(x);
          if (isNaN(d.getTime())) return null;
          ts = Math.floor(d.getTime() / 1000);
        }
        return new Date(ts * 1000).toISOString();
      };

      const now = Date.now();
      const defFromTs = now - 72 * 3600 * 1000;
      const defToTs = now + 36 * 3600 * 1000;

      const from = url.searchParams.get('from') ? toUtcIso(url.searchParams.get('from')) : new Date(defFromTs).toISOString();
      const to = url.searchParams.get('to') ? toUtcIso(url.searchParams.get('to')) : new Date(defToTs).toISOString();

      const flightsRaw = url.searchParams.get('flights') || '';
      const all = parseFlightsCsv(flightsRaw);
      if (!all.length) {
        return new Response(JSON.stringify({ error: 'Informe flights (CSV) válido(s)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const batchSize = Math.max(5, Math.min(30, parseInt(url.searchParams.get('batch') || '12', 10)));
      const retries = Math.max(0, Math.min(5, parseInt(url.searchParams.get('retries') || '3', 10)));
      
      const chunks: string[][] = [];
      for (let i = 0; i < all.length; i += batchSize) {
        chunks.push(all.slice(i, i + batchSize));
      }

      const headers = {
        'Accept': 'application/json',
        'Accept-Version': 'v1',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Z3US-OLIMPO/1.3'
      };

      let merged: any[] = [];
      let partial = false;
      const dbg: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const qs = new URLSearchParams({
          flight_datetime_from: from || '',
          flight_datetime_to: to || '',
          flights: chunk.join(',')
        });
        const apiUrl = `https://fr24api.flightradar24.com/api/flight-summary/full?${qs}`;

        let ok = false;
        let out: any = null;
        let lastErr: string | null = null;
        let lastStatus = 0;

        for (let tryNum = 0; tryNum <= retries; tryNum++) {
          out = await curlJson(apiUrl, headers, 25000);
          lastStatus = out.__status || 0;
          lastErr = out.__curl_error || null;
          if (!out.__curl_error && lastStatus >= 200 && lastStatus < 500) {
            ok = true;
            break;
          }
          await new Promise(r => setTimeout(r, 250));
        }

        // Log FlightRadar24 API call
        logApiCall(
          'FlightRadar24',
          '/api/flight-summary/full',
          'GET',
          lastStatus,
          0, // Response time not tracked per batch
          lastErr || undefined
        );

        if (ok) {
          const data = Array.isArray(out?.data) ? out.data : (Array.isArray(out) ? out : []);
          merged = merged.concat(data);
          dbg.push({ batch: i + 1, count: chunk.length, status: lastStatus, ok: true });
        } else {
          partial = true;
          dbg.push({ batch: i + 1, count: chunk.length, status: lastStatus, ok: false, err: lastErr });
        }
        await new Promise(r => setTimeout(r, 250));
      }

      console.log(`[fr24_summary] Merged ${merged.length} summaries, partial=${partial}`);
      return new Response(JSON.stringify({ data: merged, partial, debug_batches: dbg }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== Airports Public =====
    if (action === 'airports_public') {
      const codesCsv = url.searchParams.get('codes') || '';
      if (!codesCsv) {
        return new Response(JSON.stringify({ error: 'codes CSV obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const codes = codesCsv.split(',')
        .map(c => c.trim().toUpperCase())
        .filter(c => /^[A-Z0-9]{3,4}$/.test(c));

      if (!codes.length) {
        return new Response(JSON.stringify({ data: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch from OurAirports public CSV
      let csvText = '';
      const sources = [
        'https://davidmegginson.github.io/ourairports-data/airports.csv',
        'https://raw.githubusercontent.com/ourairports/ourairports-data/main/airports.csv'
      ];

      for (const source of sources) {
        try {
          const res = await fetch(source, { 
            headers: { 'User-Agent': 'Z3US-OLIMPO/airports-public/1.0' }
          });
          if (res.ok) {
            csvText = await res.text();
            if (csvText.length > 100000) break;
          }
        } catch (e) {
          console.warn(`[airports_public] Failed to fetch from ${source}:`, e);
        }
      }

      if (!csvText) {
        return new Response(JSON.stringify({ data: {}, error: 'Could not fetch airports data' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Parse CSV
      const lines = csvText.split('\n');
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const idxIdent = header.indexOf('ident');
      const idxIata = header.indexOf('iata_code');
      const idxLat = header.indexOf('latitude_deg');
      const idxLon = header.indexOf('longitude_deg');
      const idxName = header.indexOf('name');

      const byIata: Record<string, any> = {};
      const byIcao: Record<string, any> = {};

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const ident = (row[idxIdent] || '').toUpperCase();
        const iata = (row[idxIata] || '').toUpperCase();
        const lat = parseFloat(row[idxLat] || '');
        const lon = parseFloat(row[idxLon] || '');
        const name = row[idxName] || '';

        if (!lat || !lon) continue;

        const entry = {
          name: name || ident || iata,
          iata: iata || null,
          icao: ident || null,
          lat,
          lon
        };

        if (ident) byIcao[ident] = entry;
        if (iata) byIata[iata] = entry;
      }

      const result: Record<string, any> = {};
      for (const c of codes) {
        if (byIcao[c]) {
          result[c] = byIcao[c];
          if (byIcao[c].iata) result[byIcao[c].iata] = byIcao[c];
        } else if (byIata[c]) {
          result[c] = byIata[c];
          if (byIata[c].icao) result[byIata[c].icao] = byIata[c];
        }
      }

      console.log(`[airports_public] Found ${Object.keys(result).length} airports for ${codes.length} codes`);
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA TRACKING DEBUG: Analyze t_master_dados data =====
    if (action === 'debug_sea_tracking') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // 1. Total de registros em t_master_dados
        const totalRows = await client.query(`SELECT COUNT(*) as total FROM dados_dachser.t_master_dados`);
        
        // 2. Registros com mawb e container preenchidos
        const withMawbContainer = await client.query(`
          SELECT COUNT(*) as total FROM dados_dachser.t_master_dados 
          WHERE mawb IS NOT NULL AND mawb != '' AND container IS NOT NULL AND container != ''
        `);
        
        // 3. Registros com ETD >= 2025-12-01
        const withEtdFilter = await client.query(`
          SELECT COUNT(*) as total FROM dados_dachser.t_master_dados 
          WHERE mawb IS NOT NULL AND mawb != '' AND container IS NOT NULL AND container != ''
          AND etd >= '2025-12-01'
        `);
        
        // 4. Registros com formato de MBL válido (4 letras + números)
        const withValidFormat = await client.query(`
          SELECT COUNT(*) as total FROM dados_dachser.t_master_dados 
          WHERE mawb IS NOT NULL AND mawb != '' AND container IS NOT NULL AND container != ''
          AND etd >= '2025-12-01'
          AND mawb REGEXP '^[A-Za-z]{4}[0-9]+$'
        `);
        
        // 5. Exemplos de mawb existentes com container
        const sampleMawbs = await client.query(`
          SELECT DISTINCT mawb, etd, container, tipo_processo 
          FROM dados_dachser.t_master_dados 
          WHERE mawb IS NOT NULL AND mawb != ''
            AND tipo_processo LIKE '%SEA%'
          ORDER BY etd DESC
          LIMIT 20
        `);
        
        // 6. Estrutura da tabela - verificar colunas disponíveis
        const tableColumns = await client.query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'dados_dachser' AND TABLE_NAME = 't_master_dados'
          ORDER BY ORDINAL_POSITION
        `);
        
        // 7. Registros SEA IMPORT recentes com mais detalhes
        const recentSeaImports = await client.query(`
          SELECT mawb, container, tipo_processo, etd, eta, cliente, active
          FROM dados_dachser.t_master_dados 
          WHERE tipo_processo LIKE '%SEA%'
          ORDER BY id DESC
          LIMIT 30
        `);
        
        // 8. Formatos de mawb encontrados
        const mawbFormats = await client.query(`
          SELECT 
            mawb,
            LENGTH(mawb) as len,
            etd,
            CASE 
              WHEN mawb REGEXP '^[A-Za-z]{4}[0-9]+$' THEN 'VALIDO'
              ELSE 'INVALIDO'
            END as formato_status
          FROM dados_dachser.t_master_dados 
          WHERE mawb IS NOT NULL AND mawb != ''
          ORDER BY etd DESC
          LIMIT 30
        `);

        await client.close();
        
        return new Response(JSON.stringify({ 
          success: true,
          debug: {
            total_registros: totalRows[0]?.total || 0,
            com_mawb_e_container: withMawbContainer[0]?.total || 0,
            com_etd_valido: withEtdFilter[0]?.total || 0,
            com_formato_mbl_valido: withValidFormat[0]?.total || 0,
            exemplos_mawb: sampleMawbs,
            colunas_tabela: tableColumns,
            sea_imports_recentes: recentSeaImports,
            formatos_mawb: mawbFormats
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[debug_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Debug stats for t_tracking_sea table =====
    if (action === 'debug_tracking_stats') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Count by active status
        const activeStats = await client.query(`
          SELECT 
            active,
            COUNT(*) as total_rows,
            COUNT(DISTINCT mbl_id) as distinct_mbls
          FROM dados_dachser.t_tracking_sea
          GROUP BY active
        `);

        // Count MBLs with containers PENDENTE only vs with valid containers
        const containerStats = await client.query(`
          SELECT 
            mbl_id,
            active,
            COUNT(*) as total_containers,
            SUM(CASE WHEN container IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '') OR container IS NULL THEN 1 ELSE 0 END) as invalid_containers,
            SUM(CASE WHEN container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '') AND container IS NOT NULL THEN 1 ELSE 0 END) as valid_containers,
            MAX(last_error) as last_error
          FROM dados_dachser.t_tracking_sea
          WHERE active = 1
          GROUP BY mbl_id, active
          HAVING valid_containers = 0
          LIMIT 20
        `);

        // Sample of inactive MBLs
        const inactiveMbls = await client.query(`
          SELECT DISTINCT mbl_id, active, last_error, container
          FROM dados_dachser.t_tracking_sea
          WHERE active = 0
          LIMIT 20
        `);

        await client.close();
        
        return new Response(JSON.stringify({ 
          success: true,
          stats: {
            by_active_status: activeStats,
            mbls_with_only_invalid_containers: containerStats,
            sample_inactive_mbls: inactiveMbls
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[debug_tracking_stats] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Get MBL tracking data from t_tracking_sea (grouped by MBL) =====
    // ===== SETUP SEA TRACKING INDEXES =====
    // Creates optimized indexes for the get_sea_tracking query
    if (action === 'setup_sea_tracking_indexes') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      const results: string[] = [];
      try {
        // Index 1: t_tracking_sea(mbl_id, active) - Principal para GROUP BY
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_tracking_sea_mbl_active 
            ON dados_dachser.t_tracking_sea(mbl_id, active)
          `);
          results.push('✓ idx_tracking_sea_mbl_active criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_tracking_sea_mbl_active já existe');
        }

        // Index 2: t_tracking_sea(mbl_id, last_check) - Para ordenação e navio recente
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_tracking_sea_mbl_lastcheck 
            ON dados_dachser.t_tracking_sea(mbl_id, last_check DESC)
          `);
          results.push('✓ idx_tracking_sea_mbl_lastcheck criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_tracking_sea_mbl_lastcheck já existe');
        }

        // Index 3: t_master_dados(mawb, active) - Para CTE master_data
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_master_dados_mawb_active 
            ON dados_dachser.t_master_dados(mawb, active)
          `);
          results.push('✓ idx_master_dados_mawb_active criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_master_dados_mawb_active já existe');
        }

        // Index 4: t_tracking_sea_history(mbl_id, event_code) - Para CTE transship
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_tracking_history_mbl_event 
            ON dados_dachser.t_tracking_sea_history(mbl_id, event_code)
          `);
          results.push('✓ idx_tracking_history_mbl_event criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_tracking_history_mbl_event já existe');
        }

        // Index 5: t_client_free_time(mbl, ativo) - Para CTE has_freetime
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_client_freetime_mbl_ativo 
            ON dados_dachser.t_client_free_time(mbl, ativo)
          `);
          results.push('✓ idx_client_freetime_mbl_ativo criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_client_freetime_mbl_ativo já existe');
        }

        // Index 6: t_client_free_time(cliente_nome, ativo) - Para JOIN por consignee
        try {
          await client.execute(`
            CREATE INDEX IF NOT EXISTS idx_client_freetime_cliente_ativo 
            ON dados_dachser.t_client_free_time(cliente_nome, ativo)
          `);
          results.push('✓ idx_client_freetime_cliente_ativo criado');
        } catch (e: any) {
          if (!e.message?.includes('Duplicate')) throw e;
          results.push('○ idx_client_freetime_cliente_ativo já existe');
        }

        await client.close();
        console.log('[setup_sea_tracking_indexes] Indexes setup completed:', results);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Indexes configurados com sucesso',
          results 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[setup_sea_tracking_indexes] Error:', e);
        return new Response(JSON.stringify({ error: e.message, results }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== GET SEA TRACKING - OTIMIZADO =====
    if (action === 'get_sea_tracking') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Retry logic with exponential backoff for transient connection errors
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
        let client: any = null;
        
        try {
          client = await new Client().connect({
            hostname: mariadbHost,
            port: parseInt(mariadbPort, 10),
            username: mariadbUser,
            password: mariadbPass,
            db: 'dados_dachser',
          });

          // OTIMIZADO V4: t_sea_master (principal) + t_master_dados (secundária para SEA recentes)
          // - t_sea_master: master -> mbl_id, eta_ata -> eta
          // - t_master_dados: mawb -> mbl_id, filtrando SEA IMPORT/EXPORT e data >= 2026-02-04
          await client.execute("SET SESSION max_statement_time = 30");
          
          const rows = await client.query(`
            WITH 
              -- CTE 1: Dados do t_sea_master agrupados por mbl_id (FONTE PRINCIPAL)
              master_data AS (
                SELECT 
                  TRIM(master) as mbl_id,
                  MAX(eta_ata) as eta,
                  MAX(etd) as etd,
                  MAX(nome_analista) as nome_analista
                FROM dados_dachser.t_sea_master
                WHERE master IS NOT NULL
                  AND TRIM(master) != ''
                GROUP BY TRIM(master)
              ),
              -- CTE 1B: Dados do t_master_dados para processos SEA recentes (FONTE SECUNDÁRIA)
              master_dados_new AS (
                SELECT 
                  TRIM(mawb) as mbl_id,
                  MAX(tipo_processo) as tipo_processo,
                  MAX(eta) as eta,
                  MAX(nome_analista) as nome_analista
                FROM dados_dachser.t_master_dados
                WHERE mawb IS NOT NULL
                  AND TRIM(mawb) != ''
                  AND tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
                  AND data_insert >= '2026-02-04 09:55:11'
                GROUP BY TRIM(mawb)
              ),
              -- CTE 2: Navio/vessel_imo mais recente por mbl (ranking)
              latest_vessel AS (
                SELECT 
                  mbl_id,
                  navio,
                  vessel_imo,
                  ROW_NUMBER() OVER (PARTITION BY mbl_id ORDER BY last_check DESC) as rn
                FROM dados_dachser.t_tracking_sea
                WHERE active = 1 AND navio IS NOT NULL AND navio != ''
              ),
              -- CTE 3: Transshipment direto do t_tracking_sea
              transship_direct AS (
                SELECT mbl_id, MAX(transshipment_port) as transshipment_port
                FROM dados_dachser.t_tracking_sea
                WHERE transshipment_port IS NOT NULL AND transshipment_port != ''
                GROUP BY mbl_id
              ),
              -- CTE 4: Transshipment do histórico (fallback)
              transship_history AS (
                SELECT 
                  mbl_id,
                  GROUP_CONCAT(DISTINCT location ORDER BY location SEPARATOR ', ') as transshipment_port
                FROM dados_dachser.t_tracking_sea_history
                WHERE UPPER(event_code) IN ('TRANSSHIPMENT', 'TSP', 'TRANSSHIPMENT_DISCHARGED', 'TRANSSHIPMENT_LOADED')
                  AND location IS NOT NULL AND location != ''
                GROUP BY mbl_id
              ),
              -- CTE 5: Free time cadastrado (simplificado)
              has_freetime AS (
                SELECT DISTINCT
                  CASE WHEN tipo_ft = 'PROCESSO' THEN mbl ELSE NULL END as mbl_id,
                  CASE WHEN tipo_ft = 'CONTRATO' THEN cliente_nome ELSE NULL END as cliente_nome,
                  tipo_ft
                FROM dados_dachser.t_client_free_time
                WHERE ativo = 1
                  AND (tipo_ft = 'PROCESSO' OR (
                    tipo_ft = 'CONTRATO' 
                    AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE())
                    AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE())
                  ))
              )
            SELECT 
              ts.mbl_id,
              MAX(ts.tipo_processo) as tipo_processo,
              MAX(ts.consignee) as consignee,
              MAX(ts.shipping_line) as shipping_line,
              MAX(ts.origem) as origem,
              MAX(ts.destino) as destino,
              MAX(lv.navio) as navio,
              MAX(lv.vessel_imo) as vessel_imo,
              COALESCE(MAX(md.eta), MAX(mdn.eta), MAX(ts.eta)) as eta,
              COALESCE(MAX(md.eta), MAX(mdn.eta)) as eta_master,
              COALESCE(MAX(md.nome_analista), MAX(mdn.nome_analista)) as nome_analista,
              MAX(ts.eta) as eta_api,
              MAX(ts.email_analista) as email_analista,
              MAX(ts.email_cliente) as email_cliente,
              COUNT(DISTINCT CASE WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', '') AND ts.container IS NOT NULL THEN ts.container END) as container_count,
              MAX(ts.container_status) as container_status,
              MAX(ts.last_event) as last_event,
              MAX(ts.last_check) as last_check,
              MAX(ts.active) as active,
              MAX(ts.created_at) as created_at,
              MAX(ts.updated_at) as updated_at,
              COALESCE(MAX(ts.tipo_carga), 'FCL') as tipo_carga,
              MAX(ts.coloader) as coloader,
              CASE 
                WHEN COALESCE(MAX(md.eta), MAX(ts.eta)) IS NOT NULL 
                  AND COALESCE(MAX(md.eta), MAX(ts.eta)) < DATE_SUB(NOW(), INTERVAL 3 DAY)
                  AND UPPER(COALESCE(MAX(ts.container_status), '')) NOT IN ('DELIVERED', 'GATE_OUT', 'DLV', 'GOD', 'EMPTY_RETURNED', 'EMPTY_RECEIVED_AT_CY')
                THEN 1 ELSE 0 
              END as is_eta_delayed,
              CASE 
                WHEN COALESCE(MAX(md.eta), MAX(ts.eta)) IS NOT NULL 
                  AND COALESCE(MAX(md.eta), MAX(ts.eta)) < DATE_SUB(NOW(), INTERVAL 7 DAY)
                  AND UPPER(COALESCE(MAX(ts.container_status), '')) NOT IN ('DELIVERED', 'GATE_OUT', 'DLV', 'GOD', 'EMPTY_RETURNED', 'EMPTY_RECEIVED_AT_CY')
                THEN 1 ELSE 0 
              END as is_critico,
              CASE 
                WHEN COALESCE(MAX(md.eta), MAX(ts.eta)) IS NOT NULL 
                  AND COALESCE(MAX(md.eta), MAX(ts.eta)) < CURDATE()
                THEN DATEDIFF(CURDATE(), COALESCE(MAX(md.eta), MAX(ts.eta)))
                ELSE 0 
              END as dias_atraso,
              COALESCE(MAX(td.transshipment_port), MAX(th.transshipment_port)) as transshipment_port,
              CASE
                WHEN MAX(hf_proc.mbl_id) IS NOT NULL THEN 1
                WHEN MAX(hf_cont.cliente_nome) IS NOT NULL THEN 1
                ELSE 0
              END as has_free_time
            FROM dados_dachser.t_tracking_sea ts
            LEFT JOIN master_data md ON md.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN master_dados_new mdn ON mdn.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN latest_vessel lv ON lv.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci AND lv.rn = 1
            LEFT JOIN transship_direct td ON td.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN transship_history th ON th.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN has_freetime hf_proc ON hf_proc.mbl_id COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci AND hf_proc.tipo_ft = 'PROCESSO'
            LEFT JOIN has_freetime hf_cont ON hf_cont.cliente_nome COLLATE utf8mb4_unicode_ci = ts.consignee COLLATE utf8mb4_unicode_ci AND hf_cont.tipo_ft = 'CONTRATO'
            WHERE ts.active = 1
            GROUP BY ts.mbl_id
            HAVING 
              (
                COUNT(DISTINCT CASE 
                  WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', 'IGNORADO', '') 
                  AND ts.container IS NOT NULL 
                  THEN ts.container 
                END) > 0
                OR (COUNT(*) = 1 AND MAX(ts.container) = 'PENDENTE')
                OR (COUNT(*) >= 1 AND MAX(ts.container) = 'NAO_ENCONTRADO')
              )
              AND NOT (
                COUNT(DISTINCT ts.container) = COUNT(DISTINCT CASE 
                  WHEN ts.last_error LIKE '%Prefix not found%' 
                  THEN ts.container 
                END)
                AND COUNT(DISTINCT CASE WHEN ts.last_error LIKE '%Prefix not found%' THEN ts.container END) > 0
                AND MAX(ts.container) != 'PENDENTE'
              )
              AND NOT (
                UPPER(COALESCE(MAX(ts.container_status), '')) IN ('DELIVERED', 'DLV')
                AND MAX(ts.container) != 'PENDENTE'
              )
              AND NOT (
                (
                  UPPER(COALESCE(MAX(ts.container_status), '')) IN ('GOD', 'GATE_OUT_FULL', 'EMPTY_RETURNED', 'EMPTY_RECEIVED_AT_CY')
                  OR UPPER(COALESCE(MAX(ts.last_event), '')) LIKE '%DELIVERED%'
                  OR UPPER(COALESCE(MAX(ts.last_event), '')) LIKE '%GATE OUT%'
                  OR UPPER(COALESCE(MAX(ts.last_event), '')) LIKE '%EMPTY RETURNED%'
                )
                AND MAX(ts.last_check) < DATE_SUB(NOW(), INTERVAL 5 DAY)
                AND MAX(ts.container) != 'PENDENTE'
              )
            ORDER BY 
              CASE WHEN MAX(ts.container) = 'PENDENTE' THEN 0 ELSE 1 END,
              MAX(ts.last_check) DESC, 
              ts.mbl_id
            LIMIT 500
          `);

          await client.close();
          console.log(`[get_sea_tracking] Returning ${rows.length} MBLs (attempt ${attempt})`);
          return new Response(JSON.stringify({ success: true, data: rows }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          lastError = e;
          if (client) {
            try { await client.close(); } catch {}
          }
          
          // Check if this is a retriable error (connection reset, timeout)
          const isRetriable = e.message && (
            e.message.includes('Connection reset') ||
            e.message.includes('os error 104') ||
            e.message.includes('max_statement_time') ||
            e.message.includes('interrupted') ||
            e.message.includes('timed out')
          );
          
          if (isRetriable && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[get_sea_tracking] Retriable error on attempt ${attempt}/${MAX_RETRIES}: ${e.message}. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          
          console.error(`[get_sea_tracking] Error on attempt ${attempt}/${MAX_RETRIES}:`, e);
          break;
        }
      }
      
      // All retries exhausted
      return new Response(JSON.stringify({ error: lastError?.message || 'Query failed after retries', data: [] }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA TRACKING: Get containers for a specific MBL =====
    if (action === 'get_sea_tracking_containers') {
      const mbl_id = url.searchParams.get('mbl_id') || '';

      if (!mbl_id) {
        return new Response(JSON.stringify({ error: 'mbl_id obrigatório', data: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Retornar navio/vessel_imo mais recente via COALESCE com subquery
        const rows = await client.query(`
          SELECT 
            ts.id, ts.mbl_id, ts.container, ts.shipping_line, 
            ts.container_status, ts.last_event, ts.last_check, 
            -- ETA priorizado: usar t_master_dados.eta se disponível
            COALESCE(
              (
                SELECT md.eta 
                FROM dados_dachser.t_master_dados md 
                WHERE BINARY TRIM(md.mawb) = BINARY ts.mbl_id
                  AND md.eta IS NOT NULL 
                  AND md.active = 1
                LIMIT 1
              ),
              ts.eta
            ) as eta, 
            COALESCE(ts.navio, (
              SELECT t2.navio 
              FROM dados_dachser.t_tracking_sea t2 
              WHERE BINARY t2.mbl_id = BINARY ts.mbl_id
                AND t2.navio IS NOT NULL 
                AND t2.navio != ''
              ORDER BY t2.last_check DESC 
              LIMIT 1
            )) as navio,
            COALESCE(ts.vessel_imo, (
              SELECT t2.vessel_imo 
              FROM dados_dachser.t_tracking_sea t2 
              WHERE BINARY t2.mbl_id = BINARY ts.mbl_id
                AND t2.vessel_imo IS NOT NULL 
              ORDER BY t2.last_check DESC 
              LIMIT 1
            )) as vessel_imo, 
            ts.origem, ts.destino, ts.consignee
          FROM dados_dachser.t_tracking_sea ts
          WHERE BINARY ts.mbl_id = BINARY ?
          ORDER BY ts.container
        `, [mbl_id]);

        await client.close();
        console.log(`[get_sea_tracking_containers] Returning ${rows.length} containers for MBL ${mbl_id}`);
        return new Response(JSON.stringify({ success: true, data: rows }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_sea_tracking_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Sync from t_master_dados to t_tracking_sea =====
    if (action === 'sync_sea_tracking') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      // Fix collation mismatch between tables
      await client.execute('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci');

      try {
        // Prefixos válidos de MBL por armador
        const VALID_MBL_PREFIXES = [
          'COSU', 'CSNU', 'CBHU', 'OOLU',  // COSCO
          'HLCU', 'HLXU',                   // HAPAG-LLOYD
          'MAEU', 'MRKU', 'MSKU',           // MAERSK
          'MSCU', 'MEDU',                   // MSC
          'CMAU', 'CCLU', 'CXDU',           // CMA CGM
          'ONEY', 'ONEU',                   // ONE
          'HDMU', 'HMMU',                   // HMM
          'EISU', 'EITU', 'EGSU', 'EGHU',   // EVERGREEN
          'YMLU', 'YMMU',                   // YANG MING
          'ZIMU', 'ZCSU',                   // ZIM
        ].join('|');
        
        // OPTIMIZATION: Skip heavy stats query that causes timeout
        // Stats are nice-to-have but not essential for sync operation
        console.log(`[sync_sea_tracking] Starting sync (stats query disabled for performance)`);

        // Validação atualizada:
        // - MBL formato SCAC padrão: 4 letras + números (ex: COSU6437929310)
        // - MBL formato SCAC estendido: prefixo armador + código porto + números (ex: HLCUHAM251021534)
        // - Rejeitar booking references (EBKG, etc.)
        // - Rejeitar referências internas (GLNL, GLSL, etc.)
        // - Rejeitar HAWBs brasileiros (ex: BRSAO123456)
        // - Container: aceitar vazio (usa 'PENDENTE'), mas validar formato se presente
        // - ETD >= 01/12/2025
        // - Apenas processos SEA
        // INSERT IGNORE: Only insert NEW MBLs, never update existing records
        // This preserves: active status, last_error, tracking data for existing MBLs
        // OPTIMIZATION: Use a two-step approach to avoid timeout
        // Step 1: Get list of existing MBLs in tracking table (fast indexed lookup)
        const existingMbls = await client.query(`
          SELECT DISTINCT mbl_id FROM dados_dachser.t_tracking_sea WHERE active = 1
        `);
        const existingSet = new Set((existingMbls as any[]).map(r => r.mbl_id?.trim()));
        console.log(`[sync_sea_tracking] Found ${existingSet.size} existing MBLs in tracking table`);

        // Step 2A: Get candidates from t_sea_master (FONTE PRINCIPAL)
        const candidatesSeaMaster = await client.query(`
          SELECT
            TRIM(sm.master) AS mbl_id,
            'SEA IMPORT' AS tipo_processo,
            'PENDENTE' AS container,
            sm.customer_no AS consignee,
            sm.nome_analista AS email_analista,
            NULL AS email_cliente
          FROM dados_dachser.t_sea_master sm
          WHERE sm.master IS NOT NULL
            AND TRIM(sm.master) != ''
            AND (
              TRIM(sm.master) REGEXP '^[A-Za-z]{4}[0-9]+$'
              OR TRIM(sm.master) REGEXP '^(${VALID_MBL_PREFIXES})[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$'
            )
            AND LEFT(TRIM(sm.master), 4) NOT IN ('EBKG', 'BKNG', 'GLNL', 'GLSL', 'GLDL', 'BRSA')
            AND TRIM(sm.master) NOT REGEXP '^BR[A-Za-z]{3}'
          GROUP BY TRIM(sm.master)
          LIMIT 500
        `);
        console.log(`[sync_sea_tracking] Found ${(candidatesSeaMaster as any[]).length} candidates from t_sea_master`);

        // Step 2B: Get candidates from t_master_dados (FONTE SECUNDÁRIA - SEA IMPORT/EXPORT recentes)
        const candidatesMasterDados = await client.query(`
          SELECT
            TRIM(md.mawb) AS mbl_id,
            md.tipo_processo AS tipo_processo,
            'PENDENTE' AS container,
            md.cliente AS consignee,
            md.nome_analista AS email_analista,
            NULL AS email_cliente
          FROM dados_dachser.t_master_dados md
          WHERE md.mawb IS NOT NULL
            AND TRIM(md.mawb) != ''
            AND md.tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
            AND md.data_insert >= '2026-02-04 09:55:11'
            AND (
              TRIM(md.mawb) REGEXP '^[A-Za-z]{4}[0-9]+$'
              OR TRIM(md.mawb) REGEXP '^(${VALID_MBL_PREFIXES})[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$'
            )
            AND LEFT(TRIM(md.mawb), 4) NOT IN ('EBKG', 'BKNG', 'GLNL', 'GLSL', 'GLDL', 'BRSA')
            AND TRIM(md.mawb) NOT REGEXP '^BR[A-Za-z]{3}'
          GROUP BY TRIM(md.mawb)
          LIMIT 300
        `);
        console.log(`[sync_sea_tracking] Found ${(candidatesMasterDados as any[]).length} candidates from t_master_dados`);

        // Step 3: Merge candidates (t_sea_master has priority for duplicates)
        const seaMasterSet = new Set((candidatesSeaMaster as any[]).map(c => c.mbl_id?.trim()));
        const uniqueMasterDados = (candidatesMasterDados as any[]).filter(c => !seaMasterSet.has(c.mbl_id?.trim()));
        const allCandidates = [...(candidatesSeaMaster as any[]), ...uniqueMasterDados];
        console.log(`[sync_sea_tracking] Total unique candidates: ${allCandidates.length} (${(candidatesSeaMaster as any[]).length} from t_sea_master + ${uniqueMasterDados.length} unique from t_master_dados)`);

        // Step 4: Filter out existing MBLs in JavaScript (much faster than SQL NOT EXISTS)
        const toInsert = allCandidates.filter(c => !existingSet.has(c.mbl_id?.trim()));
        console.log(`[sync_sea_tracking] ${toInsert.length} new MBLs to insert`);

        // Step 5: Batch insert new records
        let synced = 0;
        let syncedFromSeaMaster = 0;
        let syncedFromMasterDados = 0;
        for (const row of toInsert) {
          try {
            await client.execute(`
              INSERT IGNORE INTO dados_dachser.t_tracking_sea (
                mbl_id, tipo_processo, container, consignee, email_analista, email_cliente, active
              ) VALUES (?, ?, ?, ?, ?, ?, 1)
            `, [row.mbl_id, row.tipo_processo, row.container, row.consignee, row.email_analista, row.email_cliente]);
            synced++;
            // Track source
            if (seaMasterSet.has(row.mbl_id?.trim())) {
              syncedFromSeaMaster++;
            } else {
              syncedFromMasterDados++;
            }
          } catch (insertErr) {
            console.warn(`[sync_sea_tracking] Failed to insert ${row.mbl_id}:`, insertErr);
          }
        }

        await client.close();
        
        console.log(`[sync_sea_tracking] Synced ${synced} rows (${syncedFromSeaMaster} from t_sea_master, ${syncedFromMasterDados} from t_master_dados)`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          synced,
          sources: {
            t_sea_master: syncedFromSeaMaster,
            t_master_dados: syncedFromMasterDados
          },
          message: `${synced} registros sincronizados (${syncedFromSeaMaster} t_sea_master + ${syncedFromMasterDados} t_master_dados)`,
          validation_rules: {
            mbl_scac_padrao: '^[A-Za-z]{4}[0-9]+$ (ex: COSU6437929310)',
            mbl_scac_estendido: `^(${VALID_MBL_PREFIXES.substring(0, 30)}...)[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$ (ex: HLCUHAM251021534)`,
            mbl_reject_booking: 'EBKG*, BKNG* (booking references)',
            mbl_reject_internal: 'GLNL*, GLSL*, GLDL*, BRSA* (referências internas)',
            mbl_reject_hawb: '^BR[A-Za-z]{3} (HAWBs brasileiros)',
            container: 'Opcional (usa PENDENTE se vazio)',
            etd_min: '2025-11-01',
            t_master_dados_filter: 'tipo_processo IN (SEA IMPORT, SEA EXPORT), data_insert >= 2026-02-04 09:55:11'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[sync_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Refresh containers in t_tracking_sea (BATCH PROCESSING) =====
    if (action === 'refresh_sea_tracking') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Batch processing parameters
      const batchSize = parseInt(url.searchParams.get('batch_size') || '20');
      const maxTimeMs = parseInt(url.searchParams.get('max_time_ms') || '45000');
      const staleHours = parseInt(url.searchParams.get('stale_hours') || '4');
      const refreshValidHours = parseInt(url.searchParams.get('refresh_valid_hours') || '48');
      const forceRefresh = url.searchParams.get('force') === '1';
      const startTime = Date.now();
      
      // Final statuses that should not be refreshed
      const FINAL_STATUSES = ['DELIVERED', 'COMPLETED', 'EMPTY_RETURNED', 'EMPTY_RETURN', 'DLV', 'GOD'];

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Ensure last_error and needs_manual_review columns exist
        try {
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN IF NOT EXISTS last_error VARCHAR(255) DEFAULT NULL
          `);
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN IF NOT EXISTS needs_manual_review TINYINT(1) DEFAULT 0
          `);
        } catch (alterErr: any) {
          // Columns might already exist, ignore error
          console.log('[refresh_sea_tracking] column check:', alterErr.message);
        }

        // Query containers that need update
        // OPTIMIZATION: Select only ONE container per MBL to save API calls
        // The sibling sync at the end will propagate data to other containers of the same MBL
        // Priority: prefer non-leasing containers (they track better)
        let containers;
        
        // Define leasing prefixes for the query (same as LEASING_CONTAINER_PREFIXES below but as string for SQL)
        const leasingPrefixesForQuery = `'BSIU','BEAU','TRHU','TRIU','TCKU','TTNU','TIIU','TLLU','TALU','IPXU','ITLU','TXGU','TEMU','TGHU','TCNU','TGBU','SCZU','SCMU','SCLU','CAAU','CAIU','CARU','CXRU','FCIU','FBIU','FCGU','FSCU','SZLU','SEGU','DFSU','DFCU','FDCU','GCXU','GATU','GLDU','HAMU','HCMU','ILAU','ITEU','UASU','UESU','UFCU','FANU','FBLU','FYCU','FUJU','GESU','BMOU','CSXU','CBLU','CLIU','CLXU','FTAU','BBCU','SMCU','SMLU','LCRU','LGEU','CXIC','CXNI'`;
        
        if (forceRefresh) {
          // Force refresh: get one representative container per MBL (preferring non-leasing)
          containers = await client.query(`
            SELECT t.id, t.mbl_id, t.container, t.shipping_line, t.navio, t.last_error
            FROM dados_dachser.t_tracking_sea t
            INNER JOIN (
              SELECT 
                mbl_id,
                MIN(
                  CASE 
                    WHEN UPPER(LEFT(container, 4)) NOT IN (${leasingPrefixesForQuery}) THEN CONCAT('0_', id)
                    ELSE CONCAT('1_', id)
                  END
                ) as priority_id
              FROM dados_dachser.t_tracking_sea
              WHERE active = 1
                AND container IS NOT NULL
                AND container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '')
                AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
                AND mbl_id IS NOT NULL AND mbl_id != ''
                AND (
                  container_status IS NULL 
                  OR container_status = '' 
                  OR container_status = 'PENDING'
                  OR last_event IS NULL 
                  OR last_event = '' 
                  OR last_event LIKE '%Aguardando%'
                  OR last_error IS NOT NULL
                )
              GROUP BY mbl_id
            ) representative ON t.mbl_id = representative.mbl_id 
              AND CONCAT(
                CASE 
                  WHEN UPPER(LEFT(t.container, 4)) NOT IN (${leasingPrefixesForQuery}) THEN '0_'
                  ELSE '1_'
                END, 
                t.id
              ) = representative.priority_id
            WHERE t.active = 1
            ORDER BY t.last_error DESC, t.last_check ASC
            LIMIT ?
          `, [batchSize]);
        } else {
          // Normal refresh with two categories:
          // Category 1 - Pending: NULL/empty/PENDING status, check every staleHours (4h)
          // Category 2 - Valid: Valid status, check every refreshValidHours (48h)
          // Exclude final statuses (DELIVERED, COMPLETED, etc.)
          const finalStatusList = FINAL_STATUSES.map(s => `'${s}'`).join(',');
          
          containers = await client.query(`
            SELECT t.id, t.mbl_id, t.container, t.shipping_line, t.navio, t.last_error
            FROM dados_dachser.t_tracking_sea t
            INNER JOIN (
              SELECT 
                mbl_id,
                MIN(
                  CASE 
                    WHEN UPPER(LEFT(container, 4)) NOT IN (${leasingPrefixesForQuery}) THEN CONCAT('0_', id)
                    ELSE CONCAT('1_', id)
                  END
                ) as priority_id
              FROM dados_dachser.t_tracking_sea
              WHERE active = 1
                AND container IS NOT NULL
                AND container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '')
                AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
                AND mbl_id IS NOT NULL AND mbl_id != ''
                -- Exclude final statuses (DELIVERED, COMPLETED, etc.)
                AND (container_status IS NULL OR UPPER(container_status) NOT IN (${finalStatusList}))
                AND (last_event IS NULL OR UPPER(last_event) NOT REGEXP 'DELIVERED|EMPTY.?RETURN')
                AND (
                  -- Category 1: Pending status, check every staleHours (4h)
                  (
                    (last_check IS NULL OR last_check < DATE_SUB(NOW(), INTERVAL ? HOUR))
                    AND (
                      container_status IS NULL 
                      OR container_status = '' 
                      OR container_status = 'PENDING'
                      OR last_event IS NULL 
                      OR last_event = '' 
                      OR last_event LIKE '%Aguardando%'
                    )
                  )
                  OR
                  -- Category 2: Valid status, check every refreshValidHours (48h)
                  (
                    (last_check IS NULL OR last_check < DATE_SUB(NOW(), INTERVAL ? HOUR))
                    AND container_status IS NOT NULL 
                    AND container_status != '' 
                    AND container_status != 'PENDING'
                    AND last_event IS NOT NULL 
                    AND last_event != ''
                  )
                )
              GROUP BY mbl_id
            ) representative ON t.mbl_id = representative.mbl_id 
              AND CONCAT(
                CASE 
                  WHEN UPPER(LEFT(t.container, 4)) NOT IN (${leasingPrefixesForQuery}) THEN '0_'
                  ELSE '1_'
                END, 
                t.id
              ) = representative.priority_id
            WHERE t.active = 1
            ORDER BY t.last_check ASC
            LIMIT ?
          `, [staleHours, refreshValidHours, batchSize]);
        }

        // Count how many containers we skipped due to MBL optimization
        const totalPendingResult = await client.query(`
          SELECT COUNT(*) as total
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1
            AND container IS NOT NULL
            AND container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '')
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
            AND (
              container_status IS NULL 
              OR container_status = '' 
              OR container_status = 'PENDING'
              OR last_event IS NULL 
              OR last_event = '' 
              OR last_event LIKE '%Aguardando%'
            )
        `);
        const totalPending = totalPendingResult[0]?.total || 0;
        const apiCallsSaved = totalPending > containers.length ? totalPending - containers.length : 0;
        
        console.log(`[refresh_sea_tracking] OPTIMIZATION: Processing ${containers.length} containers (1 per MBL), ${totalPending} total pending, ~${apiCallsSaved} API calls saved`);
        console.log(`[refresh_sea_tracking] Processing ${containers.length} containers (force=${forceRefresh}, stale > ${staleHours}h)`);

        let updated = 0;
        let errors = 0;
        let processed = 0;
        let leasingDetected = 0;
        let bolFirstSuccess = 0;  // Containers de leasing rastreados via BOL-first strategy
        let dbSiblingSuccess = 0; // Containers de leasing rastreados via sibling no banco (0 API calls)
        let imoLookups = 0;       // Buscas de IMO via vessel/finder
        
        // Limpa cache de IMO no início de cada execução
        vesselImoCache.clear();
        console.log(`[refresh_sea_tracking] IMO cache cleared for new batch`);

        // Prefixes de containers de leasing (não pertencem a armadores específicos)
        // Estes containers precisam usar o MBL ou shipping_line do banco para identificar o armador
        const LEASING_CONTAINER_PREFIXES = new Set([
          // Beacon Intermodal Leasing
          'BSIU', 'BEAU', 
          // Triton International (includes TAL, Interpool)
          'TRHU', 'TRIU', 'TCKU', 'TTNU', 'TIIU', 'TLLU', 'TALU', 'IPXU', 'ITLU',
          // Textainer (major leasing company)
          'TXGU', 'TEMU', 'TGHU', 'TCNU', 'TGBU',
          // SeaCube Container Leasing
          'SCZU', 'SCMU', 'SCLU',
          // CAI International (now Mitsubishi HC Capital)
          'CAAU', 'CAIU', 'CARU', 'CXRU',
          // Florens Container (CIMC subsidiary)
          'FCIU', 'FBIU', 'FCGU', 'FSCU',
          // Seaco Global
          'SZLU', 'SEGU',
          // DFSU - DF Capital / Dong Fang International
          'DFSU', 'DFCU', 'FDCU',
          // Gold Container Corporation
          'GCXU', 'GATU', 'GLDU',
          // Hamburg Container Leasing
          'HAMU', 'HCMU',
          // Itel Container
          'ILAU', 'ITEU',
          // UES International (HK)
          'UASU', 'UESU', 'UFCU',
          // Fanu / Blue Sky Intermodal
          'FANU', 'FBLU',
          // Fuwa Leasing
          'FYCU', 'FUJU',
          // Geseaco
          'GESU',
          // Blue Marine
          'BMOU',
          // China Shipping Leasing
          'CSXU', 'CBLU',
          // Container Leasing International
          'CLIU', 'CLXU',
          // Fortress Transportation
          'FTAU',
          // Borchard Lines (leasing containers)
          'BBCU',
          // SM Line (leasing)
          'SMCU', 'SMLU',
          // Leasing genérico / outros
          'LCRU', 'LGEU', 'CXIC', 'CXNI',
        ]);

        // Extended mapping for container prefixes to shipping lines
        const CONTAINER_PREFIX_TO_SHIPPING_LINE: Record<string, string> = {
          // CMA CGM (including APL)
          'CMAU': 'CMA_CGM', 'CXDU': 'CMA_CGM', 'CGMU': 'CMA_CGM',
          'APLU': 'CMA_CGM', 'APHU': 'CMA_CGM',
          // CCLU - CMA CGM predominant
          'CCLU': 'CMA_CGM',
          // MSC
          'MSCU': 'MSC', 'MEDU': 'MSC', 'MSDU': 'MSC', 
          // MAERSK (including Hamburg Sud, Sealand, Safmarine)
          'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK', 'PONU': 'MAERSK', 'SUDU': 'MAERSK',
          'SFAU': 'MAERSK', 'SLBU': 'MAERSK',
          // Hapag-Lloyd (inclui UACU - United Arab Shipping Company adquirida em 2017, e HLBU)
          'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD', 'HLBU': 'HAPAG_LLOYD', 'TCLU': 'HAPAG_LLOYD', 'UACU': 'HAPAG_LLOYD',
          // ONE (Ocean Network Express - formado por MOL, NYK, K-Line)
          'ONEY': 'ONE', 'ONEU': 'ONE', 'NYKU': 'ONE', 'MOLU': 'ONE', 'KKFU': 'ONE', 'MOAU': 'ONE',
          // HMM
          'HDMU': 'HMM', 'HMMU': 'HMM', 'HMCU': 'HMM', 'KMTU': 'HMM',
          // Evergreen
          'EISU': 'EVERGREEN', 'EITU': 'EVERGREEN', 'EGSU': 'EVERGREEN', 'EGHU': 'EVERGREEN', 'EMCU': 'EVERGREEN',
          // Yang Ming
          'YMLU': 'YANG_MING', 'YMMU': 'YANG_MING', 'YMPU': 'YANG_MING',
          // COSCO / OOCL (both under COSCO Group)
          'COSU': 'COSCO', 'CSNU': 'COSCO', 'CBHU': 'COSCO', 'OOLU': 'COSCO', 'CSLU': 'COSCO',
          // ZIM
          'ZIMU': 'ZIM', 'ZCSU': 'ZIM',
          // PIL (Pacific International Lines)
          'PCIU': 'PIL', 'PILU': 'PIL',
          // Wan Hai
          'WHLU': 'WAN_HAI', 'WANU': 'WAN_HAI',
          // Seaboard
          'SEAU': 'SEABOARD',
          // Crowley
          'CROU': 'CROWLEY',
          // Arkas
          'ARKU': 'ARKAS',
          // Turkon
          'TRKU': 'TURKON',
          // Grimaldi
          'GRIU': 'GRIMALDI',
          // Alianca (now Hamburg Sud/Maersk)
          'ALIU': 'MAERSK',
          // ANL Container Line (CMA CGM)
          'ANLU': 'CMA_CGM',
          // CLHU - pode ser Crowley, remover dúvida
          'CLHU': 'CROWLEY',
        };

        // MBL prefix to shipping line mapping (extended for better leasing container identification)
        const MBL_PREFIX_TO_SHIPPING_LINE: Record<string, string> = {
          // Hapag-Lloyd MBL prefixes (various formats)
          'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD', 'HLBU': 'HAPAG_LLOYD', 'SAHL': 'HAPAG_LLOYD',
          // MSC MBL prefixes
          'MSCU': 'MSC', 'MEDU': 'MSC', 'MSCM': 'MSC',
          // Maersk MBL prefixes (including Hamburg Sud)
          'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK', 'HASL': 'MAERSK', 'HSUD': 'MAERSK', 'SUDU': 'MAERSK',
          // CMA CGM MBL prefixes (including APL, ANL)
          'CMAU': 'CMA_CGM', 'CGMU': 'CMA_CGM', 'CMDU': 'CMA_CGM', 'APLU': 'CMA_CGM', 'ANLU': 'CMA_CGM',
          // ONE MBL prefixes (formed by MOL, NYK, K-Line)
          'ONEY': 'ONE', 'ONEU': 'ONE', 'NYKU': 'ONE', 'MOLU': 'ONE', 'KKFU': 'ONE',
          // Evergreen MBL prefixes
          'EISU': 'EVERGREEN', 'EITU': 'EVERGREEN', 'EGSU': 'EVERGREEN', 'EGLV': 'EVERGREEN',
          // COSCO / OOCL MBL prefixes
          'COSU': 'COSCO', 'OOLU': 'COSCO', 'CBHU': 'COSCO', 'CSLU': 'COSCO', 'CCLU': 'COSCO',
          // Yang Ming MBL prefixes
          'YMLU': 'YANG_MING', 'YMMU': 'YANG_MING',
          // HMM MBL prefixes
          'HDMU': 'HMM', 'HMMU': 'HMM',
          // ZIM MBL prefixes
          'ZIMU': 'ZIM', 'ZCSU': 'ZIM',
          // PIL MBL prefixes
          'PCIU': 'PIL', 'PILU': 'PIL',
          // Wan Hai MBL prefixes
          'WHLU': 'WAN_HAI',
        };

        for (const row of containers) {
          // Time control: stop if approaching timeout
          if (Date.now() - startTime > maxTimeMs) {
            console.log(`[refresh_sea_tracking] Time limit reached after ${processed} containers`);
            break;
          }

          const containerId = row.container;
          const mblId = row.mbl_id || '';
          const containerPrefix = containerId ? containerId.substring(0, 4).toUpperCase() : '';
          const mblPrefix = mblId ? mblId.substring(0, 4).toUpperCase() : '';
          const isLeasingContainer = LEASING_CONTAINER_PREFIXES.has(containerPrefix);
          
          let shippingLine = '';
          let shippingLineSource = '';
          
          // STEP 1: Use database shipping_line if available (highest priority)
          if (row.shipping_line) {
            shippingLine = row.shipping_line;
            shippingLineSource = 'database';
          }
          
          // STEP 2: If container is leasing, MUST use MBL prefix or database field
          if (!shippingLine && isLeasingContainer) {
            // Try MBL prefix first
            if (mblPrefix && MBL_PREFIX_TO_SHIPPING_LINE[mblPrefix]) {
              shippingLine = MBL_PREFIX_TO_SHIPPING_LINE[mblPrefix];
              shippingLineSource = 'mbl_prefix_leasing';
              leasingDetected++;
              console.log(`[refresh_sea_tracking] Leasing container ${containerId} (${containerPrefix}): using ${shippingLine} from MBL ${mblPrefix}`);
            }
          }
          
          // STEP 3: If not leasing, try container prefix mapping
          if (!shippingLine && !isLeasingContainer && containerPrefix) {
            shippingLine = CONTAINER_PREFIX_TO_SHIPPING_LINE[containerPrefix] || '';
            if (shippingLine) shippingLineSource = 'container_prefix';
          }
          
          // STEP 4: Fallback - try MBL prefix even for non-leasing containers
          if (!shippingLine && mblPrefix) {
            shippingLine = MBL_PREFIX_TO_SHIPPING_LINE[mblPrefix] || '';
            if (shippingLine) {
              shippingLineSource = 'mbl_prefix_fallback';
              console.log(`[refresh_sea_tracking] Container ${containerId}: using ${shippingLine} from MBL prefix ${mblPrefix} (fallback)`);
            }
          }
          
          // STEP 5: If still no shipping line, mark as unidentifiable and skip API call
          if (!shippingLine) {
            console.log(`[refresh_sea_tracking] Cannot identify carrier for ${containerId} (prefix: ${containerPrefix}, isLeasing: ${isLeasingContainer}, MBL: ${mblId}, MBL prefix: ${mblPrefix})`);
            
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET last_check = NOW(), last_error = ?, needs_manual_review = 1
              WHERE id = ?
            `, [`armador_nao_identificado: container=${containerPrefix} mbl=${mblPrefix} leasing=${isLeasingContainer}`, row.id]);
            errors++;
            processed++;
            continue;
          }
          
          // Convert shipping line to API format (e.g., "HAPAG-LLOYD" -> "HAPAG_LLOYD")
          const apiShippingLine = toApiShippingLine(shippingLine);
          console.log(`[refresh_sea_tracking] Container ${containerId}: DB=${shippingLine}, API=${apiShippingLine}, isLeasing=${isLeasingContainer}`);
          
          // ===== BOL-FIRST STRATEGY FOR LEASING CONTAINERS =====
          // For leasing containers, try to get data via sibling or MBL BEFORE attempting direct tracking
          // This reduces "Prefix not found" errors and improves success rate
          if (isLeasingContainer && mblId && mblId.length >= 10) {
            console.log(`[refresh_sea_tracking] BOL-first strategy for leasing container ${containerId} (MBL: ${mblId})`);
            
            // STEP A: Check if any sibling in DB already has data (ZERO API calls!)
            const dbSiblingResult = await client.query(`
              SELECT container_status, navio, vessel_imo, eta, origem, destino, last_event, shipping_line
              FROM dados_dachser.t_tracking_sea
              WHERE mbl_id = ?
                AND container_status IS NOT NULL 
                AND container_status != ''
                AND container_status != 'PENDING'
                AND id != ?
                AND (last_error IS NULL OR last_error = '')
              ORDER BY last_check DESC
              LIMIT 1
            `, [mblId, row.id]);
            
            if (dbSiblingResult.length > 0 && dbSiblingResult[0].container_status) {
              const dbSib = dbSiblingResult[0];
              console.log(`[refresh_sea_tracking] DB sibling found for ${containerId}: status=${dbSib.container_status}, vessel=${dbSib.navio}`);
              
              await client.execute(`
                UPDATE dados_dachser.t_tracking_sea 
                SET 
                  container_status = ?,
                  origem = COALESCE(?, origem),
                  destino = COALESCE(?, destino),
                  eta = COALESCE(?, eta),
                  navio = COALESCE(?, navio),
                  vessel_imo = COALESCE(?, vessel_imo),
                  last_event = ?,
                  shipping_line = COALESCE(?, shipping_line),
                  last_check = NOW(),
                  last_error = NULL,
                  sibling_synced = 1,
                  sibling_synced_at = NOW()
                WHERE id = ?
              `, [
                dbSib.container_status,
                dbSib.origem,
                dbSib.destino,
                dbSib.eta,
                dbSib.navio,
                dbSib.vessel_imo,
                dbSib.last_event || dbSib.container_status,
                dbSib.shipping_line,
                row.id
              ]);
              
              updated++;
              processed++;
              dbSiblingSuccess++;
              console.log(`[refresh_sea_tracking] SUCCESS via DB sibling (0 API calls): ${containerId}`);
              continue;
            }
            
            // STEP B: Query MBL/BOL API to find sibling containers
            console.log(`[refresh_sea_tracking] No DB sibling found, querying BOL API for MBL ${mblId}...`);
            
            const bolApiRes = await jcJsonWithRetry(
              `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(mblId)}`,
              { shipping_line: apiShippingLine },
              25000,
              2,  // max retries
              2000 // backoff ms
            );
            
            if (!bolApiRes.__curl_error && !bolApiRes.error && bolApiRes.data) {
              const siblings = bolApiRes.data.associated_container_numbers || [];
              
              // Log full BOL response for debugging (important for understanding API structure)
              console.log(`[refresh_sea_tracking] BOL API FULL RESPONSE for MBL ${mblId}:`, JSON.stringify(bolApiRes.data, null, 2).substring(0, 2000));
              console.log(`[refresh_sea_tracking] BOL API returned ${siblings.length} containers for MBL ${mblId}: ${siblings.slice(0, 5).join(', ')}`);
              
              
              // STEP C: Find a non-leasing sibling to track
              const nonLeasingSibling = siblings.find((ctr: string) => {
                const prefix = ctr.substring(0, 4).toUpperCase();
                return !LEASING_CONTAINER_PREFIXES.has(prefix) && ctr !== containerId;
              });
              
              if (nonLeasingSibling) {
                console.log(`[refresh_sea_tracking] Found non-leasing sibling ${nonLeasingSibling}, tracking it...`);
                
                // STEP D: Track the non-leasing sibling
                const siblingApiRes = await jcJsonWithRetry(
                  `http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(nonLeasingSibling)}`,
                  { shipping_line: apiShippingLine },
                  25000,
                  2,  // max retries
                  2000 // backoff ms
                );
                
                if (!siblingApiRes.__curl_error && !siblingApiRes.error && siblingApiRes.data) {
                  const sibData = siblingApiRes.data;
                  const vesselName = sibData.current_vessel_name || sibData.last_vessel_name || sibData.vessel?.name || null;
                  let vesselImo = sibData.vessel?.imo || sibData.current_vessel_imo || null;
                  const containerStatus = sibData.container_status || null;
                  const lastEvent = sibData.last_movement?.description || containerStatus;
                  
                  // Se não obteve IMO mas tem nome do navio, buscar via vessel/finder
                  if (!vesselImo && vesselName) {
                    console.log(`[refresh_sea_tracking] No IMO from sibling ${nonLeasingSibling}, searching for vessel "${vesselName}"...`);
                    const foundImo = await findVesselImo(vesselName);
                    if (foundImo) {
                      vesselImo = foundImo;
                      imoLookups++;
                      console.log(`[refresh_sea_tracking] Found IMO ${foundImo} via vessel/finder for sibling`);
                    }
                  }
                  
                  if (containerStatus) {
                    console.log(`[refresh_sea_tracking] Sibling ${nonLeasingSibling} data: status=${containerStatus}, vessel=${vesselName}`);
                    
                    await client.execute(`
                      UPDATE dados_dachser.t_tracking_sea 
                      SET 
                        container_status = ?,
                        origem = COALESCE(?, origem),
                        destino = COALESCE(?, destino),
                        eta = ?,
                        navio = COALESCE(?, navio),
                        vessel_imo = COALESCE(?, vessel_imo),
                        last_event = ?,
                        shipping_line = COALESCE(?, shipping_line),
                        last_check = NOW(),
                        last_error = NULL,
                        sibling_synced = 1,
                        sibling_synced_at = NOW()
                      WHERE id = ?
                    `, [
                      containerStatus,
                      sibData.loading_port || sibData.shipped_from || null,
                      sibData.discharging_port || sibData.shipped_to || null,
                      sibData.eta_final_destination || sibData.eta ? new Date(sibData.eta_final_destination || sibData.eta) : null,
                      vesselName,
                      vesselImo,
                      lastEvent || containerStatus,
                      shippingLine ? normalizeShippingLine(shippingLine) : null,
                      row.id
                    ]);
                    
                    updated++;
                    processed++;
                    bolFirstSuccess++;
                    console.log(`[refresh_sea_tracking] SUCCESS via BOL-first (sibling ${nonLeasingSibling}): ${containerId}`);
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                  }
                } else {
                  console.log(`[refresh_sea_tracking] Sibling ${nonLeasingSibling} tracking failed:`, siblingApiRes.error || siblingApiRes.__curl_error);
                }
              } else {
                console.log(`[refresh_sea_tracking] No non-leasing sibling found in BOL response, checking for direct MBL data...`);
                
                // STEP E: Try to extract data directly from BOL response
                const bolData = bolApiRes.data;
                const bolContainerStatus = bolData.status || bolData.bol_status || bolData.shipment_status || null;
                const bolVessel = bolData.vessel || bolData.vessel_name || bolData.current_vessel || null;
                let bolVesselImo = bolData.vessel_imo || bolData.imo || null;
                const bolEta = bolData.eta || bolData.eta_final || bolData.eta_destination || null;
                const bolPol = bolData.pol || bolData.port_of_loading || bolData.origin || null;
                const bolPod = bolData.pod || bolData.port_of_discharge || bolData.destination || null;
                
                // Se não obteve IMO mas tem nome do navio, buscar via vessel/finder
                if (!bolVesselImo && bolVessel) {
                  console.log(`[refresh_sea_tracking] No IMO from BOL data, searching for vessel "${bolVessel}"...`);
                  const foundImo = await findVesselImo(bolVessel);
                  if (foundImo) {
                    bolVesselImo = foundImo;
                    imoLookups++;
                    console.log(`[refresh_sea_tracking] Found IMO ${foundImo} via vessel/finder for BOL data`);
                  }
                }
                
                if (bolContainerStatus || bolVessel || bolEta) {
                  console.log(`[refresh_sea_tracking] Using BOL data directly: status=${bolContainerStatus}, vessel=${bolVessel}, eta=${bolEta}`);
                  
                  const lastEventFromBol = bolContainerStatus || (bolVessel ? `Em trânsito - ${bolVessel}` : 'Dados via MBL');
                  
                  // Extrair transshipment do BOL data
                  const bolTransshipmentSources: string[] = [];
                  if (bolData.transshipment_port) bolTransshipmentSources.push(bolData.transshipment_port);
                  if (bolData.via_port) bolTransshipmentSources.push(bolData.via_port);
                  if (bolData.transit_port) bolTransshipmentSources.push(bolData.transit_port);
                  if (bolData.route?.via) bolTransshipmentSources.push(bolData.route.via);
                  if (bolData.routing?.transshipment_port) bolTransshipmentSources.push(bolData.routing.transshipment_port);
                  const bolTransshipment = [...new Set(bolTransshipmentSources.filter(p => p && p.trim()).map(p => p.trim().toUpperCase()))].join(', ') || null;
                  
                  await client.execute(`
                    UPDATE dados_dachser.t_tracking_sea 
                    SET 
                      container_status = COALESCE(?, container_status, 'Via MBL'),
                      origem = COALESCE(?, origem),
                      destino = COALESCE(?, destino),
                      eta = COALESCE(?, eta),
                      navio = COALESCE(?, navio),
                      vessel_imo = COALESCE(?, vessel_imo),
                      last_event = ?,
                      transshipment_port = COALESCE(?, transshipment_port),
                      last_check = NOW(),
                      last_error = NULL,
                      sibling_synced = 1,
                      sibling_synced_at = NOW()
                    WHERE id = ?
                  `, [
                    bolContainerStatus,
                    bolPol,
                    bolPod,
                    bolEta ? new Date(bolEta) : null,
                    bolVessel,
                    bolVesselImo,
                    lastEventFromBol,
                    bolTransshipment,
                    row.id
                  ]);
                  
                  updated++;
                  processed++;
                  bolFirstSuccess++;
                  console.log(`[refresh_sea_tracking] SUCCESS via BOL data directly: ${containerId}`);
                  await new Promise(r => setTimeout(r, 100));
                  continue;
                }
              }
            } else {
              console.log(`[refresh_sea_tracking] BOL API failed for MBL ${mblId}:`, bolApiRes.error || bolApiRes.__curl_error);
            }
            
            // If BOL-first fails, fall through to direct tracking (which will likely fail for leasing, but we try)
            console.log(`[refresh_sea_tracking] BOL-first strategy exhausted for ${containerId}, trying direct tracking...`);
          }
          // ===== END BOL-FIRST STRATEGY =====
          
          const qs: Record<string, string> = {};
          if (apiShippingLine) qs['shipping_line'] = apiShippingLine;
          
          const apiRes = await jcJsonWithRetry(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs, 25000, 2, 2000);
          
          if (!apiRes.__curl_error && !apiRes.error && (apiRes.data || apiRes.container_status)) {
            const data = apiRes.data || apiRes;
            
            let lastEventDescription = data.container_status || null;
            if (data.events && Array.isArray(data.events) && data.events.length > 0) {
              lastEventDescription = data.events[0].description || data.events[0].event_type || lastEventDescription;
            } else if (data.last_movement?.description) {
              lastEventDescription = data.last_movement.description;
            }
            
            // Extract vessel name first, then prioritize IMO search by name
            const vesselName = data.current_vessel_name || data.last_vessel_name || data.vessel?.name || null;
            let vesselImo = null;
            
            // PRIORIDADE 1: Buscar IMO pelo nome do navio (mais confiável)
            if (vesselName) {
              console.log(`[refresh_sea_tracking] Searching IMO by vessel name "${vesselName}" for ${containerId}...`);
              const foundImo = await findVesselImo(vesselName);
              if (foundImo) {
                vesselImo = foundImo;
                imoLookups++;
                console.log(`[refresh_sea_tracking] Found IMO ${foundImo} via vessel/finder for ${containerId}`);
              }
            }
            
            // FALLBACK: Usar IMO direta da API apenas se busca por nome falhar
            if (!vesselImo) {
              vesselImo = data.vessel?.imo || data.current_vessel_imo || data.vessel_imo || data.imo || null;
              if (vesselImo) {
                console.log(`[refresh_sea_tracking] Using API direct IMO as fallback for ${containerId}: ${vesselImo}`);
              }
            }
            
            // ===== EXTRACT TRANSSHIPMENT PORT =====
            // Buscar porto(s) de transbordo de múltiplas fontes possíveis na API
            const transshipmentSources: string[] = [];
            
            // Fontes diretas da resposta
            if (data.transshipment_port) transshipmentSources.push(data.transshipment_port);
            if (data.via_port) transshipmentSources.push(data.via_port);
            if (data.transit_port) transshipmentSources.push(data.transit_port);
            if (data.transshipment?.port) transshipmentSources.push(data.transshipment.port);
            if (data.transshipment?.name) transshipmentSources.push(data.transshipment.name);
            if (data.route?.via) transshipmentSources.push(data.route.via);
            if (data.route?.transshipment) transshipmentSources.push(data.route.transshipment);
            if (data.routing?.transshipment_port) transshipmentSources.push(data.routing.transshipment_port);
            if (data.routing?.via) transshipmentSources.push(data.routing.via);
            
            // Também verificar no array de eventos se existir
            if (data.events && Array.isArray(data.events)) {
              for (const event of data.events) {
                const eventCode = (event.event_code || event.event_type || event.code || '').toUpperCase();
                // Eventos de transbordo típicos
                if (eventCode.includes('TRANSSHIP') || eventCode.includes('TSP') || 
                    eventCode.includes('TRANSIT') || eventCode.includes('T/S') ||
                    eventCode === 'DISCHARGED' || eventCode === 'LOADED') {
                  const loc = event.location || event.port || event.terminal || null;
                  if (loc && loc.trim() !== '') {
                    // Evitar adicionar origem/destino como transbordo
                    const locUpper = loc.toUpperCase().trim();
                    const origemUpper = (data.loading_port || data.shipped_from || '').toUpperCase().trim();
                    const destinoUpper = (data.discharging_port || data.shipped_to || '').toUpperCase().trim();
                    if (locUpper !== origemUpper && locUpper !== destinoUpper) {
                      transshipmentSources.push(loc);
                    }
                  }
                }
              }
            }
            
            // Combinar todas as fontes não-nulas e deduplicar
            const uniqueTransshipments = [...new Set(
              transshipmentSources
                .filter(p => p && typeof p === 'string' && p.trim() !== '')
                .map(p => p.trim().toUpperCase())
            )];
            const transshipmentPort = uniqueTransshipments.length > 0 ? uniqueTransshipments.join(', ') : null;
            
            if (transshipmentPort) {
              console.log(`[refresh_sea_tracking] Found transshipment port(s) for ${containerId}: ${transshipmentPort}`);
            }
            
            console.log(`[refresh_sea_tracking] Container ${containerId}: vessel=${vesselName}, imo=${vesselImo}`);
            
            // Update main tracking table including vessel_imo and transshipment_port
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET 
                container_status = ?,
                origem = COALESCE(?, origem),
                destino = COALESCE(?, destino),
                eta = ?,
                navio = COALESCE(?, navio),
                vessel_imo = COALESCE(?, vessel_imo),
                last_event = ?,
                shipping_line = COALESCE(?, shipping_line),
                transshipment_port = COALESCE(?, transshipment_port),
                last_check = NOW(),
                last_error = NULL
              WHERE id = ?
            `, [
              data.container_status || null,
              data.loading_port || data.shipped_from || null,
              data.discharging_port || data.shipped_to || null,
              data.eta_final_destination || data.eta ? new Date(data.eta_final_destination || data.eta) : null,
              vesselName,
              vesselImo,
              lastEventDescription,
              shippingLine ? normalizeShippingLine(shippingLine) : null,
              transshipmentPort,
              row.id
            ]);
            
            // ===== PHASE 2: Record history events =====
            try {
              const etaValue = data.eta_final_destination || data.eta || null;
              const vesselName = data.current_vessel_name || data.last_vessel_name || null;
              const voyage = data.voyage || data.voyage_number || null;
              
              // If API returns events array, record each event
              if (data.events && Array.isArray(data.events) && data.events.length > 0) {
                for (const event of data.events) {
                  const eventCode = event.event_code || event.event_type || event.code || 'UNK';
                  const eventDesc = event.description || event.event_description || event.event_type || null;
                  const eventLocation = event.location || event.port || event.terminal || null;
                  let eventDatetime = null;
                  
                  // Parse event datetime (try multiple formats)
                  if (event.datetime || event.date || event.event_datetime || event.timestamp) {
                    try {
                      eventDatetime = new Date(event.datetime || event.date || event.event_datetime || event.timestamp);
                      if (isNaN(eventDatetime.getTime())) eventDatetime = null;
                    } catch { eventDatetime = null; }
                  }
                  
                  // Insert with IGNORE to avoid duplicates
                  await client.execute(`
                    INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
                    (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, container_status, eta, source, raw_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'API', ?)
                  `, [
                    mblId || 'UNKNOWN',
                    containerId,
                    eventCode.substring(0, 50),
                    eventDesc ? eventDesc.substring(0, 500) : null,
                    eventDatetime,
                    eventLocation ? eventLocation.substring(0, 200) : null,
                    vesselName ? vesselName.substring(0, 100) : null,
                    voyage ? voyage.substring(0, 50) : null,
                    data.container_status || null,
                    etaValue ? new Date(etaValue) : null,
                    JSON.stringify(event)
                  ]);
                }
              } else {
                // No events array - record current status as a single event
                await client.execute(`
                  INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
                  (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, container_status, eta, source, raw_data)
                  VALUES (?, ?, 'STATUS_UPDATE', ?, NOW(), ?, ?, ?, ?, ?, 'API', ?)
                `, [
                  mblId || 'UNKNOWN',
                  containerId,
                  lastEventDescription ? lastEventDescription.substring(0, 500) : 'Status atualizado',
                  data.discharging_port || data.shipped_to || null,
                  vesselName ? vesselName.substring(0, 100) : null,
                  voyage ? voyage.substring(0, 50) : null,
                  data.container_status || null,
                  etaValue ? new Date(etaValue) : null,
                  JSON.stringify({ container_status: data.container_status, eta: etaValue })
                ]);
              }
            } catch (historyError: any) {
              // Don't fail the main update if history fails
              console.log(`[refresh_sea_tracking] History insert failed for ${containerId}: ${historyError.message}`);
            }
            
            updated++;
          } else {
            // Categorize error type for better diagnostics
            let errorType = 'unknown';
            let errorDetail = '';
            
            if (apiRes.__curl_error) {
              if (apiRes.__curl_error.includes('timeout') || apiRes.__curl_error.includes('abort')) {
                errorType = 'timeout';
              } else if (apiRes.__curl_error.includes('fetch') || apiRes.__curl_error.includes('network')) {
                errorType = 'network';
              } else {
                errorType = 'curl_error';
              }
              errorDetail = apiRes.__curl_error;
            } else if (apiRes.__status === 429) {
              errorType = 'rate_limit';
              errorDetail = 'API rate limit exceeded';
            } else if (apiRes.__status === 404) {
              errorType = 'not_found';
              errorDetail = 'Container not found in API';
            } else if (apiRes.__status >= 500) {
              errorType = 'api_server_error';
              errorDetail = `API returned status ${apiRes.__status}`;
            } else if (apiRes.error) {
              errorType = 'api_error';
              errorDetail = typeof apiRes.error === 'string' ? apiRes.error : JSON.stringify(apiRes.error);
            } else if (apiRes.message) {
              errorType = 'api_message';
              errorDetail = apiRes.message;
            }
            
            const errorMsg = `${errorType}: ${errorDetail}`.substring(0, 255);
            
            // Log detailed error for debugging
            console.log(`[refresh_sea_tracking] Error for ${containerId}:`, {
              shipping_line: shippingLine || 'NOT_DETECTED',
              error_type: errorType,
              error_detail: errorDetail,
              api_status: apiRes.__status,
              curl_error: apiRes.__curl_error,
              api_error: apiRes.error,
              api_message: apiRes.message
            });
            
            // ===== MBL SIBLING FALLBACK: Track via non-leasing sibling container =====
            const isPrefixNotFoundError = errorDetail.includes('Prefix not found') || errorType === 'api_error';
            
            if (isLeasingContainer && isPrefixNotFoundError && mblId && mblId.length >= 10) {
              console.log(`[refresh_sea_tracking] Trying sibling fallback for leasing container ${containerId} via MBL ${mblId}`);
              
              // Step 1: Get list of containers from MBL
              const bolApiRes = await jcJsonWithRetry(
                `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(mblId)}`,
                { shipping_line: apiShippingLine },
                25000,
                2,  // max retries
                2000 // backoff ms
              );
              
              let siblingSuccess = false;
              
              if (!bolApiRes.__curl_error && !bolApiRes.error && bolApiRes.data?.associated_container_numbers?.length > 0) {
                const siblings = bolApiRes.data.associated_container_numbers;
                console.log(`[refresh_sea_tracking] Found ${siblings.length} sibling containers for MBL ${mblId}: ${siblings.slice(0, 5).join(', ')}...`);
                
                // Step 2: Find a non-leasing sibling to track
                const nonLeasingSibling = siblings.find((ctr: string) => {
                  const prefix = ctr.substring(0, 4).toUpperCase();
                  return !LEASING_CONTAINER_PREFIXES.has(prefix) && ctr !== containerId;
                });
                
                if (nonLeasingSibling) {
                  console.log(`[refresh_sea_tracking] Tracking non-leasing sibling ${nonLeasingSibling} to get data for ${containerId}`);
                  
                  // Step 3: Track the sibling container
                  const siblingApiRes = await jcJsonWithRetry(
                    `http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(nonLeasingSibling)}`,
                    { shipping_line: apiShippingLine },
                    25000,
                    2,  // max retries
                    2000 // backoff ms
                  );
                  
                  if (!siblingApiRes.__curl_error && !siblingApiRes.error && siblingApiRes.data) {
                    const sibData = siblingApiRes.data;
                    
                    // Step 4: Apply sibling data to our leasing container
                    const vesselName = sibData.current_vessel_name || sibData.last_vessel_name || sibData.vessel?.name || null;
                    const containerStatus = sibData.container_status || null;
                    const lastEvent = sibData.last_movement?.description || containerStatus;
                    
                    // Priorizar busca de IMO pelo nome do navio
                    let vesselImo = null;
                    if (vesselName) {
                      vesselImo = await findVesselImo(vesselName);
                    }
                    if (!vesselImo) {
                      vesselImo = sibData.vessel?.imo || sibData.current_vessel_imo || null;
                    }
                    
                    // Extrair transshipment_port do sibling
                    const sibTransshipmentSources: string[] = [];
                    if (sibData.transshipment_port) sibTransshipmentSources.push(sibData.transshipment_port);
                    if (sibData.via_port) sibTransshipmentSources.push(sibData.via_port);
                    if (sibData.transit_port) sibTransshipmentSources.push(sibData.transit_port);
                    if (sibData.route?.via) sibTransshipmentSources.push(sibData.route.via);
                    if (sibData.routing?.transshipment_port) sibTransshipmentSources.push(sibData.routing.transshipment_port);
                    const sibTransshipment = [...new Set(sibTransshipmentSources.filter(p => p && p.trim()).map(p => p.trim().toUpperCase()))].join(', ') || null;
                    
                    console.log(`[refresh_sea_tracking] Sibling ${nonLeasingSibling} data: status=${containerStatus}, vessel=${vesselName}, eta=${sibData.eta_final_destination || sibData.eta}, transshipment=${sibTransshipment}`);
                    
                    if (containerStatus) {
                      await client.execute(`
                        UPDATE dados_dachser.t_tracking_sea 
                        SET 
                          container_status = ?,
                          origem = COALESCE(?, origem),
                          destino = COALESCE(?, destino),
                          eta = ?,
                          navio = COALESCE(?, navio),
                          vessel_imo = COALESCE(?, vessel_imo),
                          last_event = ?,
                          shipping_line = COALESCE(?, shipping_line),
                          transshipment_port = COALESCE(?, transshipment_port),
                          last_check = NOW(),
                          last_error = NULL,
                          sibling_synced = 1,
                          sibling_synced_at = NOW()
                        WHERE id = ?
                      `, [
                        containerStatus,
                        sibData.loading_port || sibData.shipped_from || null,
                        sibData.discharging_port || sibData.shipped_to || null,
                        sibData.eta_final_destination || sibData.eta ? new Date(sibData.eta_final_destination || sibData.eta) : null,
                        vesselName,
                        vesselImo,
                        lastEvent || containerStatus,
                        shippingLine ? normalizeShippingLine(shippingLine) : null,
                        sibTransshipment,
                        row.id
                      ]);
                      
                      updated++;
                      processed++;
                      siblingSuccess = true;
                      await new Promise(r => setTimeout(r, 100));
                      continue; // Success via sibling!
                    }
                  } else {
                    console.log(`[refresh_sea_tracking] Sibling ${nonLeasingSibling} tracking failed:`, siblingApiRes.error || siblingApiRes.__curl_error);
                  }
                } else {
                  // All siblings are also leasing - check if any already have data in DB
                  console.log(`[refresh_sea_tracking] No non-leasing siblings found for ${containerId}, checking DB for existing data...`);
                  
                  const dbSibling = await client.query(`
                    SELECT container_status, navio, vessel_imo, eta, origem, destino, last_event
                    FROM dados_dachser.t_tracking_sea
                    WHERE mbl_id = ?
                      AND container_status IS NOT NULL
                      AND container_status != ''
                      AND id != ?
                      AND (last_error IS NULL OR last_error = '' OR last_error LIKE '%success%')
                    LIMIT 1
                  `, [mblId, row.id]);
                  
                  if (dbSibling.length > 0 && dbSibling[0].container_status) {
                    const sib = dbSibling[0];
                    console.log(`[refresh_sea_tracking] Found DB sibling with data: status=${sib.container_status}, vessel=${sib.navio}`);
                    
                    await client.execute(`
                      UPDATE dados_dachser.t_tracking_sea 
                      SET 
                        container_status = ?,
                        origem = COALESCE(?, origem),
                        destino = COALESCE(?, destino),
                        eta = COALESCE(?, eta),
                        navio = COALESCE(?, navio),
                        vessel_imo = COALESCE(?, vessel_imo),
                        last_event = ?,
                        last_check = NOW(),
                        last_error = NULL,
                        sibling_synced = 1,
                        sibling_synced_at = NOW()
                      WHERE id = ?
                    `, [
                      sib.container_status,
                      sib.origem,
                      sib.destino,
                      sib.eta,
                      sib.navio,
                      sib.vessel_imo,
                      sib.last_event || sib.container_status,
                      row.id
                    ]);
                    
                    updated++;
                    processed++;
                    siblingSuccess = true;
                    continue;
                  } else {
                    console.log(`[refresh_sea_tracking] No sibling with data found in DB for MBL ${mblId}`);
                    
                    // ===== NEW FALLBACK: Use MBL/BOL API data directly =====
                    // When no siblings have data, extract what we can from the BOL response itself
                    if (bolApiRes.data) {
                      const bolData = bolApiRes.data;
                      
                      // Extract available data from BOL response
                      const bolContainerStatus = bolData.status || bolData.bol_status || bolData.shipment_status || null;
                      const bolVessel = bolData.vessel || bolData.vessel_name || bolData.current_vessel || null;
                      const bolVesselImo = bolData.vessel_imo || bolData.imo || null;
                      const bolEta = bolData.eta || bolData.eta_final || bolData.eta_destination || null;
                      const bolPol = bolData.pol || bolData.port_of_loading || bolData.origin || null;
                      const bolPod = bolData.pod || bolData.port_of_discharge || bolData.destination || null;
                      const bolVoyage = bolData.voyage || bolData.voyage_number || null;
                      
                      // Check if we have useful data from BOL endpoint
                      if (bolContainerStatus || bolVessel || bolEta) {
                        console.log(`[refresh_sea_tracking] Using MBL data as fallback for ${containerId}: status=${bolContainerStatus}, vessel=${bolVessel}, eta=${bolEta}`);
                        
                        const lastEventFromBol = bolContainerStatus || (bolVessel ? `Em trânsito - ${bolVessel}` : 'Dados via MBL');
                        
                        await client.execute(`
                          UPDATE dados_dachser.t_tracking_sea 
                          SET 
                            container_status = COALESCE(?, container_status, 'Via MBL'),
                            origem = COALESCE(?, origem),
                            destino = COALESCE(?, destino),
                            eta = COALESCE(?, eta),
                            navio = COALESCE(?, navio),
                            vessel_imo = COALESCE(?, vessel_imo),
                            last_event = ?,
                            last_check = NOW(),
                            last_error = NULL,
                            sibling_synced = 1,
                            sibling_synced_at = NOW()
                          WHERE id = ?
                        `, [
                          bolContainerStatus,
                          bolPol,
                          bolPod,
                          bolEta ? new Date(bolEta) : null,
                          bolVessel,
                          bolVesselImo,
                          lastEventFromBol,
                          row.id
                        ]);
                        
                        // Record history event for MBL-based update
                        try {
                          await client.execute(`
                            INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
                            (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, container_status, eta, source, raw_data)
                            VALUES (?, ?, 'MBL_SYNC', ?, NOW(), ?, ?, ?, ?, ?, 'MBL_API', ?)
                          `, [
                            mblId,
                            containerId,
                            lastEventFromBol ? lastEventFromBol.substring(0, 500) : 'Dados sincronizados via MBL',
                            bolPod || bolPol || null,
                            bolVessel ? bolVessel.substring(0, 100) : null,
                            bolVoyage ? bolVoyage.substring(0, 50) : null,
                            bolContainerStatus,
                            bolEta ? new Date(bolEta) : null,
                            JSON.stringify({ source: 'mbl_fallback', bol_data: bolData })
                          ]);
                        } catch (histErr: any) {
                          console.log(`[refresh_sea_tracking] MBL history insert failed: ${histErr.message}`);
                        }
                        
                        updated++;
                        processed++;
                        siblingSuccess = true;
                        continue;
                      } else {
                        console.log(`[refresh_sea_tracking] MBL ${mblId} has no useful tracking data (status/vessel/eta all empty)`);
                      }
                    }
                  }
                }
              } else {
                // MBL lookup returned but no containers - still try to use BOL data directly
                console.log(`[refresh_sea_tracking] MBL ${mblId} lookup returned no containers, trying BOL data as fallback...`);
                
                // Even without associated_container_numbers, the BOL response might have shipment data
                if (bolApiRes.data) {
                  const bolData = bolApiRes.data;
                  
                  const bolContainerStatus = bolData.status || bolData.bol_status || bolData.shipment_status || null;
                  const bolVessel = bolData.vessel || bolData.vessel_name || bolData.current_vessel || null;
                  const bolVesselImo = bolData.vessel_imo || bolData.imo || null;
                  const bolEta = bolData.eta || bolData.eta_final || bolData.eta_destination || null;
                  const bolPol = bolData.pol || bolData.port_of_loading || bolData.origin || null;
                  const bolPod = bolData.pod || bolData.port_of_discharge || bolData.destination || null;
                  
                  if (bolContainerStatus || bolVessel || bolEta) {
                    console.log(`[refresh_sea_tracking] Using MBL-only data for ${containerId}: status=${bolContainerStatus}, vessel=${bolVessel}, eta=${bolEta}`);
                    
                    const lastEventFromBol = bolContainerStatus || (bolVessel ? `Em trânsito - ${bolVessel}` : 'Dados via MBL');
                    
                    await client.execute(`
                      UPDATE dados_dachser.t_tracking_sea 
                      SET 
                        container_status = COALESCE(?, container_status, 'Via MBL'),
                        origem = COALESCE(?, origem),
                        destino = COALESCE(?, destino),
                        eta = COALESCE(?, eta),
                        navio = COALESCE(?, navio),
                        vessel_imo = COALESCE(?, vessel_imo),
                        last_event = ?,
                        last_check = NOW(),
                        last_error = NULL,
                        sibling_synced = 1,
                        sibling_synced_at = NOW()
                      WHERE id = ?
                    `, [
                      bolContainerStatus,
                      bolPol,
                      bolPod,
                      bolEta ? new Date(bolEta) : null,
                      bolVessel,
                      bolVesselImo,
                      lastEventFromBol,
                      row.id
                    ]);
                    
                    updated++;
                    processed++;
                    siblingSuccess = true;
                    continue;
                  }
                }
                
                console.log(`[refresh_sea_tracking] MBL ${mblId} has no useful data in BOL response`);
              }
              
              if (siblingSuccess) continue;
            }
            
            // Update last_check and save error to last_error column
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET last_check = NOW(), last_error = ?
              WHERE id = ?
            `, [errorMsg, row.id]);
            errors++;
          }

        processed++;
          await new Promise(r => setTimeout(r, 100)); // Reduced delay since API handles it
        }

        // ===== SIBLING SYNC: Propagar dados de containers bem-sucedidos para pendentes do mesmo MBL =====
        console.log('[refresh_sea_tracking] Running sibling sync...');
        let siblingSynced = 0;
        try {
          // Primeiro, identificar MBLs que têm containers com e sem dados
          const mblsWithMixedStatus = await client.query(`
            SELECT 
              mbl_id,
              SUM(CASE WHEN container_status IS NOT NULL AND container_status != '' AND (last_error IS NULL OR last_error = '') THEN 1 ELSE 0 END) as with_data,
              SUM(CASE WHEN container_status IS NULL OR container_status = '' OR (last_error IS NOT NULL AND last_error != '') THEN 1 ELSE 0 END) as without_data
            FROM dados_dachser.t_tracking_sea
            WHERE active = 1
              AND mbl_id IS NOT NULL 
              AND mbl_id != ''
            GROUP BY mbl_id
            HAVING with_data > 0 AND without_data > 0
          `);
          
          console.log(`[refresh_sea_tracking] Found ${mblsWithMixedStatus.length} MBLs with mixed status`);
          
          for (const mbl of mblsWithMixedStatus) {
            const mblId = mbl.mbl_id;
            
            // Buscar o "melhor" container deste MBL (mais recente com dados completos)
            const bestContainers = await client.query(`
              SELECT 
                container_status, navio, vessel_imo, eta, last_event, origem, destino, shipping_line
              FROM dados_dachser.t_tracking_sea
              WHERE active = 1
                AND mbl_id = ?
                AND container_status IS NOT NULL
                AND container_status != ''
                AND (last_error IS NULL OR last_error = '')
              ORDER BY last_check DESC
              LIMIT 1
            `, [mblId]);
            
            if (bestContainers.length === 0) continue;
            
            const best = bestContainers[0];
            
            // Atualizar containers pendentes deste MBL - SOBRESCREVER quando há erro (não apenas COALESCE)
            const updateResult = await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET 
                container_status = ?,
                navio = COALESCE(?, navio),
                vessel_imo = COALESCE(?, vessel_imo),
                eta = COALESCE(?, eta),
                last_event = COALESCE(?, last_event),
                origem = COALESCE(?, origem),
                destino = COALESCE(?, destino),
                shipping_line = COALESCE(?, shipping_line),
                sibling_synced = 1,
                sibling_synced_at = NOW(),
                last_error = NULL
              WHERE active = 1
                AND mbl_id = ?
                AND (
                  container_status IS NULL 
                  OR container_status = ''
                  OR container_status = 'PENDING'
                  OR (last_error IS NOT NULL AND last_error != '' AND last_error NOT LIKE 'sibling%' AND last_error NOT LIKE 'mbl_fallback%')
                )
            `, [
              best.container_status,
              best.navio,
              best.vessel_imo,
              best.eta,
              best.last_event,
              best.origem,
              best.destino,
              best.shipping_line,
              mblId
            ]);
            
            siblingSynced += updateResult.affectedRows || 0;
          }
          
          console.log(`[refresh_sea_tracking] Sibling sync complete: ${siblingSynced} containers synced`);
        } catch (siblingError: any) {
          console.error('[refresh_sea_tracking] Sibling sync error:', siblingError.message);
        }

        // Count remaining containers that still need update
        const remainingResult = await client.query(`
          SELECT COUNT(*) as cnt
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1
            AND container IS NOT NULL
            AND container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '')
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
            AND (last_check IS NULL OR last_check < DATE_SUB(NOW(), INTERVAL ? HOUR))
        `, [staleHours]);
        
        const remaining = remainingResult[0]?.cnt || 0;

        await client.close();
        console.log(`[refresh_sea_tracking] Batch done: ${updated} updated (bolFirst=${bolFirstSuccess}, dbSibling=${dbSiblingSuccess}), ${errors} errors, ${siblingSynced} sibling synced, ${leasingDetected} leasing, ${imoLookups} IMO lookups, ${remaining} remaining, ~${apiCallsSaved} API calls saved`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          updated, 
          errors, 
          processed,
          siblingSynced,
          leasingDetected,
          bolFirstSuccess,      // Leasing containers tracked via BOL-first strategy
          dbSiblingSuccess,     // Leasing containers tracked via DB sibling (0 API calls)
          imoLookups,           // IMO lookups via vessel/finder API
          remaining,
          batchSize,
          apiCallsSaved,
          totalPending,
          optimization: 'bol_first_for_leasing_with_imo_lookup',
          elapsedMs: Date.now() - startTime
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[refresh_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Get containers with errors for diagnostics =====
    if (action === 'get_containers_with_errors') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Get containers with errors grouped by error type
        const errorsByType = await client.query(`
          SELECT 
            SUBSTRING_INDEX(last_error, ':', 1) as error_type,
            COUNT(*) as count
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1 
            AND last_error IS NOT NULL
          GROUP BY SUBSTRING_INDEX(last_error, ':', 1)
          ORDER BY count DESC
        `);

        // Get detailed list of containers with errors (limited to 100)
        const containersWithErrors = await client.query(`
          SELECT 
            id, container, mbl_id, shipping_line, last_error, last_check,
            consignee, tipo_processo
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1 
            AND last_error IS NOT NULL
          ORDER BY last_check DESC
          LIMIT 100
        `);

        // Get containers without detected shipping line
        const noShippingLine = await client.query(`
          SELECT 
            id, container, mbl_id, last_error, last_check
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1 
            AND (shipping_line IS NULL OR shipping_line = '')
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
          ORDER BY last_check DESC
          LIMIT 50
        `);

        // Get unique prefixes from containers without shipping line (for prefix mapping)
        const unknownPrefixes = await client.query(`
          SELECT 
            UPPER(SUBSTRING(container, 1, 4)) as prefix,
            COUNT(*) as count
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1 
            AND (shipping_line IS NULL OR shipping_line = '')
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
          GROUP BY UPPER(SUBSTRING(container, 1, 4))
          ORDER BY count DESC
        `);

        // Get summary statistics
        const stats = await client.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) as with_errors,
            SUM(CASE WHEN last_error IS NULL AND container_status IS NOT NULL THEN 1 ELSE 0 END) as tracked_ok,
            SUM(CASE WHEN shipping_line IS NULL OR shipping_line = '' THEN 1 ELSE 0 END) as no_shipping_line
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
        `);

        await client.close();

        return new Response(JSON.stringify({ 
          success: true,
          stats: stats[0] || {},
          errorsByType,
          containersWithErrors: containersWithErrors.map((row: any) => ({
            id: row.id,
            container: row.container,
            mbl_id: row.mbl_id,
            shipping_line: row.shipping_line,
            last_error: row.last_error,
            last_check: row.last_check,
            consignee: row.consignee,
            tipo_processo: row.tipo_processo
          })),
          noShippingLine: noShippingLine.map((row: any) => ({
            id: row.id,
            container: row.container,
            mbl_id: row.mbl_id,
            last_error: row.last_error,
            last_check: row.last_check
          })),
          unknownPrefixes: unknownPrefixes.map((row: any) => ({
            prefix: row.prefix,
            count: Number(row.count)
          }))
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_containers_with_errors] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }


    if (action === 'enrich_sea_containers') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Mapping MBL prefixes to shipping line codes for API
      const MBL_PREFIX_TO_SHIPPING_LINE: Record<string, string> = {
        'COSU': 'COSCO', 'CSNU': 'COSCO', 'CBHU': 'COSCO', 'OOLU': 'COSCO',
        // Hapag-Lloyd - all possible formats (BC, NG, LGB, LE, HAM, SS são códigos de escritório)
        'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD', 'HLCS': 'HAPAG_LLOYD',
        'SAHL': 'HAPAG_LLOYD', // South Africa prefix
        'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK',
        'MSCU': 'MSC', 'MEDU': 'MSC',
        'CMAU': 'CMA_CGM', 'CCLU': 'CMA_CGM', 'CXDU': 'CMA_CGM',
        'ONEY': 'ONE', 'ONEU': 'ONE', 'ONEYHAMA': 'ONE', 'ONEYHAM': 'ONE',
        'HDMU': 'HMM', 'HMMU': 'HMM',
        'EISU': 'EVERGREEN', 'EITU': 'EVERGREEN', 'EGSU': 'EVERGREEN', 'EGHU': 'EVERGREEN', 'EBKG': 'EVERGREEN',
        'YMLU': 'YANG_MING', 'YMMU': 'YANG_MING',
        'ZIMU': 'ZIM', 'ZCSU': 'ZIM',
        'GLNL': 'HAPAG_LLOYD', 'GLSL': 'CMA_CGM',
        // Regional Container Lines (Bangkok)
        'BKKM': 'RCL', 'BKMR': 'RCL',
        // Sinotrans Container Lines
        'GLHK': 'SINOTRANS', 'SNKO': 'SINOTRANS', 'SNTU': 'SINOTRANS',
      };

      // Normalize MBL to try alternative formats for API calls
      const getMblVariations = (mblId: string): string[] => {
        const variations = [mblId];
        const upperMbl = mblId.toUpperCase();
        
        // Hapag-Lloyd: remover códigos de escritório (BC, NG, LGB, LE, HAM, SS)
        // HLCUBC1234567 → HLCU1234567
        // HLCUNG1234567 → HLCU1234567
        // HLCULGB1234567 → HLCU1234567
        // HLCULE1234567 → HLCU1234567
        const hapagOfficeCodes = ['BC', 'NG', 'LGB', 'LE', 'HAM', 'SS', 'NYC', 'CHI', 'ATL', 'HOU', 'SEA', 'LAX'];
        for (const code of hapagOfficeCodes) {
          const pattern = new RegExp(`^HLCU${code}(\\d+.*)$`, 'i');
          const match = upperMbl.match(pattern);
          if (match) {
            variations.push(`HLCU${match[1]}`);
            break;
          }
        }
        
        // ONE: ONEYHAMFA* -> try ONEYHAMA* and ONEY*
        if (upperMbl.startsWith('ONEYHAMFA')) {
          variations.push(upperMbl.replace('ONEYHAMFA', 'ONEYHAMA'));
          variations.push(upperMbl.replace('ONEYHAMFA', 'ONEY'));
        }
        if (upperMbl.startsWith('ONEYHAMA')) {
          variations.push(upperMbl.replace('ONEYHAMA', 'ONEY'));
        }
        
        return [...new Set(variations)]; // Remove duplicates
      };

      const detectShippingLineFromMbl = (mblId: string): string | null => {
        if (!mblId) return null;
        const upperMbl = mblId.toUpperCase();
        
        // Try exact 4-char prefix first
        const prefix4 = upperMbl.substring(0, 4);
        if (MBL_PREFIX_TO_SHIPPING_LINE[prefix4]) {
          return MBL_PREFIX_TO_SHIPPING_LINE[prefix4];
        }
        
        // Try longer prefixes for special cases like ONEYHAMA
        for (const prefix of Object.keys(MBL_PREFIX_TO_SHIPPING_LINE)) {
          if (upperMbl.startsWith(prefix)) {
            return MBL_PREFIX_TO_SHIPPING_LINE[prefix];
          }
        }
        
        return null;
      };

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      // Prefixes that are booking references or internal codes - should NOT be enriched
      const SKIP_ENRICHMENT_PREFIXES = ['EBKG', 'BKNG', 'GLNL', 'GLSL', 'GLDL', 'BRSA'];
      
      const shouldSkipEnrichment = (mblId: string): { skip: boolean; reason?: string } => {
        if (!mblId) return { skip: true, reason: 'empty_mbl' };
        const prefix = mblId.substring(0, 4).toUpperCase();
        if (SKIP_ENRICHMENT_PREFIXES.includes(prefix)) {
          return { skip: true, reason: `booking_reference_${prefix}` };
        }
        // Skip HAWBs brasileiros
        if (/^BR[A-Za-z]{3}/i.test(mblId)) {
          return { skip: true, reason: 'hawb_brasileiro' };
        }
        return { skip: false };
      };

      // Batch processing parameters to avoid timeout
      const batchSize = parseInt(url.searchParams.get('batch_size') || '20', 10);
      const maxTimeMs = parseInt(url.searchParams.get('max_time_ms') || '60000', 10);
      const startTime = Date.now();

      try {
        // Fetch MBLs with container = 'PENDENTE'
        const pendingMbls = await client.query(`
          SELECT DISTINCT mbl_id, consignee, email_analista, email_cliente, tipo_processo
          FROM dados_dachser.t_tracking_sea
          WHERE active = 1 AND (container = 'PENDENTE' OR container IS NULL OR container = '')
        `);

        console.log(`[enrich_sea_containers] Found ${pendingMbls.length} MBLs with pending containers (batch_size=${batchSize}, max_time=${maxTimeMs}ms)`);

        let enriched = 0;
        let errors = 0;
        let noContainers = 0;
        let skipped = 0;
        let processed = 0;
        const details: any[] = [];

        for (const row of pendingMbls) {
          // Check if we've exceeded time limit
          if (Date.now() - startTime > maxTimeMs) {
            console.log(`[enrich_sea_containers] Time limit reached after ${processed} MBLs (${Date.now() - startTime}ms)`);
            break;
          }

          // Check if we've hit batch size limit (only count API calls, not skips)
          if (enriched + errors + noContainers >= batchSize) {
            console.log(`[enrich_sea_containers] Batch size reached: ${batchSize}`);
            break;
          }

          const mblId = row.mbl_id;
          processed++;
          
          // Check if this MBL should be skipped (booking reference, internal code, HAWB)
          const skipCheck = shouldSkipEnrichment(mblId);
          if (skipCheck.skip) {
            console.log(`[enrich_sea_containers] Skipping ${mblId}: ${skipCheck.reason}`);
            // Marcar como IGNORADO para não reprocessar
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET container = 'IGNORADO'
              WHERE mbl_id = ? AND (container = 'PENDENTE' OR container IS NULL OR container = '')
            `, [mblId]);
            details.push({ mbl: mblId, status: 'skipped', reason: skipCheck.reason });
            skipped++;
            continue;
          }

          const shippingLine = detectShippingLineFromMbl(mblId);

          // Se armador desconhecido, tentar API sem especificar shipping_line (auto-detect)
          let effectiveShippingLine = shippingLine;
          if (!shippingLine) {
            console.log(`[enrich_sea_containers] Unknown shipping line for MBL ${mblId}, will try API auto-detect`);
            effectiveShippingLine = null; // API will try to auto-detect
          }

          try {
            // Try different MBL format variations
            const mblVariations = getMblVariations(mblId);
            let containers: string[] = [];
            let successVariation = mblId;
            let lastApiError: string | null = null;
            
            console.log(`[enrich_sea_containers] Trying ${mblVariations.length} variations for MBL ${mblId}: ${mblVariations.join(', ')}`);
            
            for (const mblVariation of mblVariations) {
              // Call JsonCargo API to get containers for this MBL variation
              const apiParams: Record<string, string> = {};
              if (effectiveShippingLine) {
                apiParams.shipping_line = effectiveShippingLine;
              }
              const apiRes = await jcJson(
                `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(mblVariation)}`,
                apiParams
              );

              if (apiRes.__curl_error) {
                console.log(`[enrich_sea_containers] API error for MBL variation ${mblVariation}: ${apiRes.__curl_error}`);
                lastApiError = apiRes.__curl_error;
                continue; // Try next variation
              }

              const data = apiRes.data || apiRes;
              const foundContainers = data.associated_container_numbers || [];
              
              console.log(`[enrich_sea_containers] API response for ${mblVariation}: ${JSON.stringify(data).substring(0, 300)}`);
              
              if (foundContainers.length > 0) {
                containers = foundContainers;
                successVariation = mblVariation;
                console.log(`[enrich_sea_containers] Success with variation ${mblVariation}: found ${containers.length} containers`);
                break; // Found containers, stop trying variations
              }
              
              // Wait before trying next variation
              await new Promise(r => setTimeout(r, 300));
            }
            
            // If all variations failed with API error
            if (containers.length === 0 && lastApiError) {
              console.log(`[enrich_sea_containers] All variations failed for MBL ${mblId}: ${lastApiError}`);
              details.push({ mbl: mblId, status: 'api_error', error: lastApiError, variations_tried: mblVariations.length });
              errors++;
              continue;
            }

            if (containers.length === 0) {
              console.log(`[enrich_sea_containers] No containers found for MBL ${mblId} after trying ${mblVariations.length} variations`);
              // Marcar como NAO_ENCONTRADO para não reprocessar
              await client.execute(`
                UPDATE dados_dachser.t_tracking_sea 
                SET container = 'NAO_ENCONTRADO'
                WHERE mbl_id = ? AND (container = 'PENDENTE' OR container IS NULL OR container = '')
              `, [mblId]);
              details.push({ mbl: mblId, status: 'no_containers' });
              noContainers++;
              continue;
            }

            console.log(`[enrich_sea_containers] Found ${containers.length} containers for MBL ${mblId}: ${containers.join(', ')}`);

            // Delete the PENDENTE record for this MBL
            await client.execute(`
              DELETE FROM dados_dachser.t_tracking_sea 
              WHERE mbl_id = ? AND (container = 'PENDENTE' OR container IS NULL OR container = '')
            `, [mblId]);

            // Insert new records for each container found
            for (const container of containers) {
              if (!container || container.trim() === '') continue;
              
              await client.execute(`
                INSERT INTO dados_dachser.t_tracking_sea 
                  (mbl_id, container, tipo_processo, consignee, email_analista, email_cliente, active, shipping_line)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                ON DUPLICATE KEY UPDATE
                  tipo_processo = VALUES(tipo_processo),
                  consignee = VALUES(consignee),
                  email_analista = VALUES(email_analista),
                  email_cliente = VALUES(email_cliente),
                  shipping_line = COALESCE(shipping_line, VALUES(shipping_line)),
                  active = 1
              `, [
                mblId,
                container.toUpperCase().trim(),
                row.tipo_processo || 'SEA IMPORT',
                row.consignee || null,
                row.email_analista || null,
                row.email_cliente || null,
                normalizeShippingLine(effectiveShippingLine || 'UNKNOWN')
              ]);
            }

            enriched++;
            details.push({ mbl: mblId, status: 'enriched', containers: containers.length });

          } catch (apiError: any) {
            console.error(`[enrich_sea_containers] Error processing MBL ${mblId}:`, apiError);
            details.push({ mbl: mblId, status: 'error', error: apiError.message });
            errors++;
          }

          // Rate limiting - wait 500ms between API calls
          await new Promise(r => setTimeout(r, 500));
        }

        await client.close();
        
        const remaining = pendingMbls.length - processed;
        const timeElapsed = Date.now() - startTime;
        
        console.log(`[enrich_sea_containers] Batch completed: enriched=${enriched}, skipped=${skipped}, noContainers=${noContainers}, errors=${errors}, remaining=${remaining}, time=${timeElapsed}ms`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          enriched,
          skipped,
          noContainers,
          errors,
          processed,
          total: pendingMbls.length,
          remaining,
          timeElapsed,
          message: `${enriched} MBLs enriquecidos, ${skipped} ignorados. ${remaining} restantes.`,
          details
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[enrich_sea_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Manually add containers to an MBL =====
    // Use this when the JSONCargo BOL lookup fails but you know the containers
    if (action === 'manual_add_containers') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Parse body for POST requests
      let body: any = {};
      if (req.method === 'POST') {
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const mblId = body.mbl_id;
      const containers: string[] = body.containers || [];
      const shippingLine = body.shipping_line || null;

      if (!mblId) {
        return new Response(JSON.stringify({ error: 'mbl_id é obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!containers.length) {
        return new Response(JSON.stringify({ error: 'containers é obrigatório (array de container IDs)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate container format (basic validation)
      const validContainers: string[] = [];
      const invalidContainers: string[] = [];
      for (const c of containers) {
        const normalized = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalized.length >= 10 && normalized.length <= 12 && /^[A-Z]{4}\d{6,8}$/.test(normalized)) {
          validContainers.push(normalized);
        } else {
          invalidContainers.push(c);
        }
      }

      if (validContainers.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'Nenhum container válido fornecido',
          invalidContainers,
          hint: 'Containers devem seguir formato ISO: 4 letras + 6-7 dígitos (ex: CSNU7842551)'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        console.log(`[manual_add_containers] Adding ${validContainers.length} containers to MBL ${mblId}: ${validContainers.join(', ')}`);

        // 1. Get existing MBL data for tipo_processo, consignee, etc.
        const existingRows = await client.query(`
          SELECT mbl_id, tipo_processo, consignee, email_analista, email_cliente, shipping_line
          FROM dados_dachser.t_tracking_sea
          WHERE mbl_id = ?
          LIMIT 1
        `, [mblId]);

        const existingData = existingRows[0] || {};
        const effectiveShippingLine = shippingLine || existingData.shipping_line || 'UNKNOWN';

        // 2. Delete PENDENTE/NAO_ENCONTRADO/empty records for this MBL
        const deleteResult = await client.execute(`
          DELETE FROM dados_dachser.t_tracking_sea 
          WHERE mbl_id = ? 
            AND (container IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '') OR container IS NULL)
        `, [mblId]);

        console.log(`[manual_add_containers] Deleted ${deleteResult.affectedRows || 0} placeholder records for MBL ${mblId}`);

        // 3. Insert each valid container
        let inserted = 0;
        let updated = 0;
        for (const container of validContainers) {
          const result = await client.execute(`
            INSERT INTO dados_dachser.t_tracking_sea 
              (mbl_id, container, tipo_processo, consignee, email_analista, email_cliente, active, shipping_line)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE
              tipo_processo = COALESCE(VALUES(tipo_processo), tipo_processo),
              consignee = COALESCE(VALUES(consignee), consignee),
              email_analista = COALESCE(VALUES(email_analista), email_analista),
              email_cliente = COALESCE(VALUES(email_cliente), email_cliente),
              shipping_line = COALESCE(VALUES(shipping_line), shipping_line),
              active = 1
          `, [
            mblId,
            container,
            existingData.tipo_processo || 'SEA IMPORT',
            existingData.consignee || null,
            existingData.email_analista || null,
            existingData.email_cliente || null,
            normalizeShippingLine(effectiveShippingLine)
          ]);

          if (result.affectedRows === 1) {
            inserted++;
          } else if (result.affectedRows === 2) {
            updated++;
          }
        }

        await client.close();

        console.log(`[manual_add_containers] Completed for MBL ${mblId}: inserted=${inserted}, updated=${updated}`);

        return new Response(JSON.stringify({ 
          success: true,
          mbl_id: mblId,
          containers_added: validContainers,
          inserted,
          updated,
          invalid_skipped: invalidContainers,
          message: `${validContainers.length} containers adicionados ao MBL ${mblId}. Use refresh_sea_tracking para buscar tracking.`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (e: any) {
        await client.close();
        console.error('[manual_add_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Deactivate MBLs that only have invalid containers or are booking references =====
    if (action === 'deactivate_invalid_mbls') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // 1. Deactivate booking references (EBKG, GLNL, GLSL, etc.) that shouldn't be tracked
        const bookingResult = await client.execute(`
          UPDATE dados_dachser.t_tracking_sea
          SET active = 0, last_error = 'Booking reference - não rastreável'
          WHERE active = 1
          AND (
            LEFT(mbl_id, 4) IN ('EBKG', 'BKNG', 'GLNL', 'GLSL', 'GLDL', 'BRSA')
            OR mbl_id REGEXP '^BR[A-Za-z]{3}'
          )
        `);
        
        const bookingDeactivated = bookingResult.affectedRows || 0;
        console.log(`[deactivate_invalid_mbls] Deactivated ${bookingDeactivated} booking references`);

        // 2. Deactivate MBLs that only have invalid containers (no valid container format)
        const invalidResult = await client.execute(`
          UPDATE dados_dachser.t_tracking_sea t1
          INNER JOIN (
            SELECT mbl_id
            FROM dados_dachser.t_tracking_sea
            WHERE active = 1
            GROUP BY mbl_id
            HAVING SUM(CASE 
              WHEN container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '') 
              AND container IS NOT NULL 
              AND container REGEXP '^[A-Z]{4}[0-9]{7}$'
              THEN 1 ELSE 0 
            END) = 0
          ) t2 ON t1.mbl_id = t2.mbl_id
          SET t1.active = 0, t1.last_error = 'Sem containers válidos'
          WHERE t1.active = 1
        `);
        
        const invalidDeactivated = invalidResult.affectedRows || 0;
        console.log(`[deactivate_invalid_mbls] Deactivated ${invalidDeactivated} MBLs without valid containers`);

        await client.close();
        
        return new Response(JSON.stringify({ 
          success: true, 
          bookingDeactivated,
          invalidDeactivated,
          totalDeactivated: bookingDeactivated + invalidDeactivated,
          message: `${bookingDeactivated} booking refs + ${invalidDeactivated} sem containers válidos = ${bookingDeactivated + invalidDeactivated} desativados`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[deactivate_invalid_mbls] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Cleanup orphan PENDENTE containers from MBLs that already have valid containers =====
    if (action === 'cleanup_orphan_pendentes') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Delete PENDENTE containers from MBLs that already have at least one valid container
        // A valid container is one that is NOT 'PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', empty, or null
        const result = await client.execute(`
          DELETE FROM dados_dachser.t_tracking_sea
          WHERE container IN ('PENDENTE', '')
          AND mbl_id IN (
            SELECT DISTINCT mbl_id FROM (
              SELECT mbl_id 
              FROM dados_dachser.t_tracking_sea 
              WHERE container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '') 
              AND container IS NOT NULL
              AND container REGEXP '^[A-Z]{4}[0-9]{7}$'
            ) AS mbls_with_valid_containers
          )
        `);

        await client.close();
        
        const deleted = result.affectedRows || 0;
        console.log(`[cleanup_orphan_pendentes] Deleted ${deleted} orphan PENDENTE records`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          deleted,
          message: `${deleted} registros PENDENTE órfãos removidos`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[cleanup_orphan_pendentes] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Track single container and update t_tracking_sea =====
    if (action === 'track_sea_container') {
      const containerId = url.searchParams.get('container') || '';
      let shippingLine = url.searchParams.get('shipping_line') || '';

      if (!containerId) {
        return new Response(JSON.stringify({ error: 'container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!shippingLine) {
        const prefix = containerId.substring(0, 4).toUpperCase();
        if (prefix === 'CMAU' || prefix === 'CCLU' || prefix === 'CXDU') shippingLine = 'CMA_CGM';
        else if (prefix === 'MSCU' || prefix === 'MEDU') shippingLine = 'MSC';
        else if (prefix === 'MAEU' || prefix === 'MRKU' || prefix === 'MSKU') shippingLine = 'MAERSK';
        else if (prefix === 'HLCU' || prefix === 'HLXU') shippingLine = 'HAPAG_LLOYD';
        else if (prefix === 'ONEY' || prefix === 'ONEU') shippingLine = 'ONE';
        else if (prefix === 'HDMU' || prefix === 'HMMU') shippingLine = 'HMM';
        else if (prefix === 'EISU' || prefix === 'EITU' || prefix === 'EGSU' || prefix === 'EGHU') shippingLine = 'EVERGREEN';
        else if (prefix === 'YMLU' || prefix === 'YMMU') shippingLine = 'YANG_MING';
        else if (prefix === 'COSU' || prefix === 'CSNU') shippingLine = 'COSCO';
        else if (prefix === 'ZIMU' || prefix === 'ZCSU') shippingLine = 'ZIM';
      }

      const qs: Record<string, string> = {};
      if (shippingLine) qs['shipping_line'] = shippingLine;
      
      const apiRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs);

      if (apiRes.__curl_error) {
        return new Response(JSON.stringify({ error: apiRes.__curl_error, data: null }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = apiRes.data || apiRes;
      
      let lastEventDescription = data.container_status || null;
      if (data.events && Array.isArray(data.events) && data.events.length > 0) {
        lastEventDescription = data.events[0].description || data.events[0].event_type || lastEventDescription;
      } else if (data.last_movement?.description) {
        lastEventDescription = data.last_movement.description;
      }

      // Priorizar busca de IMO pelo nome do navio (mais confiável que IMO direta da API)
      const vesselName = data.vessel?.name || data.current_vessel_name || data.last_vessel_name || null;
      let vesselImo = null;
      
      if (vesselName) {
        console.log(`[track_sea_container] Searching IMO by vessel name "${vesselName}"...`);
        vesselImo = await findVesselImo(vesselName);
      }
      
      // Fallback para IMO direta da API
      if (!vesselImo) {
        vesselImo = data.vessel?.imo || data.current_vessel_imo || data.vessel_imo || data.imo || null;
        if (vesselImo) {
          console.log(`[track_sea_container] Using API direct IMO as fallback: ${vesselImo}`);
        }
      }
      
      const trackingData = {
        container: containerId,
        container_status: data.container_status || null,
        loading_port: data.loading_port?.name || data.pol || data.loading_port || null,
        discharging_port: data.discharging_port?.name || data.pod || data.discharging_port || null,
        eta: data.eta_final_destination || data.eta || null,
        vessel: vesselName,
        vessel_imo: vesselImo,
        last_event: lastEventDescription,
      };
      
      console.log(`[track_sea_container] Container ${containerId}: vessel=${vesselName}, imo=${vesselImo}`);

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (mariadbHost && mariadbUser && mariadbPass) {
        const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
        const client = await new Client().connect({
          hostname: mariadbHost,
          port: parseInt(mariadbPort, 10),
          username: mariadbUser,
          password: mariadbPass,
          db: 'dados_dachser',
        });

        try {
          await client.execute(`
            UPDATE dados_dachser.t_tracking_sea 
            SET 
              container_status = ?,
              origem = COALESCE(?, origem),
              destino = COALESCE(?, destino),
              eta = ?,
              navio = COALESCE(?, navio),
              vessel_imo = COALESCE(?, vessel_imo),
              last_event = ?,
              shipping_line = COALESCE(?, shipping_line),
              last_check = NOW()
            WHERE container = ?
          `, [
            trackingData.container_status,
            trackingData.loading_port,
            trackingData.discharging_port,
            trackingData.eta ? new Date(trackingData.eta) : null,
            trackingData.vessel,
            trackingData.vessel_imo,
            trackingData.last_event,
            shippingLine ? normalizeShippingLine(shippingLine) : null,
            containerId.toUpperCase().trim()
          ]);
          await client.close();
        } catch (e: any) {
          console.error('[track_sea_container] DB update error:', e);
          await client.close();
        }
      }

      return new Response(JSON.stringify({ success: true, data: trackingData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA TRACKING: Delete/Deactivate MBL from tracking =====
    if (action === 'delete_sea_tracking') {
      const body = await req.json();
      const { mbl_id } = body;

      if (!mbl_id) {
        return new Response(JSON.stringify({ error: 'mbl_id obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        await client.execute(`
          UPDATE dados_dachser.t_tracking_sea SET active = 0 WHERE mbl_id = ?
        `, [mbl_id]);

        await client.close();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[delete_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Cleanup invalid records (mark as inactive) =====
    if (action === 'cleanup_sea_tracking') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Contar registros inválidos antes de limpar
        const countBefore = await client.query(`
          SELECT 
            COUNT(*) as total_ativos,
            SUM(CASE WHEN mbl_id NOT REGEXP '^[A-Za-z]{4}[0-9]+$' THEN 1 ELSE 0 END) as mbl_formato_invalido,
            SUM(CASE WHEN mbl_id REGEXP '^BR[A-Za-z]{3}' THEN 1 ELSE 0 END) as mbl_hawb,
            SUM(CASE WHEN container IS NULL OR TRIM(container) = '' OR container = 'PENDENTE' THEN 1 ELSE 0 END) as container_vazio,
            SUM(CASE WHEN container IS NOT NULL AND TRIM(container) != '' AND container != 'PENDENTE' AND container NOT REGEXP '^[A-Za-z]{4}[0-9]{7}$' THEN 1 ELSE 0 END) as container_formato_invalido
          FROM dados_dachser.t_tracking_sea
          WHERE active = 1
        `);

        const stats = countBefore[0] || {};
        console.log(`[cleanup_sea_tracking] Before cleanup: total=${stats.total_ativos}, mblInvalido=${stats.mbl_formato_invalido}, hawb=${stats.mbl_hawb}, containerVazio=${stats.container_vazio}, containerInvalido=${stats.container_formato_invalido}`);

        // Marcar como inativos os registros que não atendem aos novos critérios
        const result = await client.execute(`
          UPDATE dados_dachser.t_tracking_sea 
          SET active = 0
          WHERE active = 1
            AND (
              -- MBL com formato inválido (não é SCAC: 4 letras + números)
              mbl_id NOT REGEXP '^[A-Za-z]{4}[0-9]+$'
              -- OU MBL é um HAWB brasileiro
              OR mbl_id REGEXP '^BR[A-Za-z]{3}'
              -- OU Container vazio/pendente
              OR container IS NULL 
              OR TRIM(container) = ''
              OR container = 'PENDENTE'
              -- OU Container com formato inválido (não é ISO: 4 letras + 7 números)
              OR container NOT REGEXP '^[A-Za-z]{4}[0-9]{7}$'
            )
        `);

        const cleaned = result.affectedRows || 0;

        // Contar registros válidos restantes
        const countAfter = await client.query(`
          SELECT COUNT(*) as total_ativos FROM dados_dachser.t_tracking_sea WHERE active = 1
        `);
        const remaining = countAfter[0]?.total_ativos || 0;

        await client.close();
        
        console.log(`[cleanup_sea_tracking] Cleaned ${cleaned} invalid records, ${remaining} valid records remaining`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          cleaned,
          remaining,
          message: `${cleaned} registros inválidos marcados como inativos`,
          stats_before: {
            total_ativos: Number(stats.total_ativos) || 0,
            mbl_formato_invalido: Number(stats.mbl_formato_invalido) || 0,
            mbl_hawb: Number(stats.mbl_hawb) || 0,
            container_vazio: Number(stats.container_vazio) || 0,
            container_formato_invalido: Number(stats.container_formato_invalido) || 0
          },
          validation_rules: {
            mbl: '^[A-Za-z]{4}[0-9]+$ (SCAC format)',
            mbl_reject: '^BR[A-Za-z]{3} (HAWBs)',
            container: '^[A-Za-z]{4}[0-9]{7}$ (ISO format)'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[cleanup_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING (LEGACY): Get tracked containers =====
    if (action === 'get_tracked_containers') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        // Create tracking table if not exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_container_tracking (
            id INT AUTO_INCREMENT PRIMARY KEY,
            container VARCHAR(20) NOT NULL,
            bl VARCHAR(50),
            shipping_line VARCHAR(20),
            consignee_name VARCHAR(255),
            origem VARCHAR(100),
            destino VARCHAR(100),
            vessel VARCHAR(100),
            eta DATETIME,
            last_event VARCHAR(500),
            container_status VARCHAR(100),
            last_check DATETIME,
            nome_analista VARCHAR(100),
            email_analista VARCHAR(150),
            email_cliente VARCHAR(150),
            active TINYINT(1) DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_container (container)
          )
        `);

        // Container prefix to shipping line mapping
        const CONTAINER_PREFIX_MAP: Record<string, string> = {
          "MAEU": "MAERSK", "MSKU": "MAERSK", "MRKU": "MAERSK", "MRSU": "MAERSK", "SUDU": "MAERSK", "SEAU": "MAERSK", "SFCU": "MAERSK",
          "HLCU": "HAPAG-LLOYD", "HLXU": "HAPAG-LLOYD", "HJCU": "HAPAG-LLOYD", "HASU": "HAPAG-LLOYD", "UACU": "HAPAG-LLOYD",
          "CMAU": "CMA CGM", "CGMU": "CMA CGM", "APLU": "CMA CGM", "ANLU": "CMA CGM", "ECMU": "CMA CGM", "APHU": "CMA CGM", "CXDU": "CMA CGM",
          "MSCU": "MSC", "MEDU": "MSC", "MSCZ": "MSC", "MSDU": "MSC",
          "ONEY": "ONE", "NYKU": "ONE", "MOLU": "ONE", "KSTU": "ONE", "KKFU": "ONE",
          "HDMU": "HMM", "HMMU": "HMM",
          "CSLU": "COSCO", "CCLU": "COSCO", "COSU": "COSCO", "CBHU": "COSCO", "OOLU": "COSCO", "OOCU": "COSCO",
          "EGHU": "EVERGREEN", "EMCU": "EVERGREEN", "EISU": "EVERGREEN", "EGLV": "EVERGREEN", "EGSU": "EVERGREEN", "EITU": "EVERGREEN",
          "YMLU": "YANG MING", "YMMU": "YANG MING", "YMJU": "YANG MING",
          "ZIMU": "ZIM", "ZCSU": "ZIM",
          "PCIU": "PIL", "PONU": "PIL",
          "WHLU": "WAN HAI", "WHSU": "WAN HAI",
          "SMCU": "SM LINE", "SMLM": "SM LINE",
          "SKHU": "SINOKOR", "SNKU": "SINOKOR",
          "TSLU": "TS LINES",
          "ARKU": "ARKAS",
          "ATHU": "ANTONG",
          "SITU": "SITC",
          "HAEU": "HEUNG-A",
          "NAMU": "NAMSUNG",
          "TRHU": "TRITON", "TCKU": "TRITON", "TLLU": "TRITON",
          "TCLU": "TEXTAINER", "TXGU": "TEXTAINER",
          "TEMU": "TOUAX",
          "GESU": "GESEACO", "GATU": "GATE",
          "FCIU": "FLORENS", "FBLU": "FLORENS",
          "CAIU": "CAI", "CARU": "CAI",
          "SEGU": "SEACO", "SCMU": "SEACO",
          "BEAU": "BEACON", "BICU": "BEACON",
          "DFSU": "DONG FANG", "DFDL": "DONG FANG",
          "UETU": "UNIT", "UTCU": "UNIT",
          "TGBU": "TGS", "TGCU": "TGS",
          "BMOU": "BLUE SKY",
          "DRYU": "DRY",
          "CLHU": "CLOU",
          "SEKU": "SEKO",
          "TCNU": "TRANSAMERICA",
        };

        const detectArmador = (container: string | null): string => {
          if (!container) return 'N/D';
          const prefix = container.trim().substring(0, 4).toUpperCase();
          return CONTAINER_PREFIX_MAP[prefix] || 'OUTRO';
        };

        // First, update tracking records with data from t_dachser_container if missing
        await client.execute(`
          UPDATE ai_agente.t_dachser_container_tracking ct
          JOIN ai_agente.t_dachser_container dc ON TRIM(ct.container) = TRIM(dc.container)
          SET 
            ct.consignee_name = COALESCE(ct.consignee_name, dc.consignee),
            ct.origem = COALESCE(ct.origem, dc.origem),
            ct.destino = COALESCE(ct.destino, dc.destino),
            ct.vessel = COALESCE(ct.vessel, dc.vessel)
          WHERE ct.active = 1
            AND (ct.consignee_name IS NULL OR ct.origem IS NULL OR ct.destino IS NULL OR ct.vessel IS NULL)
        `);

        // Sync email_analista and email_cliente from t_master_dados based on consignee_name matching cliente
        // This is optional - table may not exist in all environments
        try {
          console.log('[get_tracked_containers] Attempting to sync emails from t_master_dados...');
          const emailSyncResult = await client.execute(`
            UPDATE ai_agente.t_dachser_container_tracking ct
            JOIN ai_agente.t_master_dados m 
              ON TRIM(UPPER(ct.consignee_name)) = TRIM(UPPER(m.cliente))
            SET 
              ct.nome_analista = COALESCE(ct.nome_analista, m.nome_analista),
              ct.email_analista = COALESCE(ct.email_analista, m.email_analista),
              ct.email_cliente = COALESCE(ct.email_cliente, m.emails_cliente)
            WHERE ct.active = 1
              AND ct.consignee_name IS NOT NULL
              AND (ct.email_analista IS NULL OR ct.email_cliente IS NULL)
          `);
          console.log(`[get_tracked_containers] Email sync completed. Rows affected: ${emailSyncResult.affectedRows || 0}`);
        } catch (syncErr) {
          console.log('[get_tracked_containers] Skipping t_master_dados sync (table may not exist):', syncErr instanceof Error ? syncErr.message : 'Unknown error');
        }

        const rows = await client.query(`
          SELECT 
            ct.*,
            COALESCE(ct.consignee_name, dc.consignee) as consignee_name,
            COALESCE(ct.origem, dc.origem) as origem,
            COALESCE(ct.destino, dc.destino) as destino,
            COALESCE(ct.vessel, dc.vessel) as vessel
          FROM ai_agente.t_dachser_container_tracking ct
          LEFT JOIN ai_agente.t_dachser_container dc ON TRIM(ct.container) = TRIM(dc.container)
          WHERE ct.active = 1 
          ORDER BY ct.created_at DESC
        `);

        // Update shipping_line for each container if empty
        for (const row of rows) {
          if (!row.shipping_line || row.shipping_line === '' || row.shipping_line === 'N/D') {
            const armador = detectArmador(row.container);
            if (armador !== 'N/D') {
              await client.execute(
                `UPDATE ai_agente.t_dachser_container_tracking SET shipping_line = ? WHERE id = ?`,
                [armador, row.id]
              );
              row.shipping_line = armador;
            }
          }
        }

        await client.close();
        return new Response(JSON.stringify({ success: true, data: rows }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_tracked_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Add container to tracking =====
    if (action === 'add_tracked_container') {
      const body = await req.json();
      const { container, bl, shipping_line, consignee_name, nome_analista, email_analista, email_cliente } = body;

      if (!container) {
        return new Response(JSON.stringify({ error: 'container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        await client.execute(`
          INSERT INTO ai_agente.t_dachser_container_tracking 
          (container, bl, shipping_line, consignee_name, nome_analista, email_analista, email_cliente, last_event, container_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Aguardando rastreio...', 'PENDING')
          ON DUPLICATE KEY UPDATE
            bl = VALUES(bl),
            shipping_line = VALUES(shipping_line),
            consignee_name = VALUES(consignee_name),
            nome_analista = VALUES(nome_analista),
            email_analista = VALUES(email_analista),
            email_cliente = VALUES(email_cliente),
            active = 1,
            updated_at = NOW()
        `, [
          container.toUpperCase().trim(),
          bl || null,
          shipping_line || null,
          consignee_name || null,
          nome_analista || null,
          email_analista || null,
          email_cliente || null
        ]);

        await client.close();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[add_tracked_container] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Delete container from tracking =====
    if (action === 'delete_tracked_container') {
      const body = await req.json();
      const { container } = body;

      if (!container) {
        return new Response(JSON.stringify({ error: 'container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        await client.execute(`
          UPDATE ai_agente.t_dachser_container_tracking SET active = 0 WHERE container = ?
        `, [container.toUpperCase().trim()]);

        await client.close();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[delete_tracked_container] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Track container via JSONCargo API =====
    if (action === 'track_container') {
      const containerId = url.searchParams.get('container') || '';
      let shippingLine = url.searchParams.get('shipping_line') || '';

      if (!containerId) {
        return new Response(JSON.stringify({ error: 'container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Detect shipping_line from container PREFIX first (most accurate)
      // JSONCargo API uses specific codes: MAERSK, MSC, CMA_CGM, HAPAG_LLOYD, ONE, HMM, EVERGREEN, COSCO, ZIM, YANG_MING
      if (!shippingLine) {
        const prefix = containerId.substring(0, 4).toUpperCase();
        // Direct carrier-owned containers - using JSONCargo API codes
        if (prefix === 'CMAU' || prefix === 'CCLU' || prefix === 'CXDU') {
          shippingLine = 'CMA_CGM';
        } else if (prefix === 'MSCU' || prefix === 'MEDU') {
          shippingLine = 'MSC';
        } else if (prefix === 'MAEU' || prefix === 'MRKU' || prefix === 'MSKU') {
          shippingLine = 'MAERSK';
        } else if (prefix === 'HLCU' || prefix === 'HLXU' || prefix === 'UACU') {
          shippingLine = 'HAPAG_LLOYD';
        } else if (prefix === 'ONEY' || prefix === 'ONEU') {
          shippingLine = 'ONE';
        } else if (prefix === 'HDMU' || prefix === 'HMMU') {
          shippingLine = 'HMM';
        } else if (prefix === 'EISU' || prefix === 'EITU' || prefix === 'EGSU' || prefix === 'EGHU') {
          shippingLine = 'EVERGREEN';
        } else if (prefix === 'YMLU' || prefix === 'YMMU') {
          shippingLine = 'YANG_MING';
        } else if (prefix === 'COSU' || prefix === 'CSNU') {
          shippingLine = 'COSCO';
        } else if (prefix === 'ZIMU' || prefix === 'ZCSU') {
          shippingLine = 'ZIM';
        }
        
        if (shippingLine) {
          console.log(`[track_container] Container ${containerId}: using shipping_line ${shippingLine} from prefix ${prefix}`);
        } else {
          // SOC container - try to get vessel from database
          const mariadbHost = Deno.env.get('MARIADB_HOST');
          const mariadbUser = Deno.env.get('MARIADB_USER');
          const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
          const mariadbDb = Deno.env.get('MARIADB_DATABASE');
          
          if (mariadbHost && mariadbUser && mariadbPass) {
            const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
            const client = await new Client().connect({
              hostname: mariadbHost,
              port: parseInt(Deno.env.get('MARIADB_PORT') || '3306', 10),
              username: mariadbUser,
              password: mariadbPass,
              db: mariadbDb,
            });
            
            try {
              console.log(`[track_container] SOC container (prefix ${prefix}), querying vessel for: ${containerId.toUpperCase().trim()}`);
              const rows = await client.query(`
                SELECT vessel FROM ai_agente.t_dachser_container_tracking 
                WHERE TRIM(container) = ? LIMIT 1
              `, [containerId.toUpperCase().trim()]);
              
              if (rows.length > 0 && rows[0].vessel) {
                const vessel = (rows[0].vessel || '').toUpperCase();
                // SOC fallback - using JSONCargo API codes
                if (vessel.includes('MAERSK') || vessel.includes('SEALAND') || vessel.includes('SAFMARINE')) {
                  shippingLine = 'MAERSK';
                } else if (vessel.includes('MSC ') || vessel.startsWith('MSC')) {
                  shippingLine = 'MSC';
                } else if (vessel.includes('CMA') || vessel.includes('CGM') || vessel.includes('APL')) {
                  shippingLine = 'CMA_CGM';
                } else if (vessel.includes('HAPAG') || vessel.includes('LLOYD')) {
                  shippingLine = 'HAPAG_LLOYD';
                } else if (vessel.includes('ONE ') || vessel.includes('OCEAN NETWORK')) {
                  shippingLine = 'ONE';
                } else if (vessel.includes('HMM') || vessel.includes('HYUNDAI')) {
                  shippingLine = 'HMM';
                } else if (vessel.includes('EVERGREEN') || vessel.includes('EVER ')) {
                  shippingLine = 'EVERGREEN';
                } else if (vessel.includes('COSCO') || vessel.includes('OOCL')) {
                  shippingLine = 'COSCO';
                } else if (vessel.includes('ZIM') || vessel.includes('GOLD STAR')) {
                  shippingLine = 'ZIM';
                } else if (vessel.includes('YANG MING') || vessel.includes('YM ')) {
                  shippingLine = 'YANG_MING';
                }
                console.log(`[track_container] SOC detected ${shippingLine} from vessel "${rows[0].vessel}"`);
              }
              await client.close();
            } catch (e: any) {
              console.error('[track_container] Error detecting shipping line:', e.message);
              try { await client.close(); } catch (_) {}
            }
          }
        }
      }

      // Call JSONCargo API
      const qs: Record<string, string> = {};
      if (shippingLine) qs['shipping_line'] = shippingLine;
      
      console.log(`[track_container] Calling JSONCargo API for ${containerId} with shipping_line: ${shippingLine || 'auto'}`);
      const apiRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs);

      if (apiRes.__curl_error) {
        return new Response(JSON.stringify({ error: apiRes.__curl_error, data: null }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Extract relevant data from JSONCargo response
      const trackingData = {
        container: containerId,
        container_status: apiRes.container_status || apiRes.status || null,
        loading_port: apiRes.loading_port?.name || apiRes.pol || null,
        discharging_port: apiRes.discharging_port?.name || apiRes.pod || null,
        eta: apiRes.eta_final_destination || apiRes.eta || null,
        vessel: apiRes.vessel?.name || apiRes.current_vessel_name || null,
        last_event: apiRes.last_movement?.description || apiRes.container_status || null,
        events: apiRes.events || apiRes.movements || [],
        raw: apiRes
      };

      // Update tracking in database
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (mariadbHost && mariadbUser && mariadbPass && mariadbDb) {
        const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
        const client = await new Client().connect({
          hostname: mariadbHost,
          port: parseInt(mariadbPort, 10),
          username: mariadbUser,
          password: mariadbPass,
          db: mariadbDb,
        });

        try {
          await client.execute(`
            UPDATE ai_agente.t_dachser_container_tracking 
            SET 
              container_status = ?,
              origem = ?,
              destino = ?,
              eta = ?,
              vessel = ?,
              last_event = ?,
              last_check = NOW(),
              updated_at = NOW()
            WHERE container = ?
          `, [
            trackingData.container_status,
            trackingData.loading_port,
            trackingData.discharging_port,
            trackingData.eta ? new Date(trackingData.eta) : null,
            trackingData.vessel,
            trackingData.last_event,
            containerId.toUpperCase().trim()
          ]);
          await client.close();
        } catch (e: any) {
          console.error('[track_container] DB update error:', e);
          await client.close();
        }
      }

      return new Response(JSON.stringify({ success: true, data: trackingData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== SEA TRACKING: Bulk refresh all containers =====
    if (action === 'refresh_all_containers') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        const containers = await client.query(`
          SELECT container, shipping_line, vessel FROM ai_agente.t_dachser_container_tracking WHERE active = 1
        `);

        let updated = 0;
        let errors = 0;

        for (const row of containers) {
          const containerId = row.container;
          let shippingLine = row.shipping_line || '';
          
          // Detect shipping_line from container PREFIX (first 4 chars)
          // JSONCargo API uses specific codes: MAERSK, MSC, CMA_CGM, HAPAG_LLOYD, ONE, HMM, EVERGREEN, COSCO, ZIM, YANG_MING
          if (!shippingLine && containerId) {
            const prefix = containerId.substring(0, 4).toUpperCase();
            // Direct carrier-owned containers - using JSONCargo API codes
            if (prefix === 'CMAU' || prefix === 'CCLU' || prefix === 'CXDU') {
              shippingLine = 'CMA_CGM';
            } else if (prefix === 'MSCU' || prefix === 'MEDU') {
              shippingLine = 'MSC';
            } else if (prefix === 'MAEU' || prefix === 'MRKU' || prefix === 'MSKU') {
              shippingLine = 'MAERSK';
            } else if (prefix === 'HLCU' || prefix === 'HLXU' || prefix === 'UACU') {
              shippingLine = 'HAPAG_LLOYD';
            } else if (prefix === 'ONEY' || prefix === 'ONEU') {
              shippingLine = 'ONE';
            } else if (prefix === 'HDMU' || prefix === 'HMMU') {
              shippingLine = 'HMM';
            } else if (prefix === 'EISU' || prefix === 'EITU' || prefix === 'EGSU' || prefix === 'EGHU') {
              shippingLine = 'EVERGREEN';
            } else if (prefix === 'YMLU' || prefix === 'YMMU') {
              shippingLine = 'YANG_MING';
            } else if (prefix === 'COSU' || prefix === 'CSNU') {
              shippingLine = 'COSCO';
            } else if (prefix === 'ZIMU' || prefix === 'ZCSU') {
              shippingLine = 'ZIM';
            } else {
              // SOC (Shipper-Owned Container) - use vessel name as fallback
              // Common SOC prefixes: TCNU, TCKU, TRHU, TXGU, SEGU, SEKU, TLLU, TTNU, etc.
              if (row.vessel) {
                const vessel = (row.vessel || '').toUpperCase();
                if (vessel.includes('MAERSK') || vessel.includes('SEALAND') || vessel.includes('SAFMARINE')) {
                  shippingLine = 'MAERSK';
                } else if (vessel.includes('MSC ') || vessel.startsWith('MSC')) {
                  shippingLine = 'MSC';
                } else if (vessel.includes('CMA') || vessel.includes('CGM') || vessel.includes('APL')) {
                  shippingLine = 'CMA_CGM';
                } else if (vessel.includes('HAPAG') || vessel.includes('LLOYD')) {
                  shippingLine = 'HAPAG_LLOYD';
                } else if (vessel.includes('ONE ') || vessel.includes('OCEAN NETWORK')) {
                  shippingLine = 'ONE';
                } else if (vessel.includes('HMM') || vessel.includes('HYUNDAI')) {
                  shippingLine = 'HMM';
                } else if (vessel.includes('EVERGREEN') || vessel.includes('EVER ')) {
                  shippingLine = 'EVERGREEN';
                } else if (vessel.includes('COSCO') || vessel.includes('OOCL')) {
                  shippingLine = 'COSCO';
                } else if (vessel.includes('ZIM') || vessel.includes('GOLD STAR')) {
                  shippingLine = 'ZIM';
                } else if (vessel.includes('YANG MING') || vessel.includes('YM ')) {
                  shippingLine = 'YANG_MING';
                }
                console.log(`[refresh_all] SOC Container ${containerId} (prefix ${prefix}): detected ${shippingLine} from vessel "${row.vessel}"`);
              }
            }
            if (shippingLine) {
              console.log(`[refresh_all] Container ${containerId}: using shipping_line ${shippingLine} (prefix: ${prefix})`);
            }
          }
          
          // For SOC containers or unknown prefixes, we'll try multiple shipping lines
          const allShippingLines = ['MAERSK', 'MSC', 'CMA_CGM', 'HAPAG_LLOYD', 'ONE', 'HMM', 'EVERGREEN', 'COSCO', 'ZIM', 'YANG_MING'];
          
          // Build list of shipping lines to try
          let shippingLinesToTry: string[] = [];
          if (shippingLine) {
            // Start with detected/stored shipping line
            shippingLinesToTry.push(shippingLine);
          }
          
          // Check if this is a third-party/SOC prefix (not directly owned by any carrier)
          const prefix = containerId.substring(0, 4).toUpperCase();
          const isThirdPartyPrefix = !['CMAU', 'CCLU', 'CXDU', 'MSCU', 'MEDU', 'MAEU', 'MRKU', 'MSKU', 
            'HLCU', 'HLXU', 'ONEY', 'ONEU', 'HDMU', 'HMMU', 'EISU', 'EITU', 'EGSU', 'EGHU',
            'YMLU', 'YMMU', 'COSU', 'CSNU', 'ZIMU', 'ZCSU'].includes(prefix);
          
          // For third-party prefixes, add all shipping lines as fallbacks
          if (isThirdPartyPrefix) {
            for (const sl of allShippingLines) {
              if (!shippingLinesToTry.includes(sl)) {
                shippingLinesToTry.push(sl);
              }
            }
            console.log(`[refresh_all] Container ${containerId} has third-party prefix ${prefix}, will try ${shippingLinesToTry.length} shipping lines`);
          }
          
          // If no shipping line detected at all, try all
          if (shippingLinesToTry.length === 0) {
            shippingLinesToTry = [...allShippingLines];
            console.log(`[refresh_all] Container ${containerId} has no detected shipping line, will try all ${shippingLinesToTry.length}`);
          }
          
          let successfulShippingLine: string | null = null;
          let trackingData: any = null;
          
          // Try each shipping line until one works
          for (const tryShippingLine of shippingLinesToTry) {
            const qs: Record<string, string> = { 'shipping_line': tryShippingLine };
            
            console.log(`[refresh_all] Trying JSONCargo for ${containerId} with shipping_line: ${tryShippingLine}`);
            const apiRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs, 15000);
            
            // Check if we got a valid response
            if (!apiRes.__curl_error && !apiRes.error && apiRes.data) {
              console.log(`[refresh_all] SUCCESS! Container ${containerId} found with ${tryShippingLine}`);
              
              // JSONCargo wraps response in 'data' object
              const data = apiRes.data;
              
              // Extract last event from events array if available
              let lastEventDescription = data.container_status || null;
              if (data.events && Array.isArray(data.events) && data.events.length > 0) {
                const latestEvent = data.events[0];
                lastEventDescription = latestEvent.description || latestEvent.event_type || latestEvent.status || lastEventDescription;
              } else if (data.last_movement?.description) {
                lastEventDescription = data.last_movement.description;
              }
              
              trackingData = {
                container_status: data.container_status || null,
                loading_port: data.loading_port || data.shipped_from || null,
                discharging_port: data.discharging_port || data.shipped_to || null,
                eta: data.eta_final_destination || data.eta || null,
                vessel: data.current_vessel_name || data.last_vessel_name || row.vessel || null,
                last_event: lastEventDescription,
              };
              
              successfulShippingLine = tryShippingLine;
              break; // Found it, stop trying
            } else {
              const errorMsg = apiRes.error?.title || apiRes.__curl_error || 'Unknown error';
              console.log(`[refresh_all] ${containerId} not found with ${tryShippingLine}: ${errorMsg}`);
              
              // Small delay between attempts to avoid rate limiting
              await new Promise(r => setTimeout(r, 100));
            }
          }
          
          if (trackingData && successfulShippingLine) {
            console.log(`[refresh_all] Parsed data for ${containerId}:`, JSON.stringify(trackingData));

            await client.execute(`
              UPDATE ai_agente.t_dachser_container_tracking 
              SET 
                container_status = ?,
                origem = COALESCE(?, origem),
                destino = COALESCE(?, destino),
                eta = ?,
                vessel = COALESCE(?, vessel),
                last_event = ?,
                shipping_line = ?,
                last_check = NOW(),
                updated_at = NOW()
              WHERE container = ?
            `, [
              trackingData.container_status,
              trackingData.loading_port,
              trackingData.discharging_port,
              trackingData.eta ? new Date(trackingData.eta) : null,
              trackingData.vessel,
              trackingData.last_event,
              normalizeShippingLine(successfulShippingLine),
              containerId
            ]);
            updated++;
          } else {
            console.error(`[refresh_all] Container ${containerId} not found in any shipping line after trying ${shippingLinesToTry.length} carriers`);
            errors++;
          }

          // Rate limit: 300ms between calls
          await new Promise(r => setTimeout(r, 300));
        }

        await client.close();
        return new Response(JSON.stringify({ success: true, updated, errors, total: containers.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[refresh_all_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Load containers from t_dachser_sea_items =====
    if (action === 'load_containers_from_sea_items') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        // Fetch containers from t_dachser_container that are not yet being tracked
        const containers = await client.query(`
          SELECT DISTINCT 
            dc.container,
            dc.vessel,
            dc.voyage,
            dc.origem,
            dc.destino,
            dc.consignee
          FROM ai_agente.t_dachser_container dc
          WHERE dc.container IS NOT NULL 
            AND TRIM(dc.container) != ''
            AND NOT EXISTS (
              SELECT 1 FROM ai_agente.t_dachser_container_tracking ct 
              WHERE ct.container = dc.container AND ct.active = 1
            )
          ORDER BY dc.id DESC
          LIMIT 100
        `);

        console.log(`[load_containers_from_sea_items] Found ${containers.length} new containers to track`);

        let added = 0;
        for (const c of containers) {
          if (!c.container) continue;
          
          await client.execute(`
            INSERT INTO ai_agente.t_dachser_container_tracking 
            (container, consignee_name, origem, destino, vessel, last_event, container_status)
            VALUES (?, ?, ?, ?, ?, 'Aguardando rastreio...', 'PENDING')
            ON DUPLICATE KEY UPDATE
              consignee_name = COALESCE(VALUES(consignee_name), consignee_name),
              origem = COALESCE(VALUES(origem), origem),
              destino = COALESCE(VALUES(destino), destino),
              vessel = COALESCE(VALUES(vessel), vessel),
              active = 1,
              updated_at = NOW()
          `, [
            c.container.toString().toUpperCase().trim(),
            c.consignee || null,
            c.origem || null,
            c.destino || null,
            c.vessel || null
          ]);
          added++;
        }

        await client.close();
        return new Response(JSON.stringify({ 
          success: true, 
          added, 
          total: containers.length,
          message: `${added} container(s) adicionado(s) ao monitoramento`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[load_containers_from_sea_items] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Get available containers from sea_items (not yet tracked) =====
    if (action === 'get_available_containers') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDb = Deno.env.get('MARIADB_DATABASE');

      if (!mariadbHost || !mariadbUser || !mariadbPass || !mariadbDb) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: mariadbDb,
      });

      try {
        const containers = await client.query(`
          SELECT DISTINCT 
            si.container,
            si.vessel,
            si.voyage,
            si.origem,
            si.destino,
            si.consignee,
            si.created_at
          FROM ai_agente.t_dachser_sea_items si
          WHERE si.container IS NOT NULL 
            AND TRIM(si.container) != ''
            AND si.active = 1
            AND NOT EXISTS (
              SELECT 1 FROM ai_agente.t_dachser_container_tracking ct 
              WHERE ct.container = si.container AND ct.active = 1
            )
          ORDER BY si.created_at DESC
          LIMIT 100
        `);

        await client.close();
        return new Response(JSON.stringify({ success: true, data: containers }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_available_containers] Error:', e);
        return new Response(JSON.stringify({ error: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING HISTORY: Setup history table =====
    if (action === 'setup_tracking_history_table') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Create the history table
        await client.execute(`
          CREATE TABLE IF NOT EXISTS dados_dachser.t_tracking_sea_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            mbl_id VARCHAR(100) NOT NULL COMMENT 'FK to t_tracking_sea.mbl_id',
            container VARCHAR(50) NOT NULL,
            event_code VARCHAR(50) NULL COMMENT 'Normalized event code (ARR, DEP, BKG, etc)',
            event_description VARCHAR(500) NULL,
            event_datetime DATETIME NULL,
            location VARCHAR(200) NULL COMMENT 'Port/terminal location',
            vessel_name VARCHAR(100) NULL,
            voyage VARCHAR(50) NULL,
            container_status VARCHAR(100) NULL,
            eta DATETIME NULL COMMENT 'ETA at time of event',
            source VARCHAR(20) DEFAULT 'API' COMMENT 'API, MANUAL, WEBHOOK',
            raw_data JSON NULL COMMENT 'Full API response for debugging',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            
            INDEX idx_mbl_id (mbl_id),
            INDEX idx_container (container),
            INDEX idx_event_datetime (event_datetime),
            INDEX idx_created_at (created_at),
            UNIQUE INDEX idx_unique_event (mbl_id, container, event_code, event_datetime)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='Historical tracking events for sea containers'
        `);

        console.log('[setup_tracking_history_table] Table created/verified');

        // Get table info
        const columns = await client.query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'dados_dachser' AND TABLE_NAME = 't_tracking_sea_history'
          ORDER BY ORDINAL_POSITION
        `);

        // Get current row count
        const countResult = await client.query(`
          SELECT COUNT(*) as total FROM dados_dachser.t_tracking_sea_history
        `);

        await client.close();
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Tabela t_tracking_sea_history criada/verificada com sucesso',
          columns,
          totalRows: countResult[0]?.total || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[setup_tracking_history_table] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING HISTORY: Get history for a container/MBL =====
    if (action === 'get_tracking_history') {
      const body = await req.json();
      const { mbl_id, container, limit = 100 } = body;

      if (!mbl_id && !container) {
        return new Response(JSON.stringify({ error: 'mbl_id ou container é obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        let query = `
          SELECT 
            h.id,
            h.mbl_id,
            h.container,
            h.event_code,
            h.event_description,
            h.event_datetime,
            h.location,
            h.vessel_name,
            h.voyage,
            h.container_status,
            h.eta,
            h.source,
            h.created_at,
            t.consignee,
            t.tipo_processo,
            t.shipping_line
          FROM dados_dachser.t_tracking_sea_history h
          LEFT JOIN dados_dachser.t_tracking_sea t ON h.mbl_id = t.mbl_id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (mbl_id) {
          query += ` AND h.mbl_id = ?`;
          params.push(mbl_id);
        }
        if (container) {
          query += ` AND h.container = ?`;
          params.push(container);
        }

        query += ` ORDER BY h.event_datetime DESC, h.created_at DESC LIMIT ?`;
        params.push(limit);

        const history = await client.query(query, params);

        // Get summary stats
        let statsQuery = `
          SELECT 
            COUNT(*) as total_events,
            MIN(event_datetime) as first_event,
            MAX(event_datetime) as last_event,
            COUNT(DISTINCT event_code) as unique_event_types
          FROM dados_dachser.t_tracking_sea_history
          WHERE 1=1
        `;
        const statsParams: any[] = [];
        if (mbl_id) {
          statsQuery += ` AND mbl_id = ?`;
          statsParams.push(mbl_id);
        }
        if (container) {
          statsQuery += ` AND container = ?`;
          statsParams.push(container);
        }

        const statsResult = await client.query(statsQuery, statsParams);

        await client.close();
        return new Response(JSON.stringify({ 
          success: true, 
          data: history,
          stats: statsResult[0] || null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_tracking_history] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING HISTORY: Get history summary (all containers) =====
    if (action === 'get_tracking_history_summary') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Overall stats
        const overallStats = await client.query(`
          SELECT 
            COUNT(*) as total_events,
            COUNT(DISTINCT mbl_id) as unique_mbls,
            COUNT(DISTINCT container) as unique_containers,
            MIN(event_datetime) as earliest_event,
            MAX(event_datetime) as latest_event,
            MIN(created_at) as first_record,
            MAX(created_at) as last_record
          FROM dados_dachser.t_tracking_sea_history
        `);

        // Events by type
        const eventsByType = await client.query(`
          SELECT 
            COALESCE(event_code, 'UNKNOWN') as event_code,
            COUNT(*) as count
          FROM dados_dachser.t_tracking_sea_history
          GROUP BY event_code
          ORDER BY count DESC
        `);

        // Events by day (last 30 days)
        const eventsByDay = await client.query(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
          FROM dados_dachser.t_tracking_sea_history
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY DATE(created_at)
          ORDER BY date DESC
        `);

        // Top containers by event count
        const topContainers = await client.query(`
          SELECT 
            container,
            mbl_id,
            COUNT(*) as event_count,
            MAX(event_datetime) as last_event
          FROM dados_dachser.t_tracking_sea_history
          GROUP BY container, mbl_id
          ORDER BY event_count DESC
          LIMIT 20
        `);

        await client.close();
        return new Response(JSON.stringify({ 
          success: true, 
          overall: overallStats[0] || null,
          eventsByType,
          eventsByDay,
          topContainers
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_tracking_history_summary] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Setup vessel_imo column =====
    if (action === 'setup_vessel_imo_column') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Check if column exists
        const columns = await client.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'dados_dachser' 
          AND TABLE_NAME = 't_tracking_sea' 
          AND COLUMN_NAME = 'vessel_imo'
        `);

        if (columns.length === 0) {
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN vessel_imo VARCHAR(20) NULL AFTER navio
          `);
          console.log('[setup_vessel_imo_column] Column vessel_imo added to t_tracking_sea');
        } else {
          console.log('[setup_vessel_imo_column] Column vessel_imo already exists');
        }

        await client.close();
        return new Response(JSON.stringify({ 
          success: true, 
          message: columns.length === 0 ? 'Coluna vessel_imo criada' : 'Coluna já existe'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[setup_vessel_imo_column] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Get vessel IMO for a given MBL =====
    if (action === 'get_vessel_imo') {
      const mbl_id = url.searchParams.get('mbl_id') || '';

      if (!mbl_id) {
        return new Response(JSON.stringify({ error: 'mbl_id obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Get vessel_imo from the first container of this MBL that has it
        const rows = await client.query(`
          SELECT vessel_imo, navio 
          FROM dados_dachser.t_tracking_sea
          WHERE mbl_id = ? AND active = 1
          LIMIT 1
        `, [mbl_id]);

        await client.close();

        if (rows.length > 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            data: {
              vessel_imo: rows[0].vessel_imo || null,
              vessel_name: rows[0].navio || null
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          data: { vessel_imo: null, vessel_name: null }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_vessel_imo] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Update vessel IMO for MBL =====
    if (action === 'update_vessel_imo') {
      const body = await req.json();
      const { mbl_id, vessel_imo } = body;

      if (!mbl_id) {
        return new Response(JSON.stringify({ error: 'mbl_id obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Update vessel_imo for all containers in this MBL
        const result = await client.execute(`
          UPDATE dados_dachser.t_tracking_sea 
          SET vessel_imo = ?
          WHERE mbl_id = ?
        `, [vessel_imo || null, mbl_id]);

        await client.close();
        
        console.log(`[update_vessel_imo] Updated ${result.affectedRows} rows for MBL ${mbl_id} with IMO ${vessel_imo}`);

        return new Response(JSON.stringify({ 
          success: true, 
          updated: result.affectedRows || 0,
          message: `IMO atualizado para ${result.affectedRows} containers`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[update_vessel_imo] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SETUP: Add sibling sync columns to t_tracking_sea =====
    if (action === 'setup_sibling_sync_columns') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPassword = Deno.env.get('MARIADB_PASSWORD');
      const mariadbDatabase = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort),
        username: mariadbUser,
        password: mariadbPassword,
        db: mariadbDatabase,
      });

      try {
        // Check if columns exist
        const columns = await client.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'dados_dachser' 
            AND TABLE_NAME = 't_tracking_sea'
            AND COLUMN_NAME IN ('sibling_synced', 'sibling_synced_at')
        `);
        
        const existingCols = columns.map((r: any) => r.COLUMN_NAME);
        const results: string[] = [];
        
        if (!existingCols.includes('sibling_synced')) {
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN sibling_synced TINYINT(1) DEFAULT 0 AFTER last_error
          `);
          results.push('sibling_synced column added');
        } else {
          results.push('sibling_synced column already exists');
        }
        
        if (!existingCols.includes('sibling_synced_at')) {
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN sibling_synced_at DATETIME NULL AFTER sibling_synced
          `);
          results.push('sibling_synced_at column added');
        } else {
          results.push('sibling_synced_at column already exists');
        }
        
        await client.close();
        console.log('[setup_sibling_sync_columns] Done:', results);
        
        return new Response(JSON.stringify({ 
          success: true, 
          results 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[setup_sibling_sync_columns] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== POPULATE MISSING VESSEL IMOs =====
    if (action === 'populate_missing_imos') {
      const batchSize = parseInt(url.searchParams.get('batch_size') || '50', 10);
      const maxTimeMs = 45000;
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        const startTime = Date.now();
        
        // Buscar navios únicos que têm nome mas não têm IMO
        const vessels = await client.query(`
          SELECT DISTINCT navio
          FROM dados_dachser.t_tracking_sea
          WHERE active = 1
            AND navio IS NOT NULL AND navio != ''
            AND (vessel_imo IS NULL OR vessel_imo = '')
          LIMIT ?
        `, [batchSize]);
        
        console.log(`[populate_missing_imos] Found ${vessels.length} unique vessels without IMO`);
        
        vesselImoCache.clear();
        
        let updated = 0;
        let notFound = 0;
        let processed = 0;
        
        for (const row of vessels) {
          if (Date.now() - startTime > maxTimeMs) {
            console.log(`[populate_missing_imos] Time limit reached after ${processed} vessels`);
            break;
          }
          
          const vesselName = row.navio;
          const imo = await findVesselImo(vesselName);
          processed++;
          
          if (imo) {
            const result = await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET vessel_imo = ?
              WHERE navio = ? AND (vessel_imo IS NULL OR vessel_imo = '')
            `, [imo, vesselName]);
            updated += result.affectedRows || 0;
            console.log(`[populate_missing_imos] Updated ${result.affectedRows} containers with IMO ${imo} for "${vesselName}"`);
          } else {
            notFound++;
            console.log(`[populate_missing_imos] No IMO found for "${vesselName}"`);
          }
          
          await new Promise(r => setTimeout(r, 200)); // Rate limit
        }
        
        // Contar navios restantes sem IMO
        const remainingResult = await client.query(`
          SELECT COUNT(DISTINCT navio) as remaining
          FROM dados_dachser.t_tracking_sea
          WHERE active = 1
            AND navio IS NOT NULL AND navio != ''
            AND (vessel_imo IS NULL OR vessel_imo = '')
        `);
        
        await client.close();
        
        const remaining = remainingResult[0]?.remaining || 0;
        console.log(`[populate_missing_imos] Done: ${processed} vessels processed, ${updated} containers updated, ${notFound} not found, ${remaining} remaining`);
        
        return new Response(JSON.stringify({
          success: true,
          vesselsProcessed: processed,
          containersUpdated: updated,
          notFound,
          remaining
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (e: any) {
        await client.close();
        console.error('[populate_missing_imos] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== CLEANUP: Remove "Sibling sync:" prefix from last_event =====
    if (action === 'cleanup_sibling_sync_prefix') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        const result = await client.execute(`
          UPDATE dados_dachser.t_tracking_sea 
          SET last_event = REPLACE(last_event, 'Sibling sync: ', '')
          WHERE last_event LIKE 'Sibling sync:%'
        `);

        await client.close();
        console.log(`[cleanup_sibling_sync_prefix] Cleaned ${result.affectedRows} rows`);

        return new Response(JSON.stringify({ 
          success: true, 
          cleaned: result.affectedRows || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== OLIMPO SEA FROM MONITORING: Buscar dados de t_tracking_sea com coordenadas de t_olimpo_tracking =====
    if (action === 'olimpo_sea_from_monitoring') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Buscar containers ativos do monitoramento com coordenadas do olimpo_tracking
        const rows = await client.query(`
          SELECT 
            ts.mbl_id,
            ts.container,
            ts.consignee,
            ts.tipo_processo,
            ts.origem AS porto_origem,
            ts.destino AS porto_destino,
            ts.navio AS vessel_name,
            ts.vessel_imo,
            ts.eta,
            ts.container_status,
            ts.last_event,
            ts.last_check,
            ts.shipping_line,
            CASE 
              WHEN ts.eta IS NOT NULL AND ts.eta < DATE_SUB(NOW(), INTERVAL 3 DAY) THEN 1 
              ELSE 0 
            END AS is_eta_delayed,
            ot.origem_lat,
            ot.origem_lon,
            ot.destino_lat,
            ot.destino_lon,
            ot.current_lat,
            ot.current_lon,
            ot.last_api_update
          FROM dados_dachser.t_tracking_sea ts
          LEFT JOIN dados_dachser.t_olimpo_tracking ot 
            ON ot.mode = 'sea' AND ot.asset COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci
          WHERE ts.active = 1
            AND NOT (
              UPPER(ts.container_status) IN ('DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED')
              AND ts.last_check < DATE_SUB(NOW(), INTERVAL 24 HOUR)
            )
          GROUP BY ts.mbl_id
          ORDER BY ts.eta ASC
        `);

        const out = rows.map((r: any) => {
          // Usar coordenadas do banco se disponíveis, senão usar fallback do dicionário de portos
          let origemLat = r.origem_lat ? Number(r.origem_lat) : null;
          let origemLon = r.origem_lon ? Number(r.origem_lon) : null;
          let destinoLat = r.destino_lat ? Number(r.destino_lat) : null;
          let destinoLon = r.destino_lon ? Number(r.destino_lon) : null;
          
          // Fallback para coordenadas de portos conhecidos
          if (origemLat === null || origemLon === null) {
            const portOrigem = getPortCoordinates(r.porto_origem);
            if (portOrigem) {
              origemLat = portOrigem.lat;
              origemLon = portOrigem.lon;
            }
          }
          
          if (destinoLat === null || destinoLon === null) {
            const portDestino = getPortCoordinates(r.porto_destino);
            if (portDestino) {
              destinoLat = portDestino.lat;
              destinoLon = portDestino.lon;
            }
          }
          
          return {
            mbl_id: r.mbl_id,
            container: r.container,
            consignee: r.consignee,
            cliente: r.consignee,
            tipo_processo: r.tipo_processo,
            porto_origem: r.porto_origem,
            porto_destino: r.porto_destino,
            vessel_name: r.vessel_name,
            vessel_imo: r.vessel_imo,
            eta: r.eta,
            container_status: r.container_status,
            last_event: r.last_event,
            last_check: r.last_check,
            shipping_line: r.shipping_line,
            is_eta_delayed: r.is_eta_delayed,
            origem_lat: origemLat,
            origem_lon: origemLon,
            destino_lat: destinoLat,
            destino_lon: destinoLon,
            current_lat: r.current_lat ? Number(r.current_lat) : null,
            current_lon: r.current_lon ? Number(r.current_lon) : null,
            last_api_update: r.last_api_update,
          };
        });

        await client.close();
        console.log(`[olimpo_sea_from_monitoring] Returning ${out.length} MBLs from t_tracking_sea`);
        
        return new Response(JSON.stringify({ 
          data: out,
          count: out.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[olimpo_sea_from_monitoring] Error:', e);
        return new Response(JSON.stringify({ error: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SYNC OLIMPO FROM MONITORING: Popular t_olimpo_tracking com dados do t_tracking_sea =====
    if (action === 'sync_olimpo_from_monitoring') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Inserir/atualizar MBLs ativos do t_tracking_sea no t_olimpo_tracking
        // Truncar origem_code e destino_code para evitar erro de coluna muito longa
        const result = await client.execute(`
          INSERT INTO dados_dachser.t_olimpo_tracking (
            mode, asset, cliente, tipo_processo,
            origem_code, destino_code, status,
            eta, vessel_name, container_status,
            shipping_line, updated_at, active
          )
          SELECT 
            'sea' AS mode,
            ts.mbl_id AS asset,
            LEFT(ts.consignee, 255) AS cliente,
            ts.tipo_processo,
            LEFT(ts.origem, 50) AS origem_code,
            LEFT(ts.destino, 50) AS destino_code,
            CASE 
              WHEN ts.eta IS NOT NULL AND ts.eta < DATE_SUB(NOW(), INTERVAL 3 DAY) THEN 'Atraso'
              WHEN UPPER(ts.container_status) IN ('DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED') THEN 'Entregue'
              ELSE 'Em trânsito'
            END AS status,
            ts.eta,
            LEFT(ts.navio, 100) AS vessel_name,
            ts.container_status,
            ts.shipping_line,
            NOW() AS updated_at,
            TRUE AS active
          FROM dados_dachser.t_tracking_sea ts
          WHERE ts.active = 1
          GROUP BY ts.mbl_id
          ON DUPLICATE KEY UPDATE
            cliente = VALUES(cliente),
            tipo_processo = VALUES(tipo_processo),
            origem_code = VALUES(origem_code),
            destino_code = VALUES(destino_code),
            status = VALUES(status),
            eta = VALUES(eta),
            vessel_name = VALUES(vessel_name),
            container_status = VALUES(container_status),
            shipping_line = VALUES(shipping_line),
            updated_at = NOW(),
            active = TRUE
        `);

        // Desativar MBLs que não estão mais ativos no monitoramento
        const deactivateResult = await client.execute(`
          UPDATE dados_dachser.t_olimpo_tracking ot
          SET ot.active = FALSE, ot.updated_at = NOW()
          WHERE ot.mode = 'sea'
            AND ot.active = TRUE
            AND ot.asset NOT IN (
              SELECT ts.mbl_id FROM dados_dachser.t_tracking_sea ts WHERE ts.active = 1
            )
        `);

        await client.close();
        console.log(`[sync_olimpo_from_monitoring] Synced ${result.affectedRows} rows, deactivated ${deactivateResult.affectedRows} rows`);

        return new Response(JSON.stringify({ 
          success: true,
          synced: result.affectedRows || 0,
          deactivated: deactivateResult.affectedRows || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[sync_olimpo_from_monitoring] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== REFRESH SEA TRACKING SMART: Re-rastrear apenas quando ETA ≤ 4 dias ou sem coordenadas =====
    if (action === 'refresh_sea_tracking_smart') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const apiKey = Deno.env.get('JSONCARGO_API_KEY');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'JSONCARGO_API_KEY não configurada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Buscar MBLs que precisam de re-rastreio:
        // 1. Sem coordenadas (origem ou destino)
        // 2. ETA ≤ 4 dias do futuro
        // 3. Container entregue recentemente (< 6h) para confirmar status
        const rows = await client.query(`
          SELECT 
            ot.id,
            ot.asset AS mbl_id,
            ot.origem_code,
            ot.destino_code,
            ot.origem_lat,
            ot.origem_lon,
            ot.destino_lat,
            ot.destino_lon,
            ot.current_lat,
            ot.current_lon,
            ot.eta,
            ot.vessel_name,
            ot.shipping_line,
            ot.container_status,
            ot.last_api_update
          FROM dados_dachser.t_olimpo_tracking ot
          WHERE ot.mode = 'sea'
            AND ot.active = TRUE
            AND (
              -- Sem coordenadas de origem/destino
              ot.origem_lat IS NULL 
              OR ot.origem_lon IS NULL
              OR ot.destino_lat IS NULL
              OR ot.destino_lon IS NULL
              -- ETA ≤ 4 dias do futuro
              OR (ot.eta IS NOT NULL AND ot.eta <= DATE_ADD(NOW(), INTERVAL 4 DAY))
              -- Container entregue recentemente (< 6h desde última atualização API)
              OR (
                UPPER(ot.container_status) IN ('DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED')
                AND (ot.last_api_update IS NULL OR ot.last_api_update < DATE_SUB(NOW(), INTERVAL 6 HOUR))
              )
            )
          ORDER BY ot.eta ASC
          LIMIT 20
        `);

        console.log(`[refresh_sea_tracking_smart] Found ${rows.length} MBLs to refresh`);

        let updated = 0;
        let errors = 0;

        for (const row of rows) {
          const mblId = row.mbl_id;
          const shippingLine = row.shipping_line;

          if (!mblId || !shippingLine) {
            console.log(`[refresh_sea_tracking_smart] Skipping ${mblId}: missing shipping_line`);
            continue;
          }

          try {
            // Buscar posição do navio via JSONCargo
            const apiShippingLine = toApiShippingLine(shippingLine);
            const trackRes = await jcJson('http://api.jsoncargo.com/api/v1/tracking', {
              carrier: apiShippingLine,
              number: mblId,
            }, 30000);

            if (trackRes.__curl_error || trackRes.error) {
              console.log(`[refresh_sea_tracking_smart] API error for ${mblId}: ${trackRes.__curl_error || trackRes.error}`);
              errors++;
              continue;
            }

            const data = trackRes.data || trackRes;
            
            // Extrair coordenadas
            let origemLat = row.origem_lat;
            let origemLon = row.origem_lon;
            let destinoLat = row.destino_lat;
            let destinoLon = row.destino_lon;
            let currentLat = row.current_lat;
            let currentLon = row.current_lon;

            // Coordenadas do porto de origem
            if (data.origin?.coordinates) {
              origemLat = data.origin.coordinates.latitude || data.origin.coordinates.lat;
              origemLon = data.origin.coordinates.longitude || data.origin.coordinates.lon;
            }

            // Coordenadas do porto de destino
            if (data.destination?.coordinates) {
              destinoLat = data.destination.coordinates.latitude || data.destination.coordinates.lat;
              destinoLon = data.destination.coordinates.longitude || data.destination.coordinates.lon;
            }

            // Posição atual do navio
            if (data.vessel?.position) {
              currentLat = data.vessel.position.latitude || data.vessel.position.lat;
              currentLon = data.vessel.position.longitude || data.vessel.position.lon;
            }

            // Atualizar t_olimpo_tracking
            await client.execute(`
              UPDATE dados_dachser.t_olimpo_tracking
              SET 
                origem_lat = ?,
                origem_lon = ?,
                destino_lat = ?,
                destino_lon = ?,
                current_lat = ?,
                current_lon = ?,
                last_api_update = NOW(),
                updated_at = NOW()
              WHERE id = ?
            `, [origemLat, origemLon, destinoLat, destinoLon, currentLat, currentLon, row.id]);

            updated++;
            console.log(`[refresh_sea_tracking_smart] Updated ${mblId}: origin(${origemLat},${origemLon}) dest(${destinoLat},${destinoLon}) current(${currentLat},${currentLon})`);

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e: any) {
            console.error(`[refresh_sea_tracking_smart] Error processing ${mblId}:`, e.message);
            errors++;
          }
        }

        await client.close();

        return new Response(JSON.stringify({ 
          success: true,
          total: rows.length,
          updated,
          errors
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[refresh_sea_tracking_smart] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ==================== SEA NOTIFICATION RULES ====================
    if (action === 'get_sea_regras_notificacao') {
      console.log('[olimpo-proxy] Fetching sea notification rules...');
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        // Create table if not exists (with new columns for v2)
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_sea_regras_notificacao (
            id INT PRIMARY KEY AUTO_INCREMENT,
            cliente_nome VARCHAR(255),
            cnpj_consignatario VARCHAR(20),
            tipo_processo ENUM('IMPORT', 'EXPORT', 'BOTH') DEFAULT 'BOTH',
            portos TEXT,
            portos_origem TEXT,
            portos_destino TEXT,
            eventos_disparo TEXT,
            frequencia VARCHAR(20) DEFAULT 'IMEDIATO',
            canais TEXT,
            emails_import TEXT,
            emails_export TEXT,
            template_id VARCHAR(100) DEFAULT 'default',
            ativo BOOLEAN DEFAULT TRUE,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        
        // Add new columns if they don't exist (migration for existing tables)
        try {
          await client.execute(`ALTER TABLE ${database}.t_sea_regras_notificacao ADD COLUMN portos_origem TEXT AFTER tipo_processo`);
        } catch (e: any) { /* Column might already exist */ }
        try {
          await client.execute(`ALTER TABLE ${database}.t_sea_regras_notificacao ADD COLUMN portos_destino TEXT AFTER portos_origem`);
        } catch (e: any) { /* Column might already exist */ }
        try {
          await client.execute(`ALTER TABLE ${database}.t_sea_regras_notificacao ADD COLUMN is_default BOOLEAN DEFAULT FALSE AFTER ativo`);
        } catch (e: any) { /* Column might already exist */ }
        
        const regras = await client.query(`SELECT * FROM ${database}.t_sea_regras_notificacao ORDER BY is_default DESC, created_at DESC`);
        await client.close();
        return new Response(JSON.stringify({ success: true, data: regras || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_sea_regras_notificacao] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (action === 'create_sea_regra_notificacao') {
      const body = await req.json();
      const { cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino, eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default } = body;
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        // If this is a default rule, unset all other defaults first
        if (is_default) {
          await client.execute(`UPDATE ${database}.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE`);
        }
        
        await client.execute(`
          INSERT INTO ${database}.t_sea_regras_notificacao 
          (cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino, eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [cliente_nome, cnpj_consignatario, tipo_processo || 'BOTH', portos_origem || '[]', portos_destino || '[]', eventos_disparo || '[]', frequencia || 'IMEDIATO', canais || '[]', emails_import, emails_export, template_id || 'default', ativo !== false ? 1 : 0, is_default ? 1 : 0]);
        await client.close();
        return new Response(JSON.stringify({ success: true, message: 'Regra criada com sucesso' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[create_sea_regra_notificacao] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (action === 'update_sea_regra_notificacao') {
      const body = await req.json();
      const { id, cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino, eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default } = body;
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        // If setting this rule as default, unset all other defaults first
        if (is_default === true) {
          await client.execute(`UPDATE ${database}.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE AND id != ?`, [id]);
        }
        
        const fields: string[] = [];
        const values: any[] = [];
        if (cliente_nome !== undefined) { fields.push('cliente_nome = ?'); values.push(cliente_nome); }
        if (cnpj_consignatario !== undefined) { fields.push('cnpj_consignatario = ?'); values.push(cnpj_consignatario); }
        if (tipo_processo !== undefined) { fields.push('tipo_processo = ?'); values.push(tipo_processo); }
        if (portos_origem !== undefined) { fields.push('portos_origem = ?'); values.push(portos_origem); }
        if (portos_destino !== undefined) { fields.push('portos_destino = ?'); values.push(portos_destino); }
        if (eventos_disparo !== undefined) { fields.push('eventos_disparo = ?'); values.push(eventos_disparo); }
        if (frequencia !== undefined) { fields.push('frequencia = ?'); values.push(frequencia); }
        if (canais !== undefined) { fields.push('canais = ?'); values.push(canais); }
        if (emails_import !== undefined) { fields.push('emails_import = ?'); values.push(emails_import); }
        if (emails_export !== undefined) { fields.push('emails_export = ?'); values.push(emails_export); }
        if (template_id !== undefined) { fields.push('template_id = ?'); values.push(template_id); }
        if (ativo !== undefined) { fields.push('ativo = ?'); values.push(ativo ? 1 : 0); }
        if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }
        if (fields.length > 0) {
          values.push(id);
          await client.execute(`UPDATE ${database}.t_sea_regras_notificacao SET ${fields.join(', ')} WHERE id = ?`, values);
        }
        await client.close();
        return new Response(JSON.stringify({ success: true, message: 'Regra atualizada com sucesso' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[update_sea_regra_notificacao] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (action === 'delete_sea_regra_notificacao') {
      const body = await req.json();
      const { id } = body;
      
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        await client.execute(`DELETE FROM ${database}.t_sea_regras_notificacao WHERE id = ?`, [id]);
        await client.close();
        return new Response(JSON.stringify({ success: true, message: 'Regra excluída com sucesso' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[delete_sea_regra_notificacao] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========== ACTION: REFRESH ALL VESSEL IMOS ==========
    // Atualiza em lote as IMOs de todos os containers usando busca por nome do navio
    if (action === 'refresh_all_vessel_imos') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        console.log('[refresh_all_vessel_imos] Starting batch IMO refresh...');
        
        // Buscar todos os containers ativos com nome de navio
        const rows = await client.query(`
          SELECT DISTINCT id, container, navio, vessel_imo, mbl_id
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1 
            AND navio IS NOT NULL 
            AND navio != ''
          ORDER BY last_check DESC
        `);
        
        console.log(`[refresh_all_vessel_imos] Found ${rows.length} containers with vessel names`);
        
        let updated = 0;
        let unchanged = 0;
        let errors = 0;
        const changes: any[] = [];
        
        // Processar em lotes para não sobrecarregar a API
        for (const row of rows) {
          const vesselName = row.navio;
          const currentImo = row.vessel_imo;
          
          try {
            // Buscar IMO pelo nome usando vessel/finder
            const foundImo = await findVesselImo(vesselName);
            
            if (foundImo && foundImo !== currentImo) {
              // Atualizar com nova IMO
              await client.execute(`
                UPDATE dados_dachser.t_tracking_sea 
                SET vessel_imo = ?, updated_at = NOW()
                WHERE id = ?
              `, [foundImo, row.id]);
              
              updated++;
              changes.push({
                container: row.container,
                mbl_id: row.mbl_id,
                vessel: vesselName,
                old_imo: currentImo,
                new_imo: foundImo
              });
              
              console.log(`[refresh_all_vessel_imos] Updated ${row.container}: ${currentImo} -> ${foundImo}`);
            } else {
              unchanged++;
            }
          } catch (e: any) {
            errors++;
            console.error(`[refresh_all_vessel_imos] Error processing ${row.container}:`, e.message);
          }
          
          // Pequeno delay para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await client.close();
        
        console.log(`[refresh_all_vessel_imos] Complete: ${updated} updated, ${unchanged} unchanged, ${errors} errors`);
        
        return new Response(JSON.stringify({
          success: true,
          total: rows.length,
          updated,
          unchanged,
          errors,
          changes: changes.slice(0, 50) // Limitar a 50 mudanças no response
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (e: any) {
        await client.close();
        console.error('[refresh_all_vessel_imos] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== ADD TRANSSHIPMENT_PORT COLUMN TO T_TRACKING_SEA =====
    if (action === 'add_transshipment_port_column') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        // Check if column exists
        const columns = await client.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = '${database}' 
            AND TABLE_NAME = 't_tracking_sea' 
            AND COLUMN_NAME = 'transshipment_port'
        `);
        
        if (columns.length === 0) {
          await client.execute(`
            ALTER TABLE ${database}.t_tracking_sea 
            ADD COLUMN transshipment_port VARCHAR(500) NULL 
            COMMENT 'Porto(s) de transbordo extraído da API JSONCargo'
          `);
          console.log('[add_transshipment_port_column] Column added successfully');
          await client.close();
          return new Response(JSON.stringify({ success: true, message: 'Coluna transshipment_port adicionada com sucesso' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          await client.close();
          return new Response(JSON.stringify({ success: true, message: 'Coluna transshipment_port já existe' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (e: any) {
        await client.close();
        console.error('[add_transshipment_port_column] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Setup LCL columns (tipo_carga, coloader) =====
    if (action === 'setup_lcl_columns') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        const results: string[] = [];
        
        // Check and add tipo_carga column
        const tipoCargaExists = await client.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = '${database}' 
            AND TABLE_NAME = 't_tracking_sea' 
            AND COLUMN_NAME = 'tipo_carga'
        `);
        
        if (tipoCargaExists.length === 0) {
          await client.execute(`
            ALTER TABLE ${database}.t_tracking_sea 
            ADD COLUMN tipo_carga ENUM('FCL', 'LCL') DEFAULT 'FCL' 
            COMMENT 'Tipo de carga: FCL ou LCL (manual)'
          `);
          results.push('tipo_carga column added');
        } else {
          results.push('tipo_carga column already exists');
        }
        
        // Check and add coloader column
        const coloaderExists = await client.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = '${database}' 
            AND TABLE_NAME = 't_tracking_sea' 
            AND COLUMN_NAME = 'coloader'
        `);
        
        if (coloaderExists.length === 0) {
          await client.execute(`
            ALTER TABLE ${database}.t_tracking_sea 
            ADD COLUMN coloader VARCHAR(255) NULL 
            COMMENT 'Nome do coloader/consolidador (apenas para LCL)'
          `);
          results.push('coloader column added');
        } else {
          results.push('coloader column already exists');
        }

        await client.close();
        console.log('[setup_lcl_columns] Results:', results);
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[setup_lcl_columns] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEARCH CLIENTES BASE: Autocomplete for consignee =====
    if (action === 'search_clientes_base') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado', clientes: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const searchTerm = url.searchParams.get('q') || '';
      const limit = parseInt(url.searchParams.get('limit') || '15', 10);

      if (searchTerm.length < 2) {
        return new Response(JSON.stringify({ success: true, clientes: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        const rows = await client.query(`
          SELECT 
            nome_cliente,
            cnpj,
            dchr_customer_number,
            cidade_uf,
            pais
          FROM ${database}.t_clientes_base
          WHERE ativo = 1 
            AND nome_cliente LIKE ?
          ORDER BY nome_cliente
          LIMIT ?
        `, [`%${searchTerm}%`, limit]);

        await client.close();
        console.log(`[search_clientes_base] Found ${rows.length} clients for term "${searchTerm}"`);
        
        return new Response(JSON.stringify({
          success: true,
          clientes: rows
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (e: any) {
        await client.close();
        console.error('[search_clientes_base] Error:', e);
        return new Response(JSON.stringify({ error: e.message, clientes: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== SEA TRACKING: Add LCL container manually =====
    if (action === 'add_lcl_container') {
      const mariadbHost = Deno.env.get('MARIADB_HOST');
      const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
      const mariadbUser = Deno.env.get('MARIADB_USER');
      const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
      const database = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

      if (!mariadbHost || !mariadbUser || !mariadbPass) {
        return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Parse request body
      let body: any = bodyData;
      if (!body) {
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: 'Body inválido' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const { mbl_id, container, shipping_line, consignee, eta, transbordo } = body;
      
      // Validate required fields
      if (!mbl_id || !container || !shipping_line) {
        return new Response(JSON.stringify({ error: 'mbl_id, container e coloader são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate container format (basic ISO format: 4 letters + 7 digits)
      const containerClean = container.trim().toUpperCase();
      if (!/^[A-Z]{4}[0-9]{6,7}$/.test(containerClean)) {
        return new Response(JSON.stringify({ error: 'Formato de container inválido. Use: ABCD1234567' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: database,
      });

      try {
        // Parse ETA if provided (format: DD/MM/YYYY)
        let etaParsed: Date | null = null;
        if (eta) {
          const parts = eta.split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            etaParsed = new Date(year, month, day);
            if (isNaN(etaParsed.getTime())) {
              etaParsed = null;
            }
          }
        }

        const mblClean = mbl_id.trim().toUpperCase();
        const coloaderName = shipping_line.trim();
        const consigneeClean = consignee ? consignee.trim() : null;
        const transshipmentPort = transbordo ? transbordo.trim() : null;

        // Insert the LCL container with tipo_carga = 'LCL' and coloader set
        await client.execute(`
          INSERT INTO ${database}.t_tracking_sea (
            mbl_id, container, coloader, tipo_carga, consignee, eta, transshipment_port, 
            active, tipo_processo, created_at, last_check
          ) VALUES (?, ?, ?, 'LCL', ?, ?, ?, 1, 'SEA IMPORT', NOW(), NOW())
          ON DUPLICATE KEY UPDATE 
            coloader = VALUES(coloader),
            tipo_carga = 'LCL',
            consignee = COALESCE(VALUES(consignee), consignee),
            eta = COALESCE(VALUES(eta), eta),
            transshipment_port = COALESCE(VALUES(transshipment_port), transshipment_port),
            active = 1,
            last_check = NOW()
        `, [mblClean, containerClean, coloaderName, consigneeClean, etaParsed, transshipmentPort]);

        await client.close();
        console.log(`[add_lcl_container] Added LCL container ${containerClean} for MBL ${mblClean} with coloader ${coloaderName}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Container LCL ${containerClean} cadastrado com sucesso`,
          data: { mbl_id: mblClean, container: containerClean, coloader: coloaderName, tipo_carga: 'LCL' }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[add_lcl_container] Error:', e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[olimpo-proxy] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
