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

    // Get the last processed AWB from t_status_aereo ordered by ID descending
    const query = `
      SELECT 
        id,
        TRIM(awb) as awb,
        TRIM(hawb) as hawb,
        destinatário as destinatario,
        último_status as ultimo_status,
        \`última atualização\` as ultima_atualizacao
      FROM ${database}.t_status_aereo 
      ORDER BY id DESC 
      LIMIT 1
    `;

    const rows = await client.query(query);
    
    if (!rows || rows.length === 0) {
      console.log('No AWBs found in t_status_aereo');
      return new Response(
        JSON.stringify({ success: true, data: null, message: 'No AWBs processed yet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lastAwb = rows[0];
    console.log(`Last processed AWB: ${lastAwb.awb}`);

    return new Response(
      JSON.stringify({ success: true, data: lastAwb }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in get-last-processed-awb:', errorMessage);
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
