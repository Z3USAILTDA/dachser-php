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

    console.log(`Connecting to MariaDB for add-alert-status-column`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Check if alert_status column exists
    const columns = await client.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' AND COLUMN_NAME = 'alert_status'`,
      [database]
    );

    if (!columns || columns.length === 0) {
      // Add alert_status column if it doesn't exist
      await client.execute(
        `ALTER TABLE ${database}.t_status_aereo ADD COLUMN alert_status VARCHAR(50) DEFAULT NULL`
      );
      console.log('Added alert_status column to t_status_aereo');
      return new Response(
        JSON.stringify({ success: true, message: 'Column added' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('alert_status column already exists');
    return new Response(
      JSON.stringify({ success: true, message: 'Column already exists' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in add-alert-status-column:', errorMessage);
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
