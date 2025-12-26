import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

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
  ref_cliente: string;
  numero_nf: string;
  modal: string;
  tipo_documento: string;
  data_emissao: string;
  data_vencimento: string;
  valor_nf: number;
  razao_social: string;
  cnpj: string;
  processo: string;
  house: string;
  master: string;
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

    // Format CNPJs for display
    const formatCnpj = (c: string) => {
      const digits = c.replace(/\D/g, "");
      if (digits.length === 14) {
        return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
      }
      return c;
    };

    // Fetch all overdue invoices for these CNPJs with all required columns
    const placeholders = allCnpjs.map(() => "?").join(",");
    const invoicesResult = await client.query(`
      SELECT 
        t.documento,
        COALESCE(t.nd, '') AS nd,
        COALESCE(t.ref_cliente, '') AS ref_cliente,
        COALESCE(NULLIF(t.numero_nf,''), '') AS numero_nf,
        COALESCE(t.modal, '') AS modal,
        t.tipo_documento,
        DATE_FORMAT(t.data_emissao, '%m/%d/%y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%m/%d/%y') AS data_vencimento,
        t.valor_nf,
        t.razao_social,
        t.cnpj,
        COALESCE(t.processo, '') AS processo,
        COALESCE(t.house, '') AS house,
        COALESCE(t.master, '') AS master
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      WHERE t.cnpj IN (${placeholders})
        AND COALESCE(sd.active, 1) = 1
        AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
      ORDER BY t.data_vencimento ASC
    `, allCnpjs);

    if (invoicesResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhuma fatura em atraso encontrada para este cliente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total value
    const totalValue = invoicesResult.reduce((sum: number, inv: InvoiceRow) => sum + (Number(inv.valor_nf) || 0), 0);
    const totalValueFormatted = totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Generate Excel file content
    const currentDate = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
    const clienteName = cliente || invoicesResult[0]?.razao_social || "Cliente";
    
    // Build HTML table for Excel matching the exact design from the reference
    const excelHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th { 
    background-color: #FF0000; 
    color: white; 
    font-weight: bold; 
    padding: 4px 6px; 
    text-align: left;
    border: 1px solid #ccc;
    font-size: 9px;
  }
  td { 
    border: 1px solid #ccc; 
    padding: 3px 6px; 
    text-align: left; 
    font-size: 9px;
  }
  .header-row { border: none; }
  .header-row td { border: none; padding: 2px 4px; }
  .logo { font-weight: bold; font-size: 18px; color: #FFCC00; }
  .title { font-size: 14px; font-weight: bold; text-align: center; }
  .total-label { text-align: right; font-weight: bold; }
  .total-value { color: #008000; font-weight: bold; font-size: 12px; }
  .date-cell { text-align: right; }
  .valor-cell { text-align: right; color: #0000FF; }
  .house-cell { color: #008000; }
</style>
</head>
<body>
<table>
  <!-- Header rows -->
  <tr class="header-row">
    <td colspan="2" class="logo">DACHSER</td>
    <td colspan="8"></td>
    <td colspan="2" class="total-label">Valor total em atraso</td>
    <td colspan="2"></td>
  </tr>
  <tr class="header-row">
    <td colspan="2"></td>
    <td colspan="6" class="title">${clienteName} - Demonstrativo de Faturamento</td>
    <td colspan="2"></td>
    <td colspan="2" class="total-value">R$ ${totalValueFormatted}</td>
    <td colspan="2"></td>
  </tr>
  <tr class="header-row">
    <td colspan="12"></td>
    <td colspan="2" class="date-cell">${currentDate}</td>
  </tr>
  <tr class="header-row">
    <td colspan="14"><strong>Período de Faturamento:</strong> 01/01/2022 a 31/12/2027</td>
  </tr>
  <!-- Data headers -->
  <tr>
    <th>DOCUMENTO</th>
    <th>ND</th>
    <th>REF. CLIENTE</th>
    <th>NOTA FISCAL DACHSER</th>
    <th>MODAL</th>
    <th>TIPO DOC.</th>
    <th>EMISSÃO</th>
    <th>VENCTO</th>
    <th>C.N.P.J</th>
    <th>CLIENTE</th>
    <th>VALOR</th>
    <th>PROCESSO</th>
    <th>MASTER</th>
    <th>HOUSE</th>
  </tr>
  <!-- Data rows -->
  ${invoicesResult.map((inv: InvoiceRow) => `
  <tr>
    <td>${inv.documento || ""}</td>
    <td>${inv.nd || ""}</td>
    <td>${inv.ref_cliente || ""}</td>
    <td>${inv.numero_nf || ""}</td>
    <td>${inv.modal || ""}</td>
    <td>${inv.tipo_documento || ""}</td>
    <td>${inv.data_emissao || ""}</td>
    <td>${inv.data_vencimento || ""}</td>
    <td>${formatCnpj(inv.cnpj || "")}</td>
    <td>${inv.razao_social || ""}</td>
    <td class="valor-cell">${Number(inv.valor_nf || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    <td>${inv.processo || ""}</td>
    <td>${inv.master || ""}</td>
    <td class="house-cell">${inv.house || ""}</td>
  </tr>
  `).join("")}
</table>
</body>
</html>`;

    // Convert to base64
    const excelBase64 = btoa(unescape(encodeURIComponent(excelHtml)));

    // Build CNPJs list for email body
    const cnpjsList = allCnpjs.map((c: string) => `<strong>${formatCnpj(c)}</strong>`).join("<br/>");

    // Email body with updated text
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
    
    const emailResponse = await resend.emails.send({
      from: "Financeiro Dachser <noreply@hermes.z3us.ai>",
      to: [testEmail], // Using test email
      subject: `[TESTE] Aging List - ${cliente || invoicesResult[0]?.razao_social || "Cliente"}`,
      html: emailHtml,
      attachments: [
        {
          filename: `Aging_List_${(cliente || "Cliente").replace(/[^a-zA-Z0-9]/g, "_")}_${currentDate.replace(/\//g, "-")}.xls`,
          content: excelBase64,
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
        cliente || invoicesResult[0]?.razao_social || "",
        cnpj,
        email_to,
        `Aging List - ${cliente || invoicesResult[0]?.razao_social || "Cliente"}`,
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
