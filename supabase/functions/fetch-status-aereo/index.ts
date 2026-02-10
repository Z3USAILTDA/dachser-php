import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract pieces count from event description
function extractPieces(text: string): number | null {
  if (!text) return null;
  // Format: "Pieces: 2, Weight: 64.00"
  const longMatch = text.match(/Pieces:\s*(\d+)/i);
  if (longMatch) return parseInt(longMatch[1], 10);
  // Format: "2 / 64.00KGS"
  const shortMatch = text.match(/(\d+)\s*\/\s*[\d.]+\s*KGS/i);
  if (shortMatch) return parseInt(shortMatch[1], 10);
  // Format: "qty: 8, weight: 123"
  const qtyMatch = text.match(/qty:\s*(\d+)/i);
  if (qtyMatch) return parseInt(qtyMatch[1], 10);
  // Format: "5 pieces delivered" or "1 piece(s)" or "1 piece pending" or "1 piece weighing"
  const piecesMatch = text.match(/(\d+)\s*piece(?:s|\(s\))?/i);
  if (piecesMatch) return parseInt(piecesMatch[1], 10);
  return null;
}

// Check if an event is a delivery event
function isDeliveryEvent(event: any): boolean {
  const status = (event.status || '').toUpperCase();
  const desc = (event.Description || event.description || event.title || '').toUpperCase();
  return status === 'DLV' || status === 'DELIVERED' || desc.includes('DELIVERED') || desc.includes('DLV');
}

// Detect pieces discrepancy in timeline
function detectPiecesDiscrepancy(timelineJson: string | null): { pieces_discrepancy: boolean; baseline_pieces: number | null } {
  if (!timelineJson) return { pieces_discrepancy: false, baseline_pieces: null };

  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return { pieces_discrepancy: false, baseline_pieces: null };

    // Events come in DESC order (newest first), reverse for chronological
    const chronological = [...events].reverse();

    // Extract pieces from each event's description/details
    const eventsWithPieces: Array<{ pieces: number; isDelivery: boolean; index: number }> = [];
    for (let i = 0; i < chronological.length; i++) {
      const ev = chronological[i];
      // Timeline events use capitalized keys: Description, Timestamp, Location, Carrier
      const desc = ev.Description || ev.description || ev.details || ev.title || '';
      const pieces = extractPieces(desc);
      if (pieces !== null) {
        eventsWithPieces.push({ pieces, isDelivery: isDeliveryEvent(ev), index: i });
      }
    }

    if (eventsWithPieces.length < 2) return { pieces_discrepancy: false, baseline_pieces: eventsWithPieces[0]?.pieces || null };

    const baseline = eventsWithPieces[0].pieces;
    let hasDiscrepancy = false;

    for (let i = 1; i < eventsWithPieces.length; i++) {
      if (eventsWithPieces[i].pieces !== baseline) {
        hasDiscrepancy = true;
        break;
      }
    }

    if (!hasDiscrepancy) return { pieces_discrepancy: false, baseline_pieces: baseline };

    // Check if last event is delivery with correct count
    const lastWithPieces = eventsWithPieces[eventsWithPieces.length - 1];
    if (lastWithPieces.isDelivery && lastWithPieces.pieces === baseline) {
      return { pieces_discrepancy: false, baseline_pieces: baseline };
    }

    return { pieces_discrepancy: true, baseline_pieces: baseline };
  } catch (_e) {
    return { pieces_discrepancy: false, baseline_pieces: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json();
    const { search } = body;

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

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} for fetch-status-aereo (t_aereo_ws primary)`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // ========== PASSO 1: Buscar snapshots mais recentes de t_aereo_ws ==========
    let wsQuery: string;
    let wsParams: string[] = [];

    const baseWsQuery = `
      SELECT w.id, w.awb, w.last_status_code, w.last_status_description,
             w.origin, w.destination, w.last_flight, w.scraped_at,
             w.sidebar_days_in_transit, w.timeline_json
      FROM ${database}.t_aereo_ws w
      INNER JOIN (
        SELECT awb, MAX(id) as max_id
        FROM ${database}.t_aereo_ws
        GROUP BY awb
      ) latest ON w.id = latest.max_id
    `;

    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      wsQuery = `${baseWsQuery}
        WHERE (w.awb LIKE ? OR w.last_status_code LIKE ? OR w.last_status_description LIKE ?)
        ORDER BY w.scraped_at DESC
        LIMIT 500`;
      wsParams = [searchPattern, searchPattern, searchPattern];
    } else {
      wsQuery = `${baseWsQuery} ORDER BY w.scraped_at DESC LIMIT 500`;
    }

    console.log('Fetching latest snapshots from t_aereo_ws...');
    const wsRows = await client.query(wsQuery, wsParams);
    const wsList = Array.isArray(wsRows) ? wsRows : [];
    console.log(`Found ${wsList.length} AWBs from t_aereo_ws`);

    if (wsList.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== PASSO 2: Enriquecer com dados de t_master_dados ==========
    const awbsFromWs = wsList.map((r: any) => String(r.awb || '').trim()).filter(Boolean);
    const uniqueAwbs = [...new Set(awbsFromWs)];
    const awbInClause = uniqueAwbs.map(a => `'${a.replace(/'/g, "''")}'`).join(',');

    const masterQuery = `
      SELECT DISTINCT TRIM(mawb) as mawb, TRIM(hawb) as hawb, 
             cliente, nome_analista, email_analista, emails_cliente,
             tipo_processo, tipo_servico
      FROM ${database}.t_master_dados
      WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${awbInClause})
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
      ORDER BY data_insert DESC
    `;

    console.log(`Enriching with t_master_dados for ${uniqueAwbs.length} AWBs...`);
    const masterRows = await client.query(masterQuery);
    const masterList = Array.isArray(masterRows) ? masterRows : [];
    console.log(`Found ${masterList.length} enrichment records from t_master_dados`);

    // Build lookup map: MAWB -> array of master data rows (one per HAWB)
    const masterMultiMap = new Map<string, any[]>();
    const seenHawbs = new Set<string>();
    for (const row of masterList) {
      const mawb = String(row.mawb || '').trim();
      const hawb = String(row.hawb || '').trim();
      const dedupeKey = `${mawb}|${hawb}`;
      if (mawb && !seenHawbs.has(dedupeKey)) {
        seenHawbs.add(dedupeKey);
        if (!masterMultiMap.has(mawb)) {
          masterMultiMap.set(mawb, []);
        }
        masterMultiMap.get(mawb)!.push(row);
      }
    }

    // ========== PASSO 3: Merge em memória + detecção de discrepância ==========
    // For each AWB from t_aereo_ws, create one row per HAWB found in t_master_dados
    const processedRows: any[] = [];
    for (const ws of wsList) {
      const awb = String(ws.awb || '').trim();
      const masters = masterMultiMap.get(awb);

      // Convert scraped_at - remove Z suffix to treat as local time
      let scrapedAt = ws.scraped_at ? String(ws.scraped_at) : null;
      if (scrapedAt) {
        scrapedAt = scrapedAt.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }

      // Detect pieces discrepancy from timeline
      const timelineStr = ws.timeline_json ? String(ws.timeline_json) : null;
      const { pieces_discrepancy, baseline_pieces } = detectPiecesDiscrepancy(timelineStr);

      const baseRow = {
        id: ws.id,
        awb: awb,
        origem: ws.origin || null,
        destino: ws.destination || null,
        último_status: ws.last_status_code || null,
        status_info: ws.last_status_description || null,
        'última atualização': scrapedAt,
        last_flight: ws.last_flight || null,
        days_in_transit: ws.sidebar_days_in_transit || null,
        pieces_discrepancy,
        baseline_pieces,
      };

      if (masters && masters.length > 0) {
        for (const master of masters) {
          processedRows.push({
            ...baseRow,
            hawb: String(master.hawb || '').trim() || null,
            destinatário: master.cliente || null,
            nome_analista: master.nome_analista || null,
            email_analista: master.email_analista || null,
            email_cliente: master.emails_cliente || null,
            tipo_servico: master.tipo_servico || null,
            tipo_processo: master.tipo_processo || null,
          });
        }
      } else {
        // No master data found - still show the AWB
        processedRows.push({
          ...baseRow,
          hawb: null,
          destinatário: null,
          nome_analista: null,
          email_analista: null,
          email_cliente: null,
          tipo_servico: null,
          tipo_processo: null,
        });
      }
    }

    // Debug: log distribution
    const importCount = processedRows.filter((r: any) => r.tipo_processo === 'AIR IMPORT').length;
    const exportCount = processedRows.filter((r: any) => r.tipo_processo === 'AIR EXPORT').length;
    const nullCount = processedRows.filter((r: any) => !r.tipo_processo).length;
    const discrepancyCount = processedRows.filter((r: any) => r.pieces_discrepancy).length;
    console.log(`tipo_processo distribution: IMPORT=${importCount}, EXPORT=${exportCount}, null=${nullCount}`);
    console.log(`Pieces discrepancy detected in ${discrepancyCount} AWBs`);

    return new Response(
      JSON.stringify({ success: true, data: processedRows }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in fetch-status-aereo:', errorMessage);
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
