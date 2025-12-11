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
    const body = await req.json().catch(() => ({}));
    const { table_name } = body;

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

    const tables: Record<string, unknown> = {};

    // If specific table requested, only check that one
    const tablesToCheck = table_name 
      ? [table_name] 
      : ['t_status_aereo', 't_dados_master', 't_awb_processing_queue'];

    for (const tbl of tablesToCheck) {
      try {
        const columns = await client.query(`
          SELECT 
            COLUMN_NAME as column_name,
            DATA_TYPE as data_type,
            IS_NULLABLE as is_nullable,
            COLUMN_DEFAULT as column_default,
            CHARACTER_MAXIMUM_LENGTH as max_length,
            COLUMN_KEY as column_key
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [database, tbl]);

        tables[tbl] = columns || [];
        console.log(`Table ${tbl}: ${columns?.length || 0} columns`);
      } catch (err) {
        tables[tbl] = { error: `Table not found or error: ${err}` };
      }
    }

    // Also get row counts
    const counts: Record<string, number> = {};
    for (const tbl of tablesToCheck) {
      try {
        const countResult = await client.query(
          `SELECT COUNT(*) as cnt FROM ${database}.${tbl}`
        );
        counts[tbl] = countResult[0]?.cnt || 0;
      } catch {
        counts[tbl] = -1; // Error indicator
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        database: database,
        tables: tables,
        rowCounts: counts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in check-table-structure:', errorMessage);
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
