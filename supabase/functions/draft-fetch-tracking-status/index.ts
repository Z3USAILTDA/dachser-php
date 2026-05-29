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

    const sql = `
      SELECT id, mbl_id, booking, origem, destino, navio, voyage,
             etd, eta, tipo_processo, status_armador,
             transaction_id, hash_hapag_lloyd, api_endpoint,
             data_hora_servidor, data_hora_consulta, created_at
      FROM t_consulta_armador
    `;

    const rows = await client.query(sql);
    await client.close();

    // Map por mbl_id (mantém o mais recente)
    const trackingStatus: Record<string, any> = {};
    for (const row of rows as any[]) {
      const key = (row.mbl_id || '').trim();
      if (!key) continue;
      const existing = trackingStatus[key];
      const rowDate = new Date(row.data_hora_consulta || row.created_at || 0).getTime();
      const existingDate = existing ? new Date(existing.data_hora_consulta || existing.created_at || 0).getTime() : -1;
      if (!existing || rowDate >= existingDate) {
        trackingStatus[key] = row;
      }
    }

    return new Response(JSON.stringify({ success: true, trackingStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('draft-fetch-tracking-status error:', error);
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
