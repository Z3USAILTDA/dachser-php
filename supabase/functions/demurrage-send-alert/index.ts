import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContainerDetail {
  number: string;
  size?: string;        // "20" | "40"
  type?: string;        // "DRY" | "REEFER" etc
  discharge_date?: string;
  free_time_days?: number;
  return_deadline?: string;
  return_date?: string;
  days_possession?: number;
  days_incident?: number;
  rate_period1_usd?: number;
  rate_period2_usd?: number;
  total_usd?: number;
}

interface AlertRequest {
  container_id?: string;
  container_number?: string;
  alert_type: 'initial_notice' | 'cost_statement' | 're_notification' | 'risk_warning' | 'risk_critical' | 'exceeded';
  recipient_emails: string[];
  client_name?: string;
  shipment_master?: string;
  free_time_end_date?: string;
  excedente_dias?: number;
  expected_cost_usd?: number;
  risk_score?: number;
  days_remaining?: number;
  test_mode?: boolean;
  // Expanded fields for demonstrativo
  house_bl?: string;
  partner_id?: string;
  origin_port?: string;
  destination_port?: string;
  exchange_rate?: number;
  total_usd?: number;
  total_brl?: number;
  containers?: ContainerDetail[];
  issue_date?: string;
}

function formatDateBR(dateStr: string | undefined | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(dateStr); }
}

const DACHSER_SIGNATURE = `
<br/><br/>
<table style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:12px;color:#333;">
  <tr><td style="padding-bottom:4px;"><strong style="color:#003369;">Time Demurrage & Detention</strong></td></tr>
  <tr><td style="color:#666;">Air & Sea Logistics Brazil</td></tr>
  <tr><td style="padding-top:8px;"><strong style="color:#003369;">DACHSER Brasil Logística Ltda.</strong></td></tr>
  <tr><td style="color:#666;">Santos Office</td></tr>
  <tr><td style="color:#666;">Rua Itororó, 70 – 6º andar – Sala 61</td></tr>
  <tr><td style="color:#666;">Vila Mathias – Santos/SP – CEP 11015-330</td></tr>
  <tr><td style="color:#666;">Brasil</td></tr>
  <tr><td style="padding-top:6px;"><a href="https://www.dachser.com.br" style="color:#003369;text-decoration:none;">www.dachser.com.br</a></td></tr>
</table>`;

function generateNotificationHtml(params: {
  client_name?: string;
  container_number?: string;
  shipment_master?: string;
  free_time_end_date?: string;
  excedente_dias?: number;
  is_renotification?: boolean;
  is_cost_statement?: boolean;
  test_mode?: boolean;
}): string {
  const { client_name, container_number, shipment_master, free_time_end_date,
    excedente_dias, is_renotification, is_cost_statement, test_mode } = params;

  const testBanner = test_mode
    ? `<div style="background:#ffc800;color:#000;text-align:center;padding:8px;font-size:13px;font-weight:bold;">⚠️ E-MAIL DE TESTE — NÃO ENCAMINHAR</div>`
    : '';

  if (is_cost_statement) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#333;">
${testBanner}
<p>Prezado(a) <strong>${client_name || 'Cliente'}</strong>,</p>
<p>Segue em anexo o <strong>Demonstrativo de Cobrança de Demurrage/Detention</strong> referente ao(s) container(s) vinculado(s) ao BL <strong>${shipment_master || 'N/A'}</strong>.</p>
<p>Caso deseje <strong>contestar</strong> os valores apresentados, o prazo é de <strong>48 horas úteis</strong> a partir do recebimento deste e-mail.</p>
<p>Caso não haja manifestação dentro deste prazo, os valores serão considerados aceitos e lançados para faturamento.</p>
<p>Em caso de dúvidas, entre em contato com o seu analista responsável.</p>
${DACHSER_SIGNATURE}
</body></html>`;
  }

  const title = is_renotification ? 'RE-NOTIFICAÇÃO (ALERTA DE FREE TIME)' : 'NOTIFICAÇÃO (ALERTA DE FREE TIME)';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#333;">
${testBanner}
<p><strong>${title}</strong></p>
<p>Prezados(as),</p>
<p>Identificamos que a(s) unidade(s) mencionada(s) abaixo encontra(m)-se com o <strong>free time vencido</strong>.</p>
<ul style="margin:10px 0;">
  <li><strong>Container:</strong> ${container_number || 'N/A'}</li>
  ${shipment_master ? `<li><strong>BL Master:</strong> ${shipment_master}</li>` : ''}
  ${free_time_end_date ? `<li><strong>Free Time Encerrado em:</strong> ${formatDateBR(free_time_end_date)}</li>` : ''}
  ${excedente_dias !== undefined ? `<li><strong>Dias Excedentes:</strong> ${excedente_dias} dia(s)</li>` : ''}
</ul>
<p>Solicitamos o envio da <strong>minuta de devolução</strong> o mais breve possível para evitar custos adicionais de demurrage/detention.</p>
<p>Em caso de dúvidas, entre em contato com o seu analista responsável.</p>
${DACHSER_SIGNATURE}
</body></html>`;
}

function generateDemonstrativoXlsx(params: {
  client_name?: string;
  house_bl?: string;
  partner_id?: string;
  shipment_master?: string;
  origin_port?: string;
  destination_port?: string;
  issue_date?: string;
  exchange_rate?: number;
  total_usd?: number;
  total_brl?: number;
  containers?: ContainerDetail[];
}): string {
  const { client_name, house_bl, partner_id, shipment_master,
    origin_port, destination_port, issue_date,
    exchange_rate, total_usd, total_brl, containers } = params;

  const wb = XLSX.utils.book_new();
  const rows: (string | number | null)[][] = [];

  // Header - Company info
  rows.push(['DACHSER BRASIL LOGISTICA LTDA.']);
  rows.push(['Rua Itororó, 70 – 6º andar – Sala 61, Vila Mathias – Santos/SP – CEP 11015-330']);
  rows.push(['CNPJ: 01.658.446/0008-70']);
  rows.push([]);

  // Title
  rows.push(['DEMONSTRATIVO DE COBRANÇA - DEMURRAGE']);
  rows.push([]);

  // Metadata
  rows.push(['Consignee:', client_name || 'N/A', '', 'Data:', formatDateBR(issue_date || new Date().toISOString())]);
  rows.push(['Partner ID:', partner_id || 'N/A']);
  rows.push(['House BL:', house_bl || 'N/A']);
  rows.push(['Shipment:', shipment_master || 'N/A']);
  rows.push(['Origem:', origin_port || 'N/A', '', 'Destino:', destination_port || 'N/A']);
  rows.push([]);

  // Table header
  rows.push([
    'Container', 'Medida', 'Tipo', 'Descarga', 'Free Time (dias)',
    'Limite Devolução', 'Devolução', 'Dias em Posse', 'Dias Incidentes',
    'Diária USD (1° Per.)', 'Diária USD (2° Per.)', 'Total USD'
  ]);

  // Table data
  const ctrs = containers || [];
  for (const c of ctrs) {
    rows.push([
      c.number || 'N/A',
      c.size || '',
      c.type || '',
      formatDateBR(c.discharge_date),
      c.free_time_days ?? '',
      formatDateBR(c.return_deadline),
      formatDateBR(c.return_date),
      c.days_possession ?? '',
      c.days_incident ?? '',
      c.rate_period1_usd ?? '',
      c.rate_period2_usd ?? '',
      c.total_usd ?? 0,
    ]);
  }

  rows.push([]);

  // Totals
  const computedTotalUsd = total_usd ?? ctrs.reduce((s, c) => s + (c.total_usd || 0), 0);
  const rate = exchange_rate || 1;
  const computedTotalBrl = total_brl ?? (computedTotalUsd * rate);

  rows.push(['', '', '', '', '', '', '', '', '', '', 'TOTAL USD:', computedTotalUsd]);
  rows.push(['', '', '', '', '', '', '', '', '', '', 'TAXA USD:', rate]);
  rows.push(['', '', '', '', '', '', '', '', '', '', 'TOTAL BRL:', computedTotalBrl]);

  rows.push([]);
  rows.push(['Prazo de contestação: 48 horas úteis a partir do recebimento deste demonstrativo.']);
  rows.push(['Caso não haja manifestação dentro deste prazo, os valores serão considerados aceitos e lançados para faturamento.']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Demonstrativo');

  const xlsxBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return xlsxBuffer;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
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
      container_id, container_number, alert_type, recipient_emails,
      client_name, shipment_master, free_time_end_date, excedente_dias,
      expected_cost_usd, risk_score, days_remaining, test_mode,
      house_bl, partner_id, origin_port, destination_port,
      exchange_rate, total_usd, total_brl, containers, issue_date,
    } = body;

    if (!recipient_emails || recipient_emails.length === 0) {
      throw new Error("recipient_emails is required");
    }

    const effectiveAlertType = test_mode ? 'initial_notice' : (alert_type || 'initial_notice');
    const isCostStatement = effectiveAlertType === 'cost_statement' || effectiveAlertType === 'risk_critical' || effectiveAlertType === 'exceeded';
    const isReNotification = effectiveAlertType === 're_notification';

    console.log(`[Demurrage Alert] Sending ${effectiveAlertType} for container ${container_number || container_id}`);

    // Generate email body
    const html = generateNotificationHtml({
      client_name, container_number, shipment_master, free_time_end_date,
      excedente_dias, is_renotification: isReNotification,
      is_cost_statement: isCostStatement, test_mode,
    });

    // Build subject
    const testPrefix = test_mode ? '[TESTE] ' : '';
    let subject: string;
    if (isCostStatement) {
      subject = `${testPrefix}Demonstrativo de Cobrança - Demurrage - ${container_number || shipment_master || 'N/A'}`;
    } else if (isReNotification) {
      subject = `${testPrefix}Re-notificação - Free Time Vencido - ${container_number || 'N/A'}`;
    } else {
      subject = `${testPrefix}Aviso - Free Time Vencido - ${container_number || 'N/A'}`;
    }

    // Build attachments for cost statement
    const attachments: Array<{ filename: string; content: string }> = [];
    if (isCostStatement || (containers && containers.length > 0)) {
      const xlsxBase64 = generateDemonstrativoXlsx({
        client_name, house_bl, partner_id, shipment_master,
        origin_port, destination_port, issue_date,
        exchange_rate, total_usd, total_brl, containers,
      });
      const filename = `Demonstrativo_Demurrage_${(shipment_master || container_number || 'N_A').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      attachments.push({ filename, content: xlsxBase64 });
    }

    const emailPayload: Record<string, unknown> = {
      from: "DACHSER CRONOS <alerts@hermes.z3us.ai>",
      to: recipient_emails,
      subject,
      html,
    };
    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const emailResponse = await resend.emails.send(emailPayload as any);
    const emailSuccess = emailResponse && !('error' in emailResponse);

    // Record alert (skip test mode)
    if (!test_mode) {
      const { error: insertError } = await supabaseClient
        .from('demurrage_alerts')
        .insert({
          container_id: container_id || null,
          alert_type: effectiveAlertType,
          risk_score,
          expected_cost_usd: expected_cost_usd ?? total_usd,
          days_remaining,
          email_sent_to: recipient_emails,
          email_sent_at: new Date().toISOString(),
          email_status: emailSuccess ? 'sent' : 'failed',
        });
      if (insertError) {
        console.error('[Demurrage Alert] Error recording alert:', insertError);
      }
    }

    return new Response(
      JSON.stringify({ status: 'success', message: `Alert sent to ${recipient_emails.length} recipients`, has_attachment: attachments.length > 0 }),
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
