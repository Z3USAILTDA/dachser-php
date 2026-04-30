import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import mysql from "npm:mysql2@3.11.3/promise";

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function connectWithRetry(maxRetries = 3) {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetch-database-stats] Connection attempt ${attempt}/${maxRetries}...`);
      
      const connection = await mysql.createConnection({
        host: Deno.env.get("MARIADB_OPS_HOST") || "",
        port: parseInt(Deno.env.get("MARIADB_OPS_PORT") || "3306"),
        user: Deno.env.get("MARIADB_OPS_USER") || "",
        password: Deno.env.get("MARIADB_OPS_PASSWORD") || "",
        database: Deno.env.get("MARIADB_OPS_DATABASE") || "",
        connectTimeout: 10000,
      });
      
      console.log(`[fetch-database-stats] Connected successfully on attempt ${attempt}`);
      return connection;
      
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();
      
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
        if (attempt >= maxRetries) throw lastError;
      }
    }
  }
  
  throw lastError || new Error("Failed to connect after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let connection: any = null;

  try {
    connection = await connectWithRetry(3);
    console.log(`[fetch-database-stats] Fetching stats...`);

    const [masterGeneral] = await connection.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_master_dados 
      WHERE active = 1
    `);

    const [masterByModal] = await connection.query(`
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

    const [finNfs] = await connection.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_dados_financeiro_nfs
    `);

    const [finVoucher] = await connection.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM t_dados_financeiro_voucher
    `);

    const [baixas] = await connection.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records,
        SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
      FROM tbaixas
    `);

    console.log("[fetch-database-stats] Querying unique inserts...");
    const [uniqueInsertsRows] = await connection.query(`
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

    const uniqueInsertsMap: Record<string, number> = {};
    for (const row of uniqueInsertsRows as any[]) {
      uniqueInsertsMap[row.tipo_processo] = Number(row.unique_inserts || 0);
    }
    console.log("[fetch-database-stats] Unique inserts map:", uniqueInsertsMap);

    await connection.end();
    connection = null;

    const airBreakdown: ModalBreakdown = {
      lastUpdate: null, totalRecords: 0, recentInserts: 0, uniqueInserts: 0,
      breakdown: {
        "AIR IMPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
        "AIR EXPORT": { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 },
      },
    };

    const seaBreakdown: ModalBreakdown = {
      lastUpdate: null, totalRecords: 0, recentInserts: 0, uniqueInserts: 0,
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
          if (!airMaxDate || d > airMaxDate) airMaxDate = d;
        }
      } else if (modal === "SEA") {
        seaBreakdown.totalRecords += count;
        seaBreakdown.recentInserts += recentInserts;
        seaBreakdown.uniqueInserts += uniqueInserts;
        seaBreakdown.breakdown[tipoProcesso] = { lastUpdate, count, recentInserts, uniqueInserts };
        if (row.last_update) {
          const d = new Date(row.last_update);
          if (!seaMaxDate || d > seaMaxDate) seaMaxDate = d;
        }
      }
    }

    airBreakdown.lastUpdate = airMaxDate ? airMaxDate.toISOString() : null;
    seaBreakdown.lastUpdate = seaMaxDate ? seaMaxDate.toISOString() : null;

    const stats: DatabaseStats = {
      t_master_dados: {
        lastUpdate: masterGeneral[0]?.last_update 
          ? new Date(masterGeneral[0].last_update).toISOString() : null,
        totalRecords: Number(masterGeneral[0]?.total_records || 0),
        recentInserts: Number(masterGeneral[0]?.recent_inserts || 0),
        applications: ["AIR", "SEA", "CCT", "TRACKING", "OLIMPO"],
        byModal: { AIR: airBreakdown, SEA: seaBreakdown },
      },
      t_dados_financeiro_nfs: {
        lastUpdate: finNfs[0]?.last_update 
          ? new Date(finNfs[0].last_update).toISOString() : null,
        totalRecords: Number(finNfs[0]?.total_records || 0),
        recentInserts: Number(finNfs[0]?.recent_inserts || 0),
        applications: ["REGUA"],
      },
      t_dados_financeiro_voucher: {
        lastUpdate: finVoucher[0]?.last_update 
          ? new Date(finVoucher[0].last_update).toISOString() : null,
        totalRecords: Number(finVoucher[0]?.total_records || 0),
        recentInserts: Number(finVoucher[0]?.recent_inserts || 0),
        applications: ["ESTEIRA"],
      },
      tbaixas: {
        lastUpdate: baixas[0]?.last_update 
          ? new Date(baixas[0].last_update).toISOString() : null,
        totalRecords: Number(baixas[0]?.total_records || 0),
        recentInserts: Number(baixas[0]?.recent_inserts || 0),
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
    if (connection) {
      try { await connection.end(); } catch {}
    }
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch database stats";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
