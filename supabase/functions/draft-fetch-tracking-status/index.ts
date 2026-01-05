import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching tracking status from MariaDB...');

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');
    const database = Deno.env.get('MARIADB_DATABASE');

    console.log(`Connecting to MariaDB at ${host}:${port}...`);

    const client = await new Client().connect({
      hostname: host,
      port: port,
      username: username,
      password: password,
      db: database,
    });

    console.log('Connected to MariaDB successfully');

    // Fetch all tracking data from t_consulta_armador
    const query = `
      SELECT 
        id,
        mbl_id,
        booking,
        origem,
        destino,
        navio,
        voyage,
        etd,
        eta,
        tipo_processo,
        status_armador,
        transaction_id,
        hash_hapag_lloyd,
        api_endpoint,
        data_hora_servidor,
        data_hora_consulta,
        created_at
      FROM dados_dachser.t_consulta_armador
    `;

    console.log('Executing query...');
    const results = await client.query(query);
    console.log(`Found ${results.length} tracking records`);

    await client.close();
    console.log('Closed MariaDB connection');

    // Transform results into a map by mbl_id for easy lookup
    const trackingMap: Record<string, any> = {};
    for (const row of results) {
      trackingMap[row.mbl_id] = {
        id: row.id,
        mbl_id: row.mbl_id,
        booking: row.booking,
        origem: row.origem,
        destino: row.destino,
        navio: row.navio,
        voyage: row.voyage,
        etd: row.etd,
        eta: row.eta,
        tipo_processo: row.tipo_processo,
        status_armador: row.status_armador,
        transaction_id: row.transaction_id,
        hash_hapag_lloyd: row.hash_hapag_lloyd,
        api_endpoint: row.api_endpoint,
        data_hora_servidor: row.data_hora_servidor,
        data_hora_consulta: row.data_hora_consulta,
        created_at: row.created_at,
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: trackingMap,
        total: results.length,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching tracking status:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
