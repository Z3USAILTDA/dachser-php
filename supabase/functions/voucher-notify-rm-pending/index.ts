import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[notify-rm-pending] Verificando vouchers RM pendentes há mais de 24h");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calcular data limite (24h atrás)
    const limitDate = new Date();
    limitDate.setHours(limitDate.getHours() - 24);

    // Buscar vouchers RM_PENDENTE criados há mais de 24h
    const { data: pendingVouchers, error: fetchError } = await supabase
      .from("vouchers")
      .select(`
        id,
        numero_spo,
        fornecedor,
        valor,
        vencimento,
        created_at,
        criado_por_user_id
      `)
      .eq("status_baixa", "PENDENTE")
      .lt("created_at", limitDate.toISOString());

    if (fetchError) {
      console.error("[notify-rm-pending] Erro ao buscar vouchers:", fetchError);
      throw fetchError;
    }

    if (!pendingVouchers || pendingVouchers.length === 0) {
      console.log("[notify-rm-pending] Nenhum voucher pendente há mais de 24h");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum voucher pendente há mais de 24h",
          notified: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`[notify-rm-pending] Encontrados ${pendingVouchers.length} vouchers pendentes há mais de 24h`);

    // Buscar gestores de operação para notificar via user_roles
    const { data: gestorRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["GESTOR_OPERACAO", "ADMIN"]);

    if (rolesError) {
      console.error("[notify-rm-pending] Erro ao buscar roles:", rolesError);
      throw rolesError;
    }

    if (!gestorRoles || gestorRoles.length === 0) {
      console.log("[notify-rm-pending] Nenhum gestor encontrado para notificar");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum gestor para notificar",
          notified: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const gestorUserIds = gestorRoles.map(r => r.user_id);
    
    const { data: gestores, error: gestoresError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("user_id", gestorUserIds)
      .eq("active", true);

    if (gestoresError) {
      console.error("[notify-rm-pending] Erro ao buscar gestores:", gestoresError);
      throw gestoresError;
    }

    if (!gestores || gestores.length === 0) {
      console.log("[notify-rm-pending] Nenhum gestor ativo encontrado");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum gestor ativo para notificar",
          notified: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Helper para parsear datas do MariaDB como UTC
    const parseMariaDBDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null;
      if (dateStr.includes('Z') || dateStr.includes('+')) {
        return new Date(dateStr);
      }
      if (dateStr.includes('T')) {
        return new Date(dateStr + 'Z');
      }
      if (dateStr.includes(' ')) {
        return new Date(dateStr.replace(' ', 'T') + 'Z');
      }
      return new Date(dateStr + 'T00:00:00Z');
    };

    // Construir tabela HTML dos vouchers pendentes
    const vouchersHtml = pendingVouchers.map(v => {
      const createdAt = parseMariaDBDate(v.created_at) || new Date();
      const horasPendente = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
      const vencimento = parseMariaDBDate(v.vencimento) || new Date();
      
      return `
        <tr style="border-bottom: 1px solid #333;">
          <td style="padding: 12px; font-family: monospace; color: #D97706;">${v.numero_spo}</td>
          <td style="padding: 12px;">${v.fornecedor || "-"}</td>
          <td style="padding: 12px;">R$ ${v.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "-"}</td>
          <td style="padding: 12px;">${vencimento.toLocaleDateString("pt-BR")}</td>
          <td style="padding: 12px; color: #EF4444; font-weight: bold;">${horasPendente}h</td>
        </tr>
      `;
    }).join("");

    const appUrl = Deno.env.get("APP_URL") || "https://lovable.dev";

    // Enviar email para cada gestor
    const emailPromises = gestores.map(async (gestor) => {
      try {
        const emailResponse = await resend.emails.send({
          from: "DACHSER Voucher <noreply@hermes.z3us.ai>",
          to: [gestor.email],
          subject: `⚠️ ${pendingVouchers.length} Vouchers Pendentes há mais de 24h`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #e5e5e5; margin: 0; padding: 0; }
                .container { max-width: 700px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #D97706 0%, #B45309 100%); padding: 24px; border-radius: 12px 12px 0 0; }
                .header h1 { margin: 0; color: #fff; font-size: 22px; }
                .content { background: #262626; padding: 24px; border-radius: 0 0 12px 12px; }
                .alert-box { background: #7F1D1D; border: 1px solid #EF4444; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
                .alert-box p { margin: 0; color: #FCA5A5; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th { background: #D97706; color: #fff; padding: 12px; text-align: left; font-weight: 600; }
                .btn { display: inline-block; background: linear-gradient(135deg, #D97706 0%, #B45309 100%); color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
                .footer { text-align: center; padding: 20px; color: #737373; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>⚠️ Alerta: Vouchers Pendentes</h1>
                </div>
                <div class="content">
                  <p>Olá <strong>${gestor.name}</strong>,</p>
                  
                  <div class="alert-box">
                    <p><strong>${pendingVouchers.length} voucher(s)</strong> estão pendentes há mais de 24 horas.</p>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Nº SPO</th>
                        <th>Fornecedor</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Pendente há</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${vouchersHtml}
                    </tbody>
                  </table>

                  <a href="${appUrl}/fin/esteira" class="btn">Acessar Sistema de Vouchers</a>
                </div>
                <div class="footer">
                  <p>DACHSER Brasil — Sistema de Vouchers</p>
                  <p>Esta é uma notificação automática.</p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        console.log(`[notify-rm-pending] Email enviado para ${gestor.email}:`, emailResponse);
        return { gestor: gestor.email, success: true };
      } catch (emailError: any) {
        console.error(`[notify-rm-pending] Erro ao enviar para ${gestor.email}:`, emailError);
        return { gestor: gestor.email, success: false, error: emailError.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter(r => r.success).length;

    console.log(`[notify-rm-pending] Notificações enviadas: ${successCount}/${gestores.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notificações enviadas para ${successCount} gestores`,
        pendingVouchers: pendingVouchers.length,
        notified: successCount,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("[notify-rm-pending] Erro geral:", error);
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
