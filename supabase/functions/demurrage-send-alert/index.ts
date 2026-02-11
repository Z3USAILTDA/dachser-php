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
  alert_type: 'initial_notice' | 'cost_statement' | 're_notification' | 'risk_warning' | 'risk_critical' | 'exceeded';
  risk_score?: number;
  expected_cost_usd?: number;
  days_remaining?: number;
  recipient_emails: string[];
  client_name?: string;
  shipment_master?: string;
  free_time_end_date?: string;
  excedente_dias?: number;
  contestacao_deadline?: string;
  cost_breakdown?: Array<{ period: string; days: number; rate_usd: number; total_usd: number }>;
  test_mode?: boolean;
}

function add48BusinessHours(startDate: Date): Date {
  let hoursRemaining = 48;
  const current = new Date(startDate);
  while (hoursRemaining > 0) {
    current.setTime(current.getTime() + 60 * 60 * 1000);
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      hoursRemaining--;
    }
  }
  return current;
}

function formatDateBR(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return dateStr; }
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
      container_id, container_number, alert_type, risk_score, expected_cost_usd,
      days_remaining, recipient_emails, client_name, shipment_master,
      free_time_end_date, excedente_dias, contestacao_deadline, cost_breakdown, test_mode
    } = body;

    if (!recipient_emails || recipient_emails.length === 0) {
      throw new Error("recipient_emails is required");
    }

    // For test mode, use initial_notice template
    const effectiveAlertType = test_mode ? 'initial_notice' : (alert_type || 'initial_notice');

    console.log(`[Demurrage Alert] Sending ${effectiveAlertType} alert for container ${container_number || container_id}`);

    const { subject, html } = generateEmailContent({
      alert_type: effectiveAlertType,
      container_number, risk_score, expected_cost_usd, days_remaining,
      client_name, shipment_master, free_time_end_date, excedente_dias,
      contestacao_deadline, cost_breakdown, test_mode
    });

    const emailResponse = await resend.emails.send({
      from: "DACHSER CRONOS <alerts@hermes.z3us.ai>",
      to: recipient_emails,
      subject,
      html
    });

    const emailSuccess = emailResponse && !('error' in emailResponse);

    // Record alert in database (skip for test mode)
    if (!test_mode) {
      const { error: insertError } = await supabaseClient
        .from('demurrage_alerts')
        .insert({
          container_id: container_id || null,
          alert_type: effectiveAlertType,
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
    }

    return new Response(
      JSON.stringify({ status: 'success', message: `Alert sent to ${recipient_emails.length} recipients` }),
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
  free_time_end_date?: string;
  excedente_dias?: number;
  contestacao_deadline?: string;
  cost_breakdown?: Array<{ period: string; days: number; rate_usd: number; total_usd: number }>;
  test_mode?: boolean;
}): { subject: string; html: string } {
  const { alert_type, container_number, expected_cost_usd, client_name, shipment_master,
    free_time_end_date, excedente_dias, contestacao_deadline, cost_breakdown, test_mode } = params;

  const testPrefix = test_mode ? '[TESTE] ' : '';
  const year = new Date().getFullYear();

  // ============ TEMPLATE 1: Alerta Inicial (Free Time Vencido) ============
  if (alert_type === 'initial_notice' || alert_type === 'risk_warning' || alert_type === 're_notification') {
    const isReNotification = alert_type === 're_notification';
    const subject = `${testPrefix}${isReNotification ? '🔁 Re-notificação' : '⚠️ Aviso'} - Free Time Vencido - ${container_number || 'N/A'}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;">
<div style="max-width:650px;margin:0 auto;padding:20px;">
  <!-- Header DACHSER -->
  <div style="background:linear-gradient(135deg,#003369 0%,#001a3a 100%);padding:30px;border-radius:12px 12px 0 0;">
    <table style="width:100%;"><tr>
      <td><h1 style="color:#ffc800;margin:0;font-size:26px;font-weight:bold;">DACHSER</h1>
        <p style="color:#94a3b8;margin:5px 0 0;font-size:13px;">CRONOS — Demurrage & Detention Intelligence</p></td>
      <td style="text-align:right;"><span style="font-size:12px;color:#ffc800;background:rgba(255,200,0,0.15);padding:4px 12px;border-radius:20px;">${isReNotification ? 'RE-NOTIFICAÇÃO' : 'AVISO INICIAL'}</span></td>
    </tr></table>
  </div>

  <!-- Alert Banner -->
  <div style="background-color:${isReNotification ? '#ef4444' : '#f59e0b'};padding:18px;text-align:center;">
    <h2 style="color:white;margin:0;font-size:18px;">${isReNotification ? '🔁 Re-notificação: Free Time Excedido' : '⚠️ Aviso de Free Time Vencido'}</h2>
  </div>

  <!-- Content -->
  <div style="background-color:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <p style="color:#374151;font-size:15px;line-height:1.6;margin-top:0;">
      Prezado(a) <strong>${client_name || 'Cliente'}</strong>,
    </p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">
      ${isReNotification 
        ? 'Informamos que não recebemos retorno referente ao aviso anterior de free time vencido. Segue abaixo o demonstrativo atualizado dos custos incorridos.'
        : 'Informamos que o período de <strong>free time</strong> do(s) container(s) abaixo foi excedido, e custos de <strong>demurrage/detention</strong> estão sendo incorridos.'}
    </p>

    <!-- Details -->
    <div style="background-color:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #ffc800;">
      <h3 style="color:#003369;margin:0 0 12px;font-size:15px;">📦 Detalhes</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Container:</td>
            <td style="padding:6px 0;color:#111827;font-weight:bold;font-size:14px;text-align:right;font-family:monospace;">${container_number || 'N/A'}</td></tr>
        ${shipment_master ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">BL Master:</td>
            <td style="padding:6px 0;color:#111827;font-weight:bold;font-size:14px;text-align:right;font-family:monospace;">${shipment_master}</td></tr>` : ''}
        ${free_time_end_date ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Free Time Encerrado em:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:bold;font-size:14px;text-align:right;">${formatDateBR(free_time_end_date)}</td></tr>` : ''}
        ${excedente_dias !== undefined ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Dias Excedentes:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:bold;font-size:14px;text-align:right;">${excedente_dias} dia(s)</td></tr>` : ''}
        ${expected_cost_usd !== undefined ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Custo Estimado:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:bold;font-size:16px;text-align:right;">USD ${expected_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>` : ''}
      </table>
    </div>

    <p style="color:#374151;font-size:14px;line-height:1.6;">
      Solicitamos que providencie a <strong>devolução/retirada</strong> do(s) container(s) o mais breve possível para evitar custos adicionais.
    </p>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin:20px 0 0;">
      Este é um alerta automático gerado pelo sistema DACHSER CRONOS.<br/>
      Em caso de dúvidas, entre em contato com o seu analista responsável.
    </p>
  </div>

  <div style="text-align:center;padding:16px;color:#9ca3af;font-size:11px;">
    <p style="margin:0;">© ${year} DACHSER CRONOS — Demurrage & Detention Intelligence Platform</p>
  </div>
</div></body></html>`;

    return { subject, html };
  }

  // ============ TEMPLATE 2: Demonstrativo de Custos (48h Contestação) ============
  if (alert_type === 'cost_statement' || alert_type === 'risk_critical' || alert_type === 'exceeded') {
    const deadline = contestacao_deadline || (free_time_end_date ? add48BusinessHours(new Date()).toISOString() : undefined);
    const subject = `${testPrefix}🚨 Demonstrativo de Custos - Demurrage - ${container_number || 'N/A'}`;

    let costRows = '';
    if (cost_breakdown && cost_breakdown.length > 0) {
      costRows = cost_breakdown.map(cb => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${cb.period}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:center;">${cb.days}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;">USD ${cb.rate_usd.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;font-weight:bold;">USD ${cb.total_usd.toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      costRows = `<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">Detalhamento não disponível</td></tr>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;">
<div style="max-width:650px;margin:0 auto;padding:20px;">
  <!-- Header DACHSER -->
  <div style="background:linear-gradient(135deg,#003369 0%,#001a3a 100%);padding:30px;border-radius:12px 12px 0 0;">
    <table style="width:100%;"><tr>
      <td><h1 style="color:#ffc800;margin:0;font-size:26px;font-weight:bold;">DACHSER</h1>
        <p style="color:#94a3b8;margin:5px 0 0;font-size:13px;">CRONOS — Demurrage & Detention Intelligence</p></td>
      <td style="text-align:right;"><span style="font-size:12px;color:white;background:#ef4444;padding:4px 12px;border-radius:20px;">DEMONSTRATIVO</span></td>
    </tr></table>
  </div>

  <!-- Alert Banner -->
  <div style="background-color:#dc2626;padding:18px;text-align:center;">
    <h2 style="color:white;margin:0;font-size:18px;">🚨 Demonstrativo de Custos de Demurrage</h2>
  </div>

  <!-- Content -->
  <div style="background-color:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <p style="color:#374151;font-size:15px;line-height:1.6;margin-top:0;">
      Prezado(a) <strong>${client_name || 'Cliente'}</strong>,
    </p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">
      Segue abaixo o demonstrativo de custos de <strong>demurrage/detention</strong> referente ao container indicado. 
      Caso deseje contestar os valores, o prazo é de <strong>48 horas úteis</strong> a partir do recebimento deste e-mail.
    </p>

    <!-- Container Info -->
    <div style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #003369;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Container:</td>
            <td style="padding:4px 0;color:#111827;font-weight:bold;font-size:13px;text-align:right;font-family:monospace;">${container_number || 'N/A'}</td></tr>
        ${shipment_master ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">BL Master:</td>
            <td style="padding:4px 0;color:#111827;font-weight:bold;font-size:13px;text-align:right;font-family:monospace;">${shipment_master}</td></tr>` : ''}
        ${free_time_end_date ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Free Time Encerrado:</td>
            <td style="padding:4px 0;color:#ef4444;font-weight:bold;font-size:13px;text-align:right;">${formatDateBR(free_time_end_date)}</td></tr>` : ''}
      </table>
    </div>

    <!-- Cost Breakdown Table -->
    <h3 style="color:#003369;font-size:15px;margin:20px 0 10px;">Demonstrativo de Custos</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
      <thead>
        <tr style="background-color:#003369;">
          <th style="padding:10px 12px;text-align:left;color:white;font-size:12px;font-weight:600;">Período</th>
          <th style="padding:10px 12px;text-align:center;color:white;font-size:12px;font-weight:600;">Dias</th>
          <th style="padding:10px 12px;text-align:right;color:white;font-size:12px;font-weight:600;">Diária</th>
          <th style="padding:10px 12px;text-align:right;color:white;font-size:12px;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${costRows}</tbody>
      <tfoot>
        <tr style="background-color:#f8fafc;">
          <td colspan="3" style="padding:10px 12px;font-size:14px;font-weight:bold;color:#003369;">TOTAL</td>
          <td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:bold;color:#ef4444;">USD ${(expected_cost_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Contestação Deadline -->
    <div style="background-color:#fef3c7;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #fbbf24;">
      <p style="color:#92400e;font-size:14px;margin:0;font-weight:bold;">⏰ Prazo de Contestação</p>
      <p style="color:#92400e;font-size:13px;margin:6px 0 0;">
        ${deadline ? `Até <strong>${formatDateBR(deadline)}</strong> (48 horas úteis)` : 'Até 48 horas úteis após o recebimento deste e-mail'}
      </p>
      <p style="color:#92400e;font-size:12px;margin:6px 0 0;">
        Caso não haja manifestação dentro deste prazo, os valores serão considerados aceitos e lançados para faturamento.
      </p>
    </div>

    <p style="color:#6b7280;font-size:12px;text-align:center;margin:20px 0 0;">
      Este é um alerta automático gerado pelo sistema DACHSER CRONOS.<br/>
      Em caso de dúvidas, entre em contato com o seu analista responsável.
    </p>
  </div>

  <div style="text-align:center;padding:16px;color:#9ca3af;font-size:11px;">
    <p style="margin:0;">© ${year} DACHSER CRONOS — Demurrage & Detention Intelligence Platform</p>
  </div>
</div></body></html>`;

    return { subject, html };
  }

  // Fallback for unknown types
  return {
    subject: `${testPrefix}DACHSER CRONOS - Alerta Demurrage - ${container_number || 'N/A'}`,
    html: `<p>Alerta de demurrage para container ${container_number || 'N/A'}. Cliente: ${client_name || 'N/A'}.</p>`
  };
}
