import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DachserUser {
  id: number;
  username: string;
  password_hash: string;
  email: string;
  is_admin: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();
    console.log('Validating Dachser user:', username);

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username e senha são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Conectar ao MariaDB usando a conexão USERS_DACHSER
    const client = await new Client().connect({
      hostname: Deno.env.get('USERS_DACHSER_HOST') || '',
      port: parseInt(Deno.env.get('USERS_DACHSER_PORT') || '3306'),
      username: Deno.env.get('USERS_DACHSER_USER') || '',
      password: Deno.env.get('USERS_DACHSER_PASSWORD') || '',
      db: Deno.env.get('USERS_DACHSER_DATABASE') || '',
    });

    console.log('Connected to USERS_DACHSER MariaDB');

    // Buscar usuário na tabela t_users_dachser
    const result = await client.query(
      'SELECT id, username, password_hash, email, is_admin FROM t_users_dachser WHERE username = ? LIMIT 1',
      [username]
    );

    await client.close();

    if (result.length === 0) {
      console.log('User not found in t_users_dachser');
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const user = result[0] as DachserUser;
    console.log('User found:', user.username);

    // Validar senha (assumindo que password_hash usa MD5 ou texto plano)
    // Se for bcrypt, precisaremos de uma biblioteca específica
    const passwordMatches = user.password_hash === password || 
                           user.password_hash === await hashPassword(password);

    if (!passwordMatches) {
      console.log('Password does not match');
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('Password validated successfully');

    // Criar/atualizar usuário no Supabase Auth
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verificar se usuário já existe no Supabase
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === user.email);

    let supabaseUserId: string;

    if (existingUser) {
      console.log('User already exists in Supabase Auth');
      supabaseUserId = existingUser.id;
      
      // Atualizar senha se necessário
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: password
      });
    } else {
      console.log('Creating new user in Supabase Auth');
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: password,
        email_confirm: true,
        user_metadata: {
          username: user.username,
          is_admin: user.is_admin === 1
        }
      });

      if (createError) {
        console.error('Error creating user in Supabase:', createError);
        throw createError;
      }

      supabaseUserId = newUser.user.id;
    }

    console.log('User validated and synced to Supabase');

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: supabaseUserId,
          email: user.email,
          username: user.username,
          is_admin: user.is_admin === 1
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error validating Dachser user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao validar usuário';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// Função simples de hash (MD5-like) - ajustar conforme o formato real usado
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
