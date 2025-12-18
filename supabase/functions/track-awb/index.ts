import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

      candidates.push({
        __ts: ts,
        __iso: makeIso(seg.EventDate, seg.EventTime),
        code: code,
        statusTxt: seg.Status || null,
        flight: flightNum,
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

        candidates.push({
          __ts: ts,
          __iso: makeIso(date, time),
          code: code,
          statusTxt: ln.StatusDesc || ln.Status || null,
          flight: flightNum,
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
    let lastStatus: { code: string; description: string; timestamp: string; } | undefined = undefined;
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
        lastStatus = {
          code: String(ev.actionStatus?.code || '').toUpperCase(),
          description: String(ev.actionStatus?.description || ''),
          timestamp: timestamp || new Date(ts).toISOString(),
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
        },
        origin: 'N/A',
        destination: 'N/A',
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
          lastStatus?: { code: string; description: string; timestamp: string };
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
  const provider = 'avianca_icargo';
  console.log(`[AVIANCA CARGO] 🚀 Starting fetch for AWB: ${awb}`);
  
  // Excluded words - not valid IATA airport codes
  const EXCLUDED_CODES = new Set([
    'ADD', 'AIR', 'ALL', 'AND', 'ARE', 'AWB', 'BOX', 'BUT', 'CAN', 'CAR', 'COD', 'CSS', 
    'DAY', 'DIM', 'DOC', 'FOR', 'GET', 'GIF', 'HAS', 'HTM', 'HUB', 'IBS', 'ICO', 'IMG', 
    'JPG', 'KEY', 'KGS', 'LOG', 'MAX', 'MIN', 'NEW', 'NOT', 'NOW', 'ODD', 'OUR', 'OUT', 
    'OWN', 'PCS', 'PDF', 'PNG', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SEE', 'SET', 'SRC', 
    'SUM', 'SVG', 'TAB', 'THE', 'TOP', 'TRY', 'TXT', 'URL', 'USE', 'VIA', 'WAY', 'WEB', 
    'XML', 'YES', 'ZIP', 'APP', 'API', 'COM', 'NET', 'ORG', 'EDU', 'GOV', 'HOME', 'MENU'
  ]);

  const isValidAirportCode = (code: string): boolean => {
    if (!code || code.length !== 3) return false;
    return !EXCLUDED_CODES.has(code.toUpperCase());
  };
  
  try {
    // Normalize AWB format: 729-48637960 or 72948637960
    let formattedAwb = awb.toString().trim();
    if (!formattedAwb.includes('-')) {
      formattedAwb = `${formattedAwb.substring(0, 3)}-${formattedAwb.substring(3)}`;
    }
    
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[AVIANCA CARGO] ❌ FIRECRAWL_API_KEY not configured');
      return { provider, ok: false, status: 401, error: 'API key not configured', sent: { awb } };
    }
    
    // iCargo portal URL
    const icargoUrl = `https://avianca-icargo.ibsplc.aero/icargoportal/portal/trackshipments?trkTxnValue=${formattedAwb}`;
    console.log(`[AVIANCA CARGO] 📡 Scraping iCargo: ${icargoUrl}`);
    
    // Firecrawl with extended wait
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: icargoUrl,
        formats: ['html', 'markdown'],
        waitFor: 25000,
        timeout: 70000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[AVIANCA CARGO] ❌ Firecrawl HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return { provider, ok: false, status: response.status, error: `Firecrawl HTTP ${response.status}`, sent: { awb: formattedAwb, url: icargoUrl } };
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data?.markdown) {
      console.log('[AVIANCA CARGO] ❌ Firecrawl returned no content');
      return { provider, ok: false, status: 404, error: 'No content retrieved from iCargo', sent: { awb: formattedAwb } };
    }
    
    const markdown = data.data.markdown || '';
    const html = data.data.html || '';
    const content = markdown + '\n' + html;
    const contentLower = content.toLowerCase();
    
    console.log(`[AVIANCA CARGO] 📄 Content length: ${content.length}`);
    console.log(`[AVIANCA CARGO] 📄 Preview: ${markdown.substring(0, 2000)}`);
    
    // ========== DETECT CAPTCHA/ANTI-BOT ==========
    const captchaIndicators = [
      'captcha', 'verify you are human', 'challenge', 'cloudflare', 
      'recaptcha', 'hcaptcha', 'just a moment', 'checking your browser',
      'access denied', 'bot detected', 'please wait', 'security check',
      'cf-browser-verification', 'ray id', 'please enable cookies'
    ];
    
    const isCaptchaBlocked = captchaIndicators.some(indicator => contentLower.includes(indicator));
    const hasTrackingContent = contentLower.includes('origin') || contentLower.includes('destination') || 
                               contentLower.includes('shipment') || contentLower.includes('pcs') ||
                               contentLower.includes('status') || contentLower.includes('delivered');
    const hasMinimalContent = content.length < 500 && !hasTrackingContent;
    
    if (isCaptchaBlocked || hasMinimalContent) {
      console.log(`[AVIANCA CARGO] 🚫 CAPTCHA/Anti-bot detected - preserving existing data`);
      return {
        provider,
        ok: false,
        status: 403,
        error: 'CAPTCHA_REQUIRED',
        sent: { url: icargoUrl },
        raw: { 
          captchaDetected: true, 
          contentLength: content.length,
          message: 'Tracking protegido por CAPTCHA. Acesse o link manualmente para rastrear.'
        },
      };
    }
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    let lastStatusDescription = '';
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // Pattern 1: Route indicator "GRU>MGA" shown in top right
    const routeMatch = content.match(/\b([A-Z]{3})>([A-Z]{3})\b/);
    if (routeMatch) {
      const from = routeMatch[1].toUpperCase();
      const to = routeMatch[2].toUpperCase();
      if (isValidAirportCode(from) && isValidAirportCode(to)) {
        origin = from;
        destination = to;
        console.log(`[AVIANCA CARGO] ✅ Route from indicator: ${origin} > ${destination}`);
      }
    }
    
    // Pattern 2: Flight info "AV 0315 | 19-Jun|SAL-MGA" or "AV 0366 | 19-Jun|BOG-SAL"
    if (!origin || !destination) {
      const flightRoutes: { from: string; to: string }[] = [];
      const flightPattern = /AV\s*\d+[^|]*\|\s*[^|]+\|([A-Z]{3})-([A-Z]{3})/gi;
      let flightMatch;
      while ((flightMatch = flightPattern.exec(content)) !== null) {
        const from = flightMatch[1].toUpperCase();
        const to = flightMatch[2].toUpperCase();
        if (isValidAirportCode(from) && isValidAirportCode(to)) {
          flightRoutes.push({ from, to });
          console.log(`[AVIANCA CARGO] 📍 Flight route: ${from}-${to}`);
        }
      }
      
      if (flightRoutes.length > 0) {
        if (!origin) origin = flightRoutes[0].from;
        if (!destination) destination = flightRoutes[flightRoutes.length - 1].to;
        console.log(`[AVIANCA CARGO] ✅ Route from flights: ${origin} → ${destination}`);
      }
    }

    // Pattern 3: Simple route format "XXX-YYY" or "XXX - YYY"
    if (!origin || !destination) {
      const simpleRouteMatch = content.match(/\b([A-Z]{3})\s*[-–]\s*([A-Z]{3})\b/);
      if (simpleRouteMatch) {
        const from = simpleRouteMatch[1].toUpperCase();
        const to = simpleRouteMatch[2].toUpperCase();
        if (isValidAirportCode(from) && isValidAirportCode(to)) {
          if (!origin) origin = from;
          if (!destination) destination = to;
          console.log(`[AVIANCA CARGO] ✅ Route from simple pattern: ${origin} → ${destination}`);
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // Priority 1: Status badge "X PCS in Delivered status"
    const statusBadgeMatch = content.match(/(\d+)\s*PCS?\s+in\s+(\w+)\s+status/i);
    if (statusBadgeMatch) {
      const statusText = statusBadgeMatch[2].toLowerCase();
      lastStatusDescription = statusBadgeMatch[2];
      console.log(`[AVIANCA CARGO] 📋 Found status badge: "${lastStatusDescription}"`);
      
      if (statusText.includes('deliver')) lastStatus = 'DLV';
      else if (statusText.includes('depart')) lastStatus = 'DEP';
      else if (statusText.includes('arriv')) lastStatus = 'ARR';
      else if (statusText.includes('book')) lastStatus = 'BKD';
      else if (statusText.includes('accept') || statusText.includes('receiv')) lastStatus = 'RCS';
      else if (statusText.includes('notif') || statusText.includes('ready')) lastStatus = 'NFD';
      else if (statusText.includes('manifest')) lastStatus = 'MAN';
      else if (statusText.includes('transit')) lastStatus = 'TRA';
      else lastStatus = statusText.toUpperCase().substring(0, 3);
      
      console.log(`[AVIANCA CARGO] ✅ Status from badge: ${lastStatus}`);
    }

    // Priority 2: Status text in History section
    if (!lastStatus) {
      const historyStatuses = [
        { pattern: /\bdelivered\b/i, code: 'DLV' },
        { pattern: /\bdeparted\b/i, code: 'DEP' },
        { pattern: /\barrived\b/i, code: 'ARR' },
        { pattern: /\bbooked\s+at/i, code: 'BKD' },
        { pattern: /\baccepted\b/i, code: 'RCS' },
        { pattern: /\breceived\b/i, code: 'RCS' },
        { pattern: /\bready\s+for\s+delivery/i, code: 'NFD' },
        { pattern: /\bnotified\b/i, code: 'NFD' },
        { pattern: /\bmanifest/i, code: 'MAN' },
        { pattern: /\bin[-\s]?transit\b/i, code: 'TRA' },
      ];
      
      for (const { pattern, code } of historyStatuses) {
        if (pattern.test(content)) {
          lastStatus = code;
          lastStatusDescription = code;
          console.log(`[AVIANCA CARGO] ✅ Status from keyword: ${lastStatus}`);
          break;
        }
      }
    }
    
    console.log(`[AVIANCA CARGO] 🏁 Final: Origin=${origin || 'null'}, Dest=${destination || 'null'}, Status=${lastStatus || 'null'}`);
    
    const hasValidData = (origin && isValidAirportCode(origin)) || 
                         (destination && isValidAirportCode(destination)) || 
                         (lastStatus && lastStatus.length >= 2);
    
    if (!hasValidData) {
      console.log('[AVIANCA CARGO] ⚠️ No valid data extracted - content may not have loaded');
      return {
        provider,
        ok: false,
        status: 404,
        error: 'Parser could not extract data - iCargo SPA may not have loaded completely',
        sent: { awb: formattedAwb, url: icargoUrl },
        raw: { contentLength: content.length, preview: markdown.substring(0, 500) },
      };
    }
    
    return {
      provider,
      ok: true,
      status: 200,
      error: null,
      sent: { awb: formattedAwb, url: icargoUrl },
      raw: { contentLength: content.length },
      summary: {
        origin: origin || undefined,
        destination: destination || undefined,
        lastStatus: {
          code: lastStatus || 'N/A',
          description: lastStatusDescription || (lastStatus || 'N/A'),
          timestamp: new Date().toISOString(),
        },
      },
    };
  } catch (error) {
    console.error(`[AVIANCA CARGO] ❌ Error:`, error);
    return { provider, ok: false, status: 500, error: error instanceof Error ? error.message : 'Unknown error', sent: { awb } };
  }
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
    // ParcelsApp format in sidebar:
    // "From" (label) then on next line: "EZE, Ministro Pistrini, Buenos Aires"
    // "To" (label) then on next line: "GRU, Guarulhos Gov Andre Franco Montouro, Sao Paulo"
    
    // Invalid codes that should not be treated as airports
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
      'REF', 'OUT'
    ]);
    
    const isValidAirport = (code: string | null | undefined): boolean => {
      if (!code || code.length !== 3) return false;
      if (!/^[A-Z]{3}$/i.test(code)) return false;
      return !INVALID_ROUTE_VALUES.has(code.toUpperCase());
    };
    
    // PRIORITY 1: ParcelsApp specific format - "From" label followed by newline and airport code
    // Format: "From\n\nEZE, Ministro Pistrini" or "From\nEZE,"
    const fromLabelMatch = content.match(/\bFrom\s*[\n\r]+\s*([A-Z]{3})[\s,]/i);
    const toLabelMatch = content.match(/\bTo\s*[\n\r]+\s*([A-Z]{3})[\s,]/i);
    
    if (fromLabelMatch && isValidAirport(fromLabelMatch[1])) {
      origin = fromLabelMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 235] ✅ Origin from 'From' label: ${origin}`);
    }
    if (toLabelMatch && isValidAirport(toLabelMatch[1])) {
      destination = toLabelMatch[1].toUpperCase();
      console.log(`[PARCELSAPP 235] ✅ Destination from 'To' label: ${destination}`);
    }
    
    // PRIORITY 2: Look for "Origin:" or "Destination:" inline patterns
    if (!origin) {
      const originPatterns = [
        /Origin[:\s]+([A-Z]{3})\b/i,
        /Departure[:\s]+([A-Z]{3})\b/i,
      ];
      for (const pattern of originPatterns) {
        const match = content.match(pattern);
        if (match && isValidAirport(match[1])) {
          origin = match[1].toUpperCase();
          console.log(`[PARCELSAPP 235] ✅ Origin from inline label: ${origin}`);
          break;
        }
      }
    }
    
    if (!destination) {
      const destPatterns = [
        /Destination[:\s]+([A-Z]{3})\b/i,
        /Arrival[:\s]+([A-Z]{3})\b/i,
      ];
      for (const pattern of destPatterns) {
        const match = content.match(pattern);
        if (match && isValidAirport(match[1])) {
          destination = match[1].toUpperCase();
          console.log(`[PARCELSAPP 235] ✅ Destination from inline label: ${destination}`);
          break;
        }
      }
    }
    
    // PRIORITY 3: Extract from route arrow pattern "EZE → GRU" or "EZE - GRU"
    if (!origin || !destination) {
      const routeMatch = content.match(/\b([A-Z]{3})\s*[→➔>–-]\s*([A-Z]{3})\b/i);
      if (routeMatch) {
        if (!origin && isValidAirport(routeMatch[1])) {
          origin = routeMatch[1].toUpperCase();
          console.log(`[PARCELSAPP 235] ✅ Origin from route pattern: ${origin}`);
        }
        if (!destination && isValidAirport(routeMatch[2])) {
          destination = routeMatch[2].toUpperCase();
          console.log(`[PARCELSAPP 235] ✅ Destination from route pattern: ${destination}`);
        }
      }
    }
    
    // PRIORITY 4: Extract from timeline events - FIRST and LAST airport codes
    if (!origin || !destination) {
      // Find all airport codes in parentheses, e.g., "(EZE)" or location names like "Ministro Pistrini (EZE)"
      const airportMatches = content.match(/\(([A-Z]{3})\)/g);
      if (airportMatches && airportMatches.length >= 2) {
        const codes = airportMatches.map(m => m.replace(/[()]/g, '')).filter(isValidAirport);
        if (codes.length >= 2) {
          if (!origin) {
            origin = codes[0];
            console.log(`[PARCELSAPP 235] ✅ Origin from timeline: ${origin}`);
          }
          if (!destination) {
            destination = codes[codes.length - 1];
            console.log(`[PARCELSAPP 235] ✅ Destination from timeline: ${destination}`);
          }
        }
      }
    }
    
    // ========== EXTRACT LAST STATUS ==========
    // Look for status indicators in ParcelsApp
    const statusMappings = [
      { patterns: [/\bdelivered\b/i, /\bentregue\b/i], code: 'DLV' },
      { patterns: [/\bdeparted\b/i, /\bleft\b.*\bfacility\b/i, /\bin transit\b/i], code: 'DEP' },
      { patterns: [/\barrived\b/i, /\breached\b/i], code: 'ARR' },
      { patterns: [/\breceived\b/i, /\baccepted\b/i, /\bpicked up\b/i], code: 'RCF' },
      { patterns: [/\bmanifested\b/i, /\bprocessing\b/i], code: 'MAN' },
      { patterns: [/\bbooked\b/i, /\bshipment\s+information\b/i], code: 'BKD' },
      { patterns: [/\bout for delivery\b/i, /\bready\s+for\s+pickup\b/i, /\bnotified\b/i], code: 'NFD' },
      { patterns: [/\bcleared\s+customs\b/i, /\bcustoms\s+released\b/i], code: 'CCD' },
    ];
    
    // First try to find explicit status line
    const statusLineMatch = content.match(/(?:Status|Estado|Situação)[:\s]+([A-Za-z\s]+?)(?:\n|$|\.)/i);
    if (statusLineMatch) {
      const statusText = statusLineMatch[1].trim().toLowerCase();
      for (const { patterns, code } of statusMappings) {
        if (patterns.some(p => p.test(statusText))) {
          lastStatus = code;
          break;
        }
      }
    }
    
    // Fallback: scan entire content for status keywords
    if (!lastStatus) {
      // Look for the most recent/relevant status (typically "delivered" takes precedence)
      for (const { patterns, code } of statusMappings) {
        if (patterns.some(p => p.test(content))) {
          lastStatus = code;
          // If delivered, stop immediately (final status)
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
            origin = validCodes[0];
            console.log(`[PARCELSAPP 235] ⚠️ Origin from fallback: ${origin}`);
          }
          if (!destination) {
            destination = validCodes[validCodes.length - 1];
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
// ============= AMERICAN AIRLINES CARGO (001) =============

async function fetchAmericanAirlinesAPI(awb: string): Promise<StandardResult> {
  const provider = 'aa_cargo_mobile';
  console.log(`[AA CARGO] Fetching AWB: ${awb}`);
  
  // Words that are NOT valid IATA airport codes
  const EXCLUDED_CODES = new Set([
    'ADD', 'ADY', 'AIR', 'ALL', 'AND', 'ANY', 'APP', 'ARE', 'AWB', 'BOO', 'BOX', 'BUT', 'CAN', 
    'CAR', 'COD', 'CSS', 'DAY', 'DIM', 'DOC', 'FOR', 'GET', 'GIF', 'HAS', 'HTM', 'HUB', 'IBS', 
    'ICO', 'IMG', 'JPG', 'KEY', 'KGS', 'LOG', 'MAX', 'MIN', 'NEW', 'NOT', 'NOW', 'ODD', 'OUR', 
    'OUT', 'OWN', 'PCS', 'PDF', 'PNG', 'PUT', 'RAW', 'ROW', 'RUN', 'SAY', 'SEE', 'SET', 'SRC', 
    'SUM', 'SVG', 'TAB', 'THE', 'TOP', 'TRY', 'TXT', 'URL', 'USE', 'VIA', 'WAY', 'WEB', 'XML', 
    'YES', 'ZIP', 'API', 'COM', 'NET', 'ORG', 'EDU', 'GOV', 'FLT', 'REF', 'INFO', 'LBS', 'KGS'
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
    
    let origin: string | null = null;
    let destination: string | null = null;
    let lastStatus: string | null = null;
    
    // ========== EXTRACT ORIGIN AND DESTINATION ==========
    // CRITICAL: Must extract from COMPLETE ROUTE, not from last event location (which could be a hub)
    
    // PRIORITY 0: Handle multiline format "From\nXXX," or "To\nXXX," (like ParcelsApp)
    const fromMultilineMatch = content.match(/\bFrom\s*[\n\r]+\s*([A-Z]{3})[\s,]/i);
    const toMultilineMatch = content.match(/\bTo\s*[\n\r]+\s*([A-Z]{3})[\s,]/i);
    
    if (fromMultilineMatch && isValidAirportCode(fromMultilineMatch[1])) {
      origin = fromMultilineMatch[1].toUpperCase();
      console.log(`[AA CARGO] ✅ Origin from multiline 'From': ${origin}`);
    }
    if (toMultilineMatch && isValidAirportCode(toMultilineMatch[1])) {
      destination = toMultilineMatch[1].toUpperCase();
      console.log(`[AA CARGO] ✅ Destination from multiline 'To': ${destination}`);
    }
    
    // PRIORITY 1: Look for explicit "Origin" and "Destination" labels (inline)
    if (!origin) {
      const originLabelMatch = content.match(/(?:Origin|Departure)[:\s]+([A-Z]{3})\b/i);
      if (originLabelMatch && isValidAirportCode(originLabelMatch[1])) {
        origin = originLabelMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Origin from inline label: ${origin}`);
      }
    }
    if (!destination) {
      const destLabelMatch = content.match(/(?:Destination|Final\s*Dest(?:ination)?|Arrival)[:\s]+([A-Z]{3})\b/i);
      if (destLabelMatch && isValidAirportCode(destLabelMatch[1])) {
        destination = destLabelMatch[1].toUpperCase();
        console.log(`[AA CARGO] ✅ Destination from inline label: ${destination}`);
      }
    }
    
    // PRIORITY 2: Look for route header pattern "BOS - GRU" or "BOS → GRU" or "BOS>GRU"
    if (!origin || !destination) {
      // Find all potential route patterns
      const routePatterns = [
        /\b([A-Z]{3})\s*[-–—→>]\s*([A-Z]{3})\b/g,  // BOS - GRU, BOS → GRU
        /\b([A-Z]{3})\s+to\s+([A-Z]{3})\b/gi,       // BOS to GRU
      ];
      
      for (const pattern of routePatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const from = match[1].toUpperCase();
          const to = match[2].toUpperCase();
          if (isValidAirportCode(from) && isValidAirportCode(to) && from !== to) {
            if (!origin) origin = from;
            if (!destination) destination = to;
            console.log(`[AA CARGO] ✅ Route from pattern: ${origin} → ${destination}`);
            break;
          }
        }
        if (origin && destination) break;
      }
    }
    
    // PRIORITY 3: Extract from parentheses "(XXX)" format in timeline
    if (!origin || !destination) {
      const airportMatches = content.match(/\(([A-Z]{3})\)/g);
      if (airportMatches && airportMatches.length >= 2) {
        const codes = airportMatches.map(m => m.replace(/[()]/g, '')).filter(isValidAirportCode);
        if (codes.length >= 2) {
          if (!origin) {
            origin = codes[0];
            console.log(`[AA CARGO] ✅ Origin from parentheses: ${origin}`);
          }
          if (!destination) {
            destination = codes[codes.length - 1];
            console.log(`[AA CARGO] ✅ Destination from parentheses: ${destination}`);
          }
        }
      }
    }
    
    // PRIORITY 4: Extract from flight segments table - FIRST departure, LAST arrival
    if (!origin || !destination) {
      const flightSegments: { from: string; to: string }[] = [];
      
      // Pattern: Look for flight segment rows with airport pairs
      const segmentPattern = /\b([A-Z]{3})\s*[→\-–>]\s*([A-Z]{3})\b/g;
      let segMatch;
      while ((segMatch = segmentPattern.exec(content)) !== null) {
        const from = segMatch[1].toUpperCase();
        const to = segMatch[2].toUpperCase();
        if (isValidAirportCode(from) && isValidAirportCode(to) && from !== to) {
          flightSegments.push({ from, to });
        }
      }
      
      if (flightSegments.length > 0) {
        // Origin = FIRST segment's departure
        if (!origin) origin = flightSegments[0].from;
        // Destination = LAST segment's arrival (NOT intermediate hubs)
        if (!destination) destination = flightSegments[flightSegments.length - 1].to;
        console.log(`[AA CARGO] ✅ Route from segments: ${origin} → ${destination}`);
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
    
    // Check if we got no data at all
    if (!origin && !destination && !lastStatus) {
      if (content.toLowerCase().includes('not found') || content.toLowerCase().includes('no results') || content.length < 500) {
        return { provider, ok: false, status: 404, error: 'AWB not found', sent: { url }, raw: markdown.substring(0, 500) };
      }
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

async function trackAWB(awb: string, airlineCode: string): Promise<TrackingResult> {
  const formattedAwb = awb.includes('-') ? awb : `${awb.substring(0, 3)}-${awb.substring(3)}`;
  
  // Map airline code to name
  const airlineMap: { [key: string]: string } = {
    '001': 'American Airlines Cargo',
    '016': 'United Cargo',
    '047': 'TAP Cargo',
    '057': 'Air France Cargo',
    '139': 'Aeromexico Cargo',
    '235': 'Turkish Airlines',
    '369': 'Atlas Air',
    '020': 'Lufthansa Cargo',
    '006': 'Delta Cargo',
    '055': 'ITA Cargo',
    '045': 'LATAM Cargo',
    '549': 'LATAM Cargo',
    '577': 'Azul Cargo',
    '074': 'AF/KL Cargo',
    '075': 'IAG Cargo',
    '157': 'Qatar Cargo',
    '172': 'Cargolux',
    '729': 'Avianca Cargo',
    '724': 'Swiss International Air Lines',
    '615': 'European Air Transport',
    '881': 'IATA (Condor Flugdienst GmbH)',
    '118': 'TAAG Angola Airlines',
    '996': 'Air Europa Cargo',
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
    case '729': // Avianca Cargo
      apiResult = await fetchAviancaCargoAPI(formattedAwb);
      break;
    case '724': // Swiss International Air Lines
      apiResult = await fetchSwissCargoAPI(formattedAwb);
      break;
    case '615': // European Air Transport (DHL Aviation Cargo)
      apiResult = await fetchDHLAviationCargoHTML(formattedAwb);
      break;
    case '881': // IATA (Condor Flugdienst GmbH)
      apiResult = await fetchCondorPathfinderAPI(formattedAwb);
      break;
    case '118': // TAAG Angola Airlines
      apiResult = await fetchTAAGFreightAeroHTML(formattedAwb);
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
