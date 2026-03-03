import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function connectWithRetry(maxRetries = 3): Promise<Client> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[firecrawl-monitor-stats] Connection attempt ${attempt}/${maxRetries}...`);
      const client = await new Client().connect({
        hostname: Deno.env.get("MARIADB_HOST") || "",
        port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
        username: Deno.env.get("MARIADB_USER") || "",
        password: Deno.env.get("MARIADB_PASSWORD") || "",
        db: Deno.env.get("MARIADB_DATABASE") || "",
      });
      console.log(`[firecrawl-monitor-stats] Connected on attempt ${attempt}`);
      return client;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.message.toLowerCase();
      const isTransient = msg.includes("connection reset") || msg.includes("os error 104") ||
        msg.includes("broken pipe") || msg.includes("timed out") || msg.includes("connection refused");
      
      if (isTransient && attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[firecrawl-monitor-stats] Transient error, retrying in ${backoff}ms`);
        await sleep(backoff);
      } else {
        throw lastError;
      }
    }
  }
  throw lastError || new Error("Failed to connect after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    client = await connectWithRetry(3);
    const database = Deno.env.get("MARIADB_DATABASE") || "dados_dachser";

    const rows = await client.query(`
      SELECT 
        MAX(scraped_at) as lastUpdate,
        COUNT(*) as totalRecords,
        SUM(CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recentInserts,
        COUNT(DISTINCT CASE WHEN scraped_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN awb ELSE NULL END) as uniqueAwbs,
        TIMESTAMPDIFF(MINUTE, MAX(scraped_at), NOW()) as minutesSinceUpdate
      FROM ${database}.t_aereo_ws_firecrawl
    `) as any[];

    await client.close();
    client = null;

    const row = rows[0] || {};
    // If TIMESTAMPDIFF returns null or negative, compute from JS side
    let minutesSinceUpdate = row.minutesSinceUpdate != null ? Number(row.minutesSinceUpdate) : null;
    if (minutesSinceUpdate === null || isNaN(minutesSinceUpdate) || minutesSinceUpdate < 0) {
      if (row.lastUpdate) {
        const lastDate = new Date(row.lastUpdate);
        minutesSinceUpdate = Math.round((Date.now() - lastDate.getTime()) / 60000);
      } else {
        minutesSinceUpdate = 9999;
      }
    }
    
    let status: string;
    if (minutesSinceUpdate <= 5) status = "healthy";
    else if (minutesSinceUpdate <= 60) status = "warning";
    else status = "critical";

    const result = {
      lastUpdate: row.lastUpdate ? new Date(row.lastUpdate).toISOString() : null,
      totalRecords: Number(row.totalRecords || 0),
      recentInserts: Number(row.recentInserts || 0),
      uniqueAwbs: Number(row.uniqueAwbs || 0),
      minutesSinceUpdate,
      status,
      fetchedAt: new Date().toISOString(),
    };

    console.log(`[firecrawl-monitor-stats] Done: status=${status}, minutes=${minutesSinceUpdate}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[firecrawl-monitor-stats] Error:", error);
    if (client) { try { await client.close(); } catch {} }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to fetch stats" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
