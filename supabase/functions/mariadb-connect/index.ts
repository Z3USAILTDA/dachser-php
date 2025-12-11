import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { action, query, params } = await req.json();

    // Get MariaDB credentials from secrets
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('MariaDB credentials not configured');
    }

    console.log(`Connecting to MariaDB at ${host}:${port}/${database}`);

    // Create MariaDB client
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('Connected to MariaDB successfully');

    let result;

    switch (action) {
      case 'test':
        // Test connection
        const testResult = await client.query('SELECT 1 as test');
        result = { success: true, message: 'Connection successful', data: testResult };
        break;

      case 'query':
        // Execute a SELECT query
        if (!query) {
          throw new Error('Query is required for action "query"');
        }
        console.log(`Executing query: ${query}`);
        const queryResult = await client.query(query, params || []);
        result = { success: true, data: queryResult };
        break;

      case 'execute':
        // Execute INSERT/UPDATE/DELETE
        if (!query) {
          throw new Error('Query is required for action "execute"');
        }
        console.log(`Executing: ${query}`);
        const executeResult = await client.execute(query, params || []);
        result = { 
          success: true, 
          affectedRows: executeResult.affectedRows,
          lastInsertId: executeResult.lastInsertId
        };
        break;

      case 'tables':
        // List all tables
        const tablesResult = await client.query('SHOW TABLES');
        result = { success: true, tables: tablesResult };
        break;

      case 'describe':
        // Describe a table structure
        if (!params?.table) {
          throw new Error('Table name is required for action "describe"');
        }
        const describeResult = await client.query(`DESCRIBE ${params.table}`);
        result = { success: true, structure: describeResult };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await client.close();
    console.log('MariaDB connection closed');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('MariaDB error:', error);
    
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
