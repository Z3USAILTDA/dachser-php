import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 10, offset = 0, lastProcessedAwb = null } = await req.json().catch(() => ({ limit: 10, offset: 0, lastProcessedAwb: null }));
    
    console.log(`Fetching AIR IMPORT data from external database (limit: ${limit}, offset: ${offset}, lastProcessedAwb: ${lastProcessedAwb})`);

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Build query to get AWBs from t_master_dados that don't exist in t_status_aereo
    // Using LEFT JOIN to find unprocessed AWBs
    // Apply TRIM to AWB data to prevent whitespace issues
    let query = `SELECT MAX(m.cliente) as cliente, TRIM(m.mawb) as mawb, MAX(TRIM(m.hawb)) as hawb, MAX(TRIM(m.nome_analista)) as nome_analista, MAX(TRIM(m.email_analista)) as email_analista, MAX(TRIM(m.tipo_servico)) as tipo_servico 
                 FROM t_master_dados m
                 LEFT JOIN t_status_aereo s ON TRIM(m.mawb) = TRIM(s.awb)
                 WHERE m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
                 AND m.mawb IS NOT NULL 
                 AND TRIM(m.mawb) != ''
                 AND LENGTH(TRIM(m.mawb)) >= 3
                 AND s.awb IS NULL`;
    const params: any[] = [];

    query += ` GROUP BY TRIM(m.mawb) ORDER BY TRIM(m.mawb) ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await client.query(query, params);

    // Get the last AWB from t_master_dados for comparison (ordered ASC)
    const lastMasterAwbResult = await client.query(
      `SELECT TRIM(mawb) as mawb FROM t_master_dados WHERE tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') AND mawb IS NOT NULL AND TRIM(mawb) != '' ORDER BY TRIM(mawb) DESC LIMIT 1`
    );
    
    const lastMasterAwb = lastMasterAwbResult.length > 0 ? (lastMasterAwbResult[0].mawb || '').trim() : null;

    await client.close();
    console.log(`Fetched ${result.length} AIR IMPORT records`);

    return new Response(
      JSON.stringify({ 
        data: result,
        lastMasterAwb
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error fetching AIR IMPORT data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch AIR IMPORT data';
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
