import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StageEmailRequest {
  stage: string;
  dryRun?: boolean;
}

interface InvoiceRow {
  documento: string;
  numero_nf: string;
  razao_social: string;
  data_emissao: string;
  data_vencimento: string;
  dias: number;
  valor_nf: number;
  tipo_documento: string;
  cnpj: string;
  processo: string;
  house: string;
  master: string;
  email_cliente: string;
  nd: string;
  ref_cliente: string;
  modal: string;
}

const STAGE_SUBJECTS: Record<string, string> = {
  PRE: "Lembrete de Vencimento - Faturas em aberto",
  D1: "Aviso de Atraso - 1 dia após vencimento",
  D7: "1ª Cobrança Formal - Faturas em atraso",
  D15: "2ª Cobrança - Possível suspensão/protesto",
  D30: "Notificação Formal - Ações administrativas",
  D45: "Aviso de Bloqueio - Tratativa urgente",
  D60: "Última Notificação - Encaminhamento jurídico",
};

const STAGE_MESSAGES: Record<string, string> = {
  PRE: "Prezado cliente, informamos que as faturas abaixo estão próximas do vencimento. Por gentileza, providencie o pagamento para evitar transtornos.",
  D1: "Prezado cliente, identificamos que as faturas abaixo encontram-se vencidas há 1 dia. Solicitamos a regularização o mais breve possível.",
  D7: "Prezado cliente, as faturas abaixo estão vencidas há 7 dias. Solicitamos a regularização imediata para evitar medidas administrativas.",
  D15: "Prezado cliente, as faturas abaixo estão vencidas há 15 dias. Caso não regularizadas, poderemos suspender serviços e/ou efetuar protesto.",
  D30: "Prezado cliente, as faturas abaixo estão vencidas há 30 dias. Notificamos formalmente que medidas administrativas serão tomadas.",
  D45: "Prezado cliente, as faturas abaixo estão vencidas há 45 dias. Comunicamos que seu cadastro encontra-se bloqueado até a regularização.",
  D60: "Prezado cliente, as faturas abaixo estão vencidas há mais de 60 dias. Esta é a última notificação antes do encaminhamento ao departamento jurídico.",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { stage, dryRun = false }: StageEmailRequest = await req.json();

    if (!stage) {
      return new Response(
        JSON.stringify({ error: "stage é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey && !dryRun) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

    // Build stage condition
    const getStageCondition = (s: string): string => {
      switch (s) {
        case "PRE":
          return "DATEDIFF(CURDATE(), t.data_vencimento) < 0";
        case "D1":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 1";
        case "D7":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7 AND 14";
        case "D15":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29";
        case "D30":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44";
        case "D45":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 45 AND 59 AND t.tipo_documento != 'FAT_NF'";
        case "D60":
          return "(DATEDIFF(CURDATE(), t.data_vencimento) >= 60 AND t.tipo_documento != 'FAT_NF') OR (DATEDIFF(CURDATE(), t.data_vencimento) >= 45 AND t.tipo_documento = 'FAT_NF')";
        default:
          return "1=0";
      }
    };

    // Fetch invoices for this stage
    const sql = `
      SELECT 
        t.documento,
        COALESCE(NULLIF(t.numero_nf,''), t.documento) AS numero_nf,
        t.razao_social,
        DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        DATEDIFF(CURDATE(), t.data_vencimento) AS dias,
        t.valor_nf,
        t.tipo_documento,
        t.cnpj,
        COALESCE(dnf.processo, '') AS processo,
        COALESCE(dnf.house, '') AS house,
        COALESCE(dnf.master, '') AS master,
        COALESCE(t.email_cliente, '') AS email_cliente,
        COALESCE(t.nd, '') AS nd,
        COALESCE(t.ref_cliente, '') AS ref_cliente,
        COALESCE(t.modal, '') AS modal
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      LEFT JOIN dados_dachser.t_dados_nfs dnf ON dnf.id_rm = t.id_rm
      WHERE COALESCE(sd.active, 1) = 1
        AND ${getStageCondition(stage)}
      ORDER BY t.razao_social ASC, t.data_vencimento ASC
    `;

    const invoices = await client.query(sql);

    if (invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura encontrada para este estágio", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group invoices by client (razao_social)
    const clientGroups: Map<string, InvoiceRow[]> = new Map();
    for (const inv of invoices) {
      const clientKey = inv.razao_social || "Sem cliente";
      if (!clientGroups.has(clientKey)) {
        clientGroups.set(clientKey, []);
      }
      clientGroups.get(clientKey)!.push(inv);
    }

    const formatCnpj = (c: string) => {
      const digits = (c || "").replace(/\D/g, "");
      if (digits.length === 14) {
        return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
      }
      return c || "-";
    };

    const formatValue = (v: number) => {
      return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const sentDetails: Array<{ cliente: string; email: string; invoiceCount: number }> = [];

    // Process each client group
    for (const [clientName, clientInvoices] of clientGroups) {
      // Find email for this client
      const clientEmail = clientInvoices.find(inv => inv.email_cliente)?.email_cliente;
      
      if (!clientEmail) {
        skippedCount++;
        console.log(`Skipping ${clientName}: no email found`);
        continue;
      }

      // Check if already sent today
      try {
        const alreadySent = await client.query(`
          SELECT 1 FROM ai_agente.t_regua_email_log 
          WHERE cliente = ? AND stage = ? AND DATE(sent_at) = CURDATE() AND tipo_email = 'STAGE'
          LIMIT 1
        `, [clientName, stage]);

        if (alreadySent.length > 0) {
          skippedCount++;
          console.log(`Skipping ${clientName}: already sent today`);
          continue;
        }
      } catch (checkErr) {
        // Table might not exist yet, continue
        console.log("Note: Could not check previous sends:", checkErr);
      }

      // Calculate total
      const totalValue = clientInvoices.reduce((sum, inv) => sum + (Number(inv.valor_nf) || 0), 0);

      // Build consolidated table HTML
      const tableHtml = `
<table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px;">
  <thead>
    <tr style="background-color: #FFCC00;">
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">DOC</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">ND</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">REF. CLIENTE</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">NF</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">MODAL</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">TIPO DOC.</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">EMISSÃO</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">VENCTO</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">C.N.P.J</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">CLIENTE</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: right;">VALOR</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">PROCESSO</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">MASTER</th>
      <th style="border: 1px solid #000; padding: 8px; text-align: left;">HOUSE</th>
    </tr>
  </thead>
  <tbody>
    ${clientInvoices.map(inv => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.documento || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.nd || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.ref_cliente || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.numero_nf || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.modal || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.tipo_documento === "FAT_NF" ? "À vista" : "A prazo"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.data_emissao || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.data_vencimento || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${formatCnpj(inv.cnpj)}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.razao_social || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${formatValue(inv.valor_nf)}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.processo || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.master || "-"}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${inv.house || "-"}</td>
    </tr>
    `).join("")}
    <tr style="background-color: #f0f0f0; font-weight: bold;">
      <td colspan="10" style="border: 1px solid #ddd; padding: 6px;">TOTAL</td>
      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${formatValue(totalValue)}</td>
      <td colspan="3" style="border: 1px solid #ddd; padding: 6px;"></td>
    </tr>
  </tbody>
</table>
`;

      const emailHtml = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>${STAGE_MESSAGES[stage] || "Prezado cliente, segue abaixo a relação de faturas."}</p>
  
  <br/>
  ${tableHtml}
  <br/>
  
  <p>Em caso de dúvidas ou eventuais divergências, nossa equipe está à disposição através do e-mail <a href="mailto:jessica.costa@dachser.com">jessica.costa@dachser.com</a> ou pelo telefone +55 (19) 3312-6185.</p>
  
  <p>Agradecemos a sua atenção e colaboração.</p>
  
  <p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>
</div>
`;

      if (dryRun) {
        sentCount++;
        sentDetails.push({ cliente: clientName, email: clientEmail, invoiceCount: clientInvoices.length });
        console.log(`[DRY RUN] Would send to ${clientEmail} for ${clientName} (${clientInvoices.length} invoices)`);
        continue;
      }

      try {
        // TESTING: Force destination to devs@z3us.ai
        const testEmail = "devs@z3us.ai";
        
        const emailResponse = await resend!.emails.send({
          from: "Financeiro Dachser <financeiro@dachser.com.br>",
          to: [testEmail], // Using test email
          subject: `[TESTE] ${STAGE_SUBJECTS[stage] || "Faturas em aberto"} - ${clientName}`,
          html: emailHtml,
        });

        console.log(`Email sent to ${clientEmail}:`, emailResponse);
        const emailId = (emailResponse as any)?.data?.id || (emailResponse as any)?.id || "";

        // Log the send
        try {
          await client.execute(`
            INSERT INTO ai_agente.t_regua_email_log 
            (documento, stage, cliente, cnpj, email_to, subject, resend_message_id, status, tipo_email)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT', 'STAGE')
          `, [
            clientInvoices[0]?.documento || "",
            stage,
            clientName,
            clientInvoices[0]?.cnpj || "",
            clientEmail,
            `${STAGE_SUBJECTS[stage] || "Faturas em aberto"} - ${clientName}`,
            emailId,
          ]);
        } catch (logErr) {
          console.log("Note: Could not log email:", logErr);
        }

        sentCount++;
        sentDetails.push({ cliente: clientName, email: clientEmail, invoiceCount: clientInvoices.length });

      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message : "Unknown error";
        errors.push(`${clientName}: ${errMsg}`);
        console.error(`Error sending to ${clientEmail}:`, sendErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stage,
        totalClients: clientGroups.size,
        sent: sentCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
        details: sentDetails,
        dryRun,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in regua-send-emails:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Erro ao processar envio de e-mails", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
