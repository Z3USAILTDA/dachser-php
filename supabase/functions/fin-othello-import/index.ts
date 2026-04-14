import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let client: Client | null = null;
  try {
    const { arquivo_origem, nacional, interacional, base_totvs } = await req.json();

    if (!arquivo_origem || !nacional || !interacional || !base_totvs) {
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

      // Insert Base Totvs RM
      let insertedTotvs = 0;
      for (const row of base_totvs) {
        await client.execute(
          `INSERT INTO dados_dachser.t_base_totvs_rm (
            arquivo_origem, aba_origem, linha_excel, processo, faturado_em, filial, modal, cliente,
            valor_total_faturado, faturado_no_othello_por_base_original, faturado_no_rm_por_base_original,
            faturado_no_othello_por, faturado_no_rm_por, regiao, divisao_por_modal, othello_rm,
            ana_mazzo, ana_mazzo_participacao,
            integrador_othello_rm, integrador_othello_rm_participacao,
            loreno_santos, loreno_santos_participacao,
            mariana_melo, mariana_melo_participacao,
            marina_marques, marina_marques_participacao,
            vitoria_santos, vitoria_santos_participacao,
            simone_santos, simone_santos_participacao,
            gil_luan, gil_luan_participacao,
            juliana_pansonato, juliana_pansonato_participacao,
            igor_ferreira, igor_ferreira_participacao,
            reinaldo_fascina, reinaldo_fascina_participacao,
            thays_prado, thays_prado_participacao,
            carlos_almeida, carlos_almeida_participacao
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            row.arquivo_origem, row.aba_origem, row.linha_excel, row.processo, row.faturado_em,
            row.filial, row.modal, row.cliente, row.valor_total_faturado,
            row.faturado_no_othello_por_base_original, row.faturado_no_rm_por_base_original,
            row.faturado_no_othello_por, row.faturado_no_rm_por, row.regiao, row.divisao_por_modal, row.othello_rm,
            row.ana_mazzo, row.ana_mazzo_participacao,
            row.integrador_othello_rm, row.integrador_othello_rm_participacao,
            row.loreno_santos, row.loreno_santos_participacao,
            row.mariana_melo, row.mariana_melo_participacao,
            row.marina_marques, row.marina_marques_participacao,
            row.vitoria_santos, row.vitoria_santos_participacao,
            row.simone_santos, row.simone_santos_participacao,
            row.gil_luan, row.gil_luan_participacao,
            row.juliana_pansonato, row.juliana_pansonato_participacao,
            row.igor_ferreira, row.igor_ferreira_participacao,
            row.reinaldo_fascina, row.reinaldo_fascina_participacao,
            row.thays_prado, row.thays_prado_participacao,
            row.carlos_almeida, row.carlos_almeida_participacao,
          ]
        );
        insertedTotvs++;
      }

      // Insert Othello Nacional
      let insertedNacional = 0;
      for (const row of nacional) {
        await client.execute(
          `INSERT INTO dados_dachser.t_othello_nacional_rls (
            arquivo_origem, aba_origem, linha_excel, id_ref_object, settlement_id, branch, object_type,
            service_date, cost_center_iv, deb_cred_no, deb_cred_name, settlement_type,
            status_settl, status_interpreter, flag, revenue, revenue_transit, total_revenue,
            faturado_em, comentarios
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            row.arquivo_origem, row.aba_origem, row.linha_excel, row.id_ref_object, row.settlement_id,
            row.branch, row.object_type, row.service_date, row.cost_center_iv, row.deb_cred_no,
            row.deb_cred_name, row.settlement_type, row.status_settl, row.status_interpreter,
            row.flag, row.revenue, row.revenue_transit, row.total_revenue,
            row.faturado_em, row.comentarios,
          ]
        );
        insertedNacional++;
      }

      // Insert Othello Interacional
      let insertedInteracional = 0;
      for (const row of interacional) {
        await client.execute(
          `INSERT INTO dados_dachser.t_othello_interacional_rls (
            arquivo_origem, aba_origem, linha_excel, id_ref_object, branch, service_date,
            cost_center_iv, deb_cred_name, flag, revenue, comentarios
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            row.arquivo_origem, row.aba_origem, row.linha_excel, row.id_ref_object, row.branch,
            row.service_date, row.cost_center_iv, row.deb_cred_name, row.flag,
            row.revenue, row.comentarios,
          ]
        );
        insertedInteracional++;
      }

      await client.execute("COMMIT");

      return new Response(
        JSON.stringify({
          success: true,
          counts: {
            base_totvs: insertedTotvs,
            nacional: insertedNacional,
            interacional: insertedInteracional,
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
