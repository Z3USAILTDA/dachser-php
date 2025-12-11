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
    const body = await req.json();
    const { limit = 100, offset = 0 } = body;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Anti-join query to find AWBs in t_dados_master that are NOT in t_status_aereo
    const query = `
      SELECT 
        MAX(m.cliente) as destinatario,
        TRIM(m.mawb) as mawb,
        MAX(TRIM(m.hawb)) as hawb,
        MAX(m.nome_analista) as nome_analista,
        MAX(m.email_analista) as email_analista
      FROM ${database}.t_dados_master m
      LEFT JOIN ${database}.t_status_aereo s ON TRIM(m.mawb) = TRIM(s.awb)
      WHERE m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND m.mawb IS NOT NULL 
        AND TRIM(m.mawb) != ''
        AND LENGTH(TRIM(m.mawb)) >= 3
        AND s.awb IS NULL
      GROUP BY TRIM(m.mawb)
      ORDER BY TRIM(m.mawb) ASC
      LIMIT ? OFFSET ?
    `;

    console.log(`Fetching unprocessed AIR IMPORT/EXPORT records with limit=${limit}, offset=${offset}`);

    const rows = await client.query(query, [limit, offset]);
    
    // Get the last processed AWB from t_status_aereo for reference
    const lastAwbQuery = `
      SELECT TRIM(awb) as awb 
      FROM ${database}.t_status_aereo 
      ORDER BY id DESC 
      LIMIT 1
    `;
    const lastAwbResult = await client.query(lastAwbQuery);
    const lastMasterAwb = lastAwbResult[0]?.awb || null;

    // Get total count of unprocessed AWBs
    const countQuery = `
      SELECT COUNT(DISTINCT TRIM(m.mawb)) as total
      FROM ${database}.t_dados_master m
      LEFT JOIN ${database}.t_status_aereo s ON TRIM(m.mawb) = TRIM(s.awb)
      WHERE m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND m.mawb IS NOT NULL 
        AND TRIM(m.mawb) != ''
        AND LENGTH(TRIM(m.mawb)) >= 3
        AND s.awb IS NULL
    `;
    const countResult = await client.query(countQuery);
    const total = countResult[0]?.total || 0;

    console.log(`Found ${total} unprocessed AWBs, returning ${Array.isArray(rows) ? rows.length : 0}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: rows,
        total: total,
        lastMasterAwb: lastMasterAwb
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in fetch-air-imports:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
