import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[FETCH-AWBS-DEP] Fetching AWBs with DEP status...');

    const client = await new Client().connect({
      hostname: (Deno.env.get('MARIADB_AIR_HOST') || Deno.env.get('MARIADB_OPS_HOST')) || '',
      port: parseInt((Deno.env.get('MARIADB_AIR_PORT') || Deno.env.get('MARIADB_OPS_PORT')) || '3306'),
      username: (Deno.env.get('MARIADB_AIR_USER') || Deno.env.get('MARIADB_OPS_USER')) || '',
      password: (Deno.env.get('MARIADB_AIR_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD')) || '',
      db: (Deno.env.get('MARIADB_AIR_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE')) || '',
    });

    console.log('[FETCH-AWBS-DEP] Connected to MariaDB');

    const result = await client.query(`
      SELECT awb, hawb, destinatário, origem, destino, 
             \`última atualização\`, nome_analista, email_cliente 
      FROM t_status_aereo 
      WHERE último_status = 'DEP'
      ORDER BY \`última atualização\` DESC
    `);

    await client.close();
    console.log(`[FETCH-AWBS-DEP] Found ${result.length} AWBs with DEP status`);

    return new Response(JSON.stringify({ success: true, data: result, count: result.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FETCH-AWBS-DEP] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
