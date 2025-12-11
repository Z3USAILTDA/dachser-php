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
    console.log('Updating email_analista in t_status_aereo based on t_dados_master...');

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // First, check how many records will be affected
    const previewResult = await client.query(`
      SELECT COUNT(*) as count
      FROM t_status_aereo s
      INNER JOIN t_dados_master m ON s.awb = m.mawb
      WHERE (s.email_analista IS NULL OR s.email_analista = '')
        AND m.email_analista IS NOT NULL
        AND m.email_analista != ''
    `);
    
    const recordsToUpdate = previewResult[0]?.count || 0;
    console.log(`Records to be updated: ${recordsToUpdate}`);

    // Execute the UPDATE
    const updateResult = await client.execute(`
      UPDATE t_status_aereo s
      INNER JOIN t_dados_master m ON s.awb = m.mawb
      SET s.email_analista = m.email_analista
      WHERE (s.email_analista IS NULL OR s.email_analista = '')
        AND m.email_analista IS NOT NULL
        AND m.email_analista != ''
    `);

    console.log(`UPDATE executed. Affected rows: ${updateResult.affectedRows}`);

    await client.close();
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Updated ${updateResult.affectedRows} records with email_analista`,
        recordsUpdated: updateResult.affectedRows,
        recordsFound: recordsToUpdate
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error updating email_analista:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
