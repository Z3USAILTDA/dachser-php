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

    // ===== SEA TRACKING: Get MBL tracking data from t_tracking_sea (grouped by MBL) =====
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

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Excluir MBLs que só têm containers marcados como NAO_ENCONTRADO
        const rows = await client.query(`
          SELECT 
            ts.mbl_id,
            MAX(ts.tipo_processo) as tipo_processo,
            MAX(ts.consignee) as consignee,
            MAX(ts.shipping_line) as shipping_line,
            MAX(ts.origem) as origem,
            MAX(ts.destino) as destino,
            MAX(ts.navio) as navio,
            MAX(ts.eta) as eta,
            MAX(ts.email_analista) as email_analista,
            MAX(ts.email_cliente) as email_cliente,
            COUNT(DISTINCT CASE WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', '') AND ts.container IS NOT NULL THEN ts.container END) as container_count,
            MAX(ts.container_status) as container_status,
            MAX(ts.last_event) as last_event,
            MAX(ts.last_check) as last_check,
            MAX(ts.active) as active,
            MAX(ts.created_at) as created_at,
            MAX(ts.updated_at) as updated_at
          FROM dados_dachser.t_tracking_sea ts
          WHERE ts.active = 1
          GROUP BY ts.mbl_id
          HAVING 
            -- Só mostrar MBLs que têm pelo menos 1 container real OU que ainda estão pendentes de enriquecimento
            COUNT(DISTINCT CASE WHEN ts.container NOT IN ('NAO_ENCONTRADO', 'PENDENTE', 'IGNORADO', '') AND ts.container IS NOT NULL THEN ts.container END) > 0
            OR MAX(ts.container) = 'PENDENTE'
            OR MAX(ts.container) IS NULL
            OR MAX(ts.container) = ''
          ORDER BY MAX(ts.last_check) DESC, ts.mbl_id
        `);

        await client.close();
        console.log(`[get_sea_tracking] Returning ${rows.length} MBLs from t_tracking_sea`);
        return new Response(JSON.stringify({ success: true, data: rows }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        await client.close();
        console.error('[get_sea_tracking] Error:', e);
        return new Response(JSON.stringify({ error: e.message, data: [] }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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
        const rows = await client.query(`
          SELECT 
            id, mbl_id, container, shipping_line, 
            container_status, last_event, last_check, 
            eta, navio, origem, destino, consignee
          FROM dados_dachser.t_tracking_sea
          WHERE mbl_id = ?
          ORDER BY container
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
        
        // Prefixos de booking references (não são MBLs reais)
        const BOOKING_PREFIXES = ['EBKG', 'BKNG', 'BKG'];
        // Prefixos de referências internas
        const INTERNAL_PREFIXES = ['GLNL', 'GLSL', 'GLDL', 'BRSA'];
        
        // REGEXP que aceita formatos reais de MBL:
        // 1. SCAC padrão: 4 letras + números (ex: COSU6437929310)
        // 2. SCAC estendido: 4 letras + 0-3 letras (código porto) + números + alfanuméricos
        //    Ex: HLCUHAM251021534, MEDUBD238946, HLCUHAM2511APAR5, ONEYHAMFA1481300
        const MBL_REGEXP_SCAC_PADRAO = '^[A-Za-z]{4}[0-9]+$';
        const MBL_REGEXP_SCAC_ESTENDIDO = `^(${VALID_MBL_PREFIXES})[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$`;
        
        // Primeiro, vamos contar estatísticas detalhadas para log
        const statsQuery = await client.query(`
          SELECT 
            COUNT(*) as total_candidatos,
            SUM(CASE WHEN TRIM(md.mawb) REGEXP '^[A-Za-z]{4}[0-9]+$' THEN 1 ELSE 0 END) as formato_scac_padrao,
            SUM(CASE 
              WHEN TRIM(md.mawb) REGEXP '^(${VALID_MBL_PREFIXES})[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$' 
              AND TRIM(md.mawb) NOT REGEXP '^[A-Za-z]{4}[0-9]+$'
              THEN 1 ELSE 0 
            END) as formato_scac_estendido,
            SUM(CASE WHEN LEFT(TRIM(md.mawb), 4) IN ('EBKG', 'BKNG') THEN 1 ELSE 0 END) as booking_references,
            SUM(CASE WHEN LEFT(TRIM(md.mawb), 4) IN ('GLNL', 'GLSL', 'GLDL', 'BRSA') THEN 1 ELSE 0 END) as referencias_internas,
            SUM(CASE WHEN TRIM(md.mawb) REGEXP '^BR[A-Za-z]{3}' THEN 1 ELSE 0 END) as hawbs_brasileiros,
            SUM(CASE WHEN md.container IS NULL OR TRIM(md.container) = '' THEN 1 ELSE 0 END) as containers_vazios,
            SUM(CASE WHEN md.container IS NOT NULL AND TRIM(md.container) != '' AND TRIM(md.container) REGEXP '^[A-Za-z]{4}[0-9]{7}$' THEN 1 ELSE 0 END) as containers_validos
          FROM dados_dachser.t_master_dados md
          WHERE md.mawb IS NOT NULL 
            AND TRIM(md.mawb) != ''
            AND md.etd >= '2025-12-01'
            AND md.tipo_processo LIKE '%SEA%'
        `);
        
        const stats = statsQuery[0] || {};
        const totalMblsValidos = (Number(stats.formato_scac_padrao) || 0) + (Number(stats.formato_scac_estendido) || 0);
        console.log(`[sync_sea_tracking] Stats: total=${stats.total_candidatos}, scacPadrao=${stats.formato_scac_padrao}, scacEstendido=${stats.formato_scac_estendido}, totalValidos=${totalMblsValidos}, bookingRefs=${stats.booking_references}, refsInternas=${stats.referencias_internas}, hawbs=${stats.hawbs_brasileiros}, containersVazios=${stats.containers_vazios}, containersValidos=${stats.containers_validos}`);

        // Validação atualizada:
        // - MBL formato SCAC padrão: 4 letras + números (ex: COSU6437929310)
        // - MBL formato SCAC estendido: prefixo armador + código porto + números (ex: HLCUHAM251021534)
        // - Rejeitar booking references (EBKG, etc.)
        // - Rejeitar referências internas (GLNL, GLSL, etc.)
        // - Rejeitar HAWBs brasileiros (ex: BRSAO123456)
        // - Container: aceitar vazio (usa 'PENDENTE'), mas validar formato se presente
        // - ETD >= 01/12/2025
        // - Apenas processos SEA
        const result = await client.execute(`
          INSERT INTO dados_dachser.t_tracking_sea (
            mbl_id, tipo_processo, container,
            shipping_line, consignee, origem, destino,
            navio, eta, last_event, container_status,
            last_check, email_analista, email_cliente, active
          )
          SELECT
            TRIM(md.mawb) AS mbl_id,
            md.tipo_processo,
            CASE 
              WHEN md.container IS NULL OR TRIM(md.container) = '' THEN 'PENDENTE'
              ELSE TRIM(md.container)
            END AS container,
            NULL AS shipping_line,
            md.cliente AS consignee,
            NULL AS origem,
            NULL AS destino,
            NULL AS navio,
            NULL AS eta,
            NULL AS last_event,
            NULL AS container_status,
            NULL AS last_check,
            md.email_analista,
            md.emails_cliente AS email_cliente,
            COALESCE(md.active, 1) AS active
          FROM dados_dachser.t_master_dados md
          WHERE md.mawb IS NOT NULL 
            AND TRIM(md.mawb) != ''
            -- VALIDAÇÃO MBL: formato SCAC padrão OU estendido (armadores conhecidos)
            AND (
              TRIM(md.mawb) REGEXP '^[A-Za-z]{4}[0-9]+$'
              OR TRIM(md.mawb) REGEXP '^(${VALID_MBL_PREFIXES})[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$'
            )
            -- REJEITAR booking references
            AND LEFT(TRIM(md.mawb), 4) NOT IN ('EBKG', 'BKNG')
            -- REJEITAR referências internas
            AND LEFT(TRIM(md.mawb), 4) NOT IN ('GLNL', 'GLSL', 'GLDL', 'BRSA')
            -- REJEITAR HAWBs brasileiros (começam com BR + 3 letras)
            AND TRIM(md.mawb) NOT REGEXP '^BR[A-Za-z]{3}'
            -- Filtro de antiguidade: ETD >= 01/12/2025
            AND md.etd >= '2025-12-01'
            -- Apenas processos marítimos
            AND md.tipo_processo LIKE '%SEA%'
          ON DUPLICATE KEY UPDATE
            tipo_processo = VALUES(tipo_processo),
            container = VALUES(container),
            consignee = VALUES(consignee),
            email_analista = VALUES(email_analista),
            email_cliente = VALUES(email_cliente),
            active = VALUES(active)
        `);

        await client.close();
        
        const synced = result.affectedRows || 0;
        console.log(`[sync_sea_tracking] Synced ${synced} rows (MBL SCAC padrão + estendido, container opcional)`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          synced,
          message: `${synced} registros sincronizados`,
          stats: {
            total_candidatos: Number(stats.total_candidatos) || 0,
            formato_scac_padrao: Number(stats.formato_scac_padrao) || 0,
            formato_scac_estendido: Number(stats.formato_scac_estendido) || 0,
            total_mbls_validos: totalMblsValidos,
            booking_references: Number(stats.booking_references) || 0,
            referencias_internas: Number(stats.referencias_internas) || 0,
            hawbs_brasileiros: Number(stats.hawbs_brasileiros) || 0,
            containers_vazios: Number(stats.containers_vazios) || 0,
            containers_validos: Number(stats.containers_validos) || 0,
            aceitos: synced
          },
          validation_rules: {
            mbl_scac_padrao: '^[A-Za-z]{4}[0-9]+$ (ex: COSU6437929310)',
            mbl_scac_estendido: `^(${VALID_MBL_PREFIXES.substring(0, 30)}...)[A-Za-z]{0,6}[0-9]{2,}[A-Za-z0-9]*$ (ex: HLCUHAM251021534)`,
            mbl_reject_booking: 'EBKG*, BKNG* (booking references)',
            mbl_reject_internal: 'GLNL*, GLSL*, GLDL*, BRSA* (referências internas)',
            mbl_reject_hawb: '^BR[A-Za-z]{3} (HAWBs brasileiros)',
            container: 'Opcional (usa PENDENTE se vazio)',
            etd_min: '2025-12-01'
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
      const startTime = Date.now();

      const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
      const client = await new Client().connect({
        hostname: mariadbHost,
        port: parseInt(mariadbPort, 10),
        username: mariadbUser,
        password: mariadbPass,
        db: 'dados_dachser',
      });

      try {
        // Ensure last_error column exists
        try {
          await client.execute(`
            ALTER TABLE dados_dachser.t_tracking_sea 
            ADD COLUMN IF NOT EXISTS last_error VARCHAR(255) DEFAULT NULL
          `);
        } catch (alterErr: any) {
          // Column might already exist, ignore error
          console.log('[refresh_sea_tracking] last_error column check:', alterErr.message);
        }

        // Query containers that need update: valid ISO format AND (never checked OR checked > N hours ago)
        // Include mbl_id to detect shipping line from MBL prefix for leasing containers
        // ONLY select containers with "Aguardando" status (pending, no events yet)
        const containers = await client.query(`
          SELECT id, mbl_id, container, shipping_line, navio 
          FROM dados_dachser.t_tracking_sea 
          WHERE active = 1
            AND container IS NOT NULL
            AND container NOT IN ('PENDENTE', 'NAO_ENCONTRADO', 'IGNORADO', '')
            AND container REGEXP '^[A-Za-z]{4}[0-9]{7}$'
            AND (last_check IS NULL OR last_check < DATE_SUB(NOW(), INTERVAL ? HOUR))
            AND (
              container_status IS NULL 
              OR container_status = '' 
              OR container_status = 'PENDING'
              OR last_event IS NULL 
              OR last_event = '' 
              OR last_event LIKE '%Aguardando%'
            )
          ORDER BY last_check ASC
          LIMIT ?
        `, [staleHours, batchSize]);

        console.log(`[refresh_sea_tracking] Processing ${containers.length} pending containers (status=AGD, stale > ${staleHours}h)`);

        let updated = 0;
        let errors = 0;
        let processed = 0;
        let leasingDetected = 0;

        // Extended mapping for container prefixes to shipping lines
        const CONTAINER_PREFIX_TO_SHIPPING_LINE: Record<string, string> = {
          // CMA CGM (including APL)
          'CMAU': 'CMA_CGM', 'CXDU': 'CMA_CGM', 'CGMU': 'CMA_CGM', 'SEGU': 'CMA_CGM',
          'APLU': 'CMA_CGM', 'APHU': 'CMA_CGM',
          // CCLU - CMA CGM predominant
          'CCLU': 'CMA_CGM',
          // MSC
          'MSCU': 'MSC', 'MEDU': 'MSC', 'MSDU': 'MSC', 'TRLU': 'MSC', 'GLDU': 'MSC',
          // MAERSK (including Hamburg Sud)
          'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK', 'PONU': 'MAERSK', 'SUDU': 'MAERSK',
          // Hapag-Lloyd (inclui UACU - United Arab Shipping Company adquirida em 2017)
          'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD', 'TCLU': 'HAPAG_LLOYD', 'UACU': 'HAPAG_LLOYD',
          // ONE
          'ONEY': 'ONE', 'ONEU': 'ONE', 'NYKU': 'ONE', 'MOLU': 'ONE', 'KKFU': 'ONE',
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
          'CLHU': 'CROWLEY',
          // Arkas
          'ARKU': 'ARKAS',
          // Turkon
          'TRKU': 'TURKON',
          // Grimaldi
          'GRIU': 'GRIMALDI',
          // Alianca (now Hamburg Sud/Maersk)
          'ALIU': 'MAERSK',
        };

        // MBL prefix to shipping line mapping (for detecting carrier from MBL when container is leasing)
        const MBL_PREFIX_TO_SHIPPING_LINE: Record<string, string> = {
          // Hapag-Lloyd MBL prefixes
          'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD', 
          // MSC MBL prefixes
          'MSCU': 'MSC', 'MEDU': 'MSC',
          // Maersk MBL prefixes  
          'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK',
          // CMA CGM MBL prefixes
          'CMAU': 'CMA_CGM', 'CGMU': 'CMA_CGM',
          // ONE MBL prefixes
          'ONEY': 'ONE', 'ONEU': 'ONE',
          // Evergreen MBL prefixes
          'EISU': 'EVERGREEN', 'EITU': 'EVERGREEN',
          // COSCO MBL prefixes
          'COSU': 'COSCO', 'OOLU': 'COSCO',
          // Yang Ming MBL prefixes
          'YMLU': 'YANG_MING',
          // HMM MBL prefixes
          'HDMU': 'HMM', 'HMMU': 'HMM',
          // ZIM MBL prefixes
          'ZIMU': 'ZIM',
        };

        for (const row of containers) {
          // Time control: stop if approaching timeout
          if (Date.now() - startTime > maxTimeMs) {
            console.log(`[refresh_sea_tracking] Time limit reached after ${processed} containers`);
            break;
          }

          const containerId = row.container;
          const mblId = row.mbl_id || '';
          let shippingLine = row.shipping_line || '';
          let shippingLineSource = 'database';
          
          // Step 1: Try to get shipping line from database
          if (!shippingLine && containerId) {
            const prefix = containerId.substring(0, 4).toUpperCase();
            shippingLine = CONTAINER_PREFIX_TO_SHIPPING_LINE[prefix] || '';
            if (shippingLine) shippingLineSource = 'container_prefix';
          }
          
          // Step 2: If container prefix not recognized (leasing container), use MBL prefix
          if (!shippingLine && mblId) {
            const mblPrefix = mblId.substring(0, 4).toUpperCase();
            shippingLine = MBL_PREFIX_TO_SHIPPING_LINE[mblPrefix] || '';
            if (shippingLine) {
              shippingLineSource = 'mbl_prefix';
              leasingDetected++;
              console.log(`[refresh_sea_tracking] Leasing container ${containerId}: using ${shippingLine} from MBL ${mblId}`);
            }
          }
          
          // Step 3: If still no shipping line, log and mark as unidentifiable
          if (!shippingLine) {
            const containerPrefix = containerId ? containerId.substring(0, 4).toUpperCase() : 'UNKNOWN';
            const mblPrefix = mblId ? mblId.substring(0, 4).toUpperCase() : 'UNKNOWN';
            console.log(`[refresh_sea_tracking] Cannot identify carrier for ${containerId} (prefix: ${containerPrefix}, MBL: ${mblId}, MBL prefix: ${mblPrefix})`);
            
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET last_check = NOW(), last_error = ?
              WHERE id = ?
            `, [`armador_nao_identificado: container=${containerPrefix} mbl=${mblPrefix}`, row.id]);
            errors++;
            processed++;
            continue;
          }
          
          const qs: Record<string, string> = {};
          if (shippingLine) qs['shipping_line'] = shippingLine;
          
          const apiRes = await jcJson(`http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerId)}`, qs, 15000);
          
          if (!apiRes.__curl_error && !apiRes.error && (apiRes.data || apiRes.container_status)) {
            const data = apiRes.data || apiRes;
            
            let lastEventDescription = data.container_status || null;
            if (data.events && Array.isArray(data.events) && data.events.length > 0) {
              lastEventDescription = data.events[0].description || data.events[0].event_type || lastEventDescription;
            } else if (data.last_movement?.description) {
              lastEventDescription = data.last_movement.description;
            }
            
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET 
                container_status = ?,
                origem = COALESCE(?, origem),
                destino = COALESCE(?, destino),
                eta = ?,
                navio = COALESCE(?, navio),
                last_event = ?,
                shipping_line = COALESCE(?, shipping_line),
                last_check = NOW(),
                last_error = NULL
              WHERE id = ?
            `, [
              data.container_status || null,
              data.loading_port || data.shipped_from || null,
              data.discharging_port || data.shipped_to || null,
              data.eta_final_destination || data.eta ? new Date(data.eta_final_destination || data.eta) : null,
              data.current_vessel_name || data.last_vessel_name || null,
              lastEventDescription,
              shippingLine ? normalizeShippingLine(shippingLine) : null,
              row.id
            ]);
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
        console.log(`[refresh_sea_tracking] Batch done: ${updated} updated, ${errors} errors, ${leasingDetected} leasing containers detected, ${remaining} remaining`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          updated, 
          errors, 
          processed,
          leasingDetected,
          remaining,
          batchSize,
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
        'HLCU': 'HAPAG_LLOYD', 'HLXU': 'HAPAG_LLOYD',
        'MAEU': 'MAERSK', 'MRKU': 'MAERSK', 'MSKU': 'MAERSK',
        'MSCU': 'MSC', 'MEDU': 'MSC',
        'CMAU': 'CMA_CGM', 'CCLU': 'CMA_CGM', 'CXDU': 'CMA_CGM',
        'ONEY': 'ONE', 'ONEU': 'ONE',
        'HDMU': 'HMM', 'HMMU': 'HMM',
        'EISU': 'EVERGREEN', 'EITU': 'EVERGREEN', 'EGSU': 'EVERGREEN', 'EGHU': 'EVERGREEN', 'EBKG': 'EVERGREEN',
        'YMLU': 'YANG_MING', 'YMMU': 'YANG_MING',
        'ZIMU': 'ZIM', 'ZCSU': 'ZIM',
        'GLNL': 'HAPAG_LLOYD', 'GLSL': 'CMA_CGM',
      };

      const detectShippingLineFromMbl = (mblId: string): string | null => {
        if (!mblId) return null;
        const prefix = mblId.substring(0, 4).toUpperCase();
        return MBL_PREFIX_TO_SHIPPING_LINE[prefix] || null;
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
      const batchSize = parseInt(url.searchParams.get('batch_size') || '10', 10);
      const maxTimeMs = parseInt(url.searchParams.get('max_time_ms') || '45000', 10);
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

          if (!shippingLine) {
            console.log(`[enrich_sea_containers] Could not detect shipping line for MBL ${mblId}`);
            // Marcar como ARMADOR_DESCONHECIDO para não reprocessar
            await client.execute(`
              UPDATE dados_dachser.t_tracking_sea 
              SET container = 'ARMADOR_DESCONHECIDO'
              WHERE mbl_id = ? AND (container = 'PENDENTE' OR container IS NULL OR container = '')
            `, [mblId]);
            details.push({ mbl: mblId, status: 'unknown_shipping_line' });
            errors++;
            continue;
          }

          try {
            // Call JsonCargo API to get containers for this MBL
            const apiRes = await jcJson(
              `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(mblId)}`,
              { shipping_line: shippingLine }
            );

            if (apiRes.__curl_error) {
              console.log(`[enrich_sea_containers] API error for MBL ${mblId}: ${apiRes.__curl_error}`);
              details.push({ mbl: mblId, status: 'api_error', error: apiRes.__curl_error });
              errors++;
              continue;
            }

            const data = apiRes.data || apiRes;
            const containers = data.associated_container_numbers || [];

            if (containers.length === 0) {
              console.log(`[enrich_sea_containers] No containers found for MBL ${mblId}`);
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
                normalizeShippingLine(shippingLine)
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

      const trackingData = {
        container: containerId,
        container_status: data.container_status || null,
        loading_port: data.loading_port?.name || data.pol || data.loading_port || null,
        discharging_port: data.discharging_port?.name || data.pod || data.discharging_port || null,
        eta: data.eta_final_destination || data.eta || null,
        vessel: data.vessel?.name || data.current_vessel_name || null,
        last_event: lastEventDescription,
      };

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
