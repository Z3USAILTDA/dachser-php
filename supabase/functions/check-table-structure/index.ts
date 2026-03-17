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
    client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: 'dados_dachser',
    });

    const tables = ['t_tracking_sea', 't_sea_master', 't_master_dados', 't_olimpo_tracking'];
    const result: Record<string, any[]> = {};

    for (const table of tables) {
      try {
        const cols = await client.query(`
          SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = 'dados_dachser' AND TABLE_NAME = '${table}'
          ORDER BY ORDINAL_POSITION
        `);
        result[table] = cols;
      } catch (e: any) {
        // Try ai_agente schema
        try {
          const cols = await client.query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'ai_agente' AND TABLE_NAME = '${table}'
            ORDER BY ORDINAL_POSITION
          `);
          result[table] = cols;
        } catch {
          result[table] = [{ error: e.message }];
        }
      }
    }

    await client.close();

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (client) try { await client.close(); } catch {}
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
