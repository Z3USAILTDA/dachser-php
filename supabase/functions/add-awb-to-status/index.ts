import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractStatusCode(lastEvent: string): string {
  if (!lastEvent) return 'N/A';
  
  const statusMap: Record<string, string> = {
    'delivered': 'DLV',
    'entregue': 'DLV',
    'in transit': 'TRS',
    'em trânsito': 'TRS',
    'departed': 'DEP',
    'arrived': 'ARR',
    'customs': 'CUS',
    'cleared': 'CLR',
    'booked': 'BKD',
    'received': 'RCV',
    'manifested': 'MAN',
    'on hold': 'HLD',
    'discrepancy': 'DIS',
    'offloaded': 'OFLD',
    'not found': 'NOT_FOUND',
    'company not registered': 'COMPANY_NOT_REGISTERED',
    'erro': 'ERRO',
    'em processamento': 'Em Processamento',
  };

  const lowerEvent = lastEvent.toLowerCase();
  
  for (const [key, code] of Object.entries(statusMap)) {
    if (lowerEvent.includes(key)) {
      return code;
    }
  }
  
  // Return first 3 characters uppercase if no match
  if (lastEvent.length >= 3) {
    return lastEvent.substring(0, 3).toUpperCase();
  }
  
  return lastEvent.toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json();
    const { 
      awb, 
      hawb, 
      destinatario, 
      last_event, 
      origem, 
      destino, 
      nome_analista, 
      email_analista, 
      email_cliente 
    } = body;

    if (!awb) {
      return new Response(
        JSON.stringify({ success: false, error: 'AWB is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Sanitize inputs
    const sanitizedAwb = awb?.toString().trim() || '';
    const sanitizedHawb = hawb?.toString().trim() || '';
    const sanitizedDestinatario = destinatario?.toString().trim() || '';
    const sanitizedOrigem = origem?.toString().trim() || 'N/A';
    const sanitizedDestino = destino?.toString().trim() || 'N/A';
    const sanitizedNomeAnalista = nome_analista?.toString().trim() || '';
    const sanitizedEmailAnalista = email_analista?.toString().trim() || '';
    const sanitizedEmailCliente = email_cliente?.toString().trim() || '';
    
    const statusCode = extractStatusCode(last_event || '');
    const isAlertStatus = statusCode === 'DIS' || statusCode === 'OFLD';

    console.log(`Processing AWB: ${sanitizedAwb}, Status: ${statusCode}, isAlert: ${isAlertStatus}`);

    // Build the INSERT...ON DUPLICATE KEY UPDATE query
    const query = `
      INSERT INTO ${database}.t_status_aereo 
        (awb, hawb, destinatário, último_status, origem, destino, nome_analista, email_analista, email_cliente, \`última atualização\`, data_atraso)
      VALUES 
        (TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), NOW(), ${isAlertStatus ? 'NOW()' : 'NULL'})
      ON DUPLICATE KEY UPDATE
        hawb = IF(TRIM(?) != '' AND TRIM(?) != 'N/A', TRIM(?), hawb),
        destinatário = IF(TRIM(?) != '', TRIM(?), destinatário),
        último_status = TRIM(?),
        origem = IF(TRIM(?) != '' AND TRIM(?) != 'N/A', TRIM(?), origem),
        destino = IF(TRIM(?) != '' AND TRIM(?) != 'N/A', TRIM(?), destino),
        nome_analista = IF(TRIM(?) != '', TRIM(?), nome_analista),
        email_analista = IF(TRIM(?) != '', TRIM(?), email_analista),
        email_cliente = IF(TRIM(?) != '', TRIM(?), email_cliente),
        \`última atualização\` = NOW(),
        data_atraso = CASE 
          WHEN TRIM(?) IN ('DIS', 'OFLD') AND data_atraso IS NULL THEN NOW()
          WHEN TRIM(?) = 'DLV' THEN NULL
          ELSE data_atraso
        END
    `;

    const params = [
      // INSERT values
      sanitizedAwb,
      sanitizedHawb,
      sanitizedDestinatario,
      statusCode,
      sanitizedOrigem,
      sanitizedDestino,
      sanitizedNomeAnalista,
      sanitizedEmailAnalista,
      sanitizedEmailCliente,
      // ON DUPLICATE KEY UPDATE values
      sanitizedHawb, sanitizedHawb, sanitizedHawb, // hawb IF condition
      sanitizedDestinatario, sanitizedDestinatario, // destinatário IF condition
      statusCode, // último_status
      sanitizedOrigem, sanitizedOrigem, sanitizedOrigem, // origem IF condition
      sanitizedDestino, sanitizedDestino, sanitizedDestino, // destino IF condition
      sanitizedNomeAnalista, sanitizedNomeAnalista, // nome_analista IF condition
      sanitizedEmailAnalista, sanitizedEmailAnalista, // email_analista IF condition
      sanitizedEmailCliente, sanitizedEmailCliente, // email_cliente IF condition
      statusCode, // data_atraso CASE when DIS/OFLD
      statusCode, // data_atraso CASE when DLV
    ];

    await client.execute(query, params);
    console.log(`Successfully processed AWB: ${sanitizedAwb}`);

    return new Response(
      JSON.stringify({ success: true, awb: sanitizedAwb, status: statusCode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in add-awb-to-status:', errorMessage);
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
