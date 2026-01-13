import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getMariaDBClient() {
  return await new Client().connect({
    hostname: Deno.env.get("MARIADB_HOST") || "",
    username: Deno.env.get("MARIADB_USER") || "",
    password: Deno.env.get("MARIADB_PASSWORD") || "",
    db: Deno.env.get("MARIADB_DATABASE") || "",
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    console.log("Connecting to MariaDB...");
    client = await getMariaDBClient();
    console.log("Connected to MariaDB");

    // Query para encontrar o timestamp da última atualização (excluindo ADM)
    const lastUpdateQuery = `
      SELECT MAX(data_insert) as last_update
      FROM t_dados_financeiro_voucher
      WHERE modal IS NULL OR modal <> 'ADM'
    `;

    const lastUpdateResult = await client.query(lastUpdateQuery);
    const lastUpdate = lastUpdateResult[0]?.last_update || null;
    console.log("Last update t_dados_financeiro_voucher:", lastUpdate);

    // Query para contar total de registros e soma de valores (excluindo ADM)
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COALESCE(SUM(valor_nf), 0) as total_valor
      FROM t_dados_financeiro_voucher
      WHERE modal IS NULL OR modal <> 'ADM'
    `;

    const statsResult = await client.query(statsQuery);
    console.log("Stats result:", statsResult);

    // Query para breakdown por etapa_atual - buscar da t_vouchers (esteira)
    const etapaQuery = `
      SELECT 
        COALESCE(etapa_atual, 'OPERACAO') as etapa,
        COUNT(*) as count
      FROM t_vouchers
      GROUP BY etapa_atual
      ORDER BY count DESC
    `;

    const etapaResult = await client.query(etapaQuery);
    console.log("Etapa breakdown:", etapaResult);

    const etapaLabels: Record<string, string> = {
      RASCUNHO: "Rascunho",
      OPERACAO: "Operação",
      FISCAL: "Fiscal",
      SUPERVISOR: "Supervisor",
      FINANCEIRO: "Financeiro",
      ROBO: "Robô",
      CONCLUIDO: "Concluído",
      CANCELADO: "Cancelado",
      A_PROCESSAR: "A Processar",
    };

    const etapaBreakdown = etapaResult.map((row: any) => ({
      etapa: row.etapa || "OPERACAO",
      label: etapaLabels[row.etapa] || row.etapa || "Operação",
      count: Number(row.count) || 0,
    }));

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          lastUpdate,
          totalVouchers: Number(statsResult[0]?.total_records) || 0,
          totalValor: Number(statsResult[0]?.total_valor) || 0,
          etapaBreakdown,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching fin voucher stats:", errorMessage);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.error("Error closing client:", e);
      }
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
