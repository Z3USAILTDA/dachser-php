import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import XLSX from "npm:xlsx-js-style@1.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgingRequest {
  cnpj: string;
  cliente: string;
  email_to: string;
  custom_text?: string;
}

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

// Format CNPJ for display
const formatCnpj = (c: string) => {
  const digits = c.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return c;
};

// Format CNPJ for sheet name (shorter format, Excel max 31 chars)
const formatCnpjShort = (c: string) => {
  const digits = c.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)} ${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return c;
};

// Format number as Brazilian currency (without R$)
const formatCurrencyNumber = (value: number) => {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Format number as Brazilian currency (with R$)
const formatCurrency = (value: number) => {
  return `R$ ${formatCurrencyNumber(value)}`;
};

// Cell styles
const STYLES = {
  // Logo placeholder style
  logo: {
    font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFCC00" } },
    fill: { fgColor: { rgb: "003366" } },
    alignment: { horizontal: "center", vertical: "center" },
  },
  // Title style
  title: {
    font: { name: "Arial", sz: 22, bold: true, color: { rgb: "333333" } },
    alignment: { horizontal: "center", vertical: "center" },
  },
  // Box label "Valor total em atraso" 
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
  // Box value (red amount)
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
  // Date style
  date: {
    font: { name: "Arial", sz: 10, color: { rgb: "333333" } },
    alignment: { horizontal: "right", vertical: "center" },
  },
  // Período de Faturamento label
  periodoLabel: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "B4C6E7" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  // Período de Faturamento value
  periodoValue: {
    font: { name: "Arial", sz: 11, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "B4C6E7" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  // Header columns 1-11 (black background)
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
  // Header columns 12-16 (blue background)
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
  // Data cell (normal)
  dataCell: {
    font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  // Data cell (value/number - right aligned)
  dataCellNumber: {
    font: { name: "Arial", sz: 10, color: { rgb: "000000" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  // Data cell (overdue - red text)
  dataCellOverdue: {
    font: { name: "Arial", sz: 10, color: { rgb: "FF0000" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "D0D0D0" } },
      bottom: { style: "thin", color: { rgb: "D0D0D0" } },
      left: { style: "thin", color: { rgb: "D0D0D0" } },
      right: { style: "thin", color: { rgb: "D0D0D0" } },
    },
  },
  // Empty cell style
  empty: {
    font: { name: "Arial", sz: 10 },
  },
};

// Column headers (16 columns)
const HEADERS = [
  "DOCUMENTO",
  "ND",
  "REF. CLIENTE",
  "NOTA FISC",
  "MODAL",
  "TIPO DOC",
  "EMISSÃO",
  "VENCTO",
  "C.N.P.J",
  "CLIENTE",
  "VALOR",
  "PROCESSO",
  "MASTER",
  "HOUSE",
  "STATUS",
  "RESPONSÁVEL",
];

function createSheetForCnpj(invoices: InvoiceRow[], clienteName: string, totalValue: number, currentDate: string): XLSX.WorkSheet {
  const totalValueFormatted = formatCurrency(totalValue);
  
  // Create worksheet data
  const ws: XLSX.WorkSheet = {};
  
  // Row 1: Logo (A1) and "Valor total em atraso" label (O1-P1)
  ws["A1"] = { v: "DACHSER", s: STYLES.logo };
  ws["O1"] = { v: "Valor total em atraso", s: STYLES.boxLabel };
  ws["P1"] = { v: "", s: STYLES.boxLabel }; // Merge continuation
  
  // Row 2: Title (centered in D2) and total value (O2-P2)
  ws["D2"] = { v: `${clienteName} - Demonstrativo de Faturamento`, s: STYLES.title };
  ws["O2"] = { v: totalValueFormatted, s: STYLES.boxValue };
  ws["P2"] = { v: "", s: STYLES.boxValue }; // Merge continuation
  
  // Row 3: Date on the right (P3)
  ws["P3"] = { v: currentDate, s: STYLES.date };
  
  // Row 4: Período de Faturamento
  ws["A4"] = { v: "Período de Faturamento:", s: STYLES.periodoLabel };
  ws["B4"] = { v: "01/01/2022 a 31/12/2027", s: STYLES.periodoValue };
  // Fill remaining cells with periodo style
  for (let col = 2; col < 16; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c: col });
    if (!ws[cellRef]) {
      ws[cellRef] = { v: "", s: STYLES.periodoValue };
    }
  }
  
  // Row 5: Headers (16 columns)
  HEADERS.forEach((header, idx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 4, c: idx });
    // Columns 0-10 use black header, columns 11-15 use blue header
    const style = idx <= 10 ? STYLES.headerBlack : STYLES.headerBlue;
    ws[cellRef] = { v: header, s: style };
  });
  
  // Data rows (starting from row 6, index 5)
  invoices.forEach((inv, rowIdx) => {
    const row = 5 + rowIdx;
    
    const rowData = [
      inv.documento || "",
      inv.nd || "",
      inv.referencia_cliente || "",
      inv.numero_nf || "",
      inv.modal || "",
      inv.tipo_documento || "",
      inv.data_emissao || "",
      inv.data_vencimento || "",
      formatCnpj(inv.cnpj || ""),
      inv.razao_social || "",
      formatCurrencyNumber(Number(inv.valor_nf) || 0),
      inv.numero_processo || "",
      inv.master || "",
      inv.house || "",
      inv.status_fatura || "Em atraso",
      inv.responsavel || "",
    ];
    
    rowData.forEach((value, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: colIdx });
      
      // Use different styles based on column
      let style = STYLES.dataCell;
      if (colIdx === 10) {
        // VALOR column - use overdue style (red) since all are overdue
        style = STYLES.dataCellOverdue;
      } else if (colIdx === 7) {
        // VENCTO column - also red for overdue
        style = { ...STYLES.dataCell, font: { ...STYLES.dataCell.font, color: { rgb: "FF0000" } } };
      }
      
      ws[cellRef] = { v: value, s: style };
    });
  });
  
  // Set column widths (16 columns)
  ws['!cols'] = [
    { wch: 14 },  // DOCUMENTO
    { wch: 14 },  // ND
    { wch: 50 },  // REF. CLIENTE
    { wch: 18 },  // NOTA FISC
    { wch: 6 },   // MODAL
    { wch: 10 },  // TIPO DOC
    { wch: 12 },  // EMISSÃO
    { wch: 12 },  // VENCTO
    { wch: 20 },  // C.N.P.J
    { wch: 28 },  // CLIENTE
    { wch: 14 },  // VALOR
    { wch: 12 },  // PROCESSO
    { wch: 14 },  // MASTER
    { wch: 14 },  // HOUSE
    { wch: 12 },  // STATUS
    { wch: 16 },  // RESPONSÁVEL
  ];
  
  // Set row heights
  ws['!rows'] = [
    { hpt: 30 },  // Row 1
    { hpt: 35 },  // Row 2 (title)
    { hpt: 20 },  // Row 3
    { hpt: 22 },  // Row 4 (período)
    { hpt: 25 },  // Row 5 (headers)
  ];
  
  // Define merges
  ws['!merges'] = [
    { s: { r: 0, c: 14 }, e: { r: 0, c: 15 } }, // O1:P1 merge
    { s: { r: 1, c: 14 }, e: { r: 1, c: 15 } }, // O2:P2 merge
    { s: { r: 1, c: 3 }, e: { r: 1, c: 10 } },  // D2:K2 merge for title
  ];
  
  // Set range
  const lastRow = 5 + invoices.length;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 15 } });
  
  // Add AutoFilter to the table (row 5, columns A-P)
  ws['!autofilter'] = { ref: `A5:P5` };
  
  return ws;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { cnpj, cliente, email_to, custom_text }: AgingRequest = await req.json();

    if (!cnpj || !email_to) {
      return new Response(
        JSON.stringify({ error: "cnpj e email_to são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const resend = new Resend(resendApiKey);

    // Connect to MariaDB
    const host = Deno.env.get("MARIADB_HOST");
    const port = parseInt(Deno.env.get("MARIADB_PORT") || "3306");
    const database = Deno.env.get("MARIADB_DATABASE");
    const dbUser = Deno.env.get("MARIADB_USER");
    const dbPassword = Deno.env.get("MARIADB_PASSWORD");

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error("Credenciais do banco de dados não configuradas");
    }

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Get base CNPJ (first 8 digits) to find related CNPJs
    const baseCnpj = cnpj.replace(/\D/g, "").substring(0, 8);

    // Find all CNPJs from the same company group
    const cnpjsResult = await client.query(`
      SELECT DISTINCT cnpj 
      FROM dados_dachser.t_dados_financeiro_nfs 
      WHERE cnpj LIKE CONCAT(?, '%')
      AND DATEDIFF(CURDATE(), data_vencimento) >= 1
    `, [baseCnpj]);

    const allCnpjs = cnpjsResult.map((r: { cnpj: string }) => r.cnpj);
    
    if (allCnpjs.length === 0) {
      allCnpjs.push(cnpj);
    }

    // Fetch all overdue invoices for these CNPJs with all required columns (16 columns)
    const placeholders = allCnpjs.map(() => "?").join(",");
    const invoicesResult = await client.query(`
      SELECT 
        t.documento,
        COALESCE(t.nd, '') AS nd,
        COALESCE(t.referencia_cliente, '') AS referencia_cliente,
        COALESCE(NULLIF(t.numero_nf,''), '') AS numero_nf,
        COALESCE(t.modal, '') AS modal,
        t.tipo_documento,
        DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        t.valor_nf,
        t.razao_social,
        t.cnpj,
        COALESCE(n.numero_processo, '') AS numero_processo,
        COALESCE(n.house, '') AS house,
        COALESCE(n.master, '') AS master,
        'Em atraso' AS status_fatura,
        'Financeiro' AS responsavel
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN dados_dachser.t_dados_nfs n ON t.id_rm = n.id_rm
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      WHERE t.cnpj IN (${placeholders})
        AND COALESCE(sd.active, 1) = 1
        AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
      ORDER BY t.cnpj, t.data_vencimento ASC
    `, allCnpjs);

    if (invoicesResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhuma fatura em atraso encontrada para este cliente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group invoices by CNPJ
    const invoicesByCnpj: Record<string, InvoiceRow[]> = {};
    for (const inv of invoicesResult as InvoiceRow[]) {
      const cnpjKey = inv.cnpj;
      if (!invoicesByCnpj[cnpjKey]) {
        invoicesByCnpj[cnpjKey] = [];
      }
      invoicesByCnpj[cnpjKey].push(inv);
    }

    const clienteName = cliente || invoicesResult[0]?.razao_social || "Cliente";
    const currentDate = new Date().toLocaleDateString("pt-BR");

    // Create workbook with multiple sheets (one per CNPJ)
    const wb = XLSX.utils.book_new();
    
    for (const [cnpjKey, invoices] of Object.entries(invoicesByCnpj)) {
      const cnpjTotal = invoices.reduce((sum, inv) => sum + (Number(inv.valor_nf) || 0), 0);
      const ws = createSheetForCnpj(invoices, clienteName, cnpjTotal, currentDate);
      
      // Sheet name: CNPJ formatted (max 31 chars for Excel)
      const sheetName = formatCnpjShort(cnpjKey).substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // Generate Excel buffer as base64
    const excelBuffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

    // Build CNPJs list for email body
    const cnpjsList = allCnpjs.map((c: string) => `<strong>${formatCnpj(c)}</strong>`).join("<br/>");

    // Build email body - use custom_text if provided, otherwise use default
    let emailBodyHtml: string;
    
    if (custom_text && custom_text.trim()) {
      // Convert plain text to HTML (replace newlines with <br/>, emails with links)
      const htmlContent = custom_text
        .replace(/\n/g, "<br/>")
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');
      
      emailBodyHtml = `<p>${htmlContent}</p>`;
    } else {
      // Default email body
      emailBodyHtml = `
  <p>Boa tarde!<br/>Tudo bem?</p>
  
  <p>Segue anexo, aging list para os CNPJ's:</p>
  
  <p>${cnpjsList}</p>
  
  <p>Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?</p>
  
  <p>Em caso de dúvidas ou eventuais divergências, nossa equipe está à disposição através do e-mail <a href="mailto:jessica.costa@dachser.com">jessica.costa@dachser.com</a> ou pelo telefone +55 (19) 3312-6185.</p>
  
  <p>Agradecemos a sua atenção e colaboração.</p>
  
  <p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>`;
    }

    // Fixed legal footer (cannot be modified)
    const legalFooter = `
  <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;"/>
  
  <p style="font-size: 11px; color: #666;">
    Nossos serviços são regidos pelas CONDIÇÕES GERAIS DE NEGÓCIOS, registradas no 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica da Comarca de Campinas, SP, sob nº 1.216.692 e também disponível em nosso website dachser.com.br. Consideração especial é feita para a regra a qual limita a responsabilidade civil do freight forwarder, na ocorrência de falta ou avaria nas mercadorias, em 2 Direitos Especiais de Saque (DES) por quilograma. Para qualquer tipo de perda não mencionada nas regras FIATA, a responsabilidade não excederá 50.000 DES por ocorrência.
  </p>
  
  <p style="font-size: 11px; color: #666;">
    Our legal services are governed by the GENERAL CONDITIONS OF BUSINESS, registered in the 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica of the County of Campinas, SP, under No. 1.216.692, also available in our website dachser.com.br. Special remark is made to the FIATA Model Rules limits the liability of the freight forwarder, in case of loss or damage to goods, to 2 Special Drawing Rights (SDR) per kilogram. For any other loss not mentioned in FIATA rules, the liability shall not exceed 50,000 SDR per occurrence.
  </p>`;

    // Complete email HTML
    const emailHtml = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  ${emailBodyHtml}
  ${legalFooter}
</div>
`;

    // Send email with attachment
    const dateForFile = new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");
    
    // Hardcoded recipients for aging emails
    const recipientEmails = [
      "devs@z3us.ai",
      "bia.souza@dachser.com",
      "jessica.costa@dachser.com"
    ];
    
    console.log("Sending aging email to recipients:", recipientEmails);
    
    const emailResponse = await resend.emails.send({
      from: "Financeiro Dachser <noreply@hermes.z3us.ai>",
      to: recipientEmails,
      subject: `Aging List - ${clienteName}`,
      html: emailHtml,
      attachments: [
        {
          filename: `Aging_List_-_${clienteName.replace(/[^a-zA-Z0-9]/g, "_")}_${dateForFile}.xlsx`,
          content: excelBuffer,
        },
      ],
    });

    console.log("Aging email sent:", emailResponse);
    const emailId = (emailResponse as any)?.data?.id || (emailResponse as any)?.id || "";

    // Log the email send
    try {
      await client.execute(`
        INSERT INTO ai_agente.t_regua_email_log 
        (documento, stage, cliente, cnpj, email_to, subject, resend_message_id, status, tipo_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT', 'AGING')
      `, [
        invoicesResult[0]?.documento || "",
        "AGING",
        clienteName,
        cnpj,
        email_to,
        `Aging List - ${clienteName}`,
        emailId,
      ]);
    } catch (logErr) {
      console.log("Note: Could not log email (table may not exist):", logErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `E-mail enviado com sucesso para ${email_to}`,
        emailId: emailId,
        invoiceCount: invoicesResult.length,
        sheetsCreated: Object.keys(invoicesByCnpj).length,
        cnpjsIncluded: allCnpjs.map(formatCnpj),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in regua-send-aging:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Erro ao enviar e-mail", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
