import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

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

  let mariaClient: Client | null = null;

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

    // Connect to MariaDB
    mariaClient = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      db: 'dados_dachser',
    });

    const voucherId = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const vencimentoDate = new Date(payload.vencimento).toISOString().split('T')[0];
    const dataEmissao = payload.data_emissao_documento 
      ? new Date(payload.data_emissao_documento).toISOString().split('T')[0]
      : null;

    // Create voucher in MariaDB
    await mariaClient.execute(
      `INSERT INTO t_vouchers (
        id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda,
        vencimento, data_emissao_documento, cobranca_em_nome_de, forma_pagamento,
        tipo_documento, filial, cliente_email, comentarios_operacao, urgencia_tipo,
        criado_por_user_id, responsavel_operacao_user_id, etapa_atual, status_baixa,
        origem_criacao, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherId,
        payload.numero_spo,
        payload.fornecedor || null,
        payload.cnpj_fornecedor || null,
        payload.valor || null,
        payload.moeda || "BRL",
        vencimentoDate,
        dataEmissao,
        payload.cobranca_em_nome_de,
        payload.forma_pagamento,
        payload.tipo_documento || null,
        payload.filial || null,
        payload.cliente_email || null,
        payload.comentarios || null,
        urgenciaTipo,
        systemUserId,
        systemUserId,
        "OPERACAO",
        "PENDENTE",
        "OTHELLO",
        now,
        now,
      ]
    );

    console.log("Voucher criado no MariaDB:", voucherId);

    // Criar anexos se fornecidos
    if (payload.anexos && payload.anexos.length > 0) {
      for (const anexo of payload.anexos) {
        try {
          await mariaClient.execute(
            `INSERT INTO t_voucher_anexos (voucher_id, tipo, file_name, file_url, file_size, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              voucherId,
              anexo.tipo,
              anexo.file_name,
              anexo.file_url,
              anexo.file_size || 0,
              now,
            ]
          );
        } catch (anexoError) {
          console.error("Erro ao criar anexo:", anexoError);
        }
      }
    }

    // Criar log de entrada
    await mariaClient.execute(
      `INSERT INTO t_log_entries (voucher_id, user_id, acao, detalhe, data_hora)
       VALUES (?, ?, ?, ?, ?)`,
      [
        voucherId,
        null,
        "INCLUSAO",
        `Voucher criado via integração OTHELLO. Processo: ${payload.processo_tipo || "N/A"} - ${payload.processo_id || "N/A"}`,
        now,
      ]
    );

    await mariaClient.close();

    console.log("=== OTHELLO Webhook - Voucher processado com sucesso ===");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Voucher criado com sucesso",
        voucher_id: voucherId,
        numero_spo: payload.numero_spo,
        etapa_atual: "OPERACAO",
        urgencia_tipo: urgenciaTipo,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Erro no webhook OTHELLO:", error);
    if (mariaClient) await mariaClient.close();
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
