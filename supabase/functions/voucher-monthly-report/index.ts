import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import XLSX from "https://esm.sh/xlsx-js-style@1.2.0?target=deno&no-check";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles que recebem o relatório mensal consolidado.
// Destinatários resolvidos dinamicamente em t_users_dachser (esteira_active=1).
const REPORT_ROLES = ["SUPERVISOR", "GESTOR_SUPERVISOR", "FINANCEIRO", "GESTOR_FINANCEIRO", "ADMIN"];

const SEGMENT_EXTRA_EMAILS: Record<string, string[]> = {
  FISCAL: ["marta.silva@dachser.com"],
  OPERACAO: ["cleiciane.faconi@dachser.com", "luciana.vulcano@dachser.com"],
  SUPERVISOR: [],
  FINANCEIRO: [],
};

const SEGMENT_ROLES: Record<string, string[]> = {
  FISCAL: ["FISCAL", "GESTOR_FISCAL"],
  OPERACAO: ["OPERACAO", "GESTOR_OPERACAO"],
  SUPERVISOR: ["SUPERVISOR", "GESTOR_SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "GESTOR_FINANCEIRO"],
};

const SEGMENT_STAGE_FILTER: Record<string, string[]> = {
  FISCAL: ["FISCAL", "AJUSTE_FISCAL"],
  OPERACAO: ["OPERACAO", "AJUSTE_OPERACAO"],
  SUPERVISOR: ["SUPERVISOR"],
  FINANCEIRO: ["FINANCEIRO", "ROBO"],
};

const SEGMENT_LABELS: Record<string, string> = {
  FISCAL: "Fiscal",
  OPERACAO: "Operação",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
};

const etapaLabel: Record<string, string> = {
  OPERACAO: "Operação",
  AJUSTE_OPERACAO: "Ajuste Operação",
  FISCAL: "Fiscal",
  AJUSTE_FISCAL: "Ajuste Fiscal",
  SUPERVISOR: "Supervisor",
  FINANCEIRO: "Financeiro",
  ROBO: "Robô",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

const formatBRL = (val: number) =>
  `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatBRLCompact = (val: number) => {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return `R$ ${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

const formatDateBR = (d: string | Date | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
};

const formatDateTimeBR = (d: string | Date | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const daysBetween = (d: string | Date | null) => {
  if (!d) return 0;
  const diff = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

interface Kpis {
  totalQtd: number;
  totalValor: number;
  concluidosQtd: number;
  concluidosValor: number;
  emAbertoQtd: number;
  emAbertoValor: number;
}

function computeKpis(concluidos: any[], emAndamento: any[]): Kpis {
  const sumValor = (arr: any[]) => arr.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const concluidosValor = sumValor(concluidos);
  const emAbertoValor = sumValor(emAndamento);
  return {
    totalQtd: concluidos.length + emAndamento.length,
    totalValor: concluidosValor + emAbertoValor,
    concluidosQtd: concluidos.length,
    concluidosValor,
    emAbertoQtd: emAndamento.length,
    emAbertoValor,
  };
}

// ============ EMAIL HTML ============
function buildHtml(monthLabel: string, kpis: Kpis, segmentLabel: string | null): string {
  const monthCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const subtitle = segmentLabel ? `${monthCap} · ${SEGMENT_LABELS[segmentLabel] || segmentLabel}` : `${monthCap} · Completo`;
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const kpiCard = (label: string, qtd: number, valor: number) => `
    <td width="33%" valign="top" style="padding:0 6px;">
      <div style="border:1px solid #E5E7EB;border-radius:10px;padding:18px 12px;text-align:center;background:#FFFFFF;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6B7280;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif;">${label}</div>
        <div style="font-size:28px;font-weight:700;color:#F5B843;font-family:Arial,Helvetica,sans-serif;line-height:1;">${qtd}</div>
        <div style="font-size:13px;color:#374151;margin-top:6px;font-family:Arial,Helvetica,sans-serif;">${formatBRLCompact(valor)}</div>
      </div>
    </td>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F5F7;padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#050608;letter-spacing:1px;font-family:Arial,Helvetica,sans-serif;">Z3US<span style="color:#F5B843;">.AI</span></div>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#F5B843;font-family:Arial,Helvetica,sans-serif;">Relatório Mensal de Vouchers</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">${subtitle}</p>
        </td></tr>
        <tr><td style="padding:24px 26px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${kpiCard("Total", kpis.totalQtd, kpis.totalValor)}
              ${kpiCard("Concluídos", kpis.concluidosQtd, kpis.concluidosValor)}
              ${kpiCard("Em Aberto", kpis.emAbertoQtd, kpis.emAbertoValor)}
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;text-align:center;">
          <p style="margin:0;font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;">Detalhamento completo no anexo Excel.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px;text-align:center;">
          <a href="https://dachser.z3us.app/" style="display:inline-block;background:#F5B843;color:#050608;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Acessar Esteira</a>
        </td></tr>
        <tr><td style="padding:28px 32px 24px;text-align:center;border-top:1px solid #F1F2F4;margin-top:20px;">
          <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">Relatório automático · gerado em ${generatedAt}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">© Z3US.AI</p>
    </td></tr>
  </table>
</body></html>`;
}

// ============ XLSX BUILDER ============
const XLSX_COLORS = {
  headerFill: { fgColor: { rgb: "F5B843" } },
  headerFont: { bold: true, sz: 12, color: { rgb: "050608" } },
  zebra: { fgColor: { rgb: "F5F5F5" } },
  white: { fgColor: { rgb: "FFFFFF" } },
  urgent: { fgColor: { rgb: "FFE5E5" } },
  totalRow: { fgColor: { rgb: "FCE9C0" } },
  border: {
    top: { style: "thin", color: { rgb: "CCCCCC" } },
    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
    left: { style: "thin", color: { rgb: "CCCCCC" } },
    right: { style: "thin", color: { rgb: "CCCCCC" } },
  },
};

function styleHeader(ws: any, row: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: row, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    ws[addr].s = {
      fill: XLSX_COLORS.headerFill,
      font: XLSX_COLORS.headerFont,
      alignment: { horizontal: "center", vertical: "center" },
      border: XLSX_COLORS.border,
    };
  }
}

function styleDataRow(ws: any, row: number, colCount: number, opts: { urgent?: boolean; alternate?: boolean; total?: boolean } = {}) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: row, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: opts.total
        ? XLSX_COLORS.totalRow
        : opts.urgent
        ? XLSX_COLORS.urgent
        : opts.alternate
        ? XLSX_COLORS.zebra
        : XLSX_COLORS.white,
      font: { sz: 10, bold: !!(opts.urgent || opts.total) },
      alignment: { horizontal: c === 0 ? "center" : "left", vertical: "center" },
      border: XLSX_COLORS.border,
    };
  }
}

function buildXlsxBuffer(
  monthLabel: string,
  segmentLabel: string | null,
  kpis: Kpis,
  concluidos: any[],
  emAndamento: any[],
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const monthCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const scopeLabel = segmentLabel ? SEGMENT_LABELS[segmentLabel] || segmentLabel : "Completo";

  // ---- ABA 1: Resumo ----
  const stageAgg: Record<string, { qtd: number; valor: number }> = {};
  const allForStage = [...concluidos, ...emAndamento];
  for (const v of allForStage) {
    const e = v.etapa_atual || "DESCONHECIDO";
    if (!stageAgg[e]) stageAgg[e] = { qtd: 0, valor: 0 };
    stageAgg[e].qtd += 1;
    stageAgg[e].valor += Number(v.valor) || 0;
  }

  const resumoRows: any[][] = [
    [`Relatório Mensal de Vouchers — ${monthCap} · ${scopeLabel}`],
    [],
    ["Indicador", "Quantidade", "Valor (BRL)"],
    ["Total", kpis.totalQtd, kpis.totalValor],
    ["Concluídos", kpis.concluidosQtd, kpis.concluidosValor],
    ["Em Aberto", kpis.emAbertoQtd, kpis.emAbertoValor],
    [],
    ["Resumo por Etapa"],
    ["Etapa", "Quantidade", "Valor (BRL)"],
  ];
  const stageKeys = Object.keys(stageAgg);
  for (const k of stageKeys) {
    resumoRows.push([etapaLabel[k] || k, stageAgg[k].qtd, stageAgg[k].valor]);
  }
  resumoRows.push(["TOTAL", kpis.totalQtd, kpis.totalValor]);

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  // Styling
  // Title
  if (wsResumo["A1"]) wsResumo["A1"].s = { font: { bold: true, sz: 14, color: { rgb: "050608" } } };
  // KPI header (row 3 idx 2)
  styleHeader(wsResumo, 2, 3);
  // KPI rows 3-5
  for (let r = 3; r <= 5; r++) styleDataRow(wsResumo, r, 3, { alternate: r % 2 === 0 });
  // Subtitle row 7 idx
  if (wsResumo["A8"]) wsResumo["A8"].s = { font: { bold: true, sz: 12, color: { rgb: "050608" } } };
  // Stage header row 8 idx
  styleHeader(wsResumo, 8, 3);
  // Stage data
  for (let i = 0; i < stageKeys.length; i++) {
    styleDataRow(wsResumo, 9 + i, 3, { alternate: i % 2 === 0 });
  }
  // Total row
  styleDataRow(wsResumo, 9 + stageKeys.length, 3, { total: true });

  // BRL number format on value cols
  for (let r = 3; r <= 5; r++) {
    const a = XLSX.utils.encode_cell({ r, c: 2 });
    if (wsResumo[a]) { wsResumo[a].t = "n"; wsResumo[a].z = '"R$ "#,##0.00'; }
  }
  for (let i = 0; i <= stageKeys.length; i++) {
    const a = XLSX.utils.encode_cell({ r: 9 + i, c: 2 });
    if (wsResumo[a]) { wsResumo[a].t = "n"; wsResumo[a].z = '"R$ "#,##0.00'; }
  }

  wsResumo["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 20 }];
  wsResumo["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 7, c: 0 }, e: { r: 7, c: 2 } },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // ---- ABA 2: Concluídos ----
  const concHeader = ["Nº SPO", "Fornecedor", "Valor", "Moeda", "Vencimento", "Etapa Final", "Status Baixa", "Concluído em"];
  const concData = concluidos.map((v) => [
    v.numero_spo || "-",
    v.fornecedor || "-",
    Number(v.valor) || 0,
    v.moeda || "BRL",
    formatDateBR(v.vencimento),
    etapaLabel[v.etapa_atual] || v.etapa_atual,
    v.status_baixa || "PENDENTE",
    formatDateBR(v.updated_at),
  ]);
  const wsConc = XLSX.utils.aoa_to_sheet([concHeader, ...concData]);
  styleHeader(wsConc, 0, concHeader.length);
  for (let i = 0; i < concData.length; i++) {
    styleDataRow(wsConc, i + 1, concHeader.length, { urgent: !!concluidos[i]?.urgente, alternate: i % 2 === 0 });
    const valAddr = XLSX.utils.encode_cell({ r: i + 1, c: 2 });
    if (wsConc[valAddr]) { wsConc[valAddr].t = "n"; wsConc[valAddr].z = '#,##0.00'; }
  }
  wsConc["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  wsConc["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  wsConc["!rows"] = [{ hpt: 24 }];
  XLSX.utils.book_append_sheet(wb, wsConc, "Concluídos");

  // ---- ABA 3: Em Andamento ----
  const andHeader = ["Nº SPO", "Fornecedor", "Valor", "Moeda", "Vencimento", "Etapa Atual", "Dias na Etapa", "Urgente"];
  const andData = emAndamento.map((v) => [
    v.numero_spo || "-",
    v.fornecedor || "-",
    Number(v.valor) || 0,
    v.moeda || "BRL",
    formatDateBR(v.vencimento),
    etapaLabel[v.etapa_atual] || v.etapa_atual,
    daysBetween(v.updated_at),
    v.urgente ? "Sim" : "Não",
  ]);
  const wsAnd = XLSX.utils.aoa_to_sheet([andHeader, ...andData]);
  styleHeader(wsAnd, 0, andHeader.length);
  for (let i = 0; i < andData.length; i++) {
    styleDataRow(wsAnd, i + 1, andHeader.length, { urgent: !!emAndamento[i]?.urgente, alternate: i % 2 === 0 });
    const valAddr = XLSX.utils.encode_cell({ r: i + 1, c: 2 });
    if (wsAnd[valAddr]) { wsAnd[valAddr].t = "n"; wsAnd[valAddr].z = '#,##0.00'; }
  }
  wsAnd["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  wsAnd["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  wsAnd["!rows"] = [{ hpt: 24 }];
  XLSX.utils.book_append_sheet(wb, wsAnd, "Em Andamento");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  return new Uint8Array(out);
}

function xlsxFilename(monthLabel: string, segmentLabel: string | null): string {
  const slug = monthLabel.replace(/\s+/g, "_").replace(/[^\w]/g, "");
  const seg = segmentLabel ? `_${segmentLabel}` : "";
  return `Relatorio_Vouchers${seg}_${slug}.xlsx`;
}

async function sendEmail(
  apiKey: string,
  to: string[],
  subject: string,
  html: string,
  attachment: { filename: string; content: string },
): Promise<any> {
  if (to.length === 0) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: "Dachser Z3US <noreply@hermes.z3us.ai>",
      to,
      subject,
      html,
      attachments: [attachment],
    }),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  let testEmail: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body.testEmail === "string" && body.testEmail.includes("@")) {
        testEmail = body.testEmail.trim();
      }
    }
  } catch (_) {}

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    const host = Deno.env.get("MARIADB_FIN_HOST");
    const port = parseInt(Deno.env.get("MARIADB_FIN_PORT") || "3306");
    const database = Deno.env.get("MARIADB_FIN_DATABASE");
    const username = Deno.env.get("MARIADB_FIN_USER");
    const password = Deno.env.get("MARIADB_FIN_PASSWORD");
    if (!host || !database || !username || !password) {
      throw new Error("MariaDB credentials not configured");
    }

    client = await new Client().connect({ hostname: host, port, db: database, username, password });

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const monthStart = `${formatDate(firstDayLastMonth)} 00:00:00`;
    const monthEndExclusive = `${formatDate(firstDayThisMonth)} 00:00:00`;
    const monthLabel = firstDayLastMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    console.log(`Generating monthly report for ${monthLabel}`);

    const concluidosFull = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at,
              status_baixa, urgente
       FROM t_vouchers
       WHERE etapa_atual = 'CONCLUIDO' AND updated_at >= ? AND updated_at < ?
       ORDER BY updated_at DESC`,
      [monthStart, monthEndExclusive],
    );
    const emAndamentoFull = await client.query(
      `SELECT id, numero_spo, fornecedor, valor, moeda, etapa_atual, vencimento, updated_at,
              status_baixa, urgente
       FROM t_vouchers
       WHERE etapa_atual NOT IN ('CONCLUIDO', 'A_PROCESSAR', 'CANCELADO')
       ORDER BY etapa_atual, updated_at DESC`,
    );

    const sentSummary: Record<string, any> = {};

    // 1) FULL REPORT
    const kpisFull = computeKpis(concluidosFull, emAndamentoFull);
    const fullHtml = buildHtml(monthLabel, kpisFull, null);
    const fullXlsx = buildXlsxBuffer(monthLabel, null, kpisFull, concluidosFull, emAndamentoFull);
    const fullAttachment = { filename: xlsxFilename(monthLabel, null), content: encodeBase64(fullXlsx) };
    const fullSubjectBase = `Relatório Mensal de Vouchers — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
    const fullSubject = testEmail ? `[TESTE] ${fullSubjectBase}` : fullSubjectBase;
    // Resolve destinatários do relatório completo dinamicamente em t_users_dachser
    let fullRecipients: string[] = [];
    if (testEmail) {
      fullRecipients = [testEmail];
    } else {
      try {
        const roleConditions = REPORT_ROLES.map(() => `FIND_IN_SET(?, REPLACE(esteira_role, ' ', ''))`).join(" OR ");
        const rows = await client.query(
          `SELECT DISTINCT email FROM ai_agente.t_users_dachser
           WHERE esteira_active = 1 AND email IS NOT NULL AND email != '' AND (${roleConditions})`,
          REPORT_ROLES,
        );
        fullRecipients = (rows || []).map((r: any) => r.email).filter(Boolean);
      } catch (e) {
        console.warn("Failed to resolve report recipients:", e);
      }
    }
    sentSummary.full = await sendEmail(RESEND_API_KEY, fullRecipients, fullSubject, fullHtml, fullAttachment);

    // 2) SEGMENTED REPORTS
    for (const segment of Object.keys(SEGMENT_ROLES)) {
      const stages = SEGMENT_STAGE_FILTER[segment] || [];
      const placeholders = stages.map(() => "?").join(",");

      let voucherIdsRows: any[] = [];
      try {
        voucherIdsRows = await client.query(
          `SELECT DISTINCT v.id
           FROM t_vouchers v
           LEFT JOIN t_voucher_logs l ON l.voucher_id = v.id
           WHERE (
             (v.etapa_atual IN (${placeholders}) AND v.updated_at >= ? AND v.updated_at < ?)
             OR (l.data_hora >= ? AND l.data_hora < ? AND (${stages.map(() => "l.acao LIKE ?").join(" OR ")}))
           )`,
          [
            ...stages,
            monthStart,
            monthEndExclusive,
            monthStart,
            monthEndExclusive,
            ...stages.map((s) => `%${s}%`),
          ],
        );
      } catch (e) {
        console.warn(`Segment ${segment} query failed, fallback:`, e);
        voucherIdsRows = await client.query(
          `SELECT DISTINCT id FROM t_vouchers WHERE etapa_atual IN (${placeholders})`,
          stages,
        );
      }

      const ids = voucherIdsRows.map((r: any) => r.id).filter(Boolean);
      const idSet = new Set(ids);

      const concluidosSeg = concluidosFull.filter((v: any) => idSet.has(v.id));
      const emAndamentoSeg = emAndamentoFull.filter((v: any) => idSet.has(v.id));

      const roles = SEGMENT_ROLES[segment];
      const roleConditions = roles.map(() => `FIND_IN_SET(?, REPLACE(esteira_role, ' ', ''))`).join(" OR ");
      let userEmails: string[] = [];
      try {
        const rows = await client.query(
          `SELECT DISTINCT email FROM ai_agente.t_users_dachser
           WHERE esteira_active = 1 AND email IS NOT NULL AND email != '' AND (${roleConditions})`,
          roles,
        );
        userEmails = (rows || []).map((r: any) => r.email).filter(Boolean);
      } catch (e) {
        console.warn(`Failed to fetch users for segment ${segment}:`, e);
      }

      const baseRecipients = [...new Set([...userEmails, ...(SEGMENT_EXTRA_EMAILS[segment] || [])])];
      const recipients = testEmail ? [testEmail] : baseRecipients;
      if (recipients.length === 0) {
        sentSummary[segment] = { skipped: true, reason: "no recipients" };
        continue;
      }

      const kpisSeg = computeKpis(concluidosSeg, emAndamentoSeg);
      const segHtml = buildHtml(monthLabel, kpisSeg, segment);
      const segXlsx = buildXlsxBuffer(monthLabel, segment, kpisSeg, concluidosSeg, emAndamentoSeg);
      const segAttachment = { filename: xlsxFilename(monthLabel, segment), content: encodeBase64(segXlsx) };
      const segSubjectBase = `Relatório Mensal — ${segment} — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
      const segSubject = testEmail ? `[TESTE] ${segSubjectBase}` : segSubjectBase;
      sentSummary[segment] = await sendEmail(RESEND_API_KEY, recipients, segSubject, segHtml, segAttachment);
      console.log(`Sent ${segment} report to ${recipients.length} recipients${testEmail ? " (TEST MODE)" : ""}`);
    }

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        concluidos: concluidosFull.length,
        emAndamento: emAndamentoFull.length,
        sent: sentSummary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Monthly report error:", error);
    if (client) {
      try { await client.close(); } catch (_) {}
    }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
