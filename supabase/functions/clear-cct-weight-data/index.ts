import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge function to clear peso/volume/cnpj data from t_cct_shipments
 * for records that don't have successful LeadComex enrichment.
 * 
 * This ensures that only LeadComex data is shown in CCT dashboard.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: any = null;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'preview';
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    console.log(`[CLEAR-CCT-WEIGHT] Action: ${action}, DryRun: ${dryRun}`);

    // Connect to MariaDB
    client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    const database = Deno.env.get('MARIADB_DATABASE') || 'dados_dachser';

    // ========================================
    // PREVIEW: Show which records would be cleared
    // ========================================
    if (action === 'preview') {
      // Find records in t_cct_shipments that have peso/volume/cnpj
      // but DON'T have a successful LeadComex enrichment log
      const recordsWithWeight = await client.query(`
        SELECT 
          cct.house,
          cct.master,
          cct.peso_declarado,
          cct.volume_declarado,
          cct.cnpj_consignatario,
          cct.updated_at,
          (
            SELECT COUNT(*) 
            FROM ${database}.t_leadcomex_enrichment_logs l 
            WHERE l.hawb COLLATE utf8mb4_unicode_ci = cct.house COLLATE utf8mb4_unicode_ci
              AND l.success = 1
          ) as leadcomex_success_count
        FROM ${database}.t_cct_shipments cct
        WHERE cct.peso_declarado IS NOT NULL 
           OR cct.volume_declarado IS NOT NULL
           OR cct.cnpj_consignatario IS NOT NULL
        ORDER BY cct.updated_at DESC
        LIMIT 100
      `);

      const toClean = recordsWithWeight.filter((r: any) => r.leadcomex_success_count === 0);
      const alreadyEnriched = recordsWithWeight.filter((r: any) => r.leadcomex_success_count > 0);

      await client.close();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Encontrados ${toClean.length} registros para limpar (sem LeadComex), ${alreadyEnriched.length} com LeadComex`,
          to_clean: toClean.map((r: any) => ({
            house: r.house,
            master: r.master,
            peso_declarado: r.peso_declarado,
            volume_declarado: r.volume_declarado,
            cnpj_consignatario: r.cnpj_consignatario,
          })),
          already_enriched: alreadyEnriched.map((r: any) => ({
            house: r.house,
            master: r.master,
            peso_declarado: r.peso_declarado,
            leadcomex_count: r.leadcomex_success_count,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // CLEAN: Clear weight/volume/cnpj for records without LeadComex success
    // ========================================
    if (action === 'clean') {
      // Get records to clean
      const recordsToClean = await client.query(`
        SELECT cct.house
        FROM ${database}.t_cct_shipments cct
        WHERE (cct.peso_declarado IS NOT NULL 
           OR cct.volume_declarado IS NOT NULL 
           OR cct.cnpj_consignatario IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 
            FROM ${database}.t_leadcomex_enrichment_logs l 
            WHERE l.hawb COLLATE utf8mb4_unicode_ci = cct.house COLLATE utf8mb4_unicode_ci
              AND l.success = 1
          )
      `);

      const housesToClean = recordsToClean.map((r: any) => r.house);
      console.log(`[CLEAR-CCT-WEIGHT] Found ${housesToClean.length} records to clean`);

      if (housesToClean.length === 0) {
        await client.close();
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Nenhum registro para limpar - todos os dados de peso vieram da LeadComex',
            cleaned: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (dryRun) {
        await client.close();
        return new Response(
          JSON.stringify({
            success: true,
            message: `[DRY RUN] Seriam limpos ${housesToClean.length} registros`,
            would_clean: housesToClean,
            note: 'Execute com dryRun=false para efetuar a limpeza',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Execute the cleanup
      const placeholders = housesToClean.map(() => '?').join(', ');
      const updateResult = await client.execute(`
        UPDATE ${database}.t_cct_shipments 
        SET peso_declarado = NULL,
            peso_constatado = NULL,
            volume_declarado = NULL,
            volume_constatado = NULL,
            cnpj_consignatario = NULL,
            updated_at = NOW()
        WHERE house IN (${placeholders})
      `, housesToClean);

      const affectedRows = (updateResult as any)?.affectedRows || 0;
      console.log(`[CLEAR-CCT-WEIGHT] Cleaned ${affectedRows} records`);

      await client.close();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Limpeza concluída: ${affectedRows} registros atualizados`,
          cleaned: affectedRows,
          houses: housesToClean,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STATS: Show current data status
    // ========================================
    if (action === 'stats') {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_cct_shipments,
          SUM(CASE WHEN peso_declarado IS NOT NULL THEN 1 ELSE 0 END) as com_peso,
          SUM(CASE WHEN peso_declarado IS NULL THEN 1 ELSE 0 END) as sem_peso,
          SUM(CASE WHEN cnpj_consignatario IS NOT NULL THEN 1 ELSE 0 END) as com_cnpj,
          SUM(CASE WHEN cnpj_consignatario IS NULL THEN 1 ELSE 0 END) as sem_cnpj
        FROM ${database}.t_cct_shipments
      `);

      const leadcomexStats = await client.query(`
        SELECT 
          COUNT(*) as total_logs,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as fail_count
        FROM ${database}.t_leadcomex_enrichment_logs
      `);

      await client.close();

      return new Response(
        JSON.stringify({
          success: true,
          cct_shipments: stats[0] || {},
          leadcomex_logs: leadcomexStats[0] || {},
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await client.close();
    return new Response(
      JSON.stringify({ error: 'Action inválida. Use: preview, clean, stats' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    if (client) {
      try { await client.close(); } catch {}
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CLEAR-CCT-WEIGHT] Erro:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
