import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalize(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 120);
}

async function getClient(): Promise<Client> {
  const host = Deno.env.get('MARIADB_SEA_HOST') || Deno.env.get('MARIADB_OPS_HOST') || Deno.env.get('MARIADB_AIR_HOST');
  const port = parseInt(Deno.env.get('MARIADB_SEA_PORT') || Deno.env.get('MARIADB_OPS_PORT') || Deno.env.get('MARIADB_AIR_PORT') || '3306');
  const db = Deno.env.get('MARIADB_SEA_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE') || Deno.env.get('MARIADB_AIR_DATABASE');
  const user = Deno.env.get('MARIADB_SEA_USER') || Deno.env.get('MARIADB_OPS_USER') || Deno.env.get('MARIADB_AIR_USER');
  const password = Deno.env.get('MARIADB_SEA_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD') || Deno.env.get('MARIADB_AIR_PASSWORD');
  if (!host || !db || !user || !password) throw new Error('MariaDB credentials not configured');
  return await new Client().connect({ hostname: host, port, db, username: user, password });
}

async function ensureTable(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS t_vessel_registry (
      vessel_name_normalized VARCHAR(120) NOT NULL,
      vessel_name_original VARCHAR(180) NULL,
      imo VARCHAR(20) NULL,
      mmsi VARCHAR(20) NULL,
      flag VARCHAR(80) NULL,
      source VARCHAR(20) NULL,
      hit_count INT NOT NULL DEFAULT 1,
      last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (vessel_name_normalized)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function scrapeVesselFinder(name: string): Promise<{ imo?: string; mmsi?: string } | null> {
  const url = `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(name)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Pattern 1: link /vessels/details/<IMO>
    const m1 = html.match(/\/vessels\/details\/(\d{7})/);
    if (m1) return { imo: m1[1] };
    // Pattern 2: data attribute
    const m2 = html.match(/data-imo=["'](\d{7})["']/);
    if (m2) return { imo: m2[1] };
    return null;
  } catch (e) {
    console.log('scrape failed:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let client: Client | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const vesselName = typeof body?.vesselName === 'string' ? body.vesselName : '';
    if (!vesselName || vesselName.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'vesselName required (min 2 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalized = normalize(vesselName);
    client = await getClient();
    await ensureTable(client);

    // 1) Cache lookup
    const cached = await client.query(
      'SELECT imo, mmsi FROM t_vessel_registry WHERE vessel_name_normalized = ? LIMIT 1',
      [normalized]
    );
    if (cached.length > 0 && cached[0].imo) {
      await client.execute(
        'UPDATE t_vessel_registry SET hit_count = hit_count + 1 WHERE vessel_name_normalized = ?',
        [normalized]
      );
      await client.close();
      return new Response(JSON.stringify({
        imo: cached[0].imo,
        mmsi: cached[0].mmsi || null,
        source: 'cache',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2) Scrape fallback
    const scraped = await scrapeVesselFinder(normalized);
    if (scraped?.imo) {
      await client.execute(
        `INSERT INTO t_vessel_registry (vessel_name_normalized, vessel_name_original, imo, mmsi, source)
         VALUES (?, ?, ?, ?, 'scrape')
         ON DUPLICATE KEY UPDATE imo = VALUES(imo), mmsi = VALUES(mmsi), source = 'scrape', hit_count = hit_count + 1`,
        [normalized, vesselName.trim().slice(0, 180), scraped.imo, scraped.mmsi || null]
      );
      await client.close();
      return new Response(JSON.stringify({
        imo: scraped.imo,
        mmsi: scraped.mmsi || null,
        source: 'scrape',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await client.close();
    return new Response(JSON.stringify({ source: 'none' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('resolve-vessel-imo error:', error);
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ source: 'none', error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
