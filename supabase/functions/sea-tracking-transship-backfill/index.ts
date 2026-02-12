import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * sea-tracking-transship-backfill: Corrige event_code para TRANSSHIPMENT
 * 
 * Faz UPDATE em registros históricos que têm event_code = 'STATUS_UPDATE'
 * mas cujo event_description ou container_status contêm palavras de transbordo.
 * 
 * GET /backfill?dry_run=1 (para visualizar sem fazer UPDATE)
 * GET /backfill (para executar o UPDATE)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const mariadbHost = Deno.env.get('MARIADB_HOST');
  const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
  const mariadbUser = Deno.env.get('MARIADB_USER');
  const mariadbPass = Deno.env.get('MARIADB_PASSWORD');

  if (!mariadbHost || !mariadbUser || !mariadbPass) {
    return new Response(JSON.stringify({ 
      error: 'MariaDB não configurado',
      missing: !mariadbHost ? 'MARIADB_HOST' : 'MARIADB_USER'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
  const client = await new Client().connect({
    hostname: mariadbHost,
    port: parseInt(mariadbPort, 10),
    username: mariadbUser,
    password: mariadbPass,
    db: 'dados_dachser',
  });

  try {
    // PASSO 1: Encontrar registros que precisam de correção
    const needsFixQuery = `
      SELECT 
        id,
        mbl_id,
        container,
        event_code,
        event_description,
        container_status,
        location,
        created_at
      FROM dados_dachser.t_tracking_sea_history
      WHERE event_code = 'STATUS_UPDATE'
        AND (
          UPPER(event_description) LIKE '%TRANSSHIP%'
          OR UPPER(event_description) LIKE '%T/S%'
          OR UPPER(container_status) LIKE '%TRANSSHIP%'
          OR UPPER(container_status) LIKE '%T/S%'
        )
      ORDER BY created_at DESC
      LIMIT 1000
    `;

    const needsFix = await client.query(needsFixQuery);
    console.log(`[sea-tracking-transship-backfill] Found ${needsFix.length} records to fix`);

    if (needsFix.length === 0) {
      await client.close();
      return new Response(JSON.stringify({
        success: true,
        mode: dryRun ? 'dry_run' : 'executed',
        records_found: 0,
        records_updated: 0,
        message: 'No records need fixing'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PASSO 2: Se dry_run, retornar apenas os registros encontrados
    if (dryRun) {
      await client.close();
      return new Response(JSON.stringify({
        success: true,
        mode: 'dry_run',
        records_found: needsFix.length,
        records_updated: 0,
        sample_records: needsFix.slice(0, 5),
        message: `Would update ${needsFix.length} records (use dry_run=0 to execute)`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PASSO 3: Fazer UPDATE dos event_code para TRANSSHIPMENT
    const updateQuery = `
      UPDATE dados_dachser.t_tracking_sea_history
      SET event_code = 'TRANSSHIPMENT'
      WHERE event_code = 'STATUS_UPDATE'
        AND (
          UPPER(event_description) LIKE '%TRANSSHIP%'
          OR UPPER(event_description) LIKE '%T/S%'
          OR UPPER(container_status) LIKE '%TRANSSHIP%'
          OR UPPER(container_status) LIKE '%T/S%'
        )
    `;

    const result = await client.execute(updateQuery);
    console.log(`[sea-tracking-transship-backfill] Updated ${needsFix.length} records`);

    // PASSO 4: Verificar resultado
    const verifyQuery = `
      SELECT COUNT(*) as count
      FROM dados_dachser.t_tracking_sea_history
      WHERE event_code = 'TRANSSHIPMENT'
        AND (
          UPPER(event_description) LIKE '%TRANSSHIP%'
          OR UPPER(event_description) LIKE '%T/S%'
          OR UPPER(container_status) LIKE '%TRANSSHIP%'
          OR UPPER(container_status) LIKE '%T/S%'
        )
    `;

    const verify = await client.query(verifyQuery);
    const totalTransshipmentRecords = verify[0]?.count || 0;

    await client.close();

    return new Response(JSON.stringify({
      success: true,
      mode: 'executed',
      records_found: needsFix.length,
      records_updated: needsFix.length,
      total_transshipment_records: totalTransshipmentRecords,
      message: `Successfully updated ${needsFix.length} records. Total TRANSSHIPMENT records now: ${totalTransshipmentRecords}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[sea-tracking-transship-backfill] Error:', e);
    await client.close();
    return new Response(JSON.stringify({ 
      success: false,
      error: e.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
