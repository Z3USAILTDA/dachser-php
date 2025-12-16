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
  const apiKey = Deno.env.get('JSONCARGO_API_KEY');
  if (!apiKey) return { __curl_error: 'no_api_key' };
  
  const params = new URLSearchParams(qs);
  const fullUrl = params.toString() ? `${url}?${params}` : url;
  
  return curlJson(fullUrl, {
    'x-api-key': apiKey,
    'Accept': 'application/json'
  }, timeout);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    console.log(`[olimpo-proxy] Action: ${action}`);

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
      // ⚠️ FLAG: Pausar chamadas JSONCargo - usar apenas cache
      const SKIP_API_CALLS = true;
      
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

          // Limitar chamadas de API para evitar rate limit
          if (apiCallCount >= 5) {
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
          LEFT JOIN dados_dachser.t_dados_master dm ON dm.mawb = af.awb
          WHERE af.num_voo IS NOT NULL
            AND TRIM(af.num_voo) <> ''
            AND TRIM(af.num_voo) <> '0'
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

    // ===== SEA TRACKING: Get tracked containers =====
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
      const shippingLine = url.searchParams.get('shipping_line') || '';

      if (!containerId) {
        return new Response(JSON.stringify({ error: 'container obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Call JSONCargo API
      const qs: Record<string, string> = {};
      if (shippingLine) qs['shipping_line'] = shippingLine;
      
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
          SELECT container, shipping_line FROM ai_agente.t_dachser_container_tracking WHERE active = 1
        `);

        let updated = 0;
        let errors = 0;

        for (const row of containers) {
          const containerId = row.container;
          const shippingLine = row.shipping_line || '';
          
          const qs: Record<string, string> = {};
          if (shippingLine) qs['shipping_line'] = shippingLine;
          
          const apiRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs, 15000);

          if (!apiRes.__curl_error) {
            const trackingData = {
              container_status: apiRes.container_status || apiRes.status || null,
              loading_port: apiRes.loading_port?.name || apiRes.pol || null,
              discharging_port: apiRes.discharging_port?.name || apiRes.pod || null,
              eta: apiRes.eta_final_destination || apiRes.eta || null,
              vessel: apiRes.vessel?.name || apiRes.current_vessel_name || null,
              last_event: apiRes.last_movement?.description || apiRes.container_status || null,
            };

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
              containerId
            ]);
            updated++;
          } else {
            errors++;
          }

          // Rate limit: 200ms between calls
          await new Promise(r => setTimeout(r, 200));
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
