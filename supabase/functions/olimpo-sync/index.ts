import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const mariadbHost = Deno.env.get('MARIADB_HOST');
  const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
  const mariadbUser = Deno.env.get('MARIADB_USER');
  const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
  const mariadbDb = 'dados_dachser';

  if (!mariadbHost || !mariadbUser || !mariadbPass) {
    return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
    const client = await new Client().connect({
      hostname: mariadbHost,
      port: parseInt(mariadbPort, 10),
      username: mariadbUser,
      password: mariadbPass,
      db: mariadbDb,
    });

    const stats = {
      air_inserted: 0,
      air_updated: 0,
      sea_inserted: 0,
      sea_updated: 0,
      errors: [] as string[]
    };

    console.log('[olimpo-sync] Iniciando sincronização AIR...');

    // ===== SYNC AIR =====
    // Fonte: dados_dachser.t_awb_voo + dados_dachser.t_master_dados
    try {
      const airResult = await client.execute(`
        INSERT INTO dados_dachser.t_olimpo_tracking 
          (mode, asset, flight, tipo_processo, cliente, eta, etd, ata, atd, status, active)
        SELECT 
          'air' AS mode,
          af.awb AS asset,
          UPPER(REPLACE(af.num_voo, ' ', '')) AS flight,
          dm.tipo_processo,
          COALESCE(NULLIF(TRIM(dm.cliente), ''), 'N/A') AS cliente,
          COALESCE(dm.eta, af.eta) AS eta,
          dm.etd AS etd,
          af.pouso AS ata,
          af.decolagem AS atd,
          CASE 
            WHEN af.pouso IS NOT NULL THEN 'Chegou'
            WHEN af.decolagem IS NOT NULL THEN 'Em voo'
            ELSE 'Em trânsito'
          END AS status,
          TRUE AS active
        FROM dados_dachser.t_awb_voo af
        LEFT JOIN dados_dachser.t_master_dados dm ON TRIM(dm.mawb) = TRIM(af.awb)
        WHERE af.num_voo IS NOT NULL
          AND TRIM(af.num_voo) <> ''
          AND TRIM(af.num_voo) <> '0'
          AND af.awb IS NOT NULL
          AND TRIM(af.awb) <> ''
        ON DUPLICATE KEY UPDATE
          flight = VALUES(flight),
          tipo_processo = VALUES(tipo_processo),
          cliente = VALUES(cliente),
          eta = VALUES(eta),
          etd = VALUES(etd),
          ata = VALUES(ata),
          atd = VALUES(atd),
          status = VALUES(status),
          updated_at = NOW()
      `);

      stats.air_inserted = airResult.affectedRows || 0;
      console.log(`[olimpo-sync] AIR: ${stats.air_inserted} registros processados`);
    } catch (e: any) {
      console.error('[olimpo-sync] Erro AIR:', e.message);
      stats.errors.push(`AIR: ${e.message}`);
    }

    console.log('[olimpo-sync] Iniciando sincronização SEA...');

    // ===== SYNC SEA =====
    // Fonte: ai_agente.t_dachser_sea_items + ai_agente.t_dachser_sea_tracking_cache
    try {
      // Primeiro, verificar se a tabela de cache existe
      const cacheExists = await client.query(`
        SELECT COUNT(*) as cnt 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = 'ai_agente' 
        AND TABLE_NAME = 't_dachser_sea_tracking_cache'
      `);

      if (cacheExists[0]?.cnt > 0) {
        // Com cache - usar dados enriquecidos
        const seaResult = await client.execute(`
          INSERT INTO dados_dachser.t_olimpo_tracking 
            (mode, asset, cliente, origem_code, destino_code, 
             origem_lat, origem_lon, destino_lat, destino_lon,
             vessel_name, container_status, eta, status, active)
          SELECT 
            'sea' AS mode,
            si.container AS asset,
            COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(si.consignee, '(', 1)), ''), 'N/A') AS cliente,
            LEFT(COALESCE(tc.origin_unlocode, ''), 100) AS origem_code,
            LEFT(COALESCE(tc.dest_unlocode, ''), 100) AS destino_code,
            tc.origin_lat,
            tc.origin_lon,
            tc.dest_lat,
            tc.dest_lon,
            tc.vessel_name,
            tc.container_status,
            tc.eta_final_destination AS eta,
            CASE 
              WHEN LOWER(tc.container_status) LIKE '%delivered%' 
                   OR LOWER(tc.container_status) LIKE '%gate out%' 
                   OR LOWER(tc.container_status) LIKE '%empty received%' 
              THEN 'Entregue'
              WHEN tc.eta_final_destination < NOW() THEN 'Atraso'
              ELSE 'Em trânsito'
            END AS status,
            si.active
          FROM ai_agente.t_dachser_sea_items si
          LEFT JOIN ai_agente.t_dachser_sea_tracking_cache tc ON tc.container COLLATE utf8mb4_general_ci = si.container COLLATE utf8mb4_general_ci
          WHERE si.container IS NOT NULL
            AND TRIM(si.container) <> ''
          ON DUPLICATE KEY UPDATE
            cliente = VALUES(cliente),
            origem_code = VALUES(origem_code),
            destino_code = VALUES(destino_code),
            origem_lat = VALUES(origem_lat),
            origem_lon = VALUES(origem_lon),
            destino_lat = VALUES(destino_lat),
            destino_lon = VALUES(destino_lon),
            vessel_name = VALUES(vessel_name),
            container_status = VALUES(container_status),
            eta = VALUES(eta),
            status = VALUES(status),
            active = VALUES(active),
            updated_at = NOW()
        `);

        stats.sea_inserted = seaResult.affectedRows || 0;
        console.log(`[olimpo-sync] SEA (com cache): ${stats.sea_inserted} registros processados`);
      } else {
        // Sem cache - usar apenas dados básicos
        const seaResult = await client.execute(`
          INSERT INTO dados_dachser.t_olimpo_tracking 
            (mode, asset, cliente, status, active)
          SELECT 
            'sea' AS mode,
            si.container AS asset,
            COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(si.consignee, '(', 1)), ''), 'N/A') AS cliente,
            'Em trânsito' AS status,
            si.active
          FROM ai_agente.t_dachser_sea_items si
          WHERE si.container IS NOT NULL
            AND TRIM(si.container) <> ''
          ON DUPLICATE KEY UPDATE
            cliente = VALUES(cliente),
            active = VALUES(active),
            updated_at = NOW()
        `);

        stats.sea_inserted = seaResult.affectedRows || 0;
        console.log(`[olimpo-sync] SEA (sem cache): ${stats.sea_inserted} registros processados`);
      }
    } catch (e: any) {
      console.error('[olimpo-sync] Erro SEA:', e.message);
      stats.errors.push(`SEA: ${e.message}`);
    }

    // Contagem final
    const counts = await client.query(`
      SELECT 
        mode,
        COUNT(*) as total,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_count
      FROM dados_dachser.t_olimpo_tracking 
      GROUP BY mode
    `);

    await client.close();

    console.log('[olimpo-sync] Sincronização concluída:', stats);

    return new Response(JSON.stringify({ 
      success: true,
      stats,
      counts: counts.map((c: any) => ({ 
        mode: c.mode, 
        total: Number(c.total), 
        active: Number(c.active_count) 
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[olimpo-sync] Error:', e);
    return new Response(JSON.stringify({ 
      error: 'Falha na sincronização', 
      detail: e.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
