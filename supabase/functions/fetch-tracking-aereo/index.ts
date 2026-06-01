import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache em memória (escopo do módulo) — TTL 5min. Persistido em public.air_tracking_cache
// para sobreviver à reciclagem de isolates do Edge Runtime.
let discrepancyCache: { at: number; data: Record<string, { pieces_discrepancy: boolean; baseline_pieces: number | null; has_dis_event: boolean }> } | null = null;
const DISCREPANCY_CACHE_TTL_MS = 5 * 60_000;

let routeCache: { at: number; data: Record<string, { origin: string | null; destination: string | null; conexoes: string | null; status: string }> } | null = null;
const ROUTE_CACHE_TTL_MS = 5 * 60_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

async function hydrateCachesFromDb(): Promise<void> {
  if (!supabaseAdmin) return;
  const discFresh = discrepancyCache && Date.now() - discrepancyCache.at < DISCREPANCY_CACHE_TTL_MS;
  const routeFresh = routeCache && Date.now() - routeCache.at < ROUTE_CACHE_TTL_MS;
  if (discFresh && routeFresh) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("air_tracking_cache")
      .select("cache_key, data, updated_at")
      .in("cache_key", ["discrepancy", "route"]);
    if (error || !data) return;
    for (const row of data) {
      const at = new Date(row.updated_at).getTime();
      if (row.cache_key === "discrepancy" && !discFresh) {
        discrepancyCache = { at, data: (row.data as any) || {} };
        console.log(`[DISC] Hydrated from DB: ${Object.keys(discrepancyCache.data).length} records, age=${Math.round((Date.now() - at) / 1000)}s`);
      } else if (row.cache_key === "route" && !routeFresh) {
        routeCache = { at, data: (row.data as any) || {} };
        console.log(`[ROUTE] Hydrated from DB: ${Object.keys(routeCache.data).length} records, age=${Math.round((Date.now() - at) / 1000)}s`);
      }
    }
  } catch (err) {
    console.warn("[CACHE] Hydrate failed:", (err as any)?.message);
  }
}

async function persistCacheToDb(key: "discrepancy" | "route", data: Record<string, unknown>): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("air_tracking_cache")
      .upsert({ cache_key: key, data, updated_at: new Date().toISOString() }, { onConflict: "cache_key" });
    if (error) console.warn(`[CACHE] Persist ${key} failed:`, error.message);
  } catch (err) {
    console.warn(`[CACHE] Persist ${key} threw:`, (err as any)?.message);
  }
}

async function queryWithRetry(client: Client, sql: string, params: any[] = [], maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.query(sql, params);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function sendFailureEmail(failedRows: any[]) {
  if (failedRows.length === 0) return;

  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  const smtpPort = Deno.env.get("SMTP_PORT");
  const smtpFrom = Deno.env.get("SMTP_FROM_EMAIL") || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("SMTP not configured, skipping failure email");
    return;
  }

  const tableRows = failedRows
    .map((r) => `<tr><td style="border:1px solid #ddd;padding:6px">${r.awb}</td><td style="border:1px solid #ddd;padding:6px">${r.hawb}</td><td style="border:1px solid #ddd;padding:6px">${r.cliente}</td></tr>`)
    .join("");

  const html = `
    <h2>Tracking Aéreo — Processos com falha no rastreio</h2>
    <p>Total: ${failedRows.length} processos sem status resolvido.</p>
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #ddd;padding:6px">AWB</th>
        <th style="border:1px solid #ddd;padding:6px">HAWB</th>
        <th style="border:1px solid #ddd;padding:6px">Cliente</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: parseInt(smtpPort || "587"),
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });
    await client.send({
      from: smtpFrom!,
      to: "larissa@z3us.ai",
      subject: "Tracking Aéreo — Processos com falha no rastreio",
      content: "Veja a versão HTML deste e-mail.",
      html,
    });
    await client.close();
    console.log(`Failure email sent with ${failedRows.length} rows`);
  } catch (err) {
    console.error("Failed to send failure email:", err);
  }
}

const IATA_CITY_MAP: Record<string, string> = {
  "GUARULHOS": "GRU", "SAO PAULO": "GRU", "CAMPINAS": "VCP", "VIRACOPOS": "VCP",
  "CURITIBA": "CWB", "PORTO ALEGRE": "POA", "RIO DE JANEIRO": "GIG",
  "BELO HORIZONTE": "CNF", "SALVADOR": "SSA", "RECIFE": "REC",
  "FORTALEZA": "FOR", "BRASILIA": "BSB", "MANAUS": "MAO", "BELEM": "BEL",
  "GOIANIA": "GYN", "VITORIA": "VIX", "FLORIANOPOLIS": "FLN", "NATAL": "NAT",
  "FRANKFURT": "FRA", "PARIS": "CDG", "AMSTERDAM": "AMS", "LONDON": "LHR",
  "MADRID": "MAD", "MILAN": "MXP", "ROME": "FCO", "LISBON": "LIS",
  "MUNICH": "MUC", "ZURICH": "ZRH", "VIENNA": "VIE", "BRUSSELS": "BRU",
  "BARCELONA": "BCN", "VALENCIA": "VLC", "OSLO": "OSL", "STOCKHOLM": "ARN",
  "NEW YORK": "JFK", "MIAMI": "MIA", "CHICAGO": "ORD", "LOS ANGELES": "LAX",
  "ATLANTA": "ATL", "DALLAS": "DFW", "HOUSTON": "IAH", "BOSTON": "BOS",
  "TORONTO": "YYZ", "MONTREAL": "YUL", "MEXICO CITY": "MEX",
  "BOGOTA": "BOG", "SANTIAGO": "SCL", "BUENOS AIRES": "EZE", "LIMA": "LIM",
  "DUBAI": "DXB", "HONG KONG": "HKG", "SHANGHAI": "PVG", "BEIJING": "PEK",
  "TOKYO": "NRT", "SINGAPORE": "SIN", "SYDNEY": "SYD", "AUCKLAND": "AKL",
  "JOHANNESBURG": "JNB", "NAIROBI": "NBO", "ADDIS ABABA": "ADD",
};

function extractIATA(loc: string): string {
  if (!loc) return "";
  const t = loc.trim();
  // Rule 1: IATA code in parentheses e.g. "Frankfurt Main (FRA)"
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  // Rule 2: is already a bare 3-letter IATA code
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  // Rule 3: city/airport name lookup (case-insensitive)
  const upper = t.toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (IATA_CITY_MAP[upper]) return IATA_CITY_MAP[upper];
  const firstWord = upper.split(" ")[0];
  if (firstWord && firstWord.length > 3 && IATA_CITY_MAP[firstWord]) return IATA_CITY_MAP[firstWord];
  // Rule 4: ends with a 3-letter code after space or hyphen
  const endMatch = t.match(/[\s-]([A-Z]{3})$/i);
  if (endMatch) return endMatch[1].toUpperCase();
  // Fallback: strip non-letters and take first 3 — last resort only
  const letters = t.replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase();
  return letters;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const host = (Deno.env.get("MARIADB_AIR_HOST") || Deno.env.get("MARIADB_OPS_HOST"));
    const port = parseInt((Deno.env.get("MARIADB_AIR_PORT") || Deno.env.get("MARIADB_OPS_PORT")) || "3306");
    const database = (Deno.env.get("MARIADB_AIR_DATABASE") || Deno.env.get("MARIADB_OPS_DATABASE"));
    const username = (Deno.env.get("MARIADB_AIR_USER") || Deno.env.get("MARIADB_OPS_USER"));
    const password = (Deno.env.get("MARIADB_AIR_PASSWORD") || Deno.env.get("MARIADB_OPS_PASSWORD"));

    if (!host || !database || !username || !password) {
      throw new Error("MariaDB credentials not configured");
    }

    client = await new Client().connect({
      hostname: host,
      port,
      db: database,
      username,
      password,
    });

    // Normalization for description-based lookup matching
    const normalizeDesc = (s: string): string =>
      (s || "").toUpperCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

    // Step 1: Main query with SLA calculation via CTE. Defined first so we can
    // kick off all three queries in parallel (no JS state dependency on lookups).
    // Returns the top 6 timeline events by physical array position ($[0..5]).
    // 6 slots ensure operational events are captured even when preceded by
    // multiple BKD entries (BKDs occur at start for every planned airport).
    // The JS post-processing (pickTopByIATA) elects the most recent operational
    // event, filtering BKDs when other events exist.
    const sql = `
      with base as (
        select
            tda.awb_number as AWB,
            tda.hawb_number as HAWB,
            tda.consignee_nome as CLIENTE,
            tdaf.origin as ORIGEM,
            tdaf.destination as DESTINO,
            tda.clerk as ANALISTA,
            tdaf.last_status_code,
            tdaf.timeline_json as TIMELINE,
            json_unquote(json_extract(tdaf.timeline_json, '$[0].description')) as desc0,
            json_unquote(json_extract(tdaf.timeline_json, '$[1].description')) as desc1,
            json_unquote(json_extract(tdaf.timeline_json, '$[2].description')) as desc2,
            json_unquote(json_extract(tdaf.timeline_json, '$[3].description')) as desc3,
            json_unquote(json_extract(tdaf.timeline_json, '$[4].description')) as desc4,
            json_unquote(json_extract(tdaf.timeline_json, '$[5].description')) as desc5,
            json_unquote(json_extract(tdaf.timeline_json, '$[0].location'))    as loc0,
            json_unquote(json_extract(tdaf.timeline_json, '$[1].location'))    as loc1,
            json_unquote(json_extract(tdaf.timeline_json, '$[2].location'))    as loc2,
            json_unquote(json_extract(tdaf.timeline_json, '$[3].location'))    as loc3,
            json_unquote(json_extract(tdaf.timeline_json, '$[4].location'))    as loc4,
            json_unquote(json_extract(tdaf.timeline_json, '$[5].location'))    as loc5,
            json_unquote(json_extract(tdaf.timeline_json, '$[0].date'))        as date0,
            json_unquote(json_extract(tdaf.timeline_json, '$[1].date'))        as date1,
            json_unquote(json_extract(tdaf.timeline_json, '$[2].date'))        as date2,
            json_unquote(json_extract(tdaf.timeline_json, '$[3].date'))        as date3,
            json_unquote(json_extract(tdaf.timeline_json, '$[4].date'))        as date4,
            json_unquote(json_extract(tdaf.timeline_json, '$[5].date'))        as date5,
            json_unquote(json_extract(tdaf.timeline_json, '$[0].time'))        as time0,
            json_unquote(json_extract(tdaf.timeline_json, '$[0].status_code')) as code0_native,
            json_unquote(json_extract(tdaf.timeline_json, '$[1].status_code')) as code1_native,
            json_unquote(json_extract(tdaf.timeline_json, '$[2].status_code')) as code2_native,
            json_unquote(json_extract(tdaf.timeline_json, '$[3].status_code')) as code3_native,
            json_unquote(json_extract(tdaf.timeline_json, '$[4].status_code')) as code4_native,
            json_unquote(json_extract(tdaf.timeline_json, '$[5].status_code')) as code5_native
        from dados_dachser.t_dados_aereo tda
        left join dados_dachser.t_fato_aereo tdaf
            on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
           and json_valid(tdaf.hawbs_json)
           and json_contains(tdaf.hawbs_json, json_array(tda.hawb_number))
        where
            (tda.master_insert >= '2026-03-20' or tda.created_at >= '2026-03-20')
      ),
      event_time as (
        select
            b.*,
            str_to_date(
                concat(
                    nullif(b.date0, ''),
                    case
                        when nullif(b.time0, '') is not null then concat(' ', b.time0)
                        else ' 00:00'
                    end
                ),
                '%d %b %Y %H:%i'
            ) as data_evento_base
        from base b
      ),
      sla_calc as (
        select
            e.*,
            timestampdiff(second, e.data_evento_base, now()) / 3600 as sla_hours_in_status,
            case
                when e.last_status_code in ('ARR', 'ARR - DESTINO', 'ARR - CONEXAO', 'ARR - CONEXÃO', 'RCF', 'NFD', 'AWD', 'AWR', 'CCD', 'DLV', 'POD')
                    then null
                when e.last_status_code = 'BKD' then 12
                when e.last_status_code = 'RCS' then 12
                when e.last_status_code = 'MAN' then 3
                when e.last_status_code = 'PRE' then 6
                when e.last_status_code = 'RCF' then 6
                when e.last_status_code = 'DEP' then 48
                when e.last_status_code = 'FOH' then 12
                when e.last_status_code = 'FWB' then 24
                when e.last_status_code = 'RDP' then 3
                when e.last_status_code = 'RFC' then 6
                else 24
            end as sla_limite_horas
        from event_time e
      )
      select
          s.*,
          round(s.sla_hours_in_status, 2) as hours_in_status_rounded,
          case
              when s.sla_limite_horas is null or s.sla_limite_horas = 0 then null
              else round(s.sla_hours_in_status / s.sla_limite_horas, 4)
          end as sla_ratio,
          case
              when s.last_status_code in ('ARR', 'ARR - DESTINO', 'ARR - CONEXAO', 'ARR - CONEXÃO', 'RCF', 'NFD', 'AWD', 'AWR', 'CCD', 'DLV', 'POD')
                  then 'VERDE'
              when s.sla_limite_horas is null or s.sla_limite_horas = 0 then null
              when s.sla_hours_in_status / s.sla_limite_horas < 0.7 then 'VERDE'
              when s.sla_hours_in_status / s.sla_limite_horas < 1.0 then 'AMARELO'
              else 'VERMELHO'
          end as sla_cor,
          case
              when s.sla_hours_in_status is null then null
              when s.sla_hours_in_status < 24
                  then concat(
                      floor(s.sla_hours_in_status), 'h',
                      lpad(floor((s.sla_hours_in_status - floor(s.sla_hours_in_status)) * 60), 2, '0')
                  )
              else concat(
                  floor(s.sla_hours_in_status / 24), 'd',
                  lpad(floor(mod(s.sla_hours_in_status, 24)), 2, '0'), 'h'
              )
          end as sla_tempo_formatado,
          case
              when s.last_status_code in ('ARR', 'ARR - DESTINO', 'ARR - CONEXAO', 'ARR - CONEXÃO', 'RCF', 'NFD', 'AWD', 'AWR', 'CCD', 'DLV', 'POD')
                  then 'Status pós-chegada/final'
              when s.sla_limite_horas is null then null
              else concat(round(s.sla_hours_in_status / s.sla_limite_horas * 100, 1), '% do limite')
          end as sla_tooltip
      from sla_calc s
    `;

    // Step 2: Kick off all 3 queries in PARALLEL — main + 2 lookup tables.
    // Saves ~2s of wall-clock vs sequential. Lookups (eventsRows/descRows) are small
    // dictionary tables; main query is the heavy CTE.
    console.log("Executing tracking aereo query (v3 parallel) + lookups...");
    const [eventsRows, descRows, rows] = await Promise.all([
      queryWithRetry(client, `SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb`),
      queryWithRetry(client, `SELECT code, description FROM dados_dachser.t_description_eventos`),
      queryWithRetry(client, sql),
    ]);
    console.log(`Query returned ${rows?.length || 0} rows`);

    // Step 3: Build event codes lookup from eventsRows.
    // t_eventos_awb has 'descricao_en' (English description per IATA code)
    const eventMap: Record<string, { id: number; descricao_en: string }> = {};
    const EXACT_MAP: Map<string, string> = new Map();
    const KEYWORD_INDEX: Array<{ needle: string; code: string }> = [];
    for (const e of eventsRows || []) {
      const code = (e.code || "").toString().trim().toUpperCase();
      if (!code) continue;
      eventMap[code] = { id: Number(e.id), descricao_en: e.descricao_en || "" };
      const desc = normalizeDesc(e.descricao_en || "");
      if (desc) {
        if (!EXACT_MAP.has(desc)) EXACT_MAP.set(desc, code);
        KEYWORD_INDEX.push({ needle: desc, code });
      }
    }

    // Step 4: Build description_eventos lookup — authoritative description→code mapping
    const descLookup: Array<{ code: string; description: string }> = (descRows || []).map((d: any) => ({
      code: d.code || "",
      description: (d.description || "").toUpperCase(),
    }));
    for (const d of descRows || []) {
      const code = (d.code || "").toString().trim().toUpperCase();
      const desc = normalizeDesc(d.description || "");
      if (!code || !desc) continue;
      if (!EXACT_MAP.has(desc)) EXACT_MAP.set(desc, code);
      KEYWORD_INDEX.push({ needle: desc, code });
    }
    // Sort needles by length DESC — longer/more specific needle wins
    KEYWORD_INDEX.sort((a, b) => b.needle.length - a.needle.length);
    console.log(`Loaded ${EXACT_MAP.size} exact descriptions, ${KEYWORD_INDEX.length} keyword needles`);

    // Step 3b: For rows with empty CLIENTE, fetch from t_master_dados
    const missingClienteHawbs = (rows || [])
      .filter((r: any) => !r.CLIENTE || r.CLIENTE.toString().trim() === "")
      .map((r: any) => r.HAWB)
      .filter((h: string) => h && h !== "NI");

    const clienteMap: Record<string, string> = {};
    if (missingClienteHawbs.length > 0) {
      const uniqueHawbs = [...new Set(missingClienteHawbs)] as string[];
      // Batch lookup in chunks of 100
      for (let i = 0; i < uniqueHawbs.length; i += 100) {
        const chunk = uniqueHawbs.slice(i, i + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const masterRows = await queryWithRetry(
          client,
          `SELECT hawb, cliente FROM dados_dachser.t_master_dados WHERE hawb IN (${placeholders}) AND cliente IS NOT NULL AND cliente != ''`,
          chunk
        );
        for (const mr of masterRows || []) {
          if (mr.hawb && mr.cliente) clienteMap[mr.hawb] = mr.cliente;
        }
      }
      console.log(`Fetched ${Object.keys(clienteMap).length} client names from t_master_dados for ${uniqueHawbs.length} missing`);
    }

    // Step 3c: Load visibility table
    let visibilityMap: Record<string, string> = {};
    try {
      const visRows = await queryWithRetry(client, `SELECT awb, hawb, hide_reason FROM dados_dachser.t_air_process_visibility`);
      for (const v of visRows || []) {
        const key = `${v.awb || ""}|${v.hawb || ""}`;
        visibilityMap[key] = v.hide_reason || "";
      }
      console.log(`Loaded ${Object.keys(visibilityMap).length} visibility records`);
    } catch (err) {
      console.warn("Could not load t_air_process_visibility (may not exist yet):", err);
    }

    // Step 3d: Discrepancy data (pieces divergence + DIS events + prefix 996).
    // ALWAYS serve from cache (fresh or stale) to avoid blowing the 2s CPU budget.
    // Refresh happens in background via EdgeRuntime.waitUntil below when stale/missing.
    let discrepancyMap: Record<string, { pieces_discrepancy: boolean; baseline_pieces: number | null; has_dis_event: boolean }> =
      discrepancyCache?.data ?? {};
    const discCacheStale = !discrepancyCache || (Date.now() - discrepancyCache.at >= DISCREPANCY_CACHE_TTL_MS);
    if (discrepancyCache) {
      console.log(`[DISC] Using ${discCacheStale ? "stale" : "fresh"} cache (${Object.keys(discrepancyMap).length} records, age=${Math.round((Date.now() - discrepancyCache.at) / 1000)}s)`);
    } else {
      console.log("[DISC] Cold start — empty discrepancy this poll, will populate in background");
    }
    const allowBackgroundRefresh = true;
    if (discCacheStale && allowBackgroundRefresh) {
      // Snapshot of AWBs in this poll — narrows the JSON_TABLE universe dramatically.
      const activeAwbsDisc = [...new Set(
        (rows || [])
          .map((r: any) => (r.AWB || "").toString().trim())
          .filter((a: string) => a.length > 0)
      )] as string[];

      const discBgTask = (async () => {
        let bgClient: Client | null = null;
        try {
          bgClient = await new Client().connect({
            hostname: Deno.env.get("MARIADB_AIR_HOST") || "",
            port: parseInt(Deno.env.get("MARIADB_AIR_PORT") || "3306"),
            username: Deno.env.get("MARIADB_AIR_USER") || "",
            password: Deno.env.get("MARIADB_AIR_PASSWORD") || "",
            db: Deno.env.get("MARIADB_AIR_DATABASE") || "dados_dachser",
            timeout: 30000,
          });

          const awbInClause = activeAwbsDisc.length > 0
            ? `AND tda.awb_number IN (${activeAwbsDisc.map(a => `'${a.replace(/'/g, "''")}'`).join(",")})`
            : "AND 1=0";

          const discrepancySql = `
            WITH base_disc AS (
              SELECT
                tda.awb_number AS awb,
                tda.hawb_number AS hawb,
                tdaf.timeline_json
              FROM dados_dachser.t_dados_aereo tda
              INNER JOIN dados_dachser.t_fato_aereo tdaf
                ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
               AND JSON_VALID(tdaf.hawbs_json)
               AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
              WHERE (tda.master_insert >= '2026-03-20' OR tda.created_at >= '2026-03-20')
                ${awbInClause}
                AND tdaf.timeline_json IS NOT NULL
                AND JSON_VALID(tdaf.timeline_json)
            ),
            eventos_disc AS (
              SELECT
                b.awb,
                b.hawb,
                jt.ordem,
                jt.description,
                CASE
                  -- Ignore booking/reservation events: pieces shown are flight capacity, not actual cargo
                  WHEN UPPER(COALESCE(jt.description, '')) REGEXP '(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)'
                    THEN NULL
                  WHEN UPPER(COALESCE(jt.description, '')) REGEXP 'OFFLOADED|OFLD'
                       AND (
                           UPPER(jt.description) REGEXP '(^|[^0-9])0[[:space:]]+PIECES?([^A-Z]|$)'
                           OR UPPER(jt.description) REGEXP 'QTY:[[:space:]]*0([^0-9]|$)'
                           OR UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*0([^0-9]|$)'
                       )
                  THEN NULL
                  WHEN UPPER(jt.description) REGEXP 'QTY:[[:space:]]*[1-9][0-9]*'
                    THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), 'QTY:[[:space:]]*[1-9][0-9]*'), '[1-9][0-9]*') AS UNSIGNED)
                  WHEN UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*[1-9][0-9]*'
                    THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), 'PIECES?:[[:space:]]*[1-9][0-9]*'), '[1-9][0-9]*') AS UNSIGNED)
                  WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]+PIECE\\\\(S\\\\)'
                    THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), '[1-9][0-9]*[[:space:]]+PIECE\\\\(S\\\\)'), '[1-9][0-9]*') AS UNSIGNED)
                  WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]+PIECES?'
                    THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), '[1-9][0-9]*[[:space:]]+PIECES?'), '[1-9][0-9]*') AS UNSIGNED)
                  WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]*/[[:space:]]*[0-9]+([.,][0-9]+)?[[:space:]]*(KGS|KG|LBS|LB)'
                    THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), '[1-9][0-9]*[[:space:]]*/[[:space:]]*[0-9]+([.,][0-9]+)?[[:space:]]*(KGS|KG|LBS|LB)'), '[1-9][0-9]*') AS UNSIGNED)
                  ELSE NULL
                END AS pieces_extraidas,
                CASE
                  WHEN UPPER(COALESCE(jt.description, '')) REGEXP '(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)' THEN 1
                  ELSE 0
                END AS is_dis_event
              FROM base_disc b
              JOIN JSON_TABLE(
                b.timeline_json,
                '$[*]' COLUMNS (
                  ordem FOR ORDINALITY,
                  description VARCHAR(1000) PATH '$.description'
                )
              ) jt
            ),
            baseline_pieces AS (
              SELECT awb, hawb, pieces_extraidas AS baseline_pecas
              FROM (
                SELECT
                  e.*,
                  ROW_NUMBER() OVER (PARTITION BY e.awb, e.hawb ORDER BY e.ordem) AS rn
                FROM eventos_disc e
                WHERE e.pieces_extraidas IS NOT NULL
                  AND e.pieces_extraidas > 0
              ) x
              WHERE x.rn = 1
            ),
            ultimo_evento_absoluto AS (
              SELECT
                awb,
                hawb,
                is_dis_event AS ultimo_is_dis_event
              FROM (
                SELECT
                  e.*,
                  ROW_NUMBER() OVER (PARTITION BY e.awb, e.hawb ORDER BY e.ordem DESC) AS rn
                FROM eventos_disc e
              ) x
              WHERE x.rn = 1
            ),
            eventos_validos_pecas AS (
              SELECT
                e.awb,
                e.hawb,
                e.ordem,
                e.pieces_extraidas,
                ROW_NUMBER() OVER (
                  PARTITION BY e.awb, e.hawb
                  ORDER BY e.ordem DESC
                ) AS rn_desc,
                SUM(e.pieces_extraidas) OVER (
                  PARTITION BY e.awb, e.hawb
                  ORDER BY e.ordem DESC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS soma_pecas_desc
              FROM eventos_disc e
              WHERE e.pieces_extraidas IS NOT NULL
                AND e.pieces_extraidas > 0
            ),
            ultimo_evento_pecas AS (
              SELECT
                awb,
                hawb,
                pieces_extraidas AS ultimo_evento_pecas
              FROM eventos_validos_pecas
              WHERE rn_desc = 1
            ),
            normalizado_por_soma_final AS (
              SELECT
                v.awb,
                v.hawb,
                MAX(
                  CASE
                    WHEN bp.baseline_pecas IS NOT NULL
                     AND v.rn_desc >= 2
                     AND v.soma_pecas_desc = bp.baseline_pecas
                    THEN 1
                    ELSE 0
                  END
                ) AS normalizado_soma_final
              FROM eventos_validos_pecas v
              LEFT JOIN baseline_pieces bp
                ON bp.awb = v.awb
               AND bp.hawb = v.hawb
              GROUP BY v.awb, v.hawb
            ),
            agregado_disc AS (
              SELECT
                ev.awb,
                ev.hawb,
                MIN(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas > 0 THEN ev.pieces_extraidas END) AS min_pieces,
                MAX(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas > 0 THEN ev.pieces_extraidas END) AS max_pieces
              FROM eventos_disc ev
              GROUP BY ev.awb, ev.hawb
            ),
            final_classificacao AS (
              SELECT
                a.awb,
                a.hawb,
                bp.baseline_pecas,
                up.ultimo_evento_pecas,
                CASE
                  WHEN bp.baseline_pecas IS NOT NULL
                   AND a.min_pieces IS NOT NULL
                   AND a.max_pieces IS NOT NULL
                   AND a.min_pieces <> a.max_pieces
                   AND NOT (
                     up.ultimo_evento_pecas IS NOT NULL
                     AND up.ultimo_evento_pecas = bp.baseline_pecas
                   )
                   AND COALESCE(ns.normalizado_soma_final, 0) = 0
                  THEN 1
                  ELSE 0
                END AS pieces_discrepancy,
                CASE
                  WHEN ua.ultimo_is_dis_event = 1 THEN 1
                  ELSE 0
                END AS has_dis_event,
                CASE
                  WHEN ua.ultimo_is_dis_event = 1 THEN 'DIS_ULTIMO_EVENTO'
                  WHEN bp.baseline_pecas IS NOT NULL
                   AND a.min_pieces IS NOT NULL
                   AND a.max_pieces IS NOT NULL
                   AND a.min_pieces <> a.max_pieces
                   AND NOT (
                     up.ultimo_evento_pecas IS NOT NULL
                     AND up.ultimo_evento_pecas = bp.baseline_pecas
                   )
                   AND COALESCE(ns.normalizado_soma_final, 0) = 0
                  THEN 'DISCREPANCIA_REAL'
                  ELSE 'SEM_DISCREPANCIA'
                END AS status_final
              FROM agregado_disc a
              LEFT JOIN baseline_pieces bp
                ON bp.awb = a.awb
               AND bp.hawb = a.hawb
              LEFT JOIN ultimo_evento_pecas up
                ON up.awb = a.awb
               AND up.hawb = a.hawb
              LEFT JOIN ultimo_evento_absoluto ua
                ON ua.awb = a.awb
               AND ua.hawb = a.hawb
              LEFT JOIN normalizado_por_soma_final ns
                ON ns.awb = a.awb
               AND ns.hawb = a.hawb
            )
            SELECT
              awb AS AWB,
              hawb AS HAWB,
              baseline_pecas AS BASELINE_PECAS,
              ultimo_evento_pecas AS ULTIMO_EVENTO_PECAS,
              pieces_discrepancy AS PIECES_DISCREPANCY,
              has_dis_event AS HAS_DIS_EVENT,
              status_final AS STATUS_FINAL
            FROM final_classificacao
            WHERE status_final IN ('DIS_ULTIMO_EVENTO', 'DISCREPANCIA_REAL')
          `;

          const sql996 = `
            SELECT tda.awb_number AS awb, tda.hawb_number AS hawb, tdaf.timeline_json
            FROM dados_dachser.t_dados_aereo tda
            INNER JOIN dados_dachser.t_fato_aereo tdaf
              ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
             AND JSON_VALID(tdaf.hawbs_json)
             AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
            WHERE tda.awb_number LIKE '996-%'
              AND (tda.master_insert >= '2026-03-20' OR tda.created_at >= '2026-03-20')
              AND tdaf.timeline_json IS NOT NULL
              AND JSON_VALID(tdaf.timeline_json)
          `;

          console.log("[DISC-BG] Executing discrepancy + 996 queries in parallel...");
          const [discRows, rows996] = await Promise.all([
            queryWithRetry(bgClient, discrepancySql).catch((e: any) => { console.warn("[DISC-BG] 3d failed:", e?.message); return []; }),
            queryWithRetry(bgClient, sql996).catch((e: any) => { console.warn("[DISC-BG] 996 failed:", e?.message); return []; }),
          ]);

          const fresh: typeof discrepancyMap = {};
          for (const dr of discRows || []) {
            const key = `${dr.AWB || ""}|${dr.HAWB || ""}`;
            fresh[key] = {
              pieces_discrepancy: Number(dr.PIECES_DISCREPANCY) === 1,
              baseline_pieces: dr.BASELINE_PECAS != null ? Number(dr.BASELINE_PECAS) : null,
              has_dis_event: Number(dr.HAS_DIS_EVENT) === 1,
            };
          }

          // Helpers: extract pieces / detect DIS for uxtracking-format (prefix 996)
          const extractPieces996 = (text: string): number | null => {
            if (!text) return null;
            const upper = text.toUpperCase();
            if (/(OFLD|OFFLOAD|OFFLOADED)/i.test(upper) && /(^|[^0-9])0\s+PIECES?([^A-Z]|$)/i.test(upper)) {
              return null;
            }
            const pcsWtMatch = upper.match(/PCS\s*\/\s*WT\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/);
            if (pcsWtMatch) { const v = parseInt(pcsWtMatch[1], 10); if (v > 0) return v; }
            const slashMatch = upper.match(/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/);
            if (slashMatch) { const v = parseInt(slashMatch[1], 10); if (v > 0) return v; }
            const piecesKv = upper.match(/PIECES?\s*[:=]\s*(\d+)/);
            if (piecesKv) { const v = parseInt(piecesKv[1], 10); if (v > 0) return v; }
            const qty = upper.match(/QTY\s*[:=]\s*(\d+)/);
            if (qty) { const v = parseInt(qty[1], 10); if (v > 0) return v; }
            const piecesSuffix = upper.match(/(\d+)\s+PIECE(?:S|\(S\))?\b/);
            if (piecesSuffix) { const v = parseInt(piecesSuffix[1], 10); if (v > 0) return v; }
            return null;
          };
          const isDisEvent996 = (text: string): boolean => {
            if (!text) return false;
            if (/(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)/i.test(text)) return true;
            if (/\b(DISCREPANCY|IRREGULAR|MISSING|SHORT\s+SHIPPED|OVERAGE)\b/i.test(text)) return true;
            return false;
          };

          let added996 = 0;
          for (const r of rows996 || []) {
            const awb = r.awb || "";
            const hawb = r.hawb || "";
            if (!awb) continue;
            let timeline: any[] = [];
            try {
              timeline = typeof r.timeline_json === "string" ? JSON.parse(r.timeline_json) : (r.timeline_json || []);
            } catch { continue; }
            if (!Array.isArray(timeline) || timeline.length === 0) continue;

            const piecesValues: number[] = [];
            let hasDis = false;
            for (const ev of timeline) {
              const desc = String(ev?.Description || ev?.description || ev?.Status || ev?.status || "");
              const nativePieces = ev?.Pieces ?? ev?.pieces ?? ev?.Quantity ?? ev?.quantity;
              if (nativePieces != null && !isNaN(Number(nativePieces)) && Number(nativePieces) > 0) {
                piecesValues.push(Number(nativePieces));
              } else {
                const p = extractPieces996(desc);
                if (p != null) piecesValues.push(p);
              }
              if (isDisEvent996(desc)) hasDis = true;
            }
            if (piecesValues.length === 0 && !hasDis) continue;
            const uniquePieces = [...new Set(piecesValues)];
            const minP = uniquePieces.length > 0 ? Math.min(...uniquePieces) : null;
            const maxP = uniquePieces.length > 0 ? Math.max(...uniquePieces) : null;
            const piecesDisc = minP != null && maxP != null && minP !== maxP;
            if (!piecesDisc && !hasDis) continue;

            const key = `${awb}|${hawb}`;
            const existing = fresh[key];
            if (!existing) {
              fresh[key] = {
                pieces_discrepancy: piecesDisc,
                baseline_pieces: piecesDisc ? minP : null,
                has_dis_event: hasDis,
              };
              added996++;
            } else {
              const merged = {
                pieces_discrepancy: existing.pieces_discrepancy || piecesDisc,
                baseline_pieces: existing.baseline_pieces ?? (piecesDisc ? minP : null),
                has_dis_event: existing.has_dis_event || hasDis,
              };
              if (
                merged.pieces_discrepancy !== existing.pieces_discrepancy ||
                merged.has_dis_event !== existing.has_dis_event ||
                merged.baseline_pieces !== existing.baseline_pieces
              ) {
                fresh[key] = merged;
                added996++;
              }
            }
          }
          discrepancyCache = { at: Date.now(), data: fresh };
          console.log(`[DISC-BG] Cache refreshed: ${Object.keys(fresh).length} records (+${added996} enriched from prefix 996)`);
        } catch (err) {
          console.warn("[DISC-BG] Failed:", err);
        } finally {
          if (bgClient) { try { await bgClient.close(); } catch {} }
        }
      })();
      // @ts-ignore - EdgeRuntime is provided by Supabase runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(discBgTask);
      }
    }

    // Step 3e: Load authoritative ROUTE map (origin/destination/conexoes) using
    // t_iata_airports + timeline fallback. Mirrors the user-provided CTE exactly.
    let routeMap: Record<string, {
      origin: string | null;
      destination: string | null;
      conexoes: string | null; // comma-separated IATA codes
      status: string;
    }> = {};
    // Always serve current cache (fresh OR stale) to avoid blowing the 2s CPU budget.
    // Refresh happens in background via EdgeRuntime.waitUntil below when stale/missing.
    const routeCacheStale = !routeCache || (Date.now() - routeCache.at >= ROUTE_CACHE_TTL_MS);
    if (routeCache) {
      routeMap = routeCache.data;
      console.log(`[ROUTE] Using ${routeCacheStale ? "stale" : "fresh"} cache (${Object.keys(routeMap).length} records)`);
    } else {
      console.log("[ROUTE] Cold start — routeMap empty this poll, will populate in background");
    }
    if (routeCacheStale && allowBackgroundRefresh) try {
      const activeAwbsRoute = [...new Set(
        (rows || [])
          .map((r: any) => (r.AWB || "").toString().trim())
          .filter((a: string) => a.length > 0)
      )] as string[];
      const awbInClauseRoute = activeAwbsRoute.length > 0
        ? `AND tda.awb_number IN (${activeAwbsRoute.map(a => `'${a.replace(/'/g, "''")}'`).join(",")})`
        : "AND 1=0";

      const routeSql = `
        WITH base_rota AS (
          SELECT
            tda.awb_number AS awb,
            tda.hawb_number AS hawb,
            tdaf.timeline_json,
            TRIM(COALESCE(tdaf.origin, '')) AS origin_raw,
            TRIM(COALESCE(tdaf.destination, '')) AS destination_raw
          FROM dados_dachser.t_dados_aereo tda
          INNER JOIN dados_dachser.t_fato_aereo tdaf
            ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
           AND JSON_VALID(tdaf.hawbs_json)
           AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
          WHERE tdaf.timeline_json IS NOT NULL
            AND JSON_VALID(tdaf.timeline_json)
            ${awbInClauseRoute}
        ),
        base_parse AS (
          SELECT
            b.awb, b.hawb, b.timeline_json, b.origin_raw, b.destination_raw,
            CASE
              WHEN b.origin_raw REGEXP '\\\\([A-Za-z]{3}\\\\)'
                THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.origin_raw, '(', -1), ')', 1)))
              WHEN b.origin_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.origin_raw))
              ELSE NULL
            END COLLATE utf8mb4_unicode_ci AS origin_candidate_code,
            CASE
              WHEN b.destination_raw REGEXP '\\\\([A-Za-z]{3}\\\\)'
                THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.destination_raw, '(', -1), ')', 1)))
              WHEN b.destination_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.destination_raw))
              ELSE NULL
            END COLLATE utf8mb4_unicode_ci AS destination_candidate_code,
            UPPER(TRIM(b.origin_raw)) COLLATE utf8mb4_unicode_ci AS origin_alias_key,
            UPPER(TRIM(b.destination_raw)) COLLATE utf8mb4_unicode_ci AS destination_alias_key
          FROM base_rota b
        ),
        base_resolvida AS (
          SELECT
            b.awb, b.hawb, b.timeline_json,
            COALESCE(ai_origin.iata_code, an_origin.iata_code, ac_origin.iata_code) AS origin_code,
            COALESCE(ai_dest.iata_code, an_dest.iata_code, ac_dest.iata_code) AS destination_code
          FROM base_parse b
          LEFT JOIN dados_dachser.t_iata_airports ai_origin
            ON ai_origin.iata_code COLLATE utf8mb4_unicode_ci = b.origin_candidate_code COLLATE utf8mb4_unicode_ci
           AND ai_origin.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports an_origin
            ON UPPER(TRIM(an_origin.airport_name)) COLLATE utf8mb4_unicode_ci = b.origin_alias_key COLLATE utf8mb4_unicode_ci
           AND an_origin.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports ac_origin
            ON UPPER(TRIM(ac_origin.city_name)) COLLATE utf8mb4_unicode_ci = b.origin_alias_key COLLATE utf8mb4_unicode_ci
           AND ac_origin.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports ai_dest
            ON ai_dest.iata_code COLLATE utf8mb4_unicode_ci = b.destination_candidate_code COLLATE utf8mb4_unicode_ci
           AND ai_dest.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports an_dest
            ON UPPER(TRIM(an_dest.airport_name)) COLLATE utf8mb4_unicode_ci = b.destination_alias_key COLLATE utf8mb4_unicode_ci
           AND an_dest.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports ac_dest
            ON UPPER(TRIM(ac_dest.city_name)) COLLATE utf8mb4_unicode_ci = b.destination_alias_key COLLATE utf8mb4_unicode_ci
           AND ac_dest.is_active = 1
        ),
        eventos_raw AS (
          SELECT b.awb, b.hawb, jt.ordem, TRIM(COALESCE(jt.location, '')) AS location_raw
          FROM base_resolvida b
          JOIN JSON_TABLE(
            b.timeline_json,
            '$[*]' COLUMNS (ordem FOR ORDINALITY, location VARCHAR(255) PATH '$.location')
          ) jt
          WHERE jt.location IS NOT NULL AND TRIM(jt.location) <> ''
        ),
        eventos_parse AS (
          SELECT
            e.awb, e.hawb, e.ordem, e.location_raw,
            CASE
              WHEN e.location_raw REGEXP '\\\\([A-Za-z]{3}\\\\)'
                THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(e.location_raw, '(', -1), ')', 1)))
              WHEN e.location_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(e.location_raw))
              ELSE NULL
            END COLLATE utf8mb4_unicode_ci AS location_candidate_code,
            UPPER(TRIM(e.location_raw)) COLLATE utf8mb4_unicode_ci AS location_alias_key
          FROM eventos_raw e
        ),
        eventos_resolvidos AS (
          SELECT
            e.awb, e.hawb, e.ordem,
            COALESCE(ai.iata_code, an.iata_code, ac.iata_code) AS location_code
          FROM eventos_parse e
          LEFT JOIN dados_dachser.t_iata_airports ai
            ON ai.iata_code COLLATE utf8mb4_unicode_ci = e.location_candidate_code COLLATE utf8mb4_unicode_ci
           AND ai.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports an
            ON UPPER(TRIM(an.airport_name)) COLLATE utf8mb4_unicode_ci = e.location_alias_key COLLATE utf8mb4_unicode_ci
           AND an.is_active = 1
          LEFT JOIN dados_dachser.t_iata_airports ac
            ON UPPER(TRIM(ac.city_name)) COLLATE utf8mb4_unicode_ci = e.location_alias_key COLLATE utf8mb4_unicode_ci
           AND ac.is_active = 1
        ),
        eventos_validos AS (
          SELECT awb, hawb, ordem, location_code FROM eventos_resolvidos
          WHERE location_code IS NOT NULL AND TRIM(location_code) <> ''
        ),
        eventos_sem_repeticao_consecutiva AS (
          SELECT e.awb, e.hawb, e.ordem, e.location_code,
            LAG(e.location_code) OVER (PARTITION BY e.awb, e.hawb ORDER BY e.ordem) AS prev_location_code
          FROM eventos_validos e
        ),
        rota_timeline_limpa AS (
          SELECT awb, hawb, ordem, location_code FROM eventos_sem_repeticao_consecutiva
          WHERE prev_location_code IS NULL
             OR location_code COLLATE utf8mb4_unicode_ci <> prev_location_code COLLATE utf8mb4_unicode_ci
        ),
        timeline_stats AS (
          SELECT awb, hawb, COUNT(*) AS qtd_pontos_timeline,
            COUNT(DISTINCT location_code) AS qtd_distintos_timeline
          FROM rota_timeline_limpa GROUP BY awb, hawb
        ),
        primeiro_ultimo_timeline AS (
          SELECT x.awb, x.hawb,
            MAX(CASE WHEN x.rn_asc = 1 THEN x.location_code END) AS first_timeline_code,
            MAX(CASE WHEN x.rn_desc = 1 THEN x.location_code END) AS last_timeline_code
          FROM (
            SELECT r.awb, r.hawb, r.location_code,
              ROW_NUMBER() OVER (PARTITION BY r.awb, r.hawb ORDER BY r.ordem ASC) AS rn_asc,
              ROW_NUMBER() OVER (PARTITION BY r.awb, r.hawb ORDER BY r.ordem DESC) AS rn_desc
            FROM rota_timeline_limpa r
          ) x
          GROUP BY x.awb, x.hawb
        ),
        rota_base_final AS (
          SELECT b.awb, b.hawb,
            CASE
              WHEN b.origin_code IS NOT NULL THEN b.origin_code
              WHEN b.origin_code IS NULL AND b.destination_code IS NULL
               AND ts.qtd_distintos_timeline >= 2
               AND p.first_timeline_code IS NOT NULL AND p.last_timeline_code IS NOT NULL
               AND p.first_timeline_code COLLATE utf8mb4_unicode_ci <> p.last_timeline_code COLLATE utf8mb4_unicode_ci
              THEN p.first_timeline_code
              ELSE NULL
            END AS origin_final,
            CASE
              WHEN b.destination_code IS NOT NULL THEN b.destination_code
              WHEN b.origin_code IS NULL AND b.destination_code IS NULL
               AND ts.qtd_distintos_timeline >= 2
               AND p.first_timeline_code IS NOT NULL AND p.last_timeline_code IS NOT NULL
               AND p.first_timeline_code COLLATE utf8mb4_unicode_ci <> p.last_timeline_code COLLATE utf8mb4_unicode_ci
              THEN p.last_timeline_code
              ELSE NULL
            END AS destination_final,
            ts.qtd_pontos_timeline, ts.qtd_distintos_timeline,
            p.first_timeline_code, p.last_timeline_code
          FROM base_resolvida b
          LEFT JOIN timeline_stats ts ON ts.awb = b.awb AND ts.hawb = b.hawb
          LEFT JOIN primeiro_ultimo_timeline p ON p.awb = b.awb AND p.hawb = b.hawb
        ),
        conexoes_intermediarias AS (
          SELECT r.awb, r.hawb,
            GROUP_CONCAT(r.location_code ORDER BY r.ordem SEPARATOR ',') AS conexoes
          FROM rota_timeline_limpa r
          INNER JOIN rota_base_final f ON f.awb = r.awb AND f.hawb = r.hawb
          WHERE (f.origin_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci <> f.origin_final COLLATE utf8mb4_unicode_ci)
            AND (f.destination_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci <> f.destination_final COLLATE utf8mb4_unicode_ci)
          GROUP BY r.awb, r.hawb
        )
        SELECT
          f.awb AS AWB, f.hawb AS HAWB,
          f.origin_final AS ORIGEM_FINAL,
          f.destination_final AS DESTINO_FINAL,
          ci.conexoes AS CONEXOES,
          CASE
            WHEN f.origin_final IS NULL AND f.destination_final IS NULL THEN 'SEM_ORIGEM_DESTINO_CONFIAVEIS'
            WHEN f.origin_final IS NULL OR f.destination_final IS NULL THEN 'ROTA_INCOMPLETA'
            WHEN f.origin_final COLLATE utf8mb4_unicode_ci = f.destination_final COLLATE utf8mb4_unicode_ci THEN 'ORIGEM_DESTINO_IGUAIS'
            WHEN f.qtd_distintos_timeline = 1 THEN 'TIMELINE_COM_APENAS_UM_PONTO'
            WHEN f.qtd_distintos_timeline >= 2
             AND f.first_timeline_code IS NOT NULL AND f.last_timeline_code IS NOT NULL
             AND f.first_timeline_code COLLATE utf8mb4_unicode_ci = f.last_timeline_code COLLATE utf8mb4_unicode_ci
            THEN 'TIMELINE_INCONSISTENTE'
            ELSE 'OK'
          END AS STATUS_ROTA
        FROM rota_base_final f
        LEFT JOIN conexoes_intermediarias ci ON ci.awb = f.awb AND ci.hawb = f.hawb
      `;
      // Run the heavy route CTE in background — do NOT block the request.
      // It uses its own DB connection so we can close `client` immediately.
      const bgTask = (async () => {
        let bgClient: Client | null = null;
        try {
          bgClient = await new Client().connect({
            hostname: Deno.env.get("MARIADB_AIR_HOST") || "",
            port: parseInt(Deno.env.get("MARIADB_AIR_PORT") || "3306"),
            username: Deno.env.get("MARIADB_AIR_USER") || "",
            password: Deno.env.get("MARIADB_AIR_PASSWORD") || "",
            db: Deno.env.get("MARIADB_AIR_DATABASE") || "dados_dachser",
            timeout: 30000,
          });
          console.log("[ROUTE-BG] Executing authoritative route query...");
          const routeRows = await queryWithRetry(bgClient, routeSql);
          console.log(`[ROUTE-BG] Returned ${routeRows?.length || 0} records`);
          const fresh: typeof routeMap = {};
          for (const rr of routeRows || []) {
            const key = `${rr.AWB || ""}|${rr.HAWB || ""}`;
            fresh[key] = {
              origin: rr.ORIGEM_FINAL || null,
              destination: rr.DESTINO_FINAL || null,
              conexoes: rr.CONEXOES || null,
              status: rr.STATUS_ROTA || "",
            };
          }
          routeCache = { at: Date.now(), data: fresh };
        } catch (err) {
          console.warn("[ROUTE-BG] Could not load route map:", err);
        } finally {
          if (bgClient) { try { await bgClient.close(); } catch {} }
        }
      })();
      // @ts-ignore - EdgeRuntime is provided by Supabase runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(bgTask);
      }
    } catch (err) {
      console.warn("[ROUTE] Could not schedule route map refresh:", err);
    }

    await client.close();
    client = null;

    // Step 4: Resolve codes in JS using the loaded lookup tables
    function resolveCode(desc: string | null): string | null {
      if (!desc || desc === "null") return null;
      // Parentheses pattern: (NFD)
      if (desc.startsWith("(")) {
        const m = desc.match(/^\(([^)]+)\)/);
        if (m) return m[1];
      }
      const upper = desc.toUpperCase();
      // Keyword matching
      if (upper.includes("OFFLOADED")) return "OFLD";
      if (upper.includes("READY FOR PICK-UP") || upper.includes("AGENT NOTIFIED") || upper.includes("NOTIFIED FOR DELIVERY")) return "NFD";
      if (upper.includes("DOCUMENTS DELIVERED")) return "AWD";
      if (upper.includes("RECEIVED FROM FLIGHT")) return "RCF";
      if (upper.includes("RECEIVED FROM CARRIER")) return "RCT";
      if (upper.includes("RECEIVED FROM SHIPPER") || upper.includes("READY FOR CARRIAGE")) return "RCS";
      if (upper.includes("FREIGHT ON HAND")) return "FOH";
      if (upper.includes("MANIFESTED")) return "MAN";
      if (upper.includes("DEPARTED")) return "DEP";
      if (upper.includes("ARRIVED")) return "ARR";
      if (upper.includes("DELIVERED")) return "DLV";
      // Fallback: description_eventos lookup
      for (const d of descLookup) {
        if (upper.startsWith(d.description)) return d.code;
      }
      return null;
    }

    function getEventId(code: string | null): number {
      if (!code) return 0;
      return eventMap[code.trim().toUpperCase()]?.id || 0;
    }

    function getEventDesc(code: string | null): string {
      if (!code) return "";
      return eventMap[code.trim().toUpperCase()]?.descricao_en || "";
    }

    // IATA hierarchy weights (higher = more advanced step in the journey).
    // Used by pickTopByIATA to elect the most recent of the top 4 SQL slots.
    const IATA_WEIGHT: Record<string, number> = {
      POD: 44, DLV: 43, NFD: 42, RCF: 41, AWD: 40, ARR: 39,
      TRM: 38, TFD: 37, DEP: 36, MAN: 35, RCS: 34, RCT: 34, FOH: 33, BKD: 32,
      AWR: 40, CCD: 40, FWB: 4, DOC: 12, PRE: 20, TRA: 32,
      DIS: 30, OFLD: 28,
    };

    // Whitelist of valid IATA codes accepted as resolution result.
    // Defined here so resolveCodeFromSlot can validate every candidate.
    const VALID_IATA = new Set([
      ...Object.keys(IATA_WEIGHT),
      'OFLD','NIL','NIF','DIS','TFD','RCT','TRM','POD','UNK',
    ]);
    const validate = (c: string | null | undefined): string | null => {
      if (!c) return null;
      const u = c.toString().trim().toUpperCase();
      return VALID_IATA.has(u) ? u : null;
    };

    // Resolve code from a single slot. Order:
    // 1) native status_code from JSON (structured data from crawler)
    // 2) EXACT_MAP — t_eventos_awb / t_description_eventos exact match (authoritative)
    // 3) KEYWORD_INDEX — substring match against same tables (longest needle wins)
    // 4) IBS regex "| Code XXX |"
    // 5) Code at start of description "RCF Received from Flight..."
    // 6) Lufthansa parentheses "(NFD)"
    function resolveCodeFromSlot(nativeCode: string | null, desc: string | null): string | null {
      const native = (nativeCode || "").trim().toUpperCase();
      if (native && /^[A-Z]{2,5}$/.test(native)) {
        const v = validate(native);
        if (v) return v;
      }
      if (!desc || desc === "null") return null;

      const normDesc = normalizeDesc(desc);

      // 2) Exact match against authoritative lookup tables
      if (normDesc) {
        const exact = EXACT_MAP.get(normDesc);
        const v = validate(exact);
        if (v) return v;
      }

      // 3) Keyword/substring match (longest needle first)
      if (normDesc) {
        for (const { needle, code } of KEYWORD_INDEX) {
          if (needle && normDesc.includes(needle)) {
            const v = validate(code);
            if (v) return v;
          }
        }
      }

      // 4) IBS pattern: "| Code RCF |"
      const ibs = desc.match(/\|\s*Code\s+([A-Z]{2,5})\s*\|/i);
      if (ibs) {
        const v = validate(ibs[1]);
        if (v) return v;
      }

      // 5) Description starts with the code itself: "RCF Received from Flight ..."
      const startCode = desc.trim().match(/^([A-Z]{2,5})\b/);
      if (startCode) {
        const v = validate(startCode[1]);
        if (v) return v;
      }

      // 6) Lufthansa parentheses: "(NFD)"
      const paren = desc.match(/\(([A-Z]{2,5})\)/);
      if (paren) {
        const v = validate(paren[1]);
        if (v) return v;
      }

      // Last resort: legacy keyword resolver (still validated)
      return validate(resolveCode(desc));
    }

    // Parse "23 Apr 2026, 19:08" / "23 Apr 2026" / ISO into ms. Returns 0 on failure.
    function parseSlotDateMs(s: string | null | undefined): number {
      if (!s) return 0;
      const direct = new Date(s).getTime();
      if (!isNaN(direct) && direct > 0) return direct;
      const m = String(s).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/);
      if (m) {
        const months: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
        const mo = months[m[2].toLowerCase()];
        if (mo !== undefined) {
          return Date.UTC(parseInt(m[3]), mo, parseInt(m[1]), parseInt(m[4] || '0'), parseInt(m[5] || '0'));
        }
      }
      return 0;
    }

    // Sole post-SQL processing: among the up to 6 slots returned by the query,
    // the chronologically newest event always wins. IATA hierarchy is used ONLY
    // when multiple slots share the exact same parsed timestamp.
    //
    // BKD filtering: BKD (Booked) events represent planned/future bookings made
    // in advance for every airport in the planned route, often with future ETD
    // timestamps that look "newest". When at least one non-BKD operational event
    // exists in the slots, BKDs are filtered out so the real operational status
    // wins (e.g., FOH, RCS, MAN). If all slots are BKD, the original logic
    // applies (latest BKD wins).
    function pickTopByIATA(row: any): { code: string | null; desc: string | null; loc: string | null; date: string | null; idx: number } {
      const allSlots = [
        { code: resolveCodeFromSlot(row.code0_native, row.desc0), desc: row.desc0, loc: row.loc0, date: row.date0, idx: 0 },
        { code: resolveCodeFromSlot(row.code1_native, row.desc1), desc: row.desc1, loc: row.loc1, date: row.date1, idx: 1 },
        { code: resolveCodeFromSlot(row.code2_native, row.desc2), desc: row.desc2, loc: row.loc2, date: row.date2, idx: 2 },
        { code: resolveCodeFromSlot(row.code3_native, row.desc3), desc: row.desc3, loc: row.loc3, date: row.date3, idx: 3 },
        { code: resolveCodeFromSlot(row.code4_native, row.desc4), desc: row.desc4, loc: row.loc4, date: row.date4, idx: 4 },
        { code: resolveCodeFromSlot(row.code5_native, row.desc5), desc: row.desc5, loc: row.loc5, date: row.date5, idx: 5 },
      ].filter(s => s.desc || s.code);
      if (allSlots.length === 0) return { code: null, desc: null, loc: null, date: null, idx: -1 };

      // Filter out BKD/booking variants when operational events exist.
      const isBkd = (c: string | null) => {
        const u = (c || "").toString().trim().toUpperCase();
        return u === "BKD" || u === "BKG" || u === "BOOKED";
      };
      const nonBkd = allSlots.filter(s => !isBkd(s.code));
      const slots = nonBkd.length > 0 ? nonBkd : allSlots;

      const slotsWithDate = slots.map((slot) => ({ ...slot, dateMs: parseSlotDateMs(slot.date) }));
      const latestDateMs = Math.max(...slotsWithDate.map((slot) => slot.dateMs));

      if (latestDateMs <= 0) {
        return slots.reduce((best, slot) => (slot.idx < best.idx ? slot : best), slots[0]);
      }

      const bestGroup = slotsWithDate.filter((slot) => slot.dateMs === latestDateMs);

      // Same timestamp only: IATA hierarchy decides; final tiebreak lower idx.
      let winner = bestGroup[0];
      let winnerW = IATA_WEIGHT[(winner.code || "").toUpperCase()] || 0;
      for (let i = 1; i < bestGroup.length; i++) {
        const w = IATA_WEIGHT[(bestGroup[i].code || "").toUpperCase()] || 0;
        if (w > winnerW || (w === winnerW && bestGroup[i].idx < winner.idx)) {
          winner = bestGroup[i];
          winnerW = w;
        }
      }
      return winner;
    }

    const data: any[] = [];
    const failed: any[] = [];

    // Hoisted constants/helpers — previously re-created per row (1.6k+ iterations).
    const FINAL_STATUSES = new Set(["DLV", "POD"]);
    const SUPPRESSED_DISCREPANCY_AWBS = new Set<string>(['047-32916380']);
    const stopWordsConn = new Set([
      'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
      'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
      'MAN','NFD','DLV','POD','BKD','BKG','BKF','FOH','AWD','CCD','ASN',
      'MOV','OFLD','FWB','DOC','AWR','TDE','LOF','TFS','MIS','BCBP','UNK',
      'TRA','PRD','RCP','CAN','LRC','FSH','FSU',
      'AND','THE','FOR','BUT','NOT','ALL','ANY','ARE','OUR','ONE','TWO',
      'NEW','OLD','WAY','OUT','OFF','END','NOW','WHO','HOW','ITS','HIM',
      'HER','HIS','OWN','GET','PUT','SET','LET','HAS','HAD','USE','ACT',
      'AGE','AIR','FAR','YET','TOP','DAY','MAY','FLT','AGT','SHT',
    ]);
    const RE_GROUND_DASH_T = /\b[A-Z]{2,3}\s?\d{2,5}-T\b/;
    const RE_GROUND_XD = /\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b/;
    const normalizeGroundCandidate = (val: string): string => (
      (val || "")
        .toUpperCase()
        .replace(/\\\//g, '/')
        .trim()
        .replace(/[,;]\s*$/, '')
        .replace(/\s+/g, ' ')
    );
    const hasGroundFlightPattern = (val: string): boolean => {
      const clean = normalizeGroundCandidate(val);
      if (!clean) return false;
      if (RE_GROUND_DASH_T.test(clean)) return true;
      if (RE_GROUND_XD.test(clean)) return true;
      return false;
    };
    const isGroundFlight = (val: string): boolean => hasGroundFlightPattern(val);
    const extractFlightsFromText = (text: string): string[] => {
      if (!text) return [];
      const flights: string[] = [];
      let m: RegExpExecArray | null;
      const flightPattern = /Flight\s+([A-Z]{2,3}[\s-]?\d{2,5}(?:-T|\s*X\s*\/\s*D)?)/g;
      while ((m = flightPattern.exec(text)) !== null) flights.push(m[1]);
      const dashTPattern = /\b([A-Z]{2,3}\s?\d{2,5}-T)\b/g;
      while ((m = dashTPattern.exec(text)) !== null) flights.push(m[1]);
      const slashXDPattern = /\b([A-Z]{2,3}[\s-]?\d{2,5}\s*X\s*\/\s*D)\b/g;
      while ((m = slashXDPattern.exec(text)) !== null) flights.push(m[1]);
      return flights;
    };
    const FLIGHT_FIELDS = ['Flight', 'flight', 'voo', 'Voo', 'flight_number', 'flightNumber', 'numero_voo'];
    const TEXT_FIELDS = ['status', 'Status', 'Description', 'description', 'details', 'title', 'event_description', 'evento', 'descricao', 'remarks'];



    for (const row of rows || []) {
      let timeline: any[] = [];
      try {
        if (row.TIMELINE) {
          timeline = typeof row.TIMELINE === "string" ? JSON.parse(row.TIMELINE) : row.TIMELINE;
        }
      } catch (_) {}

      const lastStatusCode = row.last_status_code || "";

      // Sole post-SQL processing: elect the top slot by IATA hierarchy
      // among the up to 6 returned by the SQL query.
      const top = pickTopByIATA(row);
      const codeFromTimeline = top.code;

      // Look up authoritative route entry early so ARR enrichment can use it
      const routeKey = `${row.AWB || ""}|${row.HAWB || ""}`;
      const routeEntry = routeMap[routeKey];

      // Determine final code — check all 6 slots so DLV/POD in late slots is never missed
      let finalCode: string | null = null;
      const allCodes = [
        top.code,
        resolveCodeFromSlot(row.code1_native, row.desc1),
        resolveCodeFromSlot(row.code2_native, row.desc2),
        resolveCodeFromSlot(row.code3_native, row.desc3),
        resolveCodeFromSlot(row.code4_native, row.desc4),
        resolveCodeFromSlot(row.code5_native, row.desc5),
      ];

      // VALID_IATA whitelist already defined above (used by resolveCodeFromSlot)
      const sanitizedLastStatus = (lastStatusCode || '').toString().toUpperCase().trim();
      const safeLastStatus = VALID_IATA.has(sanitizedLastStatus) ? sanitizedLastStatus : null;

      // DLV and POD are terminal — always win over NFD or any other status
      if (allCodes.some(c => c && FINAL_STATUSES.has(c)) || FINAL_STATUSES.has(sanitizedLastStatus)) {
        finalCode = allCodes.some(c => c === "POD") || sanitizedLastStatus === "POD" ? "POD" : "DLV";
      } else {
        // Prefer elected timeline slot; fallback only to whitelisted last_status_code
        finalCode = codeFromTimeline || safeLastStatus || null;
      }

      // Use elected slot's loc/date/desc as the "current" event surface
      const electedLoc = top.loc || row.loc0 || "";
      const electedDate = top.date || row.date0 || "";

      // Enrich ARR with destination context.
      // CONEXÃO is only set when destination is authoritatively known (routeEntry) to avoid
      // false positives when raw DESTINO text can't be reliably parsed to an IATA code.
      if (finalCode === "ARR") {
        const loc = extractIATA(electedLoc);
        const authDest = routeEntry?.destination || null;
        const dest = authDest || extractIATA(row.DESTINO || "");
        if (dest && loc && loc === dest) {
          finalCode = "ARR - DESTINO";
        } else if (authDest && loc && loc !== authDest) {
          // Only declare a connection when we have a verified destination to compare against
          finalCode = "ARR - CONEXÃO";
        }
        // Without routeEntry, ambiguous — leave as ARR rather than guess CONEXÃO
      }

      // Date for the elected slot — prefer SQL slot date, then time-augmented row.date0/time0
      let dateStr: string | null = electedDate || null;
      if (!dateStr) {
        dateStr = ((row.date0 || "") + " " + (row.time0 || "")).trim() || null;
      }
      if (!dateStr && timeline && timeline.length > 0) {
        for (const evt of timeline) {
          const d = (evt.date || "").trim();
          if (d) { dateStr = d; break; }
        }
      }

      // Scan timeline for ARR at destination (regardless of finalCode)
      let arrDestinoDate: string | null = null;
      const destIATA = routeEntry?.destination || extractIATA(row.DESTINO || "");
      if (destIATA && timeline && timeline.length > 0) {
        for (const evt of timeline) {
          const desc = (evt.description || "").toUpperCase();
          const evtLoc = extractIATA(evt.location || "");
          if (desc.includes("ARRIVED") && evtLoc === destIATA) {
            const d = (evt.date || "").trim();
            if (d) { arrDestinoDate = d; break; }
          }
        }
      }

      const hideReason = visibilityMap[routeKey] || "";

      // Discrepancy lookup
      let disc = discrepancyMap[routeKey] || { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };

      // Suppress false-positive discrepancies for whitelisted AWBs
      if (SUPPRESSED_DISCREPANCY_AWBS.has(String(row.AWB || '').trim())) {
        disc = { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };
      }


      // Determine working origin/destination — fix origin=destination data error.
      // When t_fato_aereo stores origin = destination (e.g. both "GRU" for imports),
      // scan the timeline chronologically to derive both:
      //   • origin  = first valid airport in journey (oldest events)
      //   • destination = last valid airport in journey (newest/planned events, e.g. CNF)
      let workingOrigin = routeEntry?.origin || extractIATA(row.ORIGEM || "");
      let workingDest   = routeEntry?.destination || extractIATA(row.DESTINO || "");
      if (workingOrigin && workingDest && workingOrigin === workingDest && timeline?.length > 0) {
        const chronoScan = [...timeline].reverse(); // oldest first
        let foundAny = false;
        let derivedDest = workingDest;
        for (const evt of chronoScan) {
          const loc = (evt.location || "").trim().toUpperCase();
          // Prefer explicit location field; fall back to description keywords
          let apt: string | null = (loc.length === 3 && !stopWordsConn.has(loc)) ? loc : null;
          if (!apt) {
            const d = (evt.description || "").toUpperCase();
            // Include "TO" here so planned delivery events ("TO CNF") reveal the final destination
            const m = d.match(/\b(?:FROM|IN|AT|DEPARTED|ARRIVED|TO)\s+([A-Z]{3})\b/);
            if (m && !stopWordsConn.has(m[1])) apt = m[1];
          }
          if (!apt) continue;
          if (!foundAny) { workingOrigin = apt; foundAny = true; } // first = origin
          derivedDest = apt; // keep overwriting — last one wins = final destination
        }
        if (foundAny) workingDest = derivedDest;
      }
      const originIATAforConn = workingOrigin;
      const destinIATAforConn = workingDest;

      const seenAirports: string[] = [];
      const seenSet = new Set<string>();
      if (timeline && timeline.length > 0) {
        const chronological = [...timeline].reverse(); // oldest first
        let destReached = false;
        for (const evt of chronological) {
          // Stop extracting connections once the cargo reaches the destination —
          // prevents domestic delivery airports (CNF, THE) from appearing as connections.
          if (destReached) break;
          const candidates: string[] = [];
          const loc = extractIATA(evt.location || "");
          if (loc) candidates.push(loc);
          const desc = (evt.description || "").toUpperCase();
          const evtPrefix = desc.match(/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD)\s+([A-Z]{3})\b/);
          if (evtPrefix) candidates.push(evtPrefix[1]);
          // Exclude "TO" — captures delivery destinations of other HAWBs (e.g. "delivered TO CNF")
          const prepMatch = desc.match(/\b(?:FROM|IN|AT|DEPARTED|ARRIVED)\s+([A-Z]{3})\b/);
          if (prepMatch) candidates.push(prepMatch[1]);
          const routeMatches = desc.matchAll(/\b([A-Z]{3})\s*(?:->|-|→|\/)\s*([A-Z]{3})\b/g);
          for (const m of routeMatches) { candidates.push(m[1]); candidates.push(m[2]); }
          const parenMatch = desc.match(/\(([A-Z]{3})\)/);
          if (parenMatch) candidates.push(parenMatch[1]);
          for (const apt of candidates) {
            if (!apt || apt.length !== 3) continue;
            if (stopWordsConn.has(apt)) continue;
            if (apt === originIATAforConn || apt === destinIATAforConn) continue;
            if (seenSet.has(apt)) continue;
            seenSet.add(apt);
            seenAirports.push(apt);
          }
          // Mark destination reached after processing events at the destination airport
          if (loc && !stopWordsConn.has(loc) && loc === destinIATAforConn) destReached = true;
        }
      }
      const conexao = seenAirports.length > 0 ? seenAirports.join(',') : null;

      // RFS detection scoped EXCLUSIVELY to the elected slot (top.idx via pickTopByIATA).
      // Sufixo -T ou X/D em eventos antigos da timeline NÃO classifica o processo como
      // rodoviário. Campos LAST_FLIGHT e desc0..desc3 não são usados como fallback.
      let isGroundTransport = false;
      const electedDesc = String(top.desc || (row as any)[`desc${top.idx}`] || "");
      if (electedDesc) {
        if (hasGroundFlightPattern(electedDesc)) {
          isGroundTransport = true;
        } else {
          const flights = extractFlightsFromText(electedDesc);
          if (flights.some(isGroundFlight)) isGroundTransport = true;
        }
      }
      // Também avalia campos estruturados do evento eleito na timeline (quando existir).
      if (!isGroundTransport && timeline?.length) {
        const electedEvt = (() => {
          // Match the timeline event whose date/desc corresponds to the elected slot.
          if (top.date) {
            const found = timeline.find((ev: any) =>
              String(ev?.date || "").trim() === String(top.date).trim()
            );
            if (found) return found;
          }
          if (top.desc) {
            const needle = String(top.desc).trim();
            const found = timeline.find((ev: any) =>
              String(ev?.description || "").trim() === needle
            );
            if (found) return found;
          }
          return null;
        })();
        if (electedEvt) {
          for (const field of FLIGHT_FIELDS) {
            const v = (electedEvt as any)[field];
            if (!v) continue;
            const s = String(v);
            if (isGroundFlight(s)) { isGroundTransport = true; break; }
            const extracted = extractFlightsFromText(s);
            if (extracted.some(isGroundFlight)) { isGroundTransport = true; break; }
          }
          if (!isGroundTransport) {
            for (const textField of TEXT_FIELDS) {
              const text = (electedEvt as any)[textField];
              if (!text) continue;
              if (hasGroundFlightPattern(String(text))) { isGroundTransport = true; break; }
              const flights = extractFlightsFromText(String(text));
              if (flights.some(isGroundFlight)) { isGroundTransport = true; break; }
            }
          }
        }
      }


      // Override origin/destination/conexao with authoritative route map.
      // Use workingOrigin which already corrects the origin=destination data error.
      const finalOrigin = workingOrigin || row.ORIGEM || "";
      const finalDestination = workingDest || row.DESTINO || "";
      const rawConexao = routeEntry ? (routeEntry.conexoes || null) : conexao;
      const finalConexao = rawConexao
        ? rawConexao.split(',').map((c: string) => c.trim()).filter((c: string) => c.length === 3 && !stopWordsConn.has(c.toUpperCase())).join(',') || null
        : null;

      const normalized = {
        awb_number: row.AWB || "",
        hawb_number: row.HAWB || "",
        consignee_nome: row.CLIENTE || clienteMap[row.HAWB] || "",
        clerk: row.ANALISTA || "",
        origin: finalOrigin,
        destination: finalDestination,
        conexao: finalConexao,
        route_status: routeEntry?.status || null,
        timeline_json: timeline,
        last_event: finalCode || "",
        last_event_description: getEventDesc(finalCode),
        last_status_code: finalCode || "",
        last_event_date: dateStr,
        last_event_location: electedLoc,
        penultimate_location: row.loc1 || "",
        arr_destino_date: arrDestinoDate,
        hide_reason: hideReason,
        pieces_discrepancy: disc.pieces_discrepancy,
        baseline_pieces: disc.baseline_pieces,
        has_dis_event: disc.has_dis_event,
        hours_in_status: row.hours_in_status_rounded != null ? Number(row.hours_in_status_rounded) : null,
        sla_limite_horas: row.sla_limite_horas != null ? Number(row.sla_limite_horas) : null,
        sla_ratio: row.sla_ratio != null ? Number(row.sla_ratio) : null,
        sla_cor: row.sla_cor || null,
        sla_tempo_formatado: row.sla_tempo_formatado || null,
        sla_tooltip: row.sla_tooltip || null,
        is_ground_transport: isGroundTransport,
      };

      if (!finalCode) {
        failed.push({ awb: row.AWB || "", hawb: row.HAWB || "", cliente: row.CLIENTE || "" });
      }

      data.push(normalized);
    }

    // Alerting is handled by air-tracking-failed-alert. Do not send email from
    // the dashboard fallback to keep this function inside Edge CPU limits.

    // Filter out hidden AWBs (air_hidden_awbs table in Supabase)
    let filteredData = data;
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
      if (supaUrl && supaKey) {
        const resp = await fetch(`${supaUrl}/rest/v1/air_hidden_awbs?select=awb`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
        });
        if (resp.ok) {
          const hidden = await resp.json();
          const hiddenSet = new Set<string>((hidden || []).map((h: any) => String(h.awb).trim()));
          if (hiddenSet.size > 0) {
            filteredData = data.filter((d: any) => !hiddenSet.has(String(d.awb_number).trim()));
            console.log(`Hidden AWBs filtered: ${data.length - filteredData.length} of ${data.length}`);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching hidden AWBs:", e);
    }

    return new Response(JSON.stringify({ success: true, data: filteredData, failed_count: failed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-tracking-aereo error:", error);
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
