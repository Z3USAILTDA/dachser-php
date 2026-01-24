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
    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Count AWBs that will be updated
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM t_status_aereo 
       WHERE último_status = 'ARR' AND arr_datetime IS NOT NULL`
    );
    const countBefore = countResult[0]?.count || 0;
    console.log(`AWBs with ARR and arr_datetime to update: ${countBefore}`);

    // Update AWBs with status ARR that have arr_datetime (meaning final destination arrival)
    const updateResult = await client.execute(
      `UPDATE t_status_aereo 
       SET último_status = 'ARR - Destino' 
       WHERE último_status = 'ARR' AND arr_datetime IS NOT NULL`
    );

    // Count remaining AWBs with just ARR (connections or no arr_datetime)
    const remainingResult = await client.query(
      `SELECT COUNT(*) as count FROM t_status_aereo 
       WHERE último_status = 'ARR' AND arr_datetime IS NULL`
    );
    const remainingArr = remainingResult[0]?.count || 0;

    await client.close();
    console.log(`Updated ${updateResult.affectedRows} AWBs to ARR - Destino`);
    console.log(`Remaining AWBs with ARR (no arr_datetime): ${remainingArr}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Correção concluída`,
        updated: updateResult.affectedRows,
        remaining_arr: remainingArr
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error fixing ARR status:', error);
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
