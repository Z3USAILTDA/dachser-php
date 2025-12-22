import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Registered airline codes for CCT
const REGISTERED_AIRLINE_CODES = [
  '001', '016', '020', '006', '047', '055', '045', '057', '074', '075',
  '118', '125', '139', '157', '172', '176', '235', '369', '399', '406',
  '549', '577', '615', '724', '729', '881', '996'
];

interface SyncRequest {
  action?: 'preview' | 'sync' | 'status';
  hoursBack?: number; // How many hours back to look for ARR status
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body: SyncRequest = await req.json().catch(() => ({}));
    const action = body.action || 'preview';
    const hoursBack = body.hoursBack || 48;

    console.log(`ARR-to-CCT Sync: Action=${action}, HoursBack=${hoursBack}`);

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Build the airline filter
    const airlineFilter = REGISTERED_AIRLINE_CODES.map(c => `'${c}'`).join(',');

    if (action === 'status') {
      // Get counts by status for registered airlines
      const statusCounts = await client.query(`
        SELECT 
          \`último_status\` as status,
          COUNT(*) as count
        FROM ${database}.t_status_aereo
        WHERE LEFT(TRIM(awb), 3) IN (${airlineFilter})
        AND \`última atualização\` >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        GROUP BY \`último_status\`
        ORDER BY count DESC
      `, [hoursBack]);

      await client.close();

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: statusCounts,
          registeredAirlines: REGISTERED_AIRLINE_CODES.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'preview' || action === 'sync') {
      // Find AWBs with ARR status from registered airlines
      // that should be transferred to CCT monitoring
      const arrAwbs = await client.query(`
        SELECT 
          s.awb,
          TRIM(s.awb) as master,
          TRIM(s.hawb) as house,
          TRIM(s.\`destinatário\`) as cliente,
          TRIM(s.origem) as aeroporto_origem,
          TRIM(s.destino) as aeroporto_destino,
          s.\`último_status\` as ultimo_status,
          s.\`última atualização\` as ultima_atualizacao,
          s.nome_analista,
          s.email_analista,
          s.email_cliente,
          LEFT(TRIM(s.awb), 3) as airline_code,
          m.id as master_dados_id,
          m.active as master_active
        FROM ${database}.t_status_aereo s
        LEFT JOIN ${database}.t_master_dados m ON TRIM(s.awb) = TRIM(m.mawb) AND m.active = 1
        WHERE s.\`último_status\` IN ('ARR', 'RCF', 'NFD', 'AWD')
        AND LEFT(TRIM(s.awb), 3) IN (${airlineFilter})
        AND s.\`último_status\` != 'COMPANY_NOT_REGISTERED'
        AND s.\`última atualização\` >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        ORDER BY s.\`última atualização\` DESC
        LIMIT 200
      `, [hoursBack]);

      console.log(`Found ${arrAwbs.length} AWBs with ARR/RCF/NFD/AWD status from registered airlines`);

      if (action === 'preview') {
        await client.close();

        return new Response(
          JSON.stringify({ 
            success: true, 
            action: 'preview',
            count: arrAwbs.length,
            data: arrAwbs,
            message: `Encontrados ${arrAwbs.length} AWBs com status ARR/RCF/NFD/AWD de CIAs cadastradas nas últimas ${hoursBack}h`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SYNC action: Insert missing records into t_master_dados for CCT monitoring
      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const awb of arrAwbs) {
        // Skip if already in t_master_dados
        if (awb.master_dados_id && awb.master_active === 1) {
          skipped++;
          continue;
        }

        try {
          // Insert into t_master_dados for CCT monitoring
          await client.query(`
            INSERT INTO ${database}.t_master_dados 
            (mawb, hawb, cliente, nome_analista, email_analista, emails_cliente, active, tipo_processo, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 'AIR IMPORT', NOW())
            ON DUPLICATE KEY UPDATE 
              active = 1,
              updated_at = NOW()
          `, [
            awb.master,
            awb.house || null,
            awb.cliente || 'N/A',
            awb.nome_analista || null,
            awb.email_analista || null,
            awb.email_cliente || null,
          ]);
          inserted++;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Error inserting AWB ${awb.awb}:`, err);
          errors.push(`${awb.awb}: ${errMsg}`);
        }
      }

      await client.close();

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'sync',
          total: arrAwbs.length,
          inserted,
          skipped,
          errors: errors.length > 0 ? errors : undefined,
          message: `Sincronizados ${inserted} AWBs para CCT. ${skipped} já existiam.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await client.close();
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('ARR-to-CCT Sync Error:', error);
    if (client) await client.close();
    
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
