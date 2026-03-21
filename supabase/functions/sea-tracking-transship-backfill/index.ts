import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
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
    // ═══════════════════════════════════════════════════════════════
    // PASSO 1: Detectar transbordo via last_event na t_tracking_sea
    // ═══════════════════════════════════════════════════════════════
    const previewLastEventQuery = `
      SELECT 
        ts.mbl_id,
        ts.container,
        ts.last_event,
        ts.origem,
        ts.destino,
        ts.transshipment_port,
        UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1))) as detected_port
      FROM dados_dachser.t_tracking_sea ts
      WHERE ts.active = 1
        AND ts.last_event LIKE '% - %'
        -- Eventos de trânsito
        AND (
          UPPER(ts.last_event) LIKE 'VESSEL DEPARTED%'
          OR UPPER(ts.last_event) LIKE 'DEPARTURE%'
          OR UPPER(ts.last_event) LIKE 'ARRIVAL%'
          OR UPPER(ts.last_event) LIKE 'ARRIVED%'
          OR UPPER(ts.last_event) LIKE 'DISCHARGED%'
          OR UPPER(ts.last_event) LIKE 'FULL TRANSSHIPMENT%'
        )
        -- Excluir eventos locais
        AND UPPER(ts.last_event) NOT LIKE 'GATE OUT%'
        AND UPPER(ts.last_event) NOT LIKE 'GATE IN%'
        AND UPPER(ts.last_event) NOT LIKE 'LOADED%'
        AND UPPER(ts.last_event) NOT LIKE 'EMPTY%'
        -- Localização != destino (primeiro token)
        AND ts.destino IS NOT NULL AND ts.destino != ''
        AND UPPER(TRIM(SUBSTRING_INDEX(
              SUBSTRING_INDEX(ts.last_event, ' - ', -1), ' ', 1
            ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ' ', 1)))
        AND UPPER(TRIM(SUBSTRING_INDEX(
              SUBSTRING_INDEX(ts.last_event, ' - ', -1), ',', 1
            ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ',', 1)))
        -- Localização != origem (primeiro token)
        AND (ts.origem IS NULL OR ts.origem = '' OR (
          UPPER(TRIM(SUBSTRING_INDEX(
                SUBSTRING_INDEX(ts.last_event, ' - ', -1), ' ', 1
              ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ' ', 1)))
          AND UPPER(TRIM(SUBSTRING_INDEX(
                SUBSTRING_INDEX(ts.last_event, ' - ', -1), ',', 1
              ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1)))
        ))
        -- Excluir se já contém o porto detectado
        AND (
          ts.transshipment_port IS NULL 
          OR ts.transshipment_port = ''
          OR NOT UPPER(ts.transshipment_port) LIKE CONCAT('%', UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1))), '%')
        )
    `;

    const previewLastEvent = await client.query(previewLastEventQuery);
    console.log(`[backfill] PASSO 1: Found ${previewLastEvent.length} records via last_event`);

    let step1Updated = 0;
    if (!dryRun && previewLastEvent.length > 0) {
      const updateLastEventQuery = `
        UPDATE dados_dachser.t_tracking_sea ts
        SET ts.transshipment_port = CASE
          WHEN ts.transshipment_port IS NULL OR ts.transshipment_port = '' 
            THEN UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1)))
          WHEN UPPER(ts.transshipment_port) LIKE CONCAT('%', UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1))), '%')
            THEN ts.transshipment_port
          ELSE CONCAT(ts.transshipment_port, '; ', UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1))))
        END
        WHERE ts.active = 1
          AND ts.last_event LIKE '% - %'
          AND (
            UPPER(ts.last_event) LIKE 'VESSEL DEPARTED%'
            OR UPPER(ts.last_event) LIKE 'DEPARTURE%'
            OR UPPER(ts.last_event) LIKE 'ARRIVAL%'
            OR UPPER(ts.last_event) LIKE 'ARRIVED%'
            OR UPPER(ts.last_event) LIKE 'DISCHARGED%'
            OR UPPER(ts.last_event) LIKE 'FULL TRANSSHIPMENT%'
          )
          AND UPPER(ts.last_event) NOT LIKE 'GATE OUT%'
          AND UPPER(ts.last_event) NOT LIKE 'GATE IN%'
          AND UPPER(ts.last_event) NOT LIKE 'LOADED%'
          AND UPPER(ts.last_event) NOT LIKE 'EMPTY%'
          AND ts.destino IS NOT NULL AND ts.destino != ''
          AND UPPER(TRIM(SUBSTRING_INDEX(
                SUBSTRING_INDEX(ts.last_event, ' - ', -1), ' ', 1
              ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ' ', 1)))
          AND UPPER(TRIM(SUBSTRING_INDEX(
                SUBSTRING_INDEX(ts.last_event, ' - ', -1), ',', 1
              ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ',', 1)))
          AND (ts.origem IS NULL OR ts.origem = '' OR (
            UPPER(TRIM(SUBSTRING_INDEX(
                  SUBSTRING_INDEX(ts.last_event, ' - ', -1), ' ', 1
                ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ' ', 1)))
            AND UPPER(TRIM(SUBSTRING_INDEX(
                  SUBSTRING_INDEX(ts.last_event, ' - ', -1), ',', 1
                ))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1)))
          ))
          AND (
            ts.transshipment_port IS NULL 
            OR ts.transshipment_port = ''
            OR NOT UPPER(ts.transshipment_port) LIKE CONCAT('%', UPPER(TRIM(SUBSTRING_INDEX(ts.last_event, ' - ', -1))), '%')
          )
      `;
      await client.execute(updateLastEventQuery);
      step1Updated = previewLastEvent.length;
      console.log(`[backfill] PASSO 1: Updated ${step1Updated} records`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PASSO 2: Detectar transbordo via t_tracking_sea_history 
    //          (keywords TRANSSHIP/T/S com location)
    // ═══════════════════════════════════════════════════════════════
    const previewHistoryQuery = `
      SELECT 
        ts.mbl_id,
        ts.container,
        ts.transshipment_port as current_port,
        h.location as history_location,
        h.event_description,
        h.container_status
      FROM dados_dachser.t_tracking_sea ts
      INNER JOIN dados_dachser.t_tracking_sea_history h ON h.mbl_id = ts.mbl_id
      WHERE ts.active = 1
        AND h.location IS NOT NULL AND h.location != ''
        AND (
          UPPER(h.event_description) LIKE '%TRANSSHIP%'
          OR UPPER(h.event_description) LIKE '%T/S%'
          OR UPPER(h.container_status) LIKE '%TRANSSHIP%'
          OR UPPER(h.container_status) LIKE '%T/S%'
          OR UPPER(h.event_code) LIKE '%TRANSSHIP%'
        )
        -- Excluir location que seja o destino
        AND (
          ts.destino IS NULL OR ts.destino = ''
          OR (
            UPPER(TRIM(SUBSTRING_INDEX(h.location, ',', 1))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ',', 1)))
            AND UPPER(TRIM(SUBSTRING_INDEX(h.location, ' ', 1))) != UPPER(TRIM(SUBSTRING_INDEX(ts.destino, ' ', 1)))
          )
        )
        -- Excluir location que seja a origem
        AND (
          ts.origem IS NULL OR ts.origem = ''
          OR (
            UPPER(TRIM(SUBSTRING_INDEX(h.location, ',', 1))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ',', 1)))
            AND UPPER(TRIM(SUBSTRING_INDEX(h.location, ' ', 1))) != UPPER(TRIM(SUBSTRING_INDEX(ts.origem, ' ', 1)))
          )
        )
        -- Excluir se já contém o porto
        AND (
          ts.transshipment_port IS NULL 
          OR ts.transshipment_port = ''
          OR NOT UPPER(ts.transshipment_port) LIKE CONCAT('%', UPPER(TRIM(h.location)), '%')
        )
      GROUP BY ts.mbl_id, h.location
      ORDER BY ts.mbl_id
    `;

    const previewHistory = await client.query(previewHistoryQuery);
    console.log(`[backfill] PASSO 2: Found ${previewHistory.length} records via history keywords`);

    let step2Updated = 0;
    if (!dryRun && previewHistory.length > 0) {
      // Process row by row to handle accumulation correctly
      for (const row of previewHistory) {
        const loc = (row.history_location || '').toString().trim().toUpperCase();
        if (!loc) continue;

        const updateHistoryQuery = `
          UPDATE dados_dachser.t_tracking_sea
          SET transshipment_port = CASE
            WHEN transshipment_port IS NULL OR transshipment_port = '' THEN ?
            WHEN UPPER(transshipment_port) LIKE CONCAT('%', ?, '%') THEN transshipment_port
            ELSE CONCAT(transshipment_port, '; ', ?)
          END
          WHERE mbl_id = ?
            AND active = 1
        `;
        await client.execute(updateHistoryQuery, [loc, loc, loc, row.mbl_id]);
        step2Updated++;
      }
      console.log(`[backfill] PASSO 2: Updated ${step2Updated} records`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PASSO 3: Resultado final
    // ═══════════════════════════════════════════════════════════════
    const verifyQuery = `
      SELECT COUNT(*) as total_with_transshipment
      FROM dados_dachser.t_tracking_sea
      WHERE active = 1
        AND transshipment_port IS NOT NULL 
        AND transshipment_port != ''
    `;
    const verify = await client.query(verifyQuery);

    await client.close();

    return new Response(JSON.stringify({
      success: true,
      mode: dryRun ? 'dry_run' : 'executed',
      step1_last_event: {
        records_found: previewLastEvent.length,
        records_updated: step1Updated,
        sample: previewLastEvent.slice(0, 10).map((r: any) => ({
          mbl_id: r.mbl_id,
          container: r.container,
          last_event: r.last_event,
          origem: r.origem,
          destino: r.destino,
          current_transshipment: r.transshipment_port,
          detected_port: r.detected_port,
        }))
      },
      step2_history_keywords: {
        records_found: previewHistory.length,
        records_updated: step2Updated,
        sample: previewHistory.slice(0, 10).map((r: any) => ({
          mbl_id: r.mbl_id,
          container: r.container,
          current_port: r.current_port,
          history_location: r.history_location,
          event_description: r.event_description,
        }))
      },
      total_with_transshipment: verify[0]?.total_with_transshipment || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[backfill] Error:', e);
    try { await client.close(); } catch (_) {}
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
