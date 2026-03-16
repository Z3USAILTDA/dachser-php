import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import mysql from "npm:mysql2@3.11.3/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const airlineNames: Record<string, string> = {
  "001": "American Airlines Cargo",
  "006": "Delta Cargo",
  "014": "Air Canada Cargo",
  "016": "United Cargo",
  "020": "Lufthansa Cargo",
  "023": "FedEx Express",
  "045": "LATAM Cargo",
  "047": "TAP Air Portugal Cargo",
  "055": "ITA Airways Cargo",
  "057": "Air France Cargo",
  "074": "AF/KL Cargo",
  "075": "IAG Cargo",
  "083": "SAA Cargo",
  "112": "China Cargo Airlines",
  "118": "TAAG Angola Airlines",
  "125": "IAG Cargo (British Airways)",
  "127": "Gol Linhas Aéreas (GOLLOG)",
  "139": "Aeromexico Cargo",
  "145": "LATAM Cargo Chile",
  "147": "Royal Air Maroc",
  "157": "Qatar Airways Cargo",
  "160": "Cathay Cargo",
  "172": "Cargolux",
  "176": "Emirates SkyCargo",
  "202": "DHL Avianca Cargo",
  "235": "Turkish Airlines Cargo",
  "318": "SKY Carga",
  "369": "Atlas Air",
  "406": "UPS Airlines",
  "549": "LATAM Cargo (Alt)",
  "577": "Azul Cargo",
  "605": "SKY Airline Chile",
  "615": "European Air Transport (DHL)",
  "724": "Swiss WorldCargo",
  "729": "Avianca Cargo",
  "805": "GSA Force",
  "827": "RUSA",
  "865": "MasAir (SmartKargo)",
  "881": "Condor Flugdienst",
  "992": "DHL Aviation Cargo",
  "996": "Air Europa Cargo",
  "999": "Air China Cargo",
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function connectWithRetry(maxRetries = 3) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetch-master-dados-stats] Connection attempt ${attempt}/${maxRetries}...`);
      const connection = await mysql.createConnection({
        host: Deno.env.get("MARIADB_HOST") || "",
        user: Deno.env.get("MARIADB_USER") || "",
        password: Deno.env.get("MARIADB_PASSWORD") || "",
        database: Deno.env.get("MARIADB_DATABASE") || "",
        port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
        connectTimeout: 10000,
      });
      console.log(`[fetch-master-dados-stats] Connected on attempt ${attempt}`);
      return connection;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.message.toLowerCase();
      const isTransient = msg.includes("etimedout") || msg.includes("connection reset") || msg.includes("os error 104") || msg.includes("broken pipe") || msg.includes("timed out") || msg.includes("connection refused");
      if (isTransient && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[fetch-master-dados-stats] Transient error, retrying in ${backoffMs}ms: ${lastError.message}`);
        await sleep(backoffMs);
      } else {
        if (attempt >= maxRetries) throw lastError;
      }
    }
  }
  throw lastError || new Error("Failed to connect after retries");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let connection: any = null;

  try {
    connection = await connectWithRetry(3);

    const [lastUpdateRows] = await connection.query(`
      SELECT MAX(data_insert) as last_update
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
    `);
    const lastUpdate = lastUpdateRows[0]?.last_update || null;
    console.log("Last update:", lastUpdate);

    const [statsRows] = await connection.query(
      `SELECT COUNT(*) as total_records
       FROM t_master_dados
       WHERE active = 1 
         AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
         AND data_insert = ?`,
      [lastUpdate]
    );

    const [breakdownRows] = await connection.query(
      `SELECT 
        LEFT(mawb, 3) as airline_code, 
        COUNT(*) as count
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND mawb IS NOT NULL 
        AND mawb != ''
        AND data_insert = ?
      GROUP BY LEFT(mawb, 3)
      ORDER BY count DESC`,
      [lastUpdate]
    );

    await connection.end();
    connection = null;

    const totalRecords = Number(statsRows[0]?.total_records || 0);

    const unmappedCodes: string[] = [];
    const airlineBreakdown = breakdownRows.map((row: any) => {
      const code = row.airline_code || "???";
      const name = airlineNames[code];
      if (!name && code !== "???" && code.trim() !== "") {
        unmappedCodes.push(code);
      }
      return {
        code,
        name: name || code,
        count: Number(row.count || 0),
      };
    });

    if (unmappedCodes.length > 0) {
      console.log(`Códigos IATA não mapeados: ${unmappedCodes.join(", ")}`);
    }

    console.log(`Estatísticas: ${totalRecords} AWBs, última atualização: ${lastUpdate}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: { lastUpdate, totalRecords, airlineBreakdown },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Erro ao buscar estatísticas:", error);
    if (connection) {
      try { await connection.end(); } catch {}
    }
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
