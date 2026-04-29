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

  console.log('Fetching data from MariaDB...');

  try {
    // Get MariaDB credentials from environment
    const mariadbHost = (Deno.env.get('MARIADB_SEA_HOST') || Deno.env.get('MARIADB_HOST'));
    const mariadbPort = parseInt((Deno.env.get('MARIADB_SEA_PORT') || Deno.env.get('MARIADB_PORT')) || '3306');
    const mariadbUser = (Deno.env.get('MARIADB_SEA_USER') || Deno.env.get('MARIADB_USER'));
    const mariadbPassword = (Deno.env.get('MARIADB_SEA_PASSWORD') || Deno.env.get('MARIADB_PASSWORD'));
    const mariadbDatabase = (Deno.env.get('MARIADB_SEA_DATABASE') || Deno.env.get('MARIADB_DATABASE'));

    if (!mariadbHost || !mariadbUser || !mariadbPassword || !mariadbDatabase) {
      throw new Error('MariaDB credentials not configured');
    }

    console.log(`Connecting to MariaDB at ${mariadbHost}:${mariadbPort}...`);

    // Connect to MariaDB
    const mariaClient = await new Client().connect({
      hostname: mariadbHost,
      port: mariadbPort,
      username: mariadbUser,
      password: mariadbPassword,
      db: mariadbDatabase,
    });

    console.log('Connected to MariaDB successfully');

    // Execute query to get MBLs from t_dados_maritimo
    const query = `
      SELECT 
        dm.bl_number as mbl_id,
        'SEA EXPORT' as tipo_processo,
        dm.etd,
        dm.shipper_name as shipper
      FROM 
        dados_dachser.t_dados_maritimo dm
      WHERE 
        dm.bl_number IS NOT NULL
        AND TRIM(dm.bl_number) != ''
        AND (dm.bl_number LIKE 'HLC%' OR dm.bl_number LIKE 'MSC%' OR dm.bl_number LIKE 'MEDU%' OR dm.bl_number LIKE 'ONEY%')
        AND dm.created_at >= '2026-02-01'
      ORDER BY dm.etd DESC, dm.bl_number
    `;

    console.log('Executing query...');
    const results = await mariaClient.query(query);
    console.log(`Found ${results.length} records`);

    // Close MariaDB connection
    await mariaClient.close();
    console.log('Closed MariaDB connection');

    // Transform results to ensure proper JSON serialization
    const data = results.map((row: any) => ({
      mbl_id: row.mbl_id?.toString().trim() || '',
      tipo_processo: row.tipo_processo?.toString().trim() || '',
      etd: row.etd || null,
      shipper: row.shipper?.toString().trim() || null
    }));

    return new Response(JSON.stringify({
      success: true,
      data: data,
      total: data.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching MariaDB data:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      data: [],
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
