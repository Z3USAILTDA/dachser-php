import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function extractIATA(loc: string): string {
  if (!loc) return "";
  const t = loc.trim();
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  return t.substring(0, 3).toUpperCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const username = Deno.env.get("MARIADB_USER");
    const password = Deno.env.get("MARIADB_PASSWORD");

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

    // Step 1: Load event codes lookup table (small, ~50 rows)
    // t_eventos_awb has 'descricao_en' (English description per IATA code)
    const eventsRows = await queryWithRetry(client, `SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb`);
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

    // Step 2: Load description_eventos lookup — authoritative description→code mapping
    const descRows = await queryWithRetry(client, `SELECT code, description FROM dados_dachser.t_description_eventos`);
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

    // Step 3: Main query with SLA calculation via CTE
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

    console.log("Executing tracking aereo query (v2 optimized)...");
    const rows = await queryWithRetry(client, sql);
    console.log(`Query returned ${rows?.length || 0} rows`);

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

    // Step 3d: Load discrepancy data via SQL (pieces divergence + DIS events)
    let discrepancyMap: Record<string, { pieces_discrepancy: boolean; baseline_pieces: number | null; has_dis_event: boolean }> = {};
    try {
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
            AND tdaf.timeline_json IS NOT NULL
            AND JSON_VALID(tdaf.timeline_json)
        ),
        eventos_disc AS (
          SELECT
            b.awb, b.hawb,
            CASE
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP 'OFFLOADED|OFLD'
                   AND (
                       UPPER(jt.description) REGEXP '(^|[^0-9])0[[:space:]]+PIECES?([^A-Z]|$)'
                       OR UPPER(jt.description) REGEXP 'QTY:[[:space:]]*0([^0-9]|$)'
                       OR UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*0([^0-9]|$)'
                   )
              THEN NULL
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP 'QTY:[[:space:]]*[1-9][0-9]*'
              THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), 'QTY:[[:space:]]*[1-9][0-9]*'), '[1-9][0-9]*') AS UNSIGNED)
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP 'PIECES?:[[:space:]]*[1-9][0-9]*'
              THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), 'PIECES?:[[:space:]]*[1-9][0-9]*'), '[1-9][0-9]*') AS UNSIGNED)
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP '[1-9][0-9]*[[:space:]]+PIECE\\\\(S\\\\)'
              THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), '[1-9][0-9]*[[:space:]]+PIECE\\\\(S\\\\)'), '[1-9][0-9]*') AS UNSIGNED)
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP '[1-9][0-9]*[[:space:]]+PIECES?'
              THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description), '[1-9][0-9]*[[:space:]]+PIECES?'), '[1-9][0-9]*') AS UNSIGNED)
              WHEN UPPER(COALESCE(jt.description, '')) REGEXP '[1-9][0-9]*[[:space:]]*/[[:space:]]*[0-9]+([.,][0-9]+)?[[:space:]]*(KGS|KG|LBS|LB)'
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
        agregado_disc AS (
          SELECT
            ev.awb, ev.hawb,
            MIN(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas > 0 THEN ev.pieces_extraidas END) AS min_pieces,
            MAX(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas > 0 THEN ev.pieces_extraidas END) AS max_pieces,
            MAX(ev.is_dis_event) AS has_dis_event
          FROM eventos_disc ev
          GROUP BY ev.awb, ev.hawb
        )
        SELECT
          awb AS AWB, hawb AS HAWB,
          min_pieces AS BASELINE_PECAS,
          CASE WHEN min_pieces IS NOT NULL AND max_pieces IS NOT NULL AND min_pieces <> max_pieces THEN 1 ELSE 0 END AS PIECES_DISCREPANCY,
          has_dis_event AS HAS_DIS_EVENT
        FROM agregado_disc
        WHERE (min_pieces IS NOT NULL AND max_pieces IS NOT NULL AND min_pieces <> max_pieces)
           OR has_dis_event = 1
      `;
      console.log("Executing discrepancy query...");
      const discRows = await queryWithRetry(client, discrepancySql);
      for (const dr of discRows || []) {
        const key = `${dr.AWB || ""}|${dr.HAWB || ""}`;
        discrepancyMap[key] = {
          pieces_discrepancy: Number(dr.PIECES_DISCREPANCY) === 1,
          baseline_pieces: dr.BASELINE_PECAS != null ? Number(dr.BASELINE_PECAS) : null,
          has_dis_event: Number(dr.HAS_DIS_EVENT) === 1,
        };
      }
      console.log(`Loaded ${Object.keys(discrepancyMap).length} discrepancy records`);
    } catch (err) {
      console.warn("Could not load discrepancy data:", err);
    }

    // Step 3d-bis: Discrepancy detection for prefix 996 (Air Europa via uxtracking)
    // Reads t_fato_aereo.timeline_json (same source as Step 3d) but parses in JS to
    // recognize uxtracking-specific patterns: "10/2757 KGS" and DIS keywords like
    // DISCREPANCY/IRREGULAR/MISSING/SHORT SHIPPED/OVERAGE.
    try {
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
      console.log("[996-DISC] Executing 996 discrepancy query (t_fato_aereo)...");
      const rows996 = await queryWithRetry(client, sql996);
      console.log(`[996-DISC] Loaded ${rows996?.length || 0} candidate AWBs from t_fato_aereo`);

      // Helper: extract pieces from a single description (uxtracking format)
      const extractPieces996 = (text: string): number | null => {
        if (!text) return null;
        const upper = text.toUpperCase();
        // Suppress when explicit zero pieces in offload
        if (/(OFLD|OFFLOAD|OFFLOADED)/i.test(upper) && /(^|[^0-9])0\s+PIECES?([^A-Z]|$)/i.test(upper)) {
          return null;
        }
        // Pattern: "Pcs/Wt: 10/27,3" (uxtracking real format, no unit suffix) — priority
        const pcsWtMatch = upper.match(/PCS\s*\/\s*WT\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/);
        if (pcsWtMatch) {
          const v = parseInt(pcsWtMatch[1], 10);
          if (v > 0) return v;
        }
        // Pattern: "10/2757 KGS" or "10 / 2757K"
        const slashMatch = upper.match(/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/);
        if (slashMatch) {
          const v = parseInt(slashMatch[1], 10);
          if (v > 0) return v;
        }
        // Pattern: "Pieces: 10" / "PIECES=10"
        const piecesKv = upper.match(/PIECES?\s*[:=]\s*(\d+)/);
        if (piecesKv) {
          const v = parseInt(piecesKv[1], 10);
          if (v > 0) return v;
        }
        // Pattern: "Qty: 10"
        const qty = upper.match(/QTY\s*[:=]\s*(\d+)/);
        if (qty) {
          const v = parseInt(qty[1], 10);
          if (v > 0) return v;
        }
        // Pattern: "10 PIECE(S)" / "10 PIECES"
        const piecesSuffix = upper.match(/(\d+)\s+PIECE(?:S|\(S\))?\b/);
        if (piecesSuffix) {
          const v = parseInt(piecesSuffix[1], 10);
          if (v > 0) return v;
        }
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
        } catch {
          continue;
        }
        if (!Array.isArray(timeline) || timeline.length === 0) continue;

        const piecesValues: number[] = [];
        let hasDis = false;
        for (const ev of timeline) {
          // Accept both uxtracking format (Description/Status capitalized) and standard (description)
          const desc = String(ev?.Description || ev?.description || ev?.Status || ev?.status || "");
          // Native Pieces field
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
        const existing = discrepancyMap[key];
        if (!existing) {
          discrepancyMap[key] = {
            pieces_discrepancy: piecesDisc,
            baseline_pieces: piecesDisc ? minP : null,
            has_dis_event: hasDis,
          };
          added996++;
        } else {
          // Merge: enrich existing entry with 996-specific findings (don't downgrade)
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
            discrepancyMap[key] = merged;
            added996++;
          }
        }
      }
      console.log(`[996-DISC] Added/enriched ${added996} discrepancy records for prefix 996`);
    } catch (err) {
      console.warn("[996-DISC] Could not load 996 discrepancy data:", err);
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
      TRM: 38, TFD: 37, DEP: 36, MAN: 35, RCS: 34, FOH: 33, BKD: 32,
      AWR: 40, CCD: 40, FWB: 4, RCT: 11, DOC: 12, PRE: 20, TRA: 32,
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

    for (const row of rows || []) {
      let timeline: any[] = [];
      try {
        if (row.TIMELINE) {
          timeline = typeof row.TIMELINE === "string" ? JSON.parse(row.TIMELINE) : row.TIMELINE;
        }
      } catch (_) {}

      const lastStatusCode = row.last_status_code || "";

      // Sole post-SQL processing: elect the top slot by IATA hierarchy
      // among the up to 4 returned by the SQL query.
      const top = pickTopByIATA(row);
      const codeFromTimeline = top.code;

      // Determine final code
      let finalCode: string | null = null;
      const allCodes = [
        top.code,
        resolveCodeFromSlot(row.code1_native, row.desc1),
        resolveCodeFromSlot(row.code2_native, row.desc2),
        resolveCodeFromSlot(row.code3_native, row.desc3),
      ];

      // VALID_IATA whitelist already defined above (used by resolveCodeFromSlot)
      const sanitizedLastStatus = (lastStatusCode || '').toString().toUpperCase().trim();
      const safeLastStatus = VALID_IATA.has(sanitizedLastStatus) ? sanitizedLastStatus : null;

      // DLV always takes priority (delivered is final)
      if (allCodes.some(c => c === "DLV") || sanitizedLastStatus === "DLV") {
        finalCode = "DLV";
      } else {
        // Prefer elected timeline slot; fallback only to whitelisted last_status_code
        finalCode = codeFromTimeline || safeLastStatus || null;
      }

      // Use elected slot's loc/date/desc as the "current" event surface
      const electedLoc = top.loc || row.loc0 || "";
      const electedDate = top.date || row.date0 || "";

      // Enrich ARR with destination context
      if (finalCode === "ARR") {
        const loc = extractIATA(electedLoc);
        const dest = extractIATA(row.DESTINO || "");
        if (dest && loc && loc === dest) {
          finalCode = "ARR - DESTINO";
        } else if (dest && loc && loc !== dest) {
          finalCode = "ARR - CONEXÃO";
        }
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
      const destIATA = extractIATA(row.DESTINO || "");
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

      const visKey = `${row.AWB || ""}|${row.HAWB || ""}`;
      const hideReason = visibilityMap[visKey] || "";

      // Discrepancy lookup
      const discKey = `${row.AWB || ""}|${row.HAWB || ""}`;
      let disc = discrepancyMap[discKey] || { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };

      // Suppress false-positive discrepancies for whitelisted AWBs
      const SUPPRESSED_DISCREPANCY_AWBS = new Set<string>(['047-32916380']);
      if (SUPPRESSED_DISCREPANCY_AWBS.has(String(row.AWB || '').trim())) {
        disc = { pieces_discrepancy: false, baseline_pieces: null, has_dis_event: false };
      }

      // Extract intermediate airports (conexões) from timeline
      const originIATAforConn = extractIATA(row.ORIGEM || "");
      const destinIATAforConn = extractIATA(row.DESTINO || "");
      const stopWordsConn = new Set([
        'NIL','NIF','DIS','OFD','OFL','BUP','RDP','LAT','TKG','SCR','ECC',
        'TFD','TRM','RFC','DMG','RET','AWB','PRE','DEP','ARR','RCF','RCS',
        'MAN','NFD','DLV','POD','BKD','FOH','AWD','CCD','ASN','MOV','OFLD',
      ]);
      const seenAirports: string[] = [];
      const seenSet = new Set<string>();
      if (timeline && timeline.length > 0) {
        const chronological = [...timeline].reverse();
        for (const evt of chronological) {
          const candidates: string[] = [];
          const loc = extractIATA(evt.location || "");
          if (loc) candidates.push(loc);
          const desc = (evt.description || "").toUpperCase();
          const evtPrefix = desc.match(/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD)\s+([A-Z]{3})\b/);
          if (evtPrefix) candidates.push(evtPrefix[1]);
          const prepMatch = desc.match(/\b(?:FROM|TO|IN|AT|DEPARTED|ARRIVED)\s+([A-Z]{3})\b/);
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
        }
      }
      const conexao = seenAirports.length > 0 ? seenAirports.join(',') : null;

      // Detect ground transport (RFS) — sufixo -T, X/D literal e códigos legados com X ou D após dígitos
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
        // Apenas sinais inequívocos de RFS: sufixo -T explícito ou notação literal X/D
        if (/\b[A-Z]{2,3}\s?\d{2,5}-T\b/.test(clean)) return true;
        if (/\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b/.test(clean)) return true;
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
          const flightFields = ['Flight', 'flight', 'voo', 'Voo', 'flight_number', 'flightNumber', 'numero_voo'];
          for (const field of flightFields) {
            const v = (electedEvt as any)[field];
            if (!v) continue;
            const s = String(v);
            if (isGroundFlight(s)) { isGroundTransport = true; break; }
            const extracted = extractFlightsFromText(s);
            if (extracted.some(isGroundFlight)) { isGroundTransport = true; break; }
          }
          if (!isGroundTransport) {
            for (const textField of ['status', 'Status', 'Description', 'description', 'details', 'title', 'event_description', 'evento', 'descricao', 'remarks']) {
              const text = (electedEvt as any)[textField];
              if (!text) continue;
              if (hasGroundFlightPattern(String(text))) { isGroundTransport = true; break; }
              const flights = extractFlightsFromText(String(text));
              if (flights.some(isGroundFlight)) { isGroundTransport = true; break; }
            }
          }
        }
      }


      const normalized = {
        awb_number: row.AWB || "",
        hawb_number: row.HAWB || "",
        consignee_nome: row.CLIENTE || clienteMap[row.HAWB] || "",
        clerk: row.ANALISTA || "",
        origin: row.ORIGEM || "",
        destination: row.DESTINO || "",
        conexao,
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

    // Send failure email async
    if (failed.length > 0) {
      sendFailureEmail(failed).catch((e) => console.error("sendFailureEmail error:", e));
    }

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
