import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    console.log("[count-unique-inserts] Starting query for unique MAWB+HAWB combinations...");

    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
    });

    console.log("[count-unique-inserts] Connected to MariaDB");

    // Query to find truly unique records (MAWB+HAWB combinations that never existed before)
    // A record is "new" if the combination of mawb+hawb was inserted in the last 24h
    // AND that same combination does NOT exist with a data_insert older than 24h
    const query = `
      SELECT 
        tipo_processo,
        COUNT(*) as novos_unicos
      FROM (
        SELECT DISTINCT n.mawb, n.hawb, n.tipo_processo
        FROM t_master_dados n
        WHERE n.active = 1
          AND n.data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND n.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT', 'SEA IMPORT', 'SEA EXPORT')
          AND NOT EXISTS (
            SELECT 1 
            FROM t_master_dados a
            WHERE a.mawb = n.mawb 
              AND a.hawb = n.hawb
              AND a.active = 1
              AND a.data_insert < DATE_SUB(NOW(), INTERVAL 24 HOUR)
          )
      ) AS unicos
      GROUP BY tipo_processo
      ORDER BY tipo_processo
    `;

    console.log("[count-unique-inserts] Executing query...");
    const results = await client.query(query);
    console.log("[count-unique-inserts] Query results:", results);

    // Also get total unique inserts (all types combined)
    const totalQuery = `
      SELECT COUNT(*) as total_novos_unicos
      FROM (
        SELECT DISTINCT n.mawb, n.hawb
        FROM t_master_dados n
        WHERE n.active = 1
          AND n.data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND n.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT', 'SEA IMPORT', 'SEA EXPORT')
          AND NOT EXISTS (
            SELECT 1 
            FROM t_master_dados a
            WHERE a.mawb = n.mawb 
              AND a.hawb = n.hawb
              AND a.active = 1
              AND a.data_insert < DATE_SUB(NOW(), INTERVAL 24 HOUR)
          )
      ) AS unicos_total
    `;

    const totalResult = await client.query(totalQuery);
    const totalNovosUnicos = Number(totalResult[0]?.total_novos_unicos || 0);

    await client.close();
    client = null;

    // Format results
    const breakdown: Record<string, number> = {};
    for (const row of results as any[]) {
      breakdown[row.tipo_processo] = Number(row.novos_unicos);
    }

    console.log(`[count-unique-inserts] Total unique new records: ${totalNovosUnicos}`);
    console.log(`[count-unique-inserts] Breakdown:`, breakdown);

    return new Response(
      JSON.stringify({
        success: true,
        total_novos_unicos: totalNovosUnicos,
        breakdown,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error("[count-unique-inserts] Error:", error);
    
    if (client) {
      try {
        await client.close();
      } catch {}
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
