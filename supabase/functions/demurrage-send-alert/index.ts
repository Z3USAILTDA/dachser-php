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
  size?: string;
  type?: string;
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
  alert_type?: string;
  recipient_emails: string[];
  client_name?: string;
  shipment_master?: string;
  free_time_end_date?: string;
  excedente_dias?: number;
  expected_cost_usd?: number;
  risk_score?: number;
  days_remaining?: number;
  test_mode?: boolean;
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

function generateNotificationHtml(testMode?: boolean): string {
  const testBanner = testMode
    ? `<div style="background:#ffc800;color:#000;text-align:center;padding:8px;font-size:13px;font-weight:bold;margin-bottom:16px;">⚠️ E-MAIL DE TESTE — NÃO ENCAMINHAR</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#333;font-size:14px;line-height:1.6;">
${testBanner}
<p><strong>NOTIFICAÇÃO ( ALERTA DE FREE TIME)</strong></p>

<p>Prezados(as),</p>

<p>Identificamos que a(s) unidade(s) mencionada(s) encontra(m)-se com o free time vencido, o que poderá gerar custos adicionais de Demurrage.</p>

<p>Caso a(s) unidade(s) já tenha(m) sido devolvida(s), solicitamos o envio da minuta de devolução para atualização dos registros.</p>

<br/>
<p>Atenciosamente,<br/>
Time Demurrage & Detention<br/>
Air & Sea Logistics Brazil</p>

<p><strong>DACHSER Brasil Logística Ltda.</strong><br/>
Santos Office<br/>
Rua Amador Bueno, 333 – Sl. 1201/1202, Centro<br/>
Santos, SP - 11013-151.</p>
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

  rows.push(['DACHSER BRASIL LOGISTICA LTDA.']);
  rows.push(['Rua Amador Bueno, 333 – Sl. 1201/1202, Centro – Santos/SP – CEP 11013-151']);
  rows.push(['CNPJ: 01.658.446/0008-70']);
  rows.push([]);
  rows.push(['DEMONSTRATIVO DE COBRANÇA - DEMURRAGE']);
  rows.push([]);
  rows.push(['Consignee:', client_name || 'N/A', '', 'Data:', formatDateBR(issue_date || new Date().toISOString())]);
  rows.push(['Partner ID:', partner_id || 'N/A']);
  rows.push(['House BL:', house_bl || 'N/A']);
  rows.push(['Shipment:', shipment_master || 'N/A']);
  rows.push(['Origem:', origin_port || 'N/A', '', 'Destino:', destination_port || 'N/A']);
  rows.push([]);

  rows.push([
    'Container', 'Medida', 'Tipo', 'Descarga', 'Free Time (dias)',
    'Limite Devolução', 'Devolução', 'Dias em Posse', 'Dias Incidentes',
    'Diária USD (1° Per.)', 'Diária USD (2° Per.)', 'Total USD'
  ]);

  const ctrs = containers || [];
  for (const c of ctrs) {
    rows.push([
      c.number || 'N/A', c.size || '', c.type || '',
      formatDateBR(c.discharge_date), c.free_time_days ?? '',
      formatDateBR(c.return_deadline), formatDateBR(c.return_date),
      c.days_possession ?? '', c.days_incident ?? '',
      c.rate_period1_usd ?? '', c.rate_period2_usd ?? '',
      c.total_usd ?? 0,
    ]);
  }

  rows.push([]);
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
  ws['!cols'] = [
    { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Demonstrativo');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
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
      container_id, container_number, recipient_emails,
      client_name, shipment_master, expected_cost_usd, risk_score, days_remaining,
      test_mode, house_bl, partner_id, origin_port, destination_port,
      exchange_rate, total_usd, total_brl, containers, issue_date,
    } = body;

    if (!recipient_emails || recipient_emails.length === 0) {
      throw new Error("recipient_emails is required");
    }

    console.log(`[Demurrage Alert] Sending alert for ${container_number || shipment_master || container_id}, containers: ${(containers || []).length}`);

    // Always use the standard notification text
    const html = generateNotificationHtml(test_mode);

    const testPrefix = test_mode ? '[TESTE] ' : '';
    const subject = `${testPrefix}Notificação - Alerta de Free Time - ${shipment_master || container_number || 'N/A'}`;

    // Generate XLSX attachment
    let attachments: Array<{ filename: string; content: string }> = [];
    try {
      const xlsxBase64 = generateDemonstrativoXlsx({
        client_name, house_bl, partner_id, shipment_master,
        origin_port, destination_port, issue_date,
        exchange_rate, total_usd, total_brl, containers,
      });
      const filename = `Demonstrativo_Demurrage_${(shipment_master || container_number || 'N_A').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      attachments = [{ filename, content: xlsxBase64 }];
      console.log(`[Demurrage Alert] XLSX attachment generated: ${filename}, size: ${xlsxBase64.length} chars`);
    } catch (xlsxErr) {
      console.error('[Demurrage Alert] Failed to generate XLSX:', xlsxErr);
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

    console.log(`[Demurrage Alert] Sending email with ${attachments.length} attachment(s) to ${recipient_emails.join(', ')}`);

    const emailResponse = await resend.emails.send(emailPayload as any);
    const emailSuccess = emailResponse && !('error' in emailResponse);

    console.log(`[Demurrage Alert] Email result:`, JSON.stringify(emailResponse));

    if (!test_mode) {
      const { error: insertError } = await supabaseClient
        .from('demurrage_alerts')
        .insert({
          container_id: container_id || null,
          alert_type: 'cost_statement',
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
