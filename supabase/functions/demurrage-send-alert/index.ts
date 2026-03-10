import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import XLSX from "https://esm.sh/xlsx-js-style@1.2.0";

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
  if (!dateStr) return '';
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

// Style constants
const DARK_BLUE = "003369";
const WHITE_FONT = { color: { rgb: "FFFFFF" } };
const BOLD = { bold: true };
const THIN_BORDER = { style: "thin", color: { rgb: "000000" } };
const ALL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function headerCell(v: string): object {
  return {
    v, t: "s",
    s: {
      font: { ...WHITE_FONT, bold: true, sz: 9 },
      fill: { fgColor: { rgb: DARK_BLUE } },
      border: ALL_BORDERS,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    }
  };
}

function dataCell(v: string | number, fmt?: string): object {
  const isNum = typeof v === "number";
  return {
    v, t: isNum ? "n" : "s",
    s: {
      font: { sz: 9 },
      border: ALL_BORDERS,
      alignment: { horizontal: isNum ? "right" : "center", vertical: "center" },
      ...(fmt ? { numFmt: fmt } : {}),
    }
  };
}

function labelCell(v: string, bold = false): object {
  return {
    v, t: "s",
    s: { font: { sz: 9, bold }, alignment: { horizontal: "left", vertical: "center" } }
  };
}

function valCell(v: string, bold = false): object {
  return {
    v, t: "s",
    s: { font: { sz: 9, bold }, alignment: { horizontal: "left", vertical: "center" } }
  };
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
  const ws: Record<string, unknown> = {};
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];

  // Column widths (A-M = 13 columns)
  ws["!cols"] = [
    { wch: 16 }, // A - Container
    { wch: 10 }, // B - Medida
    { wch: 8 },  // C - Tipo
    { wch: 12 }, // D - Descarga
    { wch: 10 }, // E - Free Time
    { wch: 16 }, // F - Limite Devolução
    { wch: 14 }, // G - Devolução
    { wch: 12 }, // H - Dias em Posse
    { wch: 14 }, // I - Dias Incidêntes
    { wch: 6 },  // J - 1° per qty
    { wch: 12 }, // K - 1° per value
    { wch: 6 },  // L - 2° per qty
    { wch: 12 }, // M - 2° per value
  ];

  let r = 0;

  // Row 0: DACHSER header (left) + Company info (right)
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "DACHSER", t: "s",
    s: { font: { bold: true, sz: 18, color: { rgb: DARK_BLUE } } }
  };
  merges.push({ s: { r, c: 0 }, e: { r: r + 1, c: 3 } });
  
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "DACHSER BRASIL LOGISTICA LTDA", t: "s",
    s: { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: 12 } });
  r++;

  // Row 1: subtitle + address
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "Rua Amador Bueno, 333 – Sl. 1201/1202, Centro", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: 12 } });
  r++;

  // Row 2: Intelligent Logistics + city
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "Intelligent Logistics", t: "s",
    s: { font: { sz: 9, italic: true, color: { rgb: "666666" } } }
  };
  merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
  
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "Santos, SP - 11013-151", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: 12 } });
  r++;

  // Row 3: CNPJ
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "CNPJ NR. 08.996.109/0001-32", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: 12 } });
  r++;

  // Row 4: blank
  r++;

  // Row 5: Title - centered
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "DEMONSTRATIVO DE COBRANÇA - DEMURRAGE", t: "s",
    s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center", vertical: "center" } }
  };
  merges.push({ s: { r, c: 0 }, e: { r, c: 12 } });
  r++;

  // Row 6: blank
  r++;

  // Row 7: Consignee / House BL (with borders)
  const infoBoxStart = r;
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Consignee:", t: "s", s: { font: { bold: true, sz: 9 }, border: { top: THIN_BORDER, left: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: client_name || "", t: "s", s: { font: { sz: 9 }, border: { top: THIN_BORDER } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 5 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "House BL:", t: "s", s: { font: { bold: true, sz: 9 }, border: { top: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: house_bl || "", t: "s", s: { font: { sz: 9 }, border: { top: THIN_BORDER, right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: 12 } });
  r++;

  // Row 8: Partner ID / Shipment
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Partner ID:", t: "s", s: { font: { bold: true, sz: 9 }, border: { left: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: partner_id || "", t: "s", s: { font: { sz: 9 } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 5 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "Shipment:", t: "s", s: { font: { bold: true, sz: 9 } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: shipment_master || "", t: "s", s: { font: { sz: 9 }, border: { right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: 12 } });
  r++;

  // Row 9: Origem / Destino / Data
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Origem:", t: "s", s: { font: { bold: true, sz: 9 }, border: { left: THIN_BORDER, bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: origin_port || "", t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: "Destino:", t: "s", s: { font: { bold: true, sz: 9 }, border: { bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: destination_port || "", t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER } } };
  merges.push({ s: { r, c: 5 }, e: { r, c: 6 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "Data:", t: "s", s: { font: { bold: true, sz: 9 }, border: { bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: formatDateBR(issue_date || new Date().toISOString()), t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER, right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: 12 } });
  r++;

  // Row 10: blank
  r++;

  // Row 11-12: Table header (two rows with merged "VALOR DIÁRIA USD")
  const hdrRow1 = r;
  // First header row
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = headerCell("CONTAINER");
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = headerCell("MEDIDA");
  ws[XLSX.utils.encode_cell({ r, c: 2 })] = headerCell("TIPO");
  ws[XLSX.utils.encode_cell({ r, c: 3 })] = headerCell("DESCARGA");
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = headerCell("FREE TIME");
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = headerCell("LIMITE DE DEVOLUÇÃO");
  ws[XLSX.utils.encode_cell({ r, c: 6 })] = headerCell("DEVOLUÇÃO");
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = headerCell("DIAS EM POSSE");
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = headerCell("DIAS INCIDÊNTES");
  // "VALOR DIÁRIA USD" spans J-M (cols 9-12)
  ws[XLSX.utils.encode_cell({ r, c: 9 })] = headerCell("VALOR DIÁRIA USD");
  merges.push({ s: { r, c: 9 }, e: { r, c: 12 } });

  // Merge header cells that span 2 rows (A-I)
  for (let c = 0; c <= 8; c++) {
    merges.push({ s: { r: hdrRow1, c }, e: { r: hdrRow1 + 1, c } });
  }
  r++;

  // Second header row: sub-headers for VALOR DIÁRIA USD
  ws[XLSX.utils.encode_cell({ r, c: 9 })] = headerCell("1° PERÍODO");
  merges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  ws[XLSX.utils.encode_cell({ r, c: 11 })] = headerCell("2° PERÍODO");
  merges.push({ s: { r, c: 11 }, e: { r, c: 12 } });
  r++;

  // Data rows
  const ctrs = containers || [];
  for (const c of ctrs) {
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = dataCell(c.number || "N/A");
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = dataCell(c.size || "");
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = dataCell(c.type || "");
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = dataCell(formatDateBR(c.discharge_date));
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = dataCell(c.free_time_days ?? 0);
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = dataCell(formatDateBR(c.return_deadline));
    ws[XLSX.utils.encode_cell({ r, c: 6 })] = dataCell(formatDateBR(c.return_date));
    ws[XLSX.utils.encode_cell({ r, c: 7 })] = dataCell(c.days_possession ?? 0);
    ws[XLSX.utils.encode_cell({ r, c: 8 })] = dataCell(c.days_incident ?? 0);
    // 1° Período: qty + value
    ws[XLSX.utils.encode_cell({ r, c: 9 })] = dataCell(c.days_incident ?? 0);
    ws[XLSX.utils.encode_cell({ r, c: 10 })] = dataCell(c.rate_period1_usd ?? 0, "#,##0.00");
    // 2° Período: qty + value
    ws[XLSX.utils.encode_cell({ r, c: 11 })] = dataCell(0);
    ws[XLSX.utils.encode_cell({ r, c: 12 })] = dataCell(c.rate_period2_usd ?? 0, "#,##0.00");
    r++;
  }

  // Blank row
  r++;

  // Totals
  const computedTotalUsd = total_usd ?? ctrs.reduce((s, c) => s + (c.total_usd || 0), 0);
  const rate = exchange_rate || 1;
  const computedTotalBrl = total_brl ?? (computedTotalUsd * rate);

  const totalLabelStyle = { font: { bold: true, sz: 10 }, alignment: { horizontal: "right" as const } };
  const totalValueStyle = { font: { bold: true, sz: 10 }, alignment: { horizontal: "right" as const }, numFmt: "#,##0.00" };

  ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: "TOTAL USD =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: 10 }, e: { r, c: 11 } });
  ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: computedTotalUsd, t: "n", s: totalValueStyle };
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: "TAXA USD =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: 10 }, e: { r, c: 11 } });
  ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: rate, t: "n", s: totalValueStyle };
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: "TOTAL BRL =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: 10 }, e: { r, c: 11 } });
  ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: computedTotalBrl, t: "n", s: totalValueStyle };
  r++;

  // Blank row
  r++;

  // Footer - contestation text (with border box)
  const footerText = "Após o recebimento deste demonstrativo de cobrança, concedemos um prazo de 48 horas úteis para eventuais contestações, mediante apresentação de evidências. Caso não haja manifestação dentro deste período, procederemos com o faturamento e a emissão da Nota de Débito correspondente ao valor informado.";
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: footerText, t: "s",
    s: { font: { sz: 9 }, alignment: { wrapText: true, vertical: "top" }, border: ALL_BORDERS }
  };
  merges.push({ s: { r, c: 0 }, e: { r: r + 2, c: 12 } });
  // Set row heights for footer
  if (!ws["!rows"]) ws["!rows"] = [];
  (ws["!rows"] as Array<{ hpt?: number }>)[r] = { hpt: 50 };

  // Set range
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: 12 } });
  ws["!merges"] = merges;

  XLSX.utils.book_append_sheet(wb, ws, "Demonstrativo");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
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

    console.log(`[Demurrage Alert] Sending alert, containers: ${(containers || []).length}`);

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
      console.log(`[Demurrage Alert] XLSX generated: ${filename} (${xlsxBase64.length} chars)`);
    } catch (xlsxErr) {
      console.error('[Demurrage Alert] XLSX generation failed:', xlsxErr);
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

    console.log(`[Demurrage Alert] Sending with ${attachments.length} attachment(s)`);
    const emailResponse = await resend.emails.send(emailPayload as any);
    const emailSuccess = emailResponse && !('error' in emailResponse);
    console.log(`[Demurrage Alert] Result:`, JSON.stringify(emailResponse));

    if (!test_mode) {
      await supabaseClient.from('demurrage_alerts').insert({
        container_id: container_id || null,
        alert_type: 'cost_statement',
        risk_score,
        expected_cost_usd: expected_cost_usd ?? total_usd,
        days_remaining,
        email_sent_to: recipient_emails,
        email_sent_at: new Date().toISOString(),
        email_status: emailSuccess ? 'sent' : 'failed',
      });
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
