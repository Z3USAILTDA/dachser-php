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

    console.log(`Connecting to MariaDB for add-origin-destination-columns`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    const columnsToAdd = [
      { name: 'origem', type: "VARCHAR(10) DEFAULT 'N/A'" },
      { name: 'destino', type: "VARCHAR(10) DEFAULT 'N/A'" },
    ];

    const results: Record<string, string> = {};

    for (const col of columnsToAdd) {
      // Check if column exists
      const columns = await client.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' AND COLUMN_NAME = ?`,
        [database, col.name]
      );

      if (!columns || columns.length === 0) {
        // Add column if it doesn't exist
        await client.execute(
          `ALTER TABLE ${database}.t_status_aereo ADD COLUMN ${col.name} ${col.type}`
        );
        console.log(`Added ${col.name} column to t_status_aereo`);
        results[col.name] = 'added';
      } else {
        console.log(`${col.name} column already exists`);
        results[col.name] = 'already exists';
      }
    }

    return new Response(
      JSON.stringify({ success: true, columns: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in add-origin-destination-columns:', errorMessage);
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
