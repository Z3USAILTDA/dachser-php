
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
    
    if (carrier === '006') {
      // DELTA PARSING - Sistema de Prioridades
      const content = markdown + '\n' + html;
      
      // ===== PRIORIDADE 1: FLIGHT DETAILS Section =====
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
      }
      
      // ===== Parse da Tabela de Eventos =====
      // Formato esperado: | Date | Time | Activity |
      const tableMatch = markdown.match(/\|\s*Date\s*\|\s*Time\s*\|\s*Activity\s*\|([\s\S]*?)(?:\n\n|\n#|$)/i);
      if (tableMatch) {
        console.log('[DELTA] 📋 Found events table');
        const tableContent = tableMatch[0];
        const lines = tableContent.split('\n');
        
        // Pula cabeçalho (2 linhas: | Date | Time | Activity | e separador)
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || !line.includes('|')) continue;
          
          const cells = line.split('|').map((c: string) => c.trim()).filter((c: string) => c);
          if (cells.length < 3) continue;
          
          const dateStr = cells[0]; // e.g., "08/03/2025"
          const timeStr = cells[1]; // e.g., "0600"
          const activity = cells[2]; // e.g., "22 pieces weighing 860.0 lbs have been booked on DL0705/30JUL25"
          
          // Formata datetime
          let datetime = new Date().toISOString();
          if (dateStr && timeStr) {
            const [month, day, year] = dateStr.split('/');
            const hours = timeStr.substring(0, 2);
            const minutes = timeStr.substring(2, 4);
            datetime = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours}:${minutes}:00Z`;
          }
          
          // Extrai localização (códigos IATA de 3 letras)
          const locationMatch = activity.match(/\b([A-Z]{3})\b/);
          const location = locationMatch ? locationMatch[1] : 'N/A';
          
          // Determina status code - DELTA
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
          
          // ===== PRIORIDADE 2: Busca nos Eventos =====
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
      
      // Normalização final
      if (flightNumber) {
        flightNumber = flightNumber.replace(/\s+/g, "").toUpperCase();
        console.log(`[DELTA] ✅ Final flight number: ${flightNumber}`);
      }
      
      // Se encontrou eventos, usa o último como status atual
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        extracted = {
          currentStatus: lastEvent.description,
          statusCode: lastEvent.status,
          statusDescription: lastEvent.description,
          date: lastEvent.date,
          location: lastEvent.location,
          flightNumber: flightNumber,
        };
      } else {
        console.error('[DELTA] ❌ Could not find events table in scraped content');
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
    '047': 'TAP Cargo',
    '057': 'Air France Cargo',
    '369': 'Atlas Air',
    '020': 'Lufthansa Cargo',
    '006': 'Delta Cargo',
    '055': 'ITA Cargo',
    '045': 'LATAM Cargo',
    '577': 'Azul Cargo',
    '074': 'AF/KL Cargo',
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
      apiResult = await fetchLATAMAPI(formattedAwb.replace('-', ''));
      break;
    case '577': // Azul
      apiResult = await fetchAzulAPI(formattedAwb.replace('-', ''));
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
