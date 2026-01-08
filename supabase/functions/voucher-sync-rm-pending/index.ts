import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RMVoucherData {
  nome_beneficiario: string;
  cnpj: string;
  valor_nf: number;
  data_vencimento: string;
  numero_nf: string;
  data_emissao: string;
  moeda: string;
  forma_pag: string;
}

const getMariaDBClient = async (): Promise<Client> => {
  const client = await new Client().connect({
    hostname: Deno.env.get("MARIADB_HOST")!,
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    username: Deno.env.get("MARIADB_USER")!,
    password: Deno.env.get("MARIADB_PASSWORD")!,
    db: Deno.env.get("MARIADB_DATABASE")!,
  });
  return client;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[sync-rm-pending] Iniciando sincronização de vouchers pendentes");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar vouchers com status_baixa = PENDENTE
    const { data: pendingVouchers, error: fetchError } = await supabase
      .from("vouchers")
      .select("id, numero_spo")
      .eq("status_baixa", "PENDENTE")
      .not("numero_spo", "is", null);

    if (fetchError) {
      console.error("[sync-rm-pending] Erro ao buscar vouchers:", fetchError);
      throw fetchError;
    }

    if (!pendingVouchers || pendingVouchers.length === 0) {
      console.log("[sync-rm-pending] Nenhum voucher pendente encontrado");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum voucher pendente para sincronizar",
          synced: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`[sync-rm-pending] Encontrados ${pendingVouchers.length} vouchers pendentes`);

    let mariaClient: Client | null = null;
    let syncedCount = 0;
    const results: { id: string; status: string; message: string }[] = [];

    try {
      mariaClient = await getMariaDBClient();

      for (const voucher of pendingVouchers) {
        try {
          console.log(`[sync-rm-pending] Tentando sincronizar voucher ${voucher.id} (SPO: ${voucher.numero_spo})`);

          // Buscar dados no MariaDB (tabela de vouchers do RM)
          const result = await mariaClient.query(
            `SELECT 
              nome_beneficiario,
              cnpj,
              valor_nf,
              data_vencimento,
              numero_nf,
              data_emissao,
              moeda,
              forma_pag
            FROM t_dados_financeiro_voucher 
            WHERE documento = ?`,
            [voucher.numero_spo]
          );

          if (!result || result.length === 0) {
            console.log(`[sync-rm-pending] Voucher SPO ${voucher.numero_spo} ainda não disponível no RM`);
            results.push({
              id: voucher.id,
              status: "pending",
              message: "Dados do RM ainda não disponíveis",
            });
            continue;
          }

          const rmData = result[0] as RMVoucherData;
          console.log(`[sync-rm-pending] Dados encontrados para ${voucher.numero_spo}:`, rmData);

          // Atualizar voucher com dados do RM
          const { error: updateError } = await supabase
            .from("vouchers")
            .update({
              fornecedor: rmData.nome_beneficiario,
              cnpj_fornecedor: rmData.cnpj,
              valor: rmData.valor_nf,
              vencimento: rmData.data_vencimento,
              tipo_documento: rmData.numero_nf,
              data_emissao_documento: rmData.data_emissao,
              moeda: rmData.moeda || "BRL",
              forma_pagamento: rmData.forma_pag || "BOLETO",
              status_baixa: "SINCRONIZADO",
              updated_at: new Date().toISOString(),
            })
            .eq("id", voucher.id);

          if (updateError) {
            console.error(`[sync-rm-pending] Erro ao atualizar voucher ${voucher.id}:`, updateError);
            results.push({
              id: voucher.id,
              status: "error",
              message: updateError.message,
            });
            continue;
          }

          syncedCount++;
          results.push({
            id: voucher.id,
            status: "synced",
            message: "Dados sincronizados com sucesso",
          });
          console.log(`[sync-rm-pending] Voucher ${voucher.id} sincronizado com sucesso`);

        } catch (voucherError: any) {
          console.error(`[sync-rm-pending] Erro ao processar voucher ${voucher.id}:`, voucherError);
          results.push({
            id: voucher.id,
            status: "error",
            message: voucherError.message,
          });
        }
      }

      await mariaClient.close();

    } catch (dbError: any) {
      console.error("[sync-rm-pending] Erro MariaDB:", dbError);
      if (mariaClient) await mariaClient.close();
      throw new Error(`Erro ao conectar MariaDB: ${dbError.message}`);
    }

    console.log(`[sync-rm-pending] Sincronização concluída: ${syncedCount}/${pendingVouchers.length} vouchers`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída`,
        total: pendingVouchers.length,
        synced: syncedCount,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("[sync-rm-pending] Erro geral:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
