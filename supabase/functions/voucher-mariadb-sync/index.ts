import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MariaDBRequest {
  action: 'test' | 'query' | 'insert' | 'update' | 'delete';
  table?: string;
  data?: Record<string, unknown>;
  where?: Record<string, unknown>;
  query?: string;
  params?: unknown[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { action, table, data, where, query, params } = await req.json() as MariaDBRequest;

    // Get credentials from environment
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('Missing MariaDB credentials in environment variables');
    }

    console.log(`[voucher-mariadb-sync] Connecting to MariaDB at ${host}:${port}/${database}`);

    // Connect to MariaDB
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('[voucher-mariadb-sync] Connected to MariaDB successfully');

    let result: unknown;

    switch (action) {
      case 'test':
        // Test connection
        const testResult = await client.query('SELECT 1 as test');
        result = { success: true, message: 'Connection successful', data: testResult };
        break;

      case 'query':
        // Execute raw query
        if (!query) {
          throw new Error('Query is required for query action');
        }
        result = await client.query(query, params);
        break;

      case 'insert':
        if (!table || !data) {
          throw new Error('Table and data are required for insert action');
        }
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        result = await client.execute(insertQuery, values);
        break;

      case 'update':
        if (!table || !data || !where) {
          throw new Error('Table, data, and where are required for update action');
        }
        const setClauses = Object.keys(data).map(col => `${col} = ?`).join(', ');
        const whereClauses = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
        const updateQuery = `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`;
        const updateParams = [...Object.values(data), ...Object.values(where)];
        result = await client.execute(updateQuery, updateParams);
        break;

      case 'delete':
        if (!table || !where) {
          throw new Error('Table and where are required for delete action');
        }
        const deleteWhere = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
        const deleteQuery = `DELETE FROM ${table} WHERE ${deleteWhere}`;
        result = await client.execute(deleteQuery, Object.values(where));
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await client.close();

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voucher-mariadb-sync] MariaDB Error:', error);
    
    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.error('[voucher-mariadb-sync] Error closing connection:', closeError);
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
