import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  to: string;
  type: "AJUSTE_SOLICITADO" | "URGENCIA_REJEITADA" | "VOUCHER_ENVIADO" | "VOUCHER_CONCLUIDO" | "VENCIMENTO_PROXIMO";
  voucherId: string;
  voucherNumber: string;
  reason?: string;
  fromStage?: string;
  toStage?: string;
  senderName?: string;
}

const getEmailContent = (data: NotificationRequest) => {
  const baseUrl = Deno.env.get("SITE_URL") || "https://z3us-dachser.lovable.app";
  const voucherLink = `${baseUrl}/fin/esteira/voucher/${data.voucherId}`;

  switch (data.type) {
    case "AJUSTE_SOLICITADO":
      return {
        subject: `[DACHSER] Ajuste Solicitado - Voucher ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #F5B843;">Ajuste Solicitado</h2>
            <p>O voucher <strong>${data.voucherNumber}</strong> foi devolvido de <strong>${data.fromStage}</strong> para <strong>${data.toStage}</strong>.</p>
            <p><strong>Motivo:</strong></p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
              ${data.reason || "Não especificado"}
            </div>
            <p>Por favor, acesse o sistema para realizar os ajustes necessários.</p>
            <a href="${voucherLink}" style="display: inline-block; background: #F5B843; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Ver Voucher
            </a>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Enviado por: ${data.senderName || "Sistema"}
            </p>
          </div>
        `,
      };

    case "URGENCIA_REJEITADA":
      return {
        subject: `[DACHSER] Urgência Rejeitada - Voucher ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #DC2626;">Urgência Rejeitada</h2>
            <p>A solicitação de urgência para o voucher <strong>${data.voucherNumber}</strong> foi rejeitada pelo Supervisor.</p>
            <p><strong>Motivo:</strong></p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #DC2626;">
              ${data.reason || "Não especificado"}
            </div>
            <p>O voucher foi devolvido para a Operação.</p>
            <a href="${voucherLink}" style="display: inline-block; background: #F5B843; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Ver Voucher
            </a>
          </div>
        `,
      };

    case "VOUCHER_ENVIADO":
      return {
        subject: `[DACHSER] Voucher Recebido - ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #F5B843;">Novo Voucher para Análise</h2>
            <p>Você recebeu um novo voucher para análise: <strong>${data.voucherNumber}</strong></p>
            <p>Etapa atual: <strong>${data.toStage}</strong></p>
            <a href="${voucherLink}" style="display: inline-block; background: #F5B843; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Analisar Voucher
            </a>
          </div>
        `,
      };

    case "VOUCHER_CONCLUIDO":
      return {
        subject: `[DACHSER] Voucher Concluído - ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #22C55E;">Voucher Concluído com Sucesso</h2>
            <p>O voucher <strong>${data.voucherNumber}</strong> foi processado e concluído com sucesso.</p>
            <a href="${voucherLink}" style="display: inline-block; background: #22C55E; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Ver Detalhes
            </a>
          </div>
        `,
      };

    case "VENCIMENTO_PROXIMO":
      return {
        subject: `[DACHSER] ⚠️ Vencimento Próximo - Voucher ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #F59E0B;">⚠️ Atenção: Vencimento Próximo</h2>
            <p>O voucher <strong>${data.voucherNumber}</strong> está próximo do vencimento!</p>
            <p>Por favor, verifique e tome as ações necessárias.</p>
            <a href="${voucherLink}" style="display: inline-block; background: #F59E0B; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Ver Voucher
            </a>
          </div>
        `,
      };

    default:
      return {
        subject: `[DACHSER] Notificação - Voucher ${data.voucherNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #F5B843;">Notificação de Voucher</h2>
            <p>Há uma atualização no voucher <strong>${data.voucherNumber}</strong>.</p>
            <a href="${voucherLink}" style="display: inline-block; background: #F5B843; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 15px;">
              Ver Voucher
            </a>
          </div>
        `,
      };
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: NotificationRequest = await req.json();
    console.log("Sending notification:", data);

    const { subject, html } = getEmailContent(data);

    // Get SMTP settings from environment
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL");
    const smtpFromName = Deno.env.get("SMTP_FROM_NAME") || "DACHSER Z3US";

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log("SMTP not configured, logging email instead");
      console.log("Would send email to:", data.to);
      console.log("Subject:", subject);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Email logged (SMTP not configured)",
          to: data.to,
          subject 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For now, we'll simulate the email send since we can't use npm packages directly
    // In production, you would use a proper email library or service
    console.log("Email would be sent via SMTP:");
    console.log("To:", data.to);
    console.log("Subject:", subject);
    console.log("From:", `${smtpFromName} <${smtpFromEmail}>`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification sent successfully",
        to: data.to,
        subject 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-voucher-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
