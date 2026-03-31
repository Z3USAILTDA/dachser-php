import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import XLSX from "https://esm.sh/xlsx-js-style@1.2.0";
import mysql from "npm:mysql2/promise";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContainerDetail {
  number: string;
  size?: string;
  type?: string;
  armador?: string;
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

interface RateRow {
  armador: string;
  container_type: string;
  rate_usd: number;
  period_start_day: number;
  period_end_day: number;
}

interface PeriodData {
  days: number;
  rate: number;
  value: number;
}

function formatDateBR(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(dateStr); }
}

function generateNotificationHtml(params: { testMode?: boolean; client_name?: string; house_bl?: string; shipment_master?: string }): string {
  const { testMode, client_name, house_bl, shipment_master } = params;
  const testBanner = testMode
    ? `<div style="background:#ffc800;color:#000;text-align:center;padding:8px;font-size:13px;font-weight:bold;margin-bottom:16px;">⚠️ E-MAIL DE TESTE — NÃO ENCAMINHAR</div>`
    : '';

  const detalhamento = `<table style="border-collapse:collapse;margin:12px 0;font-size:13px;">
<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Cliente:</td><td>${client_name || 'N/A'}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">House BL:</td><td>${house_bl || 'N/A'}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">MBL:</td><td>${shipment_master || 'N/A'}</td></tr>
</table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#333;font-size:14px;line-height:1.6;">
${testBanner}
<p>Prezados(as),</p>

<p>Identificamos custos de D&amp;D – Sobreestadia de Contêineres referentes ao(s) embarque(s) mencionado(s) abaixo:</p>

${detalhamento}

<p>Caso haja alguma divergência, solicitamos que seja sinalizada com a devida evidência no prazo de 48 horas a contar desta data.<br/>
Após este período, os custos serão considerados válidos e será emitida Nota de Débito para pagamento.</p>

<br/>
<p>Atenciosamente,</p>

<p>Time Demurrage &amp; Detention<br/>
Air &amp; Sea Logistics Brazil</p>

<p><strong>DACHSER Brasil Logística Ltda.</strong><br/>
Santos Office<br/>
Rua Amador Bueno, 333 – Sl. 1201/1202, Centro<br/>
Santos, SP - 11013-151.</p>
</body></html>`;
}

// Style constants
const DARK_BLUE = "003369";
const WHITE_FONT = { color: { rgb: "FFFFFF" } };
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

async function fetchRatesFromMariaDB(): Promise<RateRow[]> {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: Deno.env.get("MARIADB_HOST"),
      port: Number(Deno.env.get("MARIADB_PORT") || "3306"),
      user: Deno.env.get("MARIADB_USER"),
      password: Deno.env.get("MARIADB_PASSWORD"),
      database: Deno.env.get("MARIADB_DATABASE"),
      connectTimeout: 10000,
    });
    const [rows] = await conn.execute(
      `SELECT armador, container_type, rate_usd, period_start_day, period_end_day 
       FROM t_dachser_demurrage_rates 
       WHERE active = 1 
       ORDER BY armador, container_type, period_start_day`
    );
    return (rows as RateRow[]) || [];
  } catch (err) {
    console.error('[Demurrage Alert] MariaDB rates fetch failed:', err);
    return [];
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

function calculatePeriods(daysIncident: number, armador: string, containerType: string, allRates: RateRow[]): PeriodData[] {
  // Find matching rates for this armador + container_type
  const matchingRates = allRates.filter(r =>
    r.armador?.toLowerCase() === 'dachser' &&
    r.container_type?.toLowerCase() === containerType?.toLowerCase()
  );

  if (matchingRates.length === 0 || daysIncident <= 0) return [];

  const periods: PeriodData[] = [];
  let remaining = daysIncident;

  for (const rate of matchingRates) {
    if (remaining <= 0) break;
    const periodLength = (rate.period_end_day || 9999) - (rate.period_start_day || 1) + 1;
    const daysInPeriod = Math.min(remaining, periodLength);
    periods.push({
      days: daysInPeriod,
      rate: rate.rate_usd,
      value: daysInPeriod * rate.rate_usd,
    });
    remaining -= daysInPeriod;
  }

  return periods;
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
  containerPeriods?: Map<string, PeriodData[]>;
  maxPeriods?: number;
}): string {
  const { client_name, house_bl, partner_id, shipment_master,
    origin_port, destination_port, issue_date,
    exchange_rate, total_usd, total_brl, containers,
    containerPeriods, maxPeriods: rawMaxPeriods } = params;

  const numPeriods = Math.max(rawMaxPeriods || 2, 2);
  // Each period uses 2 columns (qty + value)
  const periodColStart = 9;
  const totalCols = periodColStart + numPeriods * 2; // last col index = totalCols - 1
  const lastCol = totalCols - 1;

  const wb = XLSX.utils.book_new();
  const ws: Record<string, unknown> = {};
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];

  // Column widths
  const cols = [
    { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  for (let p = 0; p < numPeriods; p++) {
    cols.push({ wch: 6 }, { wch: 12 });
  }
  ws["!cols"] = cols;

  let r = 0;

  // Row 0: DACHSER header
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "DACHSER", t: "s",
    s: { font: { bold: true, sz: 18, color: { rgb: DARK_BLUE } } }
  };
  merges.push({ s: { r, c: 0 }, e: { r: r + 1, c: 3 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "DACHSER BRASIL LOGISTICA LTDA", t: "s",
    s: { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: lastCol } });
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "Rua Amador Bueno, 333 – Sl. 1201/1202, Centro", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: lastCol } });
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "Intelligent Logistics", t: "s",
    s: { font: { sz: 9, italic: true, color: { rgb: "666666" } } }
  };
  merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "Santos, SP - 11013-151", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: lastCol } });
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 7 })] = {
    v: "CNPJ NR. 08.996.109/0001-32", t: "s",
    s: { font: { sz: 8, italic: true }, alignment: { horizontal: "right" } }
  };
  merges.push({ s: { r, c: 7 }, e: { r, c: lastCol } });
  r++;

  r++; // blank

  // Title
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: "DEMONSTRATIVO DE COBRANÇA - DEMURRAGE", t: "s",
    s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center", vertical: "center" } }
  };
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r++;
  r++; // blank

  // Info box
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Consignee:", t: "s", s: { font: { bold: true, sz: 9 }, border: { top: THIN_BORDER, left: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: client_name || "", t: "s", s: { font: { sz: 9 }, border: { top: THIN_BORDER } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 5 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "House BL:", t: "s", s: { font: { bold: true, sz: 9 }, border: { top: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: house_bl || "", t: "s", s: { font: { sz: 9 }, border: { top: THIN_BORDER, right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: lastCol } });
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Partner ID:", t: "s", s: { font: { bold: true, sz: 9 }, border: { left: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: partner_id || "", t: "s", s: { font: { sz: 9 } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 5 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "Shipment:", t: "s", s: { font: { bold: true, sz: 9 } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: shipment_master || "", t: "s", s: { font: { sz: 9 }, border: { right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: lastCol } });
  r++;

  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: "Origem:", t: "s", s: { font: { bold: true, sz: 9 }, border: { left: THIN_BORDER, bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: origin_port || "", t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER } } };
  merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: "Destino:", t: "s", s: { font: { bold: true, sz: 9 }, border: { bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: destination_port || "", t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER } } };
  merges.push({ s: { r, c: 5 }, e: { r, c: 6 } });
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: "Data:", t: "s", s: { font: { bold: true, sz: 9 }, border: { bottom: THIN_BORDER } } };
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: formatDateBR(issue_date || new Date().toISOString()), t: "s", s: { font: { sz: 9 }, border: { bottom: THIN_BORDER, right: THIN_BORDER } } };
  merges.push({ s: { r, c: 8 }, e: { r, c: lastCol } });
  r++;

  r++; // blank

  // Table header row 1
  const hdrRow1 = r;
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = headerCell("CONTAINER");
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = headerCell("MEDIDA");
  ws[XLSX.utils.encode_cell({ r, c: 2 })] = headerCell("TIPO");
  ws[XLSX.utils.encode_cell({ r, c: 3 })] = headerCell("DESCARGA");
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = headerCell("FREE TIME");
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = headerCell("LIMITE DE DEVOLUÇÃO");
  ws[XLSX.utils.encode_cell({ r, c: 6 })] = headerCell("DEVOLUÇÃO");
  ws[XLSX.utils.encode_cell({ r, c: 7 })] = headerCell("DIAS EM POSSE");
  ws[XLSX.utils.encode_cell({ r, c: 8 })] = headerCell("DIAS INCIDÊNTES");

  // "VALOR DIÁRIA USD" spans all period columns
  ws[XLSX.utils.encode_cell({ r, c: periodColStart })] = headerCell("VALOR DIÁRIA USD");
  merges.push({ s: { r, c: periodColStart }, e: { r, c: lastCol } });

  // Merge header cells A-I spanning 2 rows
  for (let c = 0; c <= 8; c++) {
    merges.push({ s: { r: hdrRow1, c }, e: { r: hdrRow1 + 1, c } });
  }
  r++;

  // Table header row 2: period sub-headers
  for (let p = 0; p < numPeriods; p++) {
    const colStart = periodColStart + p * 2;
    ws[XLSX.utils.encode_cell({ r, c: colStart })] = headerCell(`${p + 1}° PERÍODO`);
    merges.push({ s: { r, c: colStart }, e: { r, c: colStart + 1 } });
  }
  r++;

  // Data rows
  const ctrs = containers || [];
  let computedTotalUsd = 0;

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

    // Fill period columns from calculated data
    const periods = containerPeriods?.get(c.number) || [];
    let containerTotal = 0;

    for (let p = 0; p < numPeriods; p++) {
      const colStart = periodColStart + p * 2;
      if (p < periods.length) {
        ws[XLSX.utils.encode_cell({ r, c: colStart })] = dataCell(periods[p].days);
        ws[XLSX.utils.encode_cell({ r, c: colStart + 1 })] = dataCell(periods[p].rate, "#,##0.00");
        containerTotal += periods[p].value;
      } else {
        ws[XLSX.utils.encode_cell({ r, c: colStart })] = dataCell(0);
        ws[XLSX.utils.encode_cell({ r, c: colStart + 1 })] = dataCell(0, "#,##0.00");
      }
    }
    computedTotalUsd += containerTotal > 0 ? containerTotal : (c.total_usd || 0);
    r++;
  }

  r++; // blank

  // Totals
  const finalTotalUsd = total_usd ?? computedTotalUsd;
  const rate = exchange_rate || 1;
  const computedTotalBrl = total_brl ?? (finalTotalUsd * rate);

  const totalLabelStyle = { font: { bold: true, sz: 10 }, alignment: { horizontal: "right" as const } };
  const totalValueStyle = { font: { bold: true, sz: 10 }, alignment: { horizontal: "right" as const }, numFmt: "#,##0.00" };

  const labelCol = lastCol - 2;
  ws[XLSX.utils.encode_cell({ r, c: labelCol })] = { v: "TOTAL USD =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: labelCol }, e: { r, c: lastCol - 1 } });
  ws[XLSX.utils.encode_cell({ r, c: lastCol })] = { v: finalTotalUsd, t: "n", s: totalValueStyle };
  r++;

  ws[XLSX.utils.encode_cell({ r, c: labelCol })] = { v: "TAXA USD =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: labelCol }, e: { r, c: lastCol - 1 } });
  ws[XLSX.utils.encode_cell({ r, c: lastCol })] = { v: rate, t: "n", s: totalValueStyle };
  r++;

  ws[XLSX.utils.encode_cell({ r, c: labelCol })] = { v: "TOTAL BRL =", t: "s", s: totalLabelStyle };
  merges.push({ s: { r, c: labelCol }, e: { r, c: lastCol - 1 } });
  ws[XLSX.utils.encode_cell({ r, c: lastCol })] = { v: computedTotalBrl, t: "n", s: totalValueStyle };
  r++;

  r++; // blank

  // Footer
  const footerText = "Após o recebimento deste demonstrativo de cobrança, concedemos um prazo de 48 horas úteis para eventuais contestações, mediante apresentação de evidências. Caso não haja manifestação dentro deste período, procederemos com o faturamento e a emissão da Nota de Débito correspondente ao valor informado.";
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = {
    v: footerText, t: "s",
    s: { font: { sz: 9 }, alignment: { wrapText: true, vertical: "top" }, border: ALL_BORDERS }
  };
  merges.push({ s: { r, c: 0 }, e: { r: r + 2, c: lastCol } });
  if (!ws["!rows"]) ws["!rows"] = [];
  (ws["!rows"] as Array<{ hpt?: number }>)[r] = { hpt: 50 };

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: lastCol } });
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

    // Fetch configured rates from MariaDB
    const allRates = await fetchRatesFromMariaDB();
    console.log(`[Demurrage Alert] Fetched ${allRates.length} rate rows from MariaDB`);

    // Calculate periods per container using configured rates
    const containerPeriods = new Map<string, PeriodData[]>();
    let maxPeriods = 2;

    for (const c of (containers || [])) {
      const daysIncident = c.days_incident || 0;
      const armador = c.armador || '';
      const containerType = c.size || '';

      const periods = calculatePeriods(daysIncident, armador, containerType, allRates);

      if (periods.length === 0 && daysIncident > 0) {
        // Fallback: use the rate_period1_usd passed from client
        containerPeriods.set(c.number, [{
          days: daysIncident,
          rate: c.rate_period1_usd || 0,
          value: daysIncident * (c.rate_period1_usd || 0),
        }]);
      } else {
        containerPeriods.set(c.number, periods);
      }

      maxPeriods = Math.max(maxPeriods, containerPeriods.get(c.number)!.length);
    }

    console.log(`[Demurrage Alert] Max periods detected: ${maxPeriods}`);

    const html = generateNotificationHtml(test_mode);
    const testPrefix = test_mode ? '[TESTE] ' : '';
    const subject = `${testPrefix}Notificação de Cobrança - ${shipment_master || container_number || 'N/A'}`;

    // Generate XLSX attachment
    let attachments: Array<{ filename: string; content: string }> = [];
    try {
      const xlsxBase64 = generateDemonstrativoXlsx({
        client_name, house_bl, partner_id, shipment_master,
        origin_port, destination_port, issue_date,
        exchange_rate, total_usd, total_brl, containers,
        containerPeriods, maxPeriods,
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
