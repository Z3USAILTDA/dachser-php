import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryRequest {
  action: 'login' | 'get_user' | 'get_metrics' | 'register_user';
  username?: string;
  password?: string;
  email?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  perPage?: number;
  page?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
const body = await req.json() as QueryRequest;
    const { action, username, password, email, userId, dateFrom: reqDateFrom, dateTo: reqDateTo, module: reqModule, perPage: reqPerPage, page: reqPage } = body;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
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
      username: dbUser,
      password: dbPassword,
    });

    let result;

    switch (action) {
      case 'login': {
        if (!username || !password) {
          return new Response(
            JSON.stringify({ error: 'Usuário e senha são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Attempting login for: ${username}`);
        
        // First get the user with the password hash
        const users = await client.query(
          'SELECT id, username, email, is_admin, password_hash FROM ai_agente.t_users_dachser WHERE username = ?',
          [username]
        );

        if (!users || users.length === 0) {
          console.log('Login failed: User not found');
          return new Response(
            JSON.stringify({ error: 'Credenciais inválidas' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = users[0];
        const storedHash = user.password_hash;
        
        // Verify bcrypt password (plain text input vs bcrypt hash in DB)
        const isValidPassword = bcrypt.compareSync(password, storedHash);
        
        if (!isValidPassword) {
          console.log('Login failed: Invalid password');
          return new Response(
            JSON.stringify({ error: 'Credenciais inválidas' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Return user without password_hash
        result = { 
          success: true, 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            is_admin: user.is_admin
          }
        };
        console.log(`Login successful for user: ${user.username}`);
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

      case 'register_user': {
        if (!username || !password || !email) {
          return new Response(
            JSON.stringify({ error: 'Usuário, senha e e-mail são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Attempting to register user: ${username}`);

        // Check if username already exists
        const existingUser = await client.query(
          'SELECT id FROM ai_agente.t_users_dachser WHERE username = ?',
          [username]
        );

        if (existingUser && existingUser.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Usuário já existe' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if email already exists
        const existingEmail = await client.query(
          'SELECT id FROM ai_agente.t_users_dachser WHERE email = ?',
          [email]
        );

        if (existingEmail && existingEmail.length > 0) {
          return new Response(
            JSON.stringify({ error: 'E-mail já cadastrado' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hash the password with bcrypt
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert new user
        await client.execute(
          'INSERT INTO ai_agente.t_users_dachser (username, email, password_hash, is_admin) VALUES (?, ?, ?, 0)',
          [username, email, passwordHash]
        );

        // Get the created user
        const newUser = await client.query(
          'SELECT id, username, email, is_admin FROM ai_agente.t_users_dachser WHERE username = ?',
          [username]
        );

        console.log(`User registered successfully: ${username}`);

        result = { 
          success: true, 
          user: newUser[0],
          message: 'Usuário cadastrado com sucesso'
        };
        break;
      }

      case 'get_metrics': {
        const dateFrom = reqDateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dateTo = reqDateTo || new Date().toISOString().split('T')[0];
        const usernameFilter = username || '';
        const moduleFilter = reqModule || '';
        const perPage = Math.min(Math.max(reqPerPage || 50, 10), 200);
        const page = Math.max(reqPage || 1, 1);
        const offset = (page - 1) * perPage;

        // Build WHERE clause
        let whereConditions = ["event_time BETWEEN ? AND ?"];
        let params: (string | number)[] = [`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`];

        if (usernameFilter) {
          whereConditions.push("username LIKE ?");
          params.push(`%${usernameFilter}%`);
        }

        const validModules = ['air', 'chb', 'maritime'];
        if (moduleFilter && validModules.includes(moduleFilter.toLowerCase())) {
          whereConditions.push("LOWER(endpoint) LIKE ?");
          params.push(`%${moduleFilter.toLowerCase()}%`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM ai_agente.t_dachser_usage_logs ${whereClause}`,
          params
        );
        const total = Number(countResult[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        // Get stats
        const statsResult = await client.query(
          `SELECT
            COUNT(DISTINCT username) AS users,
            COUNT(DISTINCT endpoint) AS endpoints,
            SUM(CASE WHEN method='GET' THEN 1 ELSE 0 END) AS get_calls,
            SUM(CASE WHEN method='POST' THEN 1 ELSE 0 END) AS post_calls
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}`,
          params
        );
        const statsRow = statsResult[0] || {};

        // Calculate days diff for average
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const avgPerDay = daysDiff > 0 ? total / daysDiff : total;

        // Get daily data for chart
        const dailyResult = await client.query(
          `SELECT DATE(event_time) AS d, COUNT(*) AS total
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          GROUP BY DATE(event_time)
          ORDER BY d ASC`,
          params
        );
        const dailyData = dailyResult.map((row: { d: string; total: number }) => ({
          date: new Date(row.d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          total: Number(row.total)
        }));

        // Get top endpoints
        const endpointResult = await client.query(
          `SELECT endpoint, COUNT(*) AS total
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          GROUP BY endpoint
          ORDER BY total DESC
          LIMIT 5`,
          params
        );
        const endpointData = endpointResult.map((row: { endpoint: string; total: number }) => ({
          endpoint: row.endpoint,
          total: Number(row.total)
        }));

        // Get paginated logs
        const logsResult = await client.query(
          `SELECT id, username, endpoint, method, event_time
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          ORDER BY event_time DESC, id DESC
          LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        result = {
          logs: logsResult,
          stats: {
            total,
            distinctUsers: Number(statsRow.users || 0),
            distinctEndpoints: Number(statsRow.endpoints || 0),
            getCalls: Number(statsRow.get_calls || 0),
            postCalls: Number(statsRow.post_calls || 0),
            avgPerDay: Math.round(avgPerDay * 10) / 10
          },
          dailyData,
          endpointData,
          totalPages,
          currentPage: page
        };
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
