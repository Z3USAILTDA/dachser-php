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
  const smtpPort = Deno.env.get("SMTP_PORT");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
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

    const sql = `
      with base as (
          select
              tda.awb_number as awb,
              tda.hawb_number as hawb,
              tda.consignee_nome as cliente,
              tdaf.origin as origem,
              tdaf.destination as destino,
              tda.clerk as analista,
              tdaf.last_status_code,
              tdaf.timeline_json,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc0,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[1].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc1,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[2].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc2,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[3].description')) using utf8mb4) collate utf8mb4_unicode_ci as desc3,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc0,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[1].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc1,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[2].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc2,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[3].location')) using utf8mb4) collate utf8mb4_unicode_ci as loc3,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].date')) using utf8mb4) collate utf8mb4_unicode_ci as date0,
              convert(json_unquote(json_extract(tdaf.timeline_json, '$[0].time')) using utf8mb4) collate utf8mb4_unicode_ci as time0
          from dados_dachser.t_dados_aereo tda
          left join dados_dachser.t_fato_aereo tdaf
              on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
             and json_valid(tdaf.hawbs_json)
             and json_contains(tdaf.hawbs_json, json_array(tda.hawb_number))
          where
              (
                  tda.master_insert >= '2026-03-20'
                  or tda.created_at >= '2026-03-20'
              )
      ),
      codes as (
          select
              b.*,
              case
                  when nullif(b.last_status_code, '') is not null then b.last_status_code
                  when b.desc0 like '(%' then substring_index(substring_index(b.desc0, ')', 1), '(', -1)
                  when upper(b.desc0) like '%OFFLOADED%' then 'OFLD'
                  when upper(b.desc0) like '%READY FOR PICK-UP%' then 'NFD'
                  when upper(b.desc0) like '%AGENT NOTIFIED%' then 'NFD'
                  when upper(b.desc0) like '%NOTIFIED FOR DELIVERY%' then 'NFD'
                  when upper(b.desc0) like '%DOCUMENTS DELIVERED%' then 'AWD'
                  when upper(b.desc0) like '%RECEIVED FROM FLIGHT%' then 'RCF'
                  when upper(b.desc0) like '%RECEIVED FROM SHIPPER%' then 'RCS'
                  when upper(b.desc0) like '%READY FOR CARRIAGE%' then 'RCS'
                  when upper(b.desc0) like '%FREIGHT ON HAND%' then 'FOH'
                  when upper(b.desc0) like '%MANIFESTED%' then 'MAN'
                  when upper(b.desc0) like '%DEPARTED%' then 'DEP'
                  when upper(b.desc0) like '%ARRIVED%' then 'ARR'
                  when upper(b.desc0) like '%DELIVERED%' then 'DLV'
                  else (
                      select d.code
                      from dados_dachser.t_description_eventos d
                      where upper(b.desc0) like concat(upper(d.description), '%')
                      order by char_length(d.description) desc
                      limit 1
                  )
              end as code0,
              case
                  when b.desc1 like '(%' then substring_index(substring_index(b.desc1, ')', 1), '(', -1)
                  when upper(b.desc1) like '%OFFLOADED%' then 'OFLD'
                  when upper(b.desc1) like '%READY FOR PICK-UP%' then 'NFD'
                  when upper(b.desc1) like '%AGENT NOTIFIED%' then 'NFD'
                  when upper(b.desc1) like '%NOTIFIED FOR DELIVERY%' then 'NFD'
                  when upper(b.desc1) like '%DOCUMENTS DELIVERED%' then 'AWD'
                  when upper(b.desc1) like '%RECEIVED FROM FLIGHT%' then 'RCF'
                  when upper(b.desc1) like '%RECEIVED FROM SHIPPER%' then 'RCS'
                  when upper(b.desc1) like '%READY FOR CARRIAGE%' then 'RCS'
                  when upper(b.desc1) like '%FREIGHT ON HAND%' then 'FOH'
                  when upper(b.desc1) like '%MANIFESTED%' then 'MAN'
                  when upper(b.desc1) like '%DEPARTED%' then 'DEP'
                  when upper(b.desc1) like '%ARRIVED%' then 'ARR'
                  when upper(b.desc1) like '%DELIVERED%' then 'DLV'
                  else (
                      select d.code
                      from dados_dachser.t_description_eventos d
                      where upper(b.desc1) like concat(upper(d.description), '%')
                      order by char_length(d.description) desc
                      limit 1
                  )
              end as code1,
              case
                  when b.desc2 like '(%' then substring_index(substring_index(b.desc2, ')', 1), '(', -1)
                  when upper(b.desc2) like '%OFFLOADED%' then 'OFLD'
                  when upper(b.desc2) like '%READY FOR PICK-UP%' then 'NFD'
                  when upper(b.desc2) like '%AGENT NOTIFIED%' then 'NFD'
                  when upper(b.desc2) like '%NOTIFIED FOR DELIVERY%' then 'NFD'
                  when upper(b.desc2) like '%DOCUMENTS DELIVERED%' then 'AWD'
                  when upper(b.desc2) like '%RECEIVED FROM FLIGHT%' then 'RCF'
                  when upper(b.desc2) like '%RECEIVED FROM SHIPPER%' then 'RCS'
                  when upper(b.desc2) like '%READY FOR CARRIAGE%' then 'RCS'
                  when upper(b.desc2) like '%FREIGHT ON HAND%' then 'FOH'
                  when upper(b.desc2) like '%MANIFESTED%' then 'MAN'
                  when upper(b.desc2) like '%DEPARTED%' then 'DEP'
                  when upper(b.desc2) like '%ARRIVED%' then 'ARR'
                  when upper(b.desc2) like '%DELIVERED%' then 'DLV'
                  else (
                      select d.code
                      from dados_dachser.t_description_eventos d
                      where upper(b.desc2) like concat(upper(d.description), '%')
                      order by char_length(d.description) desc
                      limit 1
                  )
              end as code2,
              case
                  when b.desc3 like '(%' then substring_index(substring_index(b.desc3, ')', 1), '(', -1)
                  when upper(b.desc3) like '%OFFLOADED%' then 'OFLD'
                  when upper(b.desc3) like '%READY FOR PICK-UP%' then 'NFD'
                  when upper(b.desc3) like '%AGENT NOTIFIED%' then 'NFD'
                  when upper(b.desc3) like '%NOTIFIED FOR DELIVERY%' then 'NFD'
                  when upper(b.desc3) like '%DOCUMENTS DELIVERED%' then 'AWD'
                  when upper(b.desc3) like '%RECEIVED FROM FLIGHT%' then 'RCF'
                  when upper(b.desc3) like '%RECEIVED FROM SHIPPER%' then 'RCS'
                  when upper(b.desc3) like '%READY FOR CARRIAGE%' then 'RCS'
                  when upper(b.desc3) like '%FREIGHT ON HAND%' then 'FOH'
                  when upper(b.desc3) like '%MANIFESTED%' then 'MAN'
                  when upper(b.desc3) like '%DEPARTED%' then 'DEP'
                  when upper(b.desc3) like '%ARRIVED%' then 'ARR'
                  when upper(b.desc3) like '%DELIVERED%' then 'DLV'
                  else (
                      select d.code
                      from dados_dachser.t_description_eventos d
                      where upper(b.desc3) like concat(upper(d.description), '%')
                      order by char_length(d.description) desc
                      limit 1
                  )
              end as code3
          from base b
      ),
      ids as (
          select
              c.*,
              e_last.id as id_last_status,
              e0.id as id0,
              e1.id as id1,
              e2.id as id2,
              e3.id as id3
          from codes c
          left join dados_dachser.t_eventos_awb e_last
              on e_last.code collate utf8mb4_unicode_ci = c.last_status_code collate utf8mb4_unicode_ci
          left join dados_dachser.t_eventos_awb e0
              on e0.code collate utf8mb4_unicode_ci = c.code0 collate utf8mb4_unicode_ci
          left join dados_dachser.t_eventos_awb e1
              on e1.code collate utf8mb4_unicode_ci = c.code1 collate utf8mb4_unicode_ci
          left join dados_dachser.t_eventos_awb e2
              on e2.code collate utf8mb4_unicode_ci = c.code2 collate utf8mb4_unicode_ci
          left join dados_dachser.t_eventos_awb e3
              on e3.code collate utf8mb4_unicode_ci = c.code3 collate utf8mb4_unicode_ci
      ),
      final as (
          select
              i.*,
              case
                  when i.code0 = 'DLV' or i.code1 = 'DLV' or i.code2 = 'DLV' or i.code3 = 'DLV' or i.last_status_code = 'DLV'
                      then 'DLV'
                  when nullif(i.last_status_code, '') is not null
                       and ifnull(i.id_last_status, 0) >= ifnull(i.id0, 0)
                       and ifnull(i.id_last_status, 0) >= ifnull(i.id1, 0)
                       and ifnull(i.id_last_status, 0) >= ifnull(i.id2, 0)
                       and ifnull(i.id_last_status, 0) >= ifnull(i.id3, 0)
                      then i.last_status_code
                  when greatest(
                      ifnull(i.id0, 0),
                      ifnull(i.id1, 0),
                      ifnull(i.id2, 0),
                      ifnull(i.id3, 0)
                  ) = ifnull(i.id0, 0) then i.code0
                  when greatest(
                      ifnull(i.id0, 0),
                      ifnull(i.id1, 0),
                      ifnull(i.id2, 0),
                      ifnull(i.id3, 0)
                  ) = ifnull(i.id1, 0) then i.code1
                  when greatest(
                      ifnull(i.id0, 0),
                      ifnull(i.id1, 0),
                      ifnull(i.id2, 0),
                      ifnull(i.id3, 0)
                  ) = ifnull(i.id2, 0) then i.code2
                  when greatest(
                      ifnull(i.id0, 0),
                      ifnull(i.id1, 0),
                      ifnull(i.id2, 0),
                      ifnull(i.id3, 0)
                  ) = ifnull(i.id3, 0) then i.code3
                  else i.last_status_code
              end as ultimo_status_correto_code
          from ids i
      )
      select
          f.awb as AWB,
          f.hawb as HAWB,
          f.cliente as CLIENTE,
          f.origem as ORIGEM,
          f.destino as DESTINO,
          f.loc0 as LOCALIZACAO_ULTIMO_EVENTO,
          f.loc1 as LOCALIZACAO_PENULTIMO_EVENTO,
          f.loc2 as LOCALIZACAO_ANTEPENULTIMO_EVENTO,
          f.loc3 as LOCALIZACAO_ANTES_ANTEPENULTIMO_EVENTO,
          f.analista as ANALISTA,
          f.timeline_json as TIMELINE,
          trim(concat(ifnull(f.date0, ''), ' ', ifnull(f.time0, ''))) as DATA_HORA_ULTIMO_EVENTO,
          f.ultimo_status_correto_code as ULTIMO_STATUS_CODE,
          e_final.descricao_en as ULTIMO_STATUS_CORRETO
      from final f
      left join dados_dachser.t_eventos_awb e_final
          on e_final.code collate utf8mb4_unicode_ci = f.ultimo_status_correto_code collate utf8mb4_unicode_ci
    `;

    console.log("Executing tracking aereo query (v2 CTEs)...");
    const rows = await queryWithRetry(client, sql);
    console.log(`Query returned ${rows?.length || 0} rows`);

    const data: any[] = [];
    const failed: any[] = [];

    for (const row of rows || []) {
      let timeline: any[] = [];
      try {
        if (row.TIMELINE) {
          timeline = typeof row.TIMELINE === "string" ? JSON.parse(row.TIMELINE) : row.TIMELINE;
        }
      } catch (e) {
        console.warn(`Failed to parse timeline for AWB ${row.AWB}:`, e);
      }

      const normalized = {
        awb_number: row.AWB || "",
        hawb_number: row.HAWB || "",
        consignee_nome: row.CLIENTE || "",
        clerk: row.ANALISTA || "",
        origin: row.ORIGEM || "",
        destination: row.DESTINO || "",
        timeline_json: timeline,
        last_event: row.ULTIMO_STATUS_CODE || "",
        last_event_description: row.ULTIMO_STATUS_CORRETO || "",
        last_status_code: row.ULTIMO_STATUS_CODE || "",
        last_event_date: (row.DATA_HORA_ULTIMO_EVENTO || "").trim() || null,
        last_event_location: row.LOCALIZACAO_ULTIMO_EVENTO || "",
        penultimate_location: row.LOCALIZACAO_PENULTIMO_EVENTO || "",
      };

      if (!row.ULTIMO_STATUS_CORRETO && !row.ULTIMO_STATUS_CODE) {
        failed.push({ awb: row.AWB || "", hawb: row.HAWB || "", cliente: row.CLIENTE || "" });
        normalized.last_event = "";
        normalized.last_status_code = "";
      }

      data.push(normalized);
    }

    await client.close();
    client = null;

    // Send failure email asynchronously (don't block response)
    if (failed.length > 0) {
      sendFailureEmail(failed).catch((e) => console.error("sendFailureEmail error:", e));
    }

    return new Response(JSON.stringify({ success: true, data, failed_count: failed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-tracking-aereo error:", error);

    if (client) {
      try { await client.close(); } catch (_) {}
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
