// regua-send-aging v2.0 - migrated to npm:mysql2/promise
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import mysql from "npm:mysql2/promise";
import XLSX from "npm:xlsx-js-style@1.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgingRequest {
  cnpj?: string;
  cnpjs?: string[];
  razao_base?: string;
  razao_bases?: string[];
  cliente: string;
  email_to: string;
  custom_text?: string;
}

const parseEmails = (input: string): string[] => {
  const fallback = ["devs@z3us.ai", "bia.souza@dachser.com", "jessica.costa@dachser.com"];
  if (!input?.trim()) return fallback;
  const emails = input
    .split(/[;,\n]/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return emails.length > 0 ? emails : fallback;
};

interface InvoiceRow {
  documento: string;
  nd: string;
  referencia_cliente: string;
  numero_nf: string;
  modal: string;
  tipo_documento: string;
  data_emissao: string;
  data_vencimento: string;
  valor_nf: number;
  razao_social: string;
  cnpj: string;
  numero_processo: string;
  house: string;
  master: string;
  status_fatura: string;
  responsavel: string;
}

const formatCnpj = (c: string) => {
  const digits = c.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return c;
};

const formatCnpjShort = (c: string) => {
  const digits = c.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)} ${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return c;
};

const formatCurrency = (value: number) => {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// connectWithRetry pattern
async function connectWithRetry(config: mysql.ConnectionOptions, maxRetries = 3): Promise<mysql.Connection> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[regua-send-aging] DB connect attempt ${attempt}/${maxRetries}`);
      const conn = await mysql.createConnection(config);
      console.log(`[regua-send-aging] DB connected on attempt ${attempt}`);
      return conn;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[regua-send-aging] Connect attempt ${attempt} failed:`, lastError.message);
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error("Failed to connect after retries");
}

// Cell styles
const STYLES = {
  logo: {
    font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFCC00" } },
    fill: { fgColor: { rgb: "003366" } },
    alignment: { horizontal: "center", vertical: "center" },
  },
  title: {
    font: { name: "Arial", sz: 22, bold: true, color: { rgb: "333333" } },
    alignment: { horizontal: "center", vertical: "center" },
  },
  boxLabel: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0070C0" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    },
  },
  boxValue: {
    font: { name: "Arial", sz: 14, bold: true, color: { rgb: "FF0000" } },
    fill: { fgColor: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    },
  },
  date: {
    font: { name: "Arial", sz: 10, color: { rgb: "333333" } },
    alignment: { horizontal: "right", vertical: "center" },
  },
  periodoLabel: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "B4C6E7" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  periodoValue: {
    font: { name: "Arial", sz: 11, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "B4C6E7" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  headerBlack: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "000000" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "333333" } },
      bottom: { style: "thin", color: { rgb: "333333" } },
      left: { style: "thin", color: { rgb: "333333" } },
      right: { style: "thin", color: { rgb: "333333" } },
    },
  },
  headerBlue: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0070C0" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "333333" } },
      bottom: { style: "thin", color: { rgb: "333333" } },
      left: { style: "thin", color: { rgb: "333333" } },
      right: { style: "thin", color: { rgb: "333333" } },
    },
  },
  dataCell: {
    font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  dataCellNumber: {
    font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
    alignment: { horizontal: "right", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  dataCellOverdue: {
    font: { name: "Arial", sz: 10, color: { rgb: "FF0000" } },
    alignment: { horizontal: "right", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  empty: {
    font: { name: "Arial", sz: 10 },
  },
};

const HEADERS = [
  "DOCUMENTO", "ND", "REF. CLIENTE", "NOTA FISC", "MODAL", "TIPO DOC",
  "EMISSÃO", "VENCTO", "C.N.P.J", "CLIENTE", "VALOR",
  "PROCESSO", "MASTER", "HOUSE", "STATUS", "RESPONSÁVEL",
];

function createSheetForCnpj(invoices: InvoiceRow[], clienteName: string, totalValue: number, currentDate: string): XLSX.WorkSheet {
  const totalValueFormatted = formatCurrency(totalValue);
  const ws: XLSX.WorkSheet = {};

  ws["A1"] = { v: "DACHSER", s: STYLES.logo };
  ws["O1"] = { v: "Valor total em atraso", s: STYLES.boxLabel };
  ws["P1"] = { v: "", s: STYLES.boxLabel };
  ws["D2"] = { v: `${clienteName} - Demonstrativo de Faturamento`, s: STYLES.title };
  ws["O2"] = { v: totalValueFormatted, s: STYLES.boxValue };
  ws["P2"] = { v: "", s: STYLES.boxValue };
  ws["P3"] = { v: currentDate, s: STYLES.date };
  ws["A4"] = { v: "Período de Faturamento:", s: STYLES.periodoLabel };
  ws["B4"] = { v: "01/01/2022 a 31/12/2027", s: STYLES.periodoValue };
  for (let col = 2; col < 16; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c: col });
    if (!ws[cellRef]) ws[cellRef] = { v: "", s: STYLES.periodoValue };
  }

  HEADERS.forEach((header, idx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 4, c: idx });
    ws[cellRef] = { v: header, s: idx <= 10 ? STYLES.headerBlack : STYLES.headerBlue };
  });

  invoices.forEach((inv, rowIdx) => {
    const row = 5 + rowIdx;
    const rowData = [
      inv.documento || "", inv.nd || "", inv.referencia_cliente || "", inv.numero_nf || "",
      inv.modal || "", inv.tipo_documento || "", inv.data_emissao || "", inv.data_vencimento || "",
      formatCnpj(inv.cnpj || ""), inv.razao_social || "", null,
      inv.numero_processo || "", inv.master || "", inv.house || "",
      inv.status_fatura || "Em atraso", inv.responsavel || "",
    ];
    rowData.forEach((value, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: colIdx });
      if (colIdx === 10) return;
      let style = STYLES.dataCell;
      if (colIdx === 7) style = { ...STYLES.dataCell, font: { ...STYLES.dataCell.font, color: { rgb: "FF0000" } } };
      ws[cellRef] = { v: value, s: style };
    });
    const valorCellRef = XLSX.utils.encode_cell({ r: row, c: 10 });
    ws[valorCellRef] = { v: Number(inv.valor_nf) || 0, t: 'n', s: STYLES.dataCellOverdue, z: '#,##0.00' };
  });

  const totalRow = 5 + invoices.length;
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 9 })] = {
    v: "TOTAL EM ATRASO:", s: {
      font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "C00000" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
    }
  };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 10 })] = {
    v: totalValue, t: 'n', s: {
      font: { name: "Arial", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "C00000" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
    }, z: '"R$ "#,##0.00'
  };

  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 50 }, { wch: 18 }, { wch: 6 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 22 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
  ];
  ws['!rows'] = [{ hpt: 30 }, { hpt: 35 }, { hpt: 20 }, { hpt: 22 }, { hpt: 25 }];
  ws['!merges'] = [
    { s: { r: 0, c: 14 }, e: { r: 0, c: 15 } },
    { s: { r: 1, c: 14 }, e: { r: 1, c: 15 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 10 } },
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 6 + invoices.length, c: 15 } });
  ws['!autofilter'] = { ref: `A5:P5` };
  return ws;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let connection: mysql.Connection | null = null;

  try {
    const { cnpj, cnpjs, razao_base, razao_bases, cliente, email_to, custom_text }: AgingRequest = await req.json();

    if (!cnpj && (!cnpjs || cnpjs.length === 0) && !razao_base && (!razao_bases || razao_bases.length === 0)) {
      return new Response(
        JSON.stringify({ error: "cnpj, cnpjs, razao_base ou razao_bases é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipientList = parseEmails(email_to);
    console.log("[regua-send-aging] Sending to:", recipientList);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY não configurada");
    const resend = new Resend(resendApiKey);

    // Connect to MariaDB with retry
    const host = Deno.env.get("MARIADB_FIN_HOST");
    const port = parseInt(Deno.env.get("MARIADB_FIN_PORT") || "3306");
    const database = Deno.env.get("MARIADB_FIN_DATABASE");
    const dbUser = Deno.env.get("MARIADB_FIN_USER");
    const dbPassword = Deno.env.get("MARIADB_FIN_PASSWORD");

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error("Credenciais do banco de dados não configuradas");
    }

    connection = await connectWithRetry({
      host, port, database, user: dbUser, password: dbPassword,
      connectTimeout: 20000, charset: "utf8mb4",
      idleTimeout: 60000,
    });

    // Determine target CNPJs — prefer razao_base grouping over CNPJ root
    let allCnpjs: string[] = [];

    // Collect all razao_base values to resolve
    const allRazaoBases: string[] = [];
    if (razao_bases && Array.isArray(razao_bases) && razao_bases.length > 0) {
      allRazaoBases.push(...razao_bases);
    } else if (razao_base) {
      allRazaoBases.push(razao_base);
    }

    if (allRazaoBases.length > 0) {
      // Resolve CNPJs by razao_base (commercial grouping)
      const placeholders = allRazaoBases.map(() => "?").join(",");
      const [rows] = await connection.query(`
        SELECT DISTINCT t.cnpj 
        FROM dados_dachser.t_dados_financeiro_nfs t
        WHERE SUBSTRING_INDEX(t.razao_social, ' - ', 1) IN (${placeholders})
          AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
          AND NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3))
          AND (t.disputa IS NULL OR t.disputa = 0)
      `, allRazaoBases);
      allCnpjs = (rows as any[]).map(r => r.cnpj);
      console.log(`[regua-send-aging] Resolved ${allCnpjs.length} CNPJs from ${allRazaoBases.length} razao_base(s)`);
    } else if (cnpjs && Array.isArray(cnpjs) && cnpjs.length > 0) {
      // Fallback: resolve by CNPJ root
      for (const c of cnpjs) {
        const baseCnpj = c.replace(/\D/g, "").substring(0, 8);
        const [rows] = await connection.query(`
          SELECT DISTINCT cnpj FROM dados_dachser.t_dados_financeiro_nfs t
          WHERE cnpj LIKE CONCAT(?, '%')
            AND DATEDIFF(CURDATE(), data_vencimento) >= 1
            AND NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3))
            AND (t.disputa IS NULL OR t.disputa = 0)
        `, [baseCnpj]);
        allCnpjs.push(...(rows as any[]).map(r => r.cnpj));
      }
      allCnpjs = [...new Set(allCnpjs)];
    } else if (cnpj) {
      const baseCnpj = cnpj.replace(/\D/g, "").substring(0, 8);
      const [rows] = await connection.query(`
        SELECT DISTINCT cnpj FROM dados_dachser.t_dados_financeiro_nfs t
        WHERE cnpj LIKE CONCAT(?, '%')
          AND DATEDIFF(CURDATE(), data_vencimento) >= 1
          AND NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3))
          AND (t.disputa IS NULL OR t.disputa = 0)
      `, [baseCnpj]);
      allCnpjs = (rows as any[]).map(r => r.cnpj);
      if (allCnpjs.length === 0) allCnpjs.push(cnpj);
    }

    // Fetch invoices
    const placeholders = allCnpjs.map(() => "?").join(",");
    const [invoicesResult] = await connection.query(`
      SELECT 
        t.documento, COALESCE(t.nd, '') AS nd, COALESCE(t.referencia_cliente, '') AS referencia_cliente,
        COALESCE(NULLIF(t.numero_nf,''), '') AS numero_nf, COALESCE(t.modal, '') AS modal,
        t.tipo_documento, DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        t.valor_nf, t.razao_social, t.cnpj,
        COALESCE(n.numero_processo, '') AS numero_processo,
        COALESCE(n.house, '') AS house, COALESCE(n.master, '') AS master,
        'Em atraso' AS status_fatura, 'Financeiro' AS responsavel
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN dados_dachser.t_dados_nfs n ON t.id_rm = n.id_rm
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      WHERE t.cnpj IN (${placeholders})
        AND COALESCE(sd.active, 1) = 1
        AND NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = t.id_rm AND b.StatusLan IN (1, 2, 3))
        AND (t.disputa IS NULL OR t.disputa = 0)
        AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
      ORDER BY t.cnpj, t.data_vencimento ASC
    `, allCnpjs);

    const invoices = invoicesResult as InvoiceRow[];

    if (invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhuma fatura em atraso encontrada para este cliente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by CNPJ
    const invoicesByCnpj: Record<string, InvoiceRow[]> = {};
    for (const inv of invoices) {
      if (!invoicesByCnpj[inv.cnpj]) invoicesByCnpj[inv.cnpj] = [];
      invoicesByCnpj[inv.cnpj].push(inv);
    }

    const clienteName = cliente || invoices[0]?.razao_social || "Cliente";
    const currentDate = new Date().toLocaleDateString("pt-BR");

    const wb = XLSX.utils.book_new();
    for (const [cnpjKey, cnpjInvoices] of Object.entries(invoicesByCnpj)) {
      const cnpjTotal = cnpjInvoices.reduce((sum, inv) => sum + (Number(inv.valor_nf) || 0), 0);
      const ws = createSheetForCnpj(cnpjInvoices, clienteName, cnpjTotal, currentDate);
      XLSX.utils.book_append_sheet(wb, ws, formatCnpjShort(cnpjKey).substring(0, 31));
    }

    const excelBuffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

    // Build email
    const cnpjsList = allCnpjs.map(c => `<strong>${formatCnpj(c)}</strong>`).join("<br/>");
    let emailBodyHtml: string;

    if (custom_text && custom_text.trim()) {
      const htmlContent = custom_text
        .replace(/\n/g, "<br/>")
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');
      emailBodyHtml = `<p>${htmlContent}</p>`;
    } else {
      emailBodyHtml = `
<p>Boa tarde!<br/>Tudo bem?</p>
<p>Segue anexo, aging list para os CNPJ's:</p>
<p>${cnpjsList}</p>
<p>Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?</p>
<p>Em caso de dúvidas ou eventuais divergências, nossa equipe está à disposição através do e-mail <a href="mailto:jessica.costa@dachser.com">jessica.costa@dachser.com</a> ou pelo telefone +55 (19) 3312-6185.</p>
<p>Agradecemos a sua atenção e colaboração.</p>
<p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>`;
    }

    const legalFooter = `
<hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;"/>
<p style="font-size: 11px; color: #666;">
  Nossos serviços são regidos pelas CONDIÇÕES GERAIS DE NEGÓCIOS, registradas no 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica da Comarca de Campinas, SP, sob nº 1.216.692 e também disponível em nosso website dachser.com.br. Consideração especial é feita para a regra a qual limita a responsabilidade civil do freight forwarder, na ocorrência de falta ou avaria nas mercadorias, em 2 Direitos Especiais de Saque (DES) por quilograma. Para qualquer tipo de perda não mencionada nas regras FIATA, a responsabilidade não excederá 50.000 DES por ocorrência.
</p>
<p style="font-size: 11px; color: #666;">
  Our legal services are governed by the GENERAL CONDITIONS OF BUSINESS, registered in the 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica of the County of Campinas, SP, under No. 1.216.692, also available in our website dachser.com.br. Special remark is made to the FIATA Model Rules limits the liability of the freight forwarder, in case of loss or damage to goods, to 2 Special Drawing Rights (SDR) per kilogram. For any other loss not mentioned in FIATA rules, the liability shall not exceed 50,000 SDR per occurrence.
</p>`;

    const emailHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">${emailBodyHtml}${legalFooter}</div>`;

    // Send email
    const dateForFile = new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");
    
    let emailResponse;
    try {
      emailResponse = await resend.emails.send({
        from: "Financeiro Dachser <noreply@hermes.z3us.ai>",
        to: recipientList,
        subject: `Aging List - ${clienteName}`,
        html: emailHtml,
        attachments: [{
          filename: `Aging_List_-_${clienteName.replace(/[^a-zA-Z0-9]/g, "_")}_${dateForFile}.xlsx`,
          content: excelBuffer,
        }],
      });
    } catch (emailErr) {
      console.error("[regua-send-aging] Resend error:", emailErr);
      const emailErrMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      return new Response(
        JSON.stringify({ error: "Falha ao enviar e-mail via Resend", details: emailErrMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[regua-send-aging] Email sent:", emailResponse);
    const emailId = (emailResponse as any)?.data?.id || (emailResponse as any)?.id || "";

    // Log
    try {
      await connection.execute(`
        INSERT INTO ai_agente.t_regua_email_log 
        (documento, stage, cliente, cnpj, email_to, subject, resend_message_id, status, tipo_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT', 'AGING')
      `, [invoices[0]?.documento || "", "AGING", clienteName, cnpj || "", email_to, `Aging List - ${clienteName}`, emailId]);
    } catch (logErr) {
      console.log("[regua-send-aging] Could not log email:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `E-mail enviado com sucesso para ${email_to}`,
        emailId,
        invoiceCount: invoices.length,
        sheetsCreated: Object.keys(invoicesByCnpj).length,
        cnpjsIncluded: allCnpjs.map(formatCnpj),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[regua-send-aging] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Differentiate connection errors
    const isConnectionError = errorMessage.includes("ETIMEDOUT") || 
      errorMessage.includes("ECONNREFUSED") || 
      errorMessage.includes("Connection reset") ||
      errorMessage.includes("EHOSTUNREACH");
    
    const statusCode = isConnectionError ? 503 : 500;
    const retryable = isConnectionError;
    
    return new Response(
      JSON.stringify({ 
        error: isConnectionError ? "Servidor de banco temporariamente indisponível" : "Erro ao enviar e-mail", 
        details: errorMessage,
        retryable,
      }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (connection) {
      try { await connection.end(); } catch (_) {}
    }
  }
});
