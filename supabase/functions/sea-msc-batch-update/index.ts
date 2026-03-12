// MSC Batch Update — Parses MSC tracking text and bulk-updates MariaDB
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map MSC event descriptions to internal event codes
function mapEventCode(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('empty to shipper')) return 'GOE';
  if (d.includes('export received at cy') || d.includes('export received at origin')) return 'GIO';
  if (d.includes('export at barge yard')) return 'GIO';
  if (d.includes('export loaded on vessel')) return 'CRG';
  if (d.includes('export loaded on rail')) return 'STATUS_UPDATE';
  if (d.includes('export loaded on barge')) return 'STATUS_UPDATE';
  if (d.includes('export unloaded from rail')) return 'STATUS_UPDATE';
  if (d.includes('export discharged from barge')) return 'STATUS_UPDATE';
  if (d.includes('export rail departure')) return 'STATUS_UPDATE';
  if (d.includes('export arrived at destination')) return 'STATUS_UPDATE';
  if (d.includes('full transshipment discharged')) return 'TRANSSHIPMENT';
  if (d.includes('full transshipment loaded')) return 'TRANSSHIPMENT';
  if (d.includes('full transshipment positioned')) return 'TRANSSHIPMENT';
  if (d.includes('full available for delivery')) return 'INS';
  if (d.includes('carrier release')) return 'INS';
  if (d.includes('import discharged from vessel')) return 'DCH';
  if (d.includes('import to consignee')) return 'GOD';
  if (d.includes('empty received at cy')) return 'GIE';
  if (d.includes('end import cycle')) return 'DLV';
  if (d.includes('start export cycle')) return 'BKG';
  return 'STATUS_UPDATE';
}

// Determine container_status from events (most advanced status)
function resolveContainerStatus(events: ParsedEvent[]): string {
  // From most advanced to least
  const statusPriority = ['GIE', 'DLV', 'GOD', 'INS', 'DCH', 'TRANSSHIPMENT', 'ARR', 'DEP', 'CRG', 'GIO', 'GOE', 'BKG', 'STATUS_UPDATE'];
  for (const code of statusPriority) {
    if (events.some(e => e.code === code)) {
      // Map to our container_status values
      switch (code) {
        case 'GIE': return 'DLV';
        case 'DLV': return 'DLV';
        case 'GOD': return 'GOD';
        case 'INS': return 'INS';
        case 'DCH': return 'DCH';
        case 'TRANSSHIPMENT': return 'TSP';
        case 'CRG': return 'CRG';
        case 'DEP': return 'DEP';
        case 'ARR': return 'ARR';
        case 'GIO': return 'GIO';
        case 'GOE': return 'CLT';
        case 'BKG': return 'BKG';
        default: return 'AGD';
      }
    }
  }
  return 'AGD';
}

interface ParsedEvent {
  date: string; // YYYY-MM-DD HH:mm:ss
  location: string;
  description: string;
  code: string;
  vessel: string;
  terminal: string;
  voyage: string;
}

interface ParsedMBL {
  mbl: string;
  containers: string[];
  events: ParsedEvent[];
  eta: string | null;
  noInfo: boolean;
}

function parseDate(dateStr: string): string {
  // DD/MM/YYYY → YYYY-MM-DD 00:00:00
  const parts = dateStr.trim().replace(/;/g, '/').split('/');
  if (parts.length !== 3) return '';
  let [dd, mm, yyyy] = parts;
  if (yyyy.length === 2) yyyy = '20' + yyyy;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} 00:00:00`;
}

function parseMscText(text: string): ParsedMBL[] {
  const lines = text.split('\n');
  const results: ParsedMBL[] = [];
  let current: ParsedMBL | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) { i++; continue; }

    // Check for MBL line (starts with MEDU or MMEDU)
    const mblMatch = line.match(/^M?MEDU[A-Z0-9]+$/i);
    if (mblMatch) {
      // Normalize: remove double M
      const mbl = line.replace(/^MMEDU/, 'MEDU');
      
      // Check if next lines define containers for this MBL
      const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      if (nextLine.startsWith('- containers:')) {
        if (current) results.push(current);
        const containers = nextLine.replace('- containers:', '').trim().split(/[\s,]+/).filter(c => c.length > 0);
        current = { mbl, containers, events: [], eta: null, noInfo: false };
        i += 2; // skip mbl + containers line
        
        // Skip "- eventos:" line if present
        if (i < lines.length && lines[i].trim().match(/^-?\s*eventos:?$/i)) {
          i++;
        }
        continue;
      } else if (nextLine === 'sem informação') {
        if (current) results.push(current);
        current = { mbl, containers: [], events: [], eta: null, noInfo: true };
        results.push(current);
        current = null;
        i += 2;
        continue;
      }
    }

    // Check for ETA line (supports "eta ...", "- ETA: ...", "ETA: ...")
    const etaMatch = line.match(/^-?\s*eta:?\s+(.+)$/i);
    if (etaMatch && current) {
      const etaStr = etaMatch[1].trim().replace(/;/g, '/');
      const parts = etaStr.split('/');
      if (parts.length === 3) {
        let [dd, mm, yyyy] = parts;
        if (yyyy.length === 2) yyyy = '20' + yyyy;
        current.eta = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      }
      i++;
      continue;
    }

    // Check for event date line (DD/MM/YYYY)
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{2,4})$/);
    if (dateMatch && current) {
      const dateStr = parseDate(dateMatch[1]);
      
      // Next line is location
      const locationLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      // Next line is event description
      const descLine = (i + 2 < lines.length) ? lines[i + 2].trim() : '';
      
      if (locationLine && descLine) {
        // Line after description could be vessel name or status (LADEN/EMPTY)
        const line4 = (i + 3 < lines.length) ? lines[i + 3].trim() : '';
        
        let vessel = '';
        let voyage = '';
        let terminal = '';
        let skipLines = 3; // date + location + description
        
        if (line4 && !line4.match(/^\d{2}\/\d{2}\/\d{2,4}$/) && !line4.match(/^MEDU/) && !line4.match(/^-\s*containers/) && !line4.match(/^eta\s/i) && !line4.match(/^sem informação/i)) {
          // Could be LADEN/EMPTY status or vessel name
          if (line4 === 'LADEN' || line4 === 'EMPTY') {
            // Next line after status could be terminal
            const line5 = (i + 4 < lines.length) ? lines[i + 4].trim() : '';
            if (line5 && !line5.match(/^\d{2}\/\d{2}\/\d{2,4}$/) && !line5.match(/^MEDU/) && !line5.match(/^-\s*containers/) && !line5.match(/^eta\s/i)) {
              terminal = line5;
              skipLines = 5;
            } else {
              skipLines = 4;
            }
          } else {
            // It's a vessel name (e.g., "MSC ELODIE NA608A")
            const vesselParts = line4.match(/^(.+?)\s+([A-Z0-9]+[A-Z])$/);
            if (vesselParts) {
              vessel = vesselParts[1];
              voyage = vesselParts[2];
            } else {
              vessel = line4;
            }
            skipLines = 4;
            
            // Check for terminal after vessel
            const lineAfterVessel = (i + 4 < lines.length) ? lines[i + 4].trim() : '';
            if (lineAfterVessel && !lineAfterVessel.match(/^\d{2}\/\d{2}\/\d{2,4}$/) && !lineAfterVessel.match(/^MEDU/) && !lineAfterVessel.match(/^-\s*containers/) && !lineAfterVessel.match(/^eta\s/i) && !lineAfterVessel.match(/^sem informação/i) && lineAfterVessel !== 'LADEN' && lineAfterVessel !== 'EMPTY' && lineAfterVessel !== 'N.A') {
              terminal = lineAfterVessel;
              skipLines = 5;
            }
          }
        }

        const code = mapEventCode(descLine);
        
        current.events.push({
          date: dateStr,
          location: locationLine,
          description: descLine,
          code,
          vessel,
          terminal,
          voyage,
        });

        i += skipLines;
        continue;
      }
    }

    i++;
  }

  if (current) results.push(current);
  return results;
}

// Extract origin and destination from events
function inferOriginDestination(events: ParsedEvent[]): { origem: string; destino: string } {
  // Sort events chronologically (oldest first)
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  
  // Origin: location of first "Export Loaded on Vessel" or first event
  // Destination: location of "Import Discharged from Vessel" or "Import to consignee"
  let origem = '';
  let destino = '';
  
  for (const e of sorted) {
    const d = e.description.toLowerCase();
    if (d.includes('export loaded on vessel') && !origem) {
      origem = e.location;
    }
    if (d.includes('import discharged from vessel') || d.includes('import to consignee')) {
      destino = e.location;
    }
  }
  
  // Fallback: first and last locations
  if (!origem && sorted.length > 0) origem = sorted[0].location;
  if (!destino && sorted.length > 0) destino = sorted[sorted.length - 1].location;
  
  return { origem: origem.toUpperCase(), destino: destino.toUpperCase() };
}

// Extract vessel name from events
function inferVessel(events: ParsedEvent[]): string {
  // Get vessel from "Export Loaded on Vessel" event
  for (const e of events) {
    if (e.description.toLowerCase().includes('loaded on vessel') && e.vessel) {
      return e.vessel;
    }
  }
  return '';
}

// Get the most recent event description for last_event
function getLastEvent(events: ParsedEvent[]): string {
  if (!events.length) return '';
  // Sort by date descending
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const e = sorted[0];
  return `${e.description} - ${e.location}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const results: any[] = [];
  let conn: any = null;
  
  try {
    const body = await req.json();
    let { rawText, dryRun, storageUrl, offset = 0, limit = 30 } = body;

    // If storageUrl provided, fetch text from Supabase Storage
    if (storageUrl && !rawText) {
      console.log('[msc-batch] Fetching from storage:', storageUrl);
      const resp = await fetch(storageUrl);
      if (!resp.ok) throw new Error(`Failed to fetch from storage: ${resp.status}`);
      rawText = await resp.text();
      console.log(`[msc-batch] Fetched ${rawText.length} chars from storage`);
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'rawText or storageUrl is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[msc-batch] Parsing text...');
    const allParsed = parseMscText(rawText);
    console.log(`[msc-batch] Parsed ${allParsed.length} MBLs total, processing offset=${offset} limit=${limit}`);
    const parsed = allParsed.slice(offset, offset + limit);

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        total_mbls: parsed.length,
        mbls: parsed.map(p => ({
          mbl: p.mbl,
          containers: p.containers,
          events_count: p.events.length,
          eta: p.eta,
          noInfo: p.noInfo,
          first_event: p.events[0]?.description,
          last_event: p.events[p.events.length - 1]?.description,
        }))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Connect to MariaDB
    const mysql = await import("npm:mysql2@3.11.3/promise");
    conn = await mysql.createConnection({
      host: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      user: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      database: 'dados_dachser',
      connectTimeout: 15000,
    });
    console.log('[msc-batch] Connected to MariaDB');

    for (const mbl of parsed) {
      if (mbl.noInfo) {
        // Mark as NAO_ENCONTRADO instead of skipping
        try {
          await conn.execute(
            `UPDATE dados_dachser.t_tracking_sea SET container_status = 'NAO_ENCONTRADO', last_event = 'Sem informação no armador', updated_at = NOW() WHERE mbl_id = ?`,
            [mbl.mbl]
          );
          results.push({ mbl: mbl.mbl, status: 'ok_sia', reason: 'sem informação → NAO_ENCONTRADO' });
        } catch (err: any) {
          results.push({ mbl: mbl.mbl, status: 'error', error: err.message });
        }
        continue;
      }

      if (mbl.events.length === 0) {
        results.push({ mbl: mbl.mbl, status: 'skipped', reason: 'no events' });
        continue;
      }

      try {
        const container = mbl.containers[0] || '';
        const { origem, destino } = inferOriginDestination(mbl.events);
        const vessel = inferVessel(mbl.events);
        const lastEvent = getLastEvent(mbl.events);
        const containerStatus = resolveContainerStatus(mbl.events);

        // 1. Delete existing history for this MBL
        await conn.execute(`DELETE FROM dados_dachser.t_tracking_sea_history WHERE mbl_id = ?`, [mbl.mbl]);

        // 2. Insert all events (use first container for all events, or iterate containers)
        for (const evt of mbl.events) {
          const ctr = container; // Use first container
          await conn.execute(
            `INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
             (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, source, created_at) 
             VALUES (?,?,?,?,?,?,?,?,'MANUAL',NOW())`,
            [mbl.mbl, ctr, evt.code, evt.description, evt.date, evt.location, evt.vessel, evt.voyage]
          );
        }

        // 3. Update t_tracking_sea
        const updateFields: Record<string, any> = {
          container: container,
          container_status: containerStatus,
          last_event: lastEvent,
        };
        if (origem) updateFields.origem = origem;
        if (destino) updateFields.destino = destino;
        if (vessel) updateFields.navio = vessel;
        if (mbl.eta) updateFields.eta = mbl.eta;

        const sets = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
        const vals = [...Object.values(updateFields), mbl.mbl];
        await conn.execute(`UPDATE dados_dachser.t_tracking_sea SET ${sets}, updated_at = NOW() WHERE mbl_id = ?`, vals);

        results.push({ 
          mbl: mbl.mbl, 
          status: 'ok', 
          events: mbl.events.length,
          container,
          containerStatus,
          eta: mbl.eta,
        });
      } catch (err: any) {
        console.error(`[msc-batch] Error for ${mbl.mbl}:`, err.message);
        results.push({ mbl: mbl.mbl, status: 'error', error: err.message });
      }
    }

    await conn.end();
    console.log(`[msc-batch] Done: ${results.filter(r => r.status === 'ok').length}/${results.length} MBLs updated`);

    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[msc-batch] Fatal error:', e);
    if (conn) try { await conn.end(); } catch {}
    return new Response(JSON.stringify({ 
      error: e.message, 
      partial_results: results 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
