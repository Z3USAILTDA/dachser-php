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

  try {
    const { limit = 10, offset = 0 } = await req.json();
    
    console.log(`Fetching AWBs for re-tracking from t_status_aereo (limit: ${limit}, offset: ${offset})`);

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Fetch AWBs from t_status_aereo excluding final statuses (ERRO is included for reprocessing)
    // Apply TRIM to AWB data to prevent whitespace issues
    const result = await client.query(
      `SELECT TRIM(awb) as awb, TRIM(destinatário) as destinatário, TRIM(último_status) as último_status, \`última atualização\`, TRIM(hawb) as hawb, TRIM(nome_analista) as nome_analista, TRIM(email_analista) as email_analista, TRIM(origem) as origem, TRIM(destino) as destino, TRIM(email_cliente) as email_cliente
       FROM t_status_aereo 
       WHERE TRIM(último_status) NOT IN ('DLV', 'COMPANY_NOT_REGISTERED', 'NOT_FOUND', 'INFO', 'Em Processamento')
       ORDER BY TRIM(awb) ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    await client.close();
    console.log(`Fetched ${result.length} AWBs for re-tracking`);
    
    // Explicitly map the results to ensure consistent property names and apply trim
    const mappedResults = result.map((row: any) => {
      const mapped = {
        awb: (row.awb || '').toString().trim(),
        destinatário: (row.destinatário || row['destinatário'] || 'N/A').toString().trim(),
        último_status: (row.último_status || row['último_status'] || 'N/A').toString().trim(),
        'última atualização': row['última atualização'] || row.última_atualização || new Date().toISOString(),
        hawb: (row.hawb || row['hawb'] || row.HAWB || row['HAWB'] || 'N/A').toString().trim(),
        nome_analista: (row.nome_analista || row['nome_analista'] || 'N/A').toString().trim(),
        email_analista: row.email_analista ? row.email_analista.toString().trim() : null,
        origem: (row.origem || row['origem'] || 'N/A').toString().trim(),
        destino: (row.destino || row['destino'] || 'N/A').toString().trim(),
        email_cliente: row.email_cliente ? row.email_cliente.toString().trim() : null
      };
      console.log(`Mapped AWB ${mapped.awb}: hawb="${mapped.hawb}", email_analista="${mapped.email_analista}", email_cliente="${mapped.email_cliente}"`);
      return mapped;
    });
    
    if (mappedResults[0]) {
      console.log('First mapped AWB full object:', JSON.stringify(mappedResults[0]));
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        data: mappedResults,
        count: mappedResults.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error fetching AWBs for re-tracking:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
