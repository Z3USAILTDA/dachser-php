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

    // Step 1: Load event codes lookup table (small, ~50 rows)
    const eventsRows = await queryWithRetry(client, `SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb`);
    const eventMap: Record<string, { id: number; descricao_en: string }> = {};
    for (const e of eventsRows || []) {
      if (e.code) eventMap[e.code.trim().toUpperCase()] = { id: Number(e.id), descricao_en: e.descricao_en || "" };
    }

    // Step 2: Load description_eventos lookup (small)
    const descRows = await queryWithRetry(client, `SELECT code, description FROM dados_dachser.t_description_eventos ORDER BY CHAR_LENGTH(description) DESC`);
    const descLookup: Array<{ code: string; description: string }> = (descRows || []).map((d: any) => ({
      code: d.code || "",
      description: (d.description || "").toUpperCase(),
    }));

    // Step 3: Main query — just base data, no heavy JOINs
    const sql = `
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
      where
          (tda.master_insert >= '2026-03-20' or tda.created_at >= '2026-03-20')
    `;

    console.log("Executing tracking aereo query (v2 optimized)...");
    const rows = await queryWithRetry(client, sql);
    console.log(`Query returned ${rows?.length || 0} rows`);

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
      const code0 = lastStatusCode ? lastStatusCode : resolveCode(row.desc0);
      const code1 = resolveCode(row.desc1);
      const code2 = resolveCode(row.desc2);
      const code3 = resolveCode(row.desc3);

      // Determine ultimo_status_correto using hierarchy
      let finalCode: string | null = null;
      const codes = [code0, code1, code2, code3];
      
      // DLV takes priority
      if (codes.some(c => c === "DLV") || lastStatusCode === "DLV") {
        finalCode = "DLV";
      } else {
        const idLast = getEventId(lastStatusCode);
        const id0 = getEventId(code0);
        const id1 = getEventId(code1);
        const id2 = getEventId(code2);
        const id3 = getEventId(code3);

        if (lastStatusCode && idLast >= id0 && idLast >= id1 && idLast >= id2 && idLast >= id3) {
          finalCode = lastStatusCode;
        } else {
          const maxId = Math.max(id0, id1, id2, id3);
          if (maxId === 0) {
            finalCode = lastStatusCode || null;
          } else if (maxId === id0) {
            finalCode = code0;
          } else if (maxId === id1) {
            finalCode = code1;
          } else if (maxId === id2) {
            finalCode = code2;
          } else {
            finalCode = code3;
          }
        }
      }

      const dateStr = ((row.date0 || "") + " " + (row.time0 || "")).trim() || null;

      const normalized = {
        awb_number: row.AWB || "",
        hawb_number: row.HAWB || "",
        consignee_nome: row.CLIENTE || "",
        clerk: row.ANALISTA || "",
        origin: row.ORIGEM || "",
        destination: row.DESTINO || "",
        timeline_json: timeline,
        last_event: finalCode || "",
        last_event_description: getEventDesc(finalCode),
        last_status_code: finalCode || "",
        last_event_date: dateStr,
        last_event_location: row.loc0 || "",
        penultimate_location: row.loc1 || "",
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

    return new Response(JSON.stringify({ success: true, data, failed_count: failed.length }), {
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
