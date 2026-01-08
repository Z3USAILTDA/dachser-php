import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContainerWithShipment {
  id: string;
  numero: string;
  shipment: {
    armador: string;
    master: string;
  } | {
    armador: string;
    master: string;
  }[] | null;
}

interface TimelineEvent {
  event_type: string;
  event_code?: string;
  event_description?: string;
  event_date?: string;
  location?: string;
  vessel_name?: string;
  voyage_number?: string;
  terminal?: string;
}

const SHIPPING_LINE_MAP: Record<string, string> = {
  'MSC': 'MSC',
  'MAERSK': 'MAERSK',
  'HAPAG': 'HAPAG_LLOYD',
  'HAPAG-LLOYD': 'HAPAG_LLOYD',
  'HAPAG LLOYD': 'HAPAG_LLOYD',
  'HAPAG_LLOYD': 'HAPAG_LLOYD',
  'HMM': 'HMM',
  'ONE': 'ONE',
  'EVERGREEN': 'EVERGREEN',
  'CMA': 'CMA_CGM',
  'CMA CGM': 'CMA_CGM',
  'CMA-CGM': 'CMA_CGM',
  'CMA_CGM': 'CMA_CGM',
  'COSCO': 'COSCO',
  'ZIM': 'ZIM',
  'YANG MING': 'YANG_MING',
  'YANGMING': 'YANG_MING',
  'YANG_MING': 'YANG_MING',
  'PIL': 'PIL',
  'OOCL': 'OOCL',
  'WAN HAI': 'WAN_HAI',
  'WANHAI': 'WAN_HAI',
  'WAN_HAI': 'WAN_HAI'
};

function normalizeShippingLine(input: string): string {
  const upper = input.toUpperCase().trim();
  return SHIPPING_LINE_MAP[upper] || upper.replace(/[\s-]+/g, '_');
}

function parseEventDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString();
  } catch { /* ignore */ }
  return null;
}

async function fetchContainerTimeline(
  containerNumber: string,
  shippingLine: string,
  apiKey: string
): Promise<{ success: boolean; events?: TimelineEvent[]; error?: string; raw?: any }> {
  const carrier = normalizeShippingLine(shippingLine);
  const apiUrl = `http://api.jsoncargo.com/api/v1/containers/${encodeURIComponent(containerNumber)}?shipping_line=${carrier}`;
  
  console.log(`[FETCH-TIMELINE] Fetching: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `${response.status} - ${errorText}` };
    }

    const data = await response.json();
    const containerData = data.data;
    
    if (!containerData) {
      return { success: false, error: 'No data returned from API' };
    }

    const events: TimelineEvent[] = [];
    
    if (containerData.tracking_events && Array.isArray(containerData.tracking_events)) {
      for (const event of containerData.tracking_events) {
        events.push({
          event_type: event.event_type || event.type || 'TRACKING',
          event_code: event.event_code || event.code,
          event_description: event.description || event.event_description || event.message,
          event_date: event.event_date || event.date || event.timestamp,
          location: event.location || event.port || event.terminal,
          vessel_name: event.vessel || event.vessel_name,
          voyage_number: event.voyage || event.voyage_number,
          terminal: event.terminal || event.facility
        });
      }
    }
    
    if (containerData.events && Array.isArray(containerData.events)) {
      for (const event of containerData.events) {
        events.push({
          event_type: event.event_type || event.type || 'EVENT',
          event_code: event.event_code || event.code,
          event_description: event.description || event.event_description,
          event_date: event.event_date || event.date || event.timestamp,
          location: event.location || event.port,
          vessel_name: event.vessel || event.vessel_name,
          voyage_number: event.voyage || event.voyage_number,
          terminal: event.terminal
        });
      }
    }

    if (containerData.moves && Array.isArray(containerData.moves)) {
      for (const move of containerData.moves) {
        events.push({
          event_type: move.move_type || 'MOVE',
          event_code: move.code,
          event_description: move.description || move.activity,
          event_date: move.date || move.timestamp,
          location: move.location || move.facility,
          vessel_name: move.vessel,
          voyage_number: move.voyage,
          terminal: move.terminal
        });
      }
    }

    if (events.length === 0 && containerData.container_status) {
      events.push({
        event_type: 'STATUS',
        event_description: containerData.container_status,
        event_date: containerData.last_updated || new Date().toISOString(),
        location: containerData.current_location || containerData.location
      });
    }

    console.log(`[FETCH-TIMELINE] Found ${events.length} events for ${containerNumber}`);
    return { success: true, events, raw: containerData };

  } catch (error) {
    console.error(`[FETCH-TIMELINE] Error fetching ${containerNumber}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const JSONCARGO_API_KEY = Deno.env.get("JSONCARGO_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!JSONCARGO_API_KEY) {
    return new Response(
      JSON.stringify({ error: "JSONCARGO_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let containerIds: string[] | undefined;
    let limit = 200;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        containerIds = body.container_ids;
        limit = body.limit || limit;
      } catch { /* ignore */ }
    }

    console.log(`[FETCH-TIMELINE] Starting timeline fetch, limit: ${limit}`);

    let query = supabase
      .from('containers')
      .select('id, numero, shipment:shipments(armador, master)')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (containerIds && containerIds.length > 0) {
      query = query.in('id', containerIds);
    }

    const { data: containers, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!containers || containers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No containers found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[FETCH-TIMELINE] Processing ${containers.length} containers`);

    let processed = 0;
    let eventsInserted = 0;
    let errors = 0;
    const results: { container: string; events: number; error?: string }[] = [];

    for (const container of containers) {
      const shipment = Array.isArray(container.shipment) ? container.shipment[0] : container.shipment;
      const armador = shipment?.armador;
      
      if (!armador) {
        results.push({ container: container.numero, events: 0, error: 'No armador' });
        continue;
      }

      const result = await fetchContainerTimeline(container.numero, armador, JSONCARGO_API_KEY);
      
      if (!result.success || !result.events || result.events.length === 0) {
        errors++;
        results.push({ container: container.numero, events: 0, error: result.error || 'No events' });
        continue;
      }

      const eventsToInsert = result.events.map(event => ({
        container_id: container.id,
        container_number: container.numero,
        event_type: event.event_type,
        event_code: event.event_code,
        event_description: event.event_description,
        event_date: parseEventDate(event.event_date),
        location: event.location,
        vessel_name: event.vessel_name,
        voyage_number: event.voyage_number,
        terminal: event.terminal,
        raw_data: result.raw,
        source: 'JSONCARGO'
      }));

      await supabase.from('container_events').delete().eq('container_id', container.id);

      const { error: insertError } = await supabase.from('container_events').insert(eventsToInsert);

      if (insertError) {
        errors++;
        results.push({ container: container.numero, events: 0, error: insertError.message });
      } else {
        processed++;
        eventsInserted += eventsToInsert.length;
        results.push({ container: container.numero, events: eventsToInsert.length });
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[FETCH-TIMELINE] Completed: ${processed} containers, ${eventsInserted} events, ${errors} errors`);

    return new Response(
      JSON.stringify({
        status: 'success',
        total_containers: containers.length,
        processed,
        events_inserted: eventsInserted,
        errors,
        results: results.slice(0, 50)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[FETCH-TIMELINE] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
