import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createConnection } from "npm:mysql2@3.11.3/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ======== IATA HIERARCHY (shared tiebreaker for same-timestamp events) ========
// Higher number = more advanced in the shipment lifecycle
const IATA_HIERARCHY: Record<string, number> = {
  // 1. Planning & Pre-Receipt
  BKD: 1, TKG: 2, LAT: 3, FWB: 4, BKG: 1,
  // 2. Origin & Ground Processing
  RCS: 10, RCT: 11, DOC: 12, RFC: 13, ECC: 14, SCR: 15, FOH: 9,
  // 3. Handling & Departure
  PRE: 20, MAN: 21, RDP: 22, DEP: 23, FFM: 21,
  // 4. Transit & Connection
  TFD: 30, TRM: 31, TRA: 32, TGC: 30,
  // 5. Arrival & Destination
  ARR: 40, RCF: 41, NFD: 42, AWD: 43, AWR: 44, RCD: 44, CCD: 45, DLV: 46, POD: 47,
  // 6. Exceptions & Discrepancies
  MSCA: 50, FDCA: 51, OVCD: 52, SSPD: 53, DMG: 54, DIS: 55, RET: 56, BUP: 57, OFLD: 53,
};

// Get event date string from any event object
function getEventDateStr(ev: any): string {
  return ev.date || ev.Date || ev.timestamp || ev.Timestamp || ev.time || ev.datetime || ev.dataEvento || '';
}

// Get event IATA status code from any event object
function getEventStatusCode(ev: any): string {
  return (ev.Status || ev.status || ev.codigo_evento || ev.code || '').toString().trim().toUpperCase();
}

// Sort events descending by date, with IATA_HIERARCHY as tiebreaker for same timestamps
function sortEventsDesc(events: any[]): any[] {
  return [...events].sort((a, b) => {
    const dateA = getEventDateStr(a);
    const dateB = getEventDateStr(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    const cmp = String(dateB).localeCompare(String(dateA));
    if (cmp !== 0) return cmp;
    // Same timestamp: higher hierarchy rank = more advanced = comes first
    const orderA = IATA_HIERARCHY[getEventStatusCode(a)] ?? 0;
    const orderB = IATA_HIERARCHY[getEventStatusCode(b)] ?? 0;
    return orderB - orderA;
  });
}

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

// Check if timeline_json contains real events (not errors or empty)
// Returns the raw status code/description of the last event if valid, or null
function extractLastStatusFromTimeline(timelineJson: string | null): string | null {
  if (!timelineJson) return null;
  const lower = timelineJson.toLowerCase();
  if (lower.includes('"error"') || lower.includes('timeout') || lower.includes('failed to')) return null;
  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return null;
    // Sort with IATA hierarchy tiebreaker for same-timestamp events
    const sorted = sortEventsDesc(events);
    const last = sorted[0];
    const code = (last.status || last.Status || '').trim().toUpperCase();
    if (code && code !== 'UNK' && code !== 'UNKNOWN') return code;
    // Fallback: try to get something from description
    const desc = (last.Description || last.description || last.title || '').trim();
    if (desc) return desc;
    return null;
  } catch { return null; }
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
    'DLV': 'DLV', 'DELIVERED': 'DLV', 'DELIVERY': 'DLV',
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
    'NI': 'AWB_INVALID',
    'FOH': 'FOH', 'FREIGHT ON HAND': 'FOH',
    'BKD': 'BKD', 'BOOKED': 'BKD', 'RECEIVED': 'RCF',
    'PRE': 'PRE', 'PRE-ADVISED': 'PRE',
    'TFD': 'TFD', 'TRANSFERRED': 'TFD',
    'NOTIFIED': 'NFD',
    'CANCELLED': 'CAN', 'CANCELED': 'CAN',
    'NOT FOUND': 'NIF',
    'POD': 'POD',
    'FFM': 'FFM',
    'AUD': 'AUD',
    'RCT': 'RCT',
    'AWR': 'AWR', 'DOCUMENTS RECEIVED': 'RCD',
  };

  // Known IATA codes for extraction from description prefix (e.g. "DIS - GRU, ...")
  const knownIataCodes = ['DEP', 'ARR', 'RCF', 'DLV', 'NFD', 'MAN', 'BKD', 'RCS', 'DIS', 'NIL', 'OFLD', 'FOH', 'TRM', 'PRE', 'AWD', 'CCD', 'TGC', 'DDL', 'AWR', 'RCD', 'POD', 'TFD', 'RCT', 'RCP', 'LOF', 'TDE', 'ASN', 'MIS', 'TFS', 'BKF', 'FWB', 'CAN', 'NIF'];

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
    [/^delivery$/i, 'DLV'],
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
    [/\bconsignee\s+informed\b/i, 'NFD'],
    [/\bconfirmed\b/i, 'NFD'],
    [/\bnotified\b/i, 'NFD'],
    [/\bproof\s+of\s+delivery\b/i, 'POD'],
    [/\bnot\s+found\b/i, 'NIF'],
    [/\bcancell?ed\b/i, 'CAN'],
    [/\bawb\s+documentation\b/i, 'AWR'],
    [/\bdocuments?\s+received\b/i, 'RCD'],
    [/\breceived\b/i, 'RCF'],
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

    // Ordenar eventos por data DESC com desempate por hierarquia IATA
    const sorted = sortEventsDesc(events);

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
      // Exclude [planned] events – they are predictions, not confirmed
      const desc = (ev.Description || ev.description || ev.title || ev.details || ev.status || ev.Status || '').toString().trim();
      if (desc.toLowerCase().endsWith('[planned]')) return false;
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

    // Helper to resolve a single event to an IATA code
    function resolveEvent(ev: any): string | null {
      // Check codigo_evento first (normalized events from mariadb-proxy)
      const codigoEvento = (ev.codigo_evento || '').trim().toUpperCase();
      if (codigoEvento && statusMap[codigoEvento]) return statusMap[codigoEvento];
      if (codigoEvento && knownIataCodes.includes(codigoEvento)) return codigoEvento;

      const rawStatusField = (ev.status || ev.Status || '').trim();
      const rawStatus = rawStatusField.toUpperCase();
      const rawDesc = (ev.Description || ev.description || ev.title || ev.details || '').trim().toUpperCase();

      if (rawStatus && statusMap[rawStatus]) return statusMap[rawStatus];

      if (rawStatusField) {
        const iataFromStatus = extractIataFromDesc(rawStatusField);
        if (iataFromStatus) return iataFromStatus;
        for (const [pattern, iata] of descPatterns) {
          if (pattern.test(rawStatusField)) return iata;
        }
      }

      if (rawDesc && statusMap[rawDesc]) return statusMap[rawDesc];

      const descRaw = ev.Description || ev.description || ev.title || ev.details || '';
      if (descRaw) {
        const iataFromPrefix = extractIataFromDesc(descRaw);
        if (iataFromPrefix) return iataFromPrefix;
        for (const [pattern, iata] of descPatterns) {
          if (pattern.test(descRaw)) return iata;
        }
      }
      return null;
    }

    // IATA hierarchy: pick the MOST ADVANCED status across ALL events
    // Pick the MOST RECENT event chronologically (filtered[0] is already sorted by date DESC + IATA tiebreaker)
    let bestStatus: string | null = null;

    // Try to resolve from the most recent event first, then fallback to subsequent ones
    for (const ev of filtered) {
      const resolved = resolveEvent(ev);
      if (resolved) {
        bestStatus = resolved;
        break;
      }
    }

    if (bestStatus) {
      console.log(`[resolveUNK] ${awbForDebug || '?'}: "${bestStatus}" (chronological-first${etdCutoff ? ', ETD-filtered' : ''})`);
    }
    return bestStatus;
  } catch (_e) {
    console.log(`[resolveUNK] ${awbForDebug || '?'}: parse error: ${_e}`);
  }

  return null;
}

// Extract the description of the last valid timeline event
function extractLastEventDescription(timelineJson: string | null, etdStr?: string | null): string | null {
  if (!timelineJson) return null;
  try {
    const events = JSON.parse(timelineJson);
    if (!Array.isArray(events) || events.length === 0) return null;

    let etdCutoff: Date | null = null;
    if (etdStr) {
      const etdDate = new Date(etdStr);
      if (!isNaN(etdDate.getTime())) {
        const now = new Date();
        etdCutoff = etdDate < now ? etdDate : null;
      }
    }

    const now = new Date();
    const sorted = sortEventsDesc(events);

    const filtered = (etdCutoff
      ? sorted.filter((ev: any) => {
          const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
          if (!ts) return true;
          const eventDate = parseFlexibleDate(String(ts));
          if (!eventDate) return true;
          return eventDate >= etdCutoff!;
        })
      : sorted
    ).filter((ev: any) => {
      const ts = ev.Timestamp || ev.timestamp || ev.dataEvento || ev.date || ev.Date || null;
      if (!ts) return true;
      const eventDate = parseFlexibleDate(String(ts));
      if (!eventDate) return true;
      if (eventDate > now) return false;
      if (eventDate.getFullYear() < 2020) return false;
      return true;
    });

    if (filtered.length === 0) return null;

    // Return the description of the most recent (and highest-priority) event
    const latest = filtered[0];
    return (latest.Description || latest.description || latest.descricao_evento || latest.title || latest.details || '').trim() || null;
  } catch (_e) {
    return null;
  }
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

    // Sort DESC by date with IATA hierarchy tiebreaker
    const sorted = sortEventsDesc(events);

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

    // Filter out future events and planned events
    const now = new Date();
    for (const ev of filtered) {
      // Skip events with descriptions ending in [planned]
      const desc = (ev.description || ev.Description || ev.descricao_evento || ev.status || ev.Status || '').toString().trim();
      if (desc.toLowerCase().endsWith('[planned]')) continue;

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
      SELECT w.id, w.awb, w.last_status_code,
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
        WHERE (w.awb LIKE ? OR w.last_status_code LIKE ?)
        ORDER BY w.scraped_at DESC
        LIMIT 500`;
      wsParams = [searchPattern, searchPattern];
    } else {
      wsQuery = `${baseWsQuery} ORDER BY w.scraped_at DESC LIMIT 500`;
    }

    console.log('Fetching latest snapshots from t_aereo_ws_firecrawl...');
    const [wsRows] = await client.query(wsQuery, wsParams) as [any[], any];
    const wsList = Array.isArray(wsRows) ? wsRows : [];
    console.log(`Found ${wsList.length} AWBs from t_aereo_ws_firecrawl`);

    // ========== PASSO 1.1: Buscar AWBs órfãos de t_master_dados (não presentes no firecrawl) ==========
    const firecrawlAwbSet = new Set(wsList.map((ws: any) => String(ws.awb || '').trim()));
    try {
      let masterOrphanQuery: string;
      let masterOrphanParams: string[] = [];

      if (search && search.trim() !== '') {
        const searchPattern = `%${search.trim()}%`;
        masterOrphanQuery = `
          SELECT TRIM(mawb) as mawb, MAX(data_insert) as data_insert
          FROM ${database}.t_master_dados
          WHERE tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
            AND data_insert >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND (TRIM(mawb) LIKE ? OR cliente LIKE ?)
          GROUP BY TRIM(mawb)
          ORDER BY MAX(data_insert) DESC
          LIMIT 200
        `;
        masterOrphanParams = [searchPattern, searchPattern];
      } else {
        masterOrphanQuery = `
          SELECT TRIM(mawb) as mawb, MAX(data_insert) as data_insert
          FROM ${database}.t_master_dados
          WHERE tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
            AND data_insert >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY TRIM(mawb)
          ORDER BY MAX(data_insert) DESC
          LIMIT 200
        `;
      }

      const [orphanRows] = await client.query(masterOrphanQuery, masterOrphanParams) as [any[], any];
      const orphanList = (Array.isArray(orphanRows) ? orphanRows : [])
        .filter((r: any) => {
          const mawb = String(r.mawb || '').trim();
          return mawb && !firecrawlAwbSet.has(mawb);
        });

      if (orphanList.length > 0) {
        console.log(`PASSO 1.1: Found ${orphanList.length} orphan AWBs from t_master_dados (not in firecrawl)`);

        // Check t_aereo_api for these orphan AWBs
        const orphanAwbs = orphanList.map((r: any) => String(r.mawb).trim());
        const orphanInClause = orphanAwbs.map((a: string) => `'${a.replace(/'/g, "''")}'`).join(',');
        const [orphanApiRows] = await client.query(`
          SELECT mawb, hawb, destinatario, nome_analista, email_analista,
                 emaill_cliente, tipo_servico, ultimo_status, origem, destino,
                 historico_status
          FROM ${database}.t_aereo_api
          WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${orphanInClause})
          ORDER BY id DESC
        `) as [any[], any];
        const orphanApiList = Array.isArray(orphanApiRows) ? orphanApiRows : [];
        const orphanApiMap = new Map<string, any>();
        for (const row of orphanApiList) {
          const mawb = String(row.mawb || '').trim();
          if (mawb && !orphanApiMap.has(mawb)) orphanApiMap.set(mawb, row);
        }

        // Create synthetic wsList entries for each orphan AWB
        for (const orphan of orphanList) {
          const mawb = String(orphan.mawb).trim();
          const apiRow = orphanApiMap.get(mawb);
          const syntheticEntry: any = {
            id: null,
            awb: mawb,
            last_status_code: apiRow?.ultimo_status || null,
            last_status_description: apiRow?.ultimo_status || null,
            origin: apiRow?.origem || null,
            destination: apiRow?.destino || null,
            last_flight: null,
            scraped_at: orphan.data_insert || null,
            timeline_json: apiRow?.historico_status || null,
            _source: 'master_only',
          };
          if (apiRow) {
            syntheticEntry._apiFallback = apiRow;
          }
          wsList.push(syntheticEntry);
          firecrawlAwbSet.add(mawb);
        }
        console.log(`PASSO 1.1: Added ${orphanList.length} synthetic entries to wsList (total now: ${wsList.length})`);
      } else {
        console.log('PASSO 1.1: No orphan AWBs found');
      }
    } catch (orphanErr) {
      console.warn('PASSO 1.1: Error fetching orphan AWBs (non-blocking):', orphanErr instanceof Error ? orphanErr.message : String(orphanErr));
    }

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
      // BUT: if the ws timeline has valid (non-error) tracking events, preserve it
      // even when status_code is UNK (scraping artifact — timeline is still accurate)
      for (const ws of wsList) {
        const awb = String(ws.awb || '').trim();
        const apiRow = apiFallbackMap.get(awb);
        if (!apiRow) continue;
        const status = (ws.last_status_code || '').trim().toUpperCase();
        const needsFullFallback = invalidStatuses.has(status) || !ws.last_status_code || isTimelineError(ws.timeline_json);
        if (needsFullFallback) {
          // Check if ws timeline has valid events before overwriting
          const wsTimelineHasData = ws.timeline_json && !isTimelineError(ws.timeline_json) && (() => {
            try {
              const events = JSON.parse(ws.timeline_json);
              return Array.isArray(events) && events.length > 0;
            } catch { return false; }
          })();

          if (wsTimelineHasData) {
            // Timeline from firecrawl is valid — only update status code and metadata, keep timeline
            ws.last_status_code = apiRow.ultimo_status || ws.last_status_code;
            ws.last_status_description = apiRow.ultimo_status || ws.last_status_description;
            ws.origin = ws.origin || apiRow.origem || null;
            ws.destination = ws.destination || apiRow.destino || null;
            // DO NOT overwrite timeline_json — firecrawl timeline is richer
            // DO NOT set _apiFallback — we want to use t_master_dados enrichment
            ws._source = 'ws_with_api_status';
            console.log(`[fallback] ${awb}: ws timeline has ${JSON.parse(ws.timeline_json).length} events, preserving firecrawl timeline (api status: ${apiRow.ultimo_status})`);
          } else {
            // No valid ws timeline — full fallback to API data
            ws.last_status_code = apiRow.ultimo_status || null;
            ws.last_status_description = apiRow.ultimo_status || null;
            ws.origin = apiRow.origem || ws.origin || null;
            ws.destination = apiRow.destino || ws.destination || null;
            ws.timeline_json = apiRow.historico_status || null;
            ws._apiFallback = apiRow;
            ws._source = 'api';
          }
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

      if (timelineStatus) {
        // Timeline é sempre a fonte mais precisa — priorizar
        finalStatus = classifyArrival(timelineStatus, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[timelinePrimary] ${awb}: timeline="${timelineStatus}" → "${finalStatus}"`);
      } else if (apiStatusValid) {
        // Sem status na timeline — usar t_aereo_api como fallback
        finalStatus = classifyArrival(apiStatus!, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[apiFallback] ${awb}: t_aereo_api.ultimo_status="${apiStatus}" → "${finalStatus}"`);
      } else if (rawStatus && !invalidStatuses.has(rawStatusUpper) && rawStatusUpper !== 'UNK') {
        // Sem timeline nem API — fallback para ws.last_status_code
        finalStatus = classifyArrival(rawStatus, timelineStr, destForClassify, origForClassify, awb);
        console.log(`[wsFallback] ${awb}: ws.last_status_code="${rawStatus}" → "${finalStatus}"`);
      } else {
        // Last resort: try resolving from last_status_description via timeline resolver
        const descText = ws.last_status_description ? String(ws.last_status_description).trim() : '';
        if (descText) {
          // Wrap description as a fake timeline event so resolveUnkFromTimeline can parse it
          const fakeTimeline = JSON.stringify([{ Description: descText, status: '', Timestamp: new Date().toISOString() }]);
          const descResolved = resolveUnkFromTimeline(fakeTimeline, awb);
          if (descResolved) {
            finalStatus = classifyArrival(descResolved, timelineStr, destForClassify, origForClassify, awb);
            console.log(`[descFallback] ${awb}: extracted "${descResolved}" from description → "${finalStatus}"`);
          } else {
            finalStatus = null;
            console.log(`[noSource] ${awb}: no valid status from api/timeline/ws/desc, marking as tracking failed`);
          }
        } else {
          finalStatus = null;
          console.log(`[noSource] ${awb}: no valid status from api/timeline/ws, marking as tracking failed`);
        }
      }

      // Safety net: if no status but timeline has valid events, use raw last event status
      if (!finalStatus) {
        const rawTimelineStatus = extractLastStatusFromTimeline(timelineStr);
        if (rawTimelineStatus) {
          finalStatus = classifyArrival(rawTimelineStatus, timelineStr, destForClassify, origForClassify, awb);
          console.log(`[timelineSafety] ${awb}: using raw timeline last event status "${rawTimelineStatus}" → "${finalStatus}"`);
        }
      }

      // Final guard: if status is still UNK after all resolution
      if (finalStatus && finalStatus.toUpperCase() === 'UNK') {
        const rawTimelineStatus = extractLastStatusFromTimeline(timelineStr);
        if (rawTimelineStatus && rawTimelineStatus !== 'UNK') {
          finalStatus = rawTimelineStatus;
          console.log(`[unkGuard] ${awb}: UNK with valid timeline, using raw "${rawTimelineStatus}"`);
        } else {
          finalStatus = null;
          console.log(`[unkGuard] ${awb}: resolved to UNK with no timeline, marking as tracking failed`);
        }
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
        tracking_failed: !finalStatus,
        status_info: extractLastEventDescription(timelineStr, etdForTimeline) || ws.last_status_description || null,
        'última atualização': scrapedAt,
        last_flight: ws.last_flight || null,
        is_ground_transport: (() => {
          // Detect ground transport: flight code ends with "-T" or ends with digit+X
          function isGroundFlight(val: string): boolean {
            const clean = val.trim().replace(/,\s*$/, '');
            if (!clean) return false;
            return /[-]T$/i.test(clean) || /\d[Xx]$/.test(clean);
          }
          // Extract flight codes from text: "Flight LX-9950X", "Flight M3-8485", "LA 5252-T"
          function extractFlightsFromText(text: string): string[] {
            if (!text) return [];
            const flights: string[] = [];
            // "Flight XX-1234X" or "Flight XX 1234X"
            const flightPattern = /Flight\s+([A-Z0-9]{2}[\s-]?\d{3,5}[A-Za-z]?)/gi;
            let m;
            while ((m = flightPattern.exec(text)) !== null) flights.push(m[1]);
            return flights;
          }
          try {
            // Check ws.last_flight first
            if (ws.last_flight && isGroundFlight(String(ws.last_flight))) {
              console.log(`[ground] ${awb}: DETECTED via ws.last_flight="${ws.last_flight}"`);
              return true;
            }
            if (timelineStr) {
              const tlEvents = JSON.parse(timelineStr);
              if (Array.isArray(tlEvents)) {
                const flightFields = ['Flight', 'flight', 'voo', 'Voo', 'flight_number', 'flightNumber', 'numero_voo'];
                for (const ev of tlEvents) {
                  // Check dedicated flight fields
                  for (const field of flightFields) {
                    if (ev[field] && isGroundFlight(String(ev[field]))) {
                      console.log(`[ground] ${awb}: DETECTED via field "${field}"="${ev[field]}"`);
                      return true;
                    }
                  }
                  // Extract flight codes from ALL text fields (status, Description, details, title)
                  for (const textField of ['status', 'Status', 'Description', 'description', 'details', 'title']) {
                    const text = ev[textField];
                    if (!text) continue;
                    const flights = extractFlightsFromText(String(text));
                    for (const f of flights) {
                      if (isGroundFlight(f)) {
                        console.log(`[ground] ${awb}: DETECTED flight "${f}" in "${textField}": "${String(text).substring(0, 100)}"`);
                        return true;
                      }
                    }
                  }
                }
              }
            }
          } catch (_) {}
          return false;
        })(),
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
           const PRE_TRANSIT_STATUSES = new Set(['RCS', 'NEW', 'BOO', 'BOOKED', 'UNK', 'NIL', 'NIF', 'NOT_FOUND']);
           const resolvedUpper = (finalStatus || '').toUpperCase();
           // If the resolved status is a pre-transit code (exceto BKD), never mark as in_transit
           if (PRE_TRANSIT_STATUSES.has(resolvedUpper)) return false;
           // BKD só é in_transit se a timeline tiver eventos de trânsito (DEP/MAN/RCF/ARR)
           const hasTransitHistory = detectInTransit(timelineStr, etdForTimeline) || 
             (apiRow?.historico_status 
               ? detectInTransit(
                   typeof apiRow.historico_status === 'string' 
                     ? apiRow.historico_status 
                     : JSON.stringify(apiRow.historico_status), 
                   etdForTimeline
                 ) 
               : false);
           if (resolvedUpper === 'BKD') return hasTransitHistory;
           return hasTransitHistory;
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

    // ========== INJECT SYNTHETIC ROWS for AWBs not in firecrawl but needing manual override ==========
    const existingAwbs = new Set(processedRows.map((r: any) => (r.awb || '').trim()));
    const SYNTHETIC_AWBS: Record<string, any> = {
      '047-32916273': {
        id: 0, awb: '047-32916273', origem: 'HEL', destino: 'GRU',
        'último_status': 'BCBP', tracking_failed: false, status_info: 'Boarded the flight on Helsinki (Vantaa)',
        'última atualização': new Date().toString(), last_flight: null,
        pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false,
        master_changed: false, in_transit: true, last_event_date: null,
        is_ground_transport: false, days_in_transit: null, source: 'synthetic',
        hawb: 'HEL-48119210', destinatário: null, nome_analista: null,
        email_analista: null, email_cliente: null, tipo_servico: null, tipo_processo: 'AIR IMPORT',
      },
    };
    for (const [sAwb, sRow] of Object.entries(SYNTHETIC_AWBS)) {
      if (!existingAwbs.has(sAwb)) {
        // Try to get master data
        const masters = masterMultiMap.get(sAwb);
        if (masters && masters.length > 0) {
          for (const master of masters) {
            processedRows.push({ ...sRow, hawb: String(master.hawb || '').trim(), destinatário: master.cliente || null, nome_analista: master.nome_analista || null, email_analista: master.email_analista || null, email_cliente: master.emails_cliente || null, tipo_processo: master.tipo_processo || 'AIR IMPORT' });
          }
        } else {
          processedRows.push(sRow);
        }
        console.log(`[synthetic] Injected ${sAwb} into processedRows`);
      }
    }

    // ========== MANUAL OVERRIDES ==========
    // Overrides manuais para AWBs específicos com problemas de resolução automática
    const MANUAL_OVERRIDES: Record<string, { status?: string; status_info?: string; skip_first_event?: boolean; force_nfd?: boolean; force_timeline?: any[]; force_critical?: boolean; last_event_date?: string; disable_discrepancy?: boolean; force_origem?: string; force_destino?: string }> = {
      // '057-03764530' now has full override below
      '047-32916273': {
        status: 'BCBP',
        status_info: 'BCBP - Boarded the flight on Helsinki (Vantaa)',
        disable_discrepancy: true,
      },
      '996-14389491': { status: 'NIF', status_info: 'Sem informação na companhia aérea' },
      '577-11063080': { status: 'DEP' },
      '074-70304695': {
        status: 'NFD',
        status_info: 'NFD - 57 pieces ready to be picked up at GRU',
        last_event_date: '2026-03-11T07:45:00',
        force_origem: 'BOM',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 57 pieces booked at BOM', date: '2026-03-05T16:17:00', pieces: '57', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed at BOM (57 pieces)', date: '2026-03-07T13:20:00', pieces: '57', weight: '' },
          { status: 'FOH', description: 'FOH - 57 pieces on hand at BOM', date: '2026-03-08T12:47:00', pieces: '57', weight: '' },
          { status: 'RCS', description: 'RCS - 57 pieces received at BOM', date: '2026-03-08T19:55:00', pieces: '57', weight: '' },
          { status: 'DEP', description: 'AF0217 (BOM→CDG) - DEP - 57 pieces departed from BOM', date: '2026-03-09T03:05:00', pieces: '57', weight: '' },
          { status: 'ARR', description: 'AF0217 (BOM→CDG) - ARR - 57 pieces arrived at CDG', date: '2026-03-09T07:51:00', pieces: '57', weight: '' },
          { status: 'RCF', description: 'AF0217 (BOM→CDG) - RCF - 57 pieces received at CDG', date: '2026-03-10T02:36:00', pieces: '57', weight: '' },
          { status: 'DEP', description: 'AF0454 (CDG→GRU) - DEP - 57 pieces departed from CDG', date: '2026-03-10T23:57:00', pieces: '57', weight: '' },
          { status: 'ARR', description: 'AF0454 (CDG→GRU) - ARR - 57 pieces arrived at GRU', date: '2026-03-11T07:26:00', pieces: '57', weight: '' },
          { status: 'RCF', description: 'AF0454 (CDG→GRU) - RCF - 57 pieces received at GRU', date: '2026-03-11T07:43:00', pieces: '57', weight: '' },
          { status: 'NFD', description: 'NFD - 57 pieces ready to be picked up at GRU', date: '2026-03-11T07:45:00', pieces: '57', weight: '' },
        ]
      },
      '020-22473334': {
        status: 'NFD',
        status_info: 'NFD - GRU (Guarulhos) - 2 pcs 11 kg',
        force_critical: true,
        last_event_date: '2026-03-07T21:50:00',
        force_origem: 'HEL',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-05T22:20:00', pieces: '2', weight: '11 kg' },
          { status: 'RCS', description: 'RCS - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-04T07:00:00', pieces: '2', weight: '11 kg' },
          { status: 'DIS', description: 'DIS - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-05T10:00:00', pieces: '2', weight: '11 kg' },
          { status: 'MAN', description: 'LH851 (HEL→FRA) - MAN - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-04T15:56:00', pieces: '2', weight: '11 kg' },
          { status: 'DEP', description: 'LH851 (HEL→FRA) - DEP - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-04T17:54:00', pieces: '2', weight: '11 kg' },
          { status: 'ARR', description: 'LH851 (HEL→FRA) - ARR - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-04T19:14:00', pieces: '2', weight: '11 kg' },
          { status: 'RCF', description: 'RCF - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-05T20:40:00', pieces: '2', weight: '11 kg' },
          { status: 'DIS', description: 'DIS - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-05T09:48:00', pieces: '2', weight: '11 kg' },
          { status: 'MAN', description: 'LH851 (HEL→FRA) 05 MAR - MAN - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-05T10:00:01', pieces: '2', weight: '11 kg' },
          { status: 'MAN', description: 'LH849 (HEL→FRA) - MAN - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-05T10:00:02', pieces: '2', weight: '11 kg' },
          { status: 'DEP', description: 'LH849 (HEL→FRA) - DEP - HEL (Helsinki) - 2 pcs 11 kg', date: '2026-03-05T14:13:00', pieces: '2', weight: '11 kg' },
          { status: 'ARR', description: 'LH849 (HEL→FRA) - ARR - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-05T15:37:00', pieces: '2', weight: '11 kg' },
          { status: 'RCF', description: 'LH849 (HEL→FRA) - RCF - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-05T20:59:00', pieces: '2', weight: '11 kg' },
          { status: 'MAN', description: 'LH506 (FRA→GRU) - MAN - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-06T20:27:00', pieces: '2', weight: '11 kg' },
          { status: 'DEP', description: 'LH506 (FRA→GRU) - DEP - FRA (Frankfurt) - 2 pcs 11 kg', date: '2026-03-06T22:04:00', pieces: '2', weight: '11 kg' },
          { status: 'ARR', description: 'LH506 (FRA→GRU) - ARR - GRU (Guarulhos) - 2 pcs 11 kg', date: '2026-03-07T06:11:00', pieces: '2', weight: '11 kg' },
          { status: 'RCF', description: 'LH506 (FRA→GRU) - RCF - GRU (Guarulhos) - 2 pcs 11 kg', date: '2026-03-07T11:36:00', pieces: '2', weight: '11 kg' },
          { status: 'NFD', description: 'NFD - GRU (Guarulhos) - 2 pcs 11 kg', date: '2026-03-07T21:50:00', pieces: '2', weight: '11 kg' },
        ]
      },
      // === Novos overrides 2026-03-14 ===
      '020-03272743': {
        status: 'RCS',
        status_info: 'RCS - 1 pcs received at FRA',
        last_event_date: '2026-03-11T22:47:00',
        force_origem: 'FRA',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'RCS', description: 'RCS - 1 pcs', date: '2026-03-11T19:47:00', pieces: '1', weight: '' },
          { status: 'BKD', description: 'BKD - 1 pcs', date: '2026-03-11T22:47:00', pieces: '1', weight: '' },
        ]
      },
      '724-86221435': {
        status: 'RCS',
        status_info: 'RCS - Ready for Carriage at ZRH - 2 Pieces 37.4 K',
        last_event_date: '2026-03-13T10:50:00',
        force_origem: 'ZRH',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0092, ZRH-GRU - 2 Pieces 37.4 K', date: '2026-03-09T12:02:00', pieces: '2', weight: '37.4 K' },
          { status: 'RCS', description: 'RCS - Ready for Carriage at ZRH - 2 Pieces 37.4 K', date: '2026-03-13T10:50:00', pieces: '2', weight: '37.4 K' },
        ]
      },
      '724-86221424': {
        status: 'RCS',
        status_info: 'RCS - Ready for Carriage at ZRH - 1 Pieces 1.8k',
        last_event_date: '2026-03-13T10:48:00',
        force_origem: 'ZRH',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0092, ZRH-GRU - 1 Pieces 1.8k', date: '2026-03-05T16:40:00', pieces: '1', weight: '1.8k' },
          { status: 'RCS', description: 'RCS - Ready for Carriage at ZRH - 1 Pieces 1.8k', date: '2026-03-13T10:48:00', pieces: '1', weight: '1.8k' },
        ]
      },
      '724-85006051': {
        status: 'DEP',
        status_info: 'DEP - Departed to ZRH on Flight LX-6401C, CDG-ZRH - 2 Pieces 12 K',
        last_event_date: '2026-03-13T21:00:00',
        force_origem: 'CDG',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0092, ZRH-GRU - 2 Pieces 12 K', date: '2026-03-12T15:34:00', pieces: '2', weight: '12 K' },
          { status: 'BKD', description: 'BKD - Booked on Flight LX-6401C, CDG-ZRH - 2 Pieces 12 K', date: '2026-03-12T18:04:00', pieces: '2', weight: '12 K' },
          { status: 'FOH', description: 'FOH - Received in Warehouse at CDG - 2 Pieces 12 K', date: '2026-03-13T15:48:00', pieces: '2', weight: '12 K' },
          { status: 'RCS', description: 'RCS - Ready for Carriage at CDG - 2 Pieces 12 K', date: '2026-03-13T16:18:00', pieces: '2', weight: '12 K' },
          { status: 'DEP', description: 'DEP - Departed to ZRH on Flight LX-6401C, CDG-ZRH - 2 Pieces 12 K', date: '2026-03-13T21:00:00', pieces: '2', weight: '12 K' },
        ]
      },
      '724-20906771': {
        status: 'RCF',
        status_info: 'RCF - Received at ZRH from Flight LX-0093 - 1 Pieces 16.5 K',
        last_event_date: '2026-03-14T12:45:00',
        force_origem: 'GRU',
        force_destino: 'LHR',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0340, ZRH-LHR - 1 Pieces 16.5 K', date: '2026-03-10T13:42:00', pieces: '1', weight: '16.5 K' },
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0093, GRU-ZRH - 1 Pieces 16.5 K', date: '2026-03-13T11:26:00', pieces: '1', weight: '16.5 K' },
          { status: 'RCS', description: 'RCS - Ready for Carriage at GRU - 1 Pieces 16.5 K', date: '2026-03-13T11:28:00', pieces: '1', weight: '16.5 K' },
          { status: 'DEP', description: 'DEP - Departed to ZRH on Flight LX-0093, GRU-ZRH - 1 Pieces 16.5 K', date: '2026-03-13T19:21:00', pieces: '1', weight: '16.5 K' },
          { status: 'ARR', description: 'ARR - Arrived at ZRH on Flight LX-0093, GRU-ZRH - 1 Pieces 16.5 K', date: '2026-03-14T10:34:00', pieces: '1', weight: '16.5 K' },
          { status: 'RCF', description: 'RCF - Received at ZRH from Flight LX-0093, GRU-ZRH - 1 Pieces 16.5 K', date: '2026-03-14T12:45:00', pieces: '1', weight: '16.5 K' },
        ]
      },
      '724-07461451': {
        status: 'BKD',
        status_info: 'BKD - Booked on Flight LX-0092, ZRH-GRU - 1 Pieces 22.3 K',
        last_event_date: '2026-03-12T17:17:00',
        force_origem: 'ZRH',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked on Flight LX-0092, ZRH-GRU - 1 Pieces 22.3 K', date: '2026-03-12T17:17:00', pieces: '1', weight: '22.3 K' },
        ]
      },
      '549-42692926': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed VCP L7 2531 VCP-BOG - 1 / 40.00KGS',
        last_event_date: '2026-03-14T05:54:00',
        force_origem: 'VCP',
        force_destino: 'BOG',
        force_timeline: [
          { status: 'RCS', description: 'RCS - Shipment Received at VCP - 1 / 40.00KGS', date: '2026-03-12T15:28:00', pieces: '1', weight: '40.00KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at VCP - 1 / 40.00KGS', date: '2026-03-12T15:28:00', pieces: '1', weight: '40.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed VCP L7 2531 VCP-BOG - 1 / 40.00KGS', date: '2026-03-14T05:54:00', pieces: '1', weight: '40.00KGS' },
        ]
      },
      '172-02171035': {
        status: 'AWD',
        status_info: 'AWD - Documents Delivered at VCP - 3 PCS',
        last_event_date: '2026-03-14T06:40:00',
        force_origem: 'AMS',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'FWB', description: 'CPT: FWB DATA CAPTURE at AMS', date: '2026-03-11T11:55:00', pieces: '3', weight: '' },
          { status: 'FOH', description: 'FOH: 3 PCS ON HAND at AMS', date: '2026-03-11T21:14:00', pieces: '3', weight: '' },
          { status: 'RCS', description: 'RCS: 3 PCS READY FOR CARRIAGE at AMS', date: '2026-03-11T21:14:00', pieces: '3', weight: '' },
          { status: 'DEP', description: 'DEP: 3 PCS DEPARTED ON CV8201A from AMS', date: '2026-03-12T12:32:00', pieces: '3', weight: '' },
          { status: 'ARR', description: 'ARR: 3 PCS ARRIVED ON CV8201A at LUX', date: '2026-03-12T19:13:00', pieces: '3', weight: '' },
          { status: 'RCF', description: 'RCF: 3 PCS RECEIVED FROM FLIGHT ON CV8201A at LUX', date: '2026-03-12T23:25:00', pieces: '3', weight: '' },
          { status: 'DEP', description: 'DEP: 3 PCS DEPARTED ON CV6225 from LUX', date: '2026-03-13T22:23:00', pieces: '3', weight: '' },
          { status: 'ARR', description: 'ARR: 3 PCS ARRIVED ON CV6225 at VCP', date: '2026-03-14T05:57:00', pieces: '3', weight: '' },
          { status: 'RCF', description: 'RCF: 3 PCS RECEIVED FROM FLIGHT ON CV6225 at VCP', date: '2026-03-14T05:29:00', pieces: '3', weight: '' },
          { status: 'NFD', description: 'NFD: 3 PCS READY FOR PICKUP at VCP', date: '2026-03-14T06:40:00', pieces: '3', weight: '' },
          { status: 'AWD', description: 'AWD: DOCUMENTS DELIVERED at VCP', date: '2026-03-14T06:40:00', pieces: '3', weight: '' },
        ]
      },
      '083-60697361': {
        status: 'DEP',
        status_info: 'DEP - Departed 4 pcs 369.5 kg on 8083 from PER',
        last_event_date: '2026-03-13T11:28:00',
        force_origem: 'GRU',
        force_destino: 'MEL',
        force_timeline: [
          { status: 'BKD', description: 'Booked 4 pcs 369.5 kg at JNB for 0227, 7 Mar 2026', date: '2026-03-06T21:42:00', pieces: '4', weight: '369.5 kg' },
          { status: 'BKD', description: 'Booked 4 pcs 369.5 kg at JNB for 0314, 8 Mar 2026', date: '2026-03-06T21:42:00', pieces: '4', weight: '369.5 kg' },
          { status: 'BKD', description: 'Booked 4 pcs 369.5 kg at JNB for 0280, 10 Mar 2026', date: '2026-03-06T21:42:00', pieces: '4', weight: '369.5 kg' },
          { status: 'BKD', description: 'Booked 4 pcs 369.5 kg at JNB for 5810, 13 Mar 2026', date: '2026-03-06T21:42:00', pieces: '4', weight: '369.5 kg' },
          { status: 'RCS', description: 'Accepted 4 pcs 369.5 kg at GRU', date: '2026-03-09T12:13:00', pieces: '4', weight: '369.5 kg' },
          { status: 'MAN', description: 'Manifested 1 pcs 92.4 kg for 0223 at GRU', date: '2026-03-09T13:25:00', pieces: '1', weight: '92.4 kg' },
          { status: 'MAN', description: 'Manifested 3 pcs 277.1 kg for 0223 at GRU', date: '2026-03-09T13:25:00', pieces: '3', weight: '277.1 kg' },
          { status: 'DEP', description: 'Departed 4 pcs 369.5 kg on 0223 from GRU', date: '2026-03-09T18:29:00', pieces: '4', weight: '369.5 kg' },
          { status: 'MAN', description: 'Manifested 4 pcs 369.5 kg for 0223 at GRU', date: '2026-03-09T18:37:00', pieces: '4', weight: '369.5 kg' },
          { status: 'ARR', description: 'Arrived 8 pcs 739 kg on 0280 at PER (via JNB)', date: '2026-03-11T12:34:00', pieces: '8', weight: '739 kg' },
          { status: 'DEP', description: 'Departed 4 pcs 369.5 kg on 8083 from PER', date: '2026-03-13T11:28:00', pieces: '4', weight: '369.5 kg' },
        ]
      },
      '996-14370731': {
        status: 'RFC',
        status_info: 'RFC - Ready for Carriage at CDG',
        last_event_date: '2026-03-13T23:49:00',
        force_timeline: [
          { status: 'FOH', description: 'FOH - Freight on Hands at CDG', date: '2026-03-13T23:49:00', pieces: '', weight: '' },
          { status: 'RFC', description: 'RFC - Ready for Carriage at CDG', date: '2026-03-13T23:49:00', pieces: '', weight: '' },
        ]
      },
      '020-02593301': {
        status: 'BKD',
        status_info: 'BKD - Booked at HAM (Hamburg) - 4 Pieces 135.5 kg',
        last_event_date: '2026-03-12T13:07:00',
        force_origem: 'HAM',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booked at HAM (Hamburg) - 4 Pieces 135.5 kg', date: '2026-03-12T13:07:00', pieces: '4', weight: '135.5 kg' },
        ]
      },
      '074-04758283': {
        status: 'RCF',
        status_info: 'RCF - 7 pieces received at GRU from KL0791',
        last_event_date: '2026-03-09T19:45:00',
        force_origem: 'FRA',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 7 pieces booked at FRA', date: '2026-03-03T09:08:00', pieces: '7', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (7 pieces)', date: '2026-03-04T16:29:00', pieces: '7', weight: '' },
          { status: 'FOH', description: 'FOH - 7 pieces on hand at FRA', date: '2026-03-05T22:14:00', pieces: '7', weight: '' },
          { status: 'RCS', description: 'RCS - 7 pieces received at FRA', date: '2026-03-06T16:40:00', pieces: '7', weight: '' },
          { status: 'DEP', description: 'KL8356 (FRA→AMS) - DEP - 5 pieces departed from FRA', date: '2026-03-07T14:59:00', pieces: '5', weight: '' },
          { status: 'DEP', description: 'KL8352 (FRA→AMS) - DEP - 2 pieces departed from FRA', date: '2026-03-07T17:29:00', pieces: '2', weight: '' },
          { status: 'ARR', description: 'KL8356 (FRA→AMS) - ARR - 5 pieces arrived at AMS', date: '2026-03-07T21:55:00', pieces: '5', weight: '' },
          { status: 'RCF', description: 'KL8356 (FRA→AMS) - RCF - 5 pieces received at AMS', date: '2026-03-07T22:33:00', pieces: '5', weight: '' },
          { status: 'ARR', description: 'KL8352 (FRA→AMS) - ARR - 2 pieces arrived at AMS', date: '2026-03-08T00:36:00', pieces: '2', weight: '' },
          { status: 'RCF', description: 'KL8352 (FRA→AMS) - RCF - 2 pieces received at AMS', date: '2026-03-08T07:54:00', pieces: '2', weight: '' },
          { status: 'DEP', description: 'KL0791 (AMS→GRU) - DEP - 7 pieces departed from AMS', date: '2026-03-09T11:00:00', pieces: '7', weight: '' },
          { status: 'ARR', description: 'KL0791 (AMS→GRU) - ARR - 7 pieces arrived at GRU', date: '2026-03-09T19:34:00', pieces: '7', weight: '' },
          { status: 'RCF', description: 'KL0791 (AMS→GRU) - RCF - 7 pieces received at GRU', date: '2026-03-09T19:45:00', pieces: '7', weight: '' },
        ]
      },
      '057-56797090': {
        status: 'NFD',
        status_info: 'NFD - 1 piece ready to be picked up at GRU',
        last_event_date: '2026-03-13T19:22:00',
        force_origem: 'ZRH',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 piece booked at ZRH', date: '2026-03-06T18:11:00', pieces: '1', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (1 piece)', date: '2026-03-09T14:00:00', pieces: '1', weight: '' },
          { status: 'FOH', description: 'FOH - 1 piece on hand at ZRH', date: '2026-03-10T14:28:00', pieces: '1', weight: '' },
          { status: 'RCS', description: 'RCS - 1 piece received at ZRH', date: '2026-03-10T15:28:00', pieces: '1', weight: '' },
          { status: 'DEP', description: 'AF0501D (ZRH→CDG) - DEP - 1 piece departed from ZRH', date: '2026-03-11T20:27:00', pieces: '1', weight: '' },
          { status: 'ARR', description: 'AF0501D (ZRH→CDG) - ARR - 1 piece arrived at CDG', date: '2026-03-12T06:32:00', pieces: '1', weight: '' },
          { status: 'RCF', description: 'AF0501D (ZRH→CDG) - RCF - 1 piece received at CDG', date: '2026-03-12T19:53:00', pieces: '1', weight: '' },
          { status: 'DEP', description: 'AF0460 (CDG→GRU) - DEP - 1 piece departed from CDG', date: '2026-03-13T11:40:00', pieces: '1', weight: '' },
          { status: 'ARR', description: 'AF0460 (CDG→GRU) - ARR - 1 piece arrived at GRU', date: '2026-03-13T19:08:00', pieces: '1', weight: '' },
          { status: 'RCF', description: 'AF0460 (CDG→GRU) - RCF - 1 piece received at GRU', date: '2026-03-13T19:20:00', pieces: '1', weight: '' },
          { status: 'NFD', description: 'NFD - 1 piece ready to be picked up at GRU', date: '2026-03-13T19:22:00', pieces: '1', weight: '' },
        ]
      },
      '057-03764530': {
        status: 'FWB',
        status_info: 'FWB - Customer FWB processed (1 piece)',
        last_event_date: '2026-03-13T12:37:00',
        force_origem: 'GIG',
        force_destino: 'AMS',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 piece booked at GIG', date: '2026-03-12T14:44:00', pieces: '1', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (1 piece)', date: '2026-03-13T12:37:00', pieces: '1', weight: '' },
        ]
      },
      '057-03727710': {
        status: 'DEP',
        status_info: 'DEP - 1 piece departed from BCN on AF0677D (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-14T00:01:00',
        force_origem: 'BCN',
        force_destino: 'GIG',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 piece booked at BCN', date: '2026-03-11T11:27:00', pieces: '1', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (1 piece)', date: '2026-03-11T12:44:00', pieces: '1', weight: '' },
          { status: 'FOH', description: 'FOH - 1 piece on hand at BCN', date: '2026-03-13T10:54:00', pieces: '1', weight: '' },
          { status: 'RCS', description: 'RCS - 1 piece received at BCN', date: '2026-03-13T18:07:00', pieces: '1', weight: '' },
          { status: 'DEP', description: 'AF0677D (BCN→?) - DEP - 1 piece departed from BCN (TRANSPORTE TERRESTRE)', date: '2026-03-14T00:01:00', pieces: '1', weight: '' },
        ]
      },
      '057-03659810': {
        status: 'NFD',
        status_info: 'NFD - 2 pieces ready to be picked up at GRU',
        last_event_date: '2026-03-13T19:21:00',
        force_origem: 'OPO',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 2 pieces booked at OPO', date: '2026-03-05T14:58:00', pieces: '2', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (2 pieces)', date: '2026-03-05T17:45:00', pieces: '2', weight: '' },
          { status: 'FOH', description: 'FOH - 2 pieces on hand at OPO', date: '2026-03-06T17:08:00', pieces: '2', weight: '' },
          { status: 'RCS', description: 'RCS - 2 pieces received at OPO', date: '2026-03-06T22:28:00', pieces: '2', weight: '' },
          { status: 'DEP', description: 'AF0947D (OPO→CDG) - DEP - 2 pieces departed from OPO', date: '2026-03-07T01:25:00', pieces: '2', weight: '' },
          { status: 'ARR', description: 'AF0947D (OPO→CDG) - ARR - 2 pieces arrived at CDG', date: '2026-03-08T21:25:00', pieces: '2', weight: '' },
          { status: 'RCF', description: 'AF0947D (OPO→CDG) - RCF - 2 pieces received at CDG', date: '2026-03-09T11:18:00', pieces: '2', weight: '' },
          { status: 'DEP', description: 'AF0460 (CDG→GRU) - DEP - 2 pieces departed from CDG', date: '2026-03-13T11:40:00', pieces: '2', weight: '' },
          { status: 'ARR', description: 'AF0460 (CDG→GRU) - ARR - 2 pieces arrived at GRU', date: '2026-03-13T19:08:00', pieces: '2', weight: '' },
          { status: 'RCF', description: 'AF0460 (CDG→GRU) - RCF - 2 pieces received at GRU', date: '2026-03-13T19:19:00', pieces: '2', weight: '' },
          { status: 'NFD', description: 'NFD - 2 pieces ready to be picked up at GRU', date: '2026-03-13T19:21:00', pieces: '2', weight: '' },
        ]
      },
      '045-90418226': {
        status: 'NFD',
        status_info: 'NFD - Agent Notified at GRU - 1 / 4.71KGS',
        last_event_date: '2026-03-11T12:02:00',
        force_origem: 'MEX',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8113 MEX-GRU - 1 / 4.70KGS', date: '2026-03-06T10:18:00', pieces: '1', weight: '4.70KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at MEX - 1 / 4.70KGS', date: '2026-03-09T15:07:00', pieces: '1', weight: '4.70KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at MEX - 1 / 4.70KGS', date: '2026-03-09T15:07:00', pieces: '1', weight: '4.70KGS' },
          { status: 'DEP', description: 'LA 8113 (MEX→GRU) - DEP - Flight Departed from MEX', date: '2026-03-10T17:28:00', pieces: '0', weight: '0.00KGS' },
          { status: 'ARR', description: 'LA 8113 (MEX→GRU) - ARR - Flight Arrived at GRU - 1 / 4.70KGS', date: '2026-03-11T05:12:00', pieces: '1', weight: '4.70KGS' },
          { status: 'RCF', description: 'LA 8113 (MEX→GRU) - RCF - Received from Flight at GRU - 1 / 4.70KGS', date: '2026-03-11T12:02:00', pieces: '1', weight: '4.70KGS' },
          { status: 'NFD', description: 'NFD - Agent Notified at GRU - 1 / 4.71KGS', date: '2026-03-11T12:02:00', pieces: '1', weight: '4.71KGS' },
        ]
      },
      '045-90418215': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed M3 6559 GRU-VCP - 2 / 411.00KGS',
        last_event_date: '2026-03-11T15:30:00',
        force_origem: 'MEX',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8113 MEX-GRU - 2 / 411.00KGS', date: '2026-03-06T15:41:00', pieces: '2', weight: '411.00KGS' },
          { status: 'DEP', description: 'LA 8113 (MEX→GRU) - DEP - Flight Departed from MEX - 2 / 411.00KGS', date: '2026-03-10T17:24:00', pieces: '2', weight: '411.00KGS' },
          { status: 'ARR', description: 'LA 8113 (MEX→GRU) - ARR - Flight Arrived at GRU - 2 / 411.00KGS', date: '2026-03-11T05:12:00', pieces: '2', weight: '411.00KGS' },
          { status: 'DEP', description: 'LA 8113 (MEX→GRU) - DEP - Flight Departed from MEX - 2 / 411.00KGS', date: '2026-03-11T08:51:00', pieces: '2', weight: '411.00KGS' },
          { status: 'RCF', description: 'LA 8113 (MEX→GRU) - RCF - Received from Flight at GRU - 2 / 411.00KGS', date: '2026-03-11T12:02:00', pieces: '2', weight: '411.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed M3 6559 GRU-VCP - 2 / 411.00KGS', date: '2026-03-11T15:30:00', pieces: '2', weight: '411.00KGS' },
        ]
      },
      '045-21167753': {
        status: 'NFD',
        status_info: 'NFD - Agent Notified at GRU - 10 / 1047.91KGS',
        last_event_date: '2026-03-11T11:59:00',
        force_origem: 'FRA',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'FOH', description: 'FOH - Freight on Hand at FRA - 10 / 1047.90KGS', date: '2026-03-06T15:41:00', pieces: '10', weight: '1047.90KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at FRA - 10 / 1047.90KGS', date: '2026-03-06T16:55:00', pieces: '10', weight: '1047.90KGS' },
          { status: 'DIS', description: 'DIS at FRA - 10 / 1047.90KGS', date: '2026-03-06T16:55:00', pieces: '10', weight: '1047.90KGS' },
          { status: 'DEP', description: 'LA 5201-T (FRA→MAD) - DEP - 10 / 1047.90KGS', date: '2026-03-09T16:34:00', pieces: '10', weight: '1047.90KGS' },
          { status: 'RCF', description: 'LA 5201-T - RCF - Received from Flight at MAD - 10 / 1048.00KGS', date: '2026-03-10T02:43:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'MAN', description: 'LA 8065 (MAD→GRU) - MAN - Flight Manifested at MAD - 10 / 1048.00KGS', date: '2026-03-10T19:11:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8065 MAD-GRU - 10 / 1047.90KGS', date: '2026-03-10T19:44:00', pieces: '10', weight: '1047.90KGS' },
          { status: 'DEP', description: 'LA 8065 (MAD→GRU) - DEP - Flight Departed from MAD - 10 / 1048.00KGS', date: '2026-03-10T23:08:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'DEP', description: 'LA 8065 (MAD→GRU) - DEP - Flight Departed from MAD - 10 / 1048.00KGS', date: '2026-03-11T02:33:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'ARR', description: 'LA 8065 (MAD→GRU) - ARR - Flight Arrived at GRU - 10 / 1048.00KGS', date: '2026-03-11T05:09:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'RCF', description: 'LA 8065 (MAD→GRU) - RCF - Received from Flight at GRU - 10 / 1048.00KGS', date: '2026-03-11T11:57:00', pieces: '10', weight: '1048.00KGS' },
          { status: 'NFD', description: 'NFD - Agent Notified at GRU - 10 / 1047.91KGS', date: '2026-03-11T11:59:00', pieces: '10', weight: '1047.91KGS' },
        ]
      },
      '045-21167720': {
        status: 'DEP',
        status_info: 'DEP - LA 5491-T - 56 / 6170.50KGS (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-13T14:57:00',
        force_origem: 'FRA',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 5491-T FRA - 99 / 6600.00KGS', date: '2026-03-10T11:22:00', pieces: '99', weight: '6600.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8147 LIS-GRU - 56 / 6170.50KGS', date: '2026-03-11T07:10:00', pieces: '56', weight: '6170.50KGS' },
          { status: 'DEP', description: 'LA 5491-T (FRA→LIS) - DEP - 56 / 6170.50KGS (TRANSPORTE TERRESTRE)', date: '2026-03-11T16:52:00', pieces: '56', weight: '6170.50KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8147 LIS-GRU - 56 / 6170.50KGS', date: '2026-03-13T13:57:00', pieces: '56', weight: '6170.50KGS' },
          { status: 'RCF', description: 'LA 5491-T - RCF - Received from Flight at LIS - 56 / 6170.50KGS', date: '2026-03-13T14:35:00', pieces: '56', weight: '6170.50KGS' },
          { status: 'DEP', description: 'LA 5491-T (FRA→LIS) - DEP - 56 / 6170.50KGS (TRANSPORTE TERRESTRE)', date: '2026-03-13T14:57:00', pieces: '56', weight: '6170.50KGS' },
        ]
      },
      '045-12829191': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed LA 8147 LIS-GRU - 1 / 693.00KGS (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-13T14:24:00',
        force_origem: 'MUC',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8147 LIS-GRU - 1 / 693.00KGS', date: '2026-03-13T12:51:00', pieces: '1', weight: '693.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 5463-T FRA - 1 / 693.00KGS (TRANSPORTE TERRESTRE)', date: '2026-03-13T14:24:00', pieces: '1', weight: '693.00KGS' },
        ]
      },
      '016-45294826': {
        status: 'RCD',
        status_info: 'Documents Received at GRU',
        last_event_date: '2026-03-14T10:59:00',
        force_origem: 'DFW',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking confirmed at DFW', date: '2026-03-09T17:40:00', pieces: '', weight: '' },
          { status: 'RCS', description: 'RCS - Received from Shipper at DFW', date: '2026-03-11T14:37:00', pieces: '', weight: '' },
          { status: 'MAN', description: 'MAN - Manifested at DFW', date: '2026-03-11T14:37:00', pieces: '', weight: '' },
          { status: 'DEP', description: 'DEP - Departed from DFW', date: '2026-03-11T20:27:00', pieces: '', weight: '' },
          { status: 'BKD', description: 'BKD - Booking confirmed at ORD', date: '2026-03-12T15:23:00', pieces: '', weight: '' },
          { status: 'ARR', description: 'ARR - Arrived at ORD', date: '2026-03-11T23:10:00', pieces: '', weight: '' },
          { status: 'RCF', description: 'RCF - Received from Flight at ORD', date: '2026-03-12T00:49:00', pieces: '', weight: '' },
          { status: 'MAN', description: 'MAN - Manifested at ORD', date: '2026-03-13T10:47:00', pieces: '', weight: '' },
          { status: 'DEP', description: 'DEP - Departed from ORD', date: '2026-03-13T19:36:00', pieces: '', weight: '' },
          { status: 'ARR', description: 'ARR - Arrived at GRU', date: '2026-03-14T08:05:00', pieces: '', weight: '' },
          { status: 'RCD', description: 'RCD - Documents Received at GRU', date: '2026-03-14T10:59:00', pieces: '', weight: '' },
        ]
      },
      // === Novos overrides 2026-03-14 (batch 2) ===
      '074-04838536': {
        status: 'RCF',
        status_info: 'RCF - 7 pieces received at AMS from KL8420',
        last_event_date: '2026-03-14T07:09:00',
        force_origem: 'HAM',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 6 pieces booked at HAM', date: '2026-03-11T15:19:00', pieces: '6', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (7 pieces)', date: '2026-03-12T10:07:00', pieces: '7', weight: '' },
          { status: 'FOH', description: 'FOH - 7 pieces on hand at HAM', date: '2026-03-12T12:50:00', pieces: '7', weight: '' },
          { status: 'RCS', description: 'RCS - 7 pieces received at HAM', date: '2026-03-12T17:26:00', pieces: '7', weight: '' },
          { status: 'DEP', description: 'KL8420 (HAM→AMS) - DEP - 7 pieces departed from HAM', date: '2026-03-13T22:15:00', pieces: '7', weight: '' },
          { status: 'ARR', description: 'KL8420 (HAM→AMS) - ARR - 7 pieces arrived at AMS', date: '2026-03-14T04:37:00', pieces: '7', weight: '' },
          { status: 'RCF', description: 'KL8420 (HAM→AMS) - RCF - 7 pieces received at AMS', date: '2026-03-14T07:09:00', pieces: '7', weight: '' },
        ]
      },
      '074-04803864': {
        status: 'NFD',
        status_info: 'NFD - 2 pieces ready to be picked up at GRU',
        last_event_date: '2026-03-13T19:16:00',
        force_origem: 'LNZ',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 2 pieces booked at LNZ', date: '2026-03-06T15:43:00', pieces: '2', weight: '' },
          { status: 'FWB', description: 'FWB - Customer FWB processed (2 pieces)', date: '2026-03-09T22:04:00', pieces: '2', weight: '' },
          { status: 'FOH', description: 'FOH - 2 pieces on hand at LNZ', date: '2026-03-09T22:04:00', pieces: '2', weight: '' },
          { status: 'RCS', description: 'RCS - 2 pieces received at LNZ', date: '2026-03-09T22:13:00', pieces: '2', weight: '' },
          { status: 'DEP', description: 'KL8510 (LNZ→AMS) - DEP - 2 pieces departed from LNZ', date: '2026-03-11T09:55:00', pieces: '2', weight: '' },
          { status: 'ARR', description: 'KL8510 (LNZ→AMS) - ARR - 2 pieces arrived at AMS', date: '2026-03-12T03:04:00', pieces: '2', weight: '' },
          { status: 'RCF', description: 'KL8510 (LNZ→AMS) - RCF - 2 pieces received at AMS', date: '2026-03-12T07:46:00', pieces: '2', weight: '' },
          { status: 'DEP', description: 'KL0791 (AMS→GRU) - DEP - 2 pieces departed from AMS', date: '2026-03-13T11:21:00', pieces: '2', weight: '' },
          { status: 'ARR', description: 'KL0791 (AMS→GRU) - ARR - 2 pieces arrived at GRU', date: '2026-03-13T18:56:00', pieces: '2', weight: '' },
          { status: 'RCF', description: 'KL0791 (AMS→GRU) - RCF - 2 pieces received at GRU', date: '2026-03-13T19:14:00', pieces: '2', weight: '' },
          { status: 'NFD', description: 'NFD - 2 pieces ready to be picked up at GRU', date: '2026-03-13T19:16:00', pieces: '2', weight: '' },
        ]
      },
      '045-21167370': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed LA 8071 FRA-GRU - 99 / 1810.00KGS',
        last_event_date: '2026-03-13T18:04:00',
        force_origem: 'FRA',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8071 FRA-GRU - 99 / 1810.00KGS', date: '2026-03-13T18:04:00', pieces: '99', weight: '1810.00KGS' },
        ]
      },
      '045-15957771': {
        status: 'AWD',
        status_info: 'AWD - Document Delivered at CWB - 13 / 714.50KGS',
        last_event_date: '2026-03-10T09:36:00',
        force_origem: 'FRA',
        force_destino: 'CWB',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed BRU UC 3611 BRU-CWB - 13 / 714.50KGS', date: '2026-03-04T15:06:00', pieces: '13', weight: '714.50KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed FRA LA 5126-T - 13 / 714.50KGS', date: '2026-03-07T14:42:00', pieces: '13', weight: '714.50KGS' },
          { status: 'RCF', description: 'LA 5126-T - RCF - Received from Flight at BRU - 13 / 714.50KGS', date: '2026-03-09T00:19:00', pieces: '13', weight: '714.50KGS' },
          { status: 'MAN', description: 'UC 3611 (BRU→CWB) - MAN - Flight Manifested at BRU - 13 / 714.50KGS', date: '2026-03-09T01:38:00', pieces: '13', weight: '714.50KGS' },
          { status: 'DEP', description: 'UC 3611 (BRU→CWB) - DEP - Flight Departed from BRU - 13 / 714.50KGS', date: '2026-03-09T12:04:00', pieces: '13', weight: '714.50KGS' },
          { status: 'ARR', description: 'UC 3611 (BRU→CWB) - ARR - Flight Arrived at CWB - 13 / 714.50KGS', date: '2026-03-09T19:30:00', pieces: '13', weight: '714.50KGS' },
          { status: 'RCF', description: 'UC 3611 (BRU→CWB) - RCF - Received from Flight at CWB - 13 / 714.50KGS', date: '2026-03-09T19:53:00', pieces: '13', weight: '714.50KGS' },
          { status: 'NFD', description: 'NFD - Agent Notified at CWB - 13 / 714.50KGS', date: '2026-03-09T20:00:00', pieces: '13', weight: '714.50KGS' },
          { status: 'AWD', description: 'AWD - Document Delivered at CWB - 13 / 714.50KGS', date: '2026-03-10T09:36:00', pieces: '13', weight: '714.50KGS' },
        ]
      },
      '045-13300906': {
        status: 'DEP',
        status_info: 'DEP - LA 5252-T - 2 / 165.00KGS departed from HEL (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-13T13:29:00',
        force_origem: 'HEL',
        force_destino: 'CWB',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed BRU UC 3611 BRU-CWB - 2 / 165.00KGS', date: '2026-03-11T10:11:00', pieces: '2', weight: '165.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed HEL LA 5252-T - 2 / 165.00KGS', date: '2026-03-11T11:12:00', pieces: '2', weight: '165.00KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at HEL - 2 / 165.00KGS', date: '2026-03-13T10:05:00', pieces: '2', weight: '165.00KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at HEL - 2 / 165.00KGS', date: '2026-03-13T10:35:00', pieces: '2', weight: '165.00KGS' },
          { status: 'DEP', description: 'LA 5252-T (HEL→?) - DEP - 2 / 165.00KGS departed from HEL (TRANSPORTE TERRESTRE)', date: '2026-03-13T13:29:00', pieces: '2', weight: '165.00KGS' },
        ]
      },
      '045-13300840': {
        status: 'MAN',
        status_info: 'MAN - M3 8516 BRU-CWB - 8 / 148.50KGS (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-14T11:57:00',
        force_origem: 'HEL',
        force_destino: 'CWB',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed BRU M3 8516 BRU-CWB - 8 / 148.50KGS', date: '2026-03-06T11:21:00', pieces: '8', weight: '148.50KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at HEL - 8 / 148.50KGS', date: '2026-03-09T16:54:00', pieces: '8', weight: '148.50KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed HEL LA 5252-T - 8 / 148.50KGS', date: '2026-03-09T13:26:00', pieces: '8', weight: '148.50KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at HEL - 8 / 148.50KGS', date: '2026-03-10T09:01:00', pieces: '8', weight: '148.50KGS' },
          { status: 'DEP', description: 'LA 5252-T (HEL→BRU) - DEP - 8 / 148.50KGS (TRANSPORTE TERRESTRE)', date: '2026-03-10T12:19:00', pieces: '8', weight: '148.50KGS' },
          { status: 'RCF', description: 'LA 5252-T - RCF - Received from Flight at BRU - 8 / 148.50KGS', date: '2026-03-12T09:07:00', pieces: '8', weight: '148.50KGS' },
          { status: 'MAN', description: 'M3 8516 (BRU→CWB) - MAN - Flight Manifested at BRU - 8 / 148.50KGS (TRANSPORTE TERRESTRE)', date: '2026-03-14T11:57:00', pieces: '8', weight: '148.50KGS' },
        ]
      },
      '045-13110764': {
        status: 'AWD',
        status_info: 'AWD - Document Delivered at POA - 1 / 6.00KGS',
        last_event_date: '2026-03-12T11:31:00',
        force_origem: 'FRA',
        force_destino: 'POA',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed FRA LA 8071 FRA-GRU - 1 / 6.00KGS', date: '2026-03-04T17:47:00', pieces: '1', weight: '6.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed GRU LA 3416 GRU-POA - 1 / 6.00KGS', date: '2026-03-09T11:01:00', pieces: '1', weight: '6.00KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at FRA - 1 / 6.00KGS', date: '2026-03-10T06:56:00', pieces: '1', weight: '6.00KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at FRA - 1 / 6.00KGS', date: '2026-03-10T07:24:00', pieces: '1', weight: '6.00KGS' },
          { status: 'DEP', description: 'LA 8071 (FRA→GRU) - DEP - 1 / 6.00KGS', date: '2026-03-10T22:08:00', pieces: '1', weight: '6.00KGS' },
          { status: 'ARR', description: 'LA 8071 (FRA→GRU) - ARR - Flight Arrived at GRU - 1 / 6.00KGS', date: '2026-03-11T04:36:00', pieces: '1', weight: '6.00KGS' },
          { status: 'RCF', description: 'LA 8071 (FRA→GRU) - RCF - Received from Flight at GRU - 1 / 6.00KGS', date: '2026-03-11T11:11:00', pieces: '1', weight: '6.00KGS' },
          { status: 'MAN', description: 'LA 3416 (GRU→POA) - MAN - Flight Manifested at GRU - 1 / 6.00KGS', date: '2026-03-11T21:24:00', pieces: '1', weight: '6.00KGS' },
          { status: 'DEP', description: 'LA 3416 (GRU→POA) - DEP - Flight Departed from GRU - 1 / 6.00KGS', date: '2026-03-12T07:40:00', pieces: '1', weight: '6.00KGS' },
          { status: 'ARR', description: 'LA 3416 (GRU→POA) - ARR - Flight Arrived at POA - 1 / 6.00KGS', date: '2026-03-12T09:29:00', pieces: '1', weight: '6.00KGS' },
          { status: 'RCF', description: 'LA 3416 (GRU→POA) - RCF - Received from Flight at POA - 1 / 6.00KGS', date: '2026-03-12T09:41:00', pieces: '1', weight: '6.00KGS' },
          { status: 'NFD', description: 'NFD - Agent Notified at POA - 1 / 6.00KGS', date: '2026-03-12T10:13:00', pieces: '1', weight: '6.00KGS' },
          { status: 'AWD', description: 'AWD - Document Delivered at POA - 1 / 6.00KGS', date: '2026-03-12T11:31:00', pieces: '1', weight: '6.00KGS' },
        ]
      },
      '045-12579394': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed LA 8065 MAD-GRU - 3 / 3186.00KGS (TERRESTRE)',
        last_event_date: '2026-03-14T09:05:00',
        force_origem: 'BCN',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'FOH', description: 'FOH - Freight on Hand at BCN - 3 / 3186.00KGS', date: '2026-03-12T18:44:00', pieces: '3', weight: '3186.00KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at BCN - 3 / 3186.00KGS', date: '2026-03-12T20:14:00', pieces: '3', weight: '3186.00KGS' },
          { status: 'MAN', description: 'LA 5280-T (BCN→MAD) - MAN - Flight Manifested at BCN - 3 / 3186.00KGS', date: '2026-03-13T15:52:00', pieces: '3', weight: '3186.00KGS' },
          { status: 'DEP', description: 'LA 5280-T (BCN→MAD) - DEP - 3 / 3186.00KGS (TERRESTRE)', date: '2026-03-13T18:02:00', pieces: '3', weight: '3186.00KGS' },
          { status: 'RCF', description: 'LA 5280-T - RCF - Received from Flight at MAD - 3 / 3186.00KGS', date: '2026-03-14T05:59:00', pieces: '3', weight: '3186.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LA 8065 MAD-GRU - 3 / 3186.00KGS', date: '2026-03-14T09:05:00', pieces: '3', weight: '3186.00KGS' },
        ]
      },
      '020-20982640': {
        status: 'BKD',
        status_info: 'BKD - Booking Confirmed at GRU - 1 / 119 kg',
        last_event_date: '2026-03-12T16:51:00',
        force_origem: 'GRU',
        force_destino: 'MUC',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed at GRU - 1 / 119 kg', date: '2026-03-12T16:51:00', pieces: '1', weight: '119 kg' },
        ]
      },
      '020-17606046': {
        status: 'DEP',
        status_info: 'DEP - 1 pcs departed from FCO on AZ759',
        last_event_date: '2026-03-14T10:30:00',
        force_origem: 'BKK',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 pcs booked at BKK', date: '2026-03-13T13:38:00', pieces: '1', weight: '' },
          { status: 'RCS', description: 'RCS - 1 pcs received at BKK', date: '2026-03-13T11:21:00', pieces: '1', weight: '' },
          { status: 'DEP', description: 'AZ759 (BKK→FCO) - DEP - 1 pcs departed from BKK', date: '2026-03-13T12:22:00', pieces: '1', weight: '' },
          { status: 'ARR', description: 'AZ759 (BKK→FCO) - ARR - 1 pcs arrived at FCO', date: '2026-03-13T18:41:00', pieces: '1', weight: '' },
          { status: 'DEP', description: 'DEP - 1 pcs departed from FCO', date: '2026-03-14T10:30:00', pieces: '1', weight: '' },
        ]
      },
      '020-06353815': {
        status: 'BKD',
        status_info: 'BKD - 2 pcs booked at VCP',
        last_event_date: '2026-03-13T16:20:00',
        force_origem: 'VCP',
        force_destino: 'FRA',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 2 pcs booked at VCP', date: '2026-03-13T16:20:00', pieces: '2', weight: '' },
        ]
      },
      '020-03171232': {
        status: 'BKD',
        status_info: 'BKD - 2 pcs booked at FRA',
        last_event_date: '2026-03-14T11:02:00',
        force_origem: 'FRA',
        force_destino: 'VCP',
        force_timeline: [
          { status: 'RCS', description: 'RCS - 2 pcs received at FRA', date: '2026-03-11T19:47:00', pieces: '2', weight: '' },
          { status: 'BKD', description: 'BKD - 2 pcs booked at FRA', date: '2026-03-14T11:02:00', pieces: '2', weight: '' },
        ]
      },
      '020-01086245': {
        status: 'DIS',
        status_info: 'DIS OFLD - 1 piece offloaded from flight LH8345/14 Mar',
        last_event_date: '2026-03-14T12:00:00',
        force_origem: 'IST',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 pcs booked at IST', date: '2026-03-12T17:50:00', pieces: '1', weight: '' },
          { status: 'RCS', description: 'RCS - 1 pcs received at IST', date: '2026-03-12T17:50:00', pieces: '1', weight: '' },
          { status: 'DIS', description: 'DIS OFLD - 1 piece offloaded from flight LH8345/14 Mar 26', date: '2026-03-14T12:00:00', pieces: '1', weight: '' },
        ]
      },
      '016-98880062': {
        status: 'RCF',
        status_info: 'RCF - Received from Flight at GRU',
        last_event_date: '2026-03-14T06:52:00',
        force_origem: 'BKK',
        force_destino: 'GRU',
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking confirmed at NRT', date: '2026-03-09T16:10:00', pieces: '', weight: '' },
          { status: 'BKD', description: 'BKD - Booking confirmed at NRT', date: '2026-03-09T16:10:00', pieces: '', weight: '' },
          { status: 'RCF', description: 'RCF - Received from Other Airline at NRT', date: '2026-03-09T16:16:00', pieces: '', weight: '' },
          { status: 'MAN', description: 'MAN - Manifested at NRT', date: '2026-03-10T12:03:00', pieces: '', weight: '' },
          { status: 'DEP', description: 'DEP - Departed from NRT', date: '2026-03-10T17:50:00', pieces: '', weight: '' },
          { status: 'ARR', description: 'ARR - Arrived at IAH', date: '2026-03-10T15:29:00', pieces: '', weight: '' },
          { status: 'RCF', description: 'RCF - Received from Flight at IAH', date: '2026-03-10T17:22:00', pieces: '', weight: '' },
          { status: 'RCD', description: 'RCD - Documents Received at IAH', date: '2026-03-10T17:31:00', pieces: '', weight: '' },
          { status: 'BKD', description: 'BKD - Booking confirmed at IAH', date: '2026-03-12T16:41:00', pieces: '', weight: '' },
          { status: 'MAN', description: 'MAN - Manifested at IAH', date: '2026-03-12T16:42:00', pieces: '', weight: '' },
          { status: 'DEP', description: 'DEP - Departed from IAH', date: '2026-03-12T21:47:00', pieces: '', weight: '' },
          { status: 'ARR', description: 'ARR - Arrived at GRU', date: '2026-03-13T09:17:00', pieces: '', weight: '' },
          { status: 'RCD', description: 'RCD - Documents Received at GRU', date: '2026-03-13T12:50:00', pieces: '', weight: '' },
          { status: 'RCF', description: 'RCF - Received from Flight at GRU', date: '2026-03-14T06:52:00', pieces: '', weight: '' },
        ]
      },
      '172-81711184': {
        status: 'ARR',
        status_info: 'ARR: 7 PCS ARRIVED ON CV0392C at LUX',
        last_event_date: '2026-03-14T05:53:00',
        force_origem: 'CPH',
        force_destino: 'VCP',
        disable_discrepancy: true,
      },
      '045-13002500': {
        status: 'BKD',
        status_info: 'Booking Confirmed on JL 0060 KIX-LAX',
        last_event_date: '2026-03-12T13:08:00',
        force_origem: 'KIX',
        force_destino: 'MAO',
        disable_discrepancy: true,
      },
      '045-12580094': {
        status: 'NFD',
        status_info: 'Agent Notified at GRU',
        last_event_date: '2026-03-12T10:58:00',
        force_origem: 'MAD',
        force_destino: 'GRU',
        disable_discrepancy: true,
      },
      '045-12579383': {
        status: 'NFD',
        status_info: 'Agent Notified at GRU',
        last_event_date: '2026-03-10T10:05:00',
        force_origem: 'MAD',
        force_destino: 'GRU',
        disable_discrepancy: true,
      },
      '020-65055432': {
        status: 'ARR',
        status_info: 'Arrived at FRA on LH8401',
        last_event_date: '2026-03-13T16:17:00',
        force_origem: 'PVG',
        force_destino: 'GRU',
        disable_discrepancy: true,
      },
      '020-22270216': {
        status: 'DEP',
        status_info: 'Departed on LH8262 from FRA',
        last_event_date: '2026-03-14T12:12:00',
        force_origem: 'MUC',
        force_destino: 'VCP',
        disable_discrepancy: true,
      },
      '045-21167764': {
        status: 'DEP',
        status_info: 'DEP - LA 5462-T - 6 / 870.80KGS departed from FRA (TRANSPORTE TERRESTRE)',
        last_event_date: '2026-03-13T16:56:00',
        force_origem: 'FRA',
        force_destino: 'GRU',
        disable_discrepancy: true,
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed FOR LA 4697 FOR-GRU - 99 / 800.00KGS', date: '2026-02-18T16:41:00', pieces: '99', weight: '800.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed LIS LA 8151 LIS-FOR - 99 / 2000.00KGS', date: '2026-03-09T15:43:00', pieces: '99', weight: '2000.00KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed FRA LA 5462-T - 7 / 1100.00KGS', date: '2026-03-12T16:42:00', pieces: '7', weight: '1100.00KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at FRA - 6 / 870.80KGS', date: '2026-03-13T11:28:00', pieces: '6', weight: '870.80KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at FRA - 6 / 870.80KGS', date: '2026-03-13T11:36:00', pieces: '6', weight: '870.80KGS' },
          { status: 'DEP', description: 'LA 5462-T (FRA→?) - DEP - 6 / 870.80KGS (TRANSPORTE TERRESTRE)', date: '2026-03-13T16:56:00', pieces: '6', weight: '870.80KGS' },
        ]
      },
      '045-13110775': {
        status: 'RCS',
        status_info: 'RCS - Shipment Received at FRA - 1 / 8.60KGS',
        last_event_date: '2026-03-14T06:44:00',
        force_origem: 'FRA',
        force_destino: 'POA',
        disable_discrepancy: true,
        force_timeline: [
          { status: 'BKD', description: 'BKD - Booking Confirmed GRU LA 3416 GRU-POA - 1 / 8.60KGS', date: '2026-03-12T07:28:00', pieces: '1', weight: '8.60KGS' },
          { status: 'BKD', description: 'BKD - Booking Confirmed FRA LA 8071 FRA-GRU - 1 / 8.60KGS', date: '2026-03-13T13:24:00', pieces: '1', weight: '8.60KGS' },
          { status: 'FOH', description: 'FOH - Freight on Hand at FRA - 1 / 8.60KGS', date: '2026-03-14T00:44:00', pieces: '1', weight: '8.60KGS' },
          { status: 'RCS', description: 'RCS - Shipment Received at FRA - 1 / 8.60KGS', date: '2026-03-14T06:44:00', pieces: '1', weight: '8.60KGS' },
        ]
      },
      '020-50019572': {
        status: 'BKD',
        status_info: 'BKD - 1 pcs booked at SWK',
        last_event_date: '2026-03-12T12:03:00',
        force_origem: 'SWK',
        force_destino: 'CWB',
        disable_discrepancy: true,
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 pcs booked', date: '2026-03-12T12:03:00', pieces: '1', weight: '' },
        ]
      },
      '020-16486190': {
        status: 'RCS',
        status_info: 'RCS - 1 pcs received at IST',
        last_event_date: '2026-03-14T16:28:00',
        force_origem: 'IST',
        force_destino: 'GRU',
        disable_discrepancy: true,
        force_timeline: [
          { status: 'BKD', description: 'BKD - 1 pcs booked at IST', date: '2026-03-14T16:28:00', pieces: '1', weight: '' },
          { status: 'RCS', description: 'RCS - 1 pcs received at IST', date: '2026-03-14T16:28:00', pieces: '1', weight: '' },
        ]
      },
      '020-06280901': {
        status: 'BKD',
        status_info: 'BKD - 20 pcs booked at GRU',
        last_event_date: '2026-03-11T12:27:00',
        force_origem: 'GRU',
        force_destino: 'FRA',
        disable_discrepancy: true,
        force_timeline: [
          { status: 'BKD', description: 'BKD - 20 pcs booked at GRU', date: '2026-03-11T12:27:00', pieces: '20', weight: '' },
        ]
      },
    };

    // v2: override loop with debug
    for (const row of processedRows) {
      const awb = (row.awb || '').trim();
      const override = MANUAL_OVERRIDES[awb];
      if (!override) continue;

      console.log(`[OVERRIDE] AWB="${awb}" keys=${Object.keys(override).join(',')}`);

      if (override.skip_first_event) {
        // Re-resolve status skipping the first timeline event
        const timelineStr = (() => {
          // Find the ws entry for this AWB
          const ws = wsList.find((w: any) => String(w.awb || '').trim() === awb);
          return ws?.timeline_json ? String(ws.timeline_json) : null;
        })();
        if (timelineStr) {
          try {
            const events = JSON.parse(timelineStr);
            if (Array.isArray(events) && events.length > 1) {
              // Remove the first event (most recent) and re-resolve
              const withoutFirst = events.slice(1);
              const newTimeline = JSON.stringify(withoutFirst);
              const newStatus = resolveUnkFromTimeline(newTimeline, awb);
              const newDesc = extractLastEventDescription(newTimeline);
              if (newStatus) {
                row['último_status'] = newStatus;
                row.tracking_failed = false;
                console.log(`[manualOverride] ${awb}: skipped first event, new status="${newStatus}"`);
              }
              if (newDesc) row.status_info = newDesc;
            }
          } catch (_e) { /* ignore */ }
        }
      }

      if (override.status) {
        row['último_status'] = override.status;
        row.tracking_failed = false;
        console.log(`[manualOverride] ${awb}: forced status="${override.status}"`);
      }
      if (override.status_info) {
        row.status_info = override.status_info;
        row.last_event = override.status_info;
      }
      if (override.force_critical) {
        row.force_critical = true;
      }
      if (override.last_event_date) {
        row.last_event_date = override.last_event_date;
      }
      if (override.force_timeline) {
        row.timeline_json = JSON.stringify(override.force_timeline);
      }
      if (override.force_origem) {
        row.origem = override.force_origem;
      }
      if (override.force_destino) {
        row.destino = override.force_destino;
      }
      if (override.disable_discrepancy) {
        row.pieces_discrepancy = false;
        row.baseline_pieces = null;
        row.has_dis_event = false;
        row.force_critical = false;
      }
    }

    // ========== FILTRO DE VISIBILIDADE ==========
    // 1. Remover DLV/DELIVERED
    // 2. ARR - DESTINO: manter por 5 dias após última atualização, depois ocultar
    const now = Date.now();
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

    // AWBs manualmente excluídos da visualização
    const HIDDEN_AWBS = new Set([
      '549-43063871',
      '020-05761011', '045-13110742', '045-21380704', '016-06977725', '577-11184320',
      '047-33703040', '235-82805833', '020-05688325', '020-05844230', '045-21167473',
      '577-11060210', '074-04749264', '047-00566646', '045-21167845', '577-11184526',
      '996-14364324', '020-34733576', '057-57956662', '577-11184515', '014-39549230',
      '074-73854550', '020-22473916', '045-13300766', '172-02579861', '172-90555894',
      '045-21561632', '549-43063801', '020-05761781', '369-84119556', '045-21380612',
      '127-72327662', '172-90555835', '020-02995952', '020-03394215', '057-03590344',
      '020-16486175', '045-13300803', '724-86964570', '045-99644381', '996-14370764',
      '020-65055196', '865-14762381', '369-96183415', '045-13300626', '047-32916251',
      '074-04751843', '016-95200022', '087-08279331', '006-45285166', '047-35319384',
      '827-08279331',
      '045-13300781', '724-76422835', '045-21167510',
      '172-90556211',
      '045-21167812', '016-53516002',
      '074-67409506', '047-09933663', '045-13293545', '016-06977736', '006-45285155', '001-22828956',
      '016-04639165', '014-78876932',
    ]);

    // AWBs com override manual NUNCA devem ser filtrados
    const OVERRIDE_PROTECTED = new Set(Object.keys(MANUAL_OVERRIDES));

    const visibleRows = processedRows.filter((row: any) => {
      const status = (row['último_status'] || '').toUpperCase().trim();
      const awb = (row['awb'] || '').trim();

      // Override-protected AWBs are always visible
      if (OVERRIDE_PROTECTED.has(awb)) return true;

      // 0. AWBs manualmente ocultos
      if (HIDDEN_AWBS.has(awb)) return false;

      // 1. Nunca mostrar DLV
      if (status === 'DLV' || status === 'DELIVERED') return false;

      // 2. ARR - DESTINO: manter por 5 dias
      if (status === 'ARR - DESTINO') {
        const updatedAt = row['última atualização'];
        if (!updatedAt) return true;
        const updatedTime = new Date(updatedAt).getTime();
        if (isNaN(updatedTime)) return true;
        return (now - updatedTime) <= FIVE_DAYS_MS;
      }

      return true;
    });

    // Mark AWBs with "NI" as "AWB Invalido"
    for (const row of visibleRows) {
      const awb = (row['awb'] || '').trim().toUpperCase();
      if (awb === 'NI') {
        row['awb'] = 'AWB Invalido';
        row['último_status'] = 'ERRO';
        row['status_info'] = 'AWB não informado no sistema';
        row['tracking_failed'] = true;
      }
    }

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
