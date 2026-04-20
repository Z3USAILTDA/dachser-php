import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let client: Client | null = null;
  const out: any = { queries: [] };

  try {
    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST")!,
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      db: Deno.env.get("MARIADB_DATABASE")!,
      username: Deno.env.get("MARIADB_USER")!,
      password: Deno.env.get("MARIADB_PASSWORD")!,
    });

    const url = new URL(req.url);
    const targetAwb = url.searchParams.get("awb") || "020-07276290";

    // Q1
    const q1 = await client.query(`SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb`);
    out.queries.push({ name: "1_t_eventos_awb", sql: "SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb", row_count: q1.length, sample: q1.slice(0, 5), all_rows: q1 });

    // Q2
    const q2 = await client.query(`SELECT code, description FROM dados_dachser.t_description_eventos ORDER BY CHAR_LENGTH(description) DESC`);
    out.queries.push({ name: "2_t_description_eventos", sql: "SELECT code, description FROM dados_dachser.t_description_eventos ORDER BY CHAR_LENGTH(description) DESC", row_count: q2.length, sample: q2.slice(0, 10) });

    // Q3 — Main query (LIMITED, but ensure target AWB is included)
    const mainSql = `
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
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc0,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[1].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc1,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[2].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc2,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[3].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc3,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc0,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[1].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc1,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].date')) using utf8mb4) collate utf8mb4_unicode_ci as date0,
            convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].time')) using utf8mb4) collate utf8mb4_unicode_ci as time0
        from dados_dachser.t_dados_aereo tda
        left join dados_dachser.t_fato_aereo tdaf
            on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
           and json_valid(tdaf.hawbs_json)
           and json_contains(tdaf.hawbs_json, json_array(tda.hawb_number))
        where (tda.master_insert >= '2026-03-20' or tda.created_at >= '2026-03-20')
          and tda.awb_number = ?
      )
      select * from base
    `;
    const q3 = await client.query(mainSql, [targetAwb]);
    out.queries.push({ name: `3_main_query_filtered_to_${targetAwb}`, sql: mainSql, row_count: q3.length, rows: q3 });

    // Q4 — t_master_dados sample
    const q4 = await client.query(`SELECT hawb, cliente FROM dados_dachser.t_master_dados WHERE hawb IS NOT NULL AND cliente IS NOT NULL AND cliente != '' LIMIT 5`);
    out.queries.push({ name: "4_t_master_dados_sample", row_count: q4.length, sample: q4 });

    // Q5 — visibility (introspect schema first, then sample)
    const q5cols = await client.query(`SHOW COLUMNS FROM dados_dachser.t_air_process_visibility`);
    out.queries.push({ name: "5a_t_air_process_visibility_columns", rows: q5cols });
    const q5 = await client.query(`SELECT * FROM dados_dachser.t_air_process_visibility LIMIT 50`);
    out.queries.push({ name: "5_t_air_process_visibility", row_count: q5.length, sample: q5 });

    // Q6 — discrepancy filtered to target
    const q6 = await client.query(
      `SELECT awb, hawb, JSON_LENGTH(timeline_json) AS timeline_len, timeline_json
       FROM dados_dachser.t_fato_aereo WHERE awb = ?`,
      [targetAwb],
    );
    out.queries.push({ name: `6_t_fato_aereo_raw_${targetAwb}`, row_count: q6.length, rows: q6 });

    // Q7 — Expand timeline of target AWB via JSON_TABLE with timestamp parsing
    const q7 = await client.query(
      `SELECT
         jt.ordem,
         jt.description,
         jt.location,
         jt.date,
         jt.time,
         STR_TO_DATE(CONCAT(NULLIF(jt.date,''), ' ', IFNULL(NULLIF(jt.time,''),'00:00')), '%d %b %Y %H:%i') AS parsed_ts
       FROM dados_dachser.t_fato_aereo tdaf
       JOIN JSON_TABLE(tdaf.timeline_json, '$[*]' COLUMNS (
         ordem FOR ORDINALITY,
         description VARCHAR(1000) PATH '$.description',
         location    VARCHAR(255)  PATH '$.location',
         date        VARCHAR(50)   PATH '$.date',
         time        VARCHAR(20)   PATH '$.time'
       )) jt
       WHERE tdaf.awb = ?
       ORDER BY jt.ordem`,
      [targetAwb],
    );
    out.queries.push({ name: `7_timeline_expanded_${targetAwb}_by_position`, row_count: q7.length, rows: q7 });

    // Q7b — Same but ordered by parsed timestamp DESC
    const q7b = await client.query(
      `SELECT
         jt.ordem AS posicao_original,
         jt.description,
         jt.location,
         jt.date,
         jt.time,
         STR_TO_DATE(CONCAT(NULLIF(jt.date,''), ' ', IFNULL(NULLIF(jt.time,''),'00:00')), '%d %b %Y %H:%i') AS parsed_ts
       FROM dados_dachser.t_fato_aereo tdaf
       JOIN JSON_TABLE(tdaf.timeline_json, '$[*]' COLUMNS (
         ordem FOR ORDINALITY,
         description VARCHAR(1000) PATH '$.description',
         location    VARCHAR(255)  PATH '$.location',
         date        VARCHAR(50)   PATH '$.date',
         time        VARCHAR(20)   PATH '$.time'
       )) jt
       WHERE tdaf.awb = ?
       ORDER BY parsed_ts DESC`,
      [targetAwb],
    );
    out.queries.push({ name: `7b_timeline_expanded_${targetAwb}_ordered_by_timestamp_DESC`, row_count: q7b.length, rows: q7b });

    await client.close();
    client = null;

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error), partial: out }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
