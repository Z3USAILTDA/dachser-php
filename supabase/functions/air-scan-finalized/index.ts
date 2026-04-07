import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractIATA(loc: string): string {
  if (!loc) return "";
  const t = loc.trim();
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  return t.substring(0, 3).toUpperCase();
}

function parseTextDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Format: "31 Mar 2026 23:00" or "31 Mar 2026"
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const m = dateStr.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const mon = months[m[2].toUpperCase()];
  if (mon === undefined) return null;
  const d = new Date(parseInt(m[3]), mon, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
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

    client = await new Client().connect({ hostname: host, port, db: database, username, password });

    // Step 1: Create table if not exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_air_process_visibility (
        id INT AUTO_INCREMENT PRIMARY KEY,
        awb VARCHAR(30) NOT NULL,
        hawb VARCHAR(50),
        hide_reason VARCHAR(30) NOT NULL,
        arr_destino_date DATETIME DEFAULT NULL,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_awb_hawb (awb, hawb)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("Table t_air_process_visibility ensured");

    // Step 2: Fetch all tracking data via the same query as fetch-tracking-aereo
    const sql = `
      select
          tda.awb_number as AWB,
          tda.hawb_number as HAWB,
          tdaf.destination as DESTINO,
          tdaf.last_status_code,
          tdaf.timeline_json as TIMELINE
      from dados_dachser.t_dados_aereo tda
      left join dados_dachser.t_fato_aereo tdaf
          on tdaf.awb collate utf8mb4_unicode_ci = tda.awb_number collate utf8mb4_unicode_ci
         and json_valid(tdaf.hawbs_json)
         and json_contains(tdaf.hawbs_json, json_array(tda.hawb_number))
      where
          (tda.master_insert >= '2026-03-20' or tda.created_at >= '2026-03-20')
    `;

    const rows = await client.query(sql);
    console.log(`Scan: ${rows?.length || 0} rows to analyze`);

    const now = Date.now();
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    let insertedCount = 0;

    for (const row of rows || []) {
      const awb = row.AWB || "";
      const hawb = row.HAWB || "";
      if (!awb) continue;

      let timeline: any[] = [];
      try {
        if (row.TIMELINE) {
          timeline = typeof row.TIMELINE === "string" ? JSON.parse(row.TIMELINE) : row.TIMELINE;
        }
      } catch (_) { continue; }

      const lastStatus = (row.last_status_code || "").toUpperCase();

      // Check DLV
      const isDLV = lastStatus === "DLV" || timeline.some((e: any) => {
        const desc = (e.description || "").toUpperCase();
        return desc.includes("DELIVERED") && !desc.includes("DOCUMENTS DELIVERED");
      });

      if (isDLV) {
        try {
          await client.execute(
            `INSERT INTO dados_dachser.t_air_process_visibility (awb, hawb, hide_reason) VALUES (?, ?, 'DLV') ON DUPLICATE KEY UPDATE hide_reason = 'DLV', detected_at = CURRENT_TIMESTAMP`,
            [awb, hawb]
          );
          insertedCount++;
        } catch (_) {}
        continue;
      }

      // Check ARR at destination > 5 days
      const destIATA = extractIATA(row.DESTINO || "");
      if (!destIATA || timeline.length === 0) continue;

      for (const evt of timeline) {
        const desc = (evt.description || "").toUpperCase();
        const evtLoc = extractIATA(evt.location || "");
        if (desc.includes("ARRIVED") && evtLoc === destIATA) {
          const d = (evt.date || "").trim();
          if (d) {
            const parsed = parseTextDate(d);
            if (parsed && (now - parsed.getTime()) > FIVE_DAYS_MS) {
              const mysqlDate = parsed.toISOString().slice(0, 19).replace("T", " ");
              try {
                await client.execute(
                  `INSERT INTO dados_dachser.t_air_process_visibility (awb, hawb, hide_reason, arr_destino_date) VALUES (?, ?, 'ARR_DESTINO_5D', ?) ON DUPLICATE KEY UPDATE hide_reason = 'ARR_DESTINO_5D', arr_destino_date = VALUES(arr_destino_date), detected_at = CURRENT_TIMESTAMP`,
                  [awb, hawb, mysqlDate]
                );
                insertedCount++;
              } catch (_) {}
            }
          }
          break;
        }
      }
    }

    await client.close();
    client = null;

    console.log(`Scan complete: ${insertedCount} records inserted/updated`);

    return new Response(JSON.stringify({ success: true, scanned: rows?.length || 0, persisted: insertedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("air-scan-finalized error:", error);
    if (client) { try { await client.close(); } catch (_) {} }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
