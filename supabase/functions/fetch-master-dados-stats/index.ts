import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de códigos IATA para nomes de companhias aéreas
// Fonte principal: monitoredAirlinesData em src/pages/Index.tsx (lista validada)
// Códigos extras mantidos para CIAs que aparecem ocasionalmente na base
const airlineNames: Record<string, string> = {
  // === CIAs Monitoradas (lista validada) ===
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
  
  // === CIAs Extras (aparecem ocasionalmente na base) ===
  "005": "Continental Airlines",
  "018": "Canadian Airlines",
  "027": "Austrian Cargo",
  "043": "Avianca Cargo",
  "064": "China Airlines Cargo",
  "071": "Ethiopian Cargo",
  "072": "Gulf Air Cargo",
  "076": "MEA Cargo",
  "079": "Saudia Cargo",
  "081": "Qantas Freight",
  "085": "SAS Cargo",
  "086": "China Southern Cargo",
  "098": "Air Algérie Cargo",
  "105": "Air India Cargo",
  "106": "China Eastern Cargo",
  "114": "Aeroflot Cargo",
  "117": "EVA Air Cargo",
  "126": "Philippine Airlines Cargo",
  "131": "ANA Cargo",
  "134": "Garuda Cargo",
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
  "245": "Egyptair Cargo",
  "257": "Royal Jordanian Cargo",
  "258": "Singapore Airlines Cargo",
  "260": "Malaysia Airlines Cargo",
  "279": "Olympic Cargo",
  "286": "Vietnam Airlines Cargo",
  "297": "All Nippon Airways",
  "301": "El Al Cargo",
  "312": "Cubana Cargo",
  "412": "Xiamen Airlines Cargo",
  "475": "UPS Airlines",
  "489": "Kalitta Air",
  "497": "Martinair Cargo",
  "580": "Gol Cargo",
  "601": "GOL Cargo",
  "607": "Avianca Brasil Cargo",
  "618": "Cargolux Italia",
  "623": "AeroLogic",
  "652": "CargoJet",
  "695": "Silk Way Airlines",
  "700": "Ethiopian Cargo",
  "706": "Wamos Air Cargo",
  "714": "Air Cargo Global",
  "720": "Sichuan Airlines Cargo",
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
  "876": "Atlas Air",
  "880": "Ukraine International",
  "886": "Cargolux Italia",
  "902": "Aerologic",
  "905": "CargoAir",
  "932": "Volga-Dnepr",
  "960": "Sky Lease Cargo",
  "988": "Silkway West",
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

    // Query para encontrar o timestamp da última atualização
    const lastUpdateQuery = `
      SELECT MAX(data_insert) as last_update
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
    `;

    const lastUpdateResult = await client.query(lastUpdateQuery);
    const lastUpdate = lastUpdateResult[0]?.last_update || null;
    console.log("Last update:", lastUpdate);

    // Query para contar apenas os registros da última atualização
    const statsQuery = `
      SELECT COUNT(*) as total_records
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND data_insert = ?
    `;

    const statsResult = await client.query(statsQuery, [lastUpdate]);
    console.log("Stats result:", statsResult);

    // Query para distribuição por companhia aérea apenas da última atualização
    const breakdownQuery = `
      SELECT 
        LEFT(mawb, 3) as airline_code, 
        COUNT(*) as count
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND mawb IS NOT NULL 
        AND mawb != ''
        AND data_insert = ?
      GROUP BY LEFT(mawb, 3)
      ORDER BY count DESC
    `;

    const breakdownResult = await client.query(breakdownQuery, [lastUpdate]);
    console.log("Breakdown result:", breakdownResult);

    // Processar resultados
    const totalRecords = Number(statsResult[0]?.total_records || 0);

    // Mapear breakdown com nomes de companhias
    const unmappedCodes: string[] = [];
    const airlineBreakdown = breakdownResult.map((row: any) => {
      const code = row.airline_code || "???";
      const name = airlineNames[code];
      
      if (!name && code !== "???" && code.trim() !== "") {
        unmappedCodes.push(code);
      }
      
      return {
        code,
        name: name || code, // Usa o código IATA como fallback
        count: Number(row.count || 0),
      };
    });
    
    // Log de códigos não mapeados para facilitar identificação futura
    if (unmappedCodes.length > 0) {
      console.log(`Códigos IATA não mapeados encontrados: ${unmappedCodes.join(", ")}`);
    }

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
