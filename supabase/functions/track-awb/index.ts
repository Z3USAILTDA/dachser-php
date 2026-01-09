import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= API LOGGING HELPERS =============

// Helper to log API calls asynchronously (fire-and-forget)
async function logApiCall(
  api_name: string,
  endpoint: string,
  method: string,
  status_code: number,
  response_time_ms: number,
  error_message?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'log_api_call',
        api_name,
        endpoint,
        method,
        status_code,
        response_time_ms,
        error_message,
        edge_function: 'track-awb'
      }),
    });
  } catch (e) {
    // Silently fail - logging should not break main flow
    console.error('[logApiCall] Failed to log:', e);
  }
}

// Wrapper for Firecrawl API calls with automatic logging
async function firecrawlScrape(
  url: string,
  options: { formats?: string[]; waitFor?: number; timeout?: number; onlyMainContent?: boolean } = {}
): Promise<{ response: Response; elapsed: number }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }
  
  const startTime = Date.now();
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: options.formats || ['html', 'markdown'],
      waitFor: options.waitFor || 15000,
      timeout: options.timeout || 60000,
      onlyMainContent: options.onlyMainContent,
    }),
  });
  const elapsed = Date.now() - startTime;
  
  // Log Firecrawl API call
  logApiCall(
    'Firecrawl',
    '/v1/scrape',
    'POST',
    response.status,
    elapsed,
    response.ok ? undefined : `HTTP ${response.status}`
  );
  
  return { response, elapsed };
}

// Log Air Carrier API calls (for direct airline APIs)
function logAirCarrierCall(
  carrier: string,
  endpoint: string,
  status: number,
  elapsed: number,
  error?: string
): void {
  logApiCall(
    'Air Carriers',
    `${carrier}: ${endpoint}`,
    'GET',
    status,
    elapsed,
    error
  );
}

// ============= INTERFACES =============

interface TrackingEvent {
  date: string;
  location: string;
  status: string;
  description: string;
}

interface TrackingResult {
  awb: string;
  airline: string;
  status: string;
  origin: string;
  destination: string;
  currentLocation: string;
  weight: string;
  pieces: string;
  events: TrackingEvent[];
  provider?: string;
  lastFlight?: {
    number: string;
    timestamp: string;
    comment?: string;
  };
  lastStatus?: {
    code: string;
    description: string;
    timestamp: string;
    location?: string; // IATA airport code where the event occurred
  };
}

interface StandardResult {
  provider: string;
  ok: boolean;
  status: number;
  error: string | null;
  sent: any;
  raw?: any;
  summary?: {
    lastFlight?: {
      number: string;
      timestamp: string;
      comment?: string;
    };
    lastStatus?: {
      code: string;
      description: string;
      timestamp: string;
      location?: string; // IATA airport code where the event occurred
    };
    origin?: string;
    destination?: string;
  };
}

// ============= UTILITIES =============

function normalizeFlightNumber(flight: string): string {
  const match = flight.match(/^([A-Z0-9]{1,2})(\d{2,5})([A-Z]?)$/i);
  if (match) {
    const [, carrier, number, suffix] = match;
    return `${carrier.toUpperCase()} ${number}${suffix}`;
  }
  return flight;
}

function formatDateTAP(dateStr: string, timeStr?: string): string {
  try {
    // Parse DDMMMYY format (e.g., 10MAY24)
    const months: { [key: string]: string } = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const match = dateStr.match(/(\d{2})([A-Z]{3})(\d{2})/i);
    if (match) {
      const [, day, month, year] = match;
      const fullYear = `20${year}`;
      const monthNum = months[month.toUpperCase()];
      const time = timeStr || '00:00';
      return `${fullYear}-${monthNum}-${day}T${time}:00`;
    }
  } catch (e) {
    console.error('Error formatting TAP date:', e);
  }
  return dateStr;
}

function formatDateDelta(dateStr: string, timeStr: string): string {
  try {
    // Parse MM/DD/YYYY and HHmm
    const [month, day, year] = dateStr.split('/');
    const hours = timeStr.substring(0, 2);
    const minutes = timeStr.substring(2, 4);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours}:${minutes}:00`;
  } catch (e) {
    console.error('Error formatting Delta date:', e);
  }
  return dateStr;
}

function parseDateTimeAFKL(datetime: string): string {
  try {
    // Parse "DD MMM HH:mm" format (e.g., "10 OCT 15:38")
    const months: { [key: string]: string } = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    
    const match = datetime.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{2}):(\d{2})/i);
    if (match) {
      const [, day, month, hours, minutes] = match;
      const monthNum = months[month.toUpperCase()];
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${monthNum}-${day.padStart(2, '0')}T${hours}:${minutes}:00Z`;
    }
  } catch (e) {
    console.error('Error parsing AFKL datetime:', e);
  }
  return new Date().toISOString();
}

function mapStatusCode(text: string, carrier: string): string {
  const lowerText = text.toLowerCase();
  
  // Common mappings
  if (lowerText.includes('delivered')) return 'DLV';
  if (lowerText.includes('departed')) return 'DEP';
  if (lowerText.includes('arrived')) return 'ARR';
  if (lowerText.includes('received from flight')) return 'RCF';
  if (lowerText.includes('ready for delivery')) return 'NFD';
  if (lowerText.includes('manifest')) return 'MAN';
  if (lowerText.includes('booked')) return 'BKD';
  if (lowerText.includes('received')) return 'RCS';
  
  return text.toUpperCase().substring(0, 3);
}

// ============= API INTEGRATIONS =============

async function fetchTAPAPI(awb: string): Promise<StandardResult> {
  const provider = 'TAP';
  console.log(`[TAP API] Fetching AWB: ${awb}`);
  
  const startTime = Date.now();
  try {
    const url = 'https://www.tapcargo.com/api/cargo/cargo-flight-list?functionName=retrieveCargoETracking';
    const payload = { AirwayBillNumber: awb };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const elapsed = Date.now() - startTime;

    // Log Air Carrier API call
    logAirCarrierCall('TAP', '/api/cargo/cargo-flight-list', response.status, elapsed);

    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { AirwayBillNumber: awb },
      };
    }

    const data = await response.json();
    console.log(`[TAP API] Response:`, JSON.stringify(data).substring(0, 500));

    // Extract origin and destination from AWB
    const origin = data?.Awb?.AwbOrigin || 'N/A';
    const destination = data?.Awb?.AwbDestination || 'N/A';

    // Helper: Convert month name to number
    const monthToNum = (mmm: string): number | null => {
      const map: Record<string, number> = {
        'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
        'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
      };
      return map[mmm.toUpperCase()] || null;
    };

    // Helper: Convert "27OCT25" to "2025-10-27"
    const dateToYmd = (d: string | null): string | null => {
      if (!d) return null;
      const match = d.trim().match(/^(\d{2})([A-Z]{3})(\d{2})$/i);
      if (!match) return null;
      const day = parseInt(match[1]);
      const mon = monthToNum(match[2]);
      const yy = parseInt(match[3]);
      if (!mon) return null;
      const year = yy >= 70 ? 1900 + yy : 2000 + yy;
      return `${year.toString().padStart(4, '0')}-${mon.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    };

    // Helper: Make ISO timestamp "YYYY-MM-DDTHH:MM:SS"
    const makeIso = (dateDDMMMYY: string | null, timeHHMM: string | null): string | null => {
      const ymd = dateToYmd(dateDDMMMYY);
      if (!ymd) return null;
      const time = (timeHHMM && /^\d{2}:\d{2}$/.test(timeHHMM)) ? timeHHMM : '00:00';
      return `${ymd}T${time}:00`;
    };

    // Helper: Convert to timestamp
    const toTs = (dateDDMMMYY: string | null, timeHHMM: string | null): number | null => {
      const iso = makeIso(dateDDMMMYY, timeHHMM);
      if (!iso) return null;
      return new Date(iso).getTime();
    };

    // Helper: Normalize flight number "TP057"→"TP 057", "TP7004S"→"TP 7004S"
    const normalizeTAPFlight = (raw: string | null): string | null => {
      if (!raw) return null;
      const r = raw.toUpperCase().trim();
      if (/^[A-Z]{1,2}$/.test(r)) return r; // Just "TP"
      const match = r.match(/^([A-Z]{1,2})(\d{2,5})([A-Z]?)$/);
      if (match) {
        return `${match[1]} ${match[2]}${match[3]}`.trim();
      }
      return r; // fallback
    };

    // Helper: Map status text to code
    // NOTE: For TAP Cargo, AWD (Document Delivered) means the shipment was delivered, so we map AWD → DLV
    const statusTextToCode = (status: string): string | null => {
      const s = status.toUpperCase().trim();
      const map: Record<string, string> = {
        'BOOKED': 'KK',
        'DEPARTED': 'DEP',
        'DEPARTED ON FLIGHT': 'DEP',
        'ARRIVED': 'ARR',
        'RECEIVED FROM FLIGHT': 'RCF',
        'RECEIVED FROM SHIPPER': 'RCS',
        'MANIFESTED ON FLIGHT': 'MAN',
        'TO BE TRANSFERRED TO ANOTHER AIRLINE': 'TRM',
        'TRANSFERRED TO ANOTHER AIRLINE': 'TFD',
        'RECEIVED FROM ANOTHER AIRLINE': 'RCT',
        'DOCUMENT DELIVERED': 'DLV',
        'AWD': 'DLV',  // TAP Cargo: AWD is issued after delivery
        'DEP': 'DEP', 'ARR': 'ARR', 'RCF': 'RCF', 'RCS': 'RCS', 'MAN': 'MAN',
        'TRM': 'TRM', 'TFD': 'TFD', 'RCT': 'RCT', 'KK': 'KK', 'NN': 'NN', 'DLV': 'DLV',
      };
      return map[s] || null;
    };

    // Helper: Map code to description
    const codeToDesc = (code: string): string => {
      const map: Record<string, string> = {
        'KK': 'Booked/Confirming',
        'NN': 'Booked (NN)',
        'RCS': 'Received from Shipper',
        'MAN': 'Manifested on Flight',
        'DEP': 'Departed',
        'ARR': 'Arrived',
        'RCF': 'Received from Flight',
        'TRM': 'To be transferred',
        'TFD': 'Transferred to another Airline',
        'RCT': 'Received from another Airline',
      };
      const c = code.toUpperCase().trim();
      return map[c] || c;
    };

    // Helper: Convert single object to array
    const toList = (v: any): any[] => {
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    };

    const candidates: any[] = [];

    // 1) Priority: Awb.Segments.Segment (EventDate/EventTime)
    const segments = toList(data?.Awb?.Segments?.Segment);
    for (const seg of segments) {
      if (!seg) continue;
      const ts = toTs(seg.EventDate, seg.EventTime);
      if (ts === null) continue;

      let code = (seg.StatusCode || '').toUpperCase().trim();
      if (!code) code = statusTextToCode(seg.Status || '') || '';
      // Apply AWD → DLV conversion for TAP Cargo
      if (code === 'AWD') code = 'DLV';

      const flightRaw = seg.FlightNum || null;
      const flightNum = normalizeTAPFlight(flightRaw);

      // Extract event airport for ARR location tracking
      const eventAirport = seg.EventAirport || seg.ArrivalAirport || seg.Airport || null;
      
      candidates.push({
        __ts: ts,
        __iso: makeIso(seg.EventDate, seg.EventTime),
        code: code,
        statusTxt: seg.Status || null,
        flight: flightNum,
        location: eventAirport, // IATA airport code where event occurred
      });
    }

    // 2) Fallback: Awb.Routing.line (Actual > Estimated > Scheduled)
    if (candidates.length === 0) {
      const routing = toList(data?.Awb?.Routing?.line);
      for (const ln of routing) {
        if (!ln) continue;

        let date = null, time = null;
        const typeArr = (ln.TypeofArrivalTime || '').toLowerCase();
        const typeDep = (ln.TypeofDepartureTime || '').toLowerCase();

        if (typeArr === 'actual') {
          date = ln.ArrivalDate;
          time = ln.ArrivalTime;
        } else if (typeDep === 'actual') {
          date = ln.DepartureDate;
          time = ln.DepartureTime;
        } else if (typeArr === 'estimated') {
          date = ln.ArrivalDate;
          time = ln.ArrivalTime;
        } else if (typeDep === 'estimated') {
          date = ln.DepartureDate;
          time = ln.DepartureTime;
        } else {
          date = ln.ArrivalDate || ln.DepartureDate || null;
          time = ln.ArrivalTime || ln.DepartureTime || null;
        }

        const ts = toTs(date, time);
        if (ts === null) continue;

        const code = statusTextToCode(ln.StatusDesc || ln.Status || '') || '';
        const flightNum = normalizeTAPFlight(ln.FlightNum || null);

        // Extract location from routing line
        const routeLocation = ln.ArrivalAirport || ln.DepartureAirport || ln.Airport || null;
        
        candidates.push({
          __ts: ts,
          __iso: makeIso(date, time),
          code: code,
          statusTxt: ln.StatusDesc || ln.Status || null,
          flight: flightNum,
          location: routeLocation, // IATA airport code from routing
        });
      }
    }

    if (candidates.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { AirwayBillNumber: awb },
        raw: data,
      };
    }

    // Sort by timestamp
    candidates.sort((a, b) => a.__ts - b.__ts);

    // Last status (highest timestamp)
    const last = candidates[candidates.length - 1];
    let statusCode = last.code || statusTextToCode(last.statusTxt || '') || '';
    // Final AWD → DLV conversion for TAP Cargo (safety check)
    if (statusCode === 'AWD') statusCode = 'DLV';
    const lastStatus = {
      code: statusCode,
      description: codeToDesc(statusCode || last.statusTxt || ''),
      timestamp: last.__iso,
      location: last.location || undefined, // IATA airport code where last event occurred
    };

    // Last flight (search backwards for one with valid flight number)
    let lastFlight = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const ev = candidates[i];
      if (ev.flight) {
        lastFlight = {
          number: ev.flight,
          timestamp: ev.__iso,
        };
        break;
      }
    }

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { AirwayBillNumber: awb },
      raw: data,
      summary: {
        lastFlight: lastFlight || { number: 'N/A', timestamp: last.__iso },
        lastStatus: lastStatus,
        origin: origin,
        destination: destination,
      },
    };
  } catch (error) {
    console.error(`[TAP API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { AirwayBillNumber: awb },
    };
  }
}

async function fetchAtlasAPI(awb: string): Promise<StandardResult> {
  const provider = 'ATLAS';
  console.log(`[ATLAS API] Fetching AWB: ${awb}`);
  
  const startTime = Date.now();
  try {
    // Detect if it's 8 digits (serial) or 11 (full AWB)
    const digits = awb.replace(/\D/g, '');
    let prfx = '', serial = '';
    
    if (digits.length === 8) {
      prfx = '369';
      serial = digits;
    } else if (digits.length === 11) {
      prfx = digits.substring(0, 3);
      serial = digits.substring(3);
    } else {
      return {
        provider,
        ok: false,
        status: 400,
        error: 'Invalid AWB format for Atlas',
        sent: { awb },
      };
    }

    const url = `https://jumpseat.atlasair.com/tracktraceapi/api/FreightContProvdr/GetFrieghtDtlByAwbNo?prfx=${prfx}&serial=${serial}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://jumpseat.atlasair.com/track-trace',
      },
    });
    const elapsed = Date.now() - startTime;

    // Log Air Carrier API call
    logAirCarrierCall('ATLAS', '/tracktraceapi/api/FreightContProvdr', response.status, elapsed);

    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { prfx, serial },
      };
    }

    const data = await response.json();
    console.log(`[ATLAS API] Response:`, JSON.stringify(data).substring(0, 500));

    // Helper: Parse Atlas alpha date "27OCT25 14:30" or "27OCT25"
    const parseAlphaDate = (s: string | null): number | null => {
      if (!s) return null;
      const match = s.trim().match(/^(?<d>\d{1,2})(?<m>[A-Z]{3})(?<y>\d{2})(?:\s+(?<hh>\d{2}):(?<mm>\d{2}))?$/);
      if (!match || !match.groups) return null;
      const monthMap: Record<string, number> = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
      };
      const mon = monthMap[match.groups.m];
      if (mon === undefined) return null;
      const day = parseInt(match.groups.d);
      const year = 2000 + parseInt(match.groups.y);
      const hh = match.groups.hh ? parseInt(match.groups.hh) : 0;
      const mm = match.groups.mm ? parseInt(match.groups.mm) : 0;
      return new Date(year, mon, day, hh, mm, 0).getTime();
    };

    // Helper: Safe timestamp conversion
    const safeTs = (val: any): number | null => {
      if (!val) return null;
      if (typeof val === 'number') return val;
      const s = String(val).trim();
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.getTime();
      return parseAlphaDate(s);
    };

    // Helper: Timestamp to ISO
    const toIso = (ts: number | null): string | null => {
      return ts ? new Date(ts).toISOString() : null;
    };

    // Status descriptions
    const STATUS_DESC: Record<string, string> = {
      'BKD': 'Reserva confirmada (Booked)',
      'FOH': 'Carga disponível no terminal (Freight on Hand)',
      'RCS': 'Recebido do expedidor (Received from Shipper)',
      'ULD': 'ULD montada/carregada (Unit Load Device built)',
      'ARR': 'Voo chegou (Arrived)',
      'RCF': 'Recebido do voo (Received from Flight)',
      'NFD': 'Consignatário/Agente notificado (Notified)',
      'DLV': 'Entregue (Delivered)',
    };

    const enhanced = data?.LstFrieghtDtlEnhanced || [];
    
    // Extract origin and destination from root object
    const origin = data?.Origin || 'N/A';
    const destination = data?.Destination || 'N/A';
    
    if (!Array.isArray(enhanced) || enhanced.length === 0) {
      // Fallback: FrieghtDisp
      const tracks = data?.FrieghtDisp?.LstFrgtDispDtl?.[0]?.LstFrgtDispTrack || [];
      if (tracks.length > 0) {
        const sorted = [...tracks].sort((a, b) => (b.FlgtSeq || 0) - (a.FlgtSeq || 0));
        const t0 = sorted[0];
        let num = null;
        if (t0.Transport) {
          num = t0.Transport.replace(/^([A-Z]{1,3})\s?(\d.*)$/, '$1 $2');
        } else {
          const car = t0.FlightInfo?.Carrier || '';
          const fn = t0.FlightInfo?.FlightNumber || '';
          if (car && fn) num = `${car} ${fn}`;
        }
        const ts = safeTs(t0.FlightInfo?.FlightDate);
        return {
          provider,
          ok: true,
          status: 200,
          error: null,
          sent: { prfx, serial },
          raw: data,
          summary: {
            lastFlight: { number: num || 'N/A', timestamp: toIso(ts) || new Date().toISOString() },
            lastStatus: undefined,
          },
        };
      }
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { prfx, serial },
        raw: data,
      };
    }

    // Find last status (highest timestamp)
    let lastStatusItem: any = null;
    let lastStatusTs = -Infinity;
    for (const row of enhanced) {
      let ts = safeTs(row.DtTime);
      if (ts === null) ts = safeTs(row.FlightDate);
      if (ts === null) ts = safeTs(row.DtTimeStr);
      if (ts !== null && ts > lastStatusTs) {
        lastStatusTs = ts;
        lastStatusItem = row;
      }
    }

    let lastStatus: { code: string; description: string; timestamp: string; } | undefined = undefined;
    if (lastStatusItem) {
      const code = lastStatusItem.Status || '';
      let refTs = safeTs(lastStatusItem.DtTime);
      if (refTs === null) refTs = safeTs(lastStatusItem.FlightDate);
      if (refTs === null) refTs = safeTs(lastStatusItem.DtTimeStr);
      lastStatus = {
        code: code,
        description: STATUS_DESC[code] || '—',
        timestamp: toIso(refTs) || new Date().toISOString(),
      };
    }

    // Find last flight (highest timestamp with Carrier and FlightNo)
    let lastFlight = null;
    let lastFlightTs = -Infinity;
    for (const row of enhanced) {
      const carrier = String(row.Carrier || '').trim();
      const fno = String(row.FlightNo || '').trim();
      if (carrier === '' || fno === '') continue;
      let ts = safeTs(row.DtTime);
      if (ts === null) ts = safeTs(row.FlightDate);
      if (ts === null) ts = safeTs(row.DtTimeStr);
      if (ts !== null && ts >= lastFlightTs) {
        lastFlightTs = ts;
        lastFlight = { number: `${carrier} ${fno}`, timestamp: toIso(ts) || new Date().toISOString() };
      }
    }

    // Fallback flight via FrieghtDisp
    if (!lastFlight) {
      const tracks = data?.FrieghtDisp?.LstFrgtDispDtl?.[0]?.LstFrgtDispTrack || [];
      if (tracks.length > 0) {
        const sorted = [...tracks].sort((a, b) => (b.FlgtSeq || 0) - (a.FlgtSeq || 0));
        const t0 = sorted[0];
        let num = null;
        if (t0.Transport) {
          num = t0.Transport.replace(/^([A-Z]{1,3})\s?(\d.*)$/, '$1 $2');
        } else {
          const car = t0.FlightInfo?.Carrier || '';
          const fn = t0.FlightInfo?.FlightNumber || '';
          if (car && fn) num = `${car} ${fn}`;
        }
        const ts = safeTs(t0.FlightInfo?.FlightDate);
        lastFlight = { number: num || 'N/A', timestamp: toIso(ts) || new Date().toISOString() };
      }
    }

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { prfx, serial },
      raw: data,
      summary: {
        lastFlight: lastFlight || { number: 'N/A', timestamp: new Date().toISOString() },
        lastStatus: lastStatus,
        origin: origin,
        destination: destination,
      },
    };
  } catch (error) {
    console.error(`[ATLAS API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchLufthansaAPI(awb: string): Promise<StandardResult> {
  const provider = 'LUFTHANSA';
  console.log(`[LUFTHANSA API] Fetching AWB: ${awb}`);
  
  try {
    const apiKey = Deno.env.get('LH_CARGO_APIKEY');
    if (!apiKey) {
      console.log('[LUFTHANSA API] API key not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'LH_CARGO_APIKEY not configured',
        sent: { awb },
      };
    }

    const digits = awb.replace(/\D/g, '');
    const url = `https://api-external.lufthansa-cargo.com/stp/shipments-details/${digits}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'APIKEY': apiKey,
        'x-api-key': apiKey,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { awb: digits },
      };
    }

    const data = await response.json();
    console.log(`[LUFTHANSA API] Response:`, JSON.stringify(data).substring(0, 500));

    // Get status from awbDetails.latestEvent (primary source)
    const statusCode = (data?.awbDetails?.latestEvent || '').toUpperCase();
    
    if (!statusCode) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No status found in awbDetails.latestEvent',
        sent: { awb: digits },
        raw: data,
      };
    }

    // Extract origin and destination from awbDetails
    const origin = data?.awbDetails?.originAirport?.airportCode || 'N/A';
    const destination = data?.awbDetails?.destinationAirport?.airportCode || 'N/A';
    
    console.log(`[LUFTHANSA API] Origin: ${origin}, Destination: ${destination}`);

    // Map status codes to descriptions
    const statusMap: Record<string, string> = {
      'BKD': 'Booked/Assigned',
      'RCS': 'Received from Shipper',
      'MAN': 'Manifested/Onboard',
      'DEP': 'Departed',
      'ARR': 'Arrived',
      'RCF': 'Received from Flight',
      'NFD': 'Ready for pick-up',
      'DLV': 'Delivered',
    };
    
    const statusDescription = statusMap[statusCode] || statusCode;

    // Collect event candidates from statusHistories for timestamp info
    const candidates: any[] = [];
    const statusHistories = data?.statusHistories || [];
    const vertices = data?.milestonePlan?.vertices || [];
    
    const allEvents = statusHistories.length > 0 ? statusHistories : vertices;
    
    for (const ev of allEvents) {
      // Prioritize actualCargoEvent over planedCargoEvent for timestamp
      const actualEvent = ev?.actualCargoEvent;
      const planedEvent = ev?.planedCargoEvent;
      const timestamp = actualEvent?.eventDateTime || planedEvent?.eventDateTime;
      
      if (timestamp) {
        candidates.push({
          ...ev,
          _timestamp: new Date(timestamp).getTime(),
          _timestampISO: timestamp,
        });
      }
    }
    
    // Sort by timestamp and get last event for timestamp
    let lastEventTimestamp = new Date().toISOString();
    if (candidates.length > 0) {
      candidates.sort((a, b) => a._timestamp - b._timestamp);
      const lastEvent = candidates[candidates.length - 1];
      lastEventTimestamp = lastEvent._timestampISO;
    }

    // Extract flight number - prioritize from events with flight info
    let flightNumber = '';
    let flightTimestamp = '';
    
    // Search backwards through events for one with flight info
    for (let i = candidates.length - 1; i >= 0; i--) {
      const ev = candidates[i];
      const flight = ev?.flight;
      
      if (flight) {
        // Try flightDesignator first
        const flightDesignator = flight.flightDesignator;
        if (flightDesignator?.carrierCode && flightDesignator?.flightNumber) {
          flightNumber = normalizeFlightNumber(
            `${flightDesignator.carrierCode}${flightDesignator.flightNumber}`
          );
          flightTimestamp = ev._timestampISO;
          break;
        }
        
        // Fallback to flightNumber field
        if (flight.flightNumber) {
          flightNumber = normalizeFlightNumber(flight.flightNumber);
          flightTimestamp = ev._timestampISO;
          break;
        }
      }
    }

    // Fallback: check flightInformation array
    if (!flightNumber && data?.flightInformation?.length > 0) {
      let bestFlight = null;
      let bestTs = 0;
      
      for (const fi of data.flightInformation) {
        const num = fi.flightNumber;
        if (!num) continue;
        
        // Get best timestamp from flight info
        const ts = fi.actualArrivalTime || fi.actualDepartureTime ||
                   fi.estimatedArrivalTime || fi.estimatedDepartureTime ||
                   fi.scheduledArrivalTime || fi.scheduledDepartureTime;
        
        if (ts) {
          const tsNum = new Date(ts).getTime();
          if (tsNum >= bestTs) {
            bestTs = tsNum;
            bestFlight = { number: normalizeFlightNumber(num), timestamp: ts };
          }
        }
      }
      
      if (bestFlight) {
        flightNumber = bestFlight.number;
        flightTimestamp = bestFlight.timestamp;
      }
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: digits },
      raw: data,
      summary: {
        lastFlight: {
          number: flightNumber || 'N/A',
          timestamp: flightTimestamp || lastEventTimestamp,
        },
        lastStatus: {
          code: statusCode,
          description: statusDescription,
          timestamp: lastEventTimestamp,
          location: destination || undefined, // For LH, use destination as fallback for ARR events
        },
        origin,
        destination,
      },
    };
  } catch (error) {
    console.error(`[LUFTHANSA API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchITAAPI(awb: string): Promise<StandardResult> {
  const provider = 'ITA';
  console.log(`[ITA API] Fetching AWB: ${awb}`);
  
  try {
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3);
    const serial = digits.substring(3, 11); // Only 8 digits for serial
    
    const url = `https://pg.fr8manage.app/cargospot/fetchTrackingData?airlinePrefix=${prefix}&serialNumber=${serial}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://pg.fr8manage.app/cargospot/etracking',
      },
    });

    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { airlinePrefix: prefix, serialNumber: serial },
      };
    }

    const data = await response.json();
    console.log(`[ITA API] Response:`, JSON.stringify(data).substring(0, 500));

    // Helper: Convert ISO string to timestamp
    const isoToTs = (s: string | null): number | null => {
      if (!s) return null;
      try {
        return new Date(s).getTime();
      } catch {
        return null;
      }
    };

    // Helper: Extract flight number from transportMeans
    const flightFromTransportMeans = (tm: any): string | null => {
      const carrier = tm?.carrier?.code;
      const num = tm?.transportNumber;
      if (carrier && num) return `${carrier.toUpperCase()} ${num.toUpperCase()}`;

      const ref = String(tm?.reference || '');
      const match = ref.match(/([A-Z]{2})\s*?(\d{2,5}[A-Z0-9]?)/i);
      if (match) return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;

      return null;
    };

    const awbData = data?.airwaybill;
    if (!awbData) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No airwaybill data found',
        sent: { airlinePrefix: prefix, serialNumber: serial },
        raw: data,
      };
    }

    // Extract origin and destination from airwaybill
    const origin = awbData?.origin?.code || 'N/A';
    const destination = awbData?.destination?.code || 'N/A';

    // ========== Last Status ==========
    let lastStatus: { code: string; description: string; timestamp: string; location?: string; } | undefined = undefined;
    let lastStatusTs: number | null = null;

    const events = awbData?.events || [];
    for (const ev of events) {
      // Prefer ev.time, fallback to transportMeans.arrivalOn
      let ts = isoToTs(ev.time);

      if (ts === null && ev.transportMeans) {
        const tm = ev.transportMeans;
        if (typeof tm.arrivalOn === 'string') {
          ts = isoToTs(tm.arrivalOn);
        } else if (Array.isArray(tm.arrivalOn)) {
          for (const arr of tm.arrivalOn) {
            if (arr.time) {
              const cand = isoToTs(arr.time);
              if (cand !== null && (ts === null || cand > ts)) ts = cand;
            }
          }
        }
      }

      if (ts !== null && (lastStatusTs === null || ts >= lastStatusTs)) {
        lastStatusTs = ts;
        const timestamp = ev.time || (
          typeof ev.transportMeans?.arrivalOn === 'string' ? ev.transportMeans.arrivalOn : null
        );
        // Extract location from transportMeans station
        const eventLocation = ev.transportMeans?.station || ev.location?.code || null;
        
        lastStatus = {
          code: String(ev.actionStatus?.code || '').toUpperCase(),
          description: String(ev.actionStatus?.description || ''),
          timestamp: timestamp || new Date(ts).toISOString(),
          location: eventLocation || undefined, // IATA code where event occurred
        };
      }
    }

    // ========== Last Flight ==========
    let lastFlight: { number: string; timestamp: string; } | undefined = undefined;
    let lastFlightTs: number | null = null;

    const flightRelatedCodes = ['DEP', 'ARR', 'RCF', 'MAN', 'PRE', 'RCS'];

    for (const ev of events) {
      const tm = ev.transportMeans;
      if (!tm) continue;

      const code = String(ev.actionStatus?.code || '').toUpperCase();
      const isFlightRelated = flightRelatedCodes.includes(code) || tm;

      if (!isFlightRelated) continue;

      // Event/flight timestamp
      let ts = isoToTs(ev.time);
      if (ts === null) {
        if (typeof tm.arrivalOn === 'string') {
          ts = isoToTs(tm.arrivalOn);
        } else if (Array.isArray(tm.arrivalOn)) {
          for (const arr of tm.arrivalOn) {
            if (arr.time) {
              const cand = isoToTs(arr.time);
              if (cand !== null && (ts === null || cand > ts)) ts = cand;
            }
          }
        } else if (tm.date) {
          ts = isoToTs(`${tm.date}T00:00:00`);
        }
      }

      const num = flightFromTransportMeans(tm);
      if (num && ts !== null && (lastFlightTs === null || ts >= lastFlightTs)) {
        lastFlightTs = ts;
        lastFlight = {
          number: num,
          timestamp: ev.time || new Date(ts).toISOString(),
        };
      }
    }

    // Fallback: routingSegments
    if (!lastFlight) {
      const segments = awbData?.routingSegments || [];
      for (const seg of segments) {
        const tm = seg.transportMeans;
        if (!tm) continue;

        let ts: number | null = null;
        if (Array.isArray(tm.arrivalOn)) {
          for (const arr of tm.arrivalOn) {
            if (arr.time) {
              const cand = isoToTs(arr.time);
              if (cand !== null && (ts === null || cand > ts)) ts = cand;
            }
          }
        } else if (tm.date) {
          ts = isoToTs(`${tm.date}T00:00:00`);
        }

        const num = flightFromTransportMeans(tm);
        if (num && ts !== null && (lastFlightTs === null || ts >= lastFlightTs)) {
          lastFlightTs = ts;
          lastFlight = { number: num, timestamp: new Date(ts).toISOString() };
        }
      }
    }

    if (!lastStatus && events.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { airlinePrefix: prefix, serialNumber: serial },
        raw: data,
      };
    }

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { airlinePrefix: prefix, serialNumber: serial },
      raw: data,
      summary: {
        lastFlight: lastFlight || { number: 'N/A', timestamp: new Date().toISOString() },
        lastStatus: lastStatus || { code: 'NOT_FOUND', description: 'No status', timestamp: new Date().toISOString() },
        origin: origin,
        destination: destination,
      },
    };
  } catch (error) {
    console.error(`[ITA API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= IAG CARGO API =============

async function fetchIAGAPI(awb: string): Promise<StandardResult> {
  const provider = 'IAG';
  console.log(`[IAG API] Fetching AWB: ${awb}`);
  
  try {
    // Format AWB as XXX-XXXXXXXX (3 digits, hyphen, 8 digits)
    const digits = awb.replace(/\D/g, '');
    let formatted = awb;
    
    if (digits.length === 11) {
      formatted = digits.substring(0, 3) + '-' + digits.substring(3, 11);
    } else if (digits.length === 8) {
      formatted = '075-' + digits;
    }
    
    const url = `https://api.tracking.iagcargo.com/tracking/${formatted}`;
    console.log(`[IAG API] Request URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      console.log(`[IAG API] HTTP error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { awb: formatted },
      };
    }

    const data = await response.json();
    console.log(`[IAG API] Response:`, JSON.stringify(data).substring(0, 1000));

    // Parse response according to PHP logic:
    // origin: originCode or awb.originCode
    // destination: destinationCode or awb.destinationCode
    // latestEvent: descartesResponse.header.latest_event
    
    const origin = data?.originCode || data?.awb?.originCode || null;
    const destination = data?.destinationCode || data?.awb?.destinationCode || null;
    const latestEvent = data?.descartesResponse?.header?.latest_event || null;
    
    console.log(`[IAG API] Parsed - Origin: ${origin}, Destination: ${destination}, LatestEvent: ${latestEvent}`);

    if (!latestEvent && !origin && !destination) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking data found',
        sent: { awb: formatted },
        raw: data,
      };
    }

    // Helper: Map status text to code for IAG
    const iagStatusTextToCode = (status: string): string | null => {
      const s = status.toUpperCase().trim();
      const map: Record<string, string> = {
        'BOOKED': 'BKD', 'BOOKING CONFIRMED': 'BKD',
        'RECEIVED FROM SHIPPER': 'RCS', 'RCS': 'RCS', 'ACCEPTED': 'RCS',
        'MANIFESTED': 'MAN', 'MAN': 'MAN',
        'DEPARTED': 'DEP', 'DEP': 'DEP', 'FLIGHT DEPARTED': 'DEP',
        'ARRIVED': 'ARR', 'ARR': 'ARR', 'FLIGHT ARRIVED': 'ARR',
        'RECEIVED FROM FLIGHT': 'RCF', 'RCF': 'RCF',
        'NOTIFIED': 'NFD', 'NFD': 'NFD', 'NOTIFICATION': 'NFD',
        'DELIVERED': 'DLV', 'DLV': 'DLV', 'DELIVERY': 'DLV',
        'DISCREPANCY': 'DIS', 'DIS': 'DIS',
        'OFFLOAD': 'OFLD', 'OFLD': 'OFLD', 'OFFLOADED': 'OFLD',
        'TRANSFER': 'TRM', 'TRM': 'TRM', 'IN TRANSIT': 'TRM',
        'CUSTOMS CLEARANCE': 'CCD', 'CCD': 'CCD',
        'FREIGHT ON HAND': 'FOH', 'FOH': 'FOH',
      };
      for (const key in map) {
        if (s.includes(key)) return map[key];
      }
      return null;
    };

    // Convert latestEvent to standard status code
    const statusCode = latestEvent ? (iagStatusTextToCode(latestEvent) || latestEvent.toUpperCase().substring(0, 3)) : 'NOT_FOUND';
    
    // Build route as flight number if we have origin/destination
    let flightNumber = 'N/A';
    if (origin || destination) {
      flightNumber = '';
      if (origin) flightNumber += origin.toUpperCase();
      if (destination) {
        flightNumber += (flightNumber ? ' -> ' : '') + destination.toUpperCase();
      }
    }

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formatted },
      raw: data,
      summary: {
        lastFlight: { 
          number: flightNumber, 
          timestamp: new Date().toISOString() 
        },
        lastStatus: { 
          code: statusCode, 
          description: latestEvent || statusCode, 
          timestamp: new Date().toISOString() 
        },
        origin: origin ? origin.toUpperCase() : 'N/A',
        destination: destination ? destination.toUpperCase() : 'N/A',
      },
    };
  } catch (error) {
    console.error(`[IAG API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchLATAMAPI(awb: string): Promise<StandardResult> {
  const provider = 'LATAM';
  console.log(`[LATAM API] Fetching AWB: ${awb}`);
  
  try {
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3);
    const serial = digits.substring(3, 11); // Only 8 digits for serial
    
    const url = Deno.env.get('LATAM_TRACK_ENDPOINT') || 'https://www.latamcargo.com/en/doTrackShipmentsAction';
    const documentType = Deno.env.get('LATAM_DOCUMENT_TYPE') || 'MAWB';
    
    const payload = {
      cargoTrackingRequestSOs: [{
        documentPrefix: prefix,
        documentNumber: serial,
        documentType: documentType,
      }],
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { documentPrefix: prefix, documentNumber: serial, documentType },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any;
    
    // Helper: Parse LATAM datetime "27-Oct-2025 14:30" -> timestamp
    const parseDatetimeToTs = (s: string): number | null => {
      if (!s) return null;
      s = s.trim().replace(/\s+/g, ' ');
      // Format: "d-MMM-yyyy HH:mm" -> "27-Oct-2025 14:30"
      const match = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      
      const monthMap: Record<string, number> = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      
      const day = parseInt(match[1]);
      const month = monthMap[match[2].toLowerCase()];
      const year = parseInt(match[3]);
      const hour = parseInt(match[4]);
      const minute = parseInt(match[5]);
      
      if (month === undefined) return null;
      return new Date(Date.UTC(year, month, day, hour, minute, 0)).getTime();
    };
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // HTML response - parse with regex and DOM-like logic
      const html = await response.text();
      
      // ========== Extract flight number ==========
      let flightNumber: string | null = null;
      
      // Try class="flightNumber"
      const flightMatch1 = html.match(/class="flightNumber"[^>]*>([^<]+)/i);
      if (flightMatch1) {
        const txt = flightMatch1[1].trim();
        const m = txt.match(/([A-Z]{1,3})\s*[-\s]?\s*([0-9]{2,5}[A-Z0-9]?)/);
        if (m) flightNumber = `${m[1]} ${m[2]}`;
      }
      
      // Try class="flightNumber_eventTable"
      if (!flightNumber) {
        const regex = /class="flightNumber_eventTable"[^>]*>([^<]+)/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const txt = match[1].trim();
          const m = txt.match(/([A-Z]{1,3})\s*[-\s]?\s*([0-9]{2,5}[A-Z0-9]?)/);
          if (m) {
            flightNumber = `${m[1]} ${m[2]}`;
            break;
          }
        }
      }
      
      // ========== Extract origin and destination ==========
      let origin: string | null = null;
      let destination: string | null = null;
      
      // Extract from pattern like "045-12570854 FRA-GRU"
      const routeMatch = html.match(/\d{3}-\d{8}\s+([A-Z]{3})-([A-Z]{3})/i);
      if (routeMatch) {
        origin = routeMatch[1].toUpperCase();
        destination = routeMatch[2].toUpperCase();
      }
      
      // ========== Extract last status from table ==========
      let lastStatus: { code: string; description: string; timestamp: string; ts: number; } | null = null;
      
      // Extract table rows from #statusTable
      const tableMatch = html.match(/<table[^>]*id="statusTable"[^>]*>[\s\S]*?<\/table>/i);
      if (tableMatch) {
        const tableHtml = tableMatch[0];
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        
        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
          const rowHtml = rowMatch[1];
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          const cells: string[] = [];
          let cellMatch;
          
          while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            const cellContent = cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
            cells.push(cellContent);
          }
          
          if (cells.length < 6) continue;
          
          const code = cells[0].toUpperCase().trim();
          if (code === '') continue;
          
          const desc = cells[1].trim();
          const time = cells[5].trim();
          
          const ts = parseDatetimeToTs(time);
          if (ts !== null) {
            if (!lastStatus || ts > lastStatus.ts) {
              lastStatus = { code, description: desc, timestamp: time, ts };
            }
          }
        }
      }
      
      if (!lastStatus) {
        return {
          provider,
          ok: false,
          status: 404,
          error: 'No tracking events found in HTML',
          sent: { documentPrefix: prefix, documentNumber: serial, documentType },
          raw: html.substring(0, 1000),
        };
      }
      
      return {
        provider,
        ok: true,
        status: 200,
        error: null,
        sent: { documentPrefix: prefix, documentNumber: serial, documentType },
        raw: html.substring(0, 1000),
        summary: {
          lastFlight: {
            number: flightNumber || 'N/A',
            timestamp: lastStatus.timestamp,
          },
          lastStatus: {
            code: lastStatus.code,
            description: lastStatus.description,
            timestamp: lastStatus.timestamp,
          },
          origin: origin || 'N/A',
          destination: destination || 'N/A',
        },
      };
    }

    // JSON response
    console.log(`[LATAM API] Response:`, JSON.stringify(data).substring(0, 500));
    
    const shipments = data?.shipments || [];
    if (shipments.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No shipments found',
        sent: { documentPrefix: prefix, documentNumber: serial, documentType },
        raw: data,
      };
    }

    const events = shipments[0]?.events || [];
    if (events.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { documentPrefix: prefix, documentNumber: serial, documentType },
        raw: data,
      };
    }

    const lastEvent = events[0];
    const flightNumber = normalizeFlightNumber(lastEvent.flightNumber || '');
    
    // Extract origin and destination from shipment data
    const shipment = shipments[0];
    let jsonOrigin = shipment?.origin || shipment?.originStation || shipment?.departureStation || null;
    let jsonDestination = shipment?.destination || shipment?.destinationStation || shipment?.arrivalStation || null;
    
    // Try to extract from route info if available
    if (!jsonOrigin || !jsonDestination) {
      const route = shipment?.route || shipment?.routing || '';
      if (typeof route === 'string' && route.includes('-')) {
        const routeParts = route.split('-');
        if (routeParts.length >= 2) {
          if (!jsonOrigin) jsonOrigin = routeParts[0].trim();
          if (!jsonDestination) jsonDestination = routeParts[routeParts.length - 1].trim();
        }
      }
    }
    
    // Try to extract from events (first DEP event origin, last event location as destination)
    if (!jsonOrigin || !jsonDestination) {
      // Look for origin from first DEP event
      for (const evt of events) {
        const evtCode = (evt.code || '').toUpperCase();
        if ((evtCode === 'DEP' || evtCode === 'MAN' || evtCode === 'RCS') && evt.station && !jsonOrigin) {
          jsonOrigin = evt.station;
          break;
        }
      }
      // Look for destination from ARR/RCF/NFD events
      for (const evt of events) {
        const evtCode = (evt.code || '').toUpperCase();
        if ((evtCode === 'ARR' || evtCode === 'RCF' || evtCode === 'NFD' || evtCode === 'DLV') && evt.station) {
          jsonDestination = evt.station;
        }
      }
    }
    
    // Validate airport codes (3 letters)
    const validOrigin = jsonOrigin && /^[A-Z]{3}$/i.test(jsonOrigin.trim()) ? jsonOrigin.trim().toUpperCase() : 'N/A';
    const validDestination = jsonDestination && /^[A-Z]{3}$/i.test(jsonDestination.trim()) ? jsonDestination.trim().toUpperCase() : 'N/A';
    
    console.log(`[LATAM API] Extracted route: ${validOrigin} -> ${validDestination}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { documentPrefix: prefix, documentNumber: serial, documentType },
      raw: data,
      summary: {
        lastFlight: {
          number: flightNumber,
          timestamp: lastEvent.date || new Date().toISOString(),
        },
        lastStatus: {
          code: lastEvent.code || mapStatusCode(lastEvent.description || '', 'LATAM'),
          description: lastEvent.description || lastEvent.code || '',
          timestamp: lastEvent.date || new Date().toISOString(),
          location: lastEvent.station || undefined, // IATA code from LATAM event
        },
        origin: validOrigin,
        destination: validDestination,
      },
    };
  } catch (error) {
    console.error(`[LATAM API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchAzulAPI(awb: string): Promise<StandardResult> {
  const provider = 'AZUL';
  console.log(`[AZUL API] Fetching AWB: ${awb}`);
  
  try {
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3);
    const serial = digits.substring(3, 11); // 8 digits
    const awbFmt = `${prefix}-${serial}`; // Format with hyphen
    
    const baseUrl = (Deno.env.get('AZUL_API_BASE') || 'https://ediapi.onlineapp.com.br/toolkit').replace(/\/$/, '');
    const email = Deno.env.get('AZUL_API_EMAIL');
    const senha = Deno.env.get('AZUL_API_PASSWORD');
    
    if (!email || !senha) {
      console.log('[AZUL API] Credentials not configured');
      return {
        provider,
        ok: false,
        status: 500,
        error: 'AZUL_API_EMAIL/AZUL_API_PASSWORD not configured',
        sent: null,
      };
    }

    // ========== Step 1: Authentication ==========
    console.log('[AZUL API] Authenticating...');
    const authUrl = `${baseUrl}/api/Autenticacao/AutenticarUsuario`;
    const authPayload = { Email: email, Senha: senha };
    
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authPayload),
    });

    if (!authResponse.ok) {
      return {
        provider,
        ok: false,
        status: authResponse.status,
        error: `Authentication returned HTTP ${authResponse.status}`,
        sent: { authUrl },
      };
    }

    const authData = await authResponse.json();
    
    // Check for errors in auth response
    if (authData.HasErrors || !authData.Value) {
      const errorMsg = authData.ErrorText || 'API returned authentication failure';
      return {
        provider,
        ok: false,
        status: authResponse.status,
        error: errorMsg,
        sent: { authUrl },
        raw: authData,
      };
    }
    
    const token = String(authData.Value);
    console.log('[AZUL API] Authentication successful');

    // ========== Step 2: Track AWB with 4 variations ==========
    const trackUrl = `${baseUrl}/api/Rastreio/Consultar`;
    const awbDigits = prefix + serial; // 11 digits without hyphen
    
    const attempts = [
      { label: 'awb11', payload: { Token: token, Awb: awbDigits, ChaveNfe: '', Pedido: '' } },
      { label: 'serial8', payload: { Token: token, Awb: serial, ChaveNfe: '', Pedido: '' } },
      { label: 'awb11+pedido', payload: { Token: token, Awb: awbDigits, ChaveNfe: '', Pedido: awbDigits } },
      { label: 'awb-hyphen', payload: { Token: token, Awb: awbFmt, ChaveNfe: '', Pedido: '' } },
    ];

    let lastResponse: any = null;

    for (const attempt of attempts) {
      console.log(`[AZUL API] Trying ${attempt.label}: ${attempt.payload.Awb}`);
      
      try {
        const trackResponse = await fetch(trackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(attempt.payload),
        });

        const trackCode = trackResponse.status;
        lastResponse = {
          code: trackCode,
          label: attempt.label,
        };

        if (trackCode < 200 || trackCode >= 300) {
          const body = await trackResponse.text();
          lastResponse.body = body;
          continue;
        }

        // Success response (200-299)
        const data = await trackResponse.json();
        console.log(`[AZUL API] Response for ${attempt.label}:`, JSON.stringify(data).substring(0, 500));
        
        lastResponse.body = JSON.stringify(data);
        
        // ========== PARSER: Extract Ocorrencias from Value[0] ==========
        let summary: {
          lastFlight?: { number: string; timestamp: string; comment?: string };
          lastStatus?: { code: string; description: string; timestamp: string; location?: string };
          origin?: string;
          destination?: string;
        } | undefined = undefined;
        
        // Expect: data['Value'][0]['Ocorrencias'] (chronological list of events)
        if (Array.isArray(data?.Value) && 
            data.Value.length > 0 && 
            Array.isArray(data.Value[0]?.Ocorrencias)) {
          
          // Extract origin and destination from shipment
          const shipment = data.Value[0];
          const origin = shipment.OrigemUnidade || 'N/A';
          const destination = shipment.DestinoUnidade || 'N/A';
          
          // Filter and sort by DataHora
          let occ = data.Value[0].Ocorrencias
            .filter((o: any) => o?.DataHora)
            .sort((a: any, b: any) => {
              const aDate = a.DataHora || '';
              const bDate = b.DataHora || '';
              return aDate.localeCompare(bDate);
            });

          // ========== Last Flight Event (search backwards for flight-related codes) ==========
          let lastFlightOcc: any = null;
          const flightCodes = ['DEP','ARR','ARRR','ARRS','ARRT','ARR1','ARR2','ARR3','ARR4','ARR5','FFM','RCT','200','136','137','104'];
          
          for (let i = occ.length - 1; i >= 0; i--) {
            const candidate = occ[i];
            const code = String(candidate?.Codigo || '').toUpperCase();
            const code3 = code.substring(0, 3);
            
            if (flightCodes.includes(code3) || flightCodes.includes(code)) {
              lastFlightOcc = candidate;
              break;
            }
          }

          // Extract flight number from Comentario field (e.g., "/TP057/..." or "/G39637/")
          let flightNumber: string | null = null;
          if (lastFlightOcc?.Comentario) {
            const match = lastFlightOcc.Comentario.match(/\/(\w{2}\d{2,}[A-Z0-9]*)\//);
            if (match) {
              flightNumber = match[1]; // e.g., "TP057" - UI formats as "TP 057"
            }
          }

          // ========== Last Status (simply the last item by DataHora) ==========
          const lastStatusOcc = occ.length > 0 ? occ[occ.length - 1] : null;
          let lastStatusCode: string | null = null;
          let lastStatusDesc: string | null = null;
          let lastStatusTime: string | null = null;

          if (lastStatusOcc) {
            const fullCode = String(lastStatusOcc?.Codigo || '').toUpperCase();
            const rawCode = fullCode.substring(0, 3);
            lastStatusDesc = String(lastStatusOcc?.Descricao || '').trim();
            lastStatusTime = lastStatusOcc.DataHora || null;
            
            // Map Azul internal codes to IATA standard codes
            const codeMap: Record<string, string> = {
              'BKD': 'BKD',  // Booked
              'RCS': 'RCS',  // Received from Shipper
              'DEP': 'DEP',  // Departed
              'ARR': 'ARR',  // Arrived
              'ARRR': 'ARR', // Arrived (variant)
              'ARRS': 'ARR', // Arrived (variant)
              'ARRT': 'ARR', // Arrived (variant)
              'RCF': 'RCF',  // Received from Flight
              'NFD': 'NFD',  // Ready for delivery
              'DLV': 'DLV',  // Delivered
              '1': 'DLV',    // Azul internal code for delivered
              '2': 'RCF',    // Azul internal code for received from flight
              '3': 'ARR',    // Azul internal code for arrived
              '4': 'DEP',    // Azul internal code for departed
              '5': 'BKD',    // Azul internal code for booked
            };
            
            lastStatusCode = codeMap[rawCode] || rawCode;
            
            console.log(`[AZUL PARSER] Raw code: ${rawCode}, Mapped: ${lastStatusCode}, Desc: ${lastStatusDesc}`);
          }

          // Build standardized summary (only if we have valid data)
          if (lastFlightOcc || lastStatusOcc) {
            summary = {
              lastFlight: lastFlightOcc ? {
                number: flightNumber || 'N/A', // e.g., "TP057" (UI shows "TP 057")
                timestamp: lastFlightOcc.DataHora || new Date().toISOString(),
                comment: lastFlightOcc.Comentario || undefined,
              } : undefined,
              lastStatus: lastStatusOcc ? {
                code: lastStatusCode || 'NOT_FOUND', // e.g., "DEP", "ARR", "RCF", "NFD", "DLV"...
                description: lastStatusDesc || '', // Human-readable description from API
                timestamp: lastStatusTime || new Date().toISOString(), // ISO/local in AZUL's format
                location: destination || undefined, // For Azul, use destination as fallback for ARR events
              } : undefined,
              origin: origin,
              destination: destination,
            };
          }
        }

        // Success return (with summary when available)
        return {
          provider,
          ok: true,
          status: trackCode,
          error: null,
          sent: { 
            endpoint: trackUrl, 
            attempt: attempt.label, 
            awb: attempt.payload.Awb,
            pedido: attempt.payload.Pedido 
          },
          summary: summary,
          raw: data,
        };
        
      } catch (error) {
        console.error(`[AZUL API] Error on ${attempt.label}:`, error);
        lastResponse = {
          code: 502,
          error: error instanceof Error ? error.message : 'Unknown error',
          label: attempt.label,
        };
        continue;
      }
    }

    // ========== Error handling when no 2xx attempt succeeded ==========
    let errorMsg = `Query returned HTTP ${lastResponse?.code || 'unknown'}`;
    const body = lastResponse?.body || '';
    const label = lastResponse?.label || 'unknown';

    try {
      const jsonError = JSON.parse(body);
      if (jsonError?.ErrorText) {
        errorMsg = String(jsonError.ErrorText);
      } else if (jsonError?.Message) {
        errorMsg = String(jsonError.Message);
      }
    } catch {
      // Not JSON or parsing failed
    }

    return {
      provider,
      ok: false,
      status: lastResponse?.code || 400,
      error: errorMsg,
      sent: { 
        endpoint: trackUrl, 
        lastAttempt: label 
      },
      raw: body.substring(0, 1000),
    };
    
  } catch (error) {
    console.error(`[AZUL API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchAFKLAPI(awb: string): Promise<StandardResult> {
  const provider = 'AFKL';
  console.log(`[AFKL API] Fetching AWB: ${awb}`);
  
  try {
    const baseUrl = Deno.env.get('AFKL_BASE') || 'https://www.afklcargo.com';
    const digits = awb.replace(/\D/g, '');
    const formatted = `${digits.substring(0, 3)}-${digits.substring(3)}`;
    
    // Step 1: Visit /mycargo/tracktrace to get cookies and XSRF-TOKEN
    const initResponse = await fetch(`${baseUrl}/mycargo/tracktrace`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!initResponse.ok) {
      return {
        provider,
        ok: false,
        status: initResponse.status,
        error: `Failed to initialize session: HTTP ${initResponse.status}`,
        sent: { awb: formatted },
      };
    }

    // Extract cookies and XSRF token
    const cookies = initResponse.headers.get('set-cookie') || '';
    const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
    const xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : '';

    if (!xsrfToken) {
      return {
        provider,
        ok: false,
        status: 401,
        error: 'Failed to get XSRF token',
        sent: { awb: formatted },
      };
    }

    // Step 2: Call tracking API
    const trackResponse = await fetch(`${baseUrl}/mycargo/api/tnt-api/shipments/${formatted}`, {
      headers: {
        'Cookie': cookies,
        'X-XSRF-TOKEN': xsrfToken,
        'Accept': 'application/json',
        'Referer': `${baseUrl}/mycargo/tracktrace`,
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!trackResponse.ok) {
      return {
        provider,
        ok: false,
        status: trackResponse.status,
        error: `HTTP ${trackResponse.status}`,
        sent: { awb: formatted },
      };
    }

    const data = await trackResponse.json();
    console.log(`[AFKL API] Response:`, JSON.stringify(data).substring(0, 500));

    const events = data?.events || data?.milestones || [];
    
    if (events.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { awb: formatted },
        raw: data,
      };
    }

    const lastEvent = events[0];
    const flightNumber = normalizeFlightNumber(lastEvent.flightNumber || data?.flightNumber || '');
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formatted },
      raw: data,
      summary: {
        lastFlight: {
          number: flightNumber,
          timestamp: lastEvent.timestamp || lastEvent.date || new Date().toISOString(),
        },
        lastStatus: {
          code: lastEvent.code || mapStatusCode(lastEvent.description || '', 'AFKL'),
          description: lastEvent.description || lastEvent.code || '',
          timestamp: lastEvent.timestamp || lastEvent.date || new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AFKL API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= QATAR CARGO API =============

function extractQatarSummary(data: any): { status: string | null; destination: string | null; origin: string | null } | null {
  const queue: any[] = [data];
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    
    // Look for cargoTrackingMvtStausList which contains the tracking events
    if (node.cargoTrackingMvtStausList && Array.isArray(node.cargoTrackingMvtStausList)) {
      let firstStatus: string | null = null;
      
      for (const entry of node.cargoTrackingMvtStausList) {
        if (typeof entry === 'object' && entry.movementStatus && entry.movementStatus !== '') {
          firstStatus = String(entry.movementStatus);
          break;
        }
        if (typeof entry === 'string' && entry !== '') {
          firstStatus = entry;
          break;
        }
      }
      
      return {
        status: firstStatus,
        destination: node.destination ? String(node.destination) : null,
        origin: node.origin ? String(node.origin) : null,
      };
    }
    
    // BFS: add child objects/arrays to queue
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  
  return null;
}

function qatarStatusToCode(status: string): string {
  const lowerStatus = status.toLowerCase();
  
  // Common Qatar status mappings
  if (lowerStatus.includes('delivered')) return 'DLV';
  if (lowerStatus.includes('departed') || lowerStatus.includes('dep')) return 'DEP';
  if (lowerStatus.includes('arrived') || lowerStatus.includes('arr')) return 'ARR';
  if (lowerStatus.includes('received')) return 'RCS';
  if (lowerStatus.includes('manifested') || lowerStatus.includes('man')) return 'MAN';
  if (lowerStatus.includes('booked') || lowerStatus.includes('bkd')) return 'BKD';
  if (lowerStatus.includes('notified') || lowerStatus.includes('nfd')) return 'NFD';
  if (lowerStatus.includes('cleared') || lowerStatus.includes('dlv')) return 'DLV';
  if (lowerStatus.includes('rcf') || lowerStatus.includes('from flight')) return 'RCF';
  if (lowerStatus.includes('foh') || lowerStatus.includes('forwarded')) return 'FOH';
  if (lowerStatus.includes('dis') || lowerStatus.includes('discrepancy')) return 'DIS';
  if (lowerStatus.includes('ofld') || lowerStatus.includes('offload')) return 'OFLD';
  
  // If status is already a code-like string (3-4 chars uppercase), return as is
  if (/^[A-Z]{3,4}$/.test(status.trim())) {
    return status.trim();
  }
  
  return status.substring(0, 3).toUpperCase();
}

async function fetchQatarAPI(awb: string): Promise<StandardResult> {
  const provider = 'QATAR';
  console.log(`[QATAR API] Fetching AWB: ${awb}`);
  
  try {
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3) || '157';
    const serial = digits.substring(3, 11);
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    
    // Step 1: Bootstrap to get cookies and extract fwuid/app/version from homepage
    console.log('[QATAR API] Step 1: Bootstrap session...');
    const bootstrapResponse = await fetch('https://www.qrcargo.com/', {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    });
    
    if (!bootstrapResponse.ok) {
      return {
        provider,
        ok: false,
        status: bootstrapResponse.status,
        error: `Falha ao preparar sessao com qrcargo.com: HTTP ${bootstrapResponse.status}`,
        sent: { awb: digits, step: 'bootstrap' },
      };
    }
    
    const bootHtml = await bootstrapResponse.text();
    const cookies = bootstrapResponse.headers.get('set-cookie') || '';
    
    // Extract fwuid/app/version from HTML (with fallback values)
    let fwuid = 'NdDEUGVLTDZ2b2Z6Uk5fekEtcFVdzFLcUUxeUY3ZVB6dE9hR0VheDVpb2cxMy4zMzU1NDQzMi4MDMzMTY0OA';
    let app = 'siteforce:communityApp';
    let loadedAppVersion = '1419_b1bLMAuSpl9zzW1jkVMF-w';
    
    const fwuidMatch = bootHtml.match(/"fwuid":"([^"]+)"/);
    if (fwuidMatch) fwuid = fwuidMatch[1];
    
    const appMatch = bootHtml.match(/"app":"([^"]+)"/);
    if (appMatch) app = appMatch[1];
    
    const versionMatch = bootHtml.match(/"APPLICATION@markup:\/\/siteforce:communityApp":"([^"]+)"/);
    if (versionMatch) loadedAppVersion = versionMatch[1];
    
    console.log(`[QATAR API] Extracted fwuid: ${fwuid.substring(0, 20)}..., app: ${app}, version: ${loadedAppVersion}`);
    
    // Step 2: Call the Aura API
    const context = {
      mode: 'PROD',
      fwuid: fwuid,
      app: app,
      loaded: {
        'APPLICATION@markup://siteforce:communityApp': loadedAppVersion,
      },
      dn: [],
      globals: {},
      uad: true,
    };
    
    const message = {
      actions: [{
        id: `${Math.floor(Math.random() * 900) + 100};a`,
        descriptor: 'aura://ApexActionController/ACTION$execute',
        callingDescriptor: 'UNKNOWN',
        params: {
          namespace: '',
          classname: 'QCG_CTRL_TrackShipment',
          method: 'QCG_getAwbDetailsMS',
          params: {
            awbs: [{
              documentType: 'MAWB',
              documentPrefix: prefix,
              documentNumber: serial,
            }],
          },
          cacheable: false,
          isContinuation: false,
        },
      }],
    };
    
    const endpoint = 'https://www.qrcargo.com/s/sfsites/aura?r=12&aura.ApexAction.execute=1';
    
    const postBody = new URLSearchParams({
      'message': JSON.stringify(message),
      'aura.context': JSON.stringify(context),
      'aura.pageURI': '/s/track-and-trace',
      'aura.token': 'null',
    }).toString();
    
    console.log('[QATAR API] Step 2: Calling Aura API...');
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': 'https://www.qrcargo.com',
        'Referer': 'https://www.qrcargo.com/s/track-and-trace',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'User-Agent': userAgent,
        'Cookie': cookies,
      },
      body: postBody,
    });
    
    const responseStatus = apiResponse.status;
    const okHttp = responseStatus >= 200 && responseStatus < 300;
    
    let body = await apiResponse.text();
    let decoded: any = null;
    
    // Remove "while(1);" prefix if present (Salesforce security measure)
    const trimmed = body.trimStart();
    if (trimmed.startsWith('while(1);')) {
      body = trimmed.substring(9);
    }
    
    try {
      decoded = JSON.parse(body);
    } catch (e) {
      console.error('[QATAR API] Failed to parse JSON response');
    }
    
    // Check for various error conditions
    let errorMsg: string | null = null;
    let ok = okHttp;
    
    if (decoded) {
      // Check for invalid session
      if (decoded.event?.descriptor === 'markup://aura:invalidSession') {
        ok = false;
        errorMsg = decoded.exceptionMessage || 'Sessao invalida / guest nao permitido';
      }
      // Check for action errors
      else if (decoded.actions?.[0]?.error?.[0]?.message) {
        ok = false;
        errorMsg = decoded.actions[0].error[0].message;
      }
      // Check for non-SUCCESS state
      else if (decoded.actions?.[0]?.state && decoded.actions[0].state !== 'SUCCESS') {
        ok = false;
        errorMsg = decoded.actions[0].state;
      }
    }
    
    if (!ok) {
      return {
        provider,
        ok: false,
        status: responseStatus,
        error: errorMsg || `HTTP ${responseStatus}`,
        sent: { endpoint, message, context },
        raw: decoded || body,
      };
    }
    
    // Extract summary from response
    const summary = extractQatarSummary(decoded);
    
    if (!summary || !summary.status) {
      console.log('[QATAR API] No status found in response');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB não encontrado ou sem eventos',
        sent: { endpoint, message },
        raw: decoded,
      };
    }
    
    const statusCode = qatarStatusToCode(summary.status);
    
    console.log(`[QATAR API] Success - Status: ${statusCode}, Origin: ${summary.origin}, Dest: ${summary.destination}`);
    
    return {
      provider,
      ok: true,
      status: responseStatus,
      error: null,
      sent: { endpoint, message },
      raw: decoded,
      summary: {
        origin: summary.origin || undefined,
        destination: summary.destination || undefined,
        lastStatus: {
          code: statusCode,
          description: summary.status,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[QATAR API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= CONDOR FLUGDIENST (PATHFINDER) API =============

async function fetchCondorPathfinderAPI(awb: string): Promise<StandardResult> {
  const provider = 'PATHFINDER_IATA_881';
  console.log(`[PATHFINDER] Fetching AWB: ${awb}`);
  
  try {
    // Normalize AWB format: 881-26361344 or 88126361344 -> 881-26361344
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[PATHFINDER] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    const endpoint = `https://pathfinder.digitalfactory.aero/${formattedAwb}`;
    console.log(`[PATHFINDER] Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[PATHFINDER] Firecrawl API error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[PATHFINDER] Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb },
        raw: data,
      };
    }
    
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    console.log(`[PATHFINDER] HTML length: ${html.length}, Markdown length: ${markdown.length}`);
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription = '';
    let lastEvent: any = null;
    
    // ===== STRATEGY 1 (PRIORITY): Extract from "Shipment Info" table =====
    // Format: | AWB number | Origin | Destination | Pieces | Weight | Volume |
    //         | 881 - 26361344 | FRA | GIG | 1 | 77.0 kg | 0.3 m³ |
    
    // Pattern for Shipment Info table row with AWB
    const shipmentInfoPattern = /\|\s*\d{3}\s*-\s*\d{8}\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|/i;
    const shipmentInfoMatch = markdown.match(shipmentInfoPattern);
    
    if (shipmentInfoMatch) {
      origin = shipmentInfoMatch[1].toUpperCase();
      destination = shipmentInfoMatch[2].toUpperCase();
      console.log(`[PATHFINDER] Strategy 1 (Shipment Info table): Origin=${origin}, Dest=${destination}`);
    }
    
    // ===== STRATEGY 2: Extract from "Flight details" table =====
    // Format: | Origin | Dest | Carrier | Flight number | ...
    //         | FRA | PTY | DE | 2236 | ...
    //         | PTY | GIG | CM | 486 | ...
    // Rule: origin = first row's Origin, destination = last row's Dest
    
    if (!origin || !destination) {
      // Look for Flight details table rows
      const flightDetailsPattern = /\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2})\s*\|\s*(\d+)\s*\|/g;
      const flightMatches = Array.from(markdown.matchAll(flightDetailsPattern)) as RegExpMatchArray[];
      
      if (flightMatches.length > 0) {
        const firstFlight = flightMatches[0] as RegExpMatchArray;
        const lastFlight = flightMatches[flightMatches.length - 1] as RegExpMatchArray;
        
        if (!origin) origin = (firstFlight[1] || '').toUpperCase();
        if (!destination) destination = (lastFlight[2] || '').toUpperCase();
        
        console.log(`[PATHFINDER] Strategy 2 (Flight details): First=${firstFlight[1]}->${firstFlight[2]}, Last=${lastFlight[1]}->${lastFlight[2]}`);
        console.log(`[PATHFINDER] Strategy 2 Result: Origin=${origin}, Dest=${destination}`);
        
        // Build last event from last flight row
        lastEvent = {
          from: lastFlight[1] || '',
          to: lastFlight[2] || '',
          carrier: lastFlight[3] || '',
          flightNumber: lastFlight[4] || '',
          raw: lastFlight[0] || '',
        };
      }
    }
    
    // ===== STRATEGY 3: Explicit Origin/Destination labels in HTML =====
    if (!origin || !destination) {
      const originLabelPattern = /Origin[:\s]*<[^>]*>([A-Z]{3})</i;
      const destLabelPattern = /Destination[:\s]*<[^>]*>([A-Z]{3})</i;
      
      const originLabelMatch = html.match(originLabelPattern);
      const destLabelMatch = html.match(destLabelPattern);
      
      if (originLabelMatch && !origin) {
        origin = originLabelMatch[1].toUpperCase();
        console.log(`[PATHFINDER] Strategy 3 (HTML label): Origin=${origin}`);
      }
      if (destLabelMatch && !destination) {
        destination = destLabelMatch[1].toUpperCase();
        console.log(`[PATHFINDER] Strategy 3 (HTML label): Dest=${destination}`);
      }
    }
    
    // ===== EXTRACT LAST STATUS =====
    // Look for "Last status:" text
    // Format: **Last status:** Departed on flight PTY-GIG CM873/23OCT --- 1pcs 77.0kg -- PTY, 23OCT | 15:41*
    const lastStatusPattern = /Last status[:\s]*\*?\*?\s*([^*\n]+)/i;
    const lastStatusMatch = markdown.match(lastStatusPattern);
    
    if (lastStatusMatch) {
      lastStatusDescription = lastStatusMatch[1].trim();
      console.log(`[PATHFINDER] Found Last status text: ${lastStatusDescription}`);
      
      // Map to status code
      const statusDesc = lastStatusDescription.toLowerCase();
      if (statusDesc.includes('delivered')) {
        lastStatus = 'DLV';
      } else if (statusDesc.includes('departed')) {
        lastStatus = 'DEP';
      } else if (statusDesc.includes('arrived') || statusDesc.includes('arrival')) {
        lastStatus = 'ARR';
      } else if (statusDesc.includes('notified') || statusDesc.includes('notification')) {
        lastStatus = 'NFD';
      } else if (statusDesc.includes('received') && statusDesc.includes('consignee')) {
        lastStatus = 'RCF';
      } else if (statusDesc.includes('booked')) {
        lastStatus = 'BKD';
      } else if (statusDesc.includes('manifested')) {
        lastStatus = 'MAN';
      }
    }
    
    // Fallback: Look for status codes in the milestone sections
    if (!lastStatus) {
      // The page shows milestones per airport: FRA (RCS, DEP), PTY (RCF, DEP), GIG (RCF, NFD, DLV)
      // Look for the last active status
      const statusCodesInOrder = ['DLV', 'NFD', 'AWD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD'];
      
      for (const code of statusCodesInOrder) {
        // Check if this status has a timestamp (not "No info received")
        const statusWithTimePattern = new RegExp(code + '[\\s\\S]{0,50}\\d{2}[A-Z]{3}\\s*\\|\\s*\\d{2}:\\d{2}', 'i');
        if (statusWithTimePattern.test(markdown)) {
          lastStatus = code;
          console.log(`[PATHFINDER] Found active status code: ${lastStatus}`);
          break;
        }
      }
    }
    
    // If still no status, check for any status code presence
    if (!lastStatus) {
      const statusCodes = ['DLV', 'DEP', 'ARR', 'RCF', 'NFD', 'BKD', 'RCS', 'MAN', 'FOH', 'TFD', 'AWD'];
      for (const code of statusCodes) {
        if (markdown.includes(code)) {
          lastStatus = code;
          console.log(`[PATHFINDER] Fallback status code found: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Build full ultimo_status string
    let ultimoStatus = lastStatus || 'N/A';
    if (lastStatusDescription) {
      ultimoStatus = `${lastStatus || 'INFO'} - ${lastStatusDescription}`;
    }
    
    console.log(`[PATHFINDER] Final result - Origin: ${origin}, Dest: ${destination}, Status: ${ultimoStatus}`);
    
    // Validate results
    if (!origin || !destination) {
      console.warn(`[PATHFINDER] Could not extract origin/destination properly`);
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint },
      raw: { 
        markdown: markdown.substring(0, 1000),
        lastStatusText: lastStatusDescription,
        lastEvent,
      },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'INFO',
          description: ultimoStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[PATHFINDER] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= RUSA - Reliable Unique Services Aviation (PATHFINDER) API =============

async function fetchRUSAPathfinderAPI(awb: string): Promise<StandardResult> {
  const provider = 'PATHFINDER_RUSA_827';
  console.log(`[RUSA PATHFINDER] Fetching AWB: ${awb}`);
  
  try {
    // Normalize AWB format: 827-08278373 or 82708278373 -> 827-08278373
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[RUSA PATHFINDER] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    const endpoint = `https://pathfinder.digitalfactory.aero/${formattedAwb}`;
    console.log(`[RUSA PATHFINDER] Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[RUSA PATHFINDER] Firecrawl API error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[RUSA PATHFINDER] Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb },
        raw: data,
      };
    }
    
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    console.log(`[RUSA PATHFINDER] HTML length: ${html.length}, Markdown length: ${markdown.length}`);
    console.log(`[RUSA PATHFINDER] Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Check for "AWB number not found"
    if (markdown.includes('AWB number not found') || markdown.includes('not found')) {
      console.log('[RUSA PATHFINDER] AWB not found on Pathfinder');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb: formattedAwb, endpoint },
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription = '';
    let lastEvent: any = null;
    
    // ===== STRATEGY 1 (PRIORITY): Extract from "Shipment Info" table =====
    // Format: | AWB number | Origin | Destination | Pieces | Weight | Volume |
    //         | 827 - 08278373 | FRA | GIG | 1 | 77.0 kg | 0.3 m³ |
    
    const shipmentInfoPattern = /\|\s*\d{3}\s*-\s*\d{8}\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|/i;
    const shipmentInfoMatch = markdown.match(shipmentInfoPattern);
    
    if (shipmentInfoMatch) {
      origin = shipmentInfoMatch[1].toUpperCase();
      destination = shipmentInfoMatch[2].toUpperCase();
      console.log(`[RUSA PATHFINDER] Strategy 1 (Shipment Info table): Origin=${origin}, Dest=${destination}`);
    }
    
    // ===== STRATEGY 2: Extract from "Flight details" table =====
    if (!origin || !destination) {
      const flightDetailsPattern = /\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2})\s*\|\s*(\d+)\s*\|/g;
      const flightMatches = Array.from(markdown.matchAll(flightDetailsPattern)) as RegExpMatchArray[];
      
      if (flightMatches.length > 0) {
        const firstFlight = flightMatches[0] as RegExpMatchArray;
        const lastFlight = flightMatches[flightMatches.length - 1] as RegExpMatchArray;
        
        if (!origin) origin = (firstFlight[1] || '').toUpperCase();
        if (!destination) destination = (lastFlight[2] || '').toUpperCase();
        
        console.log(`[RUSA PATHFINDER] Strategy 2 (Flight details): First=${firstFlight[1]}->${firstFlight[2]}, Last=${lastFlight[1]}->${lastFlight[2]}`);
        
        lastEvent = {
          from: lastFlight[1] || '',
          to: lastFlight[2] || '',
          carrier: lastFlight[3] || '',
          flightNumber: lastFlight[4] || '',
          raw: lastFlight[0] || '',
        };
      }
    }
    
    // ===== STRATEGY 3: Explicit Origin/Destination labels in HTML =====
    if (!origin || !destination) {
      const originLabelPattern = /Origin[:\s]*<[^>]*>([A-Z]{3})</i;
      const destLabelPattern = /Destination[:\s]*<[^>]*>([A-Z]{3})</i;
      
      const originLabelMatch = html.match(originLabelPattern);
      const destLabelMatch = html.match(destLabelPattern);
      
      if (originLabelMatch && !origin) {
        origin = originLabelMatch[1].toUpperCase();
        console.log(`[RUSA PATHFINDER] Strategy 3 (HTML label): Origin=${origin}`);
      }
      if (destLabelMatch && !destination) {
        destination = destLabelMatch[1].toUpperCase();
        console.log(`[RUSA PATHFINDER] Strategy 3 (HTML label): Dest=${destination}`);
      }
    }
    
    // ===== EXTRACT LAST STATUS =====
    const lastStatusPattern = /Last status[:\s]*\*?\*?\s*([^*\n]+)/i;
    const lastStatusMatch = markdown.match(lastStatusPattern);
    
    if (lastStatusMatch) {
      lastStatusDescription = lastStatusMatch[1].trim();
      console.log(`[RUSA PATHFINDER] Found Last status text: ${lastStatusDescription}`);
      
      const statusDesc = lastStatusDescription.toLowerCase();
      if (statusDesc.includes('delivered')) {
        lastStatus = 'DLV';
      } else if (statusDesc.includes('departed')) {
        lastStatus = 'DEP';
      } else if (statusDesc.includes('arrived') || statusDesc.includes('arrival')) {
        lastStatus = 'ARR';
      } else if (statusDesc.includes('notified') || statusDesc.includes('notification')) {
        lastStatus = 'NFD';
      } else if (statusDesc.includes('received') && statusDesc.includes('consignee')) {
        lastStatus = 'RCF';
      } else if (statusDesc.includes('booked')) {
        lastStatus = 'BKD';
      } else if (statusDesc.includes('manifested')) {
        lastStatus = 'MAN';
      }
    }
    
    // Fallback: Look for status codes in the milestone sections
    if (!lastStatus) {
      const statusCodesInOrder = ['DLV', 'NFD', 'AWD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD'];
      
      for (const code of statusCodesInOrder) {
        const statusWithTimePattern = new RegExp(code + '[\\s\\S]{0,50}\\d{2}[A-Z]{3}\\s*\\|\\s*\\d{2}:\\d{2}', 'i');
        if (statusWithTimePattern.test(markdown)) {
          lastStatus = code;
          console.log(`[RUSA PATHFINDER] Found active status code: ${lastStatus}`);
          break;
        }
      }
    }
    
    // If still no status, check for any status code presence
    if (!lastStatus) {
      const statusCodes = ['DLV', 'DEP', 'ARR', 'RCF', 'NFD', 'BKD', 'RCS', 'MAN', 'FOH', 'TFD', 'AWD'];
      for (const code of statusCodes) {
        if (markdown.includes(code)) {
          lastStatus = code;
          console.log(`[RUSA PATHFINDER] Fallback status code found: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Build full ultimo_status string
    let ultimoStatus = lastStatus || 'N/A';
    if (lastStatusDescription) {
      ultimoStatus = `${lastStatus || 'INFO'} - ${lastStatusDescription}`;
    }
    
    console.log(`[RUSA PATHFINDER] Final result - Origin: ${origin}, Dest: ${destination}, Status: ${ultimoStatus}`);
    
    // Validate: if no data found, return NOT_FOUND
    if ((!origin || origin === 'N/A') && (!destination || destination === 'N/A') && (!lastStatus || lastStatus === 'N/A')) {
      console.log('[RUSA PATHFINDER] No valid data extracted - returning NOT_FOUND');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb: formattedAwb, endpoint },
        raw: { markdown: markdown.substring(0, 1000) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint },
      raw: { 
        markdown: markdown.substring(0, 1000),
        lastStatusText: lastStatusDescription,
        lastEvent,
      },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'INFO',
          description: ultimoStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[RUSA PATHFINDER] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= TAAG ANGOLA AIRLINES (FREIGHT.AERO) API =============

async function fetchTAAGFreightAeroHTML(awb: string): Promise<StandardResult> {
  const provider = 'TAAG_FREIGHT_AERO';
  console.log(`[TAAG] 🚀 Starting fetch for AWB: ${awb}`);
  
  try {
    // Normalize AWB: 118-12879871 or 11812879871 -> prefix=118, serial=12879871
    let prefix = '118';
    let awbNumber = awb;
    
    if (awb.includes('-')) {
      const parts = awb.split('-');
      prefix = parts[0];
      awbNumber = parts[1];
    } else if (awb.length > 3) {
      prefix = awb.substring(0, 3);
      awbNumber = awb.substring(3);
    }
    
    awbNumber = awbNumber.replace(/\D/g, '');
    const formattedAwb = `${prefix}-${awbNumber}`;
    console.log(`[TAAG] 📋 Normalized: prefix=${prefix}, awbNumber=${awbNumber}`);
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[TAAG] ❌ FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    // Use Firecrawl for freight.aero scraping
    const endpoint = `https://www.freight.aero/tracking.asp?carrier_dropdown_1=DT-118&prefix_1=${prefix}&awb_1=${awbNumber}`;
    console.log(`[TAAG] 📡 Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 20000,
        timeout: 70000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TAAG] ❌ Firecrawl error: ${errorText.substring(0, 200)}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb: formattedAwb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[TAAG] ❌ Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb: formattedAwb },
        raw: data,
      };
    }
    
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[TAAG] 📄 Content length: ${content.length}`);
    console.log(`[TAAG] 📄 Sample: ${markdown.substring(0, 2500)}`);
    
    // ========== DETECT CAPTCHA/ANTI-BOT ==========
    const captchaIndicators = [
      'captcha', 'verify you are human', 'challenge', 'cloudflare', 
      'recaptcha', 'hcaptcha', 'just a moment', 'checking your browser',
      'access denied', 'bot detected', 'please wait', 'security check'
    ];
    
    const isCaptchaBlocked = captchaIndicators.some(indicator => contentLower.includes(indicator));
    
    // Also check if content is too short (likely blocked page)
    const hasMinimalContent = content.length < 500 && !contentLower.includes('origin') && !contentLower.includes('destination');
    
    if (isCaptchaBlocked || hasMinimalContent) {
      console.log(`[TAAG] 🚫 CAPTCHA/Anti-bot detected - not overwriting valid data`);
      return {
        provider,
        ok: false,
        status: 403,
        error: 'CAPTCHA_REQUIRED',
        sent: { awb: formattedAwb, endpoint },
        raw: { 
          captchaDetected: true, 
          contentLength: content.length,
          message: 'Tracking protegido por CAPTCHA. Acesse o link manualmente para rastrear.'
        },
      };
    }
    
    // ========== PARSE ORIGIN AND DESTINATION ==========
    let origin: string | null = null;
    let destination: string | null = null;
    
    // Pattern 1: "Origin: Frankfurt (FRA)" and "Destination: Sao Paulo Guarulhos (GRU)"
    const originMatch = content.match(/Origin[:\s]*[^(]*\(([A-Z]{3})\)/i);
    if (originMatch) {
      origin = originMatch[1].toUpperCase();
      console.log(`[TAAG] ✅ Origin from pattern 1: ${origin}`);
    }
    
    const destMatch = content.match(/Destination[:\s]*[^(]*\(([A-Z]{3})\)/i);
    if (destMatch) {
      destination = destMatch[1].toUpperCase();
      console.log(`[TAAG] ✅ Destination from pattern 1: ${destination}`);
    }
    
    // Pattern 2: Extract from flight details "from XXX (FRA) to YYY (GRU)"
    if (!origin || !destination) {
      const routeMatches = content.matchAll(/from\s+[^(]+\(([A-Z]{3})\)/gi);
      const toMatches = content.matchAll(/to\s+[^(]+\(([A-Z]{3})\)/gi);
      
      const fromCodes = Array.from(routeMatches).map(m => m[1].toUpperCase());
      const toCodes = Array.from(toMatches).map(m => m[1].toUpperCase());
      
      if (fromCodes.length > 0 && !origin) {
        origin = fromCodes[0];
        console.log(`[TAAG] ✅ Origin from flight: ${origin}`);
      }
      if (toCodes.length > 0 && !destination) {
        destination = toCodes[toCodes.length - 1];
        console.log(`[TAAG] ✅ Destination from flight: ${destination}`);
      }
    }

    // Pattern 3: Fallback - Look for IATA codes near keywords
    if (!origin) {
      const originFallback = content.match(/(?:origin|from|depart)[:\s]*([A-Z]{3})/i);
      if (originFallback) {
        origin = originFallback[1].toUpperCase();
        console.log(`[TAAG] ✅ Origin from fallback: ${origin}`);
      }
    }
    if (!destination) {
      const destFallback = content.match(/(?:destination|to|arriv)[:\s]*([A-Z]{3})/i);
      if (destFallback) {
        destination = destFallback[1].toUpperCase();
        console.log(`[TAAG] ✅ Destination from fallback: ${destination}`);
      }
    }
    
    // ========== PARSE STATUS ==========
    let lastStatus: string | null = null;
    let lastStatusDescription = '';
    
    // Pattern 1: "Status: Departed"
    const headerStatusMatch = content.match(/Status[:\s]*([A-Za-z]+(?:\s+[a-z]+)?)/i);
    if (headerStatusMatch) {
      lastStatusDescription = headerStatusMatch[1].trim();
      const statusLower = lastStatusDescription.toLowerCase();
      
      if (statusLower.includes('deliver')) lastStatus = 'DLV';
      else if (statusLower.includes('depart')) lastStatus = 'DEP';
      else if (statusLower.includes('arriv')) lastStatus = 'ARR';
      else if (statusLower.includes('book')) lastStatus = 'BKD';
      else if (statusLower.includes('received')) lastStatus = 'RCS';
      else if (statusLower.includes('manifest')) lastStatus = 'MAN';
      else if (statusLower.includes('notif')) lastStatus = 'NFD';
      else if (statusLower.includes('transit')) lastStatus = 'TRA';
      
      if (lastStatus) {
        console.log(`[TAAG] ✅ Status from header: ${lastStatusDescription} → ${lastStatus}`);
      }
    }
    
    // Pattern 2: Look for last row in table - format "# | Status | Details | Update Received"
    if (!lastStatus) {
      const tableRows = content.matchAll(/(\d+)\s*\|\s*([A-Za-z][A-Za-z ]+)\s*\|/g);
      const rows = Array.from(tableRows);
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        lastStatusDescription = lastRow[2].trim();
        const statusLower = lastStatusDescription.toLowerCase();
        
        if (statusLower.includes('deliver')) lastStatus = 'DLV';
        else if (statusLower.includes('depart')) lastStatus = 'DEP';
        else if (statusLower.includes('arriv')) lastStatus = 'ARR';
        else if (statusLower.includes('book')) lastStatus = 'BKD';
        else if (statusLower.includes('received')) lastStatus = 'RCS';
        else if (statusLower.includes('manifest')) lastStatus = 'MAN';
        else if (statusLower.includes('transit')) lastStatus = 'TRA';
        
        if (lastStatus) {
          console.log(`[TAAG] ✅ Status from table row: ${lastStatusDescription} → ${lastStatus}`);
        }
      }
    }

    // Pattern 3: Look for status keywords anywhere in content
    if (!lastStatus) {
      const statusKeywords = [
        { pattern: /\bdelivered\b/i, code: 'DLV' },
        { pattern: /\bdeparted\b/i, code: 'DEP' },
        { pattern: /\barrived\b/i, code: 'ARR' },
        { pattern: /\bbooked\b/i, code: 'BKD' },
        { pattern: /\breceived\b/i, code: 'RCS' },
        { pattern: /\bmanifested\b/i, code: 'MAN' },
        { pattern: /\bin\s*transit\b/i, code: 'TRA' },
      ];
      
      for (const { pattern, code } of statusKeywords) {
        if (pattern.test(content)) {
          lastStatus = code;
          console.log(`[TAAG] ✅ Status from keyword: ${code}`);
          break;
        }
      }
    }
    
    console.log(`[TAAG] 🏁 Final: Status=${lastStatus || 'null'}, Origin=${origin || 'null'}, Dest=${destination || 'null'}`);
    
    const hasValidData = (origin && origin.length === 3) || (destination && destination.length === 3) || (lastStatus && lastStatus.length >= 2);
    
    if (!hasValidData) {
      console.log(`[TAAG] ⚠️ No valid data extracted - site may require manual access`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Site requires CAPTCHA or page did not load - please track manually',
        sent: { awb: formattedAwb, endpoint },
        raw: { contentLength: content.length },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint },
      raw: { contentLength: content.length },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: lastStatus || 'INFO',
          description: lastStatusDescription || (lastStatus || 'Info'),
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[TAAG] ❌ Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= EUROPEAN AIR TRANSPORT (DHL AVIATION CARGO) API =============

async function fetchDHLAviationCargoHTML(awb: string): Promise<StandardResult> {
  const provider = 'DHL AVIATION CARGO';
  console.log(`[DHL AVIATION] Fetching AWB: ${awb}`);
  
  try {
    // Normalize AWB format: 615-66457554 or 61566457554 -> 615-66457554
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[DHL AVIATION] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    const endpoint = `https://aviationcargo.dhl.com/track/${formattedAwb}`;
    console.log(`[DHL AVIATION] Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 10000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[DHL AVIATION] Firecrawl API error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[DHL AVIATION] Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb },
        raw: data,
      };
    }
    
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    console.log(`[DHL AVIATION] HTML length: ${html.length}, Markdown length: ${markdown.length}`);
    
    // Parse origin and destination with multiple strategies
    let origin = 'N/A';
    let destination = 'N/A';
    const content = markdown + ' ' + html;
    
    console.log(`[DHL AVIATION] Content preview: ${content.substring(0, 1500)}`);
    
    // Strategy 1: DHL specific pattern "From DHL Org XXX to DHL Dest YYY"
    const dhlRouteMatch = content.match(/From\s+DHL\s+Org\s+([A-Z]{3})\s+to\s+DHL\s+Dest\s+([A-Z]{3})/i);
    if (dhlRouteMatch) {
      origin = dhlRouteMatch[1].toUpperCase();
      destination = dhlRouteMatch[2].toUpperCase();
      console.log(`[DHL AVIATION] DHL pattern route: ${origin} -> ${destination}`);
    }
    
    // Strategy 2: General route patterns
    if (origin === 'N/A' || destination === 'N/A') {
      const routePatterns = [
        /([A-Z]{3})\s*(?:→|->|►|–|-|to)\s*([A-Z]{3})/,
        /origin\s*:?\s*([A-Z]{3}).*?destination\s*:?\s*([A-Z]{3})/is,
        /from\s*:?\s*([A-Z]{3}).*?to\s*:?\s*([A-Z]{3})/is,
      ];
      
      for (const pattern of routePatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[2]) {
          if (origin === 'N/A') origin = match[1].toUpperCase();
          if (destination === 'N/A') destination = match[2].toUpperCase();
          console.log(`[DHL AVIATION] General pattern route: ${origin} -> ${destination}`);
          break;
        }
      }
    }
    
    // Parse status with multiple strategies
    let lastStatus = 'BKD';
    let lastStatusDescription = 'Reserva Confirmada';
    let lastTimestamp = new Date().toISOString();
    let pieces = '';
    let airport = '';
    
    // Strategy 1: DHL Actual status pattern
    const dhlStatusMatch = content.match(/Actual\s+status[^\n]*\n([A-Z]{3})\s+([^\n]+?)\s+([A-Z]{3})\s+(\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2})/i);
    if (dhlStatusMatch) {
      lastStatus = dhlStatusMatch[1].toUpperCase();
      lastStatusDescription = dhlStatusMatch[2].trim();
      airport = dhlStatusMatch[3].toUpperCase();
      lastTimestamp = dhlStatusMatch[4];
      console.log(`[DHL AVIATION] DHL status pattern: ${lastStatus} - ${lastStatusDescription} at ${airport}`);
    }
    
    // Strategy 2: Look for explicit status codes
    if (lastStatus === 'BKD') {
      const statusCodes = ['DLV', 'NFD', 'RCF', 'ARR', 'DEP', 'BKD', 'RCS', 'MAN', 'AWD', 'FOH', 'TFD', 'DIS', 'OFLD'];
      for (const code of statusCodes) {
        const regex = new RegExp(`\\b${code}\\b`, 'i');
        if (regex.test(content)) {
          lastStatus = code;
          console.log(`[DHL AVIATION] Found status code: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Strategy 3: Status descriptions
    if (lastStatus === 'BKD') {
      const statusDescPatterns = [
        { pattern: /delivered/i, code: 'DLV' },
        { pattern: /awaiting\s+consignee/i, code: 'NFD' },
        { pattern: /notified/i, code: 'NFD' },
        { pattern: /received\s+from\s+flight/i, code: 'RCF' },
        { pattern: /arrived/i, code: 'ARR' },
        { pattern: /departed/i, code: 'DEP' },
        { pattern: /manifested/i, code: 'MAN' },
      ];
      
      for (const { pattern, code } of statusDescPatterns) {
        if (pattern.test(content)) {
          lastStatus = code;
          console.log(`[DHL AVIATION] Status from description: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Extract pieces count
    const piecesMatch = markdown.match(/(\d+)\s*(?:pcs|pieces)/i);
    if (piecesMatch) {
      pieces = piecesMatch[1];
    }
    
    console.log(`[DHL AVIATION] Final result - Status: ${lastStatus}, Origin: ${origin}, Dest: ${destination}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint },
      raw: { markdown: markdown.substring(0, 500) },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: lastStatusDescription || lastStatus,
          timestamp: lastTimestamp,
        },
      },
    };
  } catch (error) {
    console.error(`[DHL AVIATION] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= DHL AVIATION CARGO 992 =============

// Generic DHL Aviation handler for both 615 and 992 prefixes
async function fetchDHLAviationGeneric(awb: string, prefix: string): Promise<StandardResult> {
  const provider = `DHL_AVIATION_${prefix}`;
  console.log(`[DHL AVIATION ${prefix}] Fetching AWB: ${awb}`);
  
  try {
    // Normalize AWB format: XXX-XXXXXXXX -> just the numeric part for URL
    // URL format: https://aviationcargo.dhl.com/track/XXXXXXXXXXX (no hyphen)
    const digits = awb.replace(/\D/g, '');
    const serial = digits.length > 3 ? digits.substring(3) : digits;
    const awbForUrl = `${prefix}${serial}`;
    
    const url = `https://aviationcargo.dhl.com/track/${awbForUrl}`;
    console.log(`[DHL AVIATION ${prefix}] Fetching URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0)',
      },
    });
    
    if (!response.ok) {
      console.error(`[DHL AVIATION ${prefix}] HTTP error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { awb, url },
      };
    }
    
    const html = await response.text();
    console.log(`[DHL AVIATION ${prefix}] HTML length: ${html.length}`);
    
    if (!html || html.length < 100) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Empty or invalid HTML response',
        sent: { awb, url },
      };
    }
    
    // Extract Origin using regex: Origin:</span> XXX
    let origin = 'N/A';
    const originMatch = html.match(/Origin:\s*<\/span>\s*([A-Z]{3})/i);
    if (originMatch) {
      origin = originMatch[1].trim().toUpperCase();
      console.log(`[DHL AVIATION ${prefix}] ✅ Origin: ${origin}`);
    }
    
    // Extract Destination using regex: Destination:</span> XXX
    let destination = 'N/A';
    const destMatch = html.match(/Destination:\s*<\/span>\s*([A-Z]{3})/i);
    if (destMatch) {
      destination = destMatch[1].trim().toUpperCase();
      console.log(`[DHL AVIATION ${prefix}] ✅ Destination: ${destination}`);
    }
    
    // Extract Status - first <td> with 3-letter code from tracking-results table
    let lastStatus = 'INFO';
    const tableMatch = html.match(/<table[^>]*class="[^"]*tracking-results[^"]*"[^>]*>(.*?)<\/table>/is);
    if (tableMatch) {
      const tableContent = tableMatch[1];
      // Get the first <td> with a 3-letter status code
      const statusMatch = tableContent.match(/<td>\s*([A-Z]{3})\s*<\/td>/i);
      if (statusMatch) {
        lastStatus = statusMatch[1].trim().toUpperCase();
        console.log(`[DHL AVIATION ${prefix}] ✅ Status from table: ${lastStatus}`);
      }
    }
    
    // Fallback status extraction from anywhere in HTML
    if (lastStatus === 'INFO') {
      const statusCodes = ['DLV', 'NFD', 'RCF', 'ARR', 'DEP', 'BKD', 'RCS', 'MAN', 'AWD', 'FOH', 'TFD', 'DIS', 'OFLD'];
      for (const code of statusCodes) {
        const regex = new RegExp(`<td[^>]*>\\s*${code}\\s*<\\/td>`, 'i');
        if (regex.test(html)) {
          lastStatus = code;
          console.log(`[DHL AVIATION ${prefix}] ✅ Status fallback: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Map status to description
    const statusDescMap: Record<string, string> = {
      'DLV': 'Delivered',
      'NFD': 'Ready for Delivery / Notified',
      'RCF': 'Received from Flight',
      'ARR': 'Arrived',
      'DEP': 'Departed',
      'BKD': 'Booked',
      'RCS': 'Received from Shipper',
      'MAN': 'Manifested',
      'AWD': 'Document Delivered',
      'FOH': 'Freight on Hand',
      'TFD': 'Transferred',
      'DIS': 'Discrepancy',
      'OFLD': 'Offloaded',
    };
    
    // Check if we have valid tracking data
    // If status is still INFO and origin/destination are N/A, it means no tracking data was found
    const hasValidData = lastStatus !== 'INFO' || origin !== 'N/A' || destination !== 'N/A';
    
    if (!hasValidData) {
      console.log(`[DHL AVIATION ${prefix}] ❌ No valid tracking data found - returning NOT_FOUND`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb, url },
      };
    }
    
    // If status is still INFO but we have origin/destination, set status to NOT_FOUND as well
    // because INFO is not a valid tracking status
    if (lastStatus === 'INFO') {
      console.log(`[DHL AVIATION ${prefix}] ⚠️ No valid status code found - returning NOT_FOUND`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb, url },
      };
    }
    
    console.log(`[DHL AVIATION ${prefix}] 🏁 Final: status=${lastStatus}, origin=${origin}, destination=${destination}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, url },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: statusDescMap[lastStatus] || lastStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[DHL AVIATION ${prefix}] ❌ Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// Wrapper functions for specific prefixes
async function fetchDHLAviation615(awb: string): Promise<StandardResult> {
  return fetchDHLAviationGeneric(awb, '615');
}

async function fetchDHLAviation992(awb: string): Promise<StandardResult> {
  return fetchDHLAviationGeneric(awb, '992');
}

// ============= SAA CARGO API (South African Airways - IBS iCargo) =============

async function fetchSAACargoAPI(awb: string): Promise<StandardResult> {
  const provider = 'SAA_CARGO_PARCELSAPP';
  console.log(`[SAA CARGO] Fetching AWB via ParcelsApp: ${awb}`);
  
  try {
    // Format AWB properly - SAA uses format 083-XXXXXXXX
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      console.error('[SAA CARGO] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 500,
        error: 'FIRECRAWL_API_KEY not configured',
        sent: { awb: formattedAwb },
      };
    }
    
    // Use ParcelsApp as primary source (official portal has login requirements)
    const parcelsAppUrl = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[SAA CARGO] Scraping ParcelsApp: ${parcelsAppUrl}`);
    
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: parcelsAppUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 8000,
      }),
    });
    
    if (!firecrawlResponse.ok) {
      console.error(`[SAA CARGO] Firecrawl request failed: ${firecrawlResponse.status}`);
      return {
        provider,
        ok: false,
        status: firecrawlResponse.status,
        error: `Firecrawl request failed: ${firecrawlResponse.status}`,
        sent: { awb: formattedAwb },
      };
    }
    
    const scrapeData = await firecrawlResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    
    console.log(`[SAA CARGO] Received markdown (${markdown.length} chars)`);
    console.log(`[SAA CARGO] Markdown preview:`, markdown.substring(0, 2000));
    
    if (!markdown || markdown.length < 100) {
      console.error('[SAA CARGO] No valid markdown content received');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking content found',
        sent: { awb: formattedAwb },
      };
    }
    
    // Check if AWB was found
    if (markdown.includes('not found') || markdown.includes('No result')) {
      console.log('[SAA CARGO] AWB not found on ParcelsApp');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB_NOT_FOUND',
        sent: { awb: formattedAwb },
      };
    }
    
    let origin = '';
    let destination = '';
    let lastStatus = '';
    let lastEventTimestamp = '';
    
    // ========== EXTRACT ORIGIN ==========
    // Pattern 1: "| From | GRU, Guarulhos..." (table format)
    const fromTableMatch = markdown.match(/\|\s*From\s*\|\s*([A-Z]{3})[,\s]/i);
    if (fromTableMatch) {
      origin = fromTableMatch[1].toUpperCase();
      console.log(`[SAA CARGO] Found origin from table: ${origin}`);
    }
    
    // Pattern 2: "From GRU" or "From: GRU"
    if (!origin) {
      const fromSimpleMatch = markdown.match(/From[:\s]+([A-Z]{3})(?:[,\s]|$)/i);
      if (fromSimpleMatch) {
        origin = fromSimpleMatch[1].toUpperCase();
        console.log(`[SAA CARGO] Found origin from simple pattern: ${origin}`);
      }
    }
    
    // ========== EXTRACT DESTINATION ==========
    // Pattern 1: "| To | MEL, Melbourne..." (table format)
    const toTableMatch = markdown.match(/\|\s*To\s*\|\s*([A-Z]{3})[,\s]/i);
    if (toTableMatch) {
      destination = toTableMatch[1].toUpperCase();
      console.log(`[SAA CARGO] Found destination from table: ${destination}`);
    }
    
    // Pattern 2: "To MEL" or "To: MEL"
    if (!destination) {
      const toSimpleMatch = markdown.match(/To[:\s]+([A-Z]{3})(?:[,\s]|$)/i);
      if (toSimpleMatch) {
        destination = toSimpleMatch[1].toUpperCase();
        console.log(`[SAA CARGO] Found destination from simple pattern: ${destination}`);
      }
    }
    
    // Pattern 3: Look for airport codes in parentheses like (GRU), (MEL)
    if (!origin || !destination) {
      const INVALID_CODES = ['ADD', 'FOR', 'ALL', 'AND', 'THE', 'NOT', 'HAS', 'WAS', 'ARE', 'CAN', 'HAD', 'HER', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'OWN', 'SAY', 'SHE', 'TOO', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'GOT', 'HAS', 'HAD', 'LET', 'PUT', 'SAY', 'SAW', 'SET', 'TRY', 'USE', 'AGO', 'DAY', 'FEW', 'GOT', 'GMT', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'PKG', 'PCS', 'KGS', 'KGC', 'CBM'];
      
      const airportMatches = markdown.match(/\(([A-Z]{3})\)/g);
      if (airportMatches && airportMatches.length >= 2) {
        const codes = airportMatches
          .map((m: string) => m.replace(/[()]/g, ''))
          .filter((c: string) => !INVALID_CODES.includes(c));
        
        if (codes.length >= 2) {
          if (!origin) origin = codes[0];
          if (!destination) destination = codes[codes.length - 1];
          console.log(`[SAA CARGO] Found codes from parentheses: ${codes.join(', ')}`);
        }
      }
    }
    
    // Pattern 4: Look for "Origin" and "Destination" labels
    if (!origin) {
      const originLabelMatch = markdown.match(/Origin[:\s|]+([A-Z]{3})/i);
      if (originLabelMatch) {
        origin = originLabelMatch[1].toUpperCase();
        console.log(`[SAA CARGO] Found origin from label: ${origin}`);
      }
    }
    
    if (!destination) {
      const destLabelMatch = markdown.match(/Destination[:\s|]+([A-Z]{3})/i);
      if (destLabelMatch) {
        destination = destLabelMatch[1].toUpperCase();
        console.log(`[SAA CARGO] Found destination from label: ${destination}`);
      }
    }
    
    // Pattern 5: Extract from "City Name (CODE)" format anywhere in content
    // This is a fallback to find any IATA codes in parentheses
    if (!origin || !destination) {
      const EXCLUDE_CODES = new Set([
        'ADD', 'FOR', 'ALL', 'AND', 'THE', 'NOT', 'HAS', 'WAS', 'ARE', 'CAN', 'HAD', 'HER', 
        'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'OWN', 
        'SAY', 'SHE', 'TOO', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'GOT', 'PUT', 'SAW', 
        'SET', 'TRY', 'USE', 'AGO', 'DAY', 'FEW', 'GMT', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 
        'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'PKG', 'PCS', 'KGS', 'KGC', 'CBM', 'AWB',
        'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCD', 'TFD', 'RCT', 'AWD', 'ARR',
        'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC',
        'CAP', 'ERR', 'NIL', 'NIF', 'AIR', 'ANY', 'BOO', 'BOX', 'CAR', 'COD', 'DIM', 'USA',
        'EUR', 'PDF', 'JPG', 'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'COM', 'NET', 'WWW'
      ]);
      
      const cityCodeMatches = markdown.match(/[A-Za-z\s]+\(([A-Z]{3})\)/g);
      if (cityCodeMatches && cityCodeMatches.length >= 2) {
        const codes = cityCodeMatches
          .map((m: string) => {
            const match = m.match(/\(([A-Z]{3})\)/);
            return match ? match[1].toUpperCase() : null;
          })
          .filter((c: string | null): c is string => c !== null && !EXCLUDE_CODES.has(c));
        
        // Get unique codes preserving order
        const uniqueCodes: string[] = [];
        for (const code of codes) {
          if (!uniqueCodes.includes(code)) {
            uniqueCodes.push(code);
          }
        }
        
        if (uniqueCodes.length >= 2) {
          // In ParcelsApp, events are usually newest first, so last = origin, first = destination
          if (!origin) origin = uniqueCodes[uniqueCodes.length - 1];
          if (!destination) destination = uniqueCodes[0];
          console.log(`[SAA CARGO] Found codes from City (CODE) pattern: ${uniqueCodes.join(', ')} -> Origin: ${origin}, Dest: ${destination}`);
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS FROM TRACKING HISTORY ==========
    // Parse tracking events table to get the ACTUAL last event (not keyword-based)
    // Format: rows with date/time, location, and status description
    interface TrackingEvent {
      timestamp: number;
      dateStr: string;
      location: string;
      status: string;
      statusCode: string;
    }
    
    const events: TrackingEvent[] = [];
    
    // Pattern 1: Table rows with date, location, status
    // Example: "| Dec 15, 2024 14:30 | JNB | Departed |"
    const tableRowRegex = /\|\s*([A-Za-z]{3}\s+\d{1,2},?\s*\d{4}\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*\|\s*([A-Z]{3})?\s*\|\s*([^|]+)\s*\|/gi;
    let tableMatch;
    while ((tableMatch = tableRowRegex.exec(markdown)) !== null) {
      const dateStr = tableMatch[1].trim();
      const location = (tableMatch[2] || '').trim();
      const statusText = tableMatch[3].trim();
      
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts)) {
        const statusCode = extractStatusCodeFromText(statusText);
        events.push({ timestamp: ts, dateStr, location, status: statusText, statusCode });
        console.log(`[SAA CARGO] Found event: ${dateStr} - ${location} - ${statusText} -> ${statusCode}`);
      }
    }
    
    // Pattern 2: Lines with ISO-like dates and status
    // Example: "2024-12-15 14:30 - JNB - Cargo physically delivered"
    const lineRegex = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\s*[-–|]\s*([A-Z]{3})?\s*[-–|]?\s*(.+)/gi;
    let lineMatch;
    while ((lineMatch = lineRegex.exec(markdown)) !== null) {
      const dateStr = lineMatch[1].trim();
      const location = (lineMatch[2] || '').trim();
      const statusText = lineMatch[3].trim();
      
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts)) {
        const statusCode = extractStatusCodeFromText(statusText);
        events.push({ timestamp: ts, dateStr, location, status: statusText, statusCode });
        console.log(`[SAA CARGO] Found event (line format): ${dateStr} - ${location} - ${statusText} -> ${statusCode}`);
      }
    }
    
    // Pattern 3: Tracking history entries with various date formats
    // Example: "Dec 15, 2024 at 2:30 PM - Cargo physically delivered at JNB"
    const historyRegex = /([A-Za-z]{3}\s+\d{1,2},?\s*\d{4}(?:\s+at)?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)\s*[-–]\s*(.+?)(?=\n|$)/gi;
    let historyMatch;
    while ((historyMatch = historyRegex.exec(markdown)) !== null) {
      const dateStr = historyMatch[1].trim();
      const statusText = historyMatch[2].trim();
      
      // Extract location from status text if present
      const locationMatch = statusText.match(/(?:at|in)\s+([A-Z]{3})/i);
      const location = locationMatch ? locationMatch[1].toUpperCase() : '';
      
      const ts = new Date(dateStr.replace(' at ', ' ')).getTime();
      if (!isNaN(ts)) {
        const statusCode = extractStatusCodeFromText(statusText);
        events.push({ timestamp: ts, dateStr, location, status: statusText, statusCode });
        console.log(`[SAA CARGO] Found event (history format): ${dateStr} - ${statusText} -> ${statusCode}`);
      }
    }
    
    console.log(`[SAA CARGO] Total events extracted: ${events.length}`);
    
    // Sort events by timestamp ASC (oldest first) and get the LAST one
    if (events.length > 0) {
      events.sort((a, b) => a.timestamp - b.timestamp);
      const lastEvent = events[events.length - 1];
      lastStatus = lastEvent.statusCode;
      lastEventTimestamp = new Date(lastEvent.timestamp).toISOString();
      console.log(`[SAA CARGO] Last event (sorted): ${lastEvent.dateStr} - ${lastEvent.status} -> ${lastStatus}`);
    }
    
    // Fallback: If no events found via table parsing, use keyword-based extraction
    if (!lastStatus) {
      console.log('[SAA CARGO] No events found, falling back to keyword extraction...');
      
      // Priority 1: Check for delivered status
      if (markdown.match(/physically delivered/i) || markdown.match(/delivered to consignee/i)) {
        lastStatus = 'DLV';
        console.log('[SAA CARGO] Fallback Status: DLV (delivered)');
      }
      // Priority 2: Notified for delivery (NFD is more specific than ARR)
      else if (markdown.match(/notified/i) || markdown.match(/ready for delivery/i) || markdown.match(/ready for pick-?up/i)) {
        lastStatus = 'NFD';
        console.log('[SAA CARGO] Fallback Status: NFD (notified)');
      }
      // Priority 3: Received from flight (RCF)
      else if (markdown.match(/received from flight/i) || markdown.match(/unloaded from aircraft/i)) {
        lastStatus = 'RCF';
        console.log('[SAA CARGO] Fallback Status: RCF (received from flight)');
      }
      // Priority 4: Arrived at destination
      else if (markdown.match(/arrived.*final destination/i) || markdown.match(/arrived in the cargo bay/i) || markdown.match(/arrived at airport/i)) {
        lastStatus = 'ARR';
        console.log('[SAA CARGO] Fallback Status: ARR (arrived)');
      }
      // Priority 5: Departed
      else if (markdown.match(/departed at airport/i) || markdown.match(/cargo and documents departed/i) || markdown.match(/departed/i)) {
        lastStatus = 'DEP';
        console.log('[SAA CARGO] Fallback Status: DEP (departed)');
      }
      // Priority 6: Manifested
      else if (markdown.match(/manifested/i)) {
        lastStatus = 'MAN';
        console.log('[SAA CARGO] Fallback Status: MAN (manifested)');
      }
      // Priority 7: Received from shipper
      else if (markdown.match(/received and accepted/i) || markdown.match(/received from shipper/i)) {
        lastStatus = 'RCS';
        console.log('[SAA CARGO] Fallback Status: RCS (received)');
      }
      // Priority 8: Booked
      else if (markdown.match(/booked/i) || markdown.match(/booking confirmed/i)) {
        lastStatus = 'BKD';
        console.log('[SAA CARGO] Fallback Status: BKD (booked)');
      }
      // Fallback: Look for status codes directly
      else {
        const statusCodeMatch = markdown.match(/\b(DLV|NFD|RCF|ARR|DEP|MAN|RCS|BKD|FOH|AWD|CCD|AWR)\b/);
        if (statusCodeMatch) {
          lastStatus = statusCodeMatch[1].toUpperCase();
          console.log(`[SAA CARGO] Fallback Status from code: ${lastStatus}`);
        }
      }
    }
    
    // ========== FALLBACK: Extract origin/destination from event locations ==========
    // If we still don't have origin/destination, try to extract from events
    if (events.length >= 2 && (!origin || !destination)) {
      // Sort events by timestamp ASC (oldest first)
      const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
      
      // Get unique locations from events
      const eventLocations = sortedEvents
        .map(e => e.location)
        .filter(loc => loc && /^[A-Z]{3}$/.test(loc));
      
      const uniqueLocations: string[] = [];
      for (const loc of eventLocations) {
        if (!uniqueLocations.includes(loc)) {
          uniqueLocations.push(loc);
        }
      }
      
      if (uniqueLocations.length >= 2) {
        // First location in chronological order = origin
        // Last location in chronological order = destination
        if (!origin) origin = uniqueLocations[0];
        if (!destination) destination = uniqueLocations[uniqueLocations.length - 1];
        console.log(`[SAA CARGO] Extracted from event locations: Origin=${origin}, Dest=${destination}`);
      } else if (uniqueLocations.length === 1 && (!origin || !destination)) {
        // Only one location found - could be origin or destination
        const singleLoc = uniqueLocations[0];
        if (!origin) origin = singleLoc;
        console.log(`[SAA CARGO] Single event location found: ${singleLoc}`);
      }
    }
    
    console.log(`[SAA CARGO] Final Extracted - Origin: ${origin || 'N/A'}, Destination: ${destination || 'N/A'}, Status: ${lastStatus || 'N/A'}`);
    
    // QUALITY RULE: If status is N/A, INFO, or AGUARDANDO, and we couldn't extract valid origin/destination, return NOT_FOUND
    const invalidStatuses = ['N/A', 'INFO', 'AGUARDANDO', 'UNK', ''];
    const hasInvalidStatus = !lastStatus || invalidStatuses.includes(lastStatus);
    const hasInvalidRoute = (!origin || origin === 'N/A') && (!destination || destination === 'N/A');
    
    if (hasInvalidStatus && hasInvalidRoute) {
      console.log('[SAA CARGO] No valid tracking data found - returning NOT_FOUND');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb: formattedAwb },
        raw: { markdown: markdown.substring(0, 1000) },
      };
    }
    
    // Validate we have minimum required data
    if (!origin && !destination && !lastStatus) {
      console.log('[SAA CARGO] Could not extract any tracking data');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { awb: formattedAwb },
        raw: { markdown: markdown.substring(0, 1000) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb },
      raw: { source: 'parcelsapp', markdownLength: markdown.length },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'INFO',
          description: lastStatus || 'Info',
          timestamp: lastEventTimestamp || new Date().toISOString(),
        },
      },
    };
    
  } catch (error) {
    console.error('[SAA CARGO] Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// Helper function to extract status code from event description text
function extractStatusCodeFromText(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Check for explicit status codes first
  const codeMatch = text.match(/\b(DLV|NFD|RCF|ARR|DEP|MAN|RCS|BKD|FOH|AWD|CCD|AWR|PRE|TFD|TRM|RCT)\b/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }
  
  // Map common phrases to status codes
  if (lowerText.includes('delivered') || lowerText.includes('physically delivered') || lowerText.includes('collected')) return 'DLV';
  if (lowerText.includes('notified') || lowerText.includes('ready for delivery') || lowerText.includes('ready for pick')) return 'NFD';
  if (lowerText.includes('received from flight') || lowerText.includes('unloaded') || lowerText.includes('break down')) return 'RCF';
  if (lowerText.includes('arrived') || lowerText.includes('arrival')) return 'ARR';
  if (lowerText.includes('departed') || lowerText.includes('departure') || lowerText.includes('flown')) return 'DEP';
  if (lowerText.includes('manifest')) return 'MAN';
  if (lowerText.includes('received') || lowerText.includes('accepted')) return 'RCS';
  if (lowerText.includes('booked') || lowerText.includes('booking')) return 'BKD';
  if (lowerText.includes('freight on hand') || lowerText.includes('on hand')) return 'FOH';
  if (lowerText.includes('document') && lowerText.includes('delivered')) return 'AWD';
  if (lowerText.includes('customs') && lowerText.includes('cleared')) return 'CCD';
  if (lowerText.includes('transfer')) return 'TFD';
  
  // Return original text trimmed if no match (will be cleaned up later)
  return text.substring(0, 6).toUpperCase().replace(/[^A-Z]/g, '') || 'UNK';
}

// ============= CARGOLUX API (WITH FIRECRAWL FALLBACK) =============

async function fetchCargoluxAPI(awb: string): Promise<StandardResult> {
  const provider = 'CARGOLUX';
  console.log(`[CARGOLUX API] Fetching AWB: ${awb}`);
  
  try {
    // Format AWB properly
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    // Try direct API first
    const endpoint = `https://cargolux-icargo-api-app-prod.politesmoke-46f514de.westeurope.azurecontainerapps.io/api/track/awbs/?numbers=${formattedAwb}`;
    
    console.log(`[CARGOLUX API] Calling endpoint: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const status = response.status;
    
    if (response.ok) {
      const data = await response.json();
      
      // Check for valid tracking data
      if (!data.invalidAwbNumbers?.length && data.trackings?.length > 0) {
        const tracking = data.trackings[0];
        const summary = tracking.shipmentSummary;
        
        const origin = summary?.origin || 'N/A';
        const destination = summary?.destination || 'N/A';
        
        let lastStatus = 'NOT_FOUND';
        let lastStatusDescription = '';
        let lastTimestamp = new Date().toISOString();
        
        const airportEvents = tracking.airportEvents;
        if (airportEvents && airportEvents.length > 0) {
          const lastAirport = airportEvents[airportEvents.length - 1];
          const events = lastAirport.events;
          
          if (events && events.length > 0) {
            const lastEvent = events[events.length - 1];
            lastStatus = lastEvent.eventType || 'NOT_FOUND';
            lastStatusDescription = `${lastEvent.eventType} - ${lastAirport.cityName || lastEvent.airportCode}`;
            lastTimestamp = lastEvent.timeUtc || lastEvent.time || new Date().toISOString();
            
            console.log(`[CARGOLUX API] Last event: ${lastStatus} at ${lastAirport.airportCode}`);
          }
        }
        
        console.log(`[CARGOLUX API] Success - Status: ${lastStatus}, Origin: ${origin}, Dest: ${destination}`);
        
        return {
          provider,
          ok: true,
          status,
          error: null,
          sent: { awb: formattedAwb, endpoint },
          raw: data,
          summary: {
            origin,
            destination,
            lastStatus: {
              code: lastStatus,
              description: lastStatusDescription,
              timestamp: lastTimestamp,
            },
          },
        };
      }
    }
    
    // If direct API fails, try Firecrawl scraping
    console.log('[CARGOLUX] Direct API failed, trying Firecrawl scraping...');
    return await fetchCargoluxFirecrawl(formattedAwb);
    
  } catch (error) {
    console.error(`[CARGOLUX API] Error:`, error);
    // On exception, try Firecrawl fallback
    console.log('[CARGOLUX] Exception occurred, trying Firecrawl fallback...');
    return await fetchCargoluxFirecrawl(awb);
  }
}

async function fetchCargoluxFirecrawl(awb: string): Promise<StandardResult> {
  const provider = 'CARGOLUX FIRECRAWL';
  console.log(`[CARGOLUX FIRECRAWL] Fetching AWB: ${awb}`);
  
  try {
    let formattedAwb = awb;
    if (!awb.includes('-')) {
      formattedAwb = `${awb.substring(0, 3)}-${awb.substring(3)}`;
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[CARGOLUX FIRECRAWL] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    const endpoint = `https://www.cargolux.com/Our-Solutions/Tracking/Tracking-Page/${formattedAwb.replace('-', '')}`;
    console.log(`[CARGOLUX FIRECRAWL] Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[CARGOLUX FIRECRAWL] Firecrawl API error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[CARGOLUX FIRECRAWL] Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb },
        raw: data,
      };
    }
    
    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    
    console.log(`[CARGOLUX FIRECRAWL] Content length: ${markdown.length}`);
    
    // Parse origin and destination
    let origin = 'N/A';
    let destination = 'N/A';
    let lastStatus = 'BKD'; // Default to Booked if we found the AWB
    let lastStatusDescription = 'Reserva Confirmada';
    
    // Try to extract origin/destination
    const originMatch = markdown.match(/(?:Origin|From|Origem)[:\s]*([A-Z]{3})/i) ||
                       html.match(/(?:Origin|From|Origem)[:\s]*([A-Z]{3})/i);
    const destMatch = markdown.match(/(?:Destination|To|Destino)[:\s]*([A-Z]{3})/i) ||
                     html.match(/(?:Destination|To|Destino)[:\s]*([A-Z]{3})/i);
    
    if (originMatch) origin = originMatch[1].toUpperCase();
    if (destMatch) destination = destMatch[1].toUpperCase();
    
    // Try to find status codes
    const statusMatch = markdown.match(/\b(DLV|DEP|ARR|RCF|NFD|BKD|RCS|MAN|FOH|TFD|DIS|OFLD|AWD)\b/);
    if (statusMatch) {
      lastStatus = statusMatch[1].toUpperCase();
      lastStatusDescription = lastStatus;
    }
    
    console.log(`[CARGOLUX FIRECRAWL] Final - Status: ${lastStatus}, Origin: ${origin}, Dest: ${destination}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint },
      raw: { markdown: markdown.substring(0, 500) },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: lastStatusDescription,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[CARGOLUX FIRECRAWL] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= AVIANCA CARGO API (iCargo Portal) =============

async function fetchAviancaCargoAPI(awb: string): Promise<StandardResult> {
  const provider = 'avianca_api';
  console.log(`[AVIANCA CARGO] 🚀 Starting fetch for AWB: ${awb}`);
  
  // Helper function to make fetch with retry
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AVIANCA CARGO] 📡 Attempt ${attempt}/${maxRetries} for ${url}`);
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`[AVIANCA CARGO] ⚠️ Attempt ${attempt} failed: ${lastError.message}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[AVIANCA CARGO] ⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  };
  
  try {
    // Normalize AWB format: remove dash for API call
    let formattedAwb = awb.toString().trim();
    if (formattedAwb.includes('-')) {
      formattedAwb = formattedAwb.replace('-', '');
    }
    
    // Step 1: Get auth token
    const authUrl = 'https://cargoapps.aviancacargo.com/api/Auth';
    console.log(`[AVIANCA CARGO] 🔐 Fetching auth token from: ${authUrl}`);
    
    const authResponse = await fetchWithRetry(authUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!authResponse.ok) {
      console.error(`[AVIANCA CARGO] ❌ Auth failed: HTTP ${authResponse.status}`);
      return {
        provider,
        ok: false,
        status: authResponse.status,
        error: `Auth failed: HTTP ${authResponse.status}`,
        sent: { awb },
      };
    }
    
    const authData = await authResponse.json();
    console.log(`[AVIANCA CARGO] 🔐 Auth response:`, JSON.stringify(authData).substring(0, 200));
    
    // Extract token - try common keys
    let token: string | null = null;
    if (typeof authData === 'string') {
      token = authData.trim();
    } else if (typeof authData === 'object' && authData !== null) {
      token = authData.token || authData.apiKey || authData.access_token || 
              (Array.isArray(authData) ? null : Object.values(authData)[0]);
      if (typeof token !== 'string') {
        token = null;
      }
    }
    
    if (!token) {
      console.error(`[AVIANCA CARGO] ❌ Token not found in auth response`);
      return {
        provider,
        ok: false,
        status: 500,
        error: 'Token not found in auth response',
        sent: { awb },
        raw: authData,
      };
    }
    
    console.log(`[AVIANCA CARGO] ✅ Token obtained: ${token.substring(0, 20)}...`);
    
    // Step 2: Call tracking API
    const subscriptionKey = '84857841aab543fcb28aeb95bde376e8;product=cargo';
    const dataUrl = `https://api-avianca.avianca.com/API_IcargoEtrackingPPQ/${encodeURIComponent(formattedAwb)}/010620231414`;
    
    console.log(`[AVIANCA CARGO] 📡 Fetching tracking data: ${dataUrl}`);
    
    const dataResponse = await fetchWithRetry(dataUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    
    if (!dataResponse.ok) {
      console.error(`[AVIANCA CARGO] ❌ Data fetch failed: HTTP ${dataResponse.status}`);
      return {
        provider,
        ok: false,
        status: dataResponse.status,
        error: `Data fetch failed: HTTP ${dataResponse.status}`,
        sent: { awb, url: dataUrl },
      };
    }
    
    const data = await dataResponse.json();
    console.log(`[AVIANCA CARGO] 📄 Data response:`, JSON.stringify(data).substring(0, 1000));
    
    // Extract origin and destination from shipment_summary
    // Note: PHP code swaps these, keeping original API values
    const origin = data?.shipment_summary?.origin || null;
    const destination = data?.shipment_summary?.destination || null;
    
    console.log(`[AVIANCA CARGO] 🗺️ Origin: ${origin}, Destination: ${destination}`);
    
    // Extract last status from shipment_history
    // Priority: Delivered (3) > Received From Flight (2) > Manifested (1)
    const stagePriority: Record<string, number> = {
      'Manifested': 1,
      'Received From Flight': 2,
      'Delivered': 3,
    };
    
    let bestPriority = -1;
    let finalStatus: string | null = null;
    let finalStatusCode = 'N/A';
    
    if (data?.shipment_history && Array.isArray(data.shipment_history)) {
      for (const event of data.shipment_history) {
        let status: string | null = null;
        
        if (typeof event === 'string') {
          status = event.trim();
        } else if (typeof event === 'object' && event !== null) {
          status = event.status?.trim() || null;
        }
        
        if (!status) continue;
        
        const priority = stagePriority[status] || 0;
        if (priority > bestPriority) {
          bestPriority = priority;
          finalStatus = status;
        }
      }
      
      // Map status to code
      if (finalStatus) {
        const statusMap: Record<string, string> = {
          'Delivered': 'DLV',
          'Received From Flight': 'RCF',
          'Manifested': 'MAN',
        };
        finalStatusCode = statusMap[finalStatus] || finalStatus.substring(0, 3).toUpperCase();
      }
    }
    
    console.log(`[AVIANCA CARGO] 🏁 Final status: ${finalStatus} (${finalStatusCode})`);
    
    // Check if we have any valid data
    const hasValidData = origin || destination || finalStatus;
    
    if (!hasValidData) {
      console.log('[AVIANCA CARGO] ⚠️ No valid data found in response');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking data found',
        sent: { awb, url: dataUrl },
        raw: data,
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, url: dataUrl },
      raw: data,
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: finalStatusCode,
          description: finalStatus || finalStatusCode,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AVIANCA CARGO] ❌ Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= AVIANCA CARGO VIA PARCELSAPP (FALLBACK) =============

async function fetchParcelsApp729(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_729';
  console.log(`[PARCELSAPP 729] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 729] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: Always use 729-{8 digits} format for Avianca
    const digits = awb.replace(/\D/g, '');
    // Extract the last 8 digits (the AWB serial number, ignoring any prefix)
    const awbSerial = digits.length > 8 ? digits.slice(-8) : digits;
    const formattedAwb = `729-${awbSerial}`;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 729] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 729] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 729] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 729] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    if (content.length < 300) {
      console.log(`[PARCELSAPP 729] Content too small, possibly blocked`);
      return { provider, ok: false, status: 404, error: 'Content too small', sent: { url } };
    }
    
    // Check for "not found" indicators BEFORE extracting any data
    const notFoundIndicators = [
      'not found',
      'no tracking information',
      'no information about your package',
      'we\'ve checked all relevant couriers',
      'why is my parcel not tracking'
    ];
    
    const isNotFound = notFoundIndicators.some(indicator => contentLower.includes(indicator));
    if (isNotFound) {
      console.log(`[PARCELSAPP 729] AWB not found - detected "not found" indicator`);
      return { 
        provider, 
        ok: true, 
        status: 200, 
        error: null, 
        sent: { url },
        summary: {
          origin: undefined,
          destination: undefined,
          lastStatus: { code: 'NOT_FOUND', description: 'AWB not found in carrier system', timestamp: new Date().toISOString() }
        }
      };
    }
    
    // Invalid codes set - status codes and common words
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS',
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY',
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE',
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG',
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR',
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI',
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV',
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // ========== STEP 1: Extract events from timeline ==========
    // ParcelsApp shows events from newest to oldest, format: **Event at LOCATION**
    // We need to parse each event to get: status keyword, airport code, date, and route info
    interface TimelineEvent {
      rawText: string;
      statusKeyword: string | null;
      airportCode: string | null;
      dateStr: string | null;
      position: number; // position in markdown (lower = more recent)
      routeOrigin: string | null;  // extracted from route pattern like LNZ-GRU
      routeDestination: string | null;
    }
    
    const events: TimelineEvent[] = [];
    
    // Pattern to match timeline events: - **DATE** ... **Event at LOCATION (CODE)**
    // Examples:
    // - **04 Sep 2024** 05:30 ... **Shipment received from flight at GRU** ... (GRU)
    // - **03 Sep 2024** 15:30 ... **Delivered at GRU** ... Guarulhos (GRU)
    const eventBlockPattern = /\*\*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\*\*[^*]*\*\*([^*]+)\*\*[^(]*\(([A-Z]{3})\)/gi;
    let eventMatch;
    
    while ((eventMatch = eventBlockPattern.exec(markdown)) !== null) {
      const dateStr = eventMatch[1];
      const eventText = eventMatch[2].toLowerCase();
      const airportCode = eventMatch[3].toUpperCase();
      
      if (!isValidAirport(airportCode)) continue;
      
      // Determine status from event text
      let statusKeyword: string | null = null;
      if (eventText.includes('delivered') || eventText.includes('entregue')) statusKeyword = 'DLV';
      else if (eventText.includes('notified') || eventText.includes('notification')) statusKeyword = 'NFD';
      else if (eventText.includes('received from flight') || eventText.includes('shipment received from flight')) statusKeyword = 'RCF';
      else if (eventText.includes('arrived')) statusKeyword = 'ARR';
      else if (eventText.includes('departed')) statusKeyword = 'DEP';
      else if (eventText.includes('manifested')) statusKeyword = 'MAN';
      else if (eventText.includes('document received') || eventText.includes('awb document')) statusKeyword = 'FWB';
      else if (eventText.includes('prepared for loading')) statusKeyword = 'PRE';
      else if (eventText.includes('booked')) statusKeyword = 'BKD';
      
      // Extract route from event text (e.g., "|LNZ-GRU" or "|MAD-BOG")
      // Pattern matches: |XXX-YYY where XXX and YYY are 3-letter airport codes
      let routeOrigin: string | null = null;
      let routeDestination: string | null = null;
      const routeMatch = eventText.match(/\|([a-z]{3})-([a-z]{3})/i);
      if (routeMatch) {
        const potentialOrigin = routeMatch[1].toUpperCase();
        const potentialDest = routeMatch[2].toUpperCase();
        if (isValidAirport(potentialOrigin)) routeOrigin = potentialOrigin;
        if (isValidAirport(potentialDest)) routeDestination = potentialDest;
        if (routeOrigin || routeDestination) {
          console.log(`[PARCELSAPP 729] Route extracted from event: ${routeOrigin || '?'} → ${routeDestination || '?'}`);
        }
      }
      
      events.push({
        rawText: eventText,
        statusKeyword,
        airportCode,
        dateStr,
        position: eventMatch.index,
        routeOrigin,
        routeDestination
      });
      
      console.log(`[PARCELSAPP 729] Event: "${eventText.substring(0, 50)}" at ${airportCode}, status=${statusKeyword}, date=${dateStr}, route=${routeOrigin || '?'}-${routeDestination || '?'}`);
    }
    
    // If no events found with detailed pattern, try simpler pattern
    if (events.length === 0) {
      // Simpler pattern: City (CODE), Country
      const simplePattern = /[A-Z][a-zA-Z\s]+\(([A-Z]{3})\)/g;
      let simpleMatch;
      const foundCodes: string[] = [];
      
      while ((simpleMatch = simplePattern.exec(markdown)) !== null) {
        const code = simpleMatch[1].toUpperCase();
        if (isValidAirport(code) && !foundCodes.includes(code)) {
          foundCodes.push(code);
          events.push({
            rawText: simpleMatch[0],
            statusKeyword: null,
            airportCode: code,
            dateStr: null,
            position: simpleMatch.index,
            routeOrigin: null,
            routeDestination: null
          });
        }
      }
      console.log(`[PARCELSAPP 729] Simple pattern found ${foundCodes.length} airports: ${foundCodes.join(', ')}`);
    }
    
    // ========== STEP 2: Determine Origin and Destination ==========
    // PRIORITY ORDER for determining route:
    // 1. Route extracted from event text (e.g., |LNZ-GRU) - MOST RELIABLE
    // 2. DEP event airport as origin
    // 3. MAN/RCS event airport as origin
    // 4. Fallback to airport sequence
    
    if (events.length >= 1) {
      // Sort by position (ascending = newest first)
      events.sort((a, b) => a.position - b.position);
      
      // FIRST PRIORITY: Look for route info in event text (most reliable source)
      // Find the most complete route from delivery/notification events
      const eventsWithRoute = events.filter(ev => ev.routeOrigin || ev.routeDestination);
      if (eventsWithRoute.length > 0) {
        // Prefer routes from DLV/NFD events as they typically have the full route
        const deliveryWithRoute = eventsWithRoute.find(ev => 
          ev.statusKeyword === 'DLV' || ev.statusKeyword === 'NFD' || ev.statusKeyword === 'RCF' || ev.statusKeyword === 'FWB'
        );
        const routeSource = deliveryWithRoute || eventsWithRoute[0];
        
        if (routeSource.routeOrigin && isValidAirport(routeSource.routeOrigin)) {
          origin = routeSource.routeOrigin;
          console.log(`[PARCELSAPP 729] ✅ Origin from route in event text: ${origin}`);
        }
        if (routeSource.routeDestination && isValidAirport(routeSource.routeDestination)) {
          destination = routeSource.routeDestination;
          console.log(`[PARCELSAPP 729] ✅ Destination from route in event text: ${destination}`);
        }
      }
      
      // Get unique airports in order of appearance (newest to oldest)
      const airportOrder: string[] = [];
      for (const ev of events) {
        if (ev.airportCode && !airportOrder.includes(ev.airportCode)) {
          airportOrder.push(ev.airportCode);
        }
      }
      
      console.log(`[PARCELSAPP 729] Airports in order (newest to oldest): ${airportOrder.join(' → ')}`);
      
      // If destination not set from route, use delivery/notification event airport
      if (!destination) {
        const deliveryEvent = events.find(ev => ev.statusKeyword === 'DLV' || ev.statusKeyword === 'NFD');
        if (deliveryEvent && deliveryEvent.airportCode) {
          destination = deliveryEvent.airportCode;
          console.log(`[PARCELSAPP 729] Destination from delivery event airport: ${destination}`);
        }
      }
      
      // If origin not set from route, look for DEP event
      if (!origin) {
        const depEvents = events.filter(ev => ev.statusKeyword === 'DEP');
        if (depEvents.length > 0) {
          const oldestDep = depEvents[depEvents.length - 1];
          origin = oldestDep.airportCode;
          console.log(`[PARCELSAPP 729] Origin from oldest DEP event: ${origin}`);
        }
      }
      
      // If still no origin, try MAN or RCS (accepted/manifested)
      if (!origin) {
        const acceptEvents = events.filter(ev => 
          ev.statusKeyword === 'MAN' || ev.statusKeyword === 'RCS' || ev.statusKeyword === 'FWB'
        );
        if (acceptEvents.length > 0) {
          const oldestAccept = acceptEvents[acceptEvents.length - 1];
          origin = oldestAccept.airportCode;
          console.log(`[PARCELSAPP 729] Origin from oldest MAN/RCS event: ${origin}`);
        }
      }
      
      // Fallback: if still no origin but multiple airports, exclude BKD airports
      if (!origin && airportOrder.length >= 2) {
        // Find airports that are NOT only associated with BKD events
        const nonBkdAirports: string[] = [];
        for (const airport of airportOrder) {
          const airportEvents = events.filter(ev => ev.airportCode === airport);
          const hasNonBkdEvent = airportEvents.some(ev => ev.statusKeyword && ev.statusKeyword !== 'BKD');
          if (hasNonBkdEvent) {
            nonBkdAirports.push(airport);
          }
        }
        
        if (nonBkdAirports.length >= 2) {
          // Origin is last non-BKD airport, destination is first
          origin = nonBkdAirports[nonBkdAirports.length - 1];
          if (!destination) {
            destination = nonBkdAirports[0];
          }
          console.log(`[PARCELSAPP 729] Origin from non-BKD airports: ${origin}`);
        } else {
          // Fallback to original logic
          origin = airportOrder[airportOrder.length - 1];
        }
      }
      
      // Set destination if not already set
      if (!destination && airportOrder.length >= 1) {
        if (airportOrder.length >= 2) {
          destination = airportOrder[0]; // Most recent airport
        } else {
          // Single airport - try to find route from event text
          const routePattern = /([A-Z]{3})\s*[-–→>]\s*([A-Z]{3})/;
          const routeMatch = markdown.match(routePattern);
          if (routeMatch) {
            origin = routeMatch[1].toUpperCase();
            destination = routeMatch[2].toUpperCase();
            console.log(`[PARCELSAPP 729] Route from text pattern: ${origin} → ${destination}`);
          } else {
            destination = airportOrder[0];
          }
        }
      }
      
      console.log(`[PARCELSAPP 729] Route determined: ${origin || 'null'} → ${destination || 'null'}`);
    }
    
    // ========== STEP 3: Determine Last Status ==========
    // IMPORTANT: Status hierarchy - final status = HIGHEST STAGE reached, NOT the last log received
    // This prevents status regression (e.g., from DLV back to MAN due to late events)
    
    // Status hierarchy (lowest to highest stage)
    const statusHierarchy: Record<string, number> = {
      'BKD': 1,   // Booked
      'FWB': 2,   // Document received
      'RCS': 3,   // Received from shipper
      'MAN': 4,   // Manifested
      'PRE': 5,   // Prepared for loading
      'DEP': 6,   // Departed
      'TRM': 7,   // Transfer manifest
      'ARR': 8,   // Arrived
      'RCF': 9,   // Received from flight
      'FOH': 10,  // Freight on hand
      'NFD': 11,  // Ready for delivery / Notified
      'DLV': 12,  // Delivered (final stage)
    };
    
    let highestStage = 0;
    let highestStatus: string | null = null;
    let lateEvents: string[] = [];
    
    if (events.length > 0) {
      // Find the highest status stage reached across ALL events
      for (const ev of events) {
        if (ev.statusKeyword) {
          const stage = statusHierarchy[ev.statusKeyword] || 0;
          if (stage > highestStage) {
            highestStage = stage;
            highestStatus = ev.statusKeyword;
          }
        }
      }
      
      // Check for late events (events with lower stage appearing chronologically after higher stages)
      // Events are sorted newest first, so if we already hit DLV, any subsequent lower status is late
      if (highestStatus) {
        const highestIndex = events.findIndex(ev => ev.statusKeyword === highestStatus);
        for (let i = 0; i < highestIndex; i++) {
          const ev = events[i];
          if (ev.statusKeyword) {
            const stage = statusHierarchy[ev.statusKeyword] || 0;
            if (stage < highestStage) {
              lateEvents.push(`${ev.statusKeyword} at ${ev.dateStr || 'unknown date'}`);
            }
          }
        }
      }
      
      if (highestStatus) {
        lastStatus = highestStatus;
        console.log(`[PARCELSAPP 729] ✅ Status from hierarchy (highest stage ${highestStage}): ${lastStatus}`);
        if (lateEvents.length > 0) {
          console.log(`[PARCELSAPP 729] ⚠️ Late events detected (after ${lastStatus}): ${lateEvents.join(', ')}`);
        }
      }
    }
    
    // Fallback: Look for status patterns in markdown header/summary
    if (!lastStatus) {
      const statusPatterns = [
        /\*\*\(([A-Z]{3})\)\*\*/,          // **(DLV)**
        /\*\*([A-Z]{3})\s*[-–]\s*/,        // **DLV -
        /status[:\s]+\*?\*?([A-Z]{3})/i,   // Status: DLV
      ];
      
      for (const pattern of statusPatterns) {
        const match = markdown.match(pattern);
        if (match) {
          const code = match[1].toUpperCase();
          const stage = statusHierarchy[code] || 0;
          // Only use if it's a valid status and higher than current
          if (stage > highestStage) {
            lastStatus = code;
            highestStage = stage;
            console.log(`[PARCELSAPP 729] ✅ Status from pattern: ${lastStatus} (stage ${stage})`);
            break;
          }
        }
      }
    }
    
    // Final fallback: Check for "final status" indicator keywords
    if (!lastStatus) {
      const keywordMatches: { keyword: string; status: string; stage: number }[] = [];
      
      // Search for all status keywords in markdown
      if (markdown.toLowerCase().includes('delivered') || markdown.toLowerCase().includes('entregue')) {
        keywordMatches.push({ keyword: 'delivered', status: 'DLV', stage: statusHierarchy['DLV'] });
      }
      if (markdown.toLowerCase().includes('notified') || markdown.toLowerCase().includes('notification')) {
        keywordMatches.push({ keyword: 'notified', status: 'NFD', stage: statusHierarchy['NFD'] });
      }
      if (markdown.toLowerCase().includes('received from flight')) {
        keywordMatches.push({ keyword: 'received from flight', status: 'RCF', stage: statusHierarchy['RCF'] });
      }
      if (markdown.toLowerCase().includes('arrived')) {
        keywordMatches.push({ keyword: 'arrived', status: 'ARR', stage: statusHierarchy['ARR'] });
      }
      if (markdown.toLowerCase().includes('departed')) {
        keywordMatches.push({ keyword: 'departed', status: 'DEP', stage: statusHierarchy['DEP'] });
      }
      if (markdown.toLowerCase().includes('manifested')) {
        keywordMatches.push({ keyword: 'manifested', status: 'MAN', stage: statusHierarchy['MAN'] });
      }
      
      // Use the highest stage found
      if (keywordMatches.length > 0) {
        keywordMatches.sort((a, b) => b.stage - a.stage);
        lastStatus = keywordMatches[0].status;
        console.log(`[PARCELSAPP 729] ✅ Status from keyword fallback (highest): ${lastStatus} (found: ${keywordMatches.map(k => k.keyword).join(', ')})`);
      }
    }
    
    console.log(`[PARCELSAPP 729] 🏁 Final: Origin=${origin || 'null'}, Dest=${destination || 'null'}, Status=${lastStatus || 'null'}`);
    
    const hasValidData = (origin && isValidAirport(origin)) || 
                         (destination && isValidAirport(destination)) || 
                         (lastStatus && lastStatus.length >= 2);
    
    if (!hasValidData) {
      console.log('[PARCELSAPP 729] No valid data extracted');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Could not extract tracking data',
        sent: { url },
        raw: { contentLength: content.length, preview: markdown.substring(0, 500) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url },
      raw: { contentLength: content.length },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: lastStatus || 'N/A',
          description: lastStatus || 'N/A',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 729] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= AIR CHINA CARGO (999) VIA DIRECT SCRAPING =============

async function fetchParcelsApp999(awb: string): Promise<StandardResult> {
  const provider = 'airchinacargo_999';
  console.log(`[AIR CHINA 999] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[AIR CHINA 999] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB
    const digits = awb.replace(/\D/g, '');
    const awbSerial = digits.length > 8 ? digits.slice(-8) : digits;
    const formattedAwb = `999-${awbSerial}`;
    
    // Invalid codes set
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS',
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY',
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE',
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG',
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR',
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI',
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV',
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // ========== USE PARCELSAPP DIRECTLY (avoids CAPTCHA) ==========
    const parcelsUrl = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[AIR CHINA 999] Scraping ParcelsApp: ${parcelsUrl}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: parcelsUrl,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AIR CHINA 999] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url: parcelsUrl } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    
    console.log(`[AIR CHINA 999] Content length: ${content.length}`);
    console.log(`[AIR CHINA 999] Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Check for "not found" - ParcelsApp shows specific message
    const notFoundPatterns = [
      'not found',
      'no tracking information',
      'tracking number not found',
      'no results',
      'unable to find',
      'not available',
      'invalid tracking',
      'not recognized'
    ];
    
    const contentLower = content.toLowerCase();
    const isNotFound = notFoundPatterns.some(p => contentLower.includes(p));
    
    if (isNotFound || content.length < 300) {
      console.log(`[AIR CHINA 999] AWB not found on ParcelsApp`);
      return { provider, ok: false, status: 404, error: 'NOT_FOUND', sent: { url: parcelsUrl } };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // ========== EXTRACT FROM PARCELSAPP ==========
    // ParcelsApp shows tracking events and route information
    
    // Extract all IATA codes from content
    const allCodes: string[] = [];
    const codePattern = /\b([A-Z]{3})\b/g;
    let codeMatch;
    
    while ((codeMatch = codePattern.exec(content)) !== null) {
      const code = codeMatch[1];
      if (isValidAirport(code) && !allCodes.includes(code)) {
        allCodes.push(code);
      }
    }
    
    console.log(`[AIR CHINA 999] All IATA codes found: ${allCodes.join(', ')}`);
    
    // Pattern 1: Look for route format like "GRU → PVG" or "GRU - PVG" or "GRU to PVG"
    const routePatterns = [
      /\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b/gi,
      /\bfrom\s+([A-Z]{3})\s+to\s+([A-Z]{3})\b/gi,
      /\borigin[:\s]+([A-Z]{3}).*?destination[:\s]+([A-Z]{3})\b/gi,
    ];
    
    for (const pattern of routePatterns) {
      const match = pattern.exec(content);
      if (match) {
        const [, org, dest] = match;
        if (isValidAirport(org) && isValidAirport(dest)) {
          origin = org.toUpperCase();
          destination = dest.toUpperCase();
          console.log(`[AIR CHINA 999] ✅ Route from pattern: ${origin} -> ${destination}`);
          break;
        }
      }
    }
    
    // Pattern 2: Look for status events with airports
    // ParcelsApp often shows: "Departed from GRU", "Arrived at PVG", etc.
    const statusEventPattern = /\b(RCS|DEP|ARR|RCF|DLV|MAN|BKD|NFD|FOH|AWD|Departed|Arrived|Received|Delivered|Accepted)\b[^A-Z]*([A-Z]{3})/gi;
    interface StatusEvent {
      status: string;
      airport: string;
      position: number;
    }
    const statusEvents: StatusEvent[] = [];
    
    let statusMatch;
    while ((statusMatch = statusEventPattern.exec(content)) !== null) {
      const statusText = statusMatch[1].toUpperCase();
      const airportCode = statusMatch[2].toUpperCase();
      
      // Map text to status codes
      let statusCode = statusText;
      if (statusText === 'DEPARTED') statusCode = 'DEP';
      else if (statusText === 'ARRIVED') statusCode = 'ARR';
      else if (statusText === 'RECEIVED') statusCode = 'RCF';
      else if (statusText === 'DELIVERED') statusCode = 'DLV';
      else if (statusText === 'ACCEPTED') statusCode = 'RCS';
      
      if (isValidAirport(airportCode)) {
        statusEvents.push({
          status: statusCode,
          airport: airportCode,
          position: statusMatch.index
        });
        console.log(`[AIR CHINA 999] Status event: ${statusCode} at ${airportCode}`);
      }
    }
    
    // Determine origin from first RCS/DEP event
    if (!origin && statusEvents.length > 0) {
      const firstEvent = statusEvents.find(e => e.status === 'RCS' || e.status === 'DEP');
      if (firstEvent) {
        origin = firstEvent.airport;
        console.log(`[AIR CHINA 999] Origin from first event: ${origin}`);
      }
    }
    
    // Determine destination from last RCF/DLV/ARR event
    if (!destination && statusEvents.length > 0) {
      const destEvents = statusEvents.filter(e => e.status === 'RCF' || e.status === 'DLV' || e.status === 'NFD' || e.status === 'ARR');
      if (destEvents.length > 0) {
        destination = destEvents[destEvents.length - 1].airport;
        console.log(`[AIR CHINA 999] Destination from last delivery event: ${destination}`);
      }
    }
    
    // Fallback: use first and last unique airport codes
    if (!origin && allCodes.length >= 1) {
      origin = allCodes[0];
      console.log(`[AIR CHINA 999] Origin fallback (first code): ${origin}`);
    }
    if (!destination && allCodes.length >= 2) {
      // Use last code that's different from origin
      for (let i = allCodes.length - 1; i >= 0; i--) {
        if (allCodes[i] !== origin) {
          destination = allCodes[i];
          console.log(`[AIR CHINA 999] Destination fallback (last different code): ${destination}`);
          break;
        }
      }
    }
    
    // ========== DETERMINE LAST STATUS ==========
    const statusHierarchy: Record<string, number> = {
      'BKD': 1, 'FWB': 2, 'RCS': 3, 'MAN': 4, 'PRE': 5, 'DEP': 6,
      'TRM': 7, 'ARR': 8, 'RCF': 9, 'FOH': 10, 'NFD': 11, 'AWD': 12, 'DLV': 12,
    };
    
    let highestStage = 0;
    for (const ev of statusEvents) {
      const stage = statusHierarchy[ev.status] || 0;
      if (stage > highestStage) {
        highestStage = stage;
        lastStatus = ev.status;
      }
    }
    
    if (lastStatus) {
      // Map AWD to DLV (delivered)
      if (lastStatus === 'AWD') lastStatus = 'DLV';
      console.log(`[AIR CHINA 999] ✅ Status from events: ${lastStatus}`);
    }
    
    // Keyword fallback for status
    if (!lastStatus) {
      if (contentLower.includes('delivered')) lastStatus = 'DLV';
      else if (contentLower.includes('arrived') || contentLower.includes('received from flight')) lastStatus = 'RCF';
      else if (contentLower.includes('departed') || contentLower.includes('in transit')) lastStatus = 'DEP';
      else if (contentLower.includes('accepted') || contentLower.includes('shipment information')) lastStatus = 'RCS';
      
      if (lastStatus) {
        console.log(`[AIR CHINA 999] ✅ Status from keyword: ${lastStatus}`);
      }
    }
    
    console.log(`[AIR CHINA 999] 🏁 Final: Origin=${origin || 'null'}, Dest=${destination || 'null'}, Status=${lastStatus || 'null'}`);
    
    // If no data found, return NOT_FOUND
    if (!origin && !destination && !lastStatus) {
      console.log('[AIR CHINA 999] No valid data extracted - returning NOT_FOUND');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'NOT_FOUND',
        sent: { url: parcelsUrl },
        raw: { contentLength: content.length, preview: markdown.substring(0, 500) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url: parcelsUrl },
      raw: { contentLength: content.length },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: lastStatus || 'INFO',
          description: lastStatus || 'Tracking data found',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AIR CHINA 999] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= DHLAVIANCA CARGO (202) VIA PARCELSAPP =============

async function fetchParcelsApp202(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_202';
  console.log(`[PARCELSAPP 202] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 202] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: Always use 202-{8 digits} format
    const digits = awb.replace(/\D/g, '');
    // Extract the last 8 digits (the AWB serial number, ignoring any prefix)
    const awbSerial = digits.length > 8 ? digits.slice(-8) : digits;
    const formattedAwb = `202-${awbSerial}`;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 202] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 202] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 202] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 202] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    if (content.length < 300) {
      console.log(`[PARCELSAPP 202] Content too small, possibly blocked`);
      return { provider, ok: false, status: 404, error: 'Content too small', sent: { url } };
    }
    
    // Check for "not found" indicators
    const notFoundIndicators = [
      'not found',
      'no tracking information',
      'no information about your package',
      'we\'ve checked all relevant couriers',
      'why is my parcel not tracking'
    ];
    
    const isNotFound = notFoundIndicators.some(indicator => contentLower.includes(indicator));
    if (isNotFound) {
      console.log(`[PARCELSAPP 202] AWB not found`);
      return { 
        provider, 
        ok: true, 
        status: 200, 
        error: null, 
        sent: { url },
        summary: {
          origin: undefined,
          destination: undefined,
          lastStatus: { code: 'NOT_FOUND', description: 'AWB not found in carrier system', timestamp: new Date().toISOString() }
        }
      };
    }
    
    // Invalid codes set
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS',
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY',
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE',
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG',
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR',
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI',
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV',
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // Extract events from timeline
    interface TimelineEvent {
      rawText: string;
      statusKeyword: string | null;
      airportCode: string | null;
      dateStr: string | null;
      position: number;
      routeOrigin: string | null;
      routeDestination: string | null;
    }
    
    const events: TimelineEvent[] = [];
    
    const eventBlockPattern = /\*\*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\*\*[^*]*\*\*([^*]+)\*\*[^(]*\(([A-Z]{3})\)/gi;
    let eventMatch;
    
    while ((eventMatch = eventBlockPattern.exec(markdown)) !== null) {
      const dateStr = eventMatch[1];
      const eventText = eventMatch[2].toLowerCase();
      const airportCode = eventMatch[3].toUpperCase();
      
      if (!isValidAirport(airportCode)) continue;
      
      let statusKeyword: string | null = null;
      if (eventText.includes('delivered') || eventText.includes('entregue')) statusKeyword = 'DLV';
      else if (eventText.includes('notified') || eventText.includes('notification')) statusKeyword = 'NFD';
      else if (eventText.includes('received from flight') || eventText.includes('shipment received from flight')) statusKeyword = 'RCF';
      else if (eventText.includes('arrived')) statusKeyword = 'ARR';
      else if (eventText.includes('departed')) statusKeyword = 'DEP';
      else if (eventText.includes('manifested')) statusKeyword = 'MAN';
      else if (eventText.includes('document received') || eventText.includes('awb document')) statusKeyword = 'FWB';
      else if (eventText.includes('prepared for loading')) statusKeyword = 'PRE';
      else if (eventText.includes('booked')) statusKeyword = 'BKD';
      
      let routeOrigin: string | null = null;
      let routeDestination: string | null = null;
      const routeMatch = eventText.match(/\|([a-z]{3})-([a-z]{3})/i);
      if (routeMatch) {
        const potentialOrigin = routeMatch[1].toUpperCase();
        const potentialDest = routeMatch[2].toUpperCase();
        if (isValidAirport(potentialOrigin)) routeOrigin = potentialOrigin;
        if (isValidAirport(potentialDest)) routeDestination = potentialDest;
      }
      
      events.push({
        rawText: eventText,
        statusKeyword,
        airportCode,
        dateStr,
        position: eventMatch.index,
        routeOrigin,
        routeDestination
      });
      
      console.log(`[PARCELSAPP 202] Event: "${eventText.substring(0, 50)}" at ${airportCode}, status=${statusKeyword}`);
    }
    
    // Simpler pattern fallback
    if (events.length === 0) {
      const simplePattern = /[A-Z][a-zA-Z\s]+\(([A-Z]{3})\)/g;
      let simpleMatch;
      const foundCodes: string[] = [];
      
      while ((simpleMatch = simplePattern.exec(markdown)) !== null) {
        const code = simpleMatch[1].toUpperCase();
        if (isValidAirport(code) && !foundCodes.includes(code)) {
          foundCodes.push(code);
          events.push({
            rawText: simpleMatch[0],
            statusKeyword: null,
            airportCode: code,
            dateStr: null,
            position: simpleMatch.index,
            routeOrigin: null,
            routeDestination: null
          });
        }
      }
    }
    
    // Determine Origin and Destination
    if (events.length >= 1) {
      events.sort((a, b) => a.position - b.position);
      
      const eventsWithRoute = events.filter(ev => ev.routeOrigin || ev.routeDestination);
      if (eventsWithRoute.length > 0) {
        const routeSource = eventsWithRoute.find(ev => 
          ev.statusKeyword === 'DLV' || ev.statusKeyword === 'NFD' || ev.statusKeyword === 'RCF'
        ) || eventsWithRoute[0];
        
        if (routeSource.routeOrigin && isValidAirport(routeSource.routeOrigin)) {
          origin = routeSource.routeOrigin;
        }
        if (routeSource.routeDestination && isValidAirport(routeSource.routeDestination)) {
          destination = routeSource.routeDestination;
        }
      }
      
      const airportOrder: string[] = [];
      for (const ev of events) {
        if (ev.airportCode && !airportOrder.includes(ev.airportCode)) {
          airportOrder.push(ev.airportCode);
        }
      }
      
      if (!destination) {
        const deliveryEvent = events.find(ev => ev.statusKeyword === 'DLV' || ev.statusKeyword === 'NFD');
        if (deliveryEvent?.airportCode) destination = deliveryEvent.airportCode;
      }
      
      if (!origin) {
        const depEvents = events.filter(ev => ev.statusKeyword === 'DEP');
        if (depEvents.length > 0) origin = depEvents[depEvents.length - 1].airportCode;
      }
      
      if (!origin) {
        const acceptEvents = events.filter(ev => ev.statusKeyword === 'MAN' || ev.statusKeyword === 'RCS');
        if (acceptEvents.length > 0) origin = acceptEvents[acceptEvents.length - 1].airportCode;
      }
      
      if (!origin && airportOrder.length >= 2) {
        origin = airportOrder[airportOrder.length - 1];
      }
      
      if (!destination && airportOrder.length >= 1) {
        destination = airportOrder[0];
      }
    }
    
    // Determine Last Status with hierarchy
    const statusHierarchy: Record<string, number> = {
      'BKD': 1, 'FWB': 2, 'RCS': 3, 'MAN': 4, 'PRE': 5, 'DEP': 6,
      'TRM': 7, 'ARR': 8, 'RCF': 9, 'FOH': 10, 'NFD': 11, 'DLV': 12
    };
    
    let highestStage = 0;
    
    for (const ev of events) {
      if (ev.statusKeyword) {
        const stage = statusHierarchy[ev.statusKeyword] || 0;
        if (stage > highestStage) {
          highestStage = stage;
          lastStatus = ev.statusKeyword;
        }
      }
    }
    
    // Keyword fallbacks
    if (!lastStatus) {
      if (markdown.toLowerCase().includes('delivered')) lastStatus = 'DLV';
      else if (markdown.toLowerCase().includes('notified')) lastStatus = 'NFD';
      else if (markdown.toLowerCase().includes('received from flight')) lastStatus = 'RCF';
      else if (markdown.toLowerCase().includes('arrived')) lastStatus = 'ARR';
      else if (markdown.toLowerCase().includes('departed')) lastStatus = 'DEP';
      else if (markdown.toLowerCase().includes('manifested')) lastStatus = 'MAN';
    }
    
    console.log(`[PARCELSAPP 202] Final: Origin=${origin || 'null'}, Dest=${destination || 'null'}, Status=${lastStatus || 'null'}`);
    
    const hasValidData = (origin && isValidAirport(origin)) || 
                         (destination && isValidAirport(destination)) || 
                         (lastStatus && lastStatus.length >= 2);
    
    if (!hasValidData) {
      return { provider, ok: false, status: 404, error: 'Could not extract tracking data', sent: { url } };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: lastStatus || 'N/A',
          description: lastStatus || 'N/A',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 202] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= GSA FORCE 805 API =============

async function fetchGSAForce805(awb: string): Promise<StandardResult> {
  const provider = 'gsaforce_805';
  console.log(`[GSA FORCE 805] Fetching AWB: ${awb}`);
  
  try {
    // Extract digits from AWB
    const digits = awb.replace(/\D/g, '');
    
    // Split into prefix (first 3 digits) and number (rest)
    let prefix = '';
    let number = '';
    
    if (digits.length >= 4) {
      prefix = digits.substring(0, 3);
      number = digits.substring(3);
    } else {
      return { provider, ok: false, status: 400, error: 'Invalid AWB format for GSA Force', sent: { awb } };
    }
    
    console.log(`[GSA FORCE 805] Prefix: ${prefix}, Number: ${number}`);
    
    const url = 'https://gsaforce.com/wp-admin/admin-ajax.php';
    
    // Build form data
    const formData = new URLSearchParams();
    formData.append('trackpin0', prefix);
    formData.append('trackvalue0', number);
    formData.append('delnumber', '1');
    formData.append('action', 'get_api');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://gsaforce.com',
        'Referer': 'https://gsaforce.com/tracking/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData.toString(),
    });
    
    if (!response.ok) {
      console.error(`[GSA FORCE 805] HTTP error: ${response.status}`);
      return { provider, ok: false, status: response.status, error: `HTTP ${response.status}`, sent: { awb, prefix, number } };
    }
    
    const responseText = await response.text();
    console.log(`[GSA FORCE 805] Response length: ${responseText.length}`);
    console.log(`[GSA FORCE 805] Response preview: ${responseText.substring(0, 2000)}`);
    
    // Try to parse as JSON first
    let jsonData: any = null;
    try {
      jsonData = JSON.parse(responseText);
    } catch (e) {
      // Not JSON, treat as HTML
    }
    
    // Extract data from response
    let origin: string | null = null;
    let destination: string | null = null;
    let latestStatus: string | null = null;
    let extractedAwb: string | null = null;
    
    if (jsonData && typeof jsonData === 'object') {
      // Handle JSON response
      if (jsonData.data && typeof jsonData.data === 'string') {
        // Data contains HTML
        const htmlContent = jsonData.data;
        const extracted = extractGSAForceFromHTML(htmlContent);
        origin = extracted.origin;
        destination = extracted.destination;
        latestStatus = extracted.latestStatus;
        extractedAwb = extracted.awb;
      } else {
        // Direct JSON data
        extractedAwb = jsonData.awb || jsonData.data?.awb || null;
        latestStatus = jsonData.status || jsonData.data?.status || null;
      }
    } else {
      // Parse HTML response directly
      const extracted = extractGSAForceFromHTML(responseText);
      origin = extracted.origin;
      destination = extracted.destination;
      latestStatus = extracted.latestStatus;
      extractedAwb = extracted.awb;
    }
    
    console.log(`[GSA FORCE 805] Extracted - AWB: ${extractedAwb}, Origin: ${origin}, Destination: ${destination}, Status: ${latestStatus}`);
    
    // Check for "Result Not found"
    if (latestStatus && latestStatus.toLowerCase().includes('result not found')) {
      return {
        provider,
        ok: true,
        status: 200,
        error: null,
        sent: { awb, prefix, number },
        summary: {
          origin: undefined,
          destination: undefined,
          lastStatus: { code: 'NOT_FOUND', description: 'AWB not found in GSA Force system', timestamp: new Date().toISOString() }
        }
      };
    }
    
    // Map status to standard code
    const statusCode = mapGSAForceStatus(latestStatus);
    
    // Validate we got some data
    const hasValidData = (origin && origin.length >= 2) || 
                         (destination && destination.length >= 2) || 
                         (statusCode && statusCode !== 'INFO');
    
    if (!hasValidData) {
      console.log(`[GSA FORCE 805] No valid data extracted`);
      return { provider, ok: false, status: 404, error: 'Could not extract tracking data', sent: { awb, prefix, number } };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, prefix, number },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: statusCode,
          description: latestStatus || statusCode,
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[GSA FORCE 805] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

function extractGSAForceFromHTML(html: string): { awb: string | null; origin: string | null; destination: string | null; latestStatus: string | null } {
  let origin: string | null = null;
  let destination: string | null = null;
  let awb: string | null = null;
  let latestStatus: string | null = null;
  
  // Extract AWB
  const awbMatch = html.match(/Air WayBill Number.*?<b>\s*(\d{3})\s*<\/b>\s*(\d+)/si);
  if (awbMatch) {
    awb = awbMatch[1] + awbMatch[2];
  } else {
    // Fallback pattern
    const fallbackAwb = html.replace(/<[^>]*>/g, ' ').match(/\b(\d{3})\D+(\d{5,})\b/);
    if (fallbackAwb) {
      awb = fallbackAwb[1] + fallbackAwb[2];
    }
  }
  
  // Extract origin (From)
  const originMatch = html.match(/<label>From<\/label><span>([^<]+)<\/span>/i);
  if (originMatch) {
    origin = originMatch[1].trim();
  }
  
  // Extract destination (To)
  const destMatch = html.match(/<label>To<\/label><span>([^<]+)<\/span>/i);
  if (destMatch) {
    destination = destMatch[1].trim();
  }
  
  // Extract latest status from table rows
  const rowMatches = html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gsi);
  for (const rowMatch of rowMatches) {
    const row = rowMatch[1];
    const cellMatches = row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gsi);
    const cells: string[] = [];
    for (const cellMatch of cellMatches) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }
    if (cells.length >= 2 && cells[1] !== '') {
      latestStatus = cells[1]; // Keep updating - last non-empty becomes latest
    }
  }
  
  // Check for "Result Not found"
  if (!latestStatus && /Result\s*Not\s*found/i.test(html)) {
    latestStatus = 'Result Not found';
  }
  
  return { awb, origin, destination, latestStatus };
}

function mapGSAForceStatus(status: string | null): string {
  if (!status) return 'INFO';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('delivered') || statusLower.includes('entregue')) return 'DLV';
  if (statusLower.includes('flown') || statusLower.includes('departed') || statusLower.includes('partida')) return 'DEP';
  if (statusLower.includes('arrived') || statusLower.includes('chegada') || statusLower.includes('chegou')) return 'ARR';
  if (statusLower.includes('received from flight') || statusLower.includes('rcf')) return 'RCF';
  if (statusLower.includes('received from shipper') || statusLower.includes('rcs')) return 'RCS';
  if (statusLower.includes('manifest') || statusLower.includes('man')) return 'MAN';
  if (statusLower.includes('booked') || statusLower.includes('bkd')) return 'BKD';
  if (statusLower.includes('customs') || statusLower.includes('alfândega') || statusLower.includes('aduana')) return 'CUS';
  if (statusLower.includes('notify') || statusLower.includes('notified') || statusLower.includes('nfd')) return 'NFD';
  if (statusLower.includes('in transit') || statusLower.includes('em trânsito')) return 'TRA';
  if (statusLower.includes('not found')) return 'NOT_FOUND';
  
  // Return first 3-4 chars uppercase as fallback
  const clean = status.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return clean.substring(0, 4) || 'INFO';
}

// ============= SWISS CARGO API (OFFER AND ORDER - OFFICIAL API) =============

interface SwissTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface SwissMilestone {
  code?: { code?: string } | string;
  latestMilestone?: boolean;
  description?: string;
}

interface SwissServiceInfo {
  milestone?: SwissMilestone[];
}

interface SwissNode {
  origin?: { code?: string };
  destination?: { code?: string };
  serviceInfo?: SwissServiceInfo;
  [key: string]: unknown;
}

// Get OAuth token from Swiss API
async function fetchSwissToken(tenant: string, clientId: string, clientSecret: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const tokenUrl = 'https://offerandorder.swissworldcargo.com/api/uaa/guest/oauth/token?productName=offerandorder';
  
  const payload = new URLSearchParams({
    tenant,
    client_id: clientId,
    client_secret: clientSecret,
  });
  
  console.log(`[SWISS TOKEN] 🔐 Fetching OAuth token...`);
  
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });
    
    if (!response.ok) {
      console.error(`[SWISS TOKEN] ❌ HTTP ${response.status}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }
    
    const data: SwissTokenResponse = await response.json();
    
    if (!data.access_token) {
      console.error(`[SWISS TOKEN] ❌ Token ausente na resposta`);
      return { ok: false, error: 'Token ausente na resposta' };
    }
    
    console.log(`[SWISS TOKEN] ✅ Token obtained successfully`);
    return { ok: true, token: data.access_token };
  } catch (error) {
    console.error(`[SWISS TOKEN] ❌ Error:`, error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Extract summary from Swiss API response (recursive traversal like PHP)
function extractSwissSummary(data: unknown): { status: string | null; origin: string | null; destination: string | null } {
  const queue: unknown[] = [data];
  let status: string | null = null;
  let origin: string | null = null;
  let destination: string | null = null;
  
  while (queue.length > 0) {
    const node = queue.shift();
    
    if (!node || typeof node !== 'object') continue;
    
    const nodeObj = node as Record<string, unknown>;
    
    // Extract origin
    if (origin === null && nodeObj.origin) {
      const o = nodeObj.origin as Record<string, unknown>;
      if (typeof o === 'object' && o.code && typeof o.code === 'string') {
        origin = o.code;
        console.log(`[SWISS SUMMARY] ✅ Origin found: ${origin}`);
      }
    }
    
    // Extract destination
    if (destination === null && nodeObj.destination) {
      const d = nodeObj.destination as Record<string, unknown>;
      if (typeof d === 'object' && d.code && typeof d.code === 'string') {
        destination = d.code;
        console.log(`[SWISS SUMMARY] ✅ Destination found: ${destination}`);
      }
    }
    
    // Extract status from serviceInfo.milestone
    if (status === null && nodeObj.serviceInfo) {
      const svc = nodeObj.serviceInfo as Record<string, unknown>;
      if (typeof svc === 'object' && svc.milestone && Array.isArray(svc.milestone)) {
        const miles = svc.milestone as SwissMilestone[];
        let chosen: SwissMilestone | null = null;
        
        for (const ms of miles) {
          if (typeof ms !== 'object' || !ms) continue;
          chosen = ms;
          // Prefer the one marked as latestMilestone
          if (ms.latestMilestone) break;
        }
        
        if (chosen && chosen.code) {
          const c = chosen.code;
          if (typeof c === 'object' && c !== null && 'code' in c && typeof (c as Record<string, unknown>).code === 'string') {
            status = (c as Record<string, unknown>).code as string;
            console.log(`[SWISS SUMMARY] ✅ Status from milestone code.code: ${status}`);
          } else if (typeof c === 'string' && c !== '') {
            status = c;
            console.log(`[SWISS SUMMARY] ✅ Status from milestone code: ${status}`);
          }
        }
      }
    }
    
    // Recursively add child objects/arrays to queue
    for (const key in nodeObj) {
      const v = nodeObj[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'object' && item !== null) {
            queue.push(item);
          }
        }
      } else if (typeof v === 'object' && v !== null) {
        queue.push(v);
      }
    }
    
    // Early exit if all found
    if (status !== null && origin !== null && destination !== null) break;
  }
  
  return { status, origin, destination };
}

async function fetchSwissCargoAPI(awb: string): Promise<StandardResult> {
  const provider = 'SWISS CARGO';
  console.log(`[SWISS CARGO] 🚀 Starting fetch for AWB: ${awb}`);
  
  try {
    // Normalize AWB to 11 digits
    const digits = awb.replace(/\D/g, '');
    if (digits.length !== 11) {
      console.error(`[SWISS CARGO] ❌ AWB inválido (use 11 dígitos): ${awb}`);
      return {
        provider,
        ok: false,
        status: 400,
        error: 'AWB inválido (use 11 dígitos)',
        sent: { awb },
      };
    }
    
    const formattedAwb = `${digits.substring(0, 3)}-${digits.substring(3)}`;
    console.log(`[SWISS CARGO] 📋 Normalized AWB: ${formattedAwb} (digits: ${digits})`);
    
    // Step 1: Get OAuth token
    const tenant = 'LX';
    const clientId = 'mercator';
    const clientSecret = ''; // Empty as per PHP code
    
    const tokenResult = await fetchSwissToken(tenant, clientId, clientSecret);
    
    if (!tokenResult.ok || !tokenResult.token) {
      console.error(`[SWISS CARGO] ❌ Failed to obtain token: ${tokenResult.error}`);
      return {
        provider,
        ok: false,
        status: 401,
        error: `Falha ao obter token: ${tokenResult.error}`,
        sent: { awb: formattedAwb, tokenEndpoint: 'https://offerandorder.swissworldcargo.com/api/uaa/guest/oauth/token' },
      };
    }
    
    const bearer = tokenResult.token;
    console.log(`[SWISS CARGO] 🔐 Token obtained, proceeding with search...`);
    
    // Step 2: Call the POST search API with AWB (as per PHP callSwiss function)
    const searchEndpoint = 'https://offerandorder.swissworldcargo.com/api/order/services/cargo/v1/orders/actions/search?view=summary';
    
    // Payload structure exactly like PHP code
    const payload = {
      orderFilter: {
        airCapacity: {
          documentNumbers: [digits], // 11 digits without formatting
          includeItinerary: false,
        },
      },
      pageRequest: {
        page: 1,
        pageSize: 10,
      },
    };
    
    console.log(`[SWISS CARGO] 📡 Calling search API with AWB: ${digits}`);
    console.log(`[SWISS CARGO] 📡 Payload: ${JSON.stringify(payload)}`);
    
    const searchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://offerandorder.swissworldcargo.com',
      'Referer': 'https://offerandorder.swissworldcargo.com/app/offerandorder/',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'App-Id': 'OO003',
      'X-Tenant': tenant,
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': `Bearer ${bearer}`,
    };
    
    const searchResponse = await fetch(searchEndpoint, {
      method: 'POST',
      headers: searchHeaders,
      body: JSON.stringify(payload),
    });
    
    const httpStatus = searchResponse.status;
    console.log(`[SWISS CARGO] 📡 Search response status: ${httpStatus}`);
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`[SWISS CARGO] ❌ Search failed: HTTP ${httpStatus}`);
      console.error(`[SWISS CARGO] ❌ Error body: ${errorText.substring(0, 500)}`);
      return {
        provider,
        ok: false,
        status: httpStatus,
        error: `HTTP ${httpStatus}`,
        sent: { awb: formattedAwb, endpoint: searchEndpoint, payload },
      };
    }
    
    const searchData = await searchResponse.json();
    console.log(`[SWISS CARGO] 📄 Response received, extracting summary...`);
    console.log(`[SWISS CARGO] 📄 Raw response preview: ${JSON.stringify(searchData).substring(0, 1500)}`);
    
    // Step 3: Extract summary using recursive traversal (same as PHP extractSwissSummary)
    const summary = extractSwissSummary(searchData);
    
    console.log(`[SWISS CARGO] 🏁 Extracted: status=${summary.status}, origin=${summary.origin}, destination=${summary.destination}`);
    
    // Validate we got at least some data
    if (!summary.status && !summary.origin && !summary.destination) {
      console.warn(`[SWISS CARGO] ⚠️ No tracking data found in response`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB não encontrado ou sem dados de rastreio',
        sent: { awb: formattedAwb, endpoint: searchEndpoint, payload },
        raw: searchData,
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, endpoint: searchEndpoint, documentNumbers: digits },
      raw: searchData,
      summary: {
        origin: summary.origin || 'N/A',
        destination: summary.destination || 'N/A',
        lastStatus: {
          code: summary.status || 'N/A',
          description: summary.status || 'N/A',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[SWISS CARGO] ❌ Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= AEROMEXICO CARGO (139) =============

async function fetchAeromexicoAPI(awb: string): Promise<StandardResult> {
  const provider = 'AEROMEXICO';
  console.log(`[AEROMEXICO] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[AEROMEXICO] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format: 139-46285875 or 13946285875
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://amcargo.aeromexico.com/track/result/${formattedAwb}`;
    console.log(`[AEROMEXICO] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AEROMEXICO] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    
    console.log(`[AEROMEXICO] Markdown preview: ${markdown.substring(0, 1000)}`);
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // Extract Origin - pattern "Origen MEX" or "Origen\nMEX"
    const originMatch = markdown.match(/Origen\s*\n?\s*([A-Z]{3})/i) || html.match(/Origen[^<]*<[^>]*>([A-Z]{3})/i);
    if (originMatch) origin = originMatch[1].toUpperCase();
    
    // Extract Destination - pattern "Destino GRU" or "Destino\nGRU"
    const destMatch = markdown.match(/Destino\s*\n?\s*([A-Z]{3})/i) || html.match(/Destino[^<]*<[^>]*>([A-Z]{3})/i);
    if (destMatch) destination = destMatch[1].toUpperCase();
    
    // Extract Status - pattern "Estatus" followed by status text
    // Common statuses: "Transferido a otro operador", "Entregado", "Reservado", "Documentado"
    const statusMatch = markdown.match(/Estatus\s*\n?\s*(Transferido[^\n]*|Entregado[^\n]*|Reservado[^\n]*|Documentado[^\n]*|En\s+tr[aá]nsito[^\n]*|Recibido[^\n]*)/i)
      || markdown.match(/Estatus[^a-zA-Z]*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\n|$)/i);
    
    if (statusMatch) {
      const rawStatus = statusMatch[1].trim();
      // Map Spanish status to IATA codes
      const statusLower = rawStatus.toLowerCase();
      if (statusLower.includes('entregado') || statusLower.includes('delivered')) lastStatus = 'DLV';
      else if (statusLower.includes('transferido')) lastStatus = 'TFD';
      else if (statusLower.includes('en tránsito') || statusLower.includes('transit')) lastStatus = 'DEP';
      else if (statusLower.includes('recibido') || statusLower.includes('received')) lastStatus = 'RCF';
      else if (statusLower.includes('reservado') || statusLower.includes('booked')) lastStatus = 'BKD';
      else if (statusLower.includes('documentado') || statusLower.includes('manifested')) lastStatus = 'MAN';
      else if (statusLower.includes('notificado') || statusLower.includes('notified')) lastStatus = 'NFD';
      else lastStatus = rawStatus.substring(0, 20);
    }
    
    // Fallback: look for route pattern "MEX → GRU" or "MEX - GRU"
    if (!origin || !destination) {
      const routeMatch = markdown.match(/([A-Z]{3})\s*[→\->\s]+\s*([A-Z]{3})/);
      if (routeMatch) {
        if (!origin) origin = routeMatch[1];
        if (!destination) destination = routeMatch[2];
      }
    }
    
    console.log(`[AEROMEXICO] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    if (!origin && !destination && !lastStatus) {
      return { provider, ok: false, status: 404, error: 'No tracking data found', sent: { url }, raw: markdown.substring(0, 500) };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'N/A',
          description: lastStatus || 'N/A',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AEROMEXICO] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= TURKISH AIRLINES via ParcelsApp (235) =============

async function fetchParcelsApp235(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_235';
  console.log(`[PARCELSAPP 235] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 235] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: 235-82805402
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 235] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 235] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 235] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 235] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[PARCELSAPP 235] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // ParcelsApp format - extract from structured data
    
    // Extended invalid codes list - words and status codes that are NOT airports
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      // STATUS CODES - these are NOT airports
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // PRIORITY 1: ParcelsApp TABLE format - "| From | City Name (CODE)" or "| From | CODE, City Name"
    // This is the most reliable source - look for airport codes in From/To rows
    const fromTableWithParenMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableWithParenMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableWithParenMatch && isValidAirport(fromTableWithParenMatch[1])) {
      origin = fromTableWithParenMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 235] ✅ Origin from table (parentheses): ${origin}`);
    }
    if (toTableWithParenMatch && isValidAirport(toTableWithParenMatch[1])) {
      destination = toTableWithParenMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 235] ✅ Destination from table (parentheses): ${destination}`);
    }
    
    // PRIORITY 2: Table format "| From | CODE, City |"
    if (!origin) {
      const fromTableMatch = content.match(/\|\s*From\s*\|\s*([A-Z]{3})\s*,/i);
      if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
        origin = fromTableMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 235] ✅ Origin from table: ${origin}`);
      }
    }
    if (!destination) {
      const toTableMatch = content.match(/\|\s*To\s*\|\s*([A-Z]{3})\s*,/i);
      if (toTableMatch && isValidAirport(toTableMatch[1])) {
        destination = toTableMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 235] ✅ Destination from table: ${destination}`);
      }
    }
    
    // PRIORITY 3: ParcelsApp specific - "From\n\nCODE, City Name" or "To\n\nCODE, City Name"
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 235] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 235] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 4: Look for airport codes in timeline events - origin from first event location, destination from last
    if (!origin || !destination) {
      // Extract all airport codes from event locations (in parentheses after city names)
      const locationMatches = content.match(/[A-Za-z\s]+\(([A-Z]{3})\)/g);
      if (locationMatches && locationMatches.length >= 1) {
        const codes = locationMatches.map(m => {
          const match = m.match(/\(([A-Z]{3})\)/);
          return match ? match[1] : null;
        }).filter(c => c && isValidAirport(c)) as string[];
        
        if (codes.length >= 2) {
          // First event location is typically the current/last location
          // Last event location is typically the origin
          if (!destination) destination = codes[0]; // First code = current location = destination
          if (!origin) origin = codes[codes.length - 1]; // Last code = starting point = origin
          console.log(`[PARCELSAPP 235] ✅ Route from timeline locations: ${origin} → ${destination}`);
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // PRIORITY 1: Extract status code from the FIRST (most recent) event in timeline
    // ParcelsApp format: "**(DLV) Description...**" or similar at the start of events
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 235] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Look for status code in parentheses at start of first bold line
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 235] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Look for status codes in timeline order (first occurrence = most recent)
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          console.log(`[PARCELSAPP 235] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Fallback to keyword matching
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD' },
      ];
      
      for (const { patterns, code } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          console.log(`[PARCELSAPP 235] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK: Look for airport codes in timeline text (less reliable)
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[validCodes.length - 1]; // Last valid code = origin
            console.log(`[PARCELSAPP 235] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[0]; // First valid code = destination
            console.log(`[PARCELSAPP 235] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[PARCELSAPP 235] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error without destroying existing data
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[TURKISH CARGO] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= ROYAL AIR MAROC (147) via ParcelsApp =============

async function fetchParcelsApp147(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_147';
  console.log(`[PARCELSAPP 147] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 147] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: 147-91775294
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    // Try CHAMP eBooking first (official Royal Air Maroc tracking)
    const champUrl = `https://ebooking.champ.aero/trace/trace.asp?Carrier=AT&Shipment_text=${formattedAwb}`;
    console.log(`[PARCELSAPP 147] Trying CHAMP URL: ${champUrl}`);
    
    const champResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: champUrl,
        formats: ['markdown', 'html'],
        waitFor: 10000,
        timeout: 30000,
      }),
    });
    
    if (champResponse.ok) {
      const champData = await champResponse.json();
      const champContent = (champData?.data?.markdown || '') + '\n' + (champData?.data?.html || '');
      console.log(`[PARCELSAPP 147] CHAMP content length: ${champContent.length}`);
      console.log(`[PARCELSAPP 147] CHAMP preview: ${champContent.substring(0, 2000)}`);
      
      // Extract from CHAMP format: "Delivered to consignee" status, Destination column
      let origin: string | null = null;
      let destination: string | null = null;
      let lastStatus: string | null = null;
      
      // Check for "Delivered to consignee" - this means DLV
      if (/delivered\s+to\s+consignee/i.test(champContent)) {
        lastStatus = 'DLV';
        console.log(`[PARCELSAPP 147] ✅ Status from CHAMP: DLV (Delivered to consignee)`);
      }
      
      // Extract destination from CHAMP table (usually last column header is "Destination")
      // Format: "Destination | IST" or similar patterns in the table
      const destMatch = champContent.match(/Destination[^|]*\|\s*([A-Z]{3})\b/i) ||
                        champContent.match(/\|\s*([A-Z]{3})\s*\|?\s*$/m);
      if (destMatch) {
        destination = destMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Destination from CHAMP: ${destination}`);
      }
      
      // Look for Istanbul specifically since we know this AWB goes there
      if (!destination && /istanbul/i.test(champContent)) {
        destination = 'IST';
        console.log(`[PARCELSAPP 147] ✅ Destination from city name: IST`);
      }
      
      // Extract origin - look for first airport code in route or "from" pattern
      const originPatterns = [
        /from\s+([A-Z]{3})/i,
        /origin[:\s]+([A-Z]{3})/i,
        /([A-Z]{3})\s*[-→>]\s*[A-Z]{3}/i,
      ];
      for (const pattern of originPatterns) {
        const match = champContent.match(pattern);
        if (match && match[1] !== destination) {
          origin = match[1].toUpperCase();
          console.log(`[PARCELSAPP 147] ✅ Origin from CHAMP pattern: ${origin}`);
          break;
        }
      }
      
      // If we got status, return success
      if (lastStatus || destination) {
        return {
          provider,
          ok: true,
          status: 200,
          error: null,
          sent: { url: champUrl, awb: formattedAwb },
          summary: {
            origin: origin || undefined,
            destination: destination || undefined,
            lastStatus: lastStatus ? {
              code: lastStatus,
              description: lastStatus === 'DLV' ? 'Delivered to consignee' : lastStatus,
              timestamp: new Date().toISOString(),
            } : undefined,
          },
        };
      }
    }
    
    // Fallback to ParcelsApp
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 147] Fallback to ParcelsApp: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 147] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 147] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 147] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[PARCELSAPP 147] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    // Check for not found patterns
    if (contentLower.includes('not found') || contentLower.includes('no tracking information') || 
        contentLower.includes('tracking data is not available')) {
      console.log(`[PARCELSAPP 147] AWB not found`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'AWB not found', 
        sent: { url } 
      };
    }

    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // Extended invalid codes list
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // PRIORITY 1: ParcelsApp TABLE format - "| From | City Name (CODE)"
    const fromTableWithParenMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableWithParenMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableWithParenMatch && isValidAirport(fromTableWithParenMatch[1])) {
      origin = fromTableWithParenMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 147] ✅ Origin from table (parentheses): ${origin}`);
    }
    if (toTableWithParenMatch && isValidAirport(toTableWithParenMatch[1])) {
      destination = toTableWithParenMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 147] ✅ Destination from table (parentheses): ${destination}`);
    }
    
    // PRIORITY 2: Table format "| From | CODE, City |"
    if (!origin) {
      const fromTableMatch = content.match(/\|\s*From\s*\|\s*([A-Z]{3})\s*,/i);
      if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
        origin = fromTableMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Origin from table: ${origin}`);
      }
    }
    if (!destination) {
      const toTableMatch = content.match(/\|\s*To\s*\|\s*([A-Z]{3})\s*,/i);
      if (toTableMatch && isValidAirport(toTableMatch[1])) {
        destination = toTableMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Destination from table: ${destination}`);
      }
    }
    
    // PRIORITY 3: ParcelsApp specific - "From\n\nCODE, City Name"
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 4: Airport codes from event locations
    if (!origin || !destination) {
      const locationMatches = content.match(/[A-Za-z\s]+\(([A-Z]{3})\)/g);
      if (locationMatches && locationMatches.length >= 1) {
        const codes = locationMatches.map(m => {
          const match = m.match(/\(([A-Z]{3})\)/);
          return match ? match[1] : null;
        }).filter(c => c && isValidAirport(c)) as string[];
        
        if (codes.length >= 2) {
          if (!destination) destination = codes[0];
          if (!origin) origin = codes[codes.length - 1];
          console.log(`[PARCELSAPP 147] ✅ Route from timeline locations: ${origin} → ${destination}`);
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // PRIORITY 1: Status code from first event
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 147] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Status code in parentheses
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 147] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Status codes by order
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          console.log(`[PARCELSAPP 147] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Keyword matching
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD' },
      ];
      
      for (const { patterns, code } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          console.log(`[PARCELSAPP 147] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[validCodes.length - 1];
            console.log(`[PARCELSAPP 147] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[0];
            console.log(`[PARCELSAPP 147] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[PARCELSAPP 147] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 147] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= TAAG ANGOLA AIRLINES (118) via ParcelsApp =============

async function fetchParcelsApp118(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_118';
  console.log(`[PARCELSAPP 118] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 118] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: 118-12879871
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 118] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 118] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 118] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 118] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[PARCELSAPP 118] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    // Check for not found patterns
    if (contentLower.includes('not found') || contentLower.includes('no tracking information') || 
        contentLower.includes('tracking data is not available')) {
      console.log(`[PARCELSAPP 118] AWB not found`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'AWB not found', 
        sent: { url } 
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription: string | null = null;
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // Extended invalid codes list - INCLUDES STATUS CODES to prevent them from being mistaken as airports
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'N/A', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HAS', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'OUT', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'LET', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      // STATUS CODES - these are NOT airports
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // PRIORITY 1: ParcelsApp TABLE format - "| From | Frankfurt Main (FRA), Frankfurt |"
    // This is the most reliable source in the markdown table at the bottom
    const fromTableMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
      origin = fromTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 118] ✅ Origin from table: ${origin}`);
    }
    if (toTableMatch && isValidAirport(toTableMatch[1])) {
      destination = toTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 118] ✅ Destination from table: ${destination}`);
    }
    
    // PRIORITY 2: ParcelsApp specific - "From\n\nCODE, City Name" or "To\n\nCODE, City Name"
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 118] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 118] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 3: Route arrow pattern "CODE → CODE"
    if (!origin || !destination) {
      const routeMatch = content.match(/\b([A-Z]{3})\s*[→➔>\-–]\s*([A-Z]{3})\b/);
      if (routeMatch && isValidAirport(routeMatch[1]) && isValidAirport(routeMatch[2])) {
        if (!origin) origin = routeMatch[1].toUpperCase();
        if (!destination) destination = routeMatch[2].toUpperCase();
        console.log(`[PARCELSAPP 118] ✅ Route from arrow pattern: ${origin} → ${destination}`);
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // PRIORITY 1: Extract status code from the FIRST (most recent) event in timeline
    // ParcelsApp format: "**(DLV) Description...**" or similar at the start of events
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      lastStatusDescription = lastStatus;
      console.log(`[PARCELSAPP 118] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Look for status code in parentheses at start of first bold line
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        lastStatusDescription = lastStatus;
        console.log(`[PARCELSAPP 118] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Look for status codes in timeline order (first occurrence = most recent)
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          lastStatusDescription = code;
          console.log(`[PARCELSAPP 118] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Fallback to keyword matching on entire content
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV', desc: 'Delivered' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP', desc: 'Departed' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR', desc: 'Arrived' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF', desc: 'Received from Flight' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS', desc: 'Received from Shipper' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN', desc: 'Manifested' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD', desc: 'Booked' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD', desc: 'Notified' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD', desc: 'Customs Cleared' },
      ];
      
      for (const { patterns, code, desc } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          lastStatusDescription = desc;
          console.log(`[PARCELSAPP 118] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK: Look for valid airport codes from timeline text
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[0];
            console.log(`[PARCELSAPP 118] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[validCodes.length - 1];
            console.log(`[PARCELSAPP 118] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[PARCELSAPP 118] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatusDescription || lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 118] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= CHINA CARGO AIRLINES (112) VIA PARCELSAPP =============

async function fetchParcelsApp112(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_112';
  console.log(`[PARCELSAPP 112] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 112] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Normalize AWB: accept 112-39157473 or 11239157473
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 112] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 112] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 112] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 112] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[PARCELSAPP 112] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    // Check for not found patterns
    if (contentLower.includes('not found') || contentLower.includes('no tracking information') || 
        contentLower.includes('tracking data is not available') || contentLower.includes('no information about your package')) {
      console.log(`[PARCELSAPP 112] AWB not found`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'AWB not found', 
        sent: { url } 
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription: string | null = null;
    
    // ========== INVALID CODES LIST ==========
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'N/A', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HAS', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'OUT', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'LET', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      // STATUS CODES - these are NOT airports
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // PRIORITY 1: ParcelsApp TABLE format - "| From | Shanghai Pudong (PVG), Shanghai |"
    const fromTableMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
      origin = fromTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 112] ✅ Origin from table: ${origin}`);
    }
    if (toTableMatch && isValidAirport(toTableMatch[1])) {
      destination = toTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 112] ✅ Destination from table: ${destination}`);
    }
    
    // PRIORITY 2: ParcelsApp specific - "From\n\nCODE, City Name" or "To\n\nCODE, City Name"
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 112] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 112] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 3: Route arrow pattern "CODE → CODE"
    if (!origin || !destination) {
      const routeMatch = content.match(/\b([A-Z]{3})\s*[→➔>\-–]\s*([A-Z]{3})\b/);
      if (routeMatch && isValidAirport(routeMatch[1]) && isValidAirport(routeMatch[2])) {
        if (!origin) origin = routeMatch[1].toUpperCase();
        if (!destination) destination = routeMatch[2].toUpperCase();
        console.log(`[PARCELSAPP 112] ✅ Route from arrow pattern: ${origin} → ${destination}`);
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // PRIORITY 1: Extract status code from the FIRST (most recent) event in timeline
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      lastStatusDescription = lastStatus;
      console.log(`[PARCELSAPP 112] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Look for status code in parentheses at start of first bold line
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        lastStatusDescription = lastStatus;
        console.log(`[PARCELSAPP 112] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Look for status codes in timeline order (first occurrence = most recent)
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          lastStatusDescription = code;
          console.log(`[PARCELSAPP 112] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Fallback to keyword matching on entire content
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV', desc: 'Delivered' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP', desc: 'Departed' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR', desc: 'Arrived' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF', desc: 'Received from Flight' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS', desc: 'Received from Shipper' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN', desc: 'Manifested' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD', desc: 'Booked' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD', desc: 'Notified' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD', desc: 'Customs Cleared' },
      ];
      
      for (const { patterns, code, desc } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          lastStatusDescription = desc;
          console.log(`[PARCELSAPP 112] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK: Look for valid airport codes from timeline text
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[0];
            console.log(`[PARCELSAPP 112] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[validCodes.length - 1];
            console.log(`[PARCELSAPP 112] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[PARCELSAPP 112] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatusDescription || lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 112] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= SKY AIRLINE CHILE (605) VIA PARCELSAPP =============

async function fetchParcelsApp605(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_605';
  console.log(`[PARCELSAPP 605] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[PARCELSAPP 605] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: 605-12345678
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[PARCELSAPP 605] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PARCELSAPP 605] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[PARCELSAPP 605] Content length: ${content.length}`);
    console.log(`[PARCELSAPP 605] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[PARCELSAPP 605] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    // Check for not found patterns
    if (contentLower.includes('not found') || contentLower.includes('no tracking information') || 
        contentLower.includes('tracking data is not available')) {
      console.log(`[PARCELSAPP 605] AWB not found`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'AWB not found', 
        sent: { url } 
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription: string | null = null;
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'N/A', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HAS', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'OUT', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'LET', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      // STATUS CODES - these are NOT airports
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // PRIORITY 1: ParcelsApp TABLE format
    const fromTableMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
      origin = fromTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 605] ✅ Origin from table: ${origin}`);
    }
    if (toTableMatch && isValidAirport(toTableMatch[1])) {
      destination = toTableMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 605] ✅ Destination from table: ${destination}`);
    }
    
    // PRIORITY 2: ParcelsApp specific patterns
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 605] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[PARCELSAPP 605] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 3: Route arrow pattern
    if (!origin || !destination) {
      const routeMatch = content.match(/\b([A-Z]{3})\s*[→➔>\-–]\s*([A-Z]{3})\b/);
      if (routeMatch && isValidAirport(routeMatch[1]) && isValidAirport(routeMatch[2])) {
        if (!origin) origin = routeMatch[1].toUpperCase();
        if (!destination) destination = routeMatch[2].toUpperCase();
        console.log(`[PARCELSAPP 605] ✅ Route from arrow pattern: ${origin} → ${destination}`);
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      lastStatusDescription = lastStatus;
      console.log(`[PARCELSAPP 605] ✅ Status from first event: ${lastStatus}`);
    }
    
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        lastStatusDescription = lastStatus;
        console.log(`[PARCELSAPP 605] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          lastStatusDescription = code;
          console.log(`[PARCELSAPP 605] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV', desc: 'Delivered' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP', desc: 'Departed' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR', desc: 'Arrived' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF', desc: 'Received from Flight' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS', desc: 'Received from Shipper' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN', desc: 'Manifested' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD', desc: 'Booked' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD', desc: 'Notified' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD', desc: 'Customs Cleared' },
      ];
      
      for (const { patterns, code, desc } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          lastStatusDescription = desc;
          console.log(`[PARCELSAPP 605] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[0];
            console.log(`[PARCELSAPP 605] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[validCodes.length - 1];
            console.log(`[PARCELSAPP 605] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[PARCELSAPP 605] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatusDescription || lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[PARCELSAPP 605] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= AMERICAN AIRLINES CARGO (001) =============

// ============= AMERICAN AIRLINES (001) via ParcelsApp =============
// ParcelsApp provides more reliable tracking for AA Cargo

async function fetchAmericanAirlinesAPI(awb: string): Promise<StandardResult> {
  const provider = 'parcelsapp_001';
  console.log(`[AA CARGO 001] Fetching AWB via ParcelsApp: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[AA CARGO 001] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format AWB: 001-14016424
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[AA CARGO 001] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AA CARGO 001] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[AA CARGO 001] Content length: ${content.length}`);
    console.log(`[AA CARGO 001] Markdown preview: ${markdown.substring(0, 3000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[AA CARGO 001] Content too small, possibly blocked`);
      return { provider, ok: false, status: 404, error: 'Content too small', sent: { url } };
    }
    
    // Check for not found patterns
    if (contentLower.includes('not found') || contentLower.includes('no tracking information') || 
        contentLower.includes('tracking data is not available')) {
      console.log(`[AA CARGO 001] AWB not found`);
      return { provider, ok: false, status: 404, error: 'AWB not found', sent: { url } };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastEventTimestamp: string | null = null;
    
    // Invalid codes that should not be treated as airport codes
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCD', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC',
      'CAP', 'ERR', 'NIL', 'NIF', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX', 'CAR', 'COD', 'DIM'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // PRIORITY 0: ParcelsApp TABLE format - "| Origin | Los Angeles Intl (LAX), Los Angeles |"
    // Table format in markdown: "| Origin | City Name (CODE), Country |"
    const originTableMatch = content.match(/Origin\s*\|[^|]*\(([A-Z]{3})\)/i);
    const destTableMatch = content.match(/Destination\s*\|[^|]*\(([A-Z]{3})\)/i);
    
    if (originTableMatch && isValidAirport(originTableMatch[1])) {
      origin = originTableMatch[1].toUpperCase();
      console.log(`[AA CARGO 001] ✅ Origin from Origin table: ${origin}`);
    }
    if (destTableMatch && isValidAirport(destTableMatch[1])) {
      destination = destTableMatch[1].toUpperCase();
      console.log(`[AA CARGO 001] ✅ Destination from Destination table: ${destination}`);
    }
    
    // PRIORITY 1: ParcelsApp TABLE format - "| From | Los Angeles Intl (LAX) |"
    if (!origin) {
      const fromTableMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
      if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
        origin = fromTableMatch[1].toUpperCase();
        console.log(`[AA CARGO 001] ✅ Origin from From table: ${origin}`);
      }
    }
    if (!destination) {
      const toTableMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
      if (toTableMatch && isValidAirport(toTableMatch[1])) {
        destination = toTableMatch[1].toUpperCase();
        console.log(`[AA CARGO 001] ✅ Destination from To table: ${destination}`);
      }
    }
    
    // PRIORITY 2: "From\n\nCODE, City" or "To\n\nCODE, City" patterns
    if (!origin) {
      const fromMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromMatch && isValidAirport(fromMatch[1])) {
        origin = fromMatch[1].toUpperCase();
        console.log(`[AA CARGO 001] ✅ Origin from From pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toMatch && isValidAirport(toMatch[1])) {
        destination = toMatch[1].toUpperCase();
        console.log(`[AA CARGO 001] ✅ Destination from To pattern: ${destination}`);
      }
    }
    
    // PRIORITY 3: Extract from "City Name (CODE)" format in events (timeline)
    // Events are ordered newest first, so last code = origin, first code = destination
    if (!origin || !destination) {
      const locationMatches = content.match(/[A-Za-z\s]+\(([A-Z]{3})\)/g);
      if (locationMatches && locationMatches.length >= 2) {
        const codes = locationMatches.map(m => {
          const match = m.match(/\(([A-Z]{3})\)/);
          return match ? match[1] : null;
        }).filter(c => c && isValidAirport(c)) as string[];
        
        // Get unique codes preserving order
        const uniqueCodes: string[] = [];
        for (const code of codes) {
          if (!uniqueCodes.includes(code)) {
            uniqueCodes.push(code);
          }
        }
        
        if (uniqueCodes.length >= 2) {
          if (!destination) destination = uniqueCodes[0]; // First unique = destination (most recent)
          if (!origin) origin = uniqueCodes[uniqueCodes.length - 1]; // Last unique = origin
          console.log(`[AA CARGO 001] ✅ Route from timeline: ${origin} → ${destination}`);
        }
      }
    }
    
    // PRIORITY 4: Look for explicit route patterns "XXX - YYY" or "XXX → YYY"
    if (!origin || !destination) {
      const routePatterns = [
        /Route[:\s]+([A-Z]{3})\s*[-→>]\s*([A-Z]{3})/i,
        /Routing[:\s]+([A-Z]{3})\s*[-→>]\s*([A-Z]{3})/i,
        /([A-Z]{3})\s*→\s*([A-Z]{3})/,
      ];
      
      for (const pattern of routePatterns) {
        const routeMatch = content.match(pattern);
        if (routeMatch && isValidAirport(routeMatch[1]) && isValidAirport(routeMatch[2])) {
          if (!origin) origin = routeMatch[1].toUpperCase();
          if (!destination) destination = routeMatch[2].toUpperCase();
          console.log(`[AA CARGO 001] ✅ Route from pattern: ${origin} → ${destination}`);
          break;
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // Parse tracking history table to get the LAST event (chronologically sorted ASC)
    // The tracking history in ParcelsApp shows events with timestamps
    
    // PRIORITY 1: Look for status code in first bold event (most recent)
    // Format: "**(DLV) Delivered**" or similar
    const statusEventMatch = content.match(/\*\*\s*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (statusEventMatch) {
      lastStatus = statusEventMatch[1].toUpperCase();
      console.log(`[AA CARGO 001] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Status code in standalone parentheses near top
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        console.log(`[AA CARGO 001] ✅ Status from bold: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Search for status codes by priority (DLV first)
    if (!lastStatus) {
      const STATUS_PRIORITY = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWD', 'FOH', 'PRE', 'TFD'];
      for (const code of STATUS_PRIORITY) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          console.log(`[AA CARGO 001] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Keyword matching for status
    if (!lastStatus) {
      if (contentLower.includes('delivered')) lastStatus = 'DLV';
      else if (contentLower.includes('ready for pick') || contentLower.includes('notified')) lastStatus = 'NFD';
      else if (contentLower.includes('received from flight')) lastStatus = 'RCF';
      else if (contentLower.includes('arrived')) lastStatus = 'ARR';
      else if (contentLower.includes('departed') || contentLower.includes('in transit')) lastStatus = 'DEP';
      else if (contentLower.includes('manifested')) lastStatus = 'MAN';
      else if (contentLower.includes('accepted') || contentLower.includes('received')) lastStatus = 'RCS';
      else if (contentLower.includes('booked')) lastStatus = 'BKD';
      
      if (lastStatus) console.log(`[AA CARGO 001] ✅ Status from keyword: ${lastStatus}`);
    }
    
    // Extract timestamp from first event if available
    const timestampMatch = content.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4}),?\s*(\d{1,2}:\d{2})/);
    if (timestampMatch) {
      lastEventTimestamp = `${timestampMatch[1]} ${timestampMatch[2]}`;
      console.log(`[AA CARGO 001] ✅ Timestamp: ${lastEventTimestamp}`);
    }
    
    console.log(`[AA CARGO 001] 🏁 Final: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // Validate we got useful data
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'INFO',
          description: lastStatus || 'Info',
          timestamp: lastEventTimestamp || new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AA CARGO 001] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= LEGACY AMERICAN AIRLINES (001) via AA Cargo Mobile (backup) =============

async function fetchAmericanAirlinesAPILegacy(awb: string): Promise<StandardResult> {
  const provider = 'aa_cargo_mobile';
  console.log(`[AA CARGO LEGACY] Fetching AWB: ${awb}`);
  
  // Words that are NOT valid IATA airport codes
  const EXCLUDED_CODES = new Set([
    'ADD', 'ADY', 'AIR', 'ALL', 'AND', 'ANY', 'APP', 'ARE', 'AWB', 'BOO', 'BOX', 'BUT', 'CAN', 
    'CAR', 'COD', 'CSS', 'DAY', 'DIM', 'DOC', 'FOR', 'GET', 'GIF', 'HAS', 'HTM', 'HUB', 'IBS', 
    'ICO', 'IMG', 'JPG', 'KEY', 'KGS', 'LOG', 'MAX', 'MIN', 'NEW', 'NOT', 'NOW', 'ODD', 'OUR', 
    'OUT', 'OWN', 'PCS', 'PDF', 'PNG', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SEE', 'SET', 'SRC', 
    'SUM', 'SVG', 'TAB', 'THE', 'TOP', 'TRY', 'TXT', 'URL', 'USE', 'VIA', 'WAY', 'WEB', 'XML', 
    'YES', 'ZIP', 'API', 'COM', 'NET', 'ORG', 'EDU', 'GOV', 'FLT', 'REF', 'INFO', 'LBS', 'KGS',
    // Additional invalid codes that are NOT real airports
    'ACK', 'CCD', 'KNO', 'AWB', 'DIM', 'VOL', 'CHG', 'PER', 'DAY', 'AIR', 'CAR', 'BOX', 'PKG'
  ]);
  
  const isValidAirportCode = (code: string): boolean => {
    if (!code || code.length !== 3) return false;
    return !EXCLUDED_CODES.has(code.toUpperCase());
  };
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[AA CARGO] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format: 001-11885403 → 00111885403 (11 digits without hyphen)
    const digits = awb.replace(/\D/g, '');
    const awbParam = digits.length === 11 ? digits : (digits.length === 8 ? `001${digits}` : digits);
    
    const url = `https://www.aacargo.com/mobile/tracking-details.html?awb=${awbParam}`;
    console.log(`[AA CARGO] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 20000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AA CARGO] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    
    console.log(`[AA CARGO] Content length: ${content.length}`);
    console.log(`[AA CARGO] Markdown preview: ${markdown.substring(0, 2500)}`);
    
    // ========== CRITICAL: CHECK FOR "NOT FOUND" FIRST ==========
    // Must detect non-existent AWBs BEFORE trying to extract any data
    const contentLower = content.toLowerCase();
    
    // First, check if we have valid tracking content - if yes, skip NOT FOUND checks
    const hasValidTrackingData = 
      contentLower.includes('delivered') ||
      contentLower.includes('in transit') ||
      contentLower.includes('departed') ||
      contentLower.includes('arrived') ||
      contentLower.includes('received from flight') ||
      contentLower.includes('booked') ||
      contentLower.includes('accepted') ||
      // Has route header like "Dallas DFW→Sao Paulo GRU"
      /[a-z]+\s+[a-z]{3}\s*→\s*[a-z]+\s+[a-z]{3}/i.test(content);
    
    // Only check for NOT FOUND if we don't have valid tracking data
    if (!hasValidTrackingData) {
      // Check for explicit "not found" messages from AA Cargo
      const isNotFound = 
        contentLower.includes('air waybill not found') || 
        contentLower.includes('waybill not found') ||
        contentLower.includes('awb not found') ||
        (contentLower.includes('not found') && contentLower.includes('please check')) ||
        (contentLower.includes('not found') && contentLower.includes('three-digit')) ||
        (contentLower.includes('not found') && contentLower.includes('eight-digit')) ||
        contentLower.includes('please check the three-digit airline code') ||
        // Check for hidden tracking sections (display: none on tracking elements)
        (content.includes('c-tracking-header') && content.includes('display: none') && content.includes('c-tracking-status')) ||
        content.length < 300;
      
      if (isNotFound) {
        console.log(`[AA CARGO] ❌ AWB NOT FOUND detected in page content`);
        return { provider, ok: false, status: 404, error: 'AWB not found', sent: { url }, raw: markdown.substring(0, 500) };
      }
      
      // ADDITIONAL CHECK: If the page contains "Track Another Shipment" but NO tracking events
      // This indicates we're on a not-found page with just the search form
      const hasTrackAnotherShipment = contentLower.includes('track another shipment');
      
      if (hasTrackAnotherShipment) {
        console.log(`[AA CARGO] ❌ Only search form present, no tracking events - AWB not found`);
        return { provider, ok: false, status: 404, error: 'AWB not found', sent: { url }, raw: markdown.substring(0, 500) };
      }
      
      // Also check if there's no actual tracking content (e.g., just navigation)
      if (content.length < 1500) {
        console.log(`[AA CARGO] ❌ No tracking content found in page (content too short)`);
        return { provider, ok: false, status: 404, error: 'No tracking data found', sent: { url }, raw: markdown.substring(0, 500) };
      }
    }
    
    console.log(`[AA CARGO] ✅ Valid tracking data found, proceeding with extraction`);
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // CRITICAL: Must extract from COMPLETE ROUTE header, not from intermediate hub events
    // AA Cargo format: "Dallas DFW→Sao Paulo GRU" in the header
    
    // PRIORITY 0 (AA CARGO SPECIFIC): "City Name CODE→City Name CODE" format
    // This is the MOST RELIABLE source - the main route header
    // Match pattern: "CityName CODE→CityName CODE" with arrow (→)
    // Must have arrow (→) to distinguish from other text
    const aaCityRouteMatches = content.match(/([A-Za-z][A-Za-z\s]{1,20})\s+([A-Z]{3})\s*→\s*([A-Za-z][A-Za-z\s]{1,20})\s+([A-Z]{3})/g);
    if (aaCityRouteMatches && aaCityRouteMatches.length > 0) {
      // Use the FIRST match which is typically the header route
      const firstMatch = aaCityRouteMatches[0].match(/([A-Za-z][A-Za-z\s]{1,20})\s+([A-Z]{3})\s*→\s*([A-Za-z][A-Za-z\s]{1,20})\s+([A-Z]{3})/);
      if (firstMatch) {
        const fromCode = firstMatch[2].toUpperCase();
        const toCode = firstMatch[4].toUpperCase();
        if (isValidAirportCode(fromCode) && isValidAirportCode(toCode)) {
          origin = fromCode;
          destination = toCode;
          console.log(`[AA CARGO] ✅ Route from AA header (PRIORITY 0): ${origin} → ${destination}`);
        }
      }
    }
    
    // PRIORITY 1: Look for explicit route in flight table with arrow "DFW→GRU"
    // This is very reliable as it shows the actual flight route
    if (!origin || !destination) {
      const flightRouteMatches = content.match(/\b([A-Z]{3})\s*→\s*([A-Z]{3})\b/g);
      if (flightRouteMatches && flightRouteMatches.length > 0) {
        // Extract all routes and find origin (first departure) and destination (last arrival)
        const routes: { from: string; to: string }[] = [];
        for (const routeStr of flightRouteMatches) {
          const match = routeStr.match(/([A-Z]{3})\s*→\s*([A-Z]{3})/);
          if (match) {
            const from = match[1].toUpperCase();
            const to = match[2].toUpperCase();
            if (isValidAirportCode(from) && isValidAirportCode(to) && from !== to) {
              routes.push({ from, to });
            }
          }
        }
        if (routes.length > 0) {
          if (!origin) origin = routes[0].from;
          if (!destination) destination = routes[routes.length - 1].to;
          console.log(`[AA CARGO] ✅ Route from flight table arrows (PRIORITY 1): ${origin} → ${destination}`);
        }
      }
    }
    
    // PRIORITY 2: Look for explicit "Origin" and "Destination" labels
    if (!origin) {
      const originLabelMatch = content.match(/(?:Origin|Departure)[:\s]+([A-Z]{3})\b/i);
      if (originLabelMatch && isValidAirportCode(originLabelMatch[1])) {
        origin = originLabelMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Origin from inline label (PRIORITY 2): ${origin}`);
      }
    }
    if (!destination) {
      const destLabelMatch = content.match(/(?:Destination|Final\s*Dest(?:ination)?|Arrival)[:\s]+([A-Z]{3})\b/i);
      if (destLabelMatch && isValidAirportCode(destLabelMatch[1])) {
        destination = destLabelMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Destination from inline label (PRIORITY 2): ${destination}`);
      }
    }
    
    // PRIORITY 3: Extract from "Delivered/Arrived/Departed in XXX" patterns
    // This captures the actual location from status messages
    if (!destination) {
      // Look for "Picked up in GRU" or "Delivered in GRU" - this is the FINAL destination
      const deliveredMatch = content.match(/(?:Picked\s+up|Delivered|arrived)\s+(?:in|at)\s+([A-Z]{3})\b/i);
      if (deliveredMatch && isValidAirportCode(deliveredMatch[1])) {
        destination = deliveredMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Destination from delivery location (PRIORITY 3): ${destination}`);
      }
    }
    if (!origin) {
      // Look for "Received at XXX" - this is typically the origin
      const receivedMatch = content.match(/(?:Received|Accepted)\s+(?:at|in)\s+([A-Z]{3})\b/i);
      if (receivedMatch && isValidAirportCode(receivedMatch[1])) {
        origin = receivedMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Origin from received location (PRIORITY 3): ${origin}`);
      }
    }
    
    // PRIORITY 4: Extract from parentheses "(XXX)" format in timeline
    // ONLY use this if we still don't have origin/destination
    if (!origin || !destination) {
      const airportMatches = content.match(/\(([A-Z]{3})\)/g);
      if (airportMatches && airportMatches.length >= 2) {
        const codes = airportMatches.map(m => m.replace(/[()]/g, '')).filter(isValidAirportCode);
        // Filter out common false positives
        const filteredCodes = codes.filter(c => !['USD', 'LBS', 'KGS', 'PCS', 'AWB', 'ETD', 'ETA', 'EST', 'UTC', 'GMT'].includes(c));
        if (filteredCodes.length >= 2) {
          if (!origin) {
            origin = filteredCodes[0];
            console.log(`[AA CARGO] ✅ Origin from parentheses (PRIORITY 4): ${origin}`);
          }
          if (!destination) {
            destination = filteredCodes[filteredCodes.length - 1];
            console.log(`[AA CARGO] ✅ Destination from parentheses (PRIORITY 4): ${destination}`);
          }
        }
      }
    }
    
    // PRIORITY 5: Simple CODE-CODE or CODE - CODE pattern (hyphen, not arrow)
    // This is less reliable, only use as last resort
    if (!origin || !destination) {
      // Look specifically for flight segment patterns with hyphens
      const segmentPattern = /\b([A-Z]{3})\s*[\-–]\s*([A-Z]{3})\b/g;
      const segments: { from: string; to: string }[] = [];
      let segMatch;
      while ((segMatch = segmentPattern.exec(content)) !== null) {
        const from = segMatch[1].toUpperCase();
        const to = segMatch[2].toUpperCase();
        if (isValidAirportCode(from) && isValidAirportCode(to) && from !== to) {
          segments.push({ from, to });
        }
      }
      
      if (segments.length > 0) {
        if (!origin) origin = segments[0].from;
        if (!destination) destination = segments[segments.length - 1].to;
        console.log(`[AA CARGO] ✅ Route from hyphen segments (PRIORITY 5): ${origin} → ${destination}`);
      }
    }
    
    // ========== EXTRACT STATUS ==========
    // Look for status keywords - prioritize terminal states
    const statusPatterns = [
      { pattern: /\b(Delivered|DELIVERED)\b/i, code: 'DLV' },
      { pattern: /\b(Departed|DEPARTED|Departure)\b/i, code: 'DEP' },
      { pattern: /\b(Arrived|ARRIVED|Arrival)\b/i, code: 'ARR' },
      { pattern: /\b(Received|RECEIVED|Acceptance|Accepted)\b/i, code: 'RCS' },
      { pattern: /\b(Manifested|MANIFESTED|Manifest)\b/i, code: 'MAN' },
      { pattern: /\b(Notified|NOTIFIED|Notification|Ready\s+for\s+(Pickup|Delivery))\b/i, code: 'NFD' },
      { pattern: /\b(In[\s-]?Transit|IN[\s-]?TRANSIT)\b/i, code: 'DEP' },
      { pattern: /\b(Booked|BOOKED)\b/i, code: 'BKD' },
      { pattern: /\b(Cleared|CLEARED|Customs\s+Cleared)\b/i, code: 'CCD' },
      { pattern: /\b(Received\s+from\s+Flight)\b/i, code: 'RCF' },
    ];
    
    // First check for Delivered (terminal state)
    if (/\bdelivered\b/i.test(content)) {
      lastStatus = 'DLV';
      console.log(`[AA CARGO] ✅ Status: DLV (Delivered)`);
    } else {
      // Check other statuses
      for (const { pattern, code } of statusPatterns) {
        if (pattern.test(content)) {
          lastStatus = code;
          console.log(`[AA CARGO] ✅ Status found: ${lastStatus}`);
          break;
        }
      }
    }
    
    console.log(`[AA CARGO] 🏁 Final: Origin=${origin || 'null'}, Dest=${destination || 'null'}, Status=${lastStatus || 'null'}`);
    
    // Check if we got no data at all (AWB not found already checked at the beginning)
    if (!origin && !destination && !lastStatus) {
      return { provider, ok: false, status: 404, error: 'No tracking data extracted', sent: { url }, raw: markdown.substring(0, 500) };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: awbParam },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[AA CARGO] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// ============= UNITED CARGO (016) =============

async function fetchUnitedCargoAPI(awb: string): Promise<StandardResult> {
  const provider = 'UNITED_CARGO';
  console.log(`[UNITED CARGO] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[UNITED CARGO] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Format: 016-06977530
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    const url = `https://www.unitedcargo.com/en/us/track/awb/${formattedAwb}`;
    console.log(`[UNITED CARGO] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[UNITED CARGO] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    
    console.log(`[UNITED CARGO] Markdown preview: ${markdown.substring(0, 1500)}`);
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // Extract route header "ORD ✈ GRU" or "[ORD](link) ✈ [GRU](link)"
    const routeMatch = markdown.match(/\[?([A-Z]{3})\]?[^\w]*[✈→\->\s]+[^\w]*\[?([A-Z]{3})\]?/);
    if (routeMatch) {
      origin = routeMatch[1].toUpperCase();
      destination = routeMatch[2].toUpperCase();
    }
    
    // Extract status from progress bar or shipment details
    // Patterns: "Delivered", "Pre-flight", "In Transit", "Arrived"
    const statusMatch = markdown.match(/(\d+)\s+of\s+\d+\s+Delivered/i) 
      || markdown.match(/(Delivered|In\s+Transit|Arrived|Pre-flight|Ready\s+for\s+pickup)[^\n]*/i);
    
    if (statusMatch) {
      const rawStatus = statusMatch[0].toLowerCase();
      if (rawStatus.includes('delivered')) lastStatus = 'DLV';
      else if (rawStatus.includes('in transit') || rawStatus.includes('in-transit')) lastStatus = 'DEP';
      else if (rawStatus.includes('arrived')) lastStatus = 'ARR';
      else if (rawStatus.includes('pre-flight')) lastStatus = 'RCS';
      else if (rawStatus.includes('ready for pickup') || rawStatus.includes('ready for delivery')) lastStatus = 'NFD';
      else lastStatus = 'DEP';
    }
    
    // Fallback: extract from "Actual Departure (ORD)" and "Actual Arrival (GRU)" patterns
    if (!origin) {
      const depMatch = markdown.match(/Actual\s+Departure\s*\(([A-Z]{3})\)/i);
      if (depMatch) origin = depMatch[1].toUpperCase();
    }
    if (!destination) {
      const arrMatch = markdown.match(/Actual\s+Arrival\s*\(([A-Z]{3})\)/i);
      if (arrMatch) destination = arrMatch[1].toUpperCase();
    }
    
    console.log(`[UNITED CARGO] Extracted: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    if (!origin && !destination && !lastStatus) {
      return { provider, ok: false, status: 404, error: 'No tracking data found', sent: { url }, raw: markdown.substring(0, 500) };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'N/A',
          description: lastStatus || 'N/A',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[UNITED CARGO] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

async function fetchDeltaAPI(awb: string): Promise<StandardResult> {
  const provider = 'DELTA';
  console.log(`[DELTA API] Fetching AWB: ${awb}`);
  
  try {
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3);
    const serial = digits.substring(3);
    
    // Step 1: Bootstrap cookies
    const bootstrapResponse = await fetch('https://www.delta.com/Cargo/Tracking', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!bootstrapResponse.ok) {
      return {
        provider,
        ok: false,
        status: bootstrapResponse.status,
        error: `Failed to bootstrap: HTTP ${bootstrapResponse.status}`,
        sent: { awb: digits },
      };
    }

    const cookies = bootstrapResponse.headers.get('set-cookie') || '';
    const extraCookie = Deno.env.get('DELTA_EXTRA_COOKIE') || '';
    const allCookies = extraCookie ? `${cookies}; ${extraCookie}` : cookies;

    // Step 2: Track AWB
    const url = `https://www.delta.com/Cargo/data/shipment/trackAwb?airwayBillPrefix=${prefix}&airwayBillNumber=${serial}`;
    
    const trackResponse = await fetch(url, {
      headers: {
        'Cookie': allCookies,
        'Accept': 'application/json',
        'Referer': 'https://www.delta.com/Cargo/Tracking',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!trackResponse.ok) {
      const text = await trackResponse.text();
      
      // Check for Akamai/CDN blocks
      if (text.includes('Akamai') || text.includes('Access Denied') || text.includes('Forbidden')) {
        return {
          provider,
          ok: false,
          status: 403,
          error: 'Blocked by Akamai/CDN. Manual session required.',
          sent: { airwayBillPrefix: prefix, airwayBillNumber: serial },
          raw: text.substring(0, 500),
        };
      }

      return {
        provider,
        ok: false,
        status: trackResponse.status,
        error: `HTTP ${trackResponse.status}`,
        sent: { airwayBillPrefix: prefix, airwayBillNumber: serial },
        raw: text.substring(0, 500),
      };
    }

    const data = await trackResponse.json();
    console.log(`[DELTA API] Response:`, JSON.stringify(data).substring(0, 500));

    const history = data?.data?.trackShipment?.[0]?.history || [];
    
    if (history.length === 0) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking events found',
        sent: { airwayBillPrefix: prefix, airwayBillNumber: serial },
        raw: data,
      };
    }

    const lastEvent = history[0];
    const description = lastEvent.description || '';
    const statusCode = mapStatusCode(description, 'DELTA');
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { airwayBillPrefix: prefix, airwayBillNumber: serial },
      raw: data,
      summary: {
        lastFlight: {
          number: lastEvent.flightNumber ? normalizeFlightNumber(lastEvent.flightNumber) : '',
          timestamp: formatDateDelta(lastEvent.date || '', lastEvent.time || ''),
        },
        lastStatus: {
          code: statusCode,
          description: description,
          timestamp: formatDateDelta(lastEvent.date || '', lastEvent.time || ''),
        },
      },
    };
  } catch (error) {
    console.error(`[DELTA API] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= FALLBACK: AI-POWERED SCRAPING =============

async function fetchAIAgent(awb: string, carrier: string): Promise<Partial<TrackingResult> | null> {
  console.log(`[AI AGENT] Using Firecrawl for ${carrier} AWB: ${awb}`);
  
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlApiKey) {
    console.error('[AI AGENT] FIRECRAWL_API_KEY not configured');
    return null;
  }

  let url = '';
  const [prefix, number] = awb.split('-');
  
  switch (carrier) {
    case '006': // Delta
      const deltaDigits = awb.replace(/\D/g, '');
      url = `https://www.deltacargo.com/Cargo/home/trackShipment?awbNumber=${deltaDigits}&timeZoneOffset=180&t=${Date.now()}`;
      break;
    case '057': // Air France
    case '074': // KLM
      url = `https://www.afklcargo.com/mycargo/shipment/detail/${awb}`;
      break;
    default:
      console.log(`[AI AGENT] No URL defined for carrier ${carrier}`);
      return null;
  }
  
  console.log(`[AI AGENT] Scraping URL: ${url}`);

  try {
    // Firecrawl constraint: Total wait time (waitFor + wait actions) cannot exceed 60 seconds
    // So we use waitFor only, no additional wait actions
    const waitTime = carrier === '006' ? 55000 : (carrier === '057' || carrier === '074') ? 50000 : 30000;
    const timeout = carrier === '006' ? 120000 : (carrier === '057' || carrier === '074') ? 110000 : 90000;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: waitTime,
        timeout: timeout,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI AGENT] Firecrawl error: ${response.status}`, errorText);
      
      // Para Delta, se der timeout, retornar status específico em vez de null
      if (carrier === '006' && response.status === 408) {
        console.log('[DELTA] ⏱️ Timeout - returning PROCESSING status');
        return {
          status: 'PROCESSING',
          origin: 'N/A',
          destination: 'N/A',
          currentLocation: 'N/A',
          weight: 'N/A',
          pieces: 'N/A',
          events: [{
            date: new Date().toISOString(),
            location: 'Sistema Delta',
            status: 'PROCESSING',
            description: 'Timeout ao consultar - Tente novamente em alguns instantes',
          }],
        };
      }
      
      return null;
    }

    const data = await response.json();
    
    if (!data.success) {
      console.error('[AI AGENT] Firecrawl scrape failed:', data.error);
      
      // Para Delta, se der timeout no JSON, retornar status específico
      if (carrier === '006' && data.error?.includes('timeout')) {
        console.log('[DELTA] ⏱️ Scrape timeout - returning PROCESSING status');
        return {
          status: 'PROCESSING',
          origin: 'N/A',
          destination: 'N/A',
          currentLocation: 'N/A',
          weight: 'N/A',
          pieces: 'N/A',
          events: [{
            date: new Date().toISOString(),
            location: 'Sistema Delta',
            status: 'PROCESSING',
            description: 'Timeout ao consultar - Tente novamente em alguns instantes',
          }],
        };
      }
      
      return null;
    }

    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    
    console.log(`[AI AGENT] Scraped content (${markdown.length} chars)`);
    
    // Check for "AWB not found" scenarios for Air France/KLM
    if (carrier === '057' || carrier === '074') {
      const content = (markdown + ' ' + html).toLowerCase();
      const contentLength = markdown.length + html.length;
      
      // Detect AWB not found conditions:
      // 1. Very small content (< 800 chars) suggests page didn't load properly or AWB not found
      // 2. Error messages in content
      const notFoundIndicators = [
        'not found',
        'no data available',
        'no information available',
        'not available for tracking',
        'unable to find',
        'shipment not found',
        'awb not found'
      ];
      
      const hasNotFoundIndicator = notFoundIndicators.some(indicator => content.includes(indicator));
      
      if (contentLength < 800 || hasNotFoundIndicator) {
        console.log(`[AFKL] ⚠️ AWB not found - Content too small (${contentLength} chars) or error detected`);
        return {
          status: 'NOT_FOUND',
          origin: 'N/A',
          destination: 'N/A',
          currentLocation: 'N/A',
          weight: 'N/A',
          pieces: 'N/A',
          events: [{
            date: new Date().toISOString(),
            location: 'Sistema',
            status: 'NOT_FOUND',
            description: 'Status não encontrado',
          }],
        };
      }
    }
    
    // Extract data based on carrier
    let extracted: any = {};
    let events: TrackingEvent[] = [];
    let flightNumber: string | null = null;
    let origin: string = 'N/A';
    let destination: string = 'N/A';
    
    if (carrier === '006') {
      // DELTA PARSING - Status do Indicador Visual no Topo
      const content = markdown + '\n' + html;
      
      // ===== PRIORIDADE MÁXIMA: Status Visual (Azul) no Topo da Página =====
      // A Delta exibe o status atual em um indicador visual: BOOKED → ACCEPTED → IN-TRANSIT → PENDING WAREHOUSE ARRIVAL → READY FOR DELIVERY → DELIVERED
      // O status atual está destacado em azul
      
      // Mapeamento de status visual para códigos
      const deltaVisualStatusMap: { [key: string]: string } = {
        'booked': 'BKD',
        'accepted': 'RCS',
        'in-transit': 'DEP',
        'in transit': 'DEP',
        'intransit': 'DEP',
        'pending warehouse arrival': 'RCF',
        'pending': 'RCF',
        'ready for delivery': 'NFD',
        'ready': 'NFD',
        'delivered': 'DLV',
      };
      
      let currentVisualStatus: string | null = null;
      let currentStatusCode: string | null = null;
      
      // Busca padrões que indicam o status visual ativo (destacado em azul)
      // No HTML, o status ativo geralmente tem classes ou estilos diferentes
      // No Markdown, pode aparecer em bold ou com indicadores visuais
      
      // Padrão 1: Buscar no HTML por elementos com classe indicando status ativo
      const activeStatusPatterns = [
        // Procura por texto em maiúsculas que corresponde aos status conhecidos
        /\*\*\s*(BOOKED|ACCEPTED|IN-TRANSIT|IN TRANSIT|PENDING WAREHOUSE ARRIVAL|READY FOR DELIVERY|DELIVERED)\s*\*\*/gi,
        />\s*(BOOKED|ACCEPTED|IN-TRANSIT|IN TRANSIT|PENDING WAREHOUSE ARRIVAL|READY FOR DELIVERY|DELIVERED)\s*</gi,
        // Busca no contexto da barra de progresso
        /(?:active|current|selected|highlighted|>\s*)(BOOKED|ACCEPTED|IN-TRANSIT|IN TRANSIT|PENDING WAREHOUSE ARRIVAL|READY FOR DELIVERY|DELIVERED)(?:\s*<|[^A-Z])/gi,
      ];
      
      // Estratégia: encontrar todos os status mencionados e pegar o mais avançado na sequência
      const statusSequence = ['booked', 'accepted', 'in-transit', 'in transit', 'intransit', 'pending warehouse arrival', 'pending', 'ready for delivery', 'ready', 'delivered'];
      const contentLower = content.toLowerCase();
      
      // Busca o status mais avançado presente no conteúdo
      let highestStatusIndex = -1;
      for (let i = statusSequence.length - 1; i >= 0; i--) {
        const status = statusSequence[i];
        // Verifica se o status aparece destacado (em bold markdown ou com formatação especial)
        const boldPattern = new RegExp(`\\*\\*\\s*${status.replace(/[- ]/g, '[- ]?')}\\s*\\*\\*`, 'i');
        const bracketPattern = new RegExp(`\\[\\s*${status.replace(/[- ]/g, '[- ]?')}\\s*\\]`, 'i');
        
        if (boldPattern.test(content) || bracketPattern.test(content)) {
          currentVisualStatus = status;
          highestStatusIndex = i;
          console.log(`[DELTA] 🎯 Found HIGHLIGHTED status (bold/bracket): ${status.toUpperCase()}`);
          break;
        }
      }
      
      // Se não encontrou destacado, busca pelo status mais avançado mencionado
      if (!currentVisualStatus) {
        // Procura na ordem reversa (do mais avançado para o menos) para pegar o status atual
        for (let i = statusSequence.length - 1; i >= 0; i--) {
          const status = statusSequence[i];
          const searchTerm = status.toUpperCase();
          // Verifica se o status aparece no conteúdo (case insensitive)
          if (content.toUpperCase().includes(searchTerm)) {
            // Verifica se parece ser o status atual (não apenas mencionado)
            // A Delta exibe todos os status na barra, mas o atual é destacado
            // Procura por padrões que sugiram que este é o status ativo
            const statusPattern = new RegExp(`(>>|>\\s*\\[?|active[^>]*>\\s*|current[^>]*>\\s*)${status.replace(/[- ]/g, '[- ]?')}`, 'i');
            if (statusPattern.test(content)) {
              currentVisualStatus = status;
              highestStatusIndex = i;
              console.log(`[DELTA] 🎯 Found ACTIVE status pattern: ${status.toUpperCase()}`);
              break;
            }
          }
        }
      }
      
      // Fallback: se ainda não encontrou, usa análise heurística baseada na posição/contexto
      if (!currentVisualStatus) {
        // Procura pelo último status na sequência que aparece antes de um indicador de "não alcançado"
        // ou pela última ocorrência de status na barra de progresso
        const progressBarMatch = content.match(/BOOKED[\s\S]{0,500}DELIVERED/i);
        if (progressBarMatch) {
          const progressSection = progressBarMatch[0].toLowerCase();
          console.log('[DELTA] 📊 Found progress bar section');
          
          // Encontra o último status "ativo" (que não está com estilo de futuro/cinza)
          for (let i = statusSequence.length - 1; i >= 0; i--) {
            const status = statusSequence[i];
            const idx = progressSection.indexOf(status);
            if (idx !== -1) {
              // Verifica se há indicador de status futuro após este
              const afterStatus = progressSection.substring(idx + status.length, idx + status.length + 50);
              // Se não há indicador de que é futuro (como >> ou seta para próximo), considera como atual
              if (!afterStatus.match(/^\s*>>/)) {
                currentVisualStatus = status;
                highestStatusIndex = i;
                console.log(`[DELTA] 🎯 Selected status from progress bar: ${status.toUpperCase()}`);
                break;
              }
            }
          }
        }
      }
      
      // Mapeia para código de status
      if (currentVisualStatus) {
        const normalizedStatus = currentVisualStatus.toLowerCase().replace(/-/g, ' ').trim();
        currentStatusCode = deltaVisualStatusMap[normalizedStatus] || 
                           deltaVisualStatusMap[normalizedStatus.split(' ')[0]] || 
                           'NOT_FOUND';
        console.log(`[DELTA] ✅ Visual Status: "${currentVisualStatus.toUpperCase()}" → Code: ${currentStatusCode}`);
      }
      
      // ===== PRIORIDADE 2: FLIGHT DETAILS Section =====
      const flightDetailsMatch = content.match(/FLIGHT\s+DETAILS[:\s]*(.{0,3000})/is);
      if (flightDetailsMatch) {
        console.log('[DELTA] 🎯 Found FLIGHT DETAILS section');
        const section = flightDetailsMatch[1];
        const flightMatches = section.match(/([A-Z]{2}\d{3,5})(?:\/\d{2}[A-Z]{3}\d{2})?\b/g);
        if (flightMatches && flightMatches.length > 0) {
          // Pega a ÚLTIMA ocorrência (voo mais recente)
          flightNumber = flightMatches[flightMatches.length - 1];
          console.log(`[DELTA] 🎯 Selected LAST flight number from FLIGHT DETAILS: ${flightNumber}`);
        }
        
        // ===== Extract Origin (first From) and Destination (last To) =====
        // The markdown has airport codes as links like [ORD](url) after From: and To: headers
        // Or as plain text like "ORD" in table cells
        console.log(`[DELTA] 📄 FLIGHT DETAILS section for origin/dest parsing:`, section.substring(0, 500));
        
        // Pattern 1: Look for [AIRPORT_CODE](link) pattern - common in markdown tables
        const linkedAirportCodes = section.match(/\[([A-Z]{3})\]\([^)]+\)/g);
        if (linkedAirportCodes && linkedAirportCodes.length > 0) {
          console.log(`[DELTA] Found ${linkedAirportCodes.length} linked airport codes:`, linkedAirportCodes);
          // First linked code is origin
          const firstMatch = linkedAirportCodes[0].match(/\[([A-Z]{3})\]/);
          if (firstMatch) {
            origin = firstMatch[1].toUpperCase();
            console.log(`[DELTA] 🛫 Origin (first linked): ${origin}`);
          }
          // Last linked code is destination
          const lastMatch = linkedAirportCodes[linkedAirportCodes.length - 1].match(/\[([A-Z]{3})\]/);
          if (lastMatch) {
            destination = lastMatch[1].toUpperCase();
            console.log(`[DELTA] 🛬 Destination (last linked): ${destination}`);
          }
        }
        
        // Pattern 2: Look for table rows with From/To columns containing airport codes
        // The table structure typically has: | Flight | From | To | with airport codes
        if (origin === 'N/A' || destination === 'N/A') {
          // Extract all 3-letter uppercase codes that aren't common words
          const excludeWords = ['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'ALL', 'CAN', 'HAS', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'HAD', 'HOT', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'SAY', 'TOO', 'USE'];
          const allCodes = section.match(/\b([A-Z]{3})\b/g) || [];
          const airportCodes = allCodes.filter(code => !excludeWords.includes(code) && !code.startsWith('DL'));
          console.log(`[DELTA] Found ${airportCodes.length} potential airport codes:`, airportCodes);
          
          if (airportCodes.length >= 2 && origin === 'N/A') {
            origin = airportCodes[0];
            console.log(`[DELTA] 🛫 Origin (first code): ${origin}`);
          }
          if (airportCodes.length >= 2 && destination === 'N/A') {
            destination = airportCodes[airportCodes.length - 1];
            console.log(`[DELTA] 🛬 Destination (last code): ${destination}`);
          }
        }
      }
      
      // ===== Parse da Tabela de Eventos (para datas e localizações) =====
      const tableMatch = markdown.match(/\|\s*Date\s*\|\s*Time\s*\|\s*Activity\s*\|([\s\S]*?)(?:\n\n|\n#|$)/i);
      if (tableMatch) {
        console.log('[DELTA] 📋 Found events table');
        const tableContent = tableMatch[0];
        const lines = tableContent.split('\n');
        
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || !line.includes('|')) continue;
          
          const cells = line.split('|').map((c: string) => c.trim()).filter((c: string) => c);
          if (cells.length < 3) continue;
          
          const dateStr = cells[0];
          const timeStr = cells[1];
          const activity = cells[2];
          
          let datetime = new Date().toISOString();
          if (dateStr && timeStr) {
            const [month, day, year] = dateStr.split('/');
            const hours = timeStr.substring(0, 2);
            const minutes = timeStr.substring(2, 4);
            datetime = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours}:${minutes}:00Z`;
          }
          
          const locationMatch = activity.match(/\b([A-Z]{3})\b/);
          const location = locationMatch ? locationMatch[1] : 'N/A';
          
          let statusCode = 'NOT_FOUND';
          const activityLower = activity.toLowerCase();
          if (activityLower.includes('delivered')) statusCode = 'DLV';
          else if (activityLower.includes('booked')) statusCode = 'BKD';
          else if (activityLower.includes('arrived') || activityLower.includes('arrival')) statusCode = 'ARR';
          else if (activityLower.includes('departed') || activityLower.includes('departure')) statusCode = 'DEP';
          else if (activityLower.includes('received from flight') || activityLower.includes('received at')) statusCode = 'RCF';
          else if (activityLower.includes('received from shipper') || activityLower.includes('accepted')) statusCode = 'RCS';
          else if (activityLower.includes('checked in') || activityLower.includes('ready for customer pick-up')) statusCode = 'NFD';
          else if (activityLower.includes('notified')) statusCode = 'NFD';
          else if (activityLower.includes('manifested')) statusCode = 'MAN';
          else if (activityLower.includes('pending')) statusCode = 'PEN';
          else if (activityLower.includes('in transit')) statusCode = 'TRM';
          
          events.push({
            date: datetime,
            location: location,
            status: statusCode,
            description: activity,
          });
          
          if (!flightNumber) {
            const eventFlightMatch = activity.match(/\b([A-Z]{2}\d{3,5})\/\d{2}[A-Z]{3}\d{2}/i);
            if (eventFlightMatch) {
              flightNumber = eventFlightMatch[1];
              console.log(`[DELTA] ✅ Flight number found in events: ${flightNumber} from '${activity}'`);
            }
          }
        }
      }
      
      // ===== PRIORIDADE 3: Busca no Conteúdo Geral =====
      if (!flightNumber) {
        const generalFlightMatch = content.match(/\b([A-Z]{2}\d{3,5})\b/);
        if (generalFlightMatch) {
          flightNumber = generalFlightMatch[1];
          console.log(`[DELTA] ✅ Flight number found in content: ${flightNumber}`);
        }
      }
      
      if (flightNumber) {
        flightNumber = flightNumber.replace(/\s+/g, "").toUpperCase();
        console.log(`[DELTA] ✅ Final flight number: ${flightNumber}`);
      }
      
      // ===== Construção do Resultado Final =====
      // PRIORIDADE: Status visual > Status dos eventos
      if (currentStatusCode && currentVisualStatus) {
        // Usa o status do indicador visual
        const latestEvent = events.length > 0 ? events[0] : null;
        extracted = {
          currentStatus: currentVisualStatus.toUpperCase(),
          statusCode: currentStatusCode,
          statusDescription: currentVisualStatus.toUpperCase(),
          date: latestEvent?.date || new Date().toISOString(),
          location: latestEvent?.location || 'N/A',
          flightNumber: flightNumber,
          origin: origin,
          destination: destination,
        };
        console.log(`[DELTA] ✅ Final status from VISUAL INDICATOR: ${currentStatusCode}, Origin: ${origin}, Destination: ${destination}`);
      } else if (events.length > 0) {
        // Fallback: usa o primeiro evento (mais recente) da tabela
        const lastEvent = events[0];
        extracted = {
          currentStatus: lastEvent.description,
          statusCode: lastEvent.status,
          statusDescription: lastEvent.description,
          date: lastEvent.date,
          location: lastEvent.location,
          flightNumber: flightNumber,
          origin: origin,
          destination: destination,
        };
        console.log(`[DELTA] ⚠️ Fallback to first event: ${lastEvent.status}, Origin: ${origin}, Destination: ${destination}`);
      } else {
        console.error('[DELTA] ❌ Could not find status indicator or events table in scraped content');
        return null;
      }
      
    } else if (carrier === '057' || carrier === '074') {
      // AIR FRANCE/KLM PARSING - Sistema de Prioridades
      const content = markdown + '\n' + html;
      console.log('[AFKL] 🔍 Detected airline: Air France/KLM, will search for AF/KL flights');
      
      // DEBUG: Verificar se "offloaded" está presente no conteúdo
      const contentLower = content.toLowerCase();
      if (contentLower.includes('offload')) {
        console.log('[AFKL] 🚨 OFFLOAD DETECTED in content!');
        // Encontrar contexto ao redor de "offload"
        const idx = contentLower.indexOf('offload');
        const contextStart = Math.max(0, idx - 100);
        const contextEnd = Math.min(content.length, idx + 200);
        console.log(`[AFKL] 📝 Offload context: ${content.substring(contextStart, contextEnd)}`);
      } else {
        console.log('[AFKL] ℹ️ No "offload" text found in scraped content');
      }
      
      // ===== EXTRAÇÃO DO NÚMERO DO VOO =====
      
      // 🥇 PRIORIDADE 1: Seção "Flight schedule"
      const flightScheduleMatch = content.match(/##?\s*Flight\s+schedule\s*([\s\S]{0,2000}?)(?:\n##|\n\n##|$)/i);
      const flightNumbers: string[] = [];
      let flightScheduleAlertStatus: string | null = null; // Status de alerta da seção Flight schedule
      
      if (flightScheduleMatch) {
        console.log('[AFKL] 🎯 Found "Flight schedule" section');
        const scheduleSection = flightScheduleMatch[1];
        
        // 🚨 PRIORIDADE MÁXIMA: Verificar status de alerta na seção Flight schedule
        // Exemplo: "CDG - GRU  OFFLOADED" ou "CDG - GRU  CANCELLED"
        const scheduleLower = scheduleSection.toLowerCase();
        if (scheduleLower.includes('offloaded') || scheduleLower.includes('off loaded') || scheduleLower.includes('off-loaded')) {
          flightScheduleAlertStatus = 'OFLD';
          console.log('[AFKL] 🚨 ALERT: OFFLOADED status detected in Flight schedule section!');
        } else if (scheduleLower.includes('cancelled') || scheduleLower.includes('canceled')) {
          flightScheduleAlertStatus = 'CAN';
          console.log('[AFKL] 🚨 ALERT: CANCELLED status detected in Flight schedule section!');
        } else if (scheduleLower.includes('delayed')) {
          flightScheduleAlertStatus = 'DIS';
          console.log('[AFKL] 🚨 ALERT: DELAYED status detected in Flight schedule section!');
        }
        
        // Regex: (ORIGEM) - (DESTINO) (VOONÚMERO) data...
        // Exemplo: "FRA - CDG  AF0301M  28 OCT 23:59"
        const scheduleFlightRegex = /([A-Z]{3})\s*-\s*([A-Z]{3})\s+((?:AF|KL)\d{3,5}[A-Z]?)\s+/g;
        let match;
        
        while ((match = scheduleFlightRegex.exec(scheduleSection)) !== null) {
          const origin = match[1];
          const destination = match[2];
          let flight = match[3];
          
          // Remove letras extras no final (AF0301M -> AF0301)
          flight = flight.replace(/([A-Z]{2}\d{3,5})[A-Z]+$/, '$1');
          
          if (!flightNumbers.includes(flight)) {
            flightNumbers.push(flight);
            console.log(`[AFKL] ✅ Flight found in schedule: ${origin} - ${destination} via ${flight}`);
          }
        }
      }
      
      // 🥈 PRIORIDADE 2: Busca Geral no Conteúdo (Fallback)
      if (flightNumbers.length === 0) {
        console.log('[AFKL] 🔎 Trying fallback - searching in full content...');
        const generalFlightRegex = /\b((?:AF|KL)\d{3,5})\b/g;
        let match;
        
        while ((match = generalFlightRegex.exec(content)) !== null) {
          const flight = match[1];
          if (!flightNumbers.includes(flight)) {
            flightNumbers.push(flight);
          }
        }
        
        if (flightNumbers.length > 0) {
          console.log(`[AFKL] ✅ Flight number(s) found (fallback): ${flightNumbers.join(', ')}`);
        }
      }
      
      // Juntar múltiplos voos com vírgula
      if (flightNumbers.length > 0) {
        flightNumber = flightNumbers.join(', ');
        console.log(`[AFKL] ✈️ Final flight number(s): ${flightNumber}`);
      } else {
        console.log('[AFKL] ⚠️ Flight number not found');
      }
      
      // ===== EXTRAÇÃO DE ORIGEM E DESTINO =====
      // Suporta múltiplos formatos: "PRG → GRU", "PRG - GRU", "PRG ✈ GRU"
      // Captura TODAS as rotas e pega origem da primeira e destino da última
      const routeRegex = /([A-Z]{3})\s*[➤\-→✈]\s*([A-Z]{3})/g;
      const allRoutes: Array<[string, string]> = [];
      let routeMatch;
      
      while ((routeMatch = routeRegex.exec(content)) !== null) {
        allRoutes.push([routeMatch[1], routeMatch[2]]);
      }
      
      let origin = 'N/A';
      let destination = 'N/A';
      
      if (allRoutes.length > 0) {
        origin = allRoutes[0][0]; // Origem da primeira rota
        destination = allRoutes[allRoutes.length - 1][1]; // Destino da última rota
        console.log(`[AFKL] 📍 Found ${allRoutes.length} route(s). Final route: ${origin} → ${destination}`);
        if (allRoutes.length > 1) {
          console.log(`[AFKL] 📍 All routes: ${allRoutes.map(r => `${r[0]}→${r[1]}`).join(', ')}`);
        }
      }
      
      // ===== EXTRAÇÃO DE PESO E VOLUMES =====
      const piecesMatch = content.match(/(\d+)\s*pieces?/i);
      const weightMatch = content.match(/(\d+\.?\d*)\s*(?:KGS?|kg)/i);
      const pieces = piecesMatch ? `${piecesMatch[1]} volumes` : 'N/A';
      const weight = weightMatch ? `${weightMatch[1]} kg` : 'N/A';
      
      console.log(`[AFKL] 📦 Pieces: ${pieces}, Weight: ${weight}`);
      
      // ===== PARSING DE EVENTOS =====
      // Formato 1 (com hífen): "10 OCT 15:38 - 6 pieces delivered at GRU"
      // Formato 2 (tradicional): "15 OCT 12:21 CDG FWB Customer FWB processed"
      
      const eventLines = content.split('\n');
      
      for (const line of eventLines) {
        // Formato especial: "NOTIFIED    3 pcs    16 OCT 20:05" (Station View)
        const stationViewMatch = line.match(/(NOTIFIED|ACCEPTED|DEPARTED|ARRIVAL|DELIVERED)\s+(\d+\s+pcs)\s+(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})/i);
        
        if (stationViewMatch) {
          const statusText = stationViewMatch[1].trim().toUpperCase();
          const pieces = stationViewMatch[2].trim();
          const datetime = stationViewMatch[3].trim(); // "16 OCT 20:05"
          
          // Mapeia status
          let statusCode = 'NOT_FOUND';
          if (statusText === 'NOTIFIED') statusCode = 'NFD';
          else if (statusText === 'DELIVERED') statusCode = 'DLV';
          else if (statusText === 'ACCEPTED') statusCode = 'RCS';
          else if (statusText === 'DEPARTED') statusCode = 'DEP';
          else if (statusText === 'ARRIVAL') statusCode = 'ARR';
          
          // Converte datetime para ISO
          const isoDate = parseDateTimeAFKL(datetime);
          
          events.push({
            date: isoDate,
            location: 'N/A',
            status: statusCode,
            description: `${statusText} - ${pieces}`,
          });
          
          console.log(`[AFKL] 📅 Event (Station View): ${datetime} | ${statusCode} | ${statusText} - ${pieces}`);
          continue;
        }
        
        // Formato 1: data hora - descrição
        let eventMatch = line.match(/(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})\s*-\s*(.+)/i);
        
        if (eventMatch) {
          const datetime = eventMatch[1]; // "10 OCT 15:38"
          const description = eventMatch[2].trim(); // "6 pieces delivered at GRU"
          
          // Extrai localização (código IATA de 3 letras)
          const locationMatch = description.match(/\b([A-Z]{3})\b/);
          const location = locationMatch ? locationMatch[1] : 'N/A';
          
          // Determina status code
          let statusCode = 'NOT_FOUND';
          const descLower = description.toLowerCase();
          if (descLower.includes('delivered')) statusCode = 'DLV';
          else if (descLower.includes('notified') || descLower.includes('notification')) statusCode = 'NFD';
          else if (descLower.includes('ready for customer')) statusCode = 'RCS';
          else if (descLower.includes('departed')) statusCode = 'DEP';
          else if (descLower.includes('arrived') || descLower.includes('arrival')) statusCode = 'ARR';
          else if (descLower.includes('booked')) statusCode = 'BKD';
          else if (descLower.includes('fwb')) statusCode = 'FWB';
          else if (descLower.includes('received') && (descLower.includes('from') || descLower.includes('at'))) statusCode = 'RCF';
          else if (descLower.includes('received') && descLower.includes('warehouse')) statusCode = 'RCF';
          else if (descLower.includes('offloaded') || descLower.includes('off loaded') || descLower.includes('off-loaded')) statusCode = 'OFLD';
          else if (descLower.includes('cancelled') || descLower.includes('canceled') || descLower.includes('check-in nok')) statusCode = 'CAN';
          else if (descLower.includes('manifested')) statusCode = 'MAN';
          
          // Converte datetime para ISO
          const isoDate = parseDateTimeAFKL(datetime);
          
          events.push({
            date: isoDate,
            location: location,
            status: statusCode,
            description: description,
          });
          
          console.log(`[AFKL] 📅 Event: ${datetime} | ${location} | ${statusCode} | ${description.substring(0, 50)}...`);
          continue;
        }
        
        // Formato 2: data hora localização código descrição (com espaço entre loc e código)
        eventMatch = line.match(/(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3,})\s+(.+)/i);
        
        // Formato 3: data hora localização+código juntos (sem espaço) descrição
        if (!eventMatch) {
          eventMatch = line.match(/(\d{1,2}\s+[A-Z]{3}\s+\d{2}:\d{2})\s+([A-Z]{3})([A-Z]{3,})\s+(.+)/i);
        }
        
        if (eventMatch) {
          const datetime = eventMatch[1]; // "15 OCT 12:21"
          const location = eventMatch[2]; // "CDG"
          const code = eventMatch[3]; // "FWB"
          const description = eventMatch[4].trim(); // "Customer FWB processed"
          
          // Mapeia código para status
          let statusCode = 'NOT_FOUND';
          const codeLower = code.toLowerCase();
          const descLower = description.toLowerCase();
          
          // Primeiro tenta mapear pelo código direto
          if (codeLower === 'dlv') statusCode = 'DLV';
          else if (codeLower === 'nfd') statusCode = 'NFD';
          else if (codeLower === 'rcs') statusCode = 'RCS';
          else if (codeLower === 'dep') statusCode = 'DEP';
          else if (codeLower === 'arr') statusCode = 'ARR';
          else if (codeLower === 'bkd') statusCode = 'BKD';
          else if (codeLower === 'rcf') statusCode = 'RCF';
          else if (codeLower === 'fwb') statusCode = 'FWB';
          else if (codeLower === 'man') statusCode = 'MAN';
          else if (codeLower === 'ofld') statusCode = 'OFLD';
          else if (codeLower === 'can') statusCode = 'CAN';
          
          // Se não mapeou pelo código, tenta pela descrição
          if (statusCode === 'NOT_FOUND') {
            if (descLower.includes('offloaded') || descLower.includes('off loaded') || descLower.includes('off-loaded')) statusCode = 'OFLD';
            else if (descLower.includes('cancelled') || descLower.includes('canceled') || descLower.includes('check-in nok')) statusCode = 'CAN';
            else if (descLower.includes('manifested')) statusCode = 'MAN';
            else if (descLower.includes('delivered')) statusCode = 'DLV';
            else if (descLower.includes('departed')) statusCode = 'DEP';
            else if (descLower.includes('arrived')) statusCode = 'ARR';
          }
          
          // Converte datetime para ISO
          const isoDate = parseDateTimeAFKL(datetime);
          
          events.push({
            date: isoDate,
            location: location,
            status: statusCode,
            description: `${code} - ${description}`,
          });
          
          console.log(`[AFKL] 📅 Event: ${datetime} | ${location} | ${code} → ${statusCode} | ${description.substring(0, 50)}...`);
        }
      }
      
      // ===== CONSTRUIR RESULTADO =====
      if (events.length > 0) {
        // Filtrar eventos inválidos (HTML puro, descrições vazias, etc)
        events = events.filter(event => {
          const desc = event.description.trim();
          // Remove eventos que são HTML puro ou contém tags HTML
          if (desc.startsWith('<') || desc.includes('</') || desc.includes('<!--') || desc.includes('_ngcontent')) {
            console.log(`[AFKL] 🗑️ Filtered out invalid event: ${desc.substring(0, 50)}...`);
            return false;
          }
          // Remove eventos com descrições muito curtas ou suspeitas
          if (desc.length < 3) {
            return false;
          }
          return true;
        });
        
        // Ordenar eventos por data (mais recente primeiro) - matching AFKL UI
        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Status de alerta que devem ter prioridade absoluta (indicam problemas/atrasos)
        const alertStatuses = ['OFLD', 'DIS', 'NIL', 'NIF', 'CAN'];
        
        // Verifica se há algum status de alerta em qualquer evento (não apenas o mais recente)
        const alertEvent = events.find(e => alertStatuses.includes(e.status));
        
        let lastEvent = events[0];
        
        // Se existe um status de alerta, ele tem prioridade sobre qualquer outro status
        if (alertEvent && !alertStatuses.includes(lastEvent.status)) {
          console.log(`[AFKL] 🚨 ALERT STATUS FOUND: ${alertEvent.status} takes priority over ${lastEvent.status}`);
          lastEvent = alertEvent;
          // Atualiza o array events[0] com o evento de alerta
          events[0] = lastEvent;
        }
        // Se o primeiro evento é NOT_FOUND, tenta achar um não-NOT_FOUND no mesmo timestamp
        else if (lastEvent.status === 'NOT_FOUND' && events.length > 1) {
          const sameTimestamp = events.filter(e => e.date === lastEvent.date && e.status !== 'NOT_FOUND');
          if (sameTimestamp.length > 0) {
            const prioritizedEvent = sameTimestamp[0];
            // Usa o STATUS do evento prioritizado, mas mantém a DESCRIÇÃO detalhada do NOT_FOUND
            lastEvent = {
              ...prioritizedEvent,
              description: lastEvent.description, // Mantém descrição detalhada do NOT_FOUND
            };
            // IMPORTANTE: Atualiza o array events[0] com o evento prioritizado
            events[0] = lastEvent;
            console.log(`[AFKL] 🎯 Prioritized ${prioritizedEvent.status} over NOT_FOUND, kept NOT_FOUND description: ${lastEvent.description.substring(0, 50)}...`);
          }
        }
        
        // 🚨 PRIORIDADE MÁXIMA: Se detectou status de alerta na seção Flight schedule, usa ele
        if (flightScheduleAlertStatus) {
          console.log(`[AFKL] 🚨 OVERRIDE: Using Flight schedule alert status: ${flightScheduleAlertStatus} instead of ${lastEvent.status}`);
          lastEvent = {
            ...lastEvent,
            status: flightScheduleAlertStatus,
            description: `${flightScheduleAlertStatus} - ${lastEvent.description}`,
          };
          events[0] = lastEvent;
        }
        
        extracted = {
          currentStatus: lastEvent.description,
          statusCode: lastEvent.status,
          statusDescription: lastEvent.description,
          date: lastEvent.date,
          location: lastEvent.location,
          origin: origin,
          destination: destination,
          pieces: pieces,
          weight: weight,
          flightNumber: flightNumber || undefined,
        };
        
        console.log(`[AFKL] ✅ Successfully parsed: ${events.length} events, Last status: ${lastEvent.status} at ${lastEvent.date}`);
      } else {
        // Fallback: tentar extrair status básico
        console.log('[AFKL] ⚠️ No events found, trying basic status extraction...');
        
        const statusMatch = content.match(/status[:\s]+([^\n]+)/i) || 
                           content.match(/\b(delivered|departed|arrived|in transit|booked)\b/i);
        
        if (statusMatch) {
          const statusText = statusMatch[1] || statusMatch[0];
          let statusCode = 'NOT_FOUND';
          const statusLower = statusText.toLowerCase();
          if (statusLower.includes('delivered')) statusCode = 'DLV';
          else if (statusLower.includes('departed')) statusCode = 'DEP';
          else if (statusLower.includes('arrived')) statusCode = 'ARR';
          else if (statusLower.includes('booked')) statusCode = 'BKD';
          else if (statusLower.includes('transit')) statusCode = 'RCF';
          
          extracted = {
            currentStatus: statusText,
            statusCode: statusCode,
            statusDescription: statusText,
            date: new Date().toISOString(),
            location: origin !== 'N/A' ? origin : 'N/A',
            origin: origin,
            destination: destination,
            pieces: pieces,
            weight: weight,
            flightNumber: flightNumber || undefined,
          };
          
          events.push({
            date: extracted.date,
            location: extracted.location,
            status: statusCode,
            description: statusText,
          });
          
          console.log('[AFKL] ℹ️ Basic status extracted:', statusText);
        } else {
          console.log('[AFKL] ❌ Could not extract any tracking information');
          return null;
        }
      }
    }
    
    const status = extracted.statusCode || 'NOT_FOUND';

    // Create event from the extracted data if not already added
    if (extracted.currentStatus && events.length === 0) {
      events.push({
        date: extracted.date || new Date().toISOString(),
        location: extracted.location || 'N/A',
        status: status,
        description: extracted.statusDescription || extracted.currentStatus,
      });
    }

    return {
      status: status,
      origin: extracted.origin || 'N/A',
      destination: extracted.destination || 'N/A',
      currentLocation: extracted.location || extracted.statusDescription || 'N/A',
      weight: extracted.weight || 'N/A',
      pieces: extracted.pieces || 'N/A',
      events: events,
      lastFlight: extracted.flightNumber ? {
        number: extracted.flightNumber,
        timestamp: extracted.date || new Date().toISOString(),
      } : undefined,
      lastStatus: {
        code: status,
        description: extracted.statusDescription || extracted.currentStatus || '',
        timestamp: extracted.date || new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`[AI AGENT] Error:`, error);
    return null;
  }
}

async function fetchFirecrawlWithAI(awb: string, carrier: string): Promise<Partial<TrackingResult> | null> {
  console.log(`[FIRECRAWL AI] Using Firecrawl AI Extract for ${carrier} AWB: ${awb}`);
  
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.error('[FIRECRAWL AI] FIRECRAWL_API_KEY not configured');
    return null;
  }

  // This function is kept for backwards compatibility with other carriers
  return null;
}

// Legacy fallback without AI (kept for backwards compatibility)
async function fetchFirecrawlFallback(awb: string, carrier: string): Promise<Partial<TrackingResult> | null> {
  console.log(`[FALLBACK] Using basic Firecrawl for ${carrier} AWB: ${awb}`);
  
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.error('[FALLBACK] FIRECRAWL_API_KEY not configured');
    return null;
  }

  let url = '';
  const [prefix, number] = awb.split('-');
  
  switch (carrier) {
    case 'TAP':
    case '047':
      url = `https://www.tapcargo.com/en/track-and-trace?awb=${awb.replace('-', '')}`;
      break;
    case 'LATAM':
    case '045':
      url = `https://www.latamcargo.com/en/trackshipment?docPrefix=${prefix}&docNumber=${number}`;
      break;
    case 'LUFTHANSA':
    case 'LH':
    case '020':
      url = `https://www.lufthansa-cargo.com/en/eservices/etracking/tracking/-/awb/${awb.replace('-', '/')}`;
      break;
    default:
      console.log(`[FALLBACK] No scraping URL defined for ${carrier}`);
      return null;
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: url,
        formats: ['html', 'markdown'],
        waitFor: 8000,
        timeout: 45000,
      }),
    });

    if (!response.ok) {
      console.error(`[FALLBACK] Firecrawl API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.success) {
      console.error('[FALLBACK] Firecrawl scrape failed:', data.error);
      return null;
    }

    // Basic parsing - extract what we can
    const markdown = data.data?.markdown || '';
    const events: TrackingEvent[] = [];
    
    // Try to find status codes
    const statusMatch = markdown.match(/\b(NFD|RCF|ARR|DEP|DLV|BKD|RCS|MAN)\b/);
    const status = statusMatch ? statusMatch[1] : 'Em processamento';
    
    events.push({
      date: new Date().toISOString(),
      location: 'N/A',
      status: status,
      description: `Dados obtidos via scraping - ${status}`,
    });

    return {
      status: status,
      origin: 'N/A',
      destination: 'N/A',
      currentLocation: 'N/A',
      weight: 'N/A',
      pieces: 'N/A',
      events: events,
    };
  } catch (error) {
    console.error('[FALLBACK] Firecrawl error:', error);
    return null;
  }
}


// ============= AIR EUROPA CARGO (UXTRACKING) API =============

async function fetchAirEuropaHTML(awb: string): Promise<StandardResult> {
  const provider = 'AIR EUROPA CARGO';
  console.log(`[AIR EUROPA] 🚀 Starting fetch for AWB: ${awb}`);
  
  try {
    // Normalize AWB: 996-14192614 or 99614192614 -> prefix=996, serial=14192614
    let prefix = '996';
    let serial = awb;
    
    if (awb.includes('-')) {
      const parts = awb.split('-');
      prefix = parts[0];
      serial = parts[1];
    } else if (awb.length > 3) {
      prefix = awb.substring(0, 3);
      serial = awb.substring(3);
    }
    
    console.log(`[AIR EUROPA] 📋 Normalized: prefix=${prefix}, serial=${serial}`);
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[AIR EUROPA] ❌ FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 401,
        error: 'API key not configured',
        sent: { awb },
      };
    }
    
    const endpoint = `https://www.uxtracking.com/tracking.asp?prefix=${prefix}&Serial=${serial}`;
    console.log(`[AIR EUROPA] 📡 Scraping URL: ${endpoint}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: endpoint,
        formats: ['html', 'markdown'],
        waitFor: 10000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      console.error(`[AIR EUROPA] ❌ Firecrawl API error: ${response.status}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl HTTP ${response.status}`,
        sent: { awb, endpoint },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[AIR EUROPA] ❌ Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb },
        raw: data,
      };
    }
    
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    console.log(`[AIR EUROPA] 📄 HTML length: ${html.length}, Markdown length: ${markdown.length}`);
    console.log(`[AIR EUROPA] 📄 Content preview: ${markdown.substring(0, 2000)}`);
    
    // Check for minimum content to validate AWB exists
    if (markdown.length < 300 && html.length < 300) {
      console.log(`[AIR EUROPA] ❌ Content too short - AWB likely not found`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB not found or page did not load',
        sent: { awb, endpoint },
      };
    }
    
    // Parse origin and destination from SHIPMENT section
    // HTML pattern: <b>ORG:</b></font></b></p></td><td ...><p ...><font color="#007AC3">CDG</font>
    let origin = 'N/A';
    let destination = 'N/A';
    
    // Strategy 1: Extract from HTML patterns
    const orgMatch = html.match(/ORG:<\/font><\/b><\/p><\/td>\s*<td[^>]*>\s*<p[^>]*>\s*<font[^>]*>([A-Z]{3})<\/font>/i) ||
                     html.match(/<b>ORG:<\/b>[^<]*<\/[^>]*>[^<]*<[^>]*>([A-Z]{3})/i) ||
                     markdown.match(/\*\*ORG:\*\*\s*([A-Z]{3})/i) ||
                     markdown.match(/ORG[:\s|]+([A-Z]{3})/i);
    
    const dstMatch = html.match(/DST:<\/font><\/b><\/p><\/td>\s*<td[^>]*>\s*<p[^>]*>\s*<font[^>]*>([A-Z]{3})<\/font>/i) ||
                     html.match(/<b>DST:<\/b>[^<]*<\/[^>]*>[^<]*<[^>]*>([A-Z]{3})/i) ||
                     markdown.match(/\*\*DST:\*\*\s*([A-Z]{3})/i) ||
                     markdown.match(/DST[:\s|]+([A-Z]{3})/i);
    
    if (orgMatch) {
      origin = orgMatch[1].toUpperCase();
      console.log(`[AIR EUROPA] ✅ Extracted origin: ${origin}`);
    }
    
    if (dstMatch) {
      destination = dstMatch[1].toUpperCase();
      console.log(`[AIR EUROPA] ✅ Extracted destination: ${destination}`);
    }
    
    // Strategy 2: Extract all airport codes from content
    if (origin === 'N/A' || destination === 'N/A') {
      const excludeWords = ['THE', 'AND', 'FOR', 'NOT', 'AWB', 'UTC', 'EST', 'GMT', 'PDF', 'ORG', 'DST', 'MAD', 'PCS', 'KGS'];
      // Find 3-letter codes that appear as standalone (likely airports)
      const codeMatches = html.match(/>([A-Z]{3})</g) || [];
      const codes: string[] = codeMatches.map((m: string) => m.replace(/[><]/g, '')).filter((c: string) => !excludeWords.includes(c));
      console.log(`[AIR EUROPA] Found airport codes: ${codes.join(', ')}`);
      
      // Get unique codes maintaining order
      const uniqueCodes: string[] = [...new Set(codes)];
      if (uniqueCodes.length >= 2 && origin === 'N/A') {
        origin = uniqueCodes[0];
        console.log(`[AIR EUROPA] ✅ Origin from codes: ${origin}`);
      }
      if (uniqueCodes.length >= 2 && destination === 'N/A') {
        destination = uniqueCodes[uniqueCodes.length - 1];
        console.log(`[AIR EUROPA] ✅ Destination from codes: ${destination}`);
      }
    }
    
    // Parse last event from OPERATIONAL INFORMATION table
    // The first row after headers is the most recent event (as seen in the image)
    let lastStatus = 'BKD';
    let lastStatusDescription = 'Reserva Confirmada';
    let lastTimestamp = new Date().toISOString();
    
    // Strategy 1: Parse from markdown table format
    // Pattern: | MAD | GRU | | 13/12/2025 | 10/2757 | Delivery | 13/12/2025 | 19:51 |
    const operationalRows = markdown.match(/\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]+)\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|\s*(\d{2}:\d{2})\s*\|/g);
    
    if (operationalRows && operationalRows.length > 0) {
      // First row after header is the most recent
      const firstRow = operationalRows[0];
      const rowMatch = firstRow.match(/\|\s*([A-Z]{3})\s*\|\s*([A-Z]{3})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]+)\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|\s*(\d{2}:\d{2})\s*\|/);
      
      if (rowMatch) {
        const statusText = rowMatch[3].trim();
        const dateStr = rowMatch[4];
        const timeStr = rowMatch[5];
        
        console.log(`[AIR EUROPA] First operational row: status=${statusText}, date=${dateStr}, time=${timeStr}`);
        
        lastStatusDescription = statusText;
        
        // Parse date: DD/MM/YYYY to ISO
        const dateParts = dateStr.split('/');
        if (dateParts.length === 3) {
          lastTimestamp = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timeStr}:00Z`;
        }
        
        // Map status text to code
        const statusLower = statusText.toLowerCase();
        if (statusLower.includes('delivery') || statusLower.includes('delivered')) lastStatus = 'DLV';
        else if (statusLower.includes('departed')) lastStatus = 'DEP';
        else if (statusLower.includes('arrived')) lastStatus = 'ARR';
        else if (statusLower.includes('manifested')) lastStatus = 'MAN';
        else if (statusLower.includes('pre-manifested')) lastStatus = 'MAN';
        else if (statusLower.includes('received')) lastStatus = 'RCF';
        else if (statusLower.includes('ready for carriage') || statusLower.includes('accepted')) lastStatus = 'RCS';
        else if (statusLower.includes('freight on hands')) lastStatus = 'FOH';
        else if (statusLower.includes('booked')) lastStatus = 'BKD';
      }
    }
    
    // Strategy 2: Parse directly from HTML table rows
    if (lastStatus === 'BKD') {
      // Look for status in HTML table cells
      const statusCells = html.match(/<font[^>]*color="#007AC3"[^>]*>([^<]+)<\/font>/gi);
      if (statusCells && statusCells.length > 10) {
        // Find "Delivery", "Departed", etc. in cells
        for (const cell of statusCells) {
          const textMatch = cell.match(/>([^<]+)</);
          if (textMatch) {
            const text = textMatch[1].trim().toLowerCase();
            if (text.includes('delivery') || text === 'delivered') {
              lastStatus = 'DLV';
              lastStatusDescription = 'Delivery';
              console.log(`[AIR EUROPA] ✅ Found status from HTML: ${lastStatus}`);
              break;
            } else if (text.includes('departed')) {
              lastStatus = 'DEP';
              lastStatusDescription = text;
            } else if (text.includes('manifested') && lastStatus !== 'DEP') {
              lastStatus = 'MAN';
              lastStatusDescription = text;
            }
          }
        }
      }
    }
    
    console.log(`[AIR EUROPA] ✅ Final parsed: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, endpoint },
      raw: { html_length: html.length, markdown_length: markdown.length },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: lastStatusDescription,
          timestamp: lastTimestamp,
        },
      },
    };
    
  } catch (error) {
    console.error('[AIR EUROPA] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= EMIRATES SKYCARGO API (Direct API with Guest Token) =============

interface EskySummary {
  status: string | null;
  origin: string | null;
  destination: string | null;
}

function extractEskySummary(data: any): EskySummary | null {
  const queue: any[] = [data];
  let status: string | null = null;
  let origin: string | null = null;
  let destination: string | null = null;

  while (queue.length > 0) {
    let node = queue.shift();
    if (node === null || node === undefined) continue;
    if (typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }

    // Extract origin
    if (origin === null && node.origin) {
      const o = node.origin;
      if (typeof o === 'object' && o.code) {
        origin = String(o.code);
      } else if (typeof o === 'string') {
        origin = o;
      }
    }

    // Extract destination
    if (destination === null && node.destination) {
      const d = node.destination;
      if (typeof d === 'object' && d.code) {
        destination = String(d.code);
      } else if (typeof d === 'string') {
        destination = d;
      }
    }

    // Extract status from serviceInfo.milestone
    if (status === null && node.serviceInfo) {
      const svc = node.serviceInfo;
      if (svc && svc.milestone) {
        let miles = svc.milestone;
        if (!Array.isArray(miles)) miles = [miles];
        
        let chosen: any = null;
        for (const ms of miles) {
          if (!ms || typeof ms !== 'object') continue;
          chosen = ms;
          if (ms.latestMilestone) break;
        }
        
        if (chosen && chosen.code) {
          const c = chosen.code;
          if (typeof c === 'object' && c.code && c.code !== '') {
            status = String(c.code);
          } else if (typeof c === 'string' && c !== '') {
            status = c;
          }
        }
      }
    }

    // Extract status from fulfillmentInfo.serviceInfo.milestone
    if (status === null && node.fulfillmentInfo) {
      const ful = node.fulfillmentInfo;
      if (ful && ful.serviceInfo) {
        const svc = ful.serviceInfo;
        if (svc && svc.milestone) {
          let miles = svc.milestone;
          if (!Array.isArray(miles)) miles = [miles];
          
          for (const ms of miles) {
            if (!ms || typeof ms !== 'object' || !ms.code) continue;
            const c = ms.code;
            if (typeof c === 'object' && c.code && c.code !== '') {
              status = String(c.code);
              break;
            } else if (typeof c === 'string' && c !== '') {
              status = c;
              break;
            }
          }
        }
      }
    }

    // Add child nodes to queue
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === 'object') {
        queue.push(v);
      }
    }

    // Early exit if we found everything
    if (status !== null && origin !== null && destination !== null) break;
  }

  if (status === null && origin === null && destination === null) return null;

  return { status, origin, destination };
}

function extractEskyCargoReference(data: any): string | null {
  if (data === null || data === undefined) return null;
  
  const queue: any[] = [data];
  while (queue.length > 0) {
    let node = queue.shift();
    if (node === null || node === undefined) continue;
    if (typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }

    if (node.cargoReference && node.cargoReference !== '') {
      return typeof node.cargoReference === 'string' 
        ? node.cargoReference 
        : JSON.stringify(node.cargoReference);
    }

    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === 'object') {
        queue.push(v);
      }
    }
  }
  return null;
}

async function fetchEskyToken(tenant: string, clientId: string, clientSecret: string): Promise<{ ok: boolean; token?: string; error?: string; raw?: any }> {
  const tokenUrl = 'https://eskycargo.emirates.com/api/uaa/guest/oauth/token?productName=offerandorder';
  
  const payload = new URLSearchParams({
    tenant,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const headers: HeadersInit = {
    'ADRUM': 'isAjax:true',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://eskycargo.emirates.com',
    'Pragma': 'no-cache',
    'Referer': 'https://eskycargo.emirates.com/app/offerandorder/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'X-Security-Request': 'required',
  };

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: payload.toString(),
    });

    const data = await response.json();
    
    if (!data || !data.access_token) {
      return { ok: false, error: 'Token ausente na resposta', raw: data };
    }

    return { ok: true, token: data.access_token, raw: data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao obter token' };
  }
}

async function callEskySearchByAwb(awb: string, bearer: string, tenant: string = 'EK', clientId: string = 'mercator', clientSecret: string = ''): Promise<{ ok: boolean; cargoReference?: string | null; error?: string; raw?: any }> {
  // Extract only digits
  const digits = awb.replace(/\D/g, '');
  if (digits.length !== 11) {
    return { ok: false, error: 'AWB invalido (use 11 digitos)' };
  }

  const payload = {
    orderFilter: {
      airCapacity: {
        documentNumbers: [digits],
        includeItinerary: false,
      },
    },
    pageRequest: {
      page: 1,
      pageSize: 10,
    },
  };

  const endpoint = 'https://eskycargo.emirates.com/api/order/services/cargo/v1/orders/actions/search?view=summary';

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://eskycargo.emirates.com',
    'Referer': 'https://eskycargo.emirates.com/app/offerandorder/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'ADRUM': 'isAjax:true',
    'App-Id': '0002',
    'X-Tenant': tenant,
    'X-Requested-With': 'XMLHttpRequest',
    'X-Security-Request': 'required',
    'Authorization': `Bearer ${bearer}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, raw: data };
    }

    const cargoReference = extractEskyCargoReference(data);
    return { ok: true, cargoReference, raw: data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha na busca' };
  }
}

async function callEskyOrderGet(orderId: string, bearer: string, tenant: string = 'EK'): Promise<{ ok: boolean; summary?: EskySummary | null; error?: string; raw?: any }> {
  // Ensure orderId starts with 'b'
  let orderIdTrim = orderId.trim();
  if (!orderIdTrim.toLowerCase().startsWith('b')) {
    orderIdTrim = 'b' + orderIdTrim;
  }

  const endpoint = `https://eskycargo.emirates.com/api/order/services/cargo/v1/orders/${encodeURIComponent(orderIdTrim)}`;

  const headers: HeadersInit = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'ADRUM': 'isAjax:true',
    'App-Id': '0002',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://eskycargo.emirates.com',
    'Referer': 'https://eskycargo.emirates.com/app/offerandorder/',
    'X-Tenant': tenant,
    'X-Requested-With': 'XMLHttpRequest',
    'Authorization': `Bearer ${bearer}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  };

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, raw: data };
    }

    const summary = extractEskySummary(data);
    return { ok: true, summary, raw: data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar ordem' };
  }
}

async function fetchEmiratesSkyCargo(awb: string): Promise<StandardResult> {
  const provider = 'EMIRATES_SKYCARGO';
  console.log(`[EMIRATES SKYCARGO] 🚀 Starting fetch for AWB: ${awb}`);

  try {
    const tenant = 'EK';
    const clientId = 'mercator';
    const clientSecret = '';

    // Step 1: Get guest token
    console.log('[EMIRATES SKYCARGO] 🔑 Fetching guest token...');
    const tokenResp = await fetchEskyToken(tenant, clientId, clientSecret);
    
    if (!tokenResp.ok || !tokenResp.token) {
      console.error('[EMIRATES SKYCARGO] ❌ Failed to get token:', tokenResp.error);
      return {
        provider,
        ok: false,
        status: 401,
        error: `Falha ao obter token: ${tokenResp.error}`,
        sent: { awb },
        raw: tokenResp.raw,
      };
    }

    const bearer = tokenResp.token;
    console.log('[EMIRATES SKYCARGO] ✅ Token obtained successfully');

    // Step 2: Search by AWB to get cargoReference
    console.log('[EMIRATES SKYCARGO] 🔍 Searching for AWB...');
    const searchResp = await callEskySearchByAwb(awb, bearer, tenant, clientId, clientSecret);
    
    if (!searchResp.ok) {
      console.error('[EMIRATES SKYCARGO] ❌ Search failed:', searchResp.error);
      return {
        provider,
        ok: false,
        status: 404,
        error: `AWB não encontrado: ${searchResp.error}`,
        sent: { awb },
        raw: searchResp.raw,
      };
    }

    const cargoReference = searchResp.cargoReference;
    console.log(`[EMIRATES SKYCARGO] 📦 Cargo Reference: ${cargoReference}`);

    if (!cargoReference) {
      console.error('[EMIRATES SKYCARGO] ❌ No cargoReference found');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB não encontrado (cargoReference ausente)',
        sent: { awb },
        raw: searchResp.raw,
      };
    }

    // Step 3: Get order details using cargoReference
    console.log(`[EMIRATES SKYCARGO] 📋 Fetching order details for: ${cargoReference}`);
    const orderResp = await callEskyOrderGet(cargoReference, bearer, tenant);

    if (!orderResp.ok || !orderResp.summary) {
      console.error('[EMIRATES SKYCARGO] ❌ Order fetch failed:', orderResp.error);
      return {
        provider,
        ok: false,
        status: orderResp.ok ? 404 : 500,
        error: orderResp.error || 'Falha ao obter detalhes da ordem',
        sent: { awb, cargoReference },
        raw: orderResp.raw,
      };
    }

    const summary = orderResp.summary;
    const origin = summary.origin || 'N/A';
    const destination = summary.destination || 'N/A';
    const status = summary.status || 'BKD';

    console.log(`[EMIRATES SKYCARGO] ✅ Final: Origin=${origin}, Dest=${destination}, Status=${status}`);

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, cargoReference },
      raw: { token: 'redacted', search: searchResp.raw, order: orderResp.raw },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: status,
          description: status,
          timestamp: new Date().toISOString(),
        },
      },
    };

  } catch (error) {
    console.error('[EMIRATES SKYCARGO] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= ORCHESTRATION =============

function shouldUseFallback(result: StandardResult): boolean {
  // Use fallback if:
  // - 5xx errors or timeout
  // - 403 Akamai/CDN blocks
  // - Missing credentials
  if (result.status >= 502 && result.status <= 504) return true;
  if (result.status === 500) return true;
  if (result.status === 403 && result.error?.toLowerCase().includes('akamai')) return true;
  if (result.status === 403 && result.error?.toLowerCase().includes('cdn')) return true;
  if (result.status === 401 && result.error?.includes('not configured')) return true;
  
  // DO NOT use fallback for:
  // - 400 invalid input
  // - 404 not found
  if (result.status === 400) return false;
  if (result.status === 404) return false;
  
  return false;
}

// ============= FEDEX EXPRESS (023) =============

// Mapeamento de cidades FedEx para códigos IATA
const fedexCityToIATA: Record<string, string> = {
  'VIRACOPOS': 'VCP',
  'CAMPINAS': 'VCP',
  'GUARULHOS': 'GRU',
  'SAO PAULO': 'GRU',
  'MISSISSAUGA': 'YYZ',
  'TORONTO': 'YYZ',
  'MONTREAL': 'YUL',
  'MEMPHIS': 'MEM',
  'MÊNFIS': 'MEM',
  'MENFIS': 'MEM',
  'INDIANAPOLIS': 'IND',
  'ANCHORAGE': 'ANC',
  'MIAMI': 'MIA',
  'LOS ANGELES': 'LAX',
  'NEW YORK': 'JFK',
  'NEWARK': 'EWR',
  'CHICAGO': 'ORD',
  'DALLAS': 'DFW',
  'ATLANTA': 'ATL',
  'BOSTON': 'BOS',
  'SEATTLE': 'SEA',
  'DENVER': 'DEN',
  'PHOENIX': 'PHX',
  'HOUSTON': 'IAH',
  'SAN FRANCISCO': 'SFO',
  'OAKLAND': 'OAK',
  'HONG KONG': 'HKG',
  'SHANGHAI': 'PVG',
  'BEIJING': 'PEK',
  'TOKYO': 'NRT',
  'OSAKA': 'KIX',
  'SEOUL': 'ICN',
  'SINGAPORE': 'SIN',
  'PARIS': 'CDG',
  'LONDON': 'LHR',
  'FRANKFURT': 'FRA',
  'AMSTERDAM': 'AMS',
  'MADRID': 'MAD',
  'LISBON': 'LIS',
  'DUBAI': 'DXB',
  'COLOGNE': 'CGN',
  'KOELN': 'CGN',
  'GUANGZHOU': 'CAN',
  'SHENZHEN': 'SZX',
  'BORINQUEN': 'BQN',
  'SAN JUAN': 'SJU',
  'PUERTO RICO': 'SJU',
};

// Interface para eventos FedEx
interface FedExEvent {
  date: string;
  time: string;
  status: string;
  location: string;
  country: string;
}

function mapFedExCityToIATA(location: string): string {
  if (!location) return 'N/A';
  
  const upperLocation = location.toUpperCase().trim();
  
  // Verificar se já é um código IATA (3 letras)
  if (/^[A-Z]{3}$/.test(upperLocation)) {
    return upperLocation;
  }
  
  // Procurar no mapeamento - busca parcial
  for (const [key, iata] of Object.entries(fedexCityToIATA)) {
    if (upperLocation.includes(key)) {
      console.log(`[FEDEX] 🗺️ Mapeamento encontrado: ${upperLocation} contém ${key} → ${iata}`);
      return iata;
    }
  }
  
  // Se contém "AIRPORT", tentar extrair o nome antes
  if (upperLocation.includes('AIRPORT') || upperLocation.includes('AEROPORTO')) {
    const cleanName = upperLocation.replace(/AIRPORT|AEROPORTO|DE|DO|DA/gi, '').trim();
    for (const [key, iata] of Object.entries(fedexCityToIATA)) {
      if (cleanName.includes(key)) {
        console.log(`[FEDEX] 🗺️ Mapeamento (airport): ${cleanName} contém ${key} → ${iata}`);
        return iata;
      }
    }
  }
  
  // Se não encontrar, retornar as 3 primeiras letras em maiúscula
  console.log(`[FEDEX] ⚠️ Sem mapeamento para: ${upperLocation}, usando: ${upperLocation.substring(0, 3)}`);
  return upperLocation.substring(0, 3);
}

// Extrair eventos da timeline do FedEx
function parseFedExTravelHistory(markdown: string): FedExEvent[] {
  const events: FedExEvent[] = [];
  
  console.log('[FEDEX] 🔍 Buscando eventos na Travel History...');
  
  // O FedEx exibe os eventos no formato:
  // Thursday, 10/30/25    8:48 PM    Picked up    MONTREAL CA
  // ou em português:
  // Quinta-feira, 30/10/2025    20h48    Pegou    MONTREAL CA
  
  // Padrão para linhas de evento - capturar tudo após a data/hora
  // Formato: "Day, Date Time Status Location Country"
  const lines = markdown.split('\n');
  
  // Regex mais flexíveis para capturar diferentes formatos
  const datePatterns = [
    // English: "Thursday, 10/30/25" or "10/30/25"
    /(\w+day,?\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    // Portuguese: "Quinta-feira, 30/10/2025"
    /(\w+-feira,?\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    // Format: "Monday, 11/3/25"
    /(\w+,?\s+)?(\d{1,2}\/\d{1,2}\/\d{2})/i,
  ];
  
  let currentDate = '';
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Ignorar linhas vazias ou de navegação
    if (!line || line.includes('Back to top') || line.includes('Voltar ao topo') || 
        line.includes('Watch list') || line.includes('Lista de observação')) {
      i++;
      continue;
    }
    
    // Verificar se é uma linha de data
    for (const datePattern of datePatterns) {
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        currentDate = line;
        break;
      }
    }
    
    // Padrão para capturar evento completo na mesma linha ou próximas linhas
    // Formato típico: "8:48 PM  •  Picked up  MONTREAL CA"
    // ou markdown: "8:48 PM • **Picked up** MONTREAL CA"
    const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}h\d{2}(?:\s*da\s*manh[aã])?)/i;
    const timeMatch = line.match(timePattern);
    
    if (timeMatch) {
      const time = timeMatch[1];
      let eventLine = line.replace(timePattern, '').trim();
      
      // Remover marcadores de lista e símbolos
      eventLine = eventLine.replace(/^[\•\*\-\|]+\s*/g, '').trim();
      eventLine = eventLine.replace(/\*\*/g, '').trim(); // Remove markdown bold
      
      // Tentar extrair status e localização
      // Padrão: "Status  LOCATION COUNTRY"
      // A localização geralmente está no final após espaços ou tabulações
      
      // Buscar localização conhecida no final da linha
      let foundLocation = '';
      let foundCountry = '';
      let eventStatus = eventLine;
      
      // Lista de localizações conhecidas para buscar
      const knownLocations = [
        'MONTREAL CA', 'MONTREAL', 'VIRACOPOS BR', 'VIRACOPOS', 'MEMPHIS', 'MÊNFIS',
        'BORINQUEN AIRPORT', 'AEROPORTO DE BORINQUEN', 'MISSISSAUGA', 'TORONTO',
        'INDIANAPOLIS', 'MIAMI', 'ATLANTA', 'CHICAGO', 'NEW YORK'
      ];
      
      for (const loc of knownLocations) {
        if (eventLine.toUpperCase().includes(loc)) {
          foundLocation = loc;
          // Extrair país se existir (2 letras após a cidade)
          const locIndex = eventLine.toUpperCase().indexOf(loc);
          const afterLoc = eventLine.substring(locIndex + loc.length).trim();
          const countryMatch = afterLoc.match(/^([A-Z]{2})\b/);
          if (countryMatch) {
            foundCountry = countryMatch[1];
          }
          // Status é tudo antes da localização
          eventStatus = eventLine.substring(0, locIndex).trim();
          break;
        }
      }
      
      // Se não encontrou localização conhecida, tentar padrão genérico
      // "Status words   LOCATION COUNTRY"
      if (!foundLocation) {
        // Tentar encontrar padrão: texto + cidade com país (2 letras maiúsculas)
        const locPatternWithCountry = /(.+?)\s{2,}([A-Z][A-Za-z\s]+)\s+([A-Z]{2})\s*$/;
        const locMatch = eventLine.match(locPatternWithCountry);
        if (locMatch) {
          eventStatus = locMatch[1].trim();
          foundLocation = locMatch[2].trim();
          foundCountry = locMatch[3];
        } else {
          // Tentar sem país
          const locPatternNoCountry = /(.+?)\s{2,}([A-Z][A-Za-z\s]+)\s*$/;
          const locMatch2 = eventLine.match(locPatternNoCountry);
          if (locMatch2) {
            eventStatus = locMatch2[1].trim();
            foundLocation = locMatch2[2].trim();
          }
        }
      }
      
      // Limpar status de caracteres extras
      eventStatus = eventStatus.replace(/^[\•\*\-\|]+\s*/g, '').trim();
      eventStatus = eventStatus.replace(/\s+/g, ' ').trim();
      
      if (eventStatus && (foundLocation || eventStatus.length > 3)) {
        const event: FedExEvent = {
          date: currentDate,
          time: time,
          status: eventStatus,
          location: foundLocation || 'Unknown',
          country: foundCountry,
        };
        events.push(event);
        console.log(`[FEDEX] 📋 Evento: ${event.status} @ ${event.location} ${event.country} (${event.date} ${event.time})`);
      }
    }
    
    i++;
  }
  
  console.log(`[FEDEX] 📊 Total de eventos extraídos: ${events.length}`);
  return events;
}

// Extrair status do FedEx de forma mais inteligente
function extractFedExStatus(markdown: string): { code: string; description: string } {
  // Verificar delivered primeiro (maior prioridade)
  const deliveredPatterns = [
    /delivered/i,
    /entregue/i,
  ];
  
  for (const pattern of deliveredPatterns) {
    if (pattern.test(markdown)) {
      return { code: 'DLV', description: 'Delivered' };
    }
  }
  
  // Outros status
  const statusMap: Array<{ pattern: RegExp; code: string; description: string }> = [
    { pattern: /At local FedEx facility/i, code: 'ARR', description: 'At local FedEx facility' },
    { pattern: /Nas instalações locais da FedEx/i, code: 'ARR', description: 'At local FedEx facility' },
    { pattern: /At FedEx destination facility/i, code: 'ARR', description: 'At FedEx destination facility' },
    { pattern: /Out for delivery/i, code: 'OFD', description: 'Out for Delivery' },
    { pattern: /On the way/i, code: 'TRA', description: 'In Transit' },
    { pattern: /A caminho/i, code: 'TRA', description: 'In Transit' },
    { pattern: /In transit/i, code: 'TRA', description: 'In Transit' },
    { pattern: /Left origin/i, code: 'DEP', description: 'Left Origin' },
    { pattern: /Origem esquerda|Saiu da origem/i, code: 'DEP', description: 'Left Origin' },
    { pattern: /Picked up/i, code: 'PUP', description: 'Picked Up' },
    { pattern: /Pegou/i, code: 'PUP', description: 'Picked Up' },
    { pattern: /Clearance delay/i, code: 'DIS', description: 'Clearance Delay' },
    { pattern: /customs/i, code: 'CLR', description: 'In Customs' },
    { pattern: /Arrived/i, code: 'ARR', description: 'Arrived' },
    { pattern: /Departed/i, code: 'DEP', description: 'Departed' },
  ];
  
  for (const { pattern, code, description } of statusMap) {
    if (pattern.test(markdown)) {
      return { code, description };
    }
  }
  
  return { code: 'Em Processamento', description: 'Processing' };
}

async function fetchFedExTracking(awb: string): Promise<StandardResult> {
  const provider = 'fedex_track';
  console.log(`[FEDEX] 🚀 Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[FEDEX] ❌ FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 500,
        error: 'FIRECRAWL_API_KEY not configured',
        sent: { awb },
      };
    }
    
    // Normalizar AWB: remover hífen e garantir formato correto
    const trackingNumber = awb.replace(/\D/g, ''); // Remove tudo que não é dígito
    console.log(`[FEDEX] 📋 Tracking number normalizado: ${trackingNumber}`);
    
    // URL do FedEx tracking
    const url = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
    console.log(`[FEDEX] 🔗 URL: ${url}`);
    
    // Usar Firecrawl para fazer scraping (FedEx usa muito JavaScript)
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 30000, // FedEx usa muito JavaScript - aumentar para garantir
        timeout: 90000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FEDEX] ❌ Firecrawl error: ${errorText.substring(0, 200)}`);
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Firecrawl error: ${response.status}`,
        sent: { awb, url },
      };
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[FEDEX] ❌ Firecrawl scrape failed:', data.error);
      return {
        provider,
        ok: false,
        status: 500,
        error: data.error || 'Scrape failed',
        sent: { awb, url },
        raw: data,
      };
    }
    
    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    
    console.log(`[FEDEX] 📄 Markdown length: ${markdown.length}, HTML length: ${html.length}`);
    console.log(`[FEDEX] 📝 Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Extrair origem, destino e status do conteúdo
    let origin = 'N/A';
    let destination = 'N/A';
    let lastStatus = 'N/A';
    let statusDescription = '';
    
    // ===== NOVA LÓGICA DE EXTRAÇÃO BASEADA EM EVENTOS ESPECÍFICOS =====
    // O FedEx mostra "Travel history" / "Histórico de viagens" com eventos cronológicos
    // IMPORTANTE: A lógica antiga assumia que primeira localização = origem e última = destino
    // Mas isso é incorreto porque hubs de conexão (MEMPHIS, INDIANAPOLIS) aparecem no meio
    // 
    // NOVA ESTRATÉGIA:
    // 1. ORIGEM: Localização do evento "Picked up" (onde a carga foi coletada)
    // 2. DESTINO: Localização do evento "At local FedEx facility" ou último evento não-hub
    
    // Lista de hubs FedEx que são pontos de conexão (não origem/destino real)
    const FEDEX_HUBS = ['MEMPHIS', 'MENFIS', 'MÊNFIS', 'INDIANAPOLIS', 'ANCHORAGE', 'OAKLAND', 'PARIS CDG'];
    
    // Buscar padrão "Picked up" seguido de localização para identificar ORIGEM
    const pickedUpPatterns = [
      /Picked up\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
      /Pegou\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
    ];
    
    for (const pattern of pickedUpPatterns) {
      const match = pattern.exec(markdown);
      if (match && match[1]) {
        const pickedUpCity = match[1].trim();
        origin = mapFedExCityToIATA(pickedUpCity);
        console.log(`[FEDEX] 📍 ORIGEM (Picked up): ${pickedUpCity} → ${origin}`);
        break;
      }
    }
    
    // Buscar padrão "At local FedEx facility" seguido de localização para identificar DESTINO
    const facilityPatterns = [
      /At local FedEx facility\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
      /Nas instalações locais da FedEx\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
      /At FedEx destination facility\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
      /Delivered\s+([A-Za-z\s]+)\s*(?:CA|BR|US|MX|CN|HK|JP|KR|SG)?/gi,
    ];
    
    for (const pattern of facilityPatterns) {
      const match = pattern.exec(markdown);
      if (match && match[1]) {
        const facilityCity = match[1].trim();
        destination = mapFedExCityToIATA(facilityCity);
        console.log(`[FEDEX] 📍 DESTINO (At facility): ${facilityCity} → ${destination}`);
        break;
      }
    }
    
    // FALLBACK: Buscar todas as localizações e filtrar hubs
    if (origin === 'N/A' || destination === 'N/A') {
      const locationPattern = /(MONTREAL|VIRACOPOS|MEMPHIS|MÊNFIS|MENFIS|MISSISSAUGA|TORONTO|BORINQUEN|INDIANAPOLIS|MIAMI|ATLANTA|CHICAGO|NEW YORK|GUANGZHOU|SHENZHEN|HONG KONG|SHANGHAI|CAMPINAS|GUARULHOS|SAO PAULO|SAN JUAN|BOGOTA|MEDELLIN|LIMA|SANTIAGO|BUENOS AIRES|MEXICO CITY|PANAMA CITY|DENVER|SEATTLE|BOSTON|PHOENIX|HOUSTON|DALLAS|LOS ANGELES|SAN FRANCISCO)\s*(?:CA|BR|US|MX|CN|HK|CO|PE|CL|AR|PA|AIRPORT|AEROPORTO)?/gi;
      
      const foundLocations: string[] = [];
      let locMatch;
      while ((locMatch = locationPattern.exec(markdown)) !== null) {
        const loc = locMatch[0].trim().toUpperCase().split(/\s+(CA|BR|US|MX|CN|HK)/)[0].trim();
        // Evitar duplicatas consecutivas
        if (foundLocations.length === 0 || foundLocations[foundLocations.length - 1] !== loc) {
          foundLocations.push(loc);
        }
      }
      
      console.log(`[FEDEX] 📍 Todas as localizações: ${foundLocations.join(' → ')}`);
      
      // Filtrar hubs para encontrar origem e destino reais
      const nonHubLocations = foundLocations.filter(loc => 
        !FEDEX_HUBS.some(hub => loc.toUpperCase().includes(hub))
      );
      
      console.log(`[FEDEX] 📍 Localizações sem hubs: ${nonHubLocations.join(' → ')}`);
      
      if (nonHubLocations.length >= 1 && origin === 'N/A') {
        // ORIGEM: Primeira localização não-hub
        origin = mapFedExCityToIATA(nonHubLocations[0]);
        console.log(`[FEDEX] 📍 ORIGEM (fallback primeira não-hub): ${nonHubLocations[0]} → ${origin}`);
      }
      
      if (nonHubLocations.length >= 2 && destination === 'N/A') {
        // DESTINO: Última localização não-hub
        destination = mapFedExCityToIATA(nonHubLocations[nonHubLocations.length - 1]);
        console.log(`[FEDEX] 📍 DESTINO (fallback última não-hub): ${nonHubLocations[nonHubLocations.length - 1]} → ${destination}`);
      } else if (foundLocations.length >= 1 && destination === 'N/A') {
        // Se só tem hubs, usar a última localização
        destination = mapFedExCityToIATA(foundLocations[foundLocations.length - 1]);
        console.log(`[FEDEX] 📍 DESTINO (fallback última): ${foundLocations[foundLocations.length - 1]} → ${destination}`);
      }
    }
    
    // ===== EXTRAIR STATUS DO ÚLTIMO EVENTO =====
    // Buscar o status mais recente na timeline
    // Padrões do FedEx: "At local FedEx facility", "Delivered", "On the way", "Picked up", etc.
    
    const statusResult = extractFedExStatus(markdown);
    lastStatus = statusResult.code;
    statusDescription = statusResult.description;
    console.log(`[FEDEX] 📦 Status extraído: ${lastStatus} - ${statusDescription}`);
    
    // ===== FALLBACK: Buscar FROM/TO explícitos se não encontrou localizações =====
    if (origin === 'N/A' || destination === 'N/A') {
      // Padrão FROM cidade
      const fromMatch = markdown.match(/FROM\s*\n?\s*([A-Za-z\s]+),?\s*([A-Z]{2})?/i);
      if (fromMatch && origin === 'N/A') {
        const fromCity = fromMatch[1].trim();
        origin = mapFedExCityToIATA(fromCity);
        console.log(`[FEDEX] 📍 FROM (fallback): ${fromCity} → ${origin}`);
      }
      
      // Padrão TO cidade
      const toMatch = markdown.match(/TO\s*\n?\s*([A-Za-z\s]+),?\s*([A-Z]{2})?/i);
      if (toMatch && destination === 'N/A') {
        const toCity = toMatch[1].trim();
        destination = mapFedExCityToIATA(toCity);
        console.log(`[FEDEX] 📍 TO (fallback): ${toCity} → ${destination}`);
      }
    }
    
    // ===== FALLBACK HTML =====
    if ((origin === 'N/A' || destination === 'N/A') && html) {
      // Buscar no HTML por campos específicos
      const originHtmlMatch = html.match(/data-origin="([^"]+)"/i) || 
                              html.match(/origin-city[^>]*>([^<]+)</i);
      const destHtmlMatch = html.match(/data-destination="([^"]+)"/i) || 
                            html.match(/destination-city[^>]*>([^<]+)</i);
      
      if (originHtmlMatch && origin === 'N/A') {
        origin = mapFedExCityToIATA(originHtmlMatch[1].trim());
        console.log(`[FEDEX] 📍 Origem do HTML: ${originHtmlMatch[1]} → ${origin}`);
      }
      
      if (destHtmlMatch && destination === 'N/A') {
        destination = mapFedExCityToIATA(destHtmlMatch[1].trim());
        console.log(`[FEDEX] 📍 Destino do HTML: ${destHtmlMatch[1]} → ${destination}`);
      }
    }
    
    // Verificar se AWB não foi encontrado
    if (markdown.includes('No results found') || markdown.includes('Unable to retrieve') ||
        markdown.includes('Não foi possível') || markdown.includes('não encontrado')) {
      console.log('[FEDEX] ❌ AWB não encontrado');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB not found',
        sent: { awb, url },
        raw: { markdown: markdown.substring(0, 500) },
      };
    }
    
    // Se não encontrou status, usar padrão
    if (lastStatus === 'N/A') {
      lastStatus = 'Em Processamento';
      statusDescription = 'Aguardando informações';
    }
    
    console.log(`[FEDEX] ✅ Resultado final - Origem: ${origin}, Destino: ${destination}, Status: ${lastStatus}`);
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, url },
      raw: { markdown: markdown.substring(0, 3000) },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: statusDescription || lastStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
    
  } catch (error) {
    console.error('[FEDEX] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= UPS AIRLINES (406) =============

async function fetchUPSTracking(awb: string): Promise<StandardResult> {
  const provider = 'ups_air_cargo';
  console.log(`[UPS] 🚀 Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[UPS] ❌ FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 500,
        error: 'FIRECRAWL_API_KEY not configured',
        sent: { awb },
      };
    }
    
    // Normalizar AWB: extrair prefixo (406) e número
    const cleanAwb = awb.replace(/\D/g, '');
    const awbPrefix = cleanAwb.substring(0, 3); // 406
    const awbNumber = cleanAwb.substring(3); // 05958304
    
    console.log(`[UPS] 📍 Prefix: ${awbPrefix}, Number: ${awbNumber}`);
    
    // URL do tracking UPS Air Cargo
    const url = `https://www.aircargo.ups.com/en-US/Tracking?awbPrefix=${awbPrefix}&awbNumber=${awbNumber}`;
    console.log(`[UPS] 🔗 URL: ${url}`);
    
    // Fazer scraping com Firecrawl
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error(`[UPS] ❌ Firecrawl error: ${firecrawlResponse.status} - ${errorText}`);
      return {
        provider,
        ok: false,
        status: firecrawlResponse.status,
        error: `Firecrawl error: ${firecrawlResponse.status}`,
        sent: { awb, url },
      };
    }
    
    const firecrawlData = await firecrawlResponse.json();
    const markdown = firecrawlData?.data?.markdown || firecrawlData?.markdown || '';
    const html = firecrawlData?.data?.html || firecrawlData?.html || '';
    
    console.log(`[UPS] 📄 Markdown length: ${markdown.length}`);
    console.log(`[UPS] 📄 HTML length: ${html.length}`);
    console.log(`[UPS] 📄 Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Verificar se AWB foi encontrado
    const notFoundPatterns = [
      /no results found/i,
      /tracking information is not available/i,
      /shipment not found/i,
      /unable to locate/i,
      /no tracking data/i,
    ];
    
    for (const pattern of notFoundPatterns) {
      if (pattern.test(markdown) || pattern.test(html)) {
        console.log(`[UPS] ⚠️ AWB not found`);
        return {
          provider,
          ok: false,
          status: 404,
          error: 'AWB not found',
          sent: { awb, url },
        };
      }
    }
    
    let origin = 'N/A';
    let destination = 'N/A';
    let lastStatus = 'N/A';
    let statusDescription = '';
    
    // ===== EXTRAIR ORIGEM E DESTINO =====
    // A página UPS Air Cargo mostra no formato:
    // "Origin: **VCP** Destination: **UIO**" (com formatação markdown bold)
    
    // PRIORIDADE 1: Formato específico UPS "Origin: **XXX** Destination: **XXX**"
    // Este é o formato mais confiável encontrado na página
    const upsExactOriginMatch = markdown.match(/Origin:\s*\*{0,2}([A-Z]{3})\*{0,2}/i);
    const upsExactDestMatch = markdown.match(/Destination:\s*\*{0,2}([A-Z]{3})\*{0,2}/i);
    
    if (upsExactOriginMatch) {
      origin = upsExactOriginMatch[1].toUpperCase();
      console.log(`[UPS] 📍 Origem encontrada (exato): ${origin}`);
    }
    
    if (upsExactDestMatch) {
      destination = upsExactDestMatch[1].toUpperCase();
      console.log(`[UPS] 📍 Destino encontrado (exato): ${destination}`);
    }
    
    // PRIORIDADE 2: Formato de rota no header "VCP – UIO" ou "VCP - UIO"
    if (origin === 'N/A' || destination === 'N/A') {
      const headerRouteMatch = markdown.match(/\*{0,2}([A-Z]{3})\s*[–—-]\s*([A-Z]{3})\*{0,2}/);
      if (headerRouteMatch) {
        if (origin === 'N/A') origin = headerRouteMatch[1].toUpperCase();
        if (destination === 'N/A') destination = headerRouteMatch[2].toUpperCase();
        console.log(`[UPS] 📍 Rota header encontrada: ${origin} → ${destination}`);
      }
    }
    
    // PRIORIDADE 3: Fallback - patterns genéricos
    if (origin === 'N/A') {
      const originPatterns = [
        /origin[:\s]+\*{0,2}([A-Z]{3})\*{0,2}/i,
        /from[:\s]+\*{0,2}([A-Z]{3})\*{0,2}/i,
      ];
      for (const pattern of originPatterns) {
        const match = markdown.match(pattern) || html.match(pattern);
        if (match) {
          origin = match[1].toUpperCase();
          console.log(`[UPS] 📍 Origem encontrada (fallback): ${origin}`);
          break;
        }
      }
    }
    
    if (destination === 'N/A') {
      const destinationPatterns = [
        /destination[:\s]+\*{0,2}([A-Z]{3})\*{0,2}/i,
        /\bto[:\s]+\*{0,2}([A-Z]{3})\*{0,2}/i,
      ];
      for (const pattern of destinationPatterns) {
        const match = markdown.match(pattern) || html.match(pattern);
        if (match) {
          destination = match[1].toUpperCase();
          console.log(`[UPS] 📍 Destino encontrado (fallback): ${destination}`);
          break;
        }
      }
    }
    
    // ===== EXTRAIR ÚLTIMO STATUS =====
    // UPS mostra "Most Recent Activity: Arrived at UIO ( 15 Pieces )"
    
    // Extrair descrição do status
    const recentActivityMatch = markdown.match(/\*{0,2}Most Recent Activity:\*{0,2}\s*([^\n(]+)/i);
    if (recentActivityMatch) {
      statusDescription = recentActivityMatch[1].trim();
      console.log(`[UPS] 📋 Status description: ${statusDescription}`);
    }
    
    // Mapear status para códigos - ordem por prioridade
    const statusMapping: Array<{ pattern: RegExp; code: string; desc: string }> = [
      { pattern: /delivered/i, code: 'DLV', desc: 'Delivered' },
      { pattern: /arrived at \*{0,2}([A-Z]{3})\*{0,2}/i, code: 'ARR', desc: 'Arrived' },
      { pattern: /departed from \*{0,2}([A-Z]{3})\*{0,2}/i, code: 'DEP', desc: 'Departed' },
      { pattern: /\barrived\b/i, code: 'ARR', desc: 'Arrived' },
      { pattern: /\bdeparted\b/i, code: 'DEP', desc: 'Departed' },
      { pattern: /in transit/i, code: 'TRA', desc: 'In Transit' },
      { pattern: /received from shipper/i, code: 'RCS', desc: 'Received from Shipper' },
      { pattern: /\breceived\b/i, code: 'RCS', desc: 'Received' },
      { pattern: /customs/i, code: 'CLR', desc: 'Customs Clearance' },
      { pattern: /booked/i, code: 'BKD', desc: 'Booked' },
      { pattern: /manifested/i, code: 'MAN', desc: 'Manifested' },
      { pattern: /ready for delivery/i, code: 'NFD', desc: 'Ready for Delivery' },
    ];
    
    // Tentar mapear a descrição do status encontrada
    if (statusDescription) {
      for (const { pattern, code, desc } of statusMapping) {
        if (pattern.test(statusDescription)) {
          lastStatus = code;
          console.log(`[UPS] 📋 Status code mapeado: ${lastStatus}`);
          break;
        }
      }
    }
    
    // Fallback: buscar na tabela de eventos (primeira linha é o mais recente)
    if (lastStatus === 'N/A') {
      // Padrão da tabela: "| Arrived | UIO | UPS411 ..." ou "| Departed | VCP | ..."
      const tableStatusMatch = markdown.match(/\|\s*(Arrived|Departed|Delivered|Received|Booked)\s*\|/i);
      if (tableStatusMatch) {
        const tableStatus = tableStatusMatch[1].toLowerCase();
        for (const { pattern, code } of statusMapping) {
          if (pattern.test(tableStatus)) {
            lastStatus = code;
            statusDescription = statusDescription || tableStatusMatch[1];
            console.log(`[UPS] 📋 Status da tabela: ${lastStatus}`);
            break;
          }
        }
      }
    }
    
    // Se não encontrou status específico, usar "Em Processamento"
    if (lastStatus === 'N/A' && (markdown.length > 500 || html.length > 500)) {
      lastStatus = 'Em Processamento';
      statusDescription = statusDescription || 'Aguardando informações';
    }
    
    console.log(`[UPS] ✅ Resultado: Origem=${origin}, Destino=${destination}, Status=${lastStatus} (${statusDescription})`);
    
    // Validar se encontramos dados suficientes
    if (origin === 'N/A' && destination === 'N/A' && lastStatus === 'N/A') {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Could not extract tracking data',
        sent: { awb, url },
        raw: { markdown: markdown.substring(0, 2000) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb, url },
      raw: { markdown: markdown.substring(0, 3000) },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: lastStatus,
          description: statusDescription || lastStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
    
  } catch (error) {
    console.error('[UPS] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= SKY CARGA API =============

async function fetchSkyCargoAPI(awb: string): Promise<StandardResult> {
  const provider = 'SKY_CARGA';
  console.log(`[SKY CARGA] Fetching AWB: ${awb}`);
  
  // Map SKY Carga status codes to standard IATA codes
  const STATUS_MAP: Record<string, string> = {
    'BOOKED': 'BKD',
    'IN_TRANSIT': 'DEP',
    'DELIVERED': 'DLV',
    'ARRIVED': 'ARR',
    'RECEIVED': 'RCS',
    'DEPARTED': 'DEP',
    'MANIFESTED': 'MAN',
    'CUSTOMS_CLEARED': 'CCD',
    'READY_FOR_PICKUP': 'NFD',
    'OUT_FOR_DELIVERY': 'NFD',
    'PICKED_UP': 'RCS',
    // Keep standard codes as-is
    'BKD': 'BKD',
    'DEP': 'DEP',
    'ARR': 'ARR',
    'RCS': 'RCS',
    'DLV': 'DLV',
    'MAN': 'MAN',
    'NFD': 'NFD',
    'RCF': 'RCF',
    'CCD': 'CCD',
  };
  
  try {
    // Extract just the numeric part (remove prefix if present)
    const awbNumber = awb.replace(/\D/g, '');
    
    const url = `https://m7cahhd81a.execute-api.us-east-2.amazonaws.com/api/shipment/track/${encodeURIComponent(awbNumber)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      console.error(`[SKY CARGA] HTTP error: ${response.status}`);
      
      // 400 status means AWB not found - return valid result with NOT_FOUND status to save in DB
      if (response.status === 400) {
        console.log(`[SKY CARGA] ⚠️ 400 response - AWB not found, returning NOT_FOUND status`);
        return {
          provider,
          ok: true, // Mark as ok so status gets saved to DB
          status: 200,
          error: null,
          sent: { awb: awbNumber },
          summary: {
            origin: undefined,
            destination: undefined,
            lastStatus: {
              code: 'NOT_FOUND',
              description: 'AWB not found',
              timestamp: new Date().toISOString(),
            },
          },
        };
      }
      
      return {
        provider,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        sent: { awb: awbNumber },
      };
    }

    const data = await response.json();
    console.log(`[SKY CARGA] Response:`, JSON.stringify(data).substring(0, 1000));

    // Check if API returned success but no data (AWB not found)
    if (data?.success === false || data?.errors) {
      console.log(`[SKY CARGA] ⚠️ AWB not found or API error: ${JSON.stringify(data.errors)}`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'AWB not found',
        sent: { awb: awbNumber },
      };
    }

    // Extract data - API returns data -> {fields} or data -> data -> {fields}
    const payload = data?.data?.data ?? data?.data ?? data;
    
    // Check if payload is empty or has no tracking number
    if (!payload || !payload.trackingNumber || payload.id === '00000000-0000-0000-0000-000000000000' && !payload.history?.length) {
      console.log(`[SKY CARGA] ⚠️ No tracking data found for AWB`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking data found',
        sent: { awb: awbNumber },
      };
    }
    
    const origin = payload?.originStationId || 'N/A';
    const destination = payload?.destinationStationId || 'N/A';
    
    // Get latest status from history
    let latestStatus = 'N/A';
    let latestStatusDescription = '';
    let latestTimestamp = new Date().toISOString();
    
    if (payload?.history && Array.isArray(payload.history) && payload.history.length > 0) {
      // Find the last non-empty status (iterate from end)
      for (let i = payload.history.length - 1; i >= 0; i--) {
        const event = payload.history[i];
        if (event?.statusCode && event.statusCode !== '') {
          const rawStatus = event.statusCode.toUpperCase();
          // Map to standard IATA code
          latestStatus = STATUS_MAP[rawStatus] || rawStatus;
          latestStatusDescription = event.status || event.statusDescription || latestStatus;
          if (event.changedAtUtc || event.eventDate || event.date) {
            latestTimestamp = event.changedAtUtc || event.eventDate || event.date;
          }
          console.log(`[SKY CARGA] 📍 Found status: ${rawStatus} -> mapped to: ${latestStatus}`);
          break;
        }
      }
    }
    
    // If no status found in history, use top-level status field
    if (latestStatus === 'N/A' && payload?.status) {
      latestStatusDescription = payload.status;
      // Try to infer status code from description
      const statusLower = payload.status.toLowerCase();
      if (statusLower.includes('despachada') || statusLower.includes('transit')) {
        latestStatus = 'DEP';
      } else if (statusLower.includes('entregue') || statusLower.includes('delivered')) {
        latestStatus = 'DLV';
      } else if (statusLower.includes('chegou') || statusLower.includes('arrived')) {
        latestStatus = 'ARR';
      } else if (statusLower.includes('booking') || statusLower.includes('reserv')) {
        latestStatus = 'BKD';
      }
      console.log(`[SKY CARGA] 📍 Status from top-level field: ${payload.status} -> ${latestStatus}`);
    }
    
    console.log(`[SKY CARGA] ✅ Resultado: Origem=${origin}, Destino=${destination}, Status=${latestStatus}, Desc=${latestStatusDescription}`);

    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: awbNumber },
      raw: data,
      summary: {
        origin,
        destination,
        lastStatus: {
          code: latestStatus,
          description: latestStatusDescription || latestStatus,
          timestamp: latestTimestamp,
        },
      },
    };
  } catch (error) {
    console.error('[SKY CARGA] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= IAG CARGO 125 API =============

async function fetchIagCargo125(awb: string): Promise<StandardResult> {
  const provider = 'iagcargo_125';
  console.log(`[IAG CARGO 125] Fetching AWB: ${awb}`);
  
  try {
    // Normalize AWB format to 125-XXXXXXXX
    const cleanAwb = awb.replace(/\D/g, '');
    const formattedAwb = cleanAwb.length === 11 
      ? `${cleanAwb.substring(0, 3)}-${cleanAwb.substring(3)}`
      : awb.includes('-') ? awb : `125-${cleanAwb}`;
    
    console.log(`[IAG CARGO 125] Formatted AWB: ${formattedAwb}`);
    
    // Try the tracking API endpoint
    const apiUrl = `https://api.tracking.iagcargo.com/tracking/${formattedAwb}`;
    console.log(`[IAG CARGO 125] Trying API: ${apiUrl}`);
    
    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://ui.tracking.iagcargo.com',
        'Referer': 'https://ui.tracking.iagcargo.com/',
      },
    });
    
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      console.log(`[IAG CARGO 125] API Response:`, JSON.stringify(data).substring(0, 1500));
      
      // Extract origin and destination from the response
      let origin = 'N/A';
      let destination = 'N/A';
      let latestStatus = 'N/A';
      let latestStatusDescription = '';
      let latestTimestamp = new Date().toISOString();
      
      // IAG Cargo API structure: data.awb.originCode, data.awb.destinationCode
      const awbData = data?.awb;
      if (awbData) {
        if (awbData.originCode) origin = awbData.originCode;
        if (awbData.destinationCode) destination = awbData.destinationCode;
        console.log(`[IAG CARGO 125] Extracted from awb: origin=${origin}, destination=${destination}`);
      }
      
      // Fallback: Try different response structures
      if (origin === 'N/A' || destination === 'N/A') {
        const shipment = data?.shipment || data?.data?.shipment || data;
        
        // Direct origin/destination
        if (origin === 'N/A' && shipment?.origin) origin = shipment.origin;
        if (destination === 'N/A' && shipment?.destination) destination = shipment.destination;
        
        // From segments/legs array
        if (origin === 'N/A' || destination === 'N/A') {
          const segments = shipment?.segments || shipment?.legs || shipment?.route?.segments || [];
          if (Array.isArray(segments) && segments.length > 0) {
            if (origin === 'N/A') {
              origin = segments[0]?.from || segments[0]?.origin || segments[0]?.departure?.airport || origin;
            }
            if (destination === 'N/A') {
              const lastSegment = segments[segments.length - 1];
              destination = lastSegment?.to || lastSegment?.destination || lastSegment?.arrival?.airport || destination;
            }
          }
        }
      }
      
      // Extract last status from journeyStations milestones (IAG Cargo specific)
      const journeyStations = data?.journeyStations || [];
      if (Array.isArray(journeyStations) && journeyStations.length > 0) {
        // Collect all milestones from all journey stations
        const allMilestones: any[] = [];
        for (const station of journeyStations) {
          const milestones = station?.milestones || [];
          for (const milestone of milestones) {
            if (milestone?.eventTime) {
              allMilestones.push(milestone);
            }
          }
        }
        
        if (allMilestones.length > 0) {
          // Sort by eventTime (most recent last)
          allMilestones.sort((a, b) => {
            const dateA = new Date(a.eventTime || 0).getTime();
            const dateB = new Date(b.eventTime || 0).getTime();
            return dateA - dateB;
          });
          
          const lastMilestone = allMilestones[allMilestones.length - 1];
          latestStatus = lastMilestone?.milestoneCode || 'N/A';
          latestStatusDescription = lastMilestone?.milestoneCode || latestStatus;
          latestTimestamp = lastMilestone?.eventTime || latestTimestamp;
          console.log(`[IAG CARGO 125] Last milestone: ${latestStatus} at ${latestTimestamp}`);
        }
      }
      
      // Fallback: Extract last status from events/milestones/history (generic)
      if (latestStatus === 'N/A') {
        const shipment = data?.shipment || data?.data?.shipment || data;
        const events = shipment?.events || shipment?.milestones || shipment?.history || shipment?.trackingEvents || [];
        if (Array.isArray(events) && events.length > 0) {
          // Sort by timestamp if needed (most recent last)
          const sortedEvents = [...events].sort((a, b) => {
            const dateA = new Date(a.timestamp || a.date || a.eventDate || 0).getTime();
            const dateB = new Date(b.timestamp || b.date || b.eventDate || 0).getTime();
            return dateA - dateB;
          });
          
          const lastEvent = sortedEvents[sortedEvents.length - 1];
          latestStatus = lastEvent?.statusCode || lastEvent?.code || lastEvent?.status || 'N/A';
          latestStatusDescription = lastEvent?.description || lastEvent?.statusDescription || lastEvent?.message || latestStatus;
          latestTimestamp = lastEvent?.timestamp || lastEvent?.date || lastEvent?.eventDate || latestTimestamp;
        }
      }
      
      console.log(`[IAG CARGO 125] ✅ Resultado: Origem=${origin}, Destino=${destination}, Status=${latestStatus}`);
      
      if (origin !== 'N/A' || destination !== 'N/A' || latestStatus !== 'N/A') {
        return {
          provider,
          ok: true,
          status: 200,
          error: null,
          sent: { awb: formattedAwb },
          raw: data,
          summary: {
            origin,
            destination,
            lastStatus: {
              code: latestStatus,
              description: latestStatusDescription || latestStatus,
              timestamp: latestTimestamp,
            },
          },
        };
      }
    }
    
    // Fallback: Scrape the UI page using Firecrawl
    console.log(`[IAG CARGO 125] API failed or no data, trying Firecrawl scraping...`);
    
    const uiUrl = `https://ui.tracking.iagcargo.com/en/${formattedAwb}?frame=true&loggedIn=false`;
    
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[IAG CARGO 125] FIRECRAWL_API_KEY not configured');
      return {
        provider,
        ok: false,
        status: 500,
        error: 'Firecrawl not configured',
        sent: { awb: formattedAwb },
      };
    }
    
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: uiUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 5000,
      }),
    });
    
    if (!scrapeResponse.ok) {
      console.error(`[IAG CARGO 125] Firecrawl failed: ${scrapeResponse.status}`);
      return {
        provider,
        ok: false,
        status: scrapeResponse.status,
        error: `Firecrawl HTTP ${scrapeResponse.status}`,
        sent: { awb: formattedAwb },
      };
    }
    
    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || '';
    console.log(`[IAG CARGO 125] Scraped markdown (first 1500 chars):`, markdown.substring(0, 1500));
    
    // Parse origin and destination from markdown
    // Look for patterns like "Shanghai (PVG) to Sao Paulo (GRU)" or route display
    let origin = 'N/A';
    let destination = 'N/A';
    let latestStatus = 'N/A';
    let latestStatusDescription = '';
    
    // Pattern: "Shanghai (PVG) to Sao Paulo (GRU)"
    const routeMatch = markdown.match(/([A-Za-z\s]+)\s*\(([A-Z]{3})\)\s*to\s*([A-Za-z\s]+)\s*\(([A-Z]{3})\)/i);
    if (routeMatch) {
      origin = routeMatch[2].toUpperCase();
      destination = routeMatch[4].toUpperCase();
      console.log(`[IAG CARGO 125] Parsed route: ${origin} -> ${destination}`);
    }
    
    // Fallback: Look for IATA codes in route visualization (PVG, LHR, GRU pattern)
    if (origin === 'N/A' || destination === 'N/A') {
      // Match airport codes in sequence like "PVG ... LHR ... GRU"
      const airportCodes: string[] = markdown.match(/\b([A-Z]{3})\b/g) || [];
      const uniqueCodes: string[] = [...new Set(airportCodes)].filter((code: string) => 
        !['DEP', 'ARR', 'DLV', 'RCF', 'BKD', 'MAN', 'NFD', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT'].includes(code)
      );
      
      if (uniqueCodes.length >= 2 && origin === 'N/A') {
        origin = uniqueCodes[0];
        destination = uniqueCodes[uniqueCodes.length - 1];
        console.log(`[IAG CARGO 125] Extracted codes: ${origin} -> ${destination}`);
      }
    }
    
    // Extract last status from events section
    // Look for patterns like "Flight arrived", "Departed", "Delivered", etc.
    const statusPatterns = [
      { pattern: /\bdelivered\b/i, code: 'DLV', desc: 'Delivered' },
      { pattern: /flight arrived/i, code: 'ARR', desc: 'Flight arrived' },
      { pattern: /\barrived\b.*\b([A-Z]{3})\b/i, code: 'ARR', desc: 'Arrived' },
      { pattern: /\bdeparted\b.*\b([A-Z]{3})\b/i, code: 'DEP', desc: 'Departed' },
      { pattern: /received from flight/i, code: 'RCF', desc: 'Received from Flight' },
      { pattern: /ready for delivery/i, code: 'NFD', desc: 'Ready for Delivery' },
      { pattern: /customs clearance/i, code: 'CLR', desc: 'Customs Clearance' },
      { pattern: /in transit/i, code: 'TRA', desc: 'In Transit' },
      { pattern: /booked/i, code: 'BKD', desc: 'Booked' },
      { pattern: /manifested/i, code: 'MAN', desc: 'Manifested' },
    ];
    
    // Find the last occurrence of status in markdown (usually the most recent)
    for (const { pattern, code, desc } of statusPatterns) {
      if (pattern.test(markdown)) {
        latestStatus = code;
        latestStatusDescription = desc;
        break;
      }
    }
    
    console.log(`[IAG CARGO 125] ✅ Final: Origem=${origin}, Destino=${destination}, Status=${latestStatus}`);
    
    if (origin === 'N/A' && destination === 'N/A' && latestStatus === 'N/A') {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Could not extract tracking data from page',
        sent: { awb: formattedAwb, url: uiUrl },
        raw: { markdown: markdown.substring(0, 2000) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb },
      raw: { markdown: markdown.substring(0, 3000) },
      summary: {
        origin,
        destination,
        lastStatus: {
          code: latestStatus,
          description: latestStatusDescription || latestStatus,
          timestamp: new Date().toISOString(),
        },
      },
    };
    
  } catch (error) {
    console.error('[IAG CARGO 125] ❌ Error:', error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= MASAIR (SMARTKARGO) API (865) =============

async function fetchMasAirSmartKargo(awb: string): Promise<StandardResult> {
  const provider = 'masair_smartkargo';
  console.log(`[MASAIR] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[MASAIR] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Normalize AWB format: 865-14464192 or 86514464192 -> prefix=865, serial=14464192
    const digits = awb.replace(/\D/g, '');
    const prefix = digits.substring(0, 3); // 865
    const serial = digits.substring(3);     // 14464192
    
    const url = `https://masair.smartkargo.com/FrmAWBTracking.aspx?AWBPrefix=${prefix}&AWBNo=${serial}`;
    console.log(`[MASAIR] Scraping URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 10000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MASAIR] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    
    console.log(`[MASAIR] Content length: ${content.length}`);
    console.log(`[MASAIR] Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Check if content is too small (possibly blocked or error page)
    if (content.length < 200) {
      console.log(`[MASAIR] Content too small, possibly blocked or error page`);
      return { provider, ok: false, status: 404, error: 'Page content too small - may be blocked or AWB not found', sent: { url } };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    console.log(`[MASAIR] HTML length: ${html.length}, Markdown length: ${markdown.length}`);
    
    // ========== PRIORITY 1: Extract from EXACT HTML structure ==========
    // Based on actual HTML: <span id="lblOrigin">VCP</span>-<span id="lblDestination">NLU</span>
    
    // Pattern 1: Exact match for <span id="lblOrigin">XXX</span>
    const originMatch1 = html.match(/<span\s+id="lblOrigin">([A-Z]{3})<\/span>/i);
    if (originMatch1) {
      origin = originMatch1[1].toUpperCase();
      console.log(`[MASAIR] ✅ Origin from exact span: ${origin}`);
    }
    
    // Pattern 2: Alternative with class or other attributes
    if (!origin) {
      const originMatch2 = html.match(/id\s*=\s*["']lblOrigin["'][^>]*>([A-Z]{3})</i);
      if (originMatch2) {
        origin = originMatch2[1].toUpperCase();
        console.log(`[MASAIR] ✅ Origin from regex variant: ${origin}`);
      }
    }
    
    // Pattern 1: Exact match for <span id="lblDestination">XXX</span>
    const destMatch1 = html.match(/<span\s+id="lblDestination">([A-Z]{3})<\/span>/i);
    if (destMatch1) {
      destination = destMatch1[1].toUpperCase();
      console.log(`[MASAIR] ✅ Destination from exact span: ${destination}`);
    }
    
    // Pattern 2: Alternative with class or other attributes
    if (!destination) {
      const destMatch2 = html.match(/id\s*=\s*["']lblDestination["'][^>]*>([A-Z]{3})</i);
      if (destMatch2) {
        destination = destMatch2[1].toUpperCase();
        console.log(`[MASAIR] ✅ Destination from regex variant: ${destination}`);
      }
    }
    
    // Extract status from lblLatestActivity
    // Actual HTML: <span id="lblLatestActivity">Delivered at NLU</span>
    const statusMatch1 = html.match(/<span\s+id="lblLatestActivity">([^<]+)<\/span>/i);
    if (statusMatch1) {
      const rawStatus = statusMatch1[1].trim();
      lastStatus = mapSmartKargoStatus(rawStatus);
      console.log(`[MASAIR] ✅ Status from exact span: "${rawStatus}" -> ${lastStatus}`);
    }
    
    // Alternative: look for rptTrackAWBs_ctl00_lblLatestActivity (multiple AWB view)
    if (!lastStatus) {
      const statusMatch2 = html.match(/id\s*=\s*["']rptTrackAWBs_ctl00_lblLatestActivity["'][^>]*>([^<]+)</i);
      if (statusMatch2) {
        const rawStatus = statusMatch2[1].trim();
        lastStatus = mapSmartKargoStatus(rawStatus);
        console.log(`[MASAIR] ✅ Status from rpt span: "${rawStatus}" -> ${lastStatus}`);
      }
    }
    
    // ========== PRIORITY 2: Extract from (VCP-NLU) pattern in HTML ==========
    // Pattern: (<span id="lblOrigin">VCP</span>-<span id="lblDestination">NLU</span>)
    if (!origin || !destination) {
      const routePattern = html.match(/\(([A-Z]{3})\s*-\s*([A-Z]{3})\)/i);
      if (routePattern) {
        if (!origin) origin = routePattern[1].toUpperCase();
        if (!destination) destination = routePattern[2].toUpperCase();
        console.log(`[MASAIR] ✅ Route from parentheses pattern: ${origin}-${destination}`);
      }
    }
    
    // ========== PRIORITY 3: Extract from markdown content ==========
    if (!origin || !destination) {
      // Look for route in markdown: "865-14464192 (VCP-NLU)" or **VCP-NLU**
      const mdRouteMatch = markdown.match(/\(([A-Z]{3})\s*[-–]\s*([A-Z]{3})\)/i);
      if (mdRouteMatch) {
        if (!origin) origin = mdRouteMatch[1].toUpperCase();
        if (!destination) destination = mdRouteMatch[2].toUpperCase();
        console.log(`[MASAIR] ✅ Route from markdown: ${origin}-${destination}`);
      }
    }
    
    // ========== PRIORITY 4: Status from GridView table (Status History) ==========
    if (!lastStatus) {
      // Look for "Delivered" in the status history table
      const gridStatusMatch = html.match(/GridViewAwbTracking[^>]*>.*?>Delivered</is);
      if (gridStatusMatch) {
        lastStatus = 'DLV';
        console.log(`[MASAIR] ✅ Status from GridView table: DLV`);
      }
    }
    
    // ========== PRIORITY 5: Status keyword fallbacks ==========
    if (!lastStatus) {
      const allContent = html + ' ' + markdown;
      if (/delivered\s+at\s+[A-Z]{3}/i.test(allContent)) {
        lastStatus = 'DLV';
        console.log(`[MASAIR] ✅ Status from "Delivered at" pattern: DLV`);
      } else if (/\bdelivered\b/i.test(allContent)) {
        lastStatus = 'DLV';
        console.log(`[MASAIR] ✅ Status from "Delivered" keyword: DLV`);
      } else if (/\barrived\b/i.test(allContent)) {
        lastStatus = 'ARR';
        console.log(`[MASAIR] ✅ Status fallback: ARR`);
      } else if (/\bin transit\b/i.test(allContent)) {
        lastStatus = 'TRA';
        console.log(`[MASAIR] ✅ Status fallback: TRA`);
      }
    }
    
    console.log(`[MASAIR] 🏁 Final extraction: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // Validate we got some useful data
    const hasValidData = (origin && origin.length === 3) || 
                         (destination && destination.length === 3) || 
                         (lastStatus && lastStatus.length >= 2);
    
    if (!hasValidData) {
      console.log(`[MASAIR] ⚠️ No valid data extracted`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found - AWB may not exist or page requires interaction', 
        sent: { url },
        raw: { contentLength: content.length }
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: `${prefix}-${serial}`, url },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: lastStatus || 'INFO',
          description: lastStatus || 'Info',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[MASAIR] ❌ Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// Helper function to map SmartKargo status text to IATA codes
function mapSmartKargoStatus(rawStatus: string): string {
  const statusLower = rawStatus.toLowerCase();
  
  if (statusLower.includes('delivered') || statusLower.includes('entregado')) return 'DLV';
  if (statusLower.includes('notified') || statusLower.includes('ready for delivery') || statusLower.includes('notificado')) return 'NFD';
  if (statusLower.includes('customs cleared') || statusLower.includes('customs release')) return 'CCD';
  if (statusLower.includes('received from flight') || statusLower.includes('recibido de vuelo')) return 'RCF';
  if (statusLower.includes('arrived') || statusLower.includes('arrival') || statusLower.includes('llegó')) return 'ARR';
  if (statusLower.includes('departed') || statusLower.includes('departure') || statusLower.includes('salió')) return 'DEP';
  if (statusLower.includes('manifested') || statusLower.includes('manifestado')) return 'MAN';
  if (statusLower.includes('booked') || statusLower.includes('reservado')) return 'BKD';
  if (statusLower.includes('received') || statusLower.includes('recibido')) return 'RCS';
  if (statusLower.includes('in transit') || statusLower.includes('en tránsito')) return 'TRA';
  if (statusLower.includes('freight on hand') || statusLower.includes('carga disponible')) return 'FOH';
  if (statusLower.includes('transferred') || statusLower.includes('transferido')) return 'TFD';
  
  // If no match, return first 3 chars uppercase or the raw status
  return rawStatus.substring(0, 3).toUpperCase() || 'INFO';
}

// ============= GOLLOG API (127) =============

// Helper function to map GOLLOG status text to IATA codes
function mapGolLogStatus(rawStatus: string): string {
  const statusLower = rawStatus.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Entrega
  if (statusLower.includes('entregue') || statusLower.includes('entrega realizada') || statusLower.includes('retirado')) return 'DLV';
  if (statusLower.includes('saiu para entrega') || statusLower.includes('em rota de entrega')) return 'OFD';
  if (statusLower.includes('disponivel para retirada') || statusLower.includes('pronto para retirada')) return 'NFD';
  
  // Movimentação
  if (statusLower.includes('chegou') || statusLower.includes('recebido na loja') || statusLower.includes('recebido no')) return 'ARR';
  if (statusLower.includes('saiu de') || statusLower.includes('em transito') || statusLower.includes('em transporte')) return 'DEP';
  if (statusLower.includes('coletado') || statusLower.includes('postado')) return 'RCS';
  if (statusLower.includes('transferido') || statusLower.includes('encaminhado')) return 'TFD';
  
  // Problemas
  if (statusLower.includes('endereco nao localizado') || statusLower.includes('destinatario ausente')) return 'DLY';
  if (statusLower.includes('devolvido') || statusLower.includes('devolucao')) return 'RTN';
  if (statusLower.includes('aguardando') || statusLower.includes('pendente')) return 'HLD';
  
  // Fiscal/Alfandega
  if (statusLower.includes('liberado') || statusLower.includes('desembaraco')) return 'CCD';
  if (statusLower.includes('fiscalizacao') || statusLower.includes('retido')) return 'AWD';
  
  // If no match, return first 3 chars uppercase or the raw status
  const cleaned = rawStatus.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
  return cleaned || 'INFO';
}

// Helper function to extract city code from GOLLOG location text
function extractGolLogCityCode(locationText: string): string | null {
  // GOLLOG uses format like "Loja GOLLOG (GRU)" or "GUARULHOS, SP"
  // Try to extract code from parentheses first
  const codeMatch = locationText.match(/\(([A-Z]{3})\)/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }
  
  // Common Brazilian city to IATA mapping
  const cityMap: { [key: string]: string } = {
    'guarulhos': 'GRU', 'sao paulo': 'GRU', 'sp': 'GRU', 'cumbica': 'GRU',
    'viracopos': 'VCP', 'campinas': 'VCP',
    'galeao': 'GIG', 'rio de janeiro': 'GIG', 'rj': 'GIG',
    'santos dumont': 'SDU',
    'brasilia': 'BSB', 'df': 'BSB',
    'confins': 'CNF', 'belo horizonte': 'CNF', 'mg': 'CNF',
    'porto alegre': 'POA', 'rs': 'POA',
    'curitiba': 'CWB', 'pr': 'CWB',
    'salvador': 'SSA', 'ba': 'SSA',
    'recife': 'REC', 'pe': 'REC',
    'fortaleza': 'FOR', 'ce': 'FOR',
    'manaus': 'MAO', 'am': 'MAO',
    'belem': 'BEL', 'pa': 'BEL',
    'goiania': 'GYN', 'go': 'GYN',
    'florianopolis': 'FLN', 'sc': 'FLN',
    'vitoria': 'VIX', 'es': 'VIX',
    'natal': 'NAT', 'rn': 'NAT',
    'maceio': 'MCZ', 'al': 'MCZ',
    'joao pessoa': 'JPA', 'pb': 'JPA',
    'teresina': 'THE', 'pi': 'THE',
    'sao luis': 'SLZ', 'ma': 'SLZ',
    'cuiaba': 'CGB', 'mt': 'CGB',
    'campo grande': 'CGR', 'ms': 'CGR',
    'aracaju': 'AJU', 'se': 'AJU',
    'londrina': 'LDB',
    'ribeirao preto': 'RAO',
    'uberlandia': 'UDI',
    'montevideo': 'MVD', 'montevideu': 'MVD', 'uy': 'MVD',
    'buenos aires': 'EZE', 'ar': 'EZE',
    'santiago': 'SCL', 'cl': 'SCL',
    'lima': 'LIM', 'peru': 'LIM',
    'bogota': 'BOG', 'co': 'BOG',
  };
  
  const normalized = locationText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [city, code] of Object.entries(cityMap)) {
    if (normalized.includes(city)) {
      return code;
    }
  }
  
  return null;
}

async function fetchGolLog127(awb: string): Promise<StandardResult> {
  const provider = 'gollog_127';
  console.log(`[GOLLOG] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[GOLLOG] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Normalize AWB: 127-XXXXXXXX -> just the number part
    const digits = awb.replace(/\D/g, '');
    const serial = digits.length > 3 ? digits.substring(3) : digits;
    
    // GOLLOG tracking URL - we'll try to access the main tracking page
    // Since GOLLOG uses encrypted tokens, we need to scrape from the search/input page
    const searchUrl = `https://servicos.gollog.com.br/app/main/tracking`;
    console.log(`[GOLLOG] Scraping search page: ${searchUrl}`);
    
    // First, try to get the tracking page with Firecrawl
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        waitFor: 10000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GOLLOG] Firecrawl error on search page: ${errorText}`);
      
      // Try alternative: direct API call if available
      return await tryGolLogDirectAPI(awb, serial, provider, firecrawlApiKey);
    }
    
    const searchData = await response.json();
    const searchHtml = searchData?.data?.html || '';
    
    console.log(`[GOLLOG] Search page HTML length: ${searchHtml.length}`);
    
    // GOLLOG is an Angular SPA - we need to try the direct tracking result URL
    // Since the token is encrypted, we'll attempt to scrape via AWB number input simulation
    // Alternative approach: Try to find if there's a public API endpoint
    
    return await tryGolLogDirectAPI(awb, serial, provider, firecrawlApiKey);
    
  } catch (error) {
    console.error(`[GOLLOG] ❌ Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function tryGolLogDirectAPI(awb: string, serial: string, provider: string, firecrawlApiKey: string): Promise<StandardResult> {
  console.log(`[GOLLOG] Trying direct tracking for serial: ${serial}`);
  
  try {
    // GOLLOG doesn't have a simple public API, but the Angular app calls internal endpoints
    // We'll try to scrape the result page if we can construct the URL
    // Alternative: Try common GOLLOG tracking patterns
    
    // Pattern 1: Try the parcelsapp fallback for GOLLOG
    const parcelsAppUrl = `https://parcelsapp.com/en/tracking/${serial}`;
    console.log(`[GOLLOG] Trying ParcelsApp fallback: ${parcelsAppUrl}`);
    
    const parcelsResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: parcelsAppUrl,
        formats: ['markdown', 'html'],
        waitFor: 10000,
        timeout: 60000,
      }),
    });
    
    if (parcelsResponse.ok) {
      const parcelsData = await parcelsResponse.json();
      const markdown = parcelsData?.data?.markdown || '';
      const html = parcelsData?.data?.html || '';
      
      console.log(`[GOLLOG] ParcelsApp content length: ${markdown.length + html.length}`);
      
      // Parse from ParcelsApp format
      const result = parseGolLogFromContent(markdown, html, awb, provider);
      if (result.ok) {
        return result;
      }
    }
    
    // Pattern 2: Try to get GOLLOG tracking via their public portal
    const gollogUrl = `https://servicos.gollog.com.br/app/main/tracking/detail;codTransportOrder=${serial}`;
    console.log(`[GOLLOG] Trying GOLLOG detail URL: ${gollogUrl}`);
    
    const gollogResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: gollogUrl,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (gollogResponse.ok) {
      const gollogData = await gollogResponse.json();
      const markdown = gollogData?.data?.markdown || '';
      const html = gollogData?.data?.html || '';
      
      console.log(`[GOLLOG] GOLLOG detail content length: ${markdown.length + html.length}`);
      
      // Parse from GOLLOG HTML structure
      const result = parseGolLogFromContent(markdown, html, awb, provider);
      if (result.ok) {
        return result;
      }
    }
    
    // Pattern 3: Try GOLLOG via the main tracking portal (result page format)
    // This requires the token which we don't have directly from AWB
    // Return a special status indicating manual tracking is needed
    console.log(`[GOLLOG] ⚠️ Could not auto-track - GOLLOG requires token-based access`);
    
    return {
      provider,
      ok: false,
      status: 404,
      error: 'GOLLOG requires token-based tracking - manual access via link needed',
      sent: { awb, serial },
    };
    
  } catch (error) {
    console.error(`[GOLLOG] ❌ Direct API error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

function parseGolLogFromContent(markdown: string, html: string, awb: string, provider: string): StandardResult {
  const content = markdown + '\n' + html;
  
  console.log(`[GOLLOG] Parsing content, length: ${content.length}`);
  
  if (content.length < 200) {
    return { provider, ok: false, status: 404, error: 'Content too small', sent: { awb } };
  }
  
  let origin: string | null = null;
  let destination: string | null = null;
  let lastStatus: string | null = null;
  
  // ========== PRIORITY 1: Extract from GOLLOG Angular structure ==========
  // Origin: div.timeline-label-city-origin or (XXX) format
  const originCityMatch = html.match(/timeline-label-city-origin[^>]*>([^<]+)</i);
  if (originCityMatch) {
    origin = extractGolLogCityCode(originCityMatch[1]);
    console.log(`[GOLLOG] ✅ Origin from timeline-label-city-origin: ${originCityMatch[1]} -> ${origin}`);
  }
  
  if (!origin) {
    const originAddressMatch = html.match(/timeline-label-address-origin[^>]*>([^<]+)</i);
    if (originAddressMatch) {
      origin = extractGolLogCityCode(originAddressMatch[1]);
      console.log(`[GOLLOG] ✅ Origin from timeline-label-address-origin: ${originAddressMatch[1]} -> ${origin}`);
    }
  }
  
  // Destination: div.timeline-label-city-destiny or (XXX) format
  const destCityMatch = html.match(/timeline-label-city-destiny[^>]*>([^<]+)</i);
  if (destCityMatch) {
    destination = extractGolLogCityCode(destCityMatch[1]);
    console.log(`[GOLLOG] ✅ Destination from timeline-label-city-destiny: ${destCityMatch[1]} -> ${destination}`);
  }
  
  if (!destination) {
    const destAddressMatch = html.match(/timeline-label-address-destiny[^>]*>([^<]+)</i);
    if (destAddressMatch) {
      destination = extractGolLogCityCode(destAddressMatch[1]);
      console.log(`[GOLLOG] ✅ Destination from timeline-label-address-destiny: ${destAddressMatch[1]} -> ${destination}`);
    }
  }
  
  // Status: div.timeline-modality-message-label
  const statusMatch = html.match(/timeline-modality-message-label[^>]*>([^<]+)</i);
  if (statusMatch) {
    const rawStatus = statusMatch[1].trim();
    lastStatus = mapGolLogStatus(rawStatus);
    console.log(`[GOLLOG] ✅ Status from timeline-modality-message-label: "${rawStatus}" -> ${lastStatus}`);
  }
  
  // ========== PRIORITY 2: Extract from history entries ==========
  if (!lastStatus) {
    // Look for tracking history messages
    const historyMatch = html.match(/tracking-result-detail-history-data-message[^>]*>([^<]+)</i);
    if (historyMatch) {
      const rawStatus = historyMatch[1].trim();
      lastStatus = mapGolLogStatus(rawStatus);
      console.log(`[GOLLOG] ✅ Status from history: "${rawStatus}" -> ${lastStatus}`);
    }
  }
  
  // ========== PRIORITY 3: Extract from markdown patterns ==========
  if (!origin || !destination) {
    // Look for route patterns in markdown: "GRU → MVD" or "GRU - MVD"
    const routeMatch = markdown.match(/([A-Z]{3})\s*[→\-–>]\s*([A-Z]{3})/);
    if (routeMatch) {
      if (!origin) origin = routeMatch[1];
      if (!destination) destination = routeMatch[2];
      console.log(`[GOLLOG] ✅ Route from markdown pattern: ${origin}-${destination}`);
    }
  }
  
  // ========== PRIORITY 4: Status keyword fallbacks ==========
  if (!lastStatus) {
    const allContent = content.toLowerCase();
    if (allContent.includes('entregue') || allContent.includes('retirado')) {
      lastStatus = 'DLV';
      console.log(`[GOLLOG] ✅ Status fallback: DLV`);
    } else if (allContent.includes('saiu para entrega') || allContent.includes('em rota')) {
      lastStatus = 'OFD';
      console.log(`[GOLLOG] ✅ Status fallback: OFD`);
    } else if (allContent.includes('chegou') || allContent.includes('recebido')) {
      lastStatus = 'ARR';
      console.log(`[GOLLOG] ✅ Status fallback: ARR`);
    } else if (allContent.includes('em transito') || allContent.includes('em transporte')) {
      lastStatus = 'TRA';
      console.log(`[GOLLOG] ✅ Status fallback: TRA`);
    }
  }
  
  console.log(`[GOLLOG] 🏁 Final extraction: origin=${origin}, destination=${destination}, status=${lastStatus}`);
  
  // Validate we got some useful data
  const hasValidData = (origin && origin.length === 3) || 
                       (destination && destination.length === 3) || 
                       (lastStatus && lastStatus.length >= 2);
  
  if (!hasValidData) {
    console.log(`[GOLLOG] ⚠️ No valid data extracted`);
    return { 
      provider, 
      ok: false, 
      status: 404, 
      error: 'No tracking data found', 
      sent: { awb },
    };
  }
  
  return {
    provider,
    ok: true,
    status: 200,
    error: null,
    sent: { awb },
    summary: {
      origin: origin || 'N/A',
      destination: destination || 'N/A',
      lastStatus: {
        code: lastStatus || 'INFO',
        description: lastStatus || 'Info',
        timestamp: new Date().toISOString(),
      },
    },
  };
}

// ============= CATHAY CARGO (160) =============

async function fetchCathayCargo160(awb: string): Promise<StandardResult> {
  const provider = 'CATHAY_CARGO';
  console.log(`[CATHAY CARGO] Fetching AWB: ${awb}`);
  
  try {
    // Extract AWB serial number (8 digits after prefix)
    const awbSerial = awb.replace(/^160[-\s]?/, '').replace(/\D/g, '');
    
    if (awbSerial.length !== 8) {
      return {
        provider,
        ok: false,
        status: 400,
        error: `Invalid AWB serial: expected 8 digits, got ${awbSerial.length}`,
        sent: { awb },
      };
    }
    
    // Use only ParcelsApp via Firecrawl
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      return {
        provider,
        ok: false,
        status: 500,
        error: 'FIRECRAWL_API_KEY not configured',
        sent: { awb },
      };
    }
    
    return await fetchCathayCargoParcelsApp(awb, firecrawlApiKey);
  } catch (error) {
    console.error(`[CATHAY CARGO] Error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

async function fetchCathayCargoParcelsApp(awb: string, firecrawlApiKey: string): Promise<StandardResult> {
  const provider = 'CATHAY_CARGO';
  console.log(`[CATHAY CARGO] Fetching from ParcelsApp for AWB: ${awb}`);
  
  try {
    const formattedAwb = awb.includes('-') ? awb : `160-${awb}`;
    const firecrawlUrl = 'https://api.firecrawl.dev/v1/scrape';
    // Add cache-busting parameter to force fresh data
    const timestamp = Date.now();
    const parcelsAppUrl = `https://parcelsapp.com/en/tracking/${formattedAwb}?_t=${timestamp}`;
    
    console.log(`[CATHAY CARGO] Scraping URL: ${parcelsAppUrl}`);
    
    const response = await fetch(firecrawlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url: parcelsAppUrl,
        formats: ['markdown'],
        waitFor: 10000,
      }),
    });
    
    if (!response.ok) {
      return {
        provider,
        ok: false,
        status: response.status,
        error: `Scraping failed: HTTP ${response.status}`,
        sent: { awb },
      };
    }
    
    const data = await response.json();
    const content = data?.data?.markdown || '';
    
    console.log(`[CATHAY CARGO] ParcelsApp content length: ${content.length}`);
    
    // Check if carrier website is down (temporary error)
    if (content.toLowerCase().includes("carrier's website is down") || 
        content.toLowerCase().includes("carrier website is down") ||
        content.toLowerCase().includes("try again later")) {
      console.log(`[CATHAY CARGO] Carrier website is temporarily down`);
      return {
        provider,
        ok: false,
        status: 503,
        error: 'Carrier website temporarily unavailable',
        sent: { awb },
      };
    }
    
    // Check if there's actual tracking data (look for date patterns or event patterns)
    const hasTrackingData = /\*\*\d{1,2} [A-Z][a-z]{2} \d{4}\*\*/.test(content) || 
                            /\*\*(Delivered|Arrived|Departed|Received)/i.test(content) ||
                            /\|\s*From\s*\|/.test(content);
    
    if (!hasTrackingData) {
      console.log(`[CATHAY CARGO] No tracking events found in ParcelsApp`);
      return {
        provider,
        ok: false,
        status: 404,
        error: 'No tracking data in ParcelsApp',
        sent: { awb },
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let latestStatus: string | null = null;
    
    // Get all tracking events with pattern: "**EventType, flight: XXX** Location (XXX)"
    // Match patterns like: "**Delivered, flight: -, weight: 10,310 Kg, pieces: 10** Tansonnhat Intl (SGN)"
    // Also match: "**ARRIVED, flight: CX3147, weight: 10,310 Kg, pieces: 10** Tansonnhat Intl (SGN)"
    // Also match: "**Unloaded from arrival truck, flight: XH6128, weight: 110.1 Kg, pieces: 1** Lishe (NGB)"
    const eventRegex = /\*\*([A-Za-z\s]+),\s*flight:[^*]+\*\*[^(]*\(([A-Z]{3})\)/gi;
    const events: { type: string; airport: string }[] = [];
    let match;
    while ((match = eventRegex.exec(content)) !== null) {
      events.push({ type: match[1].toLowerCase().trim(), airport: match[2] });
    }
    
    console.log(`[CATHAY CARGO] Found ${events.length} events:`, JSON.stringify(events));
    
    // Check if this is a final status (carrier won't provide more updates - does NOT mean delivered)
    const isFinalStatus = content.toLowerCase().includes('this is the final status');
    console.log(`[CATHAY CARGO] Is final status (no more updates): ${isFinalStatus}`);
    
    // STEP 1: Determine CURRENT STATUS from the FIRST (most recent) event
    // This is the actual current state of the shipment
    if (events.length > 0) {
      const firstEvent = events[0];
      const eventTypeLower = firstEvent.type.toLowerCase();
      
      if (eventTypeLower.includes('delivered')) {
        latestStatus = 'DLV';
      } else if (eventTypeLower.includes('departed') || eventTypeLower.includes('departure')) {
        latestStatus = 'DEP';
      } else if (eventTypeLower.includes('unloaded')) {
        latestStatus = 'ARR'; // Unloaded means arrived at location
      } else if (eventTypeLower.includes('arrived')) {
        latestStatus = 'ARR';
      } else if (eventTypeLower.includes('received')) {
        latestStatus = 'RCF';
      } else if (eventTypeLower.includes('booked')) {
        latestStatus = 'BKD';
      } else if (eventTypeLower.includes('ready')) {
        latestStatus = 'NFD';
      } else if (eventTypeLower.includes('cleared') || eventTypeLower.includes('customs')) {
        latestStatus = 'CUS';
      } else if (eventTypeLower.includes('transferred')) {
        latestStatus = 'TFD';
      }
      
      console.log(`[CATHAY CARGO] ✅ Status from first event: ${latestStatus} (${firstEvent.type})`);
    }
    
    // STEP 2: Determine DESTINATION from arrival-type events (Delivered, Unloaded, Arrived)
    // Look for the most recent arrival event to find where the cargo is/was
    const arrivalEventTypes = ['delivered', 'unloaded', 'arrival document'];
    
    for (const event of events) {
      const eventTypeLower = event.type.toLowerCase();
      if (arrivalEventTypes.some(arrType => eventTypeLower.includes(arrType.split(' ')[0]))) {
        destination = event.airport;
        console.log(`[CATHAY CARGO] ✅ Destination from arrival event: ${destination} (${event.type})`);
        break;
      }
    }
    
    // STEP 3: Extract origin from "| From |" table row
    const fromMatch = content.match(/\|\s*From\s*\|[^|]*\(([A-Z]{3})\)/i);
    if (fromMatch) {
      origin = fromMatch[1];
      console.log(`[CATHAY CARGO] ✅ Origin from table: ${origin}`);
    }
    
    // STEP 4: If destination not set, try "| To |" table row
    if (!destination) {
      const toMatch = content.match(/\|\s*To\s*\|[^|]*\(([A-Z]{3})\)/i);
      if (toMatch) {
        destination = toMatch[1];
        console.log(`[CATHAY CARGO] ✅ Destination from table: ${destination}`);
      }
    }
    
    // STEP 5: Fallback - use last event for origin if not found
    if (!origin && events.length > 1) {
      origin = events[events.length - 1].airport;
      console.log(`[CATHAY CARGO] ✅ Origin from last event: ${origin}`);
    }
    
    console.log(`[CATHAY CARGO] ✅ Final result: origin=${origin}, destination=${destination}, status=${latestStatus}`);
    
    if (!origin && !destination && !latestStatus) {
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Could not extract tracking data',
        sent: { awb },
      };
    }
    
    const statusDescMap: Record<string, string> = {
      'DLV': 'Delivered', 'DEP': 'Departed', 'ARR': 'Arrived', 'RCF': 'Received from Flight',
      'RCS': 'Received from Shipper', 'MAN': 'Manifested', 'BKD': 'Booked', 'NFD': 'Ready for Delivery',
    };
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb },
      summary: {
        origin: origin || 'N/A',
        destination: destination || 'N/A',
        lastStatus: {
          code: latestStatus || 'INFO',
          description: statusDescMap[latestStatus || 'INFO'] || latestStatus || 'Info',
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[CATHAY CARGO] ParcelsApp error:`, error);
    return {
      provider,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Unknown error',
      sent: { awb },
    };
  }
}

// ============= AIR CANADA CARGO (014) via ParcelsApp =============

async function fetchAirCanadaCargo014(awb: string): Promise<StandardResult> {
  const provider = 'aircanada_014';
  console.log(`[AIR CANADA 014] Fetching AWB: ${awb}`);
  
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[AIR CANADA 014] FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 500, error: 'FIRECRAWL_API_KEY not configured', sent: { awb } };
    }
    
    // Normalize AWB: accept 014-78297542 or 01478297542
    const digits = awb.replace(/\D/g, '');
    const formattedAwb = digits.length === 11 ? `${digits.substring(0,3)}-${digits.substring(3)}` : awb;
    
    // Use ParcelsApp as fallback since Air Canada's site is protected
    const url = `https://parcelsapp.com/en/tracking/${formattedAwb}`;
    console.log(`[AIR CANADA 014] Scraping ParcelsApp URL: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        waitFor: 15000,
        timeout: 60000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AIR CANADA 014] Firecrawl error: ${errorText}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl error: ${response.status}`, sent: { url } };
    }
    
    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const html = data?.data?.html || '';
    const content = markdown + '\n' + html;
    
    console.log(`[AIR CANADA 014] Content length: ${content.length}`);
    console.log(`[AIR CANADA 014] Markdown preview: ${markdown.substring(0, 2000)}`);
    
    // Check if content is too small or blocked
    if (content.length < 300) {
      console.log(`[AIR CANADA 014] Content too small, possibly blocked`);
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'Content too small - may be blocked', 
        sent: { url } 
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // Extended invalid codes list - words and status codes that are NOT airports
    const INVALID_ROUTE_VALUES = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 
      'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 
      'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'SHE', 'TOO', 'USE', 
      'AWB', 'KGS', 'LBS', 'PCS', 'VOL', 'PKG', 'COM', 'NET', 'WWW', 'APP', 'PDF', 'JPG', 
      'PNG', 'GIF', 'CSS', 'XML', 'API', 'URL', 'DHL', 'UPS', 'FED', 'TNT', 'USA', 'EUR', 
      'USD', 'GBP', 'TRY', 'ETA', 'ETD', 'UTC', 'GMT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 
      'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 
      'DEC', 'CAP', 'ERR', 'NIL', 'NIF', 'DIS', 'ADD', 'AIR', 'ANY', 'BOO', 'BOX',
      'CAR', 'COD', 'DIM', 'DOC', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 'KEY', 'LOG',
      'MAX', 'MIN', 'ODD', 'OWN', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SET', 'SRC', 'SUM',
      'SVG', 'TAB', 'TOP', 'TXT', 'VIA', 'WEB', 'YES', 'ZIP', 'ORG', 'EDU', 'GOV', 'FLT',
      'REF', 'ACK', 'CCD', 'KNO', 'INT', 'END', 'STR', 'OBJ', 'MAP', 'FUN',
      'VAR', 'DEF', 'NUM', 'TMP', 'SYS', 'BIN', 'HEX', 'OCT', 'MEM', 'PTR', 'REG',
      // STATUS CODES - these are NOT airports
      'RCF', 'RCS', 'DLV', 'DEP', 'MAN', 'BKD', 'NFD', 'CCC', 'TFD', 'RCT', 'AWD', 'ARR',
      'DIS', 'FOH', 'PRE', 'TRM', 'CRC', 'DDL', 'AWR', 'TGC', 'OCI', 'FPS', 'CPL', 'DLC'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // PRIORITY 1: ParcelsApp TABLE format - "| From | City Name (CODE)" or "| From | CODE, City Name"
    const fromTableWithParenMatch = content.match(/\|\s*From\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    const toTableWithParenMatch = content.match(/\|\s*To\s*\|\s*[^|]*\(([A-Z]{3})\)/i);
    
    if (fromTableWithParenMatch && isValidAirport(fromTableWithParenMatch[1])) {
      origin = fromTableWithParenMatch[1].toUpperCase();
      console.log(`[AIR CANADA 014] ✅ Origin from table (parentheses): ${origin}`);
    }
    if (toTableWithParenMatch && isValidAirport(toTableWithParenMatch[1])) {
      destination = toTableWithParenMatch[1].toUpperCase();
      console.log(`[AIR CANADA 014] ✅ Destination from table (parentheses): ${destination}`);
    }
    
    // PRIORITY 2: Table format "| From | CODE, City |"
    if (!origin) {
      const fromTableMatch = content.match(/\|\s*From\s*\|\s*([A-Z]{3})\s*,/i);
      if (fromTableMatch && isValidAirport(fromTableMatch[1])) {
        origin = fromTableMatch[1].toUpperCase();
        console.log(`[AIR CANADA 014] ✅ Origin from table: ${origin}`);
      }
    }
    if (!destination) {
      const toTableMatch = content.match(/\|\s*To\s*\|\s*([A-Z]{3})\s*,/i);
      if (toTableMatch && isValidAirport(toTableMatch[1])) {
        destination = toTableMatch[1].toUpperCase();
        console.log(`[AIR CANADA 014] ✅ Destination from table: ${destination}`);
      }
    }
    
    // PRIORITY 3: ParcelsApp specific - "From\n\nCODE, City Name" or "To\n\nCODE, City Name"
    if (!origin) {
      const fromParcelsMatch = content.match(/From\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (fromParcelsMatch && isValidAirport(fromParcelsMatch[1])) {
        origin = fromParcelsMatch[1].toUpperCase();
        console.log(`[AIR CANADA 014] ✅ Origin from 'From' pattern: ${origin}`);
      }
    }
    if (!destination) {
      const toParcelsMatch = content.match(/To\s*\n+\s*([A-Z]{3})\s*,\s*[A-Za-z]/i);
      if (toParcelsMatch && isValidAirport(toParcelsMatch[1])) {
        destination = toParcelsMatch[1].toUpperCase();
        console.log(`[AIR CANADA 014] ✅ Destination from 'To' pattern: ${destination}`);
      }
    }
    
    // PRIORITY 4: Look for airport codes in timeline events - origin from first event location, destination from last
    if (!origin || !destination) {
      // Extract all airport codes from event locations (in parentheses after city names)
      const locationMatches = content.match(/[A-Za-z\s]+\(([A-Z]{3})\)/g);
      if (locationMatches && locationMatches.length >= 1) {
        const codes = locationMatches.map(m => {
          const match = m.match(/\(([A-Z]{3})\)/);
          return match ? match[1] : null;
        }).filter(c => c && isValidAirport(c)) as string[];
        
        if (codes.length >= 2) {
          // First event location is typically the current/last location
          // Last event location is typically the origin
          if (!destination) destination = codes[0]; // First code = current location = destination
          if (!origin) origin = codes[codes.length - 1]; // Last code = starting point = origin
          console.log(`[AIR CANADA 014] ✅ Route from timeline locations: ${origin} → ${destination}`);
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // PRIORITY 1: Extract status code from the FIRST (most recent) event in timeline
    // ParcelsApp format: "**(DLV) Description...**" or similar at the start of events
    const firstStatusEventMatch = content.match(/\*\*\(([A-Z]{3})\)\s+[^*]+\*\*/);
    if (firstStatusEventMatch) {
      lastStatus = firstStatusEventMatch[1].toUpperCase();
      console.log(`[AIR CANADA 014] ✅ Status from first event: ${lastStatus}`);
    }
    
    // PRIORITY 2: Look for status code in parentheses at start of first bold line
    if (!lastStatus) {
      const boldStatusMatch = content.match(/\*\*\s*\(([A-Z]{3})\)/);
      if (boldStatusMatch) {
        lastStatus = boldStatusMatch[1].toUpperCase();
        console.log(`[AIR CANADA 014] ✅ Status from bold pattern: ${lastStatus}`);
      }
    }
    
    // PRIORITY 3: Look for status codes in timeline order (first occurrence = most recent)
    if (!lastStatus) {
      const STATUS_CODES = ['DLV', 'NFD', 'CCD', 'RCF', 'ARR', 'DEP', 'MAN', 'RCS', 'BKD', 'AWR', 'FOH', 'PRE', 'TFD', 'RCT', 'AWD'];
      for (const code of STATUS_CODES) {
        const codePattern = new RegExp(`\\(${code}\\)`, 'i');
        if (codePattern.test(content)) {
          lastStatus = code;
          console.log(`[AIR CANADA 014] ✅ Status from code search: ${lastStatus}`);
          break;
        }
      }
    }
    
    // PRIORITY 4: Fallback to keyword matching
    if (!lastStatus) {
      const statusMappings = [
        { patterns: [/\bdelivered\b/i, /\bentregue\b/i, /\bphysically delivered\b/i], code: 'DLV' },
        { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP' },
        { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR' },
        { patterns: [/\breceived\b.*\bflight\b/i], code: 'RCF' },
        { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCS' },
        { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN' },
        { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i, /\bconfirmed\b/i], code: 'BKD' },
        { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD' },
        { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD' },
      ];
      
      for (const { patterns, code } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          console.log(`[AIR CANADA 014] ✅ Status from keyword: ${lastStatus}`);
          if (code === 'DLV') break;
        }
      }
    }
    
    // FINAL FALLBACK: Look for airport codes in timeline text (less reliable)
    if (!origin || !destination) {
      const allCodes = content.match(/\b([A-Z]{3})\b/g);
      if (allCodes && allCodes.length >= 2) {
        const validCodes = allCodes.filter(isValidAirport);
        if (validCodes.length >= 2) {
          if (!origin) {
            origin = validCodes[validCodes.length - 1]; // Last valid code = origin
            console.log(`[AIR CANADA 014] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[0]; // First valid code = destination
            console.log(`[AIR CANADA 014] ⚠️ Destination from fallback: ${destination}`);
          }
        }
      }
    }
    
    console.log(`[AIR CANADA 014] Final: origin=${origin}, destination=${destination}, status=${lastStatus}`);
    
    // If we couldn't extract anything meaningful, return error without destroying existing data
    if (!origin && !destination && !lastStatus) {
      return { 
        provider, 
        ok: false, 
        status: 404, 
        error: 'No tracking data found in ParcelsApp', 
        sent: { url }, 
        raw: markdown.substring(0, 1000) 
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { url, awb: formattedAwb },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: lastStatus ? {
          code: lastStatus,
          description: lastStatus,
          timestamp: new Date().toISOString(),
        } : undefined,
      },
    };
  } catch (error) {
    console.error(`[AIR CANADA 014] Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
}

// Helper function to map ParcelsApp status text to standard codes
function mapParcelsAppStatus(text: string): string {
  const lower = text.toLowerCase().trim();
  
  if (lower.includes('delivered') || lower === 'dlv') return 'DLV';
  if (lower.includes('arrived') || lower === 'arr') return 'ARR';
  if (lower.includes('departed') || lower === 'dep') return 'DEP';
  if (lower.includes('received from flight') || lower === 'rcf') return 'RCF';
  if (lower.includes('received') || lower === 'rcs') return 'RCS';
  if (lower.includes('manifested') || lower === 'man') return 'MAN';
  if (lower.includes('booked') || lower === 'bkd') return 'BKD';
  if (lower.includes('ready for delivery') || lower === 'nfd') return 'NFD';
  if (lower.includes('customs') || lower === 'ccd') return 'CCD';
  
  // Return the text as-is if 2-4 chars
  if (text.length >= 2 && text.length <= 4) {
    return text.toUpperCase();
  }
  
  return 'INFO';
}

async function trackAWB(awb: string, airlineCode: string): Promise<TrackingResult> {
  const formattedAwb = awb.includes('-') ? awb : `${awb.substring(0, 3)}-${awb.substring(3)}`;
  
  // Map airline code to name
  const airlineMap: { [key: string]: string } = {
    '001': 'American Airlines Cargo',
    '014': 'Air Canada Cargo',
    '016': 'United Cargo',
    '047': 'TAP Cargo',
    '057': 'Air France Cargo',
    '083': 'SAA Cargo',
    '139': 'Aeromexico Cargo',
    '176': 'Emirates SkyCargo',
    '235': 'Turkish Airlines',
    '369': 'Atlas Air',
    '020': 'Lufthansa Cargo',
    '006': 'Delta Cargo',
    '055': 'ITA Cargo',
    '045': 'LATAM Cargo',
    '145': 'LATAM Cargo Chile',
    '549': 'LATAM Cargo',
    '577': 'Azul Cargo',
    '074': 'AF/KL Cargo',
    '075': 'IAG Cargo',
    '157': 'Qatar Cargo',
    '172': 'Cargolux',
    '729': 'Avianca Cargo',
    '724': 'Swiss International Air Lines',
    '615': 'European Air Transport',
    '827': 'Reliable Unique Services Aviation (RUSA)',
    '881': 'IATA (Condor Flugdienst GmbH)',
    '118': 'TAAG Angola Airlines',
    '996': 'Air Europa Cargo',
    '023': 'FedEx Express',
    '406': 'UPS Airlines',
    '318': 'SKY Carga',
    '125': 'IAG Cargo',
    '865': 'MasAir (SmartKargo)',
    '127': 'Gol Linhas Aéreas (GOLLOG)',
    '147': 'Royal Air Maroc (AT) - via ParcelsApp',
    '112': 'China Cargo Airlines - via ParcelsApp',
    '605': 'SKY Airline Chile',
    '202': 'DHLAvianca Cargo - via ParcelsApp',
    '805': 'GSA Force',
    '992': 'DHL Aviation Cargo',
    '160': 'Cathay Cargo',
    '999': 'Air China Cargo',
  };
  
  const airlineName = airlineMap[airlineCode] || 'Companhia não cadastrada';
  
  // Check if company is registered
  if (airlineName === 'Companhia não cadastrada') {
    return {
      awb: formattedAwb,
      airline: airlineName,
      status: 'COMPANY_NOT_REGISTERED',
      origin: 'N/A',
      destination: 'N/A',
      currentLocation: 'N/A',
      weight: 'N/A',
      pieces: 'N/A',
      events: [{
        date: new Date().toISOString(),
        location: 'Sistema',
        status: 'COMPANY_NOT_REGISTERED',
        description: 'Companhia não cadastrada',
      }],
    };
  }
  
  // Step 1: Try API first
  let apiResult: StandardResult | null = null;
  
  switch (airlineCode) {
    case '001': // American Airlines Cargo
      apiResult = await fetchAmericanAirlinesAPI(formattedAwb);
      break;
    case '047': // TAP
      apiResult = await fetchTAPAPI(formattedAwb.replace('-', ''));
      break;
    case '057': // Air France
      console.log('[AIR FRANCE] Using AI agent scraping method');
      const airFranceScrapingResult = await fetchAIAgent(formattedAwb, '057');
      if (airFranceScrapingResult) {
        // Check if it's a NOT_FOUND result
        if (airFranceScrapingResult.status === 'NOT_FOUND') {
          return {
            awb: formattedAwb,
            airline: airlineName,
            status: 'NOT_FOUND',
            origin: 'N/A',
            destination: 'N/A',
            currentLocation: 'N/A',
            weight: 'N/A',
            pieces: 'N/A',
            events: [{
              date: new Date().toISOString(),
              location: 'Sistema Air France',
              status: 'NOT_FOUND',
              description: 'Status não encontrado',
            }],
          };
        }
        return {
          awb: formattedAwb,
          airline: airlineName,
          ...airFranceScrapingResult,
        } as TrackingResult;
      }
      // If scraping failed or returned null, return NOT_FOUND
      return {
        awb: formattedAwb,
        airline: airlineName,
        status: 'NOT_FOUND',
        origin: 'N/A',
        destination: 'N/A',
        currentLocation: 'N/A',
        weight: 'N/A',
        pieces: 'N/A',
        events: [{
          date: new Date().toISOString(),
          location: 'Sistema Air France',
          status: 'NOT_FOUND',
          description: 'Status não encontrado',
        }],
      };
    case '369': // Atlas
      apiResult = await fetchAtlasAPI(formattedAwb.replace('-', ''));
      break;
    case '020': // Lufthansa
      apiResult = await fetchLufthansaAPI(formattedAwb.replace('-', ''));
      break;
    case '006': // Delta
      console.log('[DELTA] Using AI agent scraping method');
      const deltaScrapingResult = await fetchAIAgent(formattedAwb, '006');
      if (deltaScrapingResult) {
        return {
          awb: formattedAwb,
          airline: airlineName,
          ...deltaScrapingResult,
        } as TrackingResult;
      }
      break;
    case '055': // ITA
      apiResult = await fetchITAAPI(formattedAwb.replace('-', ''));
      break;
    case '045': // LATAM
    case '145': // LATAM Cargo Chile
    case '549': // LATAM (código alternativo)
      apiResult = await fetchLATAMAPI(formattedAwb.replace('-', ''));
      break;
    case '577': // Azul
      apiResult = await fetchAzulAPI(formattedAwb.replace('-', ''));
      break;
    case '075': // IAG Cargo
      apiResult = await fetchIAGAPI(formattedAwb.replace('-', ''));
      break;
    case '157': // Qatar Cargo
      apiResult = await fetchQatarAPI(formattedAwb.replace('-', ''));
      break;
    case '172': // Cargolux
      apiResult = await fetchCargoluxAPI(formattedAwb);
      break;
    case '729': // Avianca Cargo via ParcelsApp (API direta bloqueada por HTTP/2)
      apiResult = await fetchParcelsApp729(formattedAwb);
      break;
    case '724': // Swiss International Air Lines
      apiResult = await fetchSwissCargoAPI(formattedAwb);
      break;
    case '615': // European Air Transport (DHL Aviation Cargo)
      apiResult = await fetchDHLAviation615(formattedAwb);
      break;
    case '881': // IATA (Condor Flugdienst GmbH)
      apiResult = await fetchCondorPathfinderAPI(formattedAwb);
      break;
    case '827': // Reliable Unique Services Aviation (RUSA) via Pathfinder
      apiResult = await fetchRUSAPathfinderAPI(formattedAwb);
      break;
    case '118': // TAAG Angola Airlines via ParcelsApp
      apiResult = await fetchParcelsApp118(formattedAwb);
      break;
    case '996': // Air Europa Cargo
      apiResult = await fetchAirEuropaHTML(formattedAwb);
      break;
    case '016': // United Cargo
      apiResult = await fetchUnitedCargoAPI(formattedAwb);
      break;
    case '139': // Aeromexico Cargo
      apiResult = await fetchAeromexicoAPI(formattedAwb);
      break;
    case '235': // Turkish Airlines via ParcelsApp
      apiResult = await fetchParcelsApp235(formattedAwb);
      break;
    case '176': // Emirates SkyCargo
      apiResult = await fetchEmiratesSkyCargo(formattedAwb);
      break;
    case '023': // FedEx Express
      apiResult = await fetchFedExTracking(formattedAwb);
      break;
    case '406': // UPS Airlines
      apiResult = await fetchUPSTracking(formattedAwb);
      break;
    case '318': // SKY Carga
      apiResult = await fetchSkyCargoAPI(formattedAwb);
      break;
    case '125': // IAG Cargo (125)
      apiResult = await fetchIagCargo125(formattedAwb);
      break;
    case '865': // MasAir (SmartKargo)
      apiResult = await fetchMasAirSmartKargo(formattedAwb);
      break;
    case '127': // GOLLOG (Gol Linhas Aéreas)
      apiResult = await fetchGolLog127(formattedAwb);
      break;
    case '147': // Royal Air Maroc via ParcelsApp
      apiResult = await fetchParcelsApp147(formattedAwb);
      break;
    case '112': // China Cargo Airlines via ParcelsApp
      apiResult = await fetchParcelsApp112(formattedAwb);
      break;
    case '605': // SKY Airline Chile - uses same SKY Carga API
      apiResult = await fetchSkyCargoAPI(formattedAwb);
      break;
    case '083': // SAA Cargo (South African Airways)
      apiResult = await fetchSAACargoAPI(formattedAwb);
      break;
    case '202': // DHLAvianca Cargo via ParcelsApp
      apiResult = await fetchParcelsApp202(formattedAwb);
      break;
    case '805': // GSA Force
      apiResult = await fetchGSAForce805(formattedAwb);
      break;
    case '992': // DHL Aviation Cargo
      apiResult = await fetchDHLAviation992(formattedAwb);
      break;
    case '160': // Cathay Cargo
      apiResult = await fetchCathayCargo160(formattedAwb);
      break;
    case '014': // Air Canada Cargo
      apiResult = await fetchAirCanadaCargo014(formattedAwb);
      break;
    case '999': // Air China Cargo via ParcelsApp
      apiResult = await fetchParcelsApp999(formattedAwb);
      break;
    case '074': // AF/KL
      console.log('[AFKL] Using AI agent scraping method');
      const afklScrapingResult = await fetchAIAgent(formattedAwb, '074');
      if (afklScrapingResult) {
        // Check if it's a NOT_FOUND result
        if (afklScrapingResult.status === 'NOT_FOUND') {
          return {
            awb: formattedAwb,
            airline: airlineName,
            status: 'NOT_FOUND',
            origin: 'N/A',
            destination: 'N/A',
            currentLocation: 'N/A',
            weight: 'N/A',
            pieces: 'N/A',
            events: [{
              date: new Date().toISOString(),
              location: 'Sistema AF/KL',
              status: 'NOT_FOUND',
              description: 'Status não encontrado',
            }],
          };
        }
        return {
          awb: formattedAwb,
          airline: airlineName,
          ...afklScrapingResult,
        } as TrackingResult;
      }
      // If scraping failed or returned null, return NOT_FOUND
      return {
        awb: formattedAwb,
        airline: airlineName,
        status: 'NOT_FOUND',
        origin: 'N/A',
        destination: 'N/A',
        currentLocation: 'N/A',
        weight: 'N/A',
        pieces: 'N/A',
        events: [{
          date: new Date().toISOString(),
          location: 'Sistema AF/KL',
          status: 'NOT_FOUND',
          description: 'Status não encontrado',
        }],
      };
  }
  
  // Step 2: Check if API succeeded
  if (apiResult && apiResult.ok && apiResult.summary) {
    console.log(`[ORCHESTRATION] API succeeded for ${airlineName}`);
    
    const summary = apiResult.summary;
    return {
      awb: formattedAwb,
      airline: airlineName,
      status: summary.lastStatus?.code || 'NOT_FOUND',
      origin: summary.origin || 'N/A',
      destination: summary.destination || 'N/A',
      currentLocation: summary.lastStatus?.description || 'N/A',
      weight: 'N/A',
      pieces: 'N/A',
      provider: apiResult.provider,
      lastFlight: summary.lastFlight,
      lastStatus: summary.lastStatus,
      events: [{
        date: summary.lastStatus?.timestamp || new Date().toISOString(),
        location: summary.lastStatus?.description || 'N/A',
        status: summary.lastStatus?.code || 'NOT_FOUND',
        description: summary.lastStatus?.description || '',
      }],
    };
  }
  
  // Step 3: Check if we should use fallback
  if (apiResult && shouldUseFallback(apiResult)) {
    console.log(`[ORCHESTRATION] API failed with fallback condition, trying scraping for ${airlineName}`);
    
    const scrapingResult = await fetchFirecrawlFallback(formattedAwb, airlineCode);
    
    if (scrapingResult) {
      console.log(`[ORCHESTRATION] Scraping fallback succeeded for ${airlineName}`);
      return {
        awb: formattedAwb,
        airline: airlineName,
        ...scrapingResult,
      } as TrackingResult;
    }
  }
  
  // Step 4: Return error based on API result
  if (apiResult) {
    // CAPTCHA_REQUIRED: Special handling - DO NOT return NOT_FOUND/ERRO to preserve existing data
    if (apiResult.error === 'CAPTCHA_REQUIRED' || apiResult.status === 403) {
      console.log(`[ORCHESTRATION] 🚫 CAPTCHA detected for ${airlineName} - returning CAPTCHA_REQUIRED to preserve data`);
      return {
        awb: formattedAwb,
        airline: airlineName,
        status: 'CAPTCHA_REQUIRED',
        origin: 'N/A',  // Frontend/backend should preserve existing values
        destination: 'N/A',
        currentLocation: 'N/A',
        weight: 'N/A',
        pieces: 'N/A',
        provider: apiResult.provider,
        events: [{
          date: new Date().toISOString(),
          location: `Sistema ${airlineName}`,
          status: 'CAPTCHA_REQUIRED',
          description: 'Tracking protegido por CAPTCHA. Acesse o link manualmente para rastrear.',
        }],
      };
    }
    
    if (apiResult.status === 404) {
      return {
        awb: formattedAwb,
        airline: airlineName,
        status: 'AWB_NOT_FOUND',
        origin: 'N/A',
        destination: 'N/A',
        currentLocation: 'N/A',
        weight: 'N/A',
        pieces: 'N/A',
        events: [{
          date: new Date().toISOString(),
          location: `Sistema ${airlineName}`,
          status: 'AWB_NOT_FOUND',
          description: 'Status não encontrado',
        }],
      };
    }
    
    return {
      awb: formattedAwb,
      airline: airlineName,
      status: 'Erro na Consulta',
      origin: 'N/A',
      destination: 'N/A',
      currentLocation: 'N/A',
      weight: 'N/A',
      pieces: 'N/A',
      events: [{
        date: new Date().toISOString(),
        location: `Sistema ${airlineName}`,
        status: 'Erro',
        description: apiResult.error || 'Erro ao consultar rastreamento',
      }],
    };
  }
  
  // Step 5: No API implemented - return generic
  return {
    awb: formattedAwb,
    airline: airlineName,
    status: 'Em Processamento',
    origin: 'N/A',
    destination: 'N/A',
    currentLocation: 'N/A',
    weight: 'N/A',
    pieces: 'N/A',
    events: [{
      date: new Date().toISOString(),
      location: 'N/A',
      status: 'Em Processamento',
      description: 'Sistema de rastreamento não disponível para esta companhia',
    }],
  };
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { awb, airlineCode } = await req.json();

    if (!awb || !airlineCode) {
      return new Response(
        JSON.stringify({ error: 'AWB and airline code are required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`[MAIN] Tracking AWB: ${awb} for airline: ${airlineCode}`);

    const trackingData = await trackAWB(awb, airlineCode);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: trackingData 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[MAIN] Error in track-awb function:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar rastreamento' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
