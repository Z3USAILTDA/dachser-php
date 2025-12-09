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

      // Import mysql dynamically
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
