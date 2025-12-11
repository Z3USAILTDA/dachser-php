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
    const { search, status, limit = 100, offset = 0 } = body;

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

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Build dynamic query with filters
    let query = `
      SELECT 
        id,
        TRIM(awb) as awb,
        TRIM(hawb) as hawb,
        destinatário as destinatario,
        último_status as ultimo_status,
        origem,
        destino,
        nome_analista,
        email_analista,
        email_cliente,
        \`última atualização\` as ultima_atualizacao,
        data_atraso
      FROM ${database}.t_status_aereo
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    // Add search filter
    if (search && search.trim() !== '') {
      query += ` AND (
        awb LIKE ? OR 
        hawb LIKE ? OR 
        destinatário LIKE ? OR
        nome_analista LIKE ?
      )`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add status filter
    if (status && status.trim() !== '') {
      query += ` AND UPPER(TRIM(último_status)) = ?`;
      params.push(status.toUpperCase().trim());
    }

    query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    console.log(`Fetching AWBs with search="${search || ''}", status="${status || ''}", limit=${limit}, offset=${offset}`);

    const rows = await client.query(query, params);

    // Get total count with same filters
    let countQuery = `SELECT COUNT(*) as total FROM ${database}.t_status_aereo WHERE 1=1`;
    const countParams: (string | number)[] = [];

    if (search && search.trim() !== '') {
      countQuery += ` AND (
        awb LIKE ? OR 
        hawb LIKE ? OR 
        destinatário LIKE ? OR
        nome_analista LIKE ?
      )`;
      const searchPattern = `%${search.trim()}%`;
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (status && status.trim() !== '') {
      countQuery += ` AND UPPER(TRIM(último_status)) = ?`;
      countParams.push(status.toUpperCase().trim());
    }

    const countResult = await client.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} of ${total} AWBs`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: rows,
        total: total,
        limit: limit,
        offset: offset
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in fetch-awbs:', errorMessage);
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
