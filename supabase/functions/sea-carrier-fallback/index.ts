import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { connect } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import {
  detectCarrierFromMbl,
  type ShippingLineCode,
} from "../_shared/shippingLineMapping.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map ShippingLineCode → edge function name
const CARRIER_FUNCTION_MAP: Partial<Record<ShippingLineCode, string>> = {
  'HAPAG_LLOYD': 'draft-track-hapag-multi',
  'HAMBURG_SUD': 'draft-track-hapag-multi', // Hamburg Süd uses Hapag API
  'MSC': 'draft-track-msc',
  'ONE': 'draft-track-one',
};

const MAX_MBLS = 15;
const DELAY_MS = 1500;

async function queryMariaDB(query: string, params: any[] = []): Promise<any[]> {
  const client = await connect({
    hostname: Deno.env.get('MARIADB_HOST')!,
    port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
    db: Deno.env.get('MARIADB_DATABASE')!,
    username: Deno.env.get('MARIADB_USER')!,
    password: Deno.env.get('MARIADB_PASSWORD')!,
  });
  try {
    const rows = await client.query(query, params);
    return rows;
  } finally {
    await client.close();
  }
}

async function executeMariaDB(query: string, params: any[] = []): Promise<any> {
  const client = await connect({
    hostname: Deno.env.get('MARIADB_HOST')!,
    port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
    db: Deno.env.get('MARIADB_DATABASE')!,
    username: Deno.env.get('MARIADB_USER')!,
    password: Deno.env.get('MARIADB_PASSWORD')!,
  });
  try {
    const result = await client.execute(query, params);
    return result;
  } finally {
    await client.close();
  }
}

function sanitizeMbl(mbl: string): string {
  // Strip everything after " - " and limit to 20 chars
  let clean = mbl.trim();
  const dashIdx = clean.indexOf(' - ');
  if (dashIdx > 0) clean = clean.substring(0, dashIdx).trim();
  return clean.substring(0, 20);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const stats = {
    total_pending: 0,
    processed: 0,
    discovered: 0,
    skipped_no_carrier: 0,
    errors: [] as string[],
    details: [] as any[],
    duration_ms: 0,
  };

  try {
    // 1. Fetch MBLs with PENDENTE/NAO_ENCONTRADO containers
    console.log('[sea-carrier-fallback] Buscando MBLs pendentes...');
    const pendingRows = await queryMariaDB(`
      SELECT DISTINCT ts.id as mbl_id
      FROM dados_dachser.t_tracking_sea ts
      JOIN dados_dachser.t_sea_master sm ON ts.master_id = sm.id
      WHERE sm.active = 1
        AND ts.container IN ('PENDENTE', 'NAO_ENCONTRADO', '')
      ORDER BY ts.last_check ASC
      LIMIT ?
    `, [MAX_MBLS]);

    stats.total_pending = pendingRows.length;
    console.log(`[sea-carrier-fallback] Encontrados ${pendingRows.length} MBLs pendentes`);

    if (pendingRows.length === 0) {
      stats.duration_ms = Date.now() - startTime;
      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Process each MBL
    for (const row of pendingRows) {
      const mblId = row.mbl_id;
      const carrierInfo = detectCarrierFromMbl(mblId);
      const functionName = CARRIER_FUNCTION_MAP[carrierInfo.code];

      if (!functionName) {
        console.log(`[sea-carrier-fallback] Skip ${mblId}: armador ${carrierInfo.code} sem fallback`);
        stats.skipped_no_carrier++;
        
        // Update last_check so we don't keep retrying unsupported carriers
        try {
          await executeMariaDB(
            `UPDATE dados_dachser.t_tracking_sea SET last_check = NOW() WHERE id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
            [mblId]
          );
        } catch (_e) { /* ignore */ }
        
        continue;
      }

      try {
        console.log(`[sea-carrier-fallback] Processando ${mblId} via ${functionName} (${carrierInfo.name})...`);
        
        const cleanMbl = sanitizeMbl(mblId);

        // 3. Call the carrier-specific edge function
        const trackRes = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ searchType: 'bl', searchValue: cleanMbl }),
        });

        const trackText = await trackRes.text();
        let trackData: any;
        try {
          trackData = JSON.parse(trackText);
        } catch {
          trackData = { success: false, error: trackText };
        }

        if (!trackData.success || !trackData.containers || trackData.containers.length === 0) {
          console.log(`[sea-carrier-fallback] ${mblId}: sem containers encontrados`);
          stats.details.push({ mbl: mblId, carrier: carrierInfo.code, result: 'no_containers' });
          
          // Update last_check to avoid re-checking too soon
          await executeMariaDB(
            `UPDATE dados_dachser.t_tracking_sea SET last_check = NOW(), container = 'NAO_ENCONTRADO' WHERE id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
            [mblId]
          );
          stats.processed++;
          continue;
        }

        // 4. Insert discovered containers into t_tracking_sea
        const containers = trackData.containers;
        const bookingInfo = trackData.bookingInfo || {};
        
        console.log(`[sea-carrier-fallback] ${mblId}: ${containers.length} containers encontrados`);

        // Get master_id for this MBL
        const masterRows = await queryMariaDB(
          `SELECT sm.id as master_id FROM dados_dachser.t_tracking_sea ts 
           JOIN dados_dachser.t_sea_master sm ON ts.master_id = sm.id
           WHERE ts.id = ? LIMIT 1`,
          [mblId]
        );
        const masterId = masterRows[0]?.master_id;

        if (!masterId) {
          console.error(`[sea-carrier-fallback] ${mblId}: master_id não encontrado`);
          stats.errors.push(`${mblId}: master_id não encontrado`);
          continue;
        }

        // Insert each container
        for (const cnt of containers) {
          const containerNo = cnt.containerNo || cnt.number || '';
          if (!containerNo || containerNo === 'PENDENTE') continue;

          const status = cnt.status || 'In Progress';
          const latestEvent = cnt.latestEvent || '';
          const latestDate = cnt.latestDate || null;
          const latestLocation = cnt.latestLocation || '';

          // Check if container already exists
          const existing = await queryMariaDB(
            `SELECT id FROM dados_dachser.t_tracking_sea WHERE id = ? AND container = ?`,
            [mblId, containerNo]
          );

          if (existing.length > 0) {
            // Update existing
            await executeMariaDB(
              `UPDATE dados_dachser.t_tracking_sea 
               SET status = ?, last_event = ?, last_event_date = ?, last_location = ?, last_check = NOW()
               WHERE id = ? AND container = ?`,
              [status, latestEvent, latestDate, latestLocation, mblId, containerNo]
            );
          } else {
            // Insert new container row
            await executeMariaDB(
              `INSERT INTO dados_dachser.t_tracking_sea 
               (id, master_id, container, status, last_event, last_event_date, last_location, last_check, shipping_line)
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
              [mblId, masterId, containerNo, status, latestEvent, latestDate, latestLocation, carrierInfo.name]
            );
          }
        }

        // 5. Remove PENDENTE placeholder
        await executeMariaDB(
          `DELETE FROM dados_dachser.t_tracking_sea WHERE id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
          [mblId]
        );

        // 6. Update t_sea_master with consolidated info
        const vessel = bookingInfo.vesselName || null;
        const eta = bookingInfo.eta || null;
        const etd = bookingInfo.etd || null;
        const origin = bookingInfo.originLocation || bookingInfo.originCode || null;
        const destination = bookingInfo.destinationLocation || bookingInfo.destinationCode || null;
        const containerCount = containers.length;

        // Derive overall status from last container status
        const lastContainerStatus = containers[containers.length - 1]?.status || 'In Progress';

        await executeMariaDB(
          `UPDATE dados_dachser.t_sea_master 
           SET vessel = COALESCE(?, vessel),
               eta_ata = COALESCE(?, eta_ata),
               etd = COALESCE(?, etd),
               origin = COALESCE(?, origin),
               destination = COALESCE(?, destination),
               container_count = ?,
               status = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [vessel, eta, etd, origin, destination, containerCount, lastContainerStatus, masterId]
        );

        stats.discovered += containers.length;
        stats.processed++;
        stats.details.push({
          mbl: mblId,
          carrier: carrierInfo.code,
          result: 'discovered',
          containers_found: containers.length,
          vessel,
        });

        console.log(`[sea-carrier-fallback] ${mblId}: ${containers.length} containers inseridos com sucesso`);

      } catch (err: any) {
        const errMsg = `${mblId}: ${err.message}`;
        stats.errors.push(errMsg);
        console.error(`[sea-carrier-fallback] Erro processando ${mblId}:`, err.message);
      }

      // Delay between calls
      if (pendingRows.indexOf(row) < pendingRows.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

  } catch (err: any) {
    stats.errors.push(`Erro geral: ${err.message}`);
    console.error('[sea-carrier-fallback] Erro geral:', err.message);
  }

  stats.duration_ms = Date.now() - startTime;
  console.log('[sea-carrier-fallback] Concluído:', stats);

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
