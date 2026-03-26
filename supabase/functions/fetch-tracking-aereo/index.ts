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
      SELECT
        x.awb_number,
        x.hawb_number,
        x.consignee_nome,
        x.clerk,
        x.clerk_email,
        x.etd,
        x.last_flight,
        x.origin,
        x.destination,
        x.timeline_json,
        x.last_status_code,
        x.description_last,
        x.location_last,
        x.description_penultimate,
        x.location_penultimate,
        x.penultimo_code,
        x.ultimo_code,
        x.penultimo_evento,
        x.ultimo_evento,
        CASE
          WHEN x.ultimo_evento >= x.penultimo_evento THEN x.ultimo_code
          ELSE x.penultimo_code
        END AS last_event
      FROM (
        SELECT
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
          tea.descricao_en AS ultimo_desc,
          tea.code AS ultimo_code,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].description')) AS description_last,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].location')) AS location_last,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')) AS description_penultimate,
          JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].location')) AS location_penultimate,
          a.descricao_en AS penultimo_des,
          a.code AS penultimo_code,
          CASE
            WHEN SUBSTRING(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')), 1, 5) = SUBSTRING(a.descricao_en, 1, 5) THEN a.id
          END AS penultimo_evento,
          CASE
            WHEN SUBSTRING(tde.descricao, 1, 5) = SUBSTRING(tea.descricao_en, 1, 5) THEN tea.id
          END AS ultimo_evento,
          tde.description
        FROM dados_dachser.t_dados_aereo tda
        LEFT JOIN dados_dachser.t_aereo_scraper tdaf
          ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.t_eventos_awb tea
          ON tea.code COLLATE utf8mb4_unicode_ci = tdaf.last_status_code COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.t_eventos_awb a
          ON SUBSTRING(a.descricao_en, 1, 5) = SUBSTRING(JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[1].description')), 1, 5)
        LEFT JOIN dados_dachser.t_description_eventos tde
          ON tde.description COLLATE utf8mb4_unicode_ci = JSON_UNQUOTE(JSON_EXTRACT(tdaf.timeline_json, '$[0].description'))
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
        last_event: row.last_event || row.ultimo_code || row.last_status_code || '',
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
