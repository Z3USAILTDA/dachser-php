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

  let client;
  try {
    console.log('Checking table structure...');

    client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Get column names from t_dados_master
    const masterColumns = await client.query(`
      SHOW COLUMNS FROM t_dados_master
    `);

    // Get column names from t_status_aereo
    const statusColumns = await client.query(`
      SHOW COLUMNS FROM t_status_aereo
    `);

    // Get sample data from t_dados_master
    const masterSample = await client.query(`
      SELECT * FROM t_dados_master 
      WHERE tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
      LIMIT 1
    `);

    await client.close();

    return new Response(
      JSON.stringify({
        t_dados_master: {
          columns: masterColumns,
          sample: masterSample[0] || null
        },
        t_status_aereo: {
          columns: statusColumns
        }
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error checking structure:', error);
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
