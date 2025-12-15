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
  IdMovRM: number;
  IdLanRM: number;
  fornecedor: string;
  beneficiario: string;
  vencimento: string;
  forma_pagamento: string;
  valor: number | null;
  data_baixa: string | null;
  status_lan: number | null;
  cnpj_fornecedor: string | null;
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

// Map RM payment methods to form values
const mapFormaPagamento = (rmValue: string | null): string => {
  if (!rmValue) return "TRANSFERENCIA_PIX";
  const upper = rmValue.toUpperCase();
  if (upper.includes("PIX")) return "TRANSFERENCIA_PIX";
  if (upper.includes("BOLETO")) return "BOLETO";
  if (upper.includes("TED") || upper.includes("DOC") || upper.includes("TRANSF")) return "TRANSFERENCIA_PIX";
  if (upper.includes("DEBITO")) return "DEBITO_CONTA";
  return "TRANSFERENCIA_PIX";
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
        
        // Buscar dados do voucher em t_spovoucher JOIN t_baixas
        const result = await mariaClient.query(
          `SELECT 
            v.IdMovRM,
            v.IdLanRM,
            v.DataVencimento AS vencimento,
            v.NomeDaCobranca AS fornecedor,
            v.NomeDoBeneficiario AS beneficiario,
            v.FormaDePagamento AS forma_pagamento,
            b.ValorBaixado AS valor,
            b.DataDaBaixa AS data_baixa,
            b.StatusLan AS status_lan
          FROM dados_dachser.t_spovoucher v
          LEFT JOIN dados_dachser.t_baixas b ON v.IdLanRM = b.IdLancamentoRM
          WHERE v.IdLanRM = ? OR v.IdMovRM = ?
          LIMIT 1`,
          [numeroVoucherRM, numeroVoucherRM]
        );

        if (!result || result.length === 0) {
          await mariaClient.close();
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

        const rmData = result[0] as any;
        console.log("[voucher-integrate-rm] Dados encontrados:", rmData);

        // Check if already has baixa with StatusLan = 1
        if (rmData.status_lan === 1) {
          await mariaClient.close();
          return new Response(
            JSON.stringify({
              success: false,
              error: `Este voucher já possui baixa registrada (StatusLan = 1)`,
              alreadyProcessed: true,
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        // Buscar CNPJ via t_dados_financeiro_nfs (comparando razao_social com fornecedor)
        let cnpjFornecedor: string | null = null;
        if (rmData.fornecedor) {
          const cnpjResult = await mariaClient.query(
            `SELECT cnpj, razao_social
             FROM dados_dachser.t_dados_financeiro_nfs
             WHERE TRIM(razao_social) = TRIM(?)
             LIMIT 1`,
            [rmData.fornecedor]
          );
          
          if (cnpjResult && cnpjResult.length > 0) {
            cnpjFornecedor = (cnpjResult[0] as any).cnpj;
            console.log("[voucher-integrate-rm] CNPJ encontrado:", cnpjFornecedor);
          } else {
            console.log("[voucher-integrate-rm] CNPJ não encontrado para fornecedor:", rmData.fornecedor);
          }
        }

        await mariaClient.close();

        // Format vencimento date
        let vencimentoFormatted: string | null = null;
        if (rmData.vencimento) {
          const d = new Date(rmData.vencimento);
          vencimentoFormatted = d.toISOString().split('T')[0];
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              idMovRM: rmData.IdMovRM,
              idLanRM: rmData.IdLanRM,
              fornecedor: rmData.fornecedor || "",
              beneficiario: rmData.beneficiario || "",
              vencimento: vencimentoFormatted,
              formaPagamento: mapFormaPagamento(rmData.forma_pagamento),
              formaPagamentoOriginal: rmData.forma_pagamento,
              valor: rmData.valor,
              dataBaixa: rmData.data_baixa,
              statusLan: rmData.status_lan,
              cnpjFornecedor: cnpjFornecedor,
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
        
        // Buscar IdLanRM do voucher no RM pelo numero_spo
        const rmLookup = await mariaClient.query(
          `SELECT IdLanRM FROM dados_dachser.t_spovoucher 
           WHERE IdLanRM = ? OR IdMovRM = ?
           LIMIT 1`,
          [voucher.numero_spo, voucher.numero_spo]
        );

        if (!rmLookup || rmLookup.length === 0) {
          await mariaClient.close();
          throw new Error(`Voucher RM ${voucher.numero_spo} não encontrado para integração`);
        }

        const idLanRM = (rmLookup[0] as any).IdLanRM;
        const idBaixa = Date.now(); // Generate unique IdBaixa

        // Registrar baixa no MariaDB t_baixas
        await mariaClient.execute(
          `INSERT INTO dados_dachser.t_baixas (
            IdLancamentoRM, 
            IdBaixa,
            ValorBaixado, 
            DataDaBaixa, 
            UsuarioBaixa,
            StatusLan
          ) VALUES (?, ?, ?, NOW(), ?, 1)`,
          [
            idLanRM,
            idBaixa,
            voucher.valor,
            "SISTEMA_LOVABLE",
          ]
        );

        await mariaClient.close();

        const rmProtocol = `RM-${idBaixa}`;
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
