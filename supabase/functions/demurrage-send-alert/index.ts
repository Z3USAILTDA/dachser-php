import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  container_id?: string;
  container_number?: string;
  alert_type: 'risk_warning' | 'risk_critical' | 'exceeded';
  risk_score?: number;
  expected_cost_usd?: number;
  days_remaining?: number;
  recipient_emails: string[];
  client_name?: string;
  shipment_master?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) {
    console.error("[Demurrage Alert] RESEND_API_KEY not configured");
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const resend = new Resend(RESEND_API_KEY);
    const body: AlertRequest = await req.json();

    const {
      container_id,
      container_number,
      alert_type,
      risk_score,
      expected_cost_usd,
      days_remaining,
      recipient_emails,
      client_name,
      shipment_master
    } = body;

    if (!recipient_emails || recipient_emails.length === 0) {
      throw new Error("recipient_emails is required");
    }

    console.log(`[Demurrage Alert] Sending ${alert_type} alert for container ${container_number || container_id}`);

    // Generate email content based on alert type
    const { subject, html } = generateEmailContent({
      alert_type,
      container_number,
      risk_score,
      expected_cost_usd,
      days_remaining,
      client_name,
      shipment_master
    });

    // Send email
    const emailResponse = await resend.emails.send({
      from: "DACHSER CRONOS <alerts@hermes.z3us.ai>",
      to: recipient_emails,
      subject,
      html
    });

    const emailSuccess = emailResponse && !('error' in emailResponse);

    // Record alert in database
    const { error: insertError } = await supabaseClient
      .from('demurrage_alerts')
      .insert({
        container_id: container_id || null,
        alert_type,
        risk_score,
        expected_cost_usd,
        days_remaining,
        email_sent_to: recipient_emails,
        email_sent_at: new Date().toISOString(),
        email_status: emailSuccess ? 'sent' : 'failed'
      });

    if (insertError) {
      console.error('[Demurrage Alert] Error recording alert:', insertError);
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        message: `Alert sent to ${recipient_emails.length} recipients`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Demurrage Alert] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateEmailContent(params: {
  alert_type: string;
  container_number?: string;
  risk_score?: number;
  expected_cost_usd?: number;
  days_remaining?: number;
  client_name?: string;
  shipment_master?: string;
}): { subject: string; html: string } {
  const {
    alert_type,
    container_number,
    risk_score,
    expected_cost_usd,
    days_remaining,
    client_name,
    shipment_master
  } = params;

  const alertConfig = {
    risk_warning: {
      subject: `⚠️ Alerta de Risco - Container ${container_number || 'N/A'}`,
      color: '#f59e0b',
      icon: '⚠️',
      title: 'Alerta de Risco de Demurrage',
      message: 'O container está entrando na zona de risco de demurrage.'
    },
    risk_critical: {
      subject: `🔴 CRÍTICO - Container ${container_number || 'N/A'} em Risco Alto`,
      color: '#ef4444',
      icon: '🔴',
      title: 'Risco Crítico de Demurrage',
      message: 'Ação imediata necessária! O container está em risco crítico de incorrer em custos de demurrage.'
    },
    exceeded: {
      subject: `🚨 Demurrage Excedido - Container ${container_number || 'N/A'}`,
      color: '#dc2626',
      icon: '🚨',
      title: 'Free Time Excedido',
      message: 'O período de free time foi excedido. Custos de demurrage estão sendo incorridos.'
    }
  };

  const config = alertConfig[alert_type as keyof typeof alertConfig] || alertConfig.risk_warning;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">DACHSER CRONOS</h1>
      <p style="color: #94a3b8; margin: 10px 0 0 0; font-size: 14px;">Demurrage & Detention Intelligence</p>
    </div>
    
    <!-- Alert Banner -->
    <div style="background-color: ${config.color}; padding: 20px; text-align: center;">
      <span style="font-size: 36px;">${config.icon}</span>
      <h2 style="color: white; margin: 10px 0 0 0; font-size: 20px;">${config.title}</h2>
    </div>
    
    <!-- Content -->
    <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-top: 0;">
        ${config.message}
      </p>
      
      <!-- Details Card -->
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #1e3a5f; margin: 0 0 15px 0; font-size: 16px;">Detalhes do Container</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Container:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; font-size: 14px; text-align: right; font-family: monospace;">${container_number || 'N/A'}</td>
          </tr>
          ${client_name ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Cliente:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; font-size: 14px; text-align: right;">${client_name}</td>
          </tr>
          ` : ''}
          ${shipment_master ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">BL Master:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: bold; font-size: 14px; text-align: right; font-family: monospace;">${shipment_master}</td>
          </tr>
          ` : ''}
          ${risk_score !== undefined ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Score de Risco:</td>
            <td style="padding: 8px 0; color: ${risk_score >= 80 ? '#ef4444' : risk_score >= 50 ? '#f59e0b' : '#22c55e'}; font-weight: bold; font-size: 14px; text-align: right;">${risk_score}/100</td>
          </tr>
          ` : ''}
          ${days_remaining !== undefined ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Dias Restantes:</td>
            <td style="padding: 8px 0; color: ${days_remaining <= 0 ? '#ef4444' : days_remaining <= 3 ? '#f59e0b' : '#22c55e'}; font-weight: bold; font-size: 14px; text-align: right;">${days_remaining} dia(s)</td>
          </tr>
          ` : ''}
          ${expected_cost_usd !== undefined ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Custo Estimado:</td>
            <td style="padding: 8px 0; color: #ef4444; font-weight: bold; font-size: 16px; text-align: right;">USD ${expected_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
        Este é um alerta automático gerado pelo sistema DACHSER CRONOS.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
      <p style="margin: 0;">© ${new Date().getFullYear()} DACHSER CRONOS - Demurrage Intelligence Platform</p>
    </div>
  </div>
</body>
</html>
  `;

  return { subject: config.subject, html };
}
