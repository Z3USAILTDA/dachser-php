import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de códigos IATA para nomes de companhias aéreas
const airlineNames: Record<string, string> = {
  "006": "Delta Cargo",
  "016": "United Cargo",
  "020": "Lufthansa Cargo",
  "045": "LATAM Cargo",
  "047": "TAP Cargo",
  "055": "ITA Cargo",
  "057": "Air France Cargo",
  "074": "KLM Cargo",
  "075": "IAG Cargo",
  "139": "Aeromexico Cargo",
  "176": "Emirates SkyCargo",
  "180": "Korean Air Cargo",
  "205": "Cargolux",
  "235": "Turkish Cargo",
  "369": "Atlas Air Cargo",
  "549": "LATAM Cargo",
  "577": "Azul Cargo",
  "615": "DHL Aviation",
  "724": "Swiss WorldCargo",
  "881": "Condor Cargo",
  "996": "Air Europa Cargo",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    console.log("Iniciando busca de estatísticas do t_master_dados...");

    // Conectar ao MariaDB
    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST") || "",
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    });

    console.log("Conectado ao MariaDB");

    // Query para última atualização e total de registros
    const statsQuery = `
      SELECT 
        MAX(data_insert) as last_update, 
        COUNT(*) as total_records
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
    `;

    const statsResult = await client.query(statsQuery);
    console.log("Stats result:", statsResult);

    // Query para distribuição por companhia aérea
    const breakdownQuery = `
      SELECT 
        LEFT(mawb, 3) as airline_code, 
        COUNT(*) as count
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND mawb IS NOT NULL 
        AND mawb != ''
      GROUP BY LEFT(mawb, 3)
      ORDER BY count DESC
    `;

    const breakdownResult = await client.query(breakdownQuery);
    console.log("Breakdown result:", breakdownResult);

    // Processar resultados
    const lastUpdate = statsResult[0]?.last_update || null;
    const totalRecords = Number(statsResult[0]?.total_records || 0);

    // Mapear breakdown com nomes de companhias
    const airlineBreakdown = breakdownResult.map((row: any) => ({
      code: row.airline_code || "???",
      name: airlineNames[row.airline_code] || "Desconhecida",
      count: Number(row.count || 0),
    }));

    await client.close();

    console.log(`Estatísticas: ${totalRecords} AWBs, última atualização: ${lastUpdate}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          lastUpdate,
          totalRecords,
          airlineBreakdown,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Erro ao buscar estatísticas:", error);

    if (client) {
      try {
        await client.close();
      } catch (closeError) {
        console.error("Erro ao fechar conexão:", closeError);
      }
    }

    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
