import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function queryWithRetry(client: Client, sql: string, params: any[] = [], maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.query(sql, params);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('MariaDB credentials not configured');
    }

    client = await new Client().connect({
      hostname: host,
      port,
      db: database,
      username,
      password,
    });

    // Main query: fetch all tracking data from t_dados_aereo + t_aereo_scraper + t_eventos_awb + t_description_eventos
    const sql = `
      select
        *
      from
        (
        select
          tda.awb_number,
          tda.hawb_number,
          tda.consignee_nome,
          tda.clerk,
          tda.clerk_email,
          tda.etd,
          tdaf.last_flight,
          tdaf.origin,
          tdaf.destination,
          tdaf.timeline_json,
          tdaf.last_status_code,
          tea.descricao_en,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].description')) as description_last,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].location')) as location_last,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')) as description_penultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].location')) as location_penultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[2].description')) as description_antepenultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[2].location')) as location_antepenultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[3].description')) as description_before_antepenultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[3].location')) as location_before_antepenultimate,
          a.descricao_en penultimo_des,
          a.code penultimo_code,
          b.descricao_en antepenultimo_des,
          b.code antepenultimo_code,
          c.descricao_en antes_antepenultimo_des,
          c.code antes_antepenultimo_code,
          tea.descricao_en ultimo_desc,
          tea.code ultimo_code,
          tde.descricao,
          case
            when substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')), 1, 5) = substring(a.descricao_en, 1, 5) then a.id
          end as penultimo_evento,
          case
            when substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[2].description')), 1, 5) = substring(b.descricao_en, 1, 5) then b.id
          end as antepenultimo_evento,
          case
            when substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[3].description')), 1, 5) = substring(c.descricao_en, 1, 5) then c.id
          end as antes_antepenultimo_evento,
          case
            when substring(tde.descricao, 1, 5) = substring(teau.descricao_en, 1, 5) then tea.id
          end as ultimo_evento,
          tde.description
        from
          dados_dachser.t_dados_aereo tda
        left join dados_dachser.t_aereo_scraper tdaf
          on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
        left join dados_dachser.t_eventos_awb tea
          on tea.code collate utf8mb4_unicode_ci = tdaf.last_status_code collate utf8mb4_unicode_ci
        left join dados_dachser.t_eventos_awb a
          on substring(a.descricao_en, 1, 5) = substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')), 1, 5)
        left join dados_dachser.t_eventos_awb b
          on substring(b.descricao_en, 1, 5) = substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[2].description')), 1, 5)
        left join dados_dachser.t_eventos_awb c
          on substring(c.descricao_en, 1, 5) = substring(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[3].description')), 1, 5)
        left join dados_dachser.t_description_eventos tde
          on tde.description collate utf8mb4_unicode_ci = JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].description'))
        left join dados_dachser.t_eventos_awb teau
          on teau.code collate utf8mb4_unicode_ci = tde.code
        ) x
    `;

    console.log('Executing tracking aereo query...');
    const rows = await queryWithRetry(client, sql);
    console.log(`Query returned ${rows?.length || 0} rows`);

    // Normalize the data
    const data = (rows || []).map((row: any) => {
      // Parse timeline_json
      let timeline: any[] = [];
      try {
        if (row.timeline_json) {
          timeline = typeof row.timeline_json === 'string'
            ? JSON.parse(row.timeline_json)
            : row.timeline_json;
        }
      } catch (e) {
        console.warn(`Failed to parse timeline_json for AWB ${row.awb_number}:`, e);
      }

      // Get last event date from timeline
      let lastEventDate: string | null = null;
      if (timeline.length > 0) {
        // Find the event matching last_event code in timeline
        const lastEvt = timeline[0]; // First event in timeline (most recent by scraper order)
        lastEventDate = lastEvt?.date || lastEvt?.timestamp || null;
      }

      // Determine last_event using hierarchy rules
      let lastEvent = '';
      if (row.ultimo_code === 'DLV' || row.penultimo_code === 'DLV' || 
          row.antepenultimo_code === 'DLV' || row.antes_antepenultimo_code === 'DLV') {
        lastEvent = 'DLV';
      } else {
        const candidates = [
          { id: row.ultimo_evento, code: row.ultimo_code },
          { id: row.penultimo_evento, code: row.penultimo_code },
          { id: row.antepenultimo_evento, code: row.antepenultimo_code },
          { id: row.antes_antepenultimo_evento, code: row.antes_antepenultimo_code },
        ].filter(c => c.id != null);

        if (candidates.length > 0) {
          const winner = candidates.reduce((a, b) => (Number(a.id) >= Number(b.id) ? a : b));
          lastEvent = winner.code || '';
        } else {
          lastEvent = row.ultimo_code || row.last_status_code || '';
        }
      }

      return {
        awb_number: row.awb_number || '',
        hawb_number: row.hawb_number || '',
        consignee_nome: row.consignee_nome || '',
        clerk: row.clerk || '',
        clerk_email: row.clerk_email || '',
        etd: row.etd || null,
        last_flight: row.last_flight || '',
        origin: row.origin || '',
        destination: row.destination || '',
        timeline_json: timeline,
        last_status_code: row.last_status_code || '',
        last_event: lastEvent,
        last_event_description: row.description_last || '',
        last_event_date: lastEventDate,
        last_event_location: row.location_last || '',
        penultimate_location: row.location_penultimate || '',
      };
    });

    await client.close();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('fetch-tracking-aereo error:', error);

    if (client) {
      try { await client.close(); } catch (_) {}
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
