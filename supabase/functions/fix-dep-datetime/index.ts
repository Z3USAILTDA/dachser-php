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

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'diagnose';

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    if (action === 'diagnose') {
      // Count AWBs with DEP status and NULL dep_datetime
      const depNullResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' AND dep_datetime IS NULL`
      );
      const depNullCount = depNullResult[0]?.count || 0;

      // Count AWBs with DEP status and dep_datetime filled
      const depFilledResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' AND dep_datetime IS NOT NULL`
      );
      const depFilledCount = depFilledResult[0]?.count || 0;

      // Sample of DEP AWBs without dep_datetime
      const sampleResult = await client.query(
        `SELECT awb, hawb, último_status, dep_datetime, \`última atualização\`, origem, destino
         FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' AND dep_datetime IS NULL
         ORDER BY \`última atualização\` DESC
         LIMIT 10`
      );

      // Check the CCT date filter threshold
      const afterThresholdResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' 
         AND \`última atualização\` >= '2026-01-22 15:00:00'`
      );
      const afterThresholdCount = afterThresholdResult[0]?.count || 0;

      await client.close();

      return new Response(
        JSON.stringify({ 
          success: true, 
          diagnosis: {
            dep_with_null_datetime: depNullCount,
            dep_with_filled_datetime: depFilledCount,
            dep_after_cct_threshold: afterThresholdCount,
            cct_threshold: '2026-01-22 15:00:00',
            sample_awbs: sampleResult
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    if (action === 'fix') {
      // Count before fix
      const beforeResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' AND dep_datetime IS NULL`
      );
      const beforeCount = beforeResult[0]?.count || 0;

      // Update dep_datetime using última atualização for DEP AWBs
      const updateResult = await client.execute(
        `UPDATE t_status_aereo 
         SET dep_datetime = \`última atualização\`
         WHERE último_status LIKE 'DEP%' 
         AND dep_datetime IS NULL
         AND \`última atualização\` IS NOT NULL`
      );

      // Count after fix
      const afterResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' AND dep_datetime IS NULL`
      );
      const afterCount = afterResult[0]?.count || 0;

      // Count how many now pass the CCT threshold
      const passThresholdResult = await client.query(
        `SELECT COUNT(*) as count FROM t_status_aereo 
         WHERE último_status LIKE 'DEP%' 
         AND dep_datetime >= '2026-01-22 15:00:00'`
      );
      const passThresholdCount = passThresholdResult[0]?.count || 0;

      await client.close();

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Correção concluída`,
          before_null_count: beforeCount,
          updated: updateResult.affectedRows,
          after_null_count: afterCount,
          now_pass_cct_threshold: passThresholdCount
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    await client.close();
    return new Response(
      JSON.stringify({ error: 'Action inválida. Use: diagnose, fix' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
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
