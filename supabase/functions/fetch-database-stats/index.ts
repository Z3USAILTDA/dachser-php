import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ModalBreakdown {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  uniqueInserts: number;
  breakdown: {
    [key: string]: { lastUpdate: string | null; count: number; recentInserts: number; uniqueInserts: number };
  };
}

interface TableStats {
  lastUpdate: string | null;
  totalRecords: number;
  recentInserts: number;
  uniqueInserts?: number;
  applications: string[];
  byModal?: {
    AIR: ModalBreakdown;
    SEA: ModalBreakdown;
  };
}

interface DatabaseStats {
  t_master_dados: TableStats;
  t_dados_financeiro_nfs: TableStats;
  t_dados_financeiro_voucher: TableStats;
  tbaixas: TableStats;
  fetchedAt: string;
}

// Helper to sleep for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Connect with retry logic for transient network errors
async function connectWithRetry(maxRetries = 3): Promise<Client> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetch-database-stats] Connection attempt ${attempt}/${maxRetries}...`);
      
      const client = await new Client().connect({
        hostname: Deno.env.get("MARIADB_HOST") || "",
        port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
        username: Deno.env.get("MARIADB_USER") || "",
        password: Deno.env.get("MARIADB_PASSWORD") || "",
        db: Deno.env.get("MARIADB_DATABASE") || "",
      });
      
      console.log(`[fetch-database-stats] Connected successfully on attempt ${attempt}`);
      return client;
      
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();
      
      // Check if it's a transient network error worth retrying
      const isTransient = 
        errorMessage.includes("connection reset") ||
        errorMessage.includes("os error 104") ||
        errorMessage.includes("broken pipe") ||
        errorMessage.includes("timed out") ||
        errorMessage.includes("connection refused");
      
      if (isTransient && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[fetch-database-stats] Transient error, retrying in ${backoffMs}ms: ${lastError.message}`);
        await sleep(backoffMs);
      } else {
        console.error(`[fetch-database-stats] Connection failed on attempt ${attempt}: ${lastError.message}`);
        if (attempt >= maxRetries) {
          throw lastError;
        }
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
    console.log(`[fetch-database-stats] Fetching stats...`);

    // Query 1: t_master_dados - general stats with recent inserts (last 24h)
    const masterGeneral = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_master_dados 
      WHERE active = 1
    `);

    // Query 2: t_master_dados - by modal and tipo_processo with recent inserts
    const masterByModal = await client.query(`
      SELECT 
        CASE 
          WHEN tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') THEN 'AIR'
          WHEN tipo_processo IN ('SEA IMPORT', 'SEA EXPORT') THEN 'SEA'
          ELSE 'OTHER'
        END as modal,
        tipo_processo,
        MAX(data_insert) as last_update,
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_master_dados 
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT', 'SEA IMPORT', 'SEA EXPORT')
      GROUP BY modal, tipo_processo
      ORDER BY modal, tipo_processo
    `);

    // Query 3: t_dados_financeiro_nfs with recent inserts
    const finNfs = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_dados_financeiro_nfs
    `);

    // Query 4: t_dados_financeiro_voucher with recent inserts
    const finVoucher = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_dados_financeiro_voucher
    `);

    // Query 5: tbaixas with recent inserts
    const baixas = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM tbaixas
    `);

    // Query 6: Unique inserts by tipo_processo (MAWB+HAWB combinations that never existed before last 24h)
    console.log("[fetch-database-stats] Querying unique inserts...");
    const uniqueInsertsQuery = await client.query(`
      SELECT 
        tipo_processo,
        COUNT(*) as unique_inserts
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
    `);

    // Build unique inserts map
    const uniqueInsertsMap: Record<string, number> = {};
    for (const row of uniqueInsertsQuery as any[]) {
      uniqueInsertsMap[row.tipo_processo] = Number(row.unique_inserts || 0);
    }
    console.log("[fetch-database-stats] Unique inserts map:", uniqueInsertsMap);

    await client.close();
    client = null;

    // Process master data by modal
    const airBreakdown: ModalBreakdown = {
      lastUpdate: null,
      totalRecords: 0,
      recentInserts: 0,
      uniqueInserts: 0,
      breakdown: {
        "AIR IMPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
        "AIR EXPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
      },
    };

    const seaBreakdown: ModalBreakdown = {
      lastUpdate: null,
      totalRecords: 0,
      recentInserts: 0,
      uniqueInserts: 0,
      breakdown: {
        "SEA IMPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
        "SEA EXPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
      },
    };

    let airMaxDate: Date | null = null;
    let seaMaxDate: Date | null = null;

    for (const row of masterByModal as any[]) {
      const modal = row.modal;
      const tipoProcesso = row.tipo_processo;
      const lastUpdate = row.last_update ? new Date(row.last_update).toISOString() : null;
      const count = Number(row.total_records);
      const recentInserts = Number(row.recent_inserts || 0);
      const uniqueInserts = uniqueInsertsMap[tipoProcesso] || 0;

      if (modal === "AIR") {
        airBreakdown.totalRecords += count;
        airBreakdown.recentInserts += recentInserts;
        airBreakdown.uniqueInserts += uniqueInserts;
        airBreakdown.breakdown[tipoProcesso] = { lastUpdate, count, recentInserts, uniqueInserts };
        
        if (row.last_update) {
          const d = new Date(row.last_update);
          if (!airMaxDate || d > airMaxDate) {
            airMaxDate = d;
          }
        }
      } else if (modal === "SEA") {
        seaBreakdown.totalRecords += count;
        seaBreakdown.recentInserts += recentInserts;
        seaBreakdown.uniqueInserts += uniqueInserts;
        seaBreakdown.breakdown[tipoProcesso] = { lastUpdate, count, recentInserts, uniqueInserts };
        
        if (row.last_update) {
          const d = new Date(row.last_update);
          if (!seaMaxDate || d > seaMaxDate) {
            seaMaxDate = d;
          }
        }
      }
    }

    airBreakdown.lastUpdate = airMaxDate ? airMaxDate.toISOString() : null;
    seaBreakdown.lastUpdate = seaMaxDate ? seaMaxDate.toISOString() : null;

    const stats: DatabaseStats = {
      t_master_dados: {
        lastUpdate: (masterGeneral as any[])[0]?.last_update 
          ? new Date((masterGeneral as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((masterGeneral as any[])[0]?.total_records || 0),
        recentInserts: Number((masterGeneral as any[])[0]?.recent_inserts || 0),
        applications: ["AIR", "SEA", "CCT", "TRACKING", "OLIMPO"],
        byModal: {
          AIR: airBreakdown,
          SEA: seaBreakdown,
        },
      },
      t_dados_financeiro_nfs: {
        lastUpdate: (finNfs as any[])[0]?.last_update 
          ? new Date((finNfs as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((finNfs as any[])[0]?.total_records || 0),
        recentInserts: Number((finNfs as any[])[0]?.recent_inserts || 0),
        applications: ["REGUA"],
      },
      t_dados_financeiro_voucher: {
        lastUpdate: (finVoucher as any[])[0]?.last_update 
          ? new Date((finVoucher as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((finVoucher as any[])[0]?.total_records || 0),
        recentInserts: Number((finVoucher as any[])[0]?.recent_inserts || 0),
        applications: ["ESTEIRA"],
      },
      tbaixas: {
        lastUpdate: (baixas as any[])[0]?.last_update 
          ? new Date((baixas as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((baixas as any[])[0]?.total_records || 0),
        recentInserts: Number((baixas as any[])[0]?.recent_inserts || 0),
        applications: ["ESTEIRA"],
      },
      fetchedAt: new Date().toISOString(),
    };

    console.log(`[fetch-database-stats] Stats fetched successfully`);

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error(`[fetch-database-stats] Error:`, error);
    
    if (client) {
      try {
        await client.close();
      } catch {}
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to fetch database stats";

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
