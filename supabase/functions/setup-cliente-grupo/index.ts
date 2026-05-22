// Setup one-shot: cria dados_dachser.t_fin_cliente_grupo e importa o CSV de-para
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeRaz(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
function normalizeGrupo(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const client = await new Client().connect({
    hostname: Deno.env.get("MARIADB_FIN_HOST")!,
    port: parseInt(Deno.env.get("MARIADB_FIN_PORT") || "3306"),
    username: Deno.env.get("MARIADB_FIN_USER")!,
    password: Deno.env.get("MARIADB_FIN_PASSWORD")!,
    db: Deno.env.get("MARIADB_FIN_DATABASE")!,
    charset: "utf8mb4",
    timeout: 60000,
  });

  try {
    // 1) Cria tabela
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_cliente_grupo (
        razao_social VARCHAR(255) NOT NULL,
        grupo VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (razao_social),
        KEY idx_grupo (grupo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2) Lê CSV bundleado
    const csvUrl = new URL("./depara.csv", import.meta.url);
    const text = await Deno.readTextFile(csvUrl);
    const lines = text.split(/\r?\n/);

    // Header: "RAZAO SOCIAL;Nome para Indicador"
    const rows: Array<[string, string]> = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const parts = line.split(";");
      if (parts.length < 2) continue;
      const raz = normalizeRaz(parts[0] || "");
      const grupo = normalizeGrupo(parts.slice(1).join(";"));
      if (!raz || !grupo) continue;
      rows.push([raz, grupo]);
    }

    // Dedupe (último vence)
    const dedup = new Map<string, string>();
    for (const [r, g] of rows) dedup.set(r, g);
    const finalRows = Array.from(dedup.entries());

    // 3) Bulk upsert em lotes
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < finalRows.length; i += BATCH) {
      const chunk = finalRows.slice(i, i + BATCH);
      const placeholders = chunk.map(() => "(?,?)").join(",");
      const params: string[] = [];
      for (const [r, g] of chunk) {
        params.push(r, g);
      }
      await client.execute(
        `INSERT INTO dados_dachser.t_fin_cliente_grupo (razao_social, grupo)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE grupo = VALUES(grupo)`,
        params,
      );
      inserted += chunk.length;
    }

    const count = await client.query(
      `SELECT COUNT(*) AS total FROM dados_dachser.t_fin_cliente_grupo`,
    );

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        rows_in_csv: rows.length,
        unique_keys: finalRows.length,
        upserts_executed: inserted,
        total_in_table: Number(count?.[0]?.total || 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("setup-cliente-grupo error:", err);
    try { await client.close(); } catch {}
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
