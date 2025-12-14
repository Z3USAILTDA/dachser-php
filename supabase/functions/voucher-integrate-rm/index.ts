import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface IntegrateRMRequest {
  voucherId?: string;
  numeroVoucherRM?: string;
  action: "fetch" | "integrate";
}

interface RMVoucherData {
  fornecedor: string;
  cnpj_fornecedor: string;
  valor: number;
  vencimento: string;
  tipo_documento: string;
  data_emissao: string;
  moeda: string;
  centro_custo?: string;
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { voucherId, numeroVoucherRM, action }: IntegrateRMRequest = await req.json();

    console.log(`[voucher-integrate-rm] Action: ${action}, VoucherID: ${voucherId}, RM Number: ${numeroVoucherRM}`);

    // ACTION: FETCH - Buscar dados do voucher no RM/MariaDB
    if (action === "fetch" && numeroVoucherRM) {
      console.log(`[voucher-integrate-rm] Buscando dados do voucher RM: ${numeroVoucherRM}`);
      
      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();
        
        // Buscar dados do voucher no MariaDB (tabela de vouchers do RM)
        const result = await mariaClient.query(
          `SELECT 
            fornecedor,
            cnpj_fornecedor,
            valor,
            vencimento,
            tipo_documento,
            data_emissao,
            moeda,
            centro_custo
          FROM t_rm_vouchers 
          WHERE numero_voucher = ?`,
          [numeroVoucherRM]
        );

        await mariaClient.close();

        if (!result || result.length === 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Voucher RM ${numeroVoucherRM} não encontrado`,
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        const rmData = result[0] as RMVoucherData;
        console.log("[voucher-integrate-rm] Dados encontrados:", rmData);

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              fornecedor: rmData.fornecedor,
              cnpjFornecedor: rmData.cnpj_fornecedor,
              valor: rmData.valor,
              vencimento: rmData.vencimento,
              tipoDocumento: rmData.tipo_documento,
              dataEmissao: rmData.data_emissao,
              moeda: rmData.moeda || "BRL",
              centroCusto: rmData.centro_custo,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } catch (dbError: any) {
        console.error("[voucher-integrate-rm] Erro MariaDB:", dbError);
        if (mariaClient) await mariaClient.close();
        throw new Error(`Erro ao conectar MariaDB: ${dbError.message}`);
      }
    }

    // ACTION: INTEGRATE - Integrar voucher ao RM após comprovante
    if (action === "integrate" && voucherId) {
      console.log(`[voucher-integrate-rm] Integrando voucher ${voucherId} ao RM`);

      // Buscar dados do voucher
      const { data: voucher, error: voucherError } = await supabase
        .from("vouchers")
        .select("*, voucher_anexos(*)")
        .eq("id", voucherId)
        .single();

      if (voucherError) throw voucherError;
      if (!voucher) throw new Error("Voucher não encontrado");

      // Validar que o voucher está em etapa ROBO
      if (voucher.etapa_atual !== "ROBO") {
        throw new Error("Voucher não está na etapa ROBO");
      }

      // Validar que tem comprovante anexado
      const hasComprovante = voucher.voucher_anexos?.some(
        (a: any) => a.tipo === "COMPROVANTE"
      );

      if (!hasComprovante) {
        throw new Error("Voucher não possui comprovante anexado. Anexe o comprovante antes de integrar.");
      }

      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();
        
        // Registrar baixa no MariaDB
        const rmProtocol = `RM${Date.now()}`;
        
        await mariaClient.execute(
          `INSERT INTO t_rm_baixas (
            voucher_id, 
            numero_spo, 
            protocolo_rm, 
            data_baixa, 
            valor, 
            forma_pagamento
          ) VALUES (?, ?, ?, NOW(), ?, ?)`,
          [
            voucherId,
            voucher.numero_spo,
            rmProtocol,
            voucher.valor,
            voucher.forma_pagamento,
          ]
        );

        await mariaClient.close();

        console.log(`[voucher-integrate-rm] Baixa registrada no MariaDB. Protocolo: ${rmProtocol}`);

        // Atualizar voucher para CONCLUIDO e status BAIXADO_RM
        const { error: updateError } = await supabase
          .from("vouchers")
          .update({
            etapa_atual: "CONCLUIDO",
            status_baixa: "BAIXADO_RM",
            updated_at: new Date().toISOString(),
          })
          .eq("id", voucherId);

        if (updateError) throw updateError;

        // Criar log de integração
        const authHeader = req.headers.get("Authorization");
        let userId = null;
        
        if (authHeader) {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user } } = await supabase.auth.getUser(token);
          userId = user?.id;
        }

        await supabase.from("voucher_logs").insert({
          voucher_id: voucherId,
          user_id: userId,
          acao: "BAIXADO",
          detalhe: `Integração RM concluída. Protocolo: ${rmProtocol}`,
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Voucher integrado ao RM com sucesso",
            rm_protocol: rmProtocol,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } catch (dbError: any) {
        console.error("[voucher-integrate-rm] Erro MariaDB na integração:", dbError);
        if (mariaClient) await mariaClient.close();
        throw new Error(`Erro ao registrar baixa no RM: ${dbError.message}`);
      }
    }

    throw new Error("Ação inválida ou parâmetros faltando");
  } catch (error: any) {
    console.error("[voucher-integrate-rm] Erro:", error);
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
