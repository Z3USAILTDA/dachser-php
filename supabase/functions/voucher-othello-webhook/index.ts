import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OthelloVoucherPayload {
  // Identificação do processo
  processo_id?: string;
  processo_tipo?: "AIR" | "SEA" | "CHB";
  numero_spo: string;
  
  // Dados do fornecedor
  fornecedor?: string;
  cnpj_fornecedor?: string;
  
  // Valores
  valor?: number;
  moeda?: string;
  
  // Datas
  vencimento: string;
  data_emissao_documento?: string;
  
  // Classificação
  cobranca_em_nome_de: "DACHSER" | "CLIENTE";
  forma_pagamento: "BOLETO" | "TRANSFERENCIA_PIX" | "DEBITO" | "CAMBIO" | "ADF";
  tipo_documento?: "NF_SERVICO" | "NF_DEBITO" | "BOLETO" | "ARMAZENAGEM" | "ICMS" | "OUTROS";
  
  // Dados adicionais
  filial?: string;
  cliente_email?: string;
  comentarios?: string;
  
  // Arquivos (URLs)
  anexos?: Array<{
    tipo: "FATURA_DEMONSTRATIVO" | "BOLETO_INSTRUCOES" | "COMPROVANTE" | "OUTROS";
    file_name: string;
    file_url: string;
    file_size?: number;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: OthelloVoucherPayload = await req.json();

    console.log("=== OTHELLO Webhook - Recebendo voucher ===");
    console.log("Payload:", JSON.stringify(payload, null, 2));

    // Validar campos obrigatórios
    if (!payload.numero_spo) {
      throw new Error("Campo obrigatório: numero_spo");
    }
    if (!payload.vencimento) {
      throw new Error("Campo obrigatório: vencimento");
    }
    if (!payload.cobranca_em_nome_de) {
      throw new Error("Campo obrigatório: cobranca_em_nome_de");
    }
    if (!payload.forma_pagamento) {
      throw new Error("Campo obrigatório: forma_pagamento");
    }

    // Determinar urgência automática
    let urgenciaTipo = "NORMAL";
    if (payload.tipo_documento === "ICMS" || payload.tipo_documento === "ARMAZENAGEM") {
      urgenciaTipo = "URGENTE_AUTOMATICO";
    }

    // Buscar um usuário admin para criar o voucher
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "ADMIN")
      .limit(1);

    let systemUserId: string | null = null;
    
    if (adminRoles && adminRoles.length > 0) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", adminRoles[0].user_id)
        .single();
      
      systemUserId = adminProfile?.user_id || null;
    }

    if (!systemUserId) {
      throw new Error("Nenhum usuário administrador encontrado para criar o voucher");
    }

    // Criar o voucher
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .insert({
        numero_spo: payload.numero_spo,
        fornecedor: payload.fornecedor || null,
        cnpj_fornecedor: payload.cnpj_fornecedor || null,
        valor: payload.valor || null,
        moeda: payload.moeda || "BRL",
        vencimento: new Date(payload.vencimento).toISOString().split('T')[0],
        data_emissao_documento: payload.data_emissao_documento 
          ? new Date(payload.data_emissao_documento).toISOString().split('T')[0]
          : null,
        cobranca_em_nome_de: payload.cobranca_em_nome_de,
        forma_pagamento: payload.forma_pagamento,
        tipo_documento: payload.tipo_documento || null,
        filial: payload.filial || null,
        cliente_email: payload.cliente_email || null,
        comentarios_operacao: payload.comentarios || null,
        urgencia_tipo: urgenciaTipo,
        criado_por_user_id: systemUserId,
        responsavel_operacao_user_id: systemUserId,
        etapa_atual: "OPERACAO",
        status_baixa: "PENDENTE",
      })
      .select()
      .single();

    if (voucherError) {
      console.error("Erro ao criar voucher:", voucherError);
      throw voucherError;
    }

    console.log("Voucher criado:", voucher.id);

    // Criar anexos se fornecidos
    if (payload.anexos && payload.anexos.length > 0) {
      for (const anexo of payload.anexos) {
        const { error: anexoError } = await supabase.from("voucher_anexos").insert({
          voucher_id: voucher.id,
          tipo: anexo.tipo,
          file_name: anexo.file_name,
          file_url: anexo.file_url,
          file_size: anexo.file_size || 0,
          uploaded_by_user_id: systemUserId,
        });

        if (anexoError) {
          console.error("Erro ao criar anexo:", anexoError);
        }
      }
    }

    // Criar log de entrada
    await supabase.from("voucher_logs").insert({
      voucher_id: voucher.id,
      user_id: null,
      acao: "INCLUSAO",
      detalhe: `Voucher criado via integração OTHELLO. Processo: ${payload.processo_tipo || "N/A"} - ${payload.processo_id || "N/A"}`,
    });

    console.log("=== OTHELLO Webhook - Voucher processado com sucesso ===");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Voucher criado com sucesso",
        voucher_id: voucher.id,
        numero_spo: voucher.numero_spo,
        etapa_atual: voucher.etapa_atual,
        urgencia_tipo: voucher.urgencia_tipo,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Erro no webhook OTHELLO:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
