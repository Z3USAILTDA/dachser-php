import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Status codes that indicate a shipment is complete and shouldn't be retracked
const FINAL_STATUSES = ['DLV', 'POD', 'DELIVERED', 'ENTREGUE'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json();
    const { limit = 100, offset = 0, exclude_final = true } = body;

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

    // Build query with optional exclusion of final statuses
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
    `;

    const params: (string | number)[] = [];

    if (exclude_final) {
      const placeholders = FINAL_STATUSES.map(() => '?').join(', ');
      query += ` WHERE UPPER(TRIM(último_status)) NOT IN (${placeholders})`;
      params.push(...FINAL_STATUSES);
    }

    query += ` ORDER BY \`última atualização\` ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    console.log(`Fetching AWBs for retrack with limit=${limit}, offset=${offset}, exclude_final=${exclude_final}`);

    const rows = await client.query(query, params);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM ${database}.t_status_aereo`;
    const countParams: string[] = [];
    
    if (exclude_final) {
      const placeholders = FINAL_STATUSES.map(() => '?').join(', ');
      countQuery += ` WHERE UPPER(TRIM(último_status)) NOT IN (${placeholders})`;
      countParams.push(...FINAL_STATUSES);
    }

    const countResult = await client.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} of ${total} AWBs for retracking`);

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
    console.error('Error in fetch-awbs-for-retrack:', errorMessage);
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
