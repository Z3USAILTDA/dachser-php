import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import {
  detectCarrierFromMbl,
  type ShippingLineCode,
} from "../_shared/shippingLineMapping.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map ShippingLineCode → { function, shortName (max 20 chars for DB column) }
const CARRIER_CONFIG: Partial<Record<ShippingLineCode, { fn: string; shortName: string }>> = {
  'HAPAG_LLOYD': { fn: 'draft-track-hapag-multi', shortName: 'HAPAG' },
  'HAMBURG_SUD': { fn: 'draft-track-hapag-multi', shortName: 'HAMBURG SUD' },
  'MSC': { fn: 'draft-track-msc', shortName: 'MSC' },
  'ONE': { fn: 'draft-track-one', shortName: 'ONE' },
};

const MAX_MBLS = 40;
const DELAY_MS = 1500;
const NAO_ENCONTRADO_COOLDOWN_HOURS = 24;

async function getMariaClient(): Promise<Client> {
  return await new Client().connect({
    hostname: (Deno.env.get('MARIADB_SEA_HOST') || Deno.env.get('MARIADB_OPS_HOST'))!,
    port: parseInt((Deno.env.get('MARIADB_SEA_PORT') || Deno.env.get('MARIADB_OPS_PORT')) || '3306'),
    db: (Deno.env.get('MARIADB_SEA_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE'))!,
    username: (Deno.env.get('MARIADB_SEA_USER') || Deno.env.get('MARIADB_OPS_USER'))!,
    password: (Deno.env.get('MARIADB_SEA_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD'))!,
  });
}

function sanitizeMbl(mbl: string): string {
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

  // Single-MBL mode: ?single_mbl=<MBL> processa apenas o MBL informado
  const url = new URL(req.url);
  const singleMbl = url.searchParams.get('single_mbl')?.trim() || null;

  const stats = {
    total_pending: 0,
    processed: 0,
    discovered: 0,
    skipped_no_carrier: 0,
    errors: [] as string[],
    details: [] as any[],
    duration_ms: 0,
    single_mbl_mode: !!singleMbl,
  };

  let client: Client | null = null;

  try {
    let pendingRows: any[];

    if (singleMbl) {
      console.log(`[sea-carrier-fallback] Modo single_mbl: ${singleMbl}`);
      pendingRows = [{ mbl_id: singleMbl }];
    } else {
      // 1. Fetch MBLs with PENDENTE/NAO_ENCONTRADO containers
      console.log('[sea-carrier-fallback] Buscando MBLs pendentes...');
      client = await getMariaClient();

      pendingRows = await client.query(`
        SELECT DISTINCT ts.mbl_id
        FROM dados_dachser.t_sea_tracking_current ts
        WHERE ts.active = 1
          AND ts.container IN ('PENDENTE', 'NAO_ENCONTRADO', '')
          AND (
            ts.container <> 'NAO_ENCONTRADO'
            OR ts.last_check IS NULL
            OR ts.last_check < DATE_SUB(NOW(), INTERVAL ? HOUR)
          )
        ORDER BY ts.last_check ASC
        LIMIT ?
      `, [NAO_ENCONTRADO_COOLDOWN_HOURS, MAX_MBLS]);

      await client.close();
      client = null;
    }

    stats.total_pending = pendingRows.length;
    console.log(`[sea-carrier-fallback] Processando ${pendingRows.length} MBL(s)`);

    if (pendingRows.length === 0) {
      stats.duration_ms = Date.now() - startTime;
      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }


    // 2. Process each MBL
    for (let i = 0; i < pendingRows.length; i++) {
      const mblId = pendingRows[i].mbl_id as string;
      const carrierInfo = detectCarrierFromMbl(mblId);
      const carrierConfig = CARRIER_CONFIG[carrierInfo.code];

      if (!carrierConfig) {
        console.log(`[sea-carrier-fallback] Skip ${mblId}: armador ${carrierInfo.code} sem fallback`);
        stats.skipped_no_carrier++;

        // Update last_check so we don't keep retrying unsupported carriers
        try {
          client = await getMariaClient();
          await client.execute(
            `UPDATE dados_dachser.t_sea_tracking_current SET last_check = NOW() WHERE mbl_id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
            [mblId]
          );
          await client.close();
          client = null;
        } catch (_e) { /* ignore */ }

        continue;
      }

      try {
        console.log(`[sea-carrier-fallback] Processando ${mblId} via ${carrierConfig.fn} (${carrierConfig.shortName})...`);

        const cleanMbl = sanitizeMbl(mblId);

        // 3. Call the carrier-specific edge function
        const trackRes = await fetch(`${supabaseUrl}/functions/v1/${carrierConfig.fn}`, {
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

          // Update last_check + mark NAO_ENCONTRADO + last_error
          const errMsg = `Armador ${carrierConfig.shortName} retornou vazio em ${new Date().toISOString()}`;
          client = await getMariaClient();
          await client.execute(
            `UPDATE dados_dachser.t_sea_tracking_current SET last_check = NOW(), container = 'NAO_ENCONTRADO', last_error = ? WHERE mbl_id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
            [errMsg.substring(0, 250), mblId]
          );
          await client.close();
          client = null;

          stats.processed++;
          continue;
        }

        // 4. Insert discovered containers into t_sea_tracking_current
        const containers = trackData.containers;
        const bookingInfo = trackData.bookingInfo || {};

        console.log(`[sea-carrier-fallback] ${mblId}: ${containers.length} containers encontrados`);

        client = await getMariaClient();

        // Get existing row data for tipo_processo, email_analista, etc.
        const existingRows: any[] = await client.query(
          `SELECT tipo_processo, email_analista, email_cliente, consignee FROM dados_dachser.t_sea_tracking_current WHERE mbl_id = ? LIMIT 1`,
          [mblId]
        );
        const templateRow = existingRows[0] || {};

        // Insert each discovered container
        for (const cnt of containers) {
          const containerNo = cnt.containerNo || cnt.number || '';
          if (!containerNo || containerNo === 'PENDENTE' || containerNo === 'NAO_ENCONTRADO') continue;

          const status = cnt.status || 'In Progress';
          const latestEvent = cnt.latestEvent || '';
          const latestLocation = cnt.latestLocation || '';

          // Check if this container already exists for this mbl_id
          const existing: any[] = await client.query(
            `SELECT id FROM dados_dachser.t_sea_tracking_current WHERE mbl_id = ? AND container = ?`,
            [mblId, containerNo]
          );

          if (existing.length > 0) {
            await client.execute(
              `UPDATE dados_dachser.t_sea_tracking_current 
               SET container_status = ?, last_event = ?, last_check = NOW(),
                   navio = COALESCE(?, navio), eta = COALESCE(?, eta),
                   origem = COALESCE(?, origem), destino = COALESCE(?, destino),
                   shipping_line = ?
               WHERE mbl_id = ? AND container = ?`,
              [status, latestEvent,
               bookingInfo.vesselName || null, bookingInfo.eta || null,
               bookingInfo.originLocation || bookingInfo.originCode || null,
               bookingInfo.destinationLocation || bookingInfo.destinationCode || null,
               carrierConfig.shortName,
               mblId, containerNo]
            );
          } else {
            await client.execute(
              `INSERT INTO dados_dachser.t_sea_tracking_current 
               (mbl_id, tipo_processo, container, shipping_line, consignee, origem, destino,
                navio, eta, last_event, container_status, last_check, email_analista, email_cliente, active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 1)`,
              [
                mblId,
                templateRow.tipo_processo || 'SEA IMPORT',
                containerNo,
                carrierConfig.shortName,
                templateRow.consignee || null,
                bookingInfo.originLocation || bookingInfo.originCode || null,
                bookingInfo.destinationLocation || bookingInfo.destinationCode || null,
                bookingInfo.vesselName || null,
                bookingInfo.eta || null,
                latestEvent,
                status,
                templateRow.email_analista || null,
                templateRow.email_cliente || null,
              ]
            );
          }
        }

        // 5. Remove PENDENTE/NAO_ENCONTRADO placeholders for this mbl_id
        await client.execute(
          `DELETE FROM dados_dachser.t_sea_tracking_current WHERE mbl_id = ? AND container IN ('PENDENTE', 'NAO_ENCONTRADO', '')`,
          [mblId]
        );

        // 6. Update t_sea_master with consolidated info
        const vessel = bookingInfo.vesselName || null;
        const eta = bookingInfo.eta || null;
        const etd = bookingInfo.etd || null;
        const origin = bookingInfo.originLocation || bookingInfo.originCode || null;
        const destination = bookingInfo.destinationLocation || bookingInfo.destinationCode || null;

        await client.execute(
          `UPDATE dados_dachser.t_sea_master 
           SET eta_ata = COALESCE(?, eta_ata),
               etd = COALESCE(?, etd)
           WHERE master = ?`,
          [eta, etd, mblId]
        );

        await client.close();
        client = null;

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
        if (client) { try { await client.close(); } catch {} client = null; }
        const errMsg = `${mblId}: ${err.message}`;
        stats.errors.push(errMsg);
        console.error(`[sea-carrier-fallback] Erro processando ${mblId}:`, err.message);
      }

      // Delay between calls
      if (i < pendingRows.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

  } catch (err: any) {
    if (client) { try { await client.close(); } catch {} }
    stats.errors.push(`Erro geral: ${err.message}`);
    console.error('[sea-carrier-fallback] Erro geral:', err.message);
  }

  stats.duration_ms = Date.now() - startTime;
  console.log('[sea-carrier-fallback] Concluído:', stats);

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
