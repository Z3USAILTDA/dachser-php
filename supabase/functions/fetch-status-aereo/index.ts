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

// Classify ARR status as connection or final destination
function classifyArrival(lastStatusCode: string | null, timelineJson: string | null, destination: string | null, origin: string | null, awbForDebug?: string): string | null {
  if (!lastStatusCode) return lastStatusCode;
  const code = lastStatusCode.trim().toUpperCase();
  if (code !== 'ARR') return lastStatusCode;
  if (!timelineJson || !destination) {
    console.log(`[classifyARR] ${awbForDebug || '?'}: skipping - timeline=${!!timelineJson}, dest=${destination}`);
    return lastStatusCode;
  }

  const dest = destination.trim().toUpperCase();
  if (!dest) return lastStatusCode;
  const orig = (origin || '').trim().toUpperCase();

  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) {
      console.log(`[classifyARR] ${awbForDebug || '?'}: no events array or empty`);
      return lastStatusCode;
    }

    // Helper: try to extract airport code from any string
    function extractAirport(text: string): string | null {
      if (!text) return null;
      const upper = text.trim().toUpperCase();
      if (upper.length === 3 && /^[A-Z]{3}$/.test(upper)) return upper;
      const paren = text.match(/\(([A-Z]{3})\)/i);
      if (paren) return paren[1].toUpperCase();
      const codes = upper.match(/\b([A-Z]{3})\b/g);
      // Filter out common non-airport 3-letter words
      const stopWords = new Set(['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'WAS', 'HAS', 'HAD', 'ALL', 'CAN', 'HER', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'OWN', 'SAY', 'TOO', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'HIM', 'LET', 'PUT', 'RUN', 'USE', 'DAY', 'END', 'KGS', 'PCS', 'QTY']);
      if (codes) {
        for (const c of codes) {
          if (!stopWords.has(c)) return c;
        }
      }
      return null;
    }

    // Helper: extract airport from event object (check all common fields)
    function extractAirportFromEvent(ev: any): string | null {
      // Structured fields first
      const fields = ['station', 'Station', 'airport', 'Airport', 'location', 'Location', 'port', 'Port', 'city', 'City'];
      for (const f of fields) {
        if (ev[f]) {
          const code = extractAirport(String(ev[f]));
          if (code) return code;
        }
      }
      // Description fields
      const descFields = ['Description', 'description', 'title', 'details', 'Details'];
      for (const f of descFields) {
        if (ev[f]) {
          const desc = String(ev[f]);
          // "Arrived at GRU" / "Arrive in VCP"
          const arrMatch = desc.match(/(?:arrived?\s+(?:at|in)\s+)([A-Z]{3})/i);
          if (arrMatch) return arrMatch[1].toUpperCase();
          // "ARR - GRU" or "ARR/GRU"
          const dashMatch = desc.match(/ARR\s*[-\/]\s*([A-Z]{3})/i);
          if (dashMatch) return dashMatch[1].toUpperCase();
        }
      }
      return null;
    }

    // Events come DESC (newest first) – find the first ARR event (most recent)
    for (const ev of events) {
      const evStatus = (ev.status || ev.Status || '').toUpperCase();
      const evDesc = (ev.Description || ev.description || ev.title || '').toUpperCase();
      if (evStatus !== 'ARR' && !evDesc.includes('ARRIVED') && !evDesc.includes('ARR')) continue;

      const airport = extractAirportFromEvent(ev);
      if (airport) {
        const result = airport === dest ? 'ARR - DESTINO' : 'ARR - CONEXAO';
        console.log(`[classifyARR] ${awbForDebug || '?'}: airport=${airport} dest=${dest} => ${result}`);
        return result;
      }

      // Fallback: check ALL values in the event object for airport codes
      const evJson = JSON.stringify(ev).toUpperCase();
      if (evJson.includes(dest)) {
        console.log(`[classifyARR] ${awbForDebug || '?'}: dest ${dest} found in event JSON => ARR - DESTINO`);
        return 'ARR - DESTINO';
      }

      // Found ARR event but couldn't extract airport - use position-based heuristic
      // If this is the LAST status (most recent) and origin != destination, check if any
      // previous event mentions an intermediate airport
      console.log(`[classifyARR] ${awbForDebug || '?'}: ARR event with no airport data, checking heuristic`);
      break; // fall through to heuristic below
    }

    // HEURISTIC FALLBACK: Search entire timeline for destination airport mention
    const fullTimeline = JSON.stringify(events).toUpperCase();
    const destMentioned = fullTimeline.includes(`"${dest}"`) || fullTimeline.includes(` ${dest} `) || fullTimeline.includes(`${dest},`) || fullTimeline.includes(`/${dest}`) || fullTimeline.includes(`-${dest}`);
    
    if (destMentioned) {
      console.log(`[classifyARR] ${awbForDebug || '?'}: dest ${dest} found in timeline => ARR - DESTINO`);
      return 'ARR - DESTINO';
    }

    // If origin and destination are known and different, and dest not in timeline => CONEXAO
    if (orig && orig !== dest) {
      console.log(`[classifyARR] ${awbForDebug || '?'}: dest ${dest} NOT in timeline, orig=${orig} => ARR - CONEXAO`);
      return 'ARR - CONEXAO';
    }

    console.log(`[classifyARR] ${awbForDebug || '?'}: could not classify, returning plain ARR`);
  } catch (_e) {
    console.log(`[classifyARR] ${awbForDebug || '?'}: parse error: ${_e}`);
  }
  return lastStatusCode;
}

// Check if an event is a delivery event
function isDeliveryEvent(event: any): boolean {
  const status = (event.status || '').toUpperCase();
  const desc = (event.Description || event.description || event.title || '').toUpperCase();
  return status === 'DLV' || status === 'DELIVERED' || desc.includes('DELIVERED') || desc.includes('DLV');
}

// Detect pieces discrepancy in timeline
function detectPiecesDiscrepancy(timelineJson: string | null, etdStr?: string | null): { pieces_discrepancy: boolean; baseline_pieces: number | null; has_dis_event: boolean } {
  if (!timelineJson) return { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };

  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };

    // Calculate ETD cutoff: only process events >= ETD - 5 days
    const cutoff = etdStr ? new Date(new Date(etdStr).getTime() - 5 * 24 * 60 * 60 * 1000) : null;

    // Events come in DESC order (newest first), reverse for chronological, then apply ETD filter
    const chronological = [...events].reverse().filter(ev => {
      if (!cutoff) return true;
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || null;
      if (!ts) return true; // sem data, manter por segurança
      return new Date(ts) >= cutoff;
    });

    // Check if any event has DIS status
    let has_dis_event = false;
    for (const ev of chronological) {
      const status = (ev.status || '').toUpperCase();
      const desc = (ev.Description || ev.description || ev.title || '').toUpperCase();
      if (status === 'DIS' || desc.includes('DISCREPANCY') || desc.includes('DIS')) {
        has_dis_event = true;
        break;
      }
    }

    // Extract pieces from each event's description/details
    const eventsWithPieces: Array<{ pieces: number; isDelivery: boolean; index: number }> = [];
    for (let i = 0; i < chronological.length; i++) {
      const ev = chronological[i];
      const desc = ev.Description || ev.description || ev.details || ev.title || '';
      const pieces = extractPieces(desc);
      if (pieces !== null) {
        // Skip "0 pieces offloaded" -- means nothing was removed, not a real count
        const descUpper = desc.toUpperCase();
        if (pieces === 0 && (descUpper.includes('OFFLOAD') || descUpper.includes('OFLD'))) {
          continue;
        }
        eventsWithPieces.push({ pieces, isDelivery: isDeliveryEvent(ev), index: i });
      }
    }

    if (eventsWithPieces.length < 2) return { pieces_discrepancy: false, baseline_pieces: eventsWithPieces[0]?.pieces || null, has_dis_event };

    const baseline = eventsWithPieces[0].pieces;
    let hasDiscrepancy = false;

    for (let i = 1; i < eventsWithPieces.length; i++) {
      if (eventsWithPieces[i].pieces !== baseline) {
        hasDiscrepancy = true;
        break;
      }
    }

    if (!hasDiscrepancy) return { pieces_discrepancy: false, baseline_pieces: baseline, has_dis_event };

    // Check if last event is delivery with correct count
    const lastWithPieces = eventsWithPieces[eventsWithPieces.length - 1];
    if (lastWithPieces.isDelivery && lastWithPieces.pieces === baseline) {
      return { pieces_discrepancy: false, baseline_pieces: baseline, has_dis_event };
    }

    return { pieces_discrepancy: true, baseline_pieces: baseline, has_dis_event };
  } catch (_e) {
    return { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };
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

    // ========== PASSO 1.5: Fallback via t_aereo_api para AWBs sem dados ==========
    const invalidStatuses = new Set(['', 'N/A', 'NOT_FOUND', 'ERRO', 'UNK']);
    // Known error phrases in timeline that indicate bad/unusable data
    const timelineErrorPhrases = [
      'não foi possível detectar',
      'unable to detect',
      'envie-me o número',
      'send me the tracking number',
      'adicionarei suporte',
      'add support for',
    ];
    const awbsSemDados: string[] = [];
    const apiFallbackMap = new Map<string, any>(); // mawb -> api row

    function isTimelineError(timelineJson: string | null): boolean {
      if (!timelineJson) return false;
      const lower = String(timelineJson).toLowerCase();
      return timelineErrorPhrases.some(phrase => lower.includes(phrase));
    }

    for (const ws of wsList) {
      const status = (ws.last_status_code || '').trim().toUpperCase();
      const needsFallback = invalidStatuses.has(status) || !ws.last_status_code || isTimelineError(ws.timeline_json);
      if (needsFallback) {
        const awb = String(ws.awb || '').trim();
        if (awb) awbsSemDados.push(awb);
      }
    }

    if (awbsSemDados.length > 0) {
      const uniqueSemDados = [...new Set(awbsSemDados)];
      const semDadosClause = uniqueSemDados.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
      const apiQuery = `
        SELECT mawb, hawb, destinatario, nome_analista, email_analista,
               emaill_cliente, tipo_servico, ultimo_status, origem, destino,
               historico_status
        FROM ${database}.t_aereo_api
        WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${semDadosClause})
          AND ultimo_status IS NOT NULL
          AND ultimo_status != 'N/A'
        ORDER BY id DESC
      `;
      console.log(`Fallback: buscando ${uniqueSemDados.length} AWBs sem dados na t_aereo_api...`);
      const apiRows = await client.query(apiQuery);
      const apiList = Array.isArray(apiRows) ? apiRows : [];
      console.log(`Fallback: encontrados ${apiList.length} registros na t_aereo_api`);

      // Build map (keep first = most recent due to ORDER BY id DESC)
      for (const row of apiList) {
        const mawb = String(row.mawb || '').trim();
        if (mawb && !apiFallbackMap.has(mawb)) {
          apiFallbackMap.set(mawb, row);
        }
      }

      // Overwrite ws records with api data
      for (const ws of wsList) {
        const awb = String(ws.awb || '').trim();
        const apiRow = apiFallbackMap.get(awb);
        if (!apiRow) continue;
        const status = (ws.last_status_code || '').trim().toUpperCase();
        const needsFallback = invalidStatuses.has(status) || !ws.last_status_code || isTimelineError(ws.timeline_json);
        if (needsFallback) {
          ws.last_status_code = apiRow.ultimo_status || null;
          ws.last_status_description = apiRow.ultimo_status || null;
          ws.origin = apiRow.origem || ws.origin || null;
          ws.destination = apiRow.destino || ws.destination || null;
          ws.timeline_json = apiRow.historico_status || null;
          ws._apiFallback = apiRow;
          ws._source = 'api';
        }
      }
      console.log(`Fallback: ${apiFallbackMap.size} AWBs enriquecidos via t_aereo_api`);
    }

    // ========== PASSO 2: Enriquecer com dados de t_master_dados ==========
    const awbsFromWs = wsList.map((r: any) => String(r.awb || '').trim()).filter(Boolean);
    const uniqueAwbs = [...new Set(awbsFromWs)];
    const awbInClause = uniqueAwbs.map(a => `'${a.replace(/'/g, "''")}'`).join(',');

    const masterQuery = `
      SELECT DISTINCT TRIM(mawb) as mawb, TRIM(hawb) as hawb, 
             cliente, nome_analista, email_analista, emails_cliente,
             tipo_processo, tipo_servico, etd
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

      // Detect pieces discrepancy from timeline (filtered by ETD cutoff)
      const timelineStr = ws.timeline_json ? String(ws.timeline_json) : null;
      const etdForDiscrepancy = masters && masters.length > 0 ? (masters[0].etd || null) : null;
      const { pieces_discrepancy, baseline_pieces, has_dis_event } = detectPiecesDiscrepancy(timelineStr, etdForDiscrepancy);

      // Classify ARR as connection or final destination
      const rawStatus = ws.last_status_code ? String(ws.last_status_code).trim() : null;
      const classifiedStatus = classifyArrival(rawStatus, timelineStr, ws.destination ? String(ws.destination).trim() : null, ws.origin ? String(ws.origin).trim() : null, awb);

      const baseRow = {
        id: ws.id,
        awb: awb,
        origem: ws.origin || null,
        destino: ws.destination || null,
        último_status: classifiedStatus || null,
        status_info: ws.last_status_description || null,
        'última atualização': scrapedAt,
        last_flight: ws.last_flight || null,
        days_in_transit: ws.sidebar_days_in_transit || null,
        pieces_discrepancy,
        baseline_pieces,
        has_dis_event,
      };

      // If this AWB was enriched via t_aereo_api fallback, use that data directly
      const apiFb = ws._apiFallback;
      if (apiFb) {
        processedRows.push({
          ...baseRow,
          source: 'api',
          hawb: String(apiFb.hawb || '').trim() || null,
          destinatário: apiFb.destinatario || null,
          nome_analista: apiFb.nome_analista || null,
          email_analista: apiFb.email_analista || null,
          email_cliente: apiFb.emaill_cliente || null,
          tipo_servico: apiFb.tipo_servico || null,
          tipo_processo: null,
        });
      } else if (masters && masters.length > 0) {
        for (const master of masters) {
          processedRows.push({
            ...baseRow,
            source: 'ws',
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
        processedRows.push({
          ...baseRow,
          source: 'ws',
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
