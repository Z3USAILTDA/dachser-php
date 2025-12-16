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
    const body = await req.json();
    const { search } = body;

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

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} for fetch-status-aereo`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Check if arr_check_count and arr_datetime columns exist
    let hasArrCheckColumn = false;
    let hasArrDatetimeColumn = false;
    try {
      const colCheck = await client.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' AND COLUMN_NAME IN ('arr_check_count', 'arr_datetime')`,
        [database]
      );
      if (Array.isArray(colCheck)) {
        hasArrCheckColumn = colCheck.some((r: any) => r.COLUMN_NAME === 'arr_check_count');
        hasArrDatetimeColumn = colCheck.some((r: any) => r.COLUMN_NAME === 'arr_datetime');
      }
    } catch (e) {
      console.log('Column check failed, assuming columns do not exist');
    }

    let selectFields = '*';
    if (hasArrCheckColumn) selectFields += ', arr_check_count';
    else selectFields += ', 0 as arr_check_count';
    if (hasArrDatetimeColumn) selectFields += ', arr_datetime';
    else selectFields += ', NULL as arr_datetime';

    let query = `SELECT ${selectFields} FROM ${database}.t_status_aereo ORDER BY id DESC`;
    let params: string[] = [];

    if (search && search.trim() !== '') {
      query = `SELECT ${selectFields} FROM ${database}.t_status_aereo 
               WHERE awb LIKE ? OR hawb LIKE ? OR destinatário LIKE ? 
               ORDER BY id DESC`;
      const searchPattern = `%${search.trim()}%`;
      params = [searchPattern, searchPattern, searchPattern];
    }

    console.log(`Executing query: ${query} (hasArrCheckColumn: ${hasArrCheckColumn})`);
    const rows = await client.query(query, params);
    
    console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} records from t_status_aereo`);

    return new Response(
      JSON.stringify({ success: true, data: rows }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in fetch-status-aereo:', errorMessage);
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
