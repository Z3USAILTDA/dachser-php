import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryRequest {
  action: 'login' | 'get_user';
  email?: string;
  password?: string;
  userId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { action, email, password, userId } = await req.json() as QueryRequest;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Connecting to MariaDB at ${host}:${port}/${database}`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: dbPassword,
    });

    let result;

    switch (action) {
      case 'login': {
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: 'Email e senha são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Attempting login for: ${email}`);
        
        const users = await client.query(
          'SELECT id, username, email, is_admin FROM ai_agente.t_users_dachser WHERE email = ? AND password = MD5(?)',
          [email, password]
        );

        if (!users || users.length === 0) {
          console.log('Login failed: Invalid credentials');
          return new Response(
            JSON.stringify({ error: 'Credenciais inválidas' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { 
          success: true, 
          user: users[0]
        };
        console.log(`Login successful for user: ${users[0].username}`);
        break;
      }

      case 'get_user': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const users = await client.query(
          'SELECT id, username, email, is_admin FROM ai_agente.t_users_dachser WHERE id = ?',
          [userId]
        );

        if (!users || users.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Usuário não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, user: users[0] };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ação não suportada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('MariaDB Proxy Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
