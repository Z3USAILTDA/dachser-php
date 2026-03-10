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
  action: "fetch" | "integrate" | "list" | "import";
  limit?: number;
}

interface RMVoucherData {
  idRM: string;
  numeroVoucher: string;
  numeroDocumento: string;
  fornecedor: string;
  filial: string;
  numeroNF: string;
  numeroProcesso: string;
  modal: string;
  tipoDocumento: string;
  formaPagamento: string;
  dataEmissao: string | null;
  vencimento: string | null;
  valor: number | null;
  moeda: string;
  cnpjFornecedor: string | null;
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
  if (!rmValue) return "BOLETO";
  const upper = rmValue.toUpperCase();
  if (upper.includes("BOL")) return "BOLETO";
  if (upper.includes("PIX")) return "TRANSFERENCIA_PIX";
  if (upper.includes("TED") || upper.includes("DOC") || upper.includes("TRANSF")) return "TRANSFERENCIA_PIX";
  if (upper.includes("DEBITO")) return "DEBITO_CONTA";
  if (upper.includes("DARF")) return "DARF";
  if (upper.includes("GPS")) return "GPS";
  return "BOLETO";
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { voucherId, numeroVoucherRM, action, limit = 50 }: IntegrateRMRequest = await req.json();

    console.log(`[voucher-integrate-rm] Action: ${action}, VoucherID: ${voucherId}, RM Number: ${numeroVoucherRM}, Limit: ${limit}`);

    // ACTION: IMPORT - Importar vouchers do MariaDB para Supabase
    if (action === "import") {
      console.log("[voucher-integrate-rm] Importando vouchers do RM para Supabase");
      
      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();
        
        // Primeiro, buscar todos os id_rm já existentes no Supabase
        const { data: existingVouchers, error: fetchError } = await supabase
          .from("vouchers")
          .select("numero_spo")
          .eq("origem_criacao", "RM_IMPORT");
        
        const existingNds = new Set(
          (existingVouchers || []).map((v: any) => v.numero_spo?.toString().trim())
        );
        console.log(`[voucher-integrate-rm] ${existingNds.size} vouchers já existem no Supabase`);
        
        // Buscar vouchers do MariaDB - sem limite para pegar todos
        // Ordenar por id_rm ASC para garantir ordem consistente
        const effectiveLimit = limit > 0 ? limit : 10000;
        const result = await mariaClient.query(
          `SELECT 
            id_rm,
            nd,
            documento,
            nome_beneficiario,
            nome_cobranca,
            numero_nf,
            numero_processo,
            modal,
            tipo_pag,
            forma_pag,
            data_emissao,
            data_vencimento,
            valor_nf,
            moeda,
            cnpj,
            razao_social
          FROM dados_dachser.t_dados_financeiro_voucher
          ORDER BY id_rm ASC
          LIMIT ?`,
          [effectiveLimit]
        );
        
        await mariaClient.close();
        
        if (!result || result.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Nenhum voucher encontrado para importar",
              imported: 0,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        console.log(`[voucher-integrate-rm] Encontrados ${result.length} vouchers no MariaDB`);

        let importedCount = 0;
        let skippedCount = 0;
        const errors: { nd: string; error: string }[] = [];
        const vouchersToInsert: any[] = [];

        for (const rmData of result as any[]) {
          try {
            const nd = rmData.nd?.toString().trim();
            const idRm = rmData.id_rm?.toString();
            
            if (!nd || !idRm) {
              skippedCount++;
              continue;
            }

            // Verificar se já existe usando nd como chave
            if (existingNds.has(nd)) {
              skippedCount++;
              continue;
            }

            // Format dates
            let vencimentoFormatted = new Date().toISOString().split('T')[0];
            if (rmData.data_vencimento) {
              const d = new Date(rmData.data_vencimento);
              if (!isNaN(d.getTime())) {
                vencimentoFormatted = d.toISOString().split('T')[0];
              }
            }

            let dataEmissaoFormatted: string | null = null;
            if (rmData.data_emissao) {
              const d = new Date(rmData.data_emissao);
              if (!isNaN(d.getTime())) {
                dataEmissaoFormatted = d.toISOString().split('T')[0];
              }
            }

            // Mapear cobranca_em_nome_de a partir do modal
            const modal = (rmData.modal || "").toUpperCase();
            let cobrancaEmNomeDe = "DACHSER";
            if (modal === "AI" || modal === "AIR") cobrancaEmNomeDe = "AIR";
            else if (modal === "SE" || modal === "SEA" || modal === "SI") cobrancaEmNomeDe = "SEA";
            else if (modal === "CHB") cobrancaEmNomeDe = "CHB";
            else if (modal === "DIM" || modal === "DEX") cobrancaEmNomeDe = "DACHSER";

            vouchersToInsert.push({
              numero_spo: nd,
              fornecedor: rmData.nome_beneficiario || rmData.razao_social || null,
              cnpj_fornecedor: rmData.cnpj || null,
              valor: rmData.valor_nf ? parseFloat(rmData.valor_nf) : null,
              vencimento: vencimentoFormatted,
              tipo_documento: rmData.tipo_pag || null,
              data_emissao_documento: dataEmissaoFormatted,
              moeda: rmData.moeda || "BRL",
              forma_pagamento: mapFormaPagamento(rmData.forma_pag),
              cobranca_em_nome_de: cobrancaEmNomeDe,
              filial: rmData.nome_cobranca || null,
              remessa: rmData.numero_processo || null,
              etapa_atual: "A_PROCESSAR",
              status_baixa: "IMPORTADO",
              origem_criacao: "RM_IMPORT",
            });

            // Adicionar ao set para evitar duplicados dentro do mesmo batch
            existingNds.add(nd);

          } catch (voucherError: any) {
            console.error(`[voucher-integrate-rm] Erro ao processar voucher:`, voucherError);
            errors.push({ nd: rmData.nd || "unknown", error: voucherError.message });
          }
        }

        // Inserir em batch para melhor performance
        if (vouchersToInsert.length > 0) {
          console.log(`[voucher-integrate-rm] Inserindo ${vouchersToInsert.length} vouchers em batch`);
          
          const { error: insertError, data: insertedData } = await supabase
            .from("vouchers")
            .insert(vouchersToInsert)
            .select("id");

          if (insertError) {
            console.error(`[voucher-integrate-rm] Erro no batch insert:`, insertError);
            // Tentar inserir um a um se o batch falhar
            for (const voucher of vouchersToInsert) {
              const { error: singleError } = await supabase
                .from("vouchers")
                .insert(voucher);
              
              if (singleError) {
                errors.push({ nd: voucher.numero_spo, error: singleError.message });
              } else {
                importedCount++;
              }
            }
          } else {
            importedCount = insertedData?.length || vouchersToInsert.length;
          }
        }

        skippedCount = result.length - importedCount - errors.length;

        console.log(`[voucher-integrate-rm] Importação concluída: ${importedCount} importados, ${skippedCount} já existentes, ${errors.length} erros`);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Importação concluída: ${importedCount} importados, ${skippedCount} já existentes`,
            imported: importedCount,
            skipped: skippedCount,
            total: result.length,
            errors: errors.length > 0 ? errors : undefined,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } catch (error: any) {
        console.error("[voucher-integrate-rm] Erro na importação:", error);
        if (mariaClient) await mariaClient.close();
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ACTION: LIST - Listar vouchers disponíveis no RM
    if (action === "list") {
      console.log("[voucher-integrate-rm] Listando vouchers disponíveis no RM");
      
      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();
        
        const result = await mariaClient.query(
          `SELECT id_rm, nd, nome_beneficiario, data_vencimento, modal
           FROM dados_dachser.t_dados_financeiro_voucher
           ORDER BY id_rm DESC
           LIMIT 20`
        );
        
        await mariaClient.close();
        
        console.log("[voucher-integrate-rm] Vouchers encontrados:", result?.length || 0);
        
        return new Response(
          JSON.stringify({
            success: true,
            data: result || [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } catch (error: any) {
        console.error("[voucher-integrate-rm] Erro ao listar vouchers:", error);
        if (mariaClient) await mariaClient.close();
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ACTION: FETCH - Buscar dados do voucher na tabela t_dados_financeiro_voucher pelo campo nd
    if (action === "fetch" && numeroVoucherRM) {
      console.log(`[voucher-integrate-rm] Buscando dados do voucher RM (nd): ${numeroVoucherRM}`);
      
      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();
        
        // Buscar na tabela t_dados_financeiro_voucher pelo campo nd
        const result = await mariaClient.query(
          `SELECT 
            id_rm,
            nd,
            documento,
            nome_beneficiario,
            nome_cobranca,
            numero_nf,
            numero_processo,
            modal,
            tipo_pag,
            forma_pag,
            data_emissao,
            data_vencimento,
            valor_nf,
            moeda,
            cnpj,
            razao_social
          FROM dados_dachser.t_dados_financeiro_voucher
          WHERE nd = ?
          LIMIT 1`,
          [numeroVoucherRM.trim()]
        );
        
        console.log("[voucher-integrate-rm] Query result:", result);

        if (!result || result.length === 0) {
          await mariaClient.close();
          return new Response(
            JSON.stringify({
              success: false,
              error: `Voucher com nd "${numeroVoucherRM}" não encontrado na tabela t_dados_financeiro_voucher`,
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        const rmData = result[0] as any;
        console.log("[voucher-integrate-rm] Dados encontrados:", rmData);

        await mariaClient.close();

        // Format dates
        let vencimentoFormatted: string | null = null;
        if (rmData.data_vencimento) {
          const d = new Date(rmData.data_vencimento);
          vencimentoFormatted = d.toISOString().split('T')[0];
        }

        let dataEmissaoFormatted: string | null = null;
        if (rmData.data_emissao) {
          const d = new Date(rmData.data_emissao);
          dataEmissaoFormatted = d.toISOString().split('T')[0];
        }

        // Mapear campos conforme especificado:
        // - nd → número do voucher (campo de busca)
        // - documento → número de documento
        // - nome_beneficiario → fornecedor
        // - nome_cobranca → filial
        // - razao_social → fornecedor (alternativo)
        // - numero_nf → número da nota fiscal
        // - numero_processo → número do processo
        // - modal → AIR/SEA/CHB
        // - tipo_pag → tipo de documento
        // - forma_pag → forma de pagamento
        // - id_rm → referência para t_vouchers

        const responseData: RMVoucherData = {
          idRM: rmData.id_rm?.toString() || "",
          numeroVoucher: rmData.nd || "",
          numeroDocumento: rmData.documento || "",
          fornecedor: rmData.nome_beneficiario || rmData.razao_social || "",
          filial: rmData.nome_cobranca || "",
          numeroNF: rmData.numero_nf || "",
          numeroProcesso: rmData.numero_processo || "",
          modal: rmData.modal || "",
          tipoDocumento: rmData.tipo_pag || "",
          formaPagamento: mapFormaPagamento(rmData.forma_pag),
          dataEmissao: dataEmissaoFormatted,
          vencimento: vencimentoFormatted,
          valor: rmData.valor_nf ? parseFloat(rmData.valor_nf) : null,
          moeda: rmData.moeda || "BRL",
          cnpjFornecedor: rmData.cnpj || null,
        };

        return new Response(
          JSON.stringify({
            success: true,
            data: responseData,
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

    // ACTION: INTEGRATE - Integrar voucher ao RM após comprovante (busca do MariaDB t_vouchers)
    if (action === "integrate" && voucherId) {
      console.log(`[voucher-integrate-rm] Integrando voucher ${voucherId} ao RM`);

      let mariaClient: Client | null = null;
      try {
        mariaClient = await getMariaDBClient();

        // Buscar voucher no MariaDB t_vouchers
        const voucherResult = await mariaClient.query(
          `SELECT v.*, 
            (SELECT COUNT(*) FROM dados_dachser.t_voucher_anexos a WHERE a.voucher_id = v.id AND a.tipo = 'COMPROVANTE') as has_comprovante
           FROM dados_dachser.t_vouchers v
           WHERE v.id = ?
           LIMIT 1`,
          [voucherId]
        );

        if (!voucherResult || voucherResult.length === 0) {
          await mariaClient.close();
          throw new Error("Voucher não encontrado no MariaDB");
        }

        const voucher = voucherResult[0] as any;

        // Validar que o voucher está em etapa ROBO
        if (voucher.etapa_atual !== "ROBO") {
          await mariaClient.close();
          throw new Error("Voucher não está na etapa ROBO");
        }

        // Validar que tem comprovante anexado
        if (!voucher.has_comprovante || voucher.has_comprovante === 0) {
          await mariaClient.close();
          throw new Error("Voucher não possui comprovante anexado. Anexe o comprovante antes de integrar.");
        }

        const idBaixa = Date.now();
        const rmProtocol = `RM-${idBaixa}`;

        // Atualizar voucher para CONCLUIDO e status BAIXADO_RM no MariaDB
        await mariaClient.execute(
          `UPDATE dados_dachser.t_vouchers 
           SET etapa_atual = 'CONCLUIDO', status_baixa = 'BAIXADO_RM', updated_at = NOW()
           WHERE id = ?`,
          [voucherId]
        );

        await mariaClient.close();

        console.log(`[voucher-integrate-rm] Baixa registrada no MariaDB. Protocolo: ${rmProtocol}`);

        // Criar log de integração no Supabase (para métricas)
        const authHeader = req.headers.get("Authorization");
        let userId = null;
        
        if (authHeader) {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user } } = await supabase.auth.getUser(token);
          userId = user?.id;
        }

        // Log to MariaDB instead of Supabase
        const logClient = await getMariaDBClient();
        const logNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await logClient.execute(
          `INSERT INTO t_log_entries (voucher_id, user_id, acao, detalhe, data_hora)
           VALUES (?, ?, ?, ?, ?)`,
          [voucherId, userId, "BAIXADO", `Integração RM concluída. Protocolo: ${rmProtocol}`, logNow]
        );
        await logClient.close();

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
