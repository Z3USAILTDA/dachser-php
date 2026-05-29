import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;
  try {
    const host = Deno.env.get('MARIADB_SEA_HOST') || Deno.env.get('MARIADB_OPS_HOST') || Deno.env.get('MARIADB_AIR_HOST');
    const port = parseInt(
      Deno.env.get('MARIADB_SEA_PORT') || Deno.env.get('MARIADB_OPS_PORT') || Deno.env.get('MARIADB_AIR_PORT') || '3306'
    );
    const database = Deno.env.get('MARIADB_SEA_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE') || Deno.env.get('MARIADB_AIR_DATABASE');
    const username = Deno.env.get('MARIADB_SEA_USER') || Deno.env.get('MARIADB_OPS_USER') || Deno.env.get('MARIADB_AIR_USER');
    const password = Deno.env.get('MARIADB_SEA_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD') || Deno.env.get('MARIADB_AIR_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('MariaDB credentials not configured (SEA/OPS/AIR)');
    }

    client = await new Client().connect({
      hostname: host,
      port,
      db: database,
      username,
      password,
    });

    const totalRows = await client.query(
      `SELECT COUNT(*) AS total FROM t_master_dados
       WHERE active = 1 AND tipo_processo = 'SEA EXPORT'`
    );

    const eligibleRows = await client.query(`
      SELECT COUNT(*) AS eligible FROM t_master_dados m
      WHERE m.active = 1
        AND m.tipo_processo = 'SEA EXPORT'
        AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
        AND (
          m.mawb LIKE 'HLC%'  OR m.mawb LIKE 'MSC%'  OR m.mawb LIKE 'MEDU%'
          OR m.mawb LIKE 'ONEY%' OR m.mawb LIKE 'ONEU%' OR m.mawb LIKE 'EBKG%'
          OR m.mawb LIKE 'NYKU%' OR m.mawb LIKE 'MOLU%' OR m.mawb LIKE 'KKFU%'
          OR m.mawb LIKE 'MOAU%' OR m.mawb LIKE 'KKLU%'
        )
        AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
    `);

    const lastInsertRows = await client.query(
      `SELECT MAX(data_insert) AS last_insert FROM t_master_dados WHERE tipo_processo = 'SEA EXPORT'`
    );

    await client.close();

    const stats = {
      total: (totalRows as any[])[0]?.total ?? 0,
      eligible: (eligibleRows as any[])[0]?.eligible ?? 0,
      lastInsert: (lastInsertRows as any[])[0]?.last_insert ?? null,
    };

    return new Response(JSON.stringify({ success: true, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-sea-master-dados-stats error:', error);
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
