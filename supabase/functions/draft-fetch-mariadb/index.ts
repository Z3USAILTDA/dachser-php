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
    const mariadbHost = Deno.env.get('MARIADB_HOST');
    const mariadbPort = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const mariadbUser = Deno.env.get('MARIADB_USER');
    const mariadbPassword = Deno.env.get('MARIADB_PASSWORD');
    const mariadbDatabase = Deno.env.get('MARIADB_DATABASE');

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

    // Execute query to get MBLs - filtered by ETD from 2026-01-01 onwards
    // This ensures both display AND processing only consider 2026+ data
    // To revert: change back to DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
    const query = `
      SELECT 
        tmd.mawb as mbl_id,
        tmd.tipo_processo,
        tmd.etd,
        tmd.shipper
      FROM 
        dados_dachser.t_master_dados tmd
      WHERE 
        tmd.tipo_processo = 'SEA EXPORT'
        AND (tmd.mawb LIKE 'HLC%' OR tmd.mawb LIKE 'MSC%' OR tmd.mawb LIKE 'MEDU%' OR tmd.mawb LIKE 'ONEY%')
        AND tmd.data_insert >= '2026-02-01'
      ORDER BY tmd.etd DESC, tmd.mawb
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
