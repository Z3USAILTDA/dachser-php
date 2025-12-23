import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingVoucher {
  id: string;
  numero_spo: string;
  etapa_atual: string;
  vencimento: string;
  updated_at: string;
  urgencia_tipo: string;
  criado_por_user_id: string;
  status_integracao_rm?: string;
  fornecedor?: string;
  valor?: number;
  moeda?: string;
}

const stageNames: Record<string, string> = {
  OPERACAO: "Operação",
  FISCAL: "Fiscal",
  FINANCEIRO: "Financeiro",
  SUPERVISOR: "Supervisor",
  ROBO: "Robô",
  AJUSTE_OPERACAO: "Ajuste Operação",
  AJUSTE_FISCAL: "Ajuste Fiscal",
};

const statusRmNames: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADO_T_DADOS_RM: "Enviado p/ RM",
  PROCESSADO: "Processado",
  ERRO: "Erro",
};

const formatCurrency = (value: number | undefined, moeda: string = "BRL"): string => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
  }).format(value);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: Client | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting daily report generation...");

    // Connect to MariaDB
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error('Missing MariaDB credentials');
    }

    mariaClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Buscar vouchers parados há mais de 24 horas from MariaDB
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const cutoffDate = twentyFourHoursAgo.toISOString().replace('T', ' ').substring(0, 19);

    const pendingVouchers = await mariaClient.query(`
      SELECT 
        id,
        numero_spo,
        etapa_atual,
        vencimento,
        updated_at,
        urgencia_tipo,
        criado_por_user_id,
        status_integracao_rm,
        fornecedor,
        valor,
        moeda
      FROM dados_dachser.t_vouchers
      WHERE updated_at < ?
        AND etapa_atual != 'CONCLUIDO'
      ORDER BY etapa_atual, vencimento ASC
    `, [cutoffDate]) as PendingVoucher[];

    console.log(`Found ${pendingVouchers?.length || 0} pending vouchers from MariaDB`);

    if (!pendingVouchers || pendingVouchers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending vouchers found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Agrupar vouchers por etapa
    const vouchersByStage = pendingVouchers.reduce((acc, voucher) => {
      const stage = voucher.etapa_atual;
      if (!acc[stage]) {
        acc[stage] = [];
      }
      acc[stage].push(voucher);
      return acc;
    }, {} as Record<string, PendingVoucher[]>);

    // Buscar gestores via user_roles from Supabase
    const { data: gestorRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["GESTOR_OPERACAO", "GESTOR_FISCAL", "GESTOR_FINANCEIRO", "ADMIN"]);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      throw rolesError;
    }

    if (!gestorRoles || gestorRoles.length === 0) {
      console.log("No managers found");
      return new Response(
        JSON.stringify({ message: "No managers found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gestorUserIds = gestorRoles.map(r => r.user_id);

    const { data: gestores, error: gestoresError } = await supabase
      .from("profiles")
      .select("email, name")
      .in("user_id", gestorUserIds)
      .eq("active", true);

    if (gestoresError) {
      console.error("Error fetching managers:", gestoresError);
      throw gestoresError;
    }

    if (!gestores || gestores.length === 0) {
      console.log("No active managers found");
      return new Response(
        JSON.stringify({ message: "No active managers found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular estatísticas por Status RM
    const statsByStatusRm = pendingVouchers.reduce((acc, v) => {
      const status = v.status_integracao_rm || 'PENDENTE';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calcular valor total
    const valorTotal = pendingVouchers.reduce((acc, v) => acc + (v.valor || 0), 0);

    // Montar e-mail HTML
    let emailContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            h1 { color: #2563eb; }
            h2 { color: #1e40af; margin-top: 20px; }
            h3 { color: #374151; margin-top: 15px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            .urgent { background-color: #fee2e2; }
            .summary { background-color: #eff6ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .stats { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
            .stat-box { background-color: #f9fafb; padding: 15px; border-radius: 5px; border: 1px solid #e5e7eb; min-width: 150px; }
            .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
            .stat-label { font-size: 12px; color: #6b7280; }
            .status-pendente { color: #d97706; }
            .status-enviado { color: #2563eb; }
            .status-processado { color: #059669; }
            .status-erro { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1>Relatório de Pendências - Vouchers Dachser</h1>
          <div class="summary">
            <strong>Total de Vouchers Pendentes:</strong> ${pendingVouchers.length}<br>
            <strong>Valor Total:</strong> ${formatCurrency(valorTotal)}<br>
            <strong>Data/Hora do Relatório:</strong> ${new Date().toLocaleString("pt-BR")}
          </div>

          <h3>Status de Integração RM</h3>
          <div class="stats">
    `;

    // Adicionar estatísticas por Status RM
    Object.entries(statsByStatusRm).forEach(([status, count]) => {
      const statusClass = status === 'PENDENTE' ? 'status-pendente' :
                          status === 'ENVIADO_T_DADOS_RM' ? 'status-enviado' :
                          status === 'PROCESSADO' ? 'status-processado' :
                          status === 'ERRO' ? 'status-erro' : '';
      emailContent += `
        <div class="stat-box">
          <div class="stat-value ${statusClass}">${count}</div>
          <div class="stat-label">${statusRmNames[status] || status}</div>
        </div>
      `;
    });

    emailContent += `</div>`;

    // Adicionar tabela para cada etapa
    for (const [stage, vouchers] of Object.entries(vouchersByStage)) {
      emailContent += `
        <h2>${stageNames[stage] || stage} (${vouchers.length} voucher${vouchers.length > 1 ? 's' : ''})</h2>
        <table>
          <thead>
            <tr>
              <th>SPO</th>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Última Atualização</th>
              <th>Horas Parado</th>
              <th>Status RM</th>
              <th>Urgente</th>
            </tr>
          </thead>
          <tbody>
      `;

      vouchers.forEach((voucher) => {
        const hoursStalled = Math.floor(
          (new Date().getTime() - new Date(voucher.updated_at).getTime()) / (1000 * 60 * 60)
        );
        const isUrgent = voucher.urgencia_tipo !== "NORMAL";
        const rowClass = isUrgent ? 'urgent' : '';
        const statusRm = voucher.status_integracao_rm || 'PENDENTE';
        const statusRmClass = statusRm === 'PENDENTE' ? 'status-pendente' :
                              statusRm === 'ENVIADO_T_DADOS_RM' ? 'status-enviado' :
                              statusRm === 'PROCESSADO' ? 'status-processado' :
                              statusRm === 'ERRO' ? 'status-erro' : '';

        emailContent += `
          <tr class="${rowClass}">
            <td>${voucher.numero_spo}</td>
            <td>${voucher.fornecedor || '-'}</td>
            <td>${formatCurrency(voucher.valor, voucher.moeda)}</td>
            <td>${new Date(voucher.vencimento).toLocaleDateString("pt-BR")}</td>
            <td>${new Date(voucher.updated_at).toLocaleString("pt-BR")}</td>
            <td>${hoursStalled}h</td>
            <td class="${statusRmClass}">${statusRmNames[statusRm] || statusRm}</td>
            <td>${isUrgent ? "🔴 SIM" : "Não"}</td>
          </tr>
        `;
      });

      emailContent += `
          </tbody>
        </table>
      `;
    }

    emailContent += `
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            Este é um e-mail automático enviado pelo sistema de gestão de vouchers Dachser.<br>
            Para mais detalhes, acesse o sistema.
          </p>
        </body>
      </html>
    `;

    // Enviar e-mail para cada gestor
    const emailPromises = gestores.map((gestor) =>
      resend.emails.send({
        from: "Vouchers Dachser <noreply@hermes.z3us.ai>",
        to: [gestor.email],
        subject: `⚠️ Relatório de Pendências - ${pendingVouchers.length} voucher${pendingVouchers.length > 1 ? 's' : ''} parado${pendingVouchers.length > 1 ? 's' : ''} | Total: ${formatCurrency(valorTotal)}`,
        html: emailContent,
      })
    );

    const emailResults = await Promise.allSettled(emailPromises);
    const successCount = emailResults.filter((r) => r.status === "fulfilled").length;
    const failCount = emailResults.filter((r) => r.status === "rejected").length;

    console.log(`Emails sent: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        message: "Daily report sent successfully",
        pendingVouchers: pendingVouchers.length,
        valorTotal,
        emailsSent: successCount,
        emailsFailed: failCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-daily-report:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } finally {
    if (mariaClient) {
      await mariaClient.close();
    }
  }
};

serve(handler);
