import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de códigos IATA para nomes de companhias aéreas
const airlineNames: Record<string, string> = {
  "001": "American Airlines Cargo",
  "005": "Continental Airlines",
  "006": "Delta Cargo",
  "014": "Air Canada Cargo",
  "016": "United Cargo",
  "018": "Canadian Airlines",
  "020": "Lufthansa Cargo",
  "023": "Finnair Cargo",
  "027": "Austrian Cargo",
  "043": "Avianca Cargo",
  "045": "LATAM Cargo",
  "047": "TAP Cargo",
  "055": "ITA Cargo",
  "057": "Air France Cargo",
  "064": "China Airlines Cargo",
  "071": "Ethiopian Cargo",
  "072": "Gulf Air Cargo",
  "074": "KLM Cargo",
  "075": "IAG Cargo",
  "076": "MEA Cargo",
  "079": "Saudia Cargo",
  "081": "Qantas Freight",
  "083": "South African Cargo",
  "085": "SAS Cargo",
  "086": "China Southern Cargo",
  "098": "Air Algérie Cargo",
  "105": "Air India Cargo",
  "106": "China Eastern Cargo",
  "112": "Copa Cargo",
  "114": "Aeroflot Cargo",
  "117": "EVA Air Cargo",
  "118": "Japan Airlines Cargo",
  "126": "Philippine Airlines Cargo",
  "131": "ANA Cargo",
  "134": "Garuda Cargo",
  "139": "Aeromexico Cargo",
  "157": "Qatar Airways Cargo",
  "160": "Cathay Pacific Cargo",
  "172": "Asiana Cargo",
  "176": "Emirates SkyCargo",
  "180": "Korean Air Cargo",
  "182": "Thai Cargo",
  "183": "MIAT Mongolian",
  "195": "Air Mauritius Cargo",
  "201": "Polar Air Cargo",
  "203": "FedEx Express",
  "205": "Cargolux",
  "217": "Malév Cargo",
  "220": "Brussels Airlines Cargo",
  "230": "LOT Cargo",
  "235": "Turkish Cargo",
  "245": "Egyptair Cargo",
  "257": "Royal Jordanian Cargo",
  "258": "Singapore Airlines Cargo",
  "260": "Malaysia Airlines Cargo",
  "279": "Olympic Cargo",
  "286": "Vietnam Airlines Cargo",
  "297": "All Nippon Airways",
  "301": "El Al Cargo",
  "312": "Cubana Cargo",
  "369": "Atlas Air Cargo",
  "406": "Air China Cargo",
  "412": "Xiamen Airlines Cargo",
  "475": "UPS Airlines",
  "489": "Kalitta Air",
  "497": "Martinair Cargo",
  "549": "LATAM Cargo Brasil",
  "577": "Azul Cargo",
  "580": "Gol Cargo",
  "601": "GOL Cargo",
  "607": "Avianca Brasil Cargo",
  "615": "DHL Aviation",
  "618": "Cargolux Italia",
  "623": "AeroLogic",
  "652": "CargoJet",
  "695": "Silk Way Airlines",
  "700": "Ethiopian Cargo",
  "706": "Wamos Air Cargo",
  "714": "Air Cargo Global",
  "720": "Sichuan Airlines Cargo",
  "724": "Swiss WorldCargo",
  "729": "AirBridgeCargo",
  "738": "MNG Airlines",
  "742": "China Postal Airlines",
  "755": "SF Airlines",
  "769": "ASL Airlines",
  "779": "Jet2 Cargo",
  "802": "Icelandair Cargo",
  "818": "El Al Israel Airlines",
  "831": "Air Transat",
  "843": "Southern Air",
  "850": "Astral Aviation",
  "865": "21 Air",
  "876": "Atlas Air",
  "880": "Ukraine International",
  "881": "Condor Cargo",
  "886": "Cargolux Italia",
  "902": "Aerologic",
  "905": "CargoAir",
  "932": "Volga-Dnepr",
  "960": "Sky Lease Cargo",
  "988": "Silkway West",
  "996": "Air Europa Cargo",
  "999": "Western Global",
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
