import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createConnection } from "npm:mysql2@3.11.3/promise";

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

// De-para: resolve status inspecionando a timeline_json
// Sempre ordena eventos por data DESC antes de iterar (garante evento mais recente primeiro,
// independentemente da ordem de armazenamento no JSON)
// Helper para parsear datas em português e inglês (shared between resolve and detect)
function parseFlexibleDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const ptMonths: Record<string, string> = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
  };
  const direct = new Date(dateStr);
  if (!isNaN(direct.getTime())) return direct;
  const match = dateStr.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[\s-]+(\d{4})(?:\s+(\d{2}:\d{2}))?/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const year = match[3];
    const time = match[4] || '00:00';
    const month = ptMonths[monthStr] || null;
    if (month) return new Date(`${year}-${month}-${day}T${time}:00`);
  }
  return null;
}

function resolveUnkFromTimeline(timelineJson: string | null, awbForDebug?: string, etdStr?: string | null): string | null {
  if (!timelineJson) return null;

  // Mapeamento de código de status bruto → código IATA
  const statusMap: Record<string, string> = {
    'DLV': 'DLV', 'DELIVERED': 'DLV',
    'DEP': 'DEP', 'DEPARTED': 'DEP',
    'ARR': 'ARR', 'ARRIVED': 'ARR',
    'RCF': 'RCF', 'RECEIVED FROM FLIGHT': 'RCF',
    'RCS': 'RCS', 'RECEIVED FROM SHIPPER': 'RCS',
    'MAN': 'MAN', 'MANIFESTED': 'MAN',
    'NFD': 'NFD', 'NOTIFIED FOR DELIVERY': 'NFD',
    // AWD e variantes (incluindo AWA = Air China "Documents Available")
    'AWD': 'AWD', 'AWA': 'AWD', 'AWAITING DELIVERY': 'AWD', 'AVAILABLE FOR DELIVERY': 'AWD',
    'DIS': 'DIS', 'DISCREPANCY': 'DIS',
    'OFLD': 'OFLD', 'OFFLOADED': 'OFLD',
    'NIL': 'NIL',
    'FOH': 'FOH', 'FREIGHT ON HAND': 'FOH',
    'BKD': 'BKD', 'BOOKED': 'BKD',
    'PRE': 'PRE', 'PRE-ADVISED': 'PRE',
    'TFD': 'TFD', 'TRANSFERRED': 'TFD',
    'FFM': 'FFM',
    'AUD': 'AUD',
    'RCT': 'RCT',
  };

  // Known IATA codes for extraction from description prefix (e.g. "DIS - GRU, ...")
  const knownIataCodes = ['DEP', 'ARR', 'RCF', 'DLV', 'NFD', 'MAN', 'BKD', 'RCS', 'DIS', 'NIL', 'OFLD', 'FOH', 'TRM', 'PRE', 'AWD', 'CCD', 'TGC', 'DDL', 'AWR', 'POD', 'TFD', 'RCT', 'RCP', 'LOF', 'TDE', 'ASN', 'MIS', 'TFS', 'BKF', 'FWB', 'CAN', 'NIF'];

  // Extract IATA code from description string (mirrors extractStatusCode in mariadb-proxy)
  function extractIataFromDesc(description: string): string | null {
    if (!description) return null;
    const upper = description.trim().toUpperCase();
    // Check parenthesized code: "(AWA)", "(DIS)"
    const parenMatch = description.match(/\(([A-Z]{2,5})\)/);
    if (parenMatch && knownIataCodes.includes(parenMatch[1].toUpperCase())) {
      return statusMap[parenMatch[1].toUpperCase()] || parenMatch[1].toUpperCase();
    }
    // Check if description starts with a known code: "DIS - GRU" or "DEP" or "DIS,"
    for (const code of knownIataCodes) {
      if (upper.startsWith(code + ' ') || upper.startsWith(code + '-') || upper.startsWith(code + ',') || upper === code) {
        return statusMap[code] || code;
      }
    }
    return null;
  }

  // Regex para extrair código IATA de descrições livres (full-word patterns)
  const descPatterns: Array<[RegExp, string]> = [
    [/\bdelivered\b/i, 'DLV'],
    [/^\(AWA\)/i, 'AWD'],
    [/\bdocuments?\s+available\b/i, 'AWD'],
    [/\barrived?\b/i, 'ARR'],
    [/\breceived?\s+from\s+flight\b/i, 'RCF'],
    [/\breceived?\s+from\s+shipper\b/i, 'RCS'],
    [/\bmanifested?\b/i, 'MAN'],
    [/\bnotified?\s+for\s+delivery\b/i, 'NFD'],
    [/\bawaitin[g]?\s+delivery\b/i, 'AWD'],
    [/\bavailable\s+for\s+delivery\b/i, 'AWD'],
    [/\bdiscrepancy\b/i, 'DIS'],
    [/\boffloaded?\b/i, 'OFLD'],
    [/\bfreight\s+on\s+hand\b/i, 'FOH'],
    [/\bbookeds?\b|\bbooked\b/i, 'BKD'],
    [/\btransferred?\b/i, 'TFD'],
    [/\bdeparted?\b/i, 'DEP'],
  ];

  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return null;

    // Apply ETD cutoff filter (same as timeline modal) to avoid picking events from previous shipments
    let etdCutoff: Date | null = null;
    if (etdStr) {
      const etdDate = new Date(etdStr);
      if (!isNaN(etdDate.getTime())) {
        const now = new Date();
        etdCutoff = etdDate < now ? etdDate : null;
      }
    }

    // Ordenar eventos por data DESC (mais recente primeiro)
    const sorted = [...events].sort((a, b) => {
      const dateA = a.date || a.Date || a.timestamp || a.Timestamp || a.time || a.datetime || a.dataEvento || '';
      const dateB = b.date || b.Date || b.timestamp || b.Timestamp || b.time || b.datetime || b.dataEvento || '';
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return String(dateB).localeCompare(String(dateA));
    });

    const now = new Date();

    // Filter by ETD cutoff if available, then exclude future predictions
    const filtered = (etdCutoff
      ? sorted.filter(ev => {
          const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
          if (!ts) return true; // sem data, manter por segurança
          const eventDate = parseFlexibleDate(String(ts));
          if (!eventDate) return true;
          return eventDate >= etdCutoff!;
        })
      : sorted
    ).filter(ev => {
      // Exclude future events (predictions, not real statuses)
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
      if (!ts) return true;
      const eventDate = parseFlexibleDate(String(ts));
      if (!eventDate) return true;
      if (eventDate > now) return false;
      if (eventDate.getFullYear() < 2020) return false;
      return true;
    });

    if (filtered.length === 0) return null;

    for (const ev of filtered) {
      const rawStatusField = (ev.status || ev.Status || '').trim();
      const rawStatus = rawStatusField.toUpperCase();
      const rawDesc = (ev.Description || ev.description || ev.title || ev.details || '').trim().toUpperCase();

      // 1. Checar status direto no mapa (exact match)
      if (rawStatus && statusMap[rawStatus]) {
        const resolved = statusMap[rawStatus];
        console.log(`[resolveUNK] ${awbForDebug || '?'}: "${rawStatus}" → ${resolved} (status match${etdCutoff ? ', ETD-filtered' : ''})`);
        return resolved;
      }

      // 2. Extract IATA code from status field (e.g. "Departed MAD", "Manifested UX057")
      if (rawStatusField) {
        const iataFromStatus = extractIataFromDesc(rawStatusField);
        if (iataFromStatus) {
          console.log(`[resolveUNK] ${awbForDebug || '?'}: status "${rawStatusField.substring(0, 30)}" → ${iataFromStatus} (status prefix${etdCutoff ? ', ETD-filtered' : ''})`);
          return iataFromStatus;
        }
        // Also try regex patterns on status field
        for (const [pattern, iata] of descPatterns) {
          if (pattern.test(rawStatusField)) {
            console.log(`[resolveUNK] ${awbForDebug || '?'}: status "${rawStatusField.substring(0, 30)}" → ${iata} (status regex${etdCutoff ? ', ETD-filtered' : ''})`);
            return iata;
          }
        }
      }

      // 3. Checar descrição no mapa (exact match)
      if (rawDesc && statusMap[rawDesc]) {
        const resolved = statusMap[rawDesc];
        console.log(`[resolveUNK] ${awbForDebug || '?'}: desc "${rawDesc.substring(0, 30)}" → ${resolved} (desc map)`);
        return resolved;
      }

      // 4. Extract IATA code from description prefix (e.g. "DIS - GRU, ...")
      const descRaw = ev.Description || ev.description || ev.title || ev.details || '';
      if (descRaw) {
        const iataFromPrefix = extractIataFromDesc(descRaw);
        if (iataFromPrefix) {
          console.log(`[resolveUNK] ${awbForDebug || '?'}: desc "${descRaw.substring(0, 30)}" → ${iataFromPrefix} (prefix extract${etdCutoff ? ', ETD-filtered' : ''})`);
          return iataFromPrefix;
        }

        // 5. Checar descrição com regex (full-word patterns)
        for (const [pattern, iata] of descPatterns) {
          if (pattern.test(descRaw)) {
            console.log(`[resolveUNK] ${awbForDebug || '?'}: desc "${descRaw.substring(0, 30)}" → ${iata} (regex${etdCutoff ? ', ETD-filtered' : ''})`);
            return iata;
          }
        }
      }
    }
  } catch (_e) {
    console.log(`[resolveUNK] ${awbForDebug || '?'}: parse error: ${_e}`);
  }

  return null;
}


// Extract the date of the most recent valid event from the timeline
function extractLastEventDate(timelineJson: string | null, etdStr?: string | null): string | null {
  if (!timelineJson) return null;
  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return null;

    // Apply ETD cutoff (same logic as resolveUnkFromTimeline)
    let etdCutoff: Date | null = null;
    if (etdStr) {
      const etdDate = new Date(etdStr);
      if (!isNaN(etdDate.getTime())) {
        const now = new Date();
        etdCutoff = etdDate < now ? etdDate : null;
      }
    }

    // Sort DESC by date
    const sorted = [...events].sort((a, b) => {
      const dateA = a.date || a.Date || a.timestamp || a.Timestamp || a.time || a.datetime || a.dataEvento || '';
      const dateB = b.date || b.Date || b.timestamp || b.Timestamp || b.time || b.datetime || b.dataEvento || '';
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return String(dateB).localeCompare(String(dateA));
    });

    // Filter by ETD cutoff
    const filtered = etdCutoff
      ? sorted.filter(ev => {
          const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
          if (!ts) return true;
          const eventDate = parseFlexibleDate(String(ts));
          if (!eventDate) return true;
          return eventDate >= etdCutoff!;
        })
      : sorted;

    // Filter out future events
    const now = new Date();
    for (const ev of filtered) {
      const ts = ev.date || ev.Date || ev.timestamp || ev.Timestamp || ev.time || ev.datetime || ev.dataEvento || null;
      if (!ts) continue;
      const eventDate = parseFlexibleDate(String(ts));
      if (!eventDate || isNaN(eventDate.getTime())) continue;
      if (eventDate > now) continue; // skip future dates (predictions)
      if (eventDate.getFullYear() < 2020) continue; // skip clearly invalid dates
      // Skip API events with no valid status (likely predictions)
      const src = (ev.source || ev.fonte || '').toUpperCase();
      if (src === 'API' && !ts) continue;
      return eventDate.toISOString();
    }
  } catch (_e) {
    // ignore parse errors
  }
  return null;
}

// Detect if AWB has had any transit events (DEP, MAN, RCF, ARR) in the current cycle
function detectInTransit(timelineJson: string | null, etdStr?: string | null): boolean {
  if (!timelineJson) return false;
  const TRANSIT_CODES = new Set(['DEP', 'MAN', 'RCF', 'ARR', 'DEPARTED', 'MANIFESTED', 'RECEIVED FROM FLIGHT', 'ARRIVED']);
  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return false;

    // Apply ETD cutoff (same logic as resolveUnkFromTimeline)
    let etdCutoff: Date | null = null;
    if (etdStr) {
      const etdDate = new Date(etdStr);
      if (!isNaN(etdDate.getTime())) {
        const now = new Date();
        etdCutoff = etdDate < now ? etdDate : null;
      }
    }

    const now = new Date();

    for (const ev of events) {
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
      if (ts) {
        const eventDate = parseFlexibleDate(String(ts));
        if (eventDate) {
          // Apply ETD cutoff filter
          if (etdCutoff && eventDate < etdCutoff) continue;
          // Exclude future events (predictions)
          if (eventDate > now) continue;
          if (eventDate.getFullYear() < 2020) continue;
        }
      }

      const rawStatus = (ev.status || ev.Status || '').trim().toUpperCase();
      if (TRANSIT_CODES.has(rawStatus)) return true;

      // Check codigo_evento field (normalized timeline events from mariadb-proxy)
      const codigo = (ev.codigo_evento || '').trim().toUpperCase();
      if (TRANSIT_CODES.has(codigo)) return true;

      // Also check description for transit keywords (strict patterns only)
      const desc = (ev.Description || ev.description || ev.title || '').trim();
      if (desc) {
        // Match "DEP - ", "MAN - ", "RCF - ", "ARR - " (IATA code followed by separator)
        if (/^(DEP|MAN|RCF|ARR)\s*[-–]\s*/i.test(desc)) return true;
        // Match full words in context of actual transit descriptions
        if (/\bdeparted?\s+(from|at)\b/i.test(desc)) return true;
        if (/\bmanifested\s+(on|at|for)\b/i.test(desc)) return true;
        if (/\breceived\s+from\s+flight\b/i.test(desc)) return true;
        if (/\barrived?\s+(at|in)\b/i.test(desc)) return true;
      }
    }
  } catch (_e) {
    // ignore
  }
  return false;
}

// Guard: impede regressão de status mais específico para genérico
// Ex.: "ARR - DESTINO" não deve ser sobrescrito por "ARR"
function isMoreSpecific(current: string, candidate: string): boolean {
  const specificStatuses = ['ARR - DESTINO', 'ARR - CONEXAO'];
  if (specificStatuses.includes(current) && candidate === 'ARR') return false;
  return true;
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

  let client: Awaited<ReturnType<typeof createConnection>> | null = null;

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

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} for fetch-status-aereo (t_aereo_ws_firecrawl primary)`);

    // Retry logic for transient connection timeouts
    const MAX_RETRIES = 2;
    let lastConnError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        client = await createConnection({
          host: host,
          port: port,
          database: database,
          user: dbUser,
          password: dbPassword,
          connectTimeout: 10000, // 10s timeout per attempt
        });
        console.log(`Connected to MariaDB on attempt ${attempt}`);
        lastConnError = null;
        break;
      } catch (connErr) {
        lastConnError = connErr;
        const msg = connErr instanceof Error ? connErr.message : String(connErr);
        console.warn(`Connection attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
        }
      }
    }

    if (!client) {
      const errMsg = lastConnError instanceof Error ? lastConnError.message : String(lastConnError);
      console.error(`All ${MAX_RETRIES} connection attempts failed: ${errMsg}`);
      return new Response(
        JSON.stringify({ success: false, error: `Database connection failed after ${MAX_RETRIES} attempts: ${errMsg}` }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== PASSO 1: Buscar snapshots mais recentes de t_aereo_ws_firecrawl ==========
    let wsQuery: string;
    let wsParams: string[] = [];

    const baseWsQuery = `
      SELECT w.id, w.awb, w.last_status_code, w.last_status_description,
             w.origin, w.destination, w.last_flight, w.scraped_at,
             w.timeline_json
      FROM ${database}.t_aereo_ws_firecrawl w
      INNER JOIN (
        SELECT awb, MAX(id) as max_id
        FROM ${database}.t_aereo_ws_firecrawl
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

    console.log('Fetching latest snapshots from t_aereo_ws_firecrawl...');
    const [wsRows] = await client.query(wsQuery, wsParams) as [any[], any];
    const wsList = Array.isArray(wsRows) ? wsRows : [];
    console.log(`Found ${wsList.length} AWBs from t_aereo_ws_firecrawl`);

    if (wsList.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== PASSO 1.5: Consultar t_aereo_api para TODOS os AWBs ==========
    // t_aereo_api.ultimo_status é a fonte autoritativa quando disponível
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
    const apiFallbackMap = new Map<string, any>(); // mawb -> api row

    function isTimelineError(timelineJson: string | null): boolean {
      if (!timelineJson) return false;
      const lower = String(timelineJson).toLowerCase();
      return timelineErrorPhrases.some(phrase => lower.includes(phrase));
    }

    // Query t_aereo_api for ALL AWBs to get authoritative ultimo_status
    const allAwbsForApi = [...new Set(wsList.map((ws: any) => String(ws.awb || '').trim()).filter(Boolean))];
    if (allAwbsForApi.length > 0) {
      const apiInClause = allAwbsForApi.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
      const apiQuery = `
        SELECT mawb, hawb, destinatario, nome_analista, email_analista,
               emaill_cliente, tipo_servico, ultimo_status, origem, destino,
               historico_status
        FROM ${database}.t_aereo_api
        WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${apiInClause})
          AND ultimo_status IS NOT NULL
          AND ultimo_status != 'N/A'
        ORDER BY id DESC
      `;
      console.log(`Querying t_aereo_api for ${allAwbsForApi.length} AWBs (authoritative status)...`);
      const [apiRows] = await client.query(apiQuery) as [any[], any];
      const apiList = Array.isArray(apiRows) ? apiRows : [];
      console.log(`Found ${apiList.length} records in t_aereo_api`);

      // Build map (keep first = most recent due to ORDER BY id DESC)
      for (const row of apiList) {
        const mawb = String(row.mawb || '').trim();
        if (mawb && !apiFallbackMap.has(mawb)) {
          apiFallbackMap.set(mawb, row);
        }
      }

      // For AWBs that have NO valid ws data, fully overwrite with api data (full fallback)
      for (const ws of wsList) {
        const awb = String(ws.awb || '').trim();
        const apiRow = apiFallbackMap.get(awb);
        if (!apiRow) continue;
        const status = (ws.last_status_code || '').trim().toUpperCase();
        const needsFullFallback = invalidStatuses.has(status) || !ws.last_status_code || isTimelineError(ws.timeline_json);
        if (needsFullFallback) {
          ws.last_status_code = apiRow.ultimo_status || null;
          ws.last_status_description = apiRow.ultimo_status || null;
          ws.origin = apiRow.origem || ws.origin || null;
          ws.destination = apiRow.destino || ws.destination || null;
          ws.timeline_json = apiRow.historico_status || null;
          ws._apiFallback = apiRow;
          ws._source = 'api';
        }
      }
      console.log(`t_aereo_api: ${apiFallbackMap.size} AWBs found, full fallback applied where needed`);
    }

    // ========== PASSO 1.8: Verificar master_changed via t_master_swap_log ==========
    const allAwbsForSwapCheck = wsList.map((r: any) => String(r.awb || '').trim()).filter(Boolean);
    const uniqueAwbsForSwap = [...new Set(allAwbsForSwapCheck)];
    const swapChangedSet = new Set<string>();
    // Mapa: old_mawb → new_mawb (para substituir o AWB antigo pelo novo na resposta)
    const swapReplaceMap = new Map<string, string>();

    if (uniqueAwbsForSwap.length > 0) {
      try {
        const swapInClause = uniqueAwbsForSwap.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
        const [swapRows] = await client.query(`
          SELECT old_mawb, new_mawb, created_at FROM ${database}.t_master_swap_log
          WHERE TRIM(old_mawb) COLLATE utf8mb4_unicode_ci IN (${swapInClause})
             OR TRIM(new_mawb) COLLATE utf8mb4_unicode_ci IN (${swapInClause})
          ORDER BY created_at DESC
        `) as [any[], any];
        const swapList = Array.isArray(swapRows) ? swapRows : [];
        for (const row of swapList) {
          const oldM = String(row.old_mawb || '').trim();
          const newM = String(row.new_mawb || '').trim();
          if (oldM) swapChangedSet.add(oldM);
          if (newM) swapChangedSet.add(newM);
          // Mapear old → new para substituição (primeiro encontrado = mais recente)
          if (oldM && newM && !swapReplaceMap.has(oldM)) {
            swapReplaceMap.set(oldM, newM);
          }
        }
        console.log(`Master swap check: ${swapChangedSet.size} AWBs marked, ${swapReplaceMap.size} AWBs to replace`);
      } catch (swapErr) {
        console.log('Note: t_master_swap_log query failed (table may not exist yet):', swapErr);
      }
    }

    // ========== PASSO 2: Enriquecer com dados de t_master_dados ==========
    const awbsFromWs = allAwbsForSwapCheck;
    const uniqueAwbs = uniqueAwbsForSwap;
    const awbInClause = uniqueAwbs.map(a => `'${a.replace(/'/g, "''")}'`).join(',');

    const masterQuery = `
      SELECT TRIM(mawb) as mawb, TRIM(hawb) as hawb, 
             cliente, nome_analista, email_analista, emails_cliente,
             tipo_processo, tipo_servico, etd, id_olss, data_insert
      FROM ${database}.t_master_dados
      WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${awbInClause})
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
      ORDER BY data_insert DESC
    `;

    console.log(`Enriching with t_master_dados for ${uniqueAwbs.length} AWBs...`);
    const [masterRows] = await client.query(masterQuery) as [any[], any];
    const masterList = Array.isArray(masterRows) ? masterRows : [];
    console.log(`Found ${masterList.length} enrichment records from t_master_dados`);

    // Deduplicate by id_olss (keep newest data_insert), fallback to mawb|hawb
    const olssMap = new Map<string, any>();
    const noOlssDeduped: any[] = [];
    const seenNoOlss = new Set<string>();
    for (const row of masterList) {
      const idOlss = row.id_olss ? String(row.id_olss).trim() : null;
      if (idOlss) {
        const existing = olssMap.get(idOlss);
        if (!existing || (row.data_insert && (!existing.data_insert || new Date(row.data_insert) > new Date(existing.data_insert)))) {
          olssMap.set(idOlss, row);
        }
      } else {
        const mawb = String(row.mawb || '').trim();
        const hawb = String(row.hawb || '').trim();
        const dedupeKey = `${mawb}|${hawb}`;
        if (!seenNoOlss.has(dedupeKey)) {
          seenNoOlss.add(dedupeKey);
          noOlssDeduped.push(row);
        }
      }
    }
    const dedupedMasterList = [...olssMap.values(), ...noOlssDeduped];
    console.log(`After id_olss dedup: ${dedupedMasterList.length} records (from ${masterList.length})`);

    // Build lookup map: MAWB -> array of master data rows (one per HAWB)
    const masterMultiMap = new Map<string, any[]>();
    for (const row of dedupedMasterList) {
      const mawb = String(row.mawb || '').trim();
      if (mawb) {
        if (!masterMultiMap.has(mawb)) {
          masterMultiMap.set(mawb, []);
        }
        masterMultiMap.get(mawb)!.push(row);
      }
    }

    // ========== PASSO 3: Merge em memória + detecção de discrepância ==========
    // For each AWB from t_aereo_ws_firecrawl, create one row per HAWB found in t_master_dados
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

      // Derive status: PREFER t_aereo_api.ultimo_status (authoritative), then timeline, then ws.last_status_code
      const rawStatus = ws.last_status_code ? String(ws.last_status_code).trim() : null;
      const rawStatusUpper = (rawStatus || '').toUpperCase();
      const awbPrefix = awb.substring(0, 3);
      const destForClassify = ws.destination ? String(ws.destination).trim() : null;
      const origForClassify = ws.origin ? String(ws.origin).trim() : null;
      const etdForTimeline = etdForDiscrepancy; // same ETD used for pieces discrepancy

      // Check if t_aereo_api has an authoritative status for this AWB
      const apiRow = apiFallbackMap.get(awb);
      const apiStatus = apiRow ? String(apiRow.ultimo_status || '').trim().toUpperCase() : null;
      const apiStatusValid = apiStatus && !invalidStatuses.has(apiStatus) && apiStatus !== 'UNK';

      // Timeline status (for cases where API status is not available)
      const timelineStatus = resolveUnkFromTimeline(timelineStr, awb, etdForTimeline);

      let finalStatus: string | null;

      if (apiStatusValid) {
        // t_aereo_api.ultimo_status is the authoritative source — use it directly
        finalStatus = classifyArrival(apiStatus!, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[apiPrimary] ${awb}: t_aereo_api.ultimo_status="${apiStatus}" → "${finalStatus}"`);
      } else if (timelineStatus) {
        // No API status — use timeline-derived status
        finalStatus = classifyArrival(timelineStatus, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[timelineFallback] ${awb}: timeline="${timelineStatus}" → "${finalStatus}"`);
      } else if (rawStatus && !invalidStatuses.has(rawStatusUpper) && rawStatusUpper !== 'UNK') {
        // No timeline status — fall back to DB last_status_code from t_aereo_ws_firecrawl
        finalStatus = classifyArrival(rawStatus, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[wsFallback] ${awb}: ws.last_status_code="${rawStatus}" → "${finalStatus}"`);
      } else {
        finalStatus = rawStatus;
        console.log(`[noSource] ${awb}: no valid status from api/timeline/ws, raw="${rawStatus}"`);
      }

      // Re-classificar ARR genérico para determinar CONEXAO/DESTINO
      if (finalStatus && finalStatus.toUpperCase() === 'ARR') {
        const reclassified = classifyArrival(finalStatus, timelineStr, destForClassify, origForClassify, awb);
        if (reclassified && reclassified !== finalStatus) {
          console.log(`[reClassify] ${awb}: ARR → ${reclassified} (post-resolve)`);
          finalStatus = reclassified;
        }
      }

      // Se o AWB tem swap, substituir pelo novo master
      const replacedAwb = swapReplaceMap.get(awb) || awb;
      const wasSwapped = swapReplaceMap.has(awb);

      const baseRow = {
        id: ws.id,
        awb: replacedAwb,
        awb_original: wasSwapped ? awb : null,
        origem: ws.origin || null,
        destino: ws.destination || null,
        último_status: finalStatus || null,
        status_info: ws.last_status_description || null,
        'última atualização': scrapedAt,
        last_flight: ws.last_flight || null,
        days_in_transit: (() => {
          // Compute days in transit from ETD to now (or to delivered date)
          const etd = masters && masters.length > 0 ? masters[0].etd : null;
          if (!etd) return null;
          const etdDate = new Date(etd);
          if (isNaN(etdDate.getTime())) return null;
          const now = new Date();
          const diffMs = now.getTime() - etdDate.getTime();
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          return days >= 0 ? days : null;
        })(),
        pieces_discrepancy,
        baseline_pieces,
        has_dis_event,
        master_changed: swapChangedSet.has(awb) || wasSwapped,
        in_transit: (() => {
          const PRE_TRANSIT_STATUSES = new Set(['BKD', 'RCS', 'NEW', 'BOO', 'BOOKED', 'UNK', 'NIL', 'NIF', 'NOT_FOUND']);
          const resolvedUpper = (finalStatus || '').toUpperCase();
          // If the resolved status is a pre-transit code, never mark as in_transit
          if (PRE_TRANSIT_STATUSES.has(resolvedUpper)) return false;
          return detectInTransit(timelineStr, etdForTimeline) || 
            (apiRow?.historico_status 
              ? detectInTransit(
                  typeof apiRow.historico_status === 'string' 
                    ? apiRow.historico_status 
                    : JSON.stringify(apiRow.historico_status), 
                  etdForTimeline
                ) 
              : false);
        })(),
        last_event_date: extractLastEventDate(timelineStr, etdForTimeline) || 
          (apiRow?.historico_status 
            ? extractLastEventDate(
                typeof apiRow.historico_status === 'string' 
                  ? apiRow.historico_status 
                  : JSON.stringify(apiRow.historico_status), 
                etdForTimeline
              ) 
            : null),
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

    // ========== FILTRO DE VISIBILIDADE ==========
    // 1. Remover DLV/DELIVERED
    // 2. ARR - DESTINO: manter por 5 dias após última atualização, depois ocultar
    const now = Date.now();
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

    const visibleRows = processedRows.filter((row: any) => {
      const status = (row['último_status'] || '').toUpperCase().trim();

      // 1. Nunca mostrar DLV
      if (status === 'DLV' || status === 'DELIVERED') return false;

      // 2. ARR - DESTINO: manter por 5 dias
      if (status === 'ARR - DESTINO') {
        const updatedAt = row['última atualização'];
        if (!updatedAt) return true; // sem data, manter por segurança
        const updatedTime = new Date(updatedAt).getTime();
        if (isNaN(updatedTime)) return true;
        return (now - updatedTime) <= FIVE_DAYS_MS;
      }

      return true;
    });

    const filteredOut = processedRows.length - visibleRows.length;
    if (filteredOut > 0) {
      console.log(`Visibility filter: removed ${filteredOut} rows (DLV or expired ARR-DESTINO)`);
    }

    return new Response(
      JSON.stringify({ success: true, data: visibleRows }),
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
      await client.end();
    }
  }
});
