import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[hapag_batch_discover] Starting...');
    const hapagClientId = Deno.env.get('HAPAG_CLIENT_ID');
    const hapagApiKey = Deno.env.get('HAPAG_API_KEY');
    if (!hapagClientId || !hapagApiKey) {
      return new Response(JSON.stringify({ error: 'HAPAG_CLIENT_ID ou HAPAG_API_KEY não configurados' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const mariadbHost = Deno.env.get('MARIADB_HOST');
    const mariadbUser = Deno.env.get('MARIADB_USER');
    const mariadbPassword = Deno.env.get('MARIADB_PASSWORD');
    if (!mariadbHost || !mariadbUser || !mariadbPassword) {
      return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
    const client = await new Client().connect({
      hostname: mariadbHost,
      username: mariadbUser,
      password: mariadbPassword,
      db: 'dados_dachser',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
    });
    console.log('[hapag_batch_discover] Connected to MariaDB');

    try {
      const pendingRows = await client.query(`
        SELECT DISTINCT t.mbl_id, t.consignee, t.tipo_processo, t.email_analista, t.email_cliente
        FROM dados_dachser.t_tracking_sea t
        WHERE t.active = 1
          AND t.container IN ('PENDENTE', '')
          AND (t.mbl_id LIKE 'HLCU%' OR t.mbl_id LIKE 'HLXU%' OR t.mbl_id LIKE 'HLBU%' OR t.mbl_id LIKE 'SAHL%' OR t.mbl_id LIKE 'GLNL%')
        ORDER BY t.created_at ASC
      `);

      console.log(`[hapag_batch_discover] Found ${pendingRows.length} Hapag MBLs with PENDENTE containers`);

      if (pendingRows.length === 0) {
        await client.close();
        return new Response(JSON.stringify({ success: true, processed: 0, discovered: 0, failed: 0, message: 'Nenhum MBL Hapag com container PENDENTE' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const hapagOfficeCodes = ['BC', 'NG', 'LGB', 'LE', 'HAM', 'SS', 'NYC', 'CHI', 'ATL', 'HOU', 'SEA', 'LAX', 'BSC', 'BKK', 'GDY', 'PN4'];
      const getMblVariations = (mblId: string): string[] => {
        const variations = [mblId];
        const upper = mblId.toUpperCase();
        for (const code of hapagOfficeCodes) {
          const pattern = new RegExp(`^HLCU${code}(\\d+.*)$`, 'i');
          const match = upper.match(pattern);
          if (match) {
            variations.push(`HLCU${match[1]}`);
            break;
          }
        }
        if (upper.startsWith('HLCU') && upper.length > 10) {
          const numPart = upper.replace(/^HLCU[A-Z]*/i, '');
          if (numPart.length >= 6 && !variations.includes(numPart)) {
            variations.push(numPart);
          }
        }
        return [...new Set(variations)];
      };

      const results: any[] = [];
      let discovered = 0;
      let failed = 0;
      let rateLimited = false;

      for (const row of pendingRows) {
        if (rateLimited) break;

        const mblId = row.mbl_id;
        const variations = getMblVariations(mblId);
        let found = false;

        for (const variation of variations) {
          if (rateLimited) break;

          const hapagUrl = `https://api.hlag.com/hlag/external/v2/events/?transportDocumentReference=${encodeURIComponent(variation)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          try {
            const res = await fetch(hapagUrl, {
              method: 'GET',
              headers: {
                'X-IBM-Client-Id': hapagClientId,
                'X-IBM-Client-Secret': hapagApiKey,
                'Accept': 'application/json',
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.status === 429) {
              console.log(`[hapag_batch_discover] Rate limited at MBL ${mblId}`);
              rateLimited = true;
              results.push({ mbl: mblId, status: 'rate_limited' });
              break;
            }

            if (!res.ok || res.status === 204 || res.status === 404) {
              await res.text().catch(() => '');
              console.log(`[hapag_batch_discover] ${mblId} variation ${variation}: ${res.status}`);
              continue;
            }

            const text = await res.text();
            if (!text || text.trim() === '') continue;

            const data = JSON.parse(text);
            const events = Array.isArray(data) ? data : (data.events || []);
            if (events.length === 0) continue;

            const containerMap = new Map<string, any[]>();
            for (const evt of events) {
              const eqRef = evt.equipmentReference;
              if (eqRef && /^[A-Z]{4}\d{7}$/i.test(eqRef)) {
                if (!containerMap.has(eqRef)) containerMap.set(eqRef, []);
                containerMap.get(eqRef)!.push(evt);
              }
            }

            if (containerMap.size === 0) continue;

            console.log(`[hapag_batch_discover] ${mblId} → ${containerMap.size} containers via ${variation}`);

            for (const [ctrNo, ctrEvents] of containerMap.entries()) {
              const sorted = [...ctrEvents].sort((a: any, b: any) => new Date(b.eventDateTime || 0).getTime() - new Date(a.eventDateTime || 0).getTime());

              let vessel: string | null = null;
              let vesselImo: string | null = null;
              let origem: string | null = null;
              let destino: string | null = null;
              let etd: string | null = null;
              let eta: string | null = null;
              let cStatus: string | null = null;
              let lastEvt: string | null = null;

              for (const e of sorted) {
                if (!vessel && e.transportCall?.vessel?.vesselName) {
                  vessel = e.transportCall.vessel.vesselName;
                  vesselImo = e.transportCall.vessel.vesselIMONumber || null;
                }
                if (!origem && e.transportEventTypeCode === 'DEPA') {
                  origem = e.transportCall?.location?.locationName || e.transportCall?.UNLocationCode || null;
                  etd = e.eventDateTime?.split('T')[0] || null;
                }
                if (e.transportEventTypeCode === 'ARRI') {
                  destino = e.transportCall?.location?.locationName || e.transportCall?.UNLocationCode || null;
                  eta = e.eventDateTime?.split('T')[0] || null;
                }
              }

              const latestEquip = sorted.find((e: any) => e.eventType === 'EQUIPMENT');
              if (latestEquip) {
                const code = latestEquip.equipmentEventTypeCode || '';
                const statusMap: Record<string, string> = { 'LOAD': 'LOADED', 'DISC': 'DISCHARGED', 'GTIN': 'GATE_IN', 'GTOT': 'GATE_OUT', 'PICK': 'PICKED_UP', 'DROP': 'DROPPED_OFF' };
                cStatus = statusMap[code] || code || 'IN_TRANSIT';
                const loc = latestEquip.eventLocation?.locationName || latestEquip.transportCall?.location?.locationName || '';
                lastEvt = `${cStatus} - ${loc}`.trim();
              } else {
                const latestTransport = sorted.find((e: any) => e.eventType === 'TRANSPORT');
                if (latestTransport) {
                  const code = latestTransport.transportEventTypeCode || '';
                  cStatus = code === 'DEPA' ? 'DEPARTED' : code === 'ARRI' ? 'ARRIVED' : code;
                  const loc = latestTransport.transportCall?.location?.locationName || '';
                  lastEvt = `${cStatus} - ${loc}`.trim();
                }
              }
              if (!cStatus) cStatus = 'IN_TRANSIT';
              if (!lastEvt) lastEvt = cStatus;

              const cleanContainer = ctrNo.replace(/[^A-Z0-9]/gi, '').toUpperCase();

              const existing = await client.query(
                `SELECT id FROM dados_dachser.t_tracking_sea WHERE mbl_id = ? AND container = ? LIMIT 1`,
                [mblId, cleanContainer]
              );

              if (existing.length > 0) {
                await client.execute(`
                  UPDATE dados_dachser.t_tracking_sea
                  SET container_status = ?, origem = COALESCE(?, origem), destino = COALESCE(?, destino),
                      eta = ?, navio = COALESCE(?, navio), vessel_imo = COALESCE(?, vessel_imo),
                      last_event = ?, shipping_line = 'HAPAG-LLOYD',
                      last_check = NOW(), last_error = NULL, updated_at = NOW()
                  WHERE mbl_id = ? AND container = ?
                `, [cStatus, origem, destino, eta, vessel, vesselImo, lastEvt, mblId, cleanContainer]);
              } else {
                await client.execute(`
                  INSERT INTO dados_dachser.t_tracking_sea 
                    (mbl_id, container, consignee, shipping_line, tipo_processo, email_analista, email_cliente,
                     container_status, origem, destino, eta, navio, vessel_imo, last_event, last_check, active, created_at, updated_at)
                  VALUES (?, ?, ?, 'HAPAG-LLOYD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, NOW(), NOW())
                `, [mblId, cleanContainer, row.consignee, row.tipo_processo, row.email_analista, row.email_cliente,
                    cStatus, origem, destino, eta, vessel, vesselImo, lastEvt]);
              }

              try {
                for (const evt of sorted.slice(0, 20)) {
                  const evtDate = evt.eventDateTime || null;
                  const evtType = evt.equipmentEventTypeCode || evt.transportEventTypeCode || evt.shipmentEventTypeCode || 'UNKNOWN';
                  const evtLoc = evt.eventLocation?.locationName || evt.transportCall?.location?.locationName || '';
                  const evtVessel = evt.transportCall?.vessel?.vesselName || null;
                  await client.execute(`
                    INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
                      (mbl_id, container, event_date, event_code, event_description, location, vessel, source, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'HAPAG_API', NOW())
                  `, [mblId, cleanContainer, evtDate, evtType, `${evtType} - ${evtLoc}`, evtLoc, evtVessel]);
                }
              } catch (histErr: any) {
                console.log(`[hapag_batch_discover] History error for ${cleanContainer}: ${histErr.message}`);
              }
            }

            // Remove PENDENTE placeholder
            await client.execute(`
              DELETE FROM dados_dachser.t_tracking_sea 
              WHERE mbl_id = ? AND container IN ('PENDENTE', '')
            `, [mblId]);

            // Update parent MBL summary
            const containerCountResult = await client.query(
              `SELECT COUNT(*) as cnt FROM dados_dachser.t_tracking_sea WHERE mbl_id = ? AND container NOT IN ('PENDENTE', '') AND active = 1`,
              [mblId]
            );
            const containerCount = containerCountResult[0]?.cnt || 0;
            const latestContainer = await client.query(
              `SELECT container_status, last_event, last_check, navio, vessel_imo, eta, origem, destino 
               FROM dados_dachser.t_tracking_sea WHERE mbl_id = ? AND container NOT IN ('PENDENTE', '') AND active = 1 
               ORDER BY last_check DESC LIMIT 1`,
              [mblId]
            );
            if (latestContainer.length > 0) {
              const lc = latestContainer[0];
              await client.execute(`
                UPDATE dados_dachser.t_sea_master
                SET container_count = ?, container_status = ?, last_event = ?, last_check = NOW(),
                    navio = COALESCE(?, navio), vessel_imo = COALESCE(?, vessel_imo),
                    eta = COALESCE(?, eta), origem = COALESCE(?, origem), destino = COALESCE(?, destino),
                    shipping_line = 'HAPAG-LLOYD', updated_at = NOW()
                WHERE mbl_id = ?
              `, [containerCount, lc.container_status, lc.last_event, lc.navio, lc.vessel_imo, lc.eta, lc.origem, lc.destino, mblId]);
            }

            results.push({ mbl: mblId, status: 'discovered', containers: containerMap.size, variation });
            discovered++;
            found = true;
            break;
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            console.error(`[hapag_batch_discover] Error ${mblId} (${variation}): ${fetchErr.message}`);
          }

          await new Promise(r => setTimeout(r, 500));
        }

        if (!found && !rateLimited) {
          results.push({ mbl: mblId, status: 'not_found', variations: variations.length });
          failed++;
        }

        await new Promise(r => setTimeout(r, 300));
      }

      await client.close();

      console.log(`[hapag_batch_discover] Done: ${discovered} discovered, ${failed} not found, rateLimited=${rateLimited}`);

      return new Response(JSON.stringify({
        success: true,
        total: pendingRows.length,
        discovered,
        failed,
        rate_limited: rateLimited,
        results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      await client.close();
      console.error('[hapag_batch_discover] Error:', e);
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (e: any) {
    console.error('[hapag_batch_discover] Fatal error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
