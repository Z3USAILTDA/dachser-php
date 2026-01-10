import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de códigos SCAC para nomes de armadores marítimos
const shippingLineNames: Record<string, string> = {
  "HLCU": "Hapag-Lloyd",
  "MAEU": "Maersk",
  "MSCU": "MSC",
  "CMDU": "CMA CGM",
  "COSU": "COSCO",
  "EGLV": "Evergreen",
  "ONEY": "ONE (Ocean Network Express)",
  "YMLU": "Yang Ming",
  "HDMU": "Hyundai Merchant Marine",
  "OOLU": "OOCL",
  "ZIMU": "ZIM",
  "ANRM": "ANL",
  "APLU": "APL",
  "SUDU": "Hamburg Süd",
  "NYKU": "NYK Line",
  "MOLU": "MOL",
  "KKLU": "K Line",
  "SEAU": "SEALAND",
  "MEDU": "MEDITERRANEAN",
  "PCIU": "PIL",
  "WHLC": "WAN HAI",
  "TRHU": "Transroll",
  "SMLM": "SM Line",
  "ARKU": "Arkas",
  "BURU": "BURU",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    console.log("Iniciando busca de estatísticas SEA EXPORT do t_master_dados...");

    // Conectar ao MariaDB
    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST") || "",
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    });

    console.log("Conectado ao MariaDB");

    // Query para encontrar o timestamp da última atualização - apenas SEA EXPORT com ETD últimos 3 meses
    const lastUpdateQuery = `
      SELECT MAX(data_insert) as last_update
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo = 'SEA EXPORT'
        AND etd >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
    `;

    const lastUpdateResult = await client.query(lastUpdateQuery);
    const lastUpdate = lastUpdateResult[0]?.last_update || null;
    console.log("Last update SEA EXPORT (ETD últimos 3 meses):", lastUpdate);

    // Query para contar registros com ETD nos últimos 3 meses
    const statsQuery = `
      SELECT COUNT(*) as total_records
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo = 'SEA EXPORT'
        AND etd >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
    `;

    const statsResult = await client.query(statsQuery);
    console.log("Stats result:", statsResult);

    // Query para distribuição por armador (shipping line) com ETD últimos 3 meses
    // Extrair SCAC code do MBL (geralmente primeiros 4 caracteres)
    const breakdownQuery = `
      SELECT 
        UPPER(LEFT(mawb, 4)) as shipping_code, 
        COUNT(*) as count
      FROM t_master_dados
      WHERE active = 1 
        AND tipo_processo = 'SEA EXPORT'
        AND mawb IS NOT NULL 
        AND mawb != ''
        AND etd >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
      GROUP BY UPPER(LEFT(mawb, 4))
      ORDER BY count DESC
      LIMIT 15
    `;

    const breakdownResult = await client.query(breakdownQuery);
    console.log("Breakdown result:", breakdownResult);

    // Processar resultados
    const totalRecords = Number(statsResult[0]?.total_records || 0);

    // Mapear breakdown com nomes de armadores
    const unmappedCodes: string[] = [];
    const shippingLineBreakdown = breakdownResult.map((row: any) => {
      const code = row.shipping_code || "???";
      const name = shippingLineNames[code];
      
      if (!name && code !== "???" && code.trim() !== "") {
        unmappedCodes.push(code);
      }
      
      return {
        code,
        name: name || code,
        count: Number(row.count || 0),
      };
    });
    
    // Log de códigos não mapeados para facilitar identificação futura
    if (unmappedCodes.length > 0) {
      console.log(`Códigos SCAC não mapeados encontrados: ${unmappedCodes.join(", ")}`);
    }

    await client.close();

    console.log(`Estatísticas SEA EXPORT: ${totalRecords} MBLs, última atualização: ${lastUpdate}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          lastUpdate,
          totalRecords,
          shippingLineBreakdown,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Erro ao buscar estatísticas SEA EXPORT:", error);

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
