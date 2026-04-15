import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

async function batchInsert(client: Client, table: string, columns: string[], rows: any[][], nullifCols?: Set<number>) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => {
      const ph = columns.map((_, ci) => nullifCols?.has(ci) ? "NULLIF(?,''" + ")" : "?");
      return `(${ph.join(",")})`;
    }).join(",");
    const params = batch.flat();
    await client.execute(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`,
      params
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let client: Client | null = null;
  try {
    const { arquivo_origem, nacional, interacional, base_totvs, nacional_nao_rls, internacional_nao_rls } = await req.json();

    if (!arquivo_origem || !nacional || !interacional || !base_totvs || !nacional_nao_rls || !internacional_nao_rls) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    client = await new Client().connect({
      hostname: Deno.env.get("MARIADB_HOST")!,
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER")!,
      password: Deno.env.get("MARIADB_PASSWORD")!,
      db: Deno.env.get("MARIADB_DATABASE")!,
    });

    await client.execute("START TRANSACTION");

    try {
      await client.execute("DELETE FROM dados_dachser.t_othello_nacional_rls");
      await client.execute("DELETE FROM dados_dachser.t_othello_interacional_rls");
      await client.execute("DELETE FROM dados_dachser.t_base_totvs_rm");
      await client.execute("DELETE FROM dados_dachser.t_othello_nacional_nao_rls");
      await client.execute("DELETE FROM dados_dachser.t_othello_internacional_nao_rls");

      // ===== Base Totvs RM =====
      const totvsColumns = [
        "arquivo_origem","aba_origem","linha_excel","processo","faturado_em","filial","modal","cliente",
        "valor_total_faturado","faturado_no_othello_por_base_original","faturado_no_rm_por_base_original",
        "faturado_no_othello_por","faturado_no_rm_por","regiao","divisao_por_modal","othello_rm",
        "ana_mazzo","ana_mazzo_participacao",
        "integrador_othello_rm","integrador_othello_rm_participacao",
        "loreno_santos","loreno_santos_participacao",
        "mariana_melo","mariana_melo_participacao",
        "marina_marques","marina_marques_participacao",
        "vitoria_santos","vitoria_santos_participacao",
        "simone_santos","simone_santos_participacao",
        "gil_luan","gil_luan_participacao",
        "juliana_pansonato","juliana_pansonato_participacao",
        "igor_ferreira","igor_ferreira_participacao",
        "reinaldo_fascina","reinaldo_fascina_participacao",
        "thays_prado","thays_prado_participacao",
        "carlos_almeida","carlos_almeida_participacao"
      ];
      const totvsRows = base_totvs.map((r: any) => [
        r.arquivo_origem, r.aba_origem, r.linha_excel, r.processo, r.faturado_em,
        r.filial, r.modal, r.cliente, r.valor_total_faturado,
        r.faturado_no_othello_por_base_original, r.faturado_no_rm_por_base_original,
        r.faturado_no_othello_por, r.faturado_no_rm_por, r.regiao, r.divisao_por_modal, r.othello_rm,
        r.ana_mazzo, r.ana_mazzo_participacao,
        r.integrador_othello_rm, r.integrador_othello_rm_participacao,
        r.loreno_santos, r.loreno_santos_participacao,
        r.mariana_melo, r.mariana_melo_participacao,
        r.marina_marques, r.marina_marques_participacao,
        r.vitoria_santos, r.vitoria_santos_participacao,
        r.simone_santos, r.simone_santos_participacao,
        r.gil_luan, r.gil_luan_participacao,
        r.juliana_pansonato, r.juliana_pansonato_participacao,
        r.igor_ferreira, r.igor_ferreira_participacao,
        r.reinaldo_fascina, r.reinaldo_fascina_participacao,
        r.thays_prado, r.thays_prado_participacao,
        r.carlos_almeida, r.carlos_almeida_participacao,
      ]);
      await batchInsert(client, "dados_dachser.t_base_totvs_rm", totvsColumns, totvsRows);

      // ===== Othello Nacional RLS =====
      const nacColumns = [
        "arquivo_origem","aba_origem","linha_excel","id_ref_object","settlement_id","branch","object_type",
        "service_date","cost_center_iv","deb_cred_no","deb_cred_name","settlement_type",
        "status_settl","status_interpreter","flag","revenue","revenue_transit","total_revenue",
        "faturado_em","comentarios"
      ];
      const nacRows = nacional.map((r: any) => [
        r.arquivo_origem, r.aba_origem, r.linha_excel, r.id_ref_object, r.settlement_id,
        r.branch, r.object_type, r.service_date, r.cost_center_iv, r.deb_cred_no,
        r.deb_cred_name, r.settlement_type, r.status_settl, r.status_interpreter,
        r.flag, r.revenue, r.revenue_transit, r.total_revenue,
        r.faturado_em, r.comentarios,
      ]);
      await batchInsert(client, "dados_dachser.t_othello_nacional_rls", nacColumns, nacRows);

      // ===== Othello Interacional RLS =====
      const intColumns = [
        "arquivo_origem","aba_origem","linha_excel","id_ref_object","branch","service_date",
        "cost_center_iv","deb_cred_name","flag","revenue","comentarios"
      ];
      const intRows = interacional.map((r: any) => [
        r.arquivo_origem, r.aba_origem, r.linha_excel, r.id_ref_object, r.branch,
        r.service_date, r.cost_center_iv, r.deb_cred_name, r.flag,
        r.revenue, r.comentarios,
      ]);
      await batchInsert(client, "dados_dachser.t_othello_interacional_rls", intColumns, intRows);

      // ===== Othello Nacional-Não RLS =====
      // For this table we need NULLIF on etd/atd/eta/ata columns and NOW() for importado_em
      // We'll handle importado_em and NULLIF via raw SQL per batch
      const insertedNacionalNaoRls = nacional_nao_rls.length;
      for (let i = 0; i < nacional_nao_rls.length; i += BATCH_SIZE) {
        const batch = nacional_nao_rls.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() =>
          "(?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?)"
        ).join(",");
        const params = batch.flatMap((r: any) => [
          r.arquivo_origem, r.aba_origem, r.linha_excel,
          r.id_ref_object, r.settlement_id, r.branch, r.object_type, r.service_date,
          r.cost_center_iv, r.deb_cred_no, r.deb_cred_name, r.settlement_type,
          r.status_settl, r.status_interpreter, r.flag, r.revenue, r.revenue_transit, r.total_revenue,
          r.etd || '', r.atd || '', r.eta || '', r.ata || '', r.comentarios,
        ]);
        await client.execute(
          `INSERT INTO dados_dachser.t_othello_nacional_nao_rls (
            arquivo_origem, aba_origem, linha_excel, importado_em,
            id_ref_object, settlement_id, branch, object_type, service_date,
            cost_center_iv, deb_cred_no, deb_cred_name, settlement_type,
            status_settl, status_interpreter, flag, revenue, revenue_transit, total_revenue,
            etd, atd, eta, ata, comentarios
          ) VALUES ${placeholders}`,
          params
        );
      }

      // ===== Othello Internacional-Não RLS =====
      const insertedInternacionalNaoRls = internacional_nao_rls.length;
      for (let i = 0; i < internacional_nao_rls.length; i += BATCH_SIZE) {
        const batch = internacional_nao_rls.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() =>
          "(?,?,?,NOW(),?,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?)"
        ).join(",");
        const params = batch.flatMap((r: any) => [
          r.arquivo_origem, r.aba_origem, r.linha_excel,
          r.id_ref_object, r.branch, r.service_date, r.cost_center_iv, r.deb_cred_name,
          r.status_settl, r.flag, r.revenue,
          r.etd || '', r.atd || '', r.eta || '', r.ata || '', r.comentarios,
        ]);
        await client.execute(
          `INSERT INTO dados_dachser.t_othello_internacional_nao_rls (
            arquivo_origem, aba_origem, linha_excel, importado_em,
            id_ref_object, branch, service_date, cost_center_iv, deb_cred_name,
            status_settl, flag, revenue,
            etd, atd, eta, ata, comentarios
          ) VALUES ${placeholders}`,
          params
        );
      }

      await client.execute("COMMIT");

      return new Response(
        JSON.stringify({
          success: true,
          counts: {
            base_totvs: base_totvs.length,
            nacional: nacional.length,
            interacional: interacional.length,
            nacional_nao_rls: insertedNacionalNaoRls,
            internacional_nao_rls: insertedInternacionalNaoRls,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      await client.execute("ROLLBACK");
      throw err;
    }
  } catch (error) {
    console.error("Erro na importação:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno na importação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
});
