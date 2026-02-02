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
    const { awb } = body;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Query 1: Check if AWB exists in t_status_aereo
    const statusAereoQuery = `
      SELECT id, awb, hawb, \`último_status\`, arr_datetime, arr_check_count, 
             \`última atualização\`, origem, destino
      FROM ${database}.t_status_aereo 
      WHERE awb LIKE ?
      LIMIT 5
    `;
    const statusAereoRows = await client.query(statusAereoQuery, [`%${awb}%`]);

    // Query 2: Check if AWB exists in t_master_dados
    const masterDadosQuery = `
      SELECT id, mawb, tipo_processo, data_insert
      FROM ${database}.t_master_dados 
      WHERE mawb LIKE ?
      ORDER BY data_insert DESC
      LIMIT 5
    `;
    const masterDadosRows = await client.query(masterDadosQuery, [`%${awb}%`]);

    // Query 3: Check arr_datetime column existence
    const colCheck = await client.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' AND COLUMN_NAME IN ('arr_check_count', 'arr_datetime')`,
      [database]
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        t_status_aereo: statusAereoRows,
        t_master_dados: masterDadosRows,
        columns_exist: colCheck,
        searched_awb: awb
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in debug-awb:', errorMessage);
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
