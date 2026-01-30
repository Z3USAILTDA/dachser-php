import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ModalBreakdown {
  lastUpdate: string | null;
  totalRecords: number;
  breakdown: {
    [key: string]: { lastUpdate: string | null; count: number };
  };
}

interface TableStats {
  lastUpdate: string | null;
  totalRecords: number;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const client = await new Client().connect({
    hostname: Deno.env.get("MARIADB_HOST") || "",
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    username: Deno.env.get("MARIADB_USER") || "",
    password: Deno.env.get("MARIADB_PASSWORD") || "",
    db: Deno.env.get("MARIADB_DATABASE") || "",
  });

  try {
    console.log(`[fetch-database-stats] Connected. Fetching stats...`);

    // Query 1: t_master_dados - general stats
    const masterGeneral = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records
      FROM t_master_dados 
      WHERE active = 1
    `);

    // Query 2: t_master_dados - by modal and tipo_processo
    const masterByModal = await client.query(`
      SELECT 
        CASE 
          WHEN tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') THEN 'AIR'
          WHEN tipo_processo IN ('SEA IMPORT', 'SEA EXPORT') THEN 'SEA'
          ELSE 'OTHER'
        END as modal,
        tipo_processo,
        MAX(data_insert) as last_update,
        COUNT(*) as total_records
      FROM t_master_dados 
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT', 'SEA IMPORT', 'SEA EXPORT')
      GROUP BY modal, tipo_processo
      ORDER BY modal, tipo_processo
    `);

    // Query 3: t_dados_financeiro_nfs
    const finNfs = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records
      FROM t_dados_financeiro_nfs
    `);

    // Query 4: t_dados_financeiro_voucher
    const finVoucher = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records
      FROM t_dados_financeiro_voucher
    `);

    // Query 5: tbaixas
    const baixas = await client.query(`
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records
      FROM tbaixas
    `);

    await client.close();

    // Process master data by modal
    const airBreakdown: ModalBreakdown = {
      lastUpdate: null,
      totalRecords: 0,
      breakdown: {
        "AIR IMPORT": { lastUpdate: null, count: 0 },
        "AIR EXPORT": { lastUpdate: null, count: 0 },
      },
    };

    const seaBreakdown: ModalBreakdown = {
      lastUpdate: null,
      totalRecords: 0,
      breakdown: {
        "SEA IMPORT": { lastUpdate: null, count: 0 },
        "SEA EXPORT": { lastUpdate: null, count: 0 },
      },
    };

    let airMaxDate: Date | null = null;
    let seaMaxDate: Date | null = null;

    for (const row of masterByModal as any[]) {
      const modal = row.modal;
      const tipoProcesso = row.tipo_processo;
      const lastUpdate = row.last_update ? new Date(row.last_update).toISOString() : null;
      const count = Number(row.total_records);

      if (modal === "AIR") {
        airBreakdown.totalRecords += count;
        airBreakdown.breakdown[tipoProcesso] = { lastUpdate, count };
        
        if (row.last_update) {
          const d = new Date(row.last_update);
          if (!airMaxDate || d > airMaxDate) {
            airMaxDate = d;
          }
        }
      } else if (modal === "SEA") {
        seaBreakdown.totalRecords += count;
        seaBreakdown.breakdown[tipoProcesso] = { lastUpdate, count };
        
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
        applications: ["REGUA"],
      },
      t_dados_financeiro_voucher: {
        lastUpdate: (finVoucher as any[])[0]?.last_update 
          ? new Date((finVoucher as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((finVoucher as any[])[0]?.total_records || 0),
        applications: ["ESTEIRA"],
      },
      tbaixas: {
        lastUpdate: (baixas as any[])[0]?.last_update 
          ? new Date((baixas as any[])[0].last_update).toISOString() 
          : null,
        totalRecords: Number((baixas as any[])[0]?.total_records || 0),
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
    
    try {
      await client.close();
    } catch {}

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
