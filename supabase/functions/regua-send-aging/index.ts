import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgingRequest {
  cnpj: string;
  cliente: string;
  email_to: string;
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

// Format number as Brazilian currency
const formatCurrency = (value: number) => {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function createSheetForCnpj(invoices: InvoiceRow[], clienteName: string, totalValue: number, currentDate: string): XLSX.WorkSheet {
  const totalValueFormatted = formatCurrency(totalValue);
  
  // Create worksheet data - matching exact structure from reference
  const wsData: any[][] = [];
  
  // Row 1: Logo and "Valor total em atraso" label (14 columns)
  wsData.push([
    "DACHSER", "", "", "", "", "", "", "", "", "", "", "Valor total em atraso", "", ""
  ]);
  
  // Row 2: Title centered and total value
  wsData.push([
    "", "", "", `${clienteName} - Demonstrativo de Faturamento`, "", "", "", "", "", "", "", `R$ ${totalValueFormatted}`, "", ""
  ]);
  
  // Row 3: Empty with date on right
  wsData.push([
    "", "", "", "", "", "", "", "", "", "", "", "", "", currentDate
  ]);
  
  // Row 4: Período de Faturamento
  wsData.push([
    "Período de Faturamento:", "01/01/2022 a 31/12/2027", "", "", "", "", "", "", "", "", "", "", "", ""
  ]);
  
  // Row 5: Column headers - all 14 columns matching reference
  wsData.push([
    "DOCUMENTO", "ND", "REF. CLIENTE", "NOTA FISCAL DACHSER", "MODAL", "TIPO DOC.", "EMISSÃO", "VENCTO", "C.N.P.J", "CLIENTE", "VALOR", "PROCESSO", "MASTER", "HOUSE"
  ]);
  
  // Data rows
  for (const inv of invoices) {
    wsData.push([
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
      Number(inv.valor_nf) || 0,
      inv.numero_processo || "",
      inv.master || "",
      inv.house || ""
    ]);
  }
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Set column widths (14 columns)
  ws['!cols'] = [
    { wch: 14 },  // DOCUMENTO
    { wch: 14 },  // ND
    { wch: 50 },  // REF. CLIENTE
    { wch: 18 },  // NOTA FISCAL DACHSER
    { wch: 6 },   // MODAL
    { wch: 8 },   // TIPO DOC.
    { wch: 10 },  // EMISSÃO
    { wch: 10 },  // VENCTO
    { wch: 20 },  // C.N.P.J
    { wch: 28 },  // CLIENTE
    { wch: 12 },  // VALOR
    { wch: 12 },  // PROCESSO
    { wch: 14 },  // MASTER
    { wch: 14 }   // HOUSE
  ];
  
  return ws;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { cnpj, cliente, email_to }: AgingRequest = await req.json();

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

    // Fetch all overdue invoices for these CNPJs with all required columns
    const placeholders = allCnpjs.map(() => "?").join(",");
    const invoicesResult = await client.query(`
      SELECT 
        t.documento,
        COALESCE(t.nd, '') AS nd,
        COALESCE(t.referencia_cliente, '') AS referencia_cliente,
        COALESCE(NULLIF(t.numero_nf,''), '') AS numero_nf,
        COALESCE(t.modal, '') AS modal,
        t.tipo_documento,
        DATE_FORMAT(t.data_emissao, '%m/%d/%y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%m/%d/%y') AS data_vencimento,
        t.valor_nf,
        t.razao_social,
        t.cnpj,
        COALESCE(n.numero_processo, '') AS numero_processo,
        COALESCE(n.house, '') AS house,
        COALESCE(n.master, '') AS master
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
    const currentDate = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

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

    // Email body
    const emailHtml = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Boa tarde!<br/>Tudo bem?</p>
  
  <p>Segue anexo, aging list para os CNPJ's:</p>
  
  <p>${cnpjsList}</p>
  
  <p>Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?</p>
  
  <p>Em caso de dúvidas ou eventuais divergências, nossa equipe está à disposição através do e-mail <a href="mailto:jessica.costa@dachser.com">jessica.costa@dachser.com</a> ou pelo telefone +55 (19) 3312-6185.</p>
  
  <p>Agradecemos a sua atenção e colaboração.</p>
  
  <p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;"/>
  
  <p style="font-size: 11px; color: #666;">
    Nossos serviços são regidos pelas CONDIÇÕES GERAIS DE NEGÓCIOS, registradas no 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica da Comarca de Campinas, SP, sob nº 1.216.692 e também disponível em nosso website dachser.com.br. Consideração especial é feita para a regra a qual limita a responsabilidade civil do freight forwarder, na ocorrência de falta ou avaria nas mercadorias, em 2 Direitos Especiais de Saque (DES) por quilograma. Para qualquer tipo de perda não mencionada nas regras FIATA, a responsabilidade não excederá 50.000 DES por ocorrência.
  </p>
  
  <p style="font-size: 11px; color: #666;">
    Our legal services are governed by the GENERAL CONDITIONS OF BUSINESS, registered in the 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica of the County of Campinas, SP, under No. 1.216.692, also available in our website dachser.com.br. Special remark is made to the FIATA Model Rules limits the liability of the freight forwarder, in case of loss or damage to goods, to 2 Special Drawing Rights (SDR) per kilogram. For any other loss not mentioned in FIATA rules, the liability shall not exceed 50,000 SDR per occurrence.
  </p>
</div>
`;

    // Send email with attachment
    // TESTING: Force destination to devs@z3us.ai
    const testEmail = "devs@z3us.ai";
    const dateForFile = new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");
    
    const emailResponse = await resend.emails.send({
      from: "Financeiro Dachser <noreply@hermes.z3us.ai>",
      to: [testEmail], // Using test email
      subject: `[TESTE] Aging List - ${clienteName}`,
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
