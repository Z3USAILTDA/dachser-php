import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
  } catch { /* ignore */ }
  return null;
}

// Identify special events and extract dates
function extractSpecialDates(events: TimelineEvent[]): { gateOut: string | null; devolucao: string | null } {
  let gateOut: string | null = null;
  let devolucao: string | null = null;

  for (const event of events) {
    const eventType = (event.event_type || '').toUpperCase();
    const eventCode = (event.event_code || '').toUpperCase();
    const eventDesc = (event.event_description || '').toUpperCase();

    // Gate Out detection
    if (
      eventType.includes('GATE_OUT') || eventType.includes('GATE OUT') ||
      eventCode.includes('GATE_OUT') || eventCode === 'OA' ||
      eventDesc.includes('GATE OUT') || eventDesc.includes('SAIDA DO TERMINAL')
    ) {
      const parsed = parseEventDate(event.event_date);
      if (parsed && (!gateOut || parsed > gateOut)) {
        gateOut = parsed;
      }
    }

    // Empty return / Devolução detection
    if (
      eventType.includes('EMPTY_RETURN') || eventType.includes('GATE_IN') || eventType.includes('GATE IN') ||
      eventCode.includes('EMPTY') || eventCode === 'ER' || eventCode === 'RD' ||
      eventDesc.includes('EMPTY RETURN') || eventDesc.includes('DEVOLUCAO') || eventDesc.includes('GATE IN')
    ) {
      const parsed = parseEventDate(event.event_date);
      if (parsed && (!devolucao || parsed > devolucao)) {
        devolucao = parsed;
      }
    }
  }

  return { gateOut, devolucao };
}

async function fetchContainerTimeline(
  containerNumber: string,
  shippingLine: string,
  apiKey: string
): Promise<{ success: boolean; events?: TimelineEvent[]; error?: string; raw?: any; containerType?: string }> {
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
    
    // Extract container type
    const containerType = containerData.container_type || containerData.size_type || null;
    
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
    return { success: true, events, raw: containerData, containerType };

  } catch (error) {
    console.error(`[FETCH-TIMELINE] Error fetching ${containerNumber}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function callMariaDBProxy(action: string, params: Record<string, any>): Promise<any> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MariaDB proxy error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const JSONCARGO_API_KEY = Deno.env.get("JSONCARGO_API_KEY");
  
  if (!JSONCARGO_API_KEY) {
    return new Response(
      JSON.stringify({ error: "JSONCARGO_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let containerIds: number[] | undefined;
    let limit = 200;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        containerIds = body.container_ids;
        limit = body.limit || limit;
      } catch { /* ignore */ }
    }

    console.log(`[FETCH-TIMELINE] Starting timeline fetch, limit: ${limit}`);

    // Fetch containers from MariaDB (containers without return date)
    const containersResponse = await callMariaDBProxy('demurrage_get_containers', {
      limit: limit
    });

    const containers = containersResponse.data || [];

    if (containers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No containers found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter by containerIds if provided
    let filteredContainers = containers;
    if (containerIds && containerIds.length > 0) {
      filteredContainers = containers.filter((c: any) => containerIds!.includes(c.id));
    }

    console.log(`[FETCH-TIMELINE] Processing ${filteredContainers.length} containers`);

    let processed = 0;
    let eventsInserted = 0;
    let errors = 0;
    const results: { container: string; events: number; error?: string }[] = [];

    for (const container of filteredContainers) {
      const armador = container.armador;
      
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

      // Extract special dates from events
      const specialDates = extractSpecialDates(result.events);

      // Insert events into MariaDB (bulk)
      try {
        const eventsToInsert = result.events.map(event => ({
          container_id: container.id,
          container_number: container.numero,
          event_type: event.event_type,
          event_code: event.event_code || null,
          event_description: event.event_description || null,
          event_datetime: parseEventDate(event.event_date),
          location: event.location || null,
          vessel_name: event.vessel_name || null,
          voyage_number: event.voyage_number || null,
          terminal: event.terminal || null,
          source: 'JSONCARGO',
          raw_data: JSON.stringify(result.raw)
        }));

        await callMariaDBProxy('demurrage_bulk_create_events', {
          container_id: container.id,
          events: eventsToInsert
        });

        eventsInserted += eventsToInsert.length;

        // Update container with extracted dates and container type
        const updateFields: Record<string, any> = {};
        
        if (specialDates.gateOut) {
          updateFields.data_gate_out = specialDates.gateOut;
        }
        if (specialDates.devolucao) {
          updateFields.data_devolucao = specialDates.devolucao;
        }
        if (result.containerType) {
          updateFields.tipo_conteiner = result.containerType;
        }

        if (Object.keys(updateFields).length > 0) {
          await callMariaDBProxy('demurrage_update', {
            id: container.id,
            ...updateFields
          });
        }

        processed++;
        results.push({ container: container.numero, events: eventsToInsert.length });

      } catch (insertError) {
        errors++;
        results.push({ 
          container: container.numero, 
          events: 0, 
          error: insertError instanceof Error ? insertError.message : 'Insert error' 
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[FETCH-TIMELINE] Completed: ${processed} containers, ${eventsInserted} events, ${errors} errors`);

    return new Response(
      JSON.stringify({
        status: 'success',
        total_containers: filteredContainers.length,
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
