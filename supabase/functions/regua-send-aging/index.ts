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
  numero_nf: string;
  data_emissao: string;
  data_vencimento: string;
  dias: number;
  valor_nf: number;
  tipo_pagto: string;
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

    // Fetch all overdue invoices for these CNPJs
    const placeholders = allCnpjs.map(() => "?").join(",");
    const invoicesResult = await client.query(`
      SELECT 
        t.documento,
        COALESCE(NULLIF(t.numero_nf,''), t.documento) AS numero_nf,
        DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        DATEDIFF(CURDATE(), t.data_vencimento) AS dias,
        t.valor_nf,
        CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagto,
        t.razao_social,
        t.cnpj,
        dnf.processo,
        dnf.house,
        dnf.master
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      LEFT JOIN dados_dachser.t_dados_nfs dnf ON dnf.id_rm = t.id_rm
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

    // Generate Excel file content (CSV format for simplicity, will be converted)
    const currentDate = new Date().toLocaleDateString("pt-BR");
    
    // Build HTML table for Excel (using HTML format which Excel can open)
    const excelHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; }
  th, td { border: 1px solid #000; padding: 8px; text-align: left; }
  th { background-color: #FFCC00; font-weight: bold; }
  .header { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
  .meta { margin-bottom: 5px; }
  .total { font-weight: bold; background-color: #f0f0f0; }
</style>
</head>
<body>
<div class="header">${cliente || invoicesResult[0]?.razao_social || "Cliente"} - Demonstrativo de Faturamento</div>
<div class="meta">Período: 01/01/2022 a 31/12/2027</div>
<div class="meta">Valor total em atraso: R$ ${totalValueFormatted}</div>
<div class="meta">Data: ${currentDate}</div>
<br/>
<table>
  <thead>
    <tr>
      <th>DOC</th>
      <th>NF</th>
      <th>EMISSÃO</th>
      <th>VENCTO</th>
      <th>DIAS</th>
      <th>VALOR</th>
      <th>TIPO</th>
      <th>C.N.P.J</th>
      <th>PROCESSO</th>
      <th>MASTER</th>
      <th>HOUSE</th>
    </tr>
  </thead>
  <tbody>
    ${invoicesResult.map((inv: InvoiceRow) => `
    <tr>
      <td>${inv.documento || "-"}</td>
      <td>${inv.numero_nf || "-"}</td>
      <td>${inv.data_emissao || "-"}</td>
      <td>${inv.data_vencimento || "-"}</td>
      <td>D+${inv.dias}</td>
      <td>R$ ${Number(inv.valor_nf || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${inv.tipo_pagto || "-"}</td>
      <td>${formatCnpj(inv.cnpj || "")}</td>
      <td>${inv.processo || "-"}</td>
      <td>${inv.master || "-"}</td>
      <td>${inv.house || "-"}</td>
    </tr>
    `).join("")}
    <tr class="total">
      <td colspan="5">TOTAL</td>
      <td>R$ ${totalValueFormatted}</td>
      <td colspan="5"></td>
    </tr>
  </tbody>
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
      from: "Financeiro Dachser <financeiro@dachser.com.br>",
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
