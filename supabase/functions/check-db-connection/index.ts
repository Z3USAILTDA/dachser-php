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

    // Check if credentials are configured
    const configStatus = {
      host: !!host,
      port: !!port,
      database: !!database,
      user: !!dbUser,
      password: !!dbPassword,
    };

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ 
          success: false, 
          connected: false,
          error: 'Database credentials not fully configured',
          config: configStatus
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Attempting to connect to MariaDB at ${host}:${port}/${database}`);
    
    const startTime = Date.now();
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Test the connection with a simple query
    const result = await client.query('SELECT 1 as test');
    
    const connectionTime = Date.now() - startTime;
    
    console.log(`Successfully connected to MariaDB in ${connectionTime}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        connected: true,
        connectionTimeMs: connectionTime,
        database: database,
        host: host,
        port: port
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error connecting to database:', errorMessage);
    return new Response(
      JSON.stringify({ 
        success: false, 
        connected: false,
        error: errorMessage
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
