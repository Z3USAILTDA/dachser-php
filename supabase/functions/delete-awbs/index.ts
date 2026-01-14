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
    const { awbs } = body;

    if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lista de AWBs é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log(`Connecting to MariaDB to delete AWBs: ${awbs.join(', ')}`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Build placeholders for the IN clause
    const placeholders = awbs.map(() => '?').join(', ');
    const query = `DELETE FROM ${database}.t_status_aereo WHERE awb IN (${placeholders})`;
    
    console.log(`Executing query: ${query}`);
    const result = await client.execute(query, awbs);
    
    console.log(`Deleted ${result.affectedRows || 0} records`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${result.affectedRows || 0} AWB(s) removido(s) com sucesso`,
        deletedCount: result.affectedRows || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in delete-awbs:', errorMessage);
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
