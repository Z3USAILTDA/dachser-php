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
  nd: string;
  ref_cliente: string;
  nf_exibicao: string;
  numero_nf: string;
  modal: string;
  tipo_documento: string;
  data_emissao: string;
  data_vencimento: string;
  dias: number;
  valor_nf: number;
  cnpj: string;
  razao_social: string;
  razao_base: string;
  processo: string;
  house: string;
  master: string;
  email_cliente: string;
  tipo_pagto: string;
}

// Formata CNPJ para exibição
const formatCnpj = (c: string) => {
  const digits = (c || "").replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
  }
  return c || "-";
};

// Formata valor para BRL
const formatValue = (v: number) => {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Formata razao social - extrai parte após " - "
const formatRazaoSocial = (razao: string): string => {
  if (!razao) return "";
  const parts = razao.split(" - ");
  return parts.length >= 2 ? parts.slice(1).join(" - ").trim() : razao.trim();
};

// HTML encode
const htmlEncode = (s: string): string => {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Constrói tabela HTML conforme C# original - com PROCESSO, MASTER, HOUSE
const buildTableHtml = (rows: InvoiceRow[]): string => {
  let rowsHtml = "";
  let total = 0;

  for (const r of rows) {
    total += Number(r.valor_nf) || 0;
    rowsHtml += `<tr>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.documento)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.nd)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;word-break:break-word;">${htmlEncode(r.ref_cliente)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.nf_exibicao)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.modal)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.tipo_documento)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.data_emissao)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.data_vencimento)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(formatCnpj(r.cnpj))}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;word-break:break-word;">${htmlEncode(formatRazaoSocial(r.razao_social))}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;text-align:right;white-space:nowrap;">${formatValue(r.valor_nf)}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.processo || "-")}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.master || "-")}</td>
      <td style="border:1px solid #D0D0D0;padding:6px 8px;white-space:nowrap;">${htmlEncode(r.house || "-")}</td>
    </tr>`;
  }

  // Linha de total
  rowsHtml += `<tr style="background-color:#ECECEC;font-weight:bold;">
    <td colspan="10" style="border:1px solid #D0D0D0;padding:6px 8px;">TOTAL</td>
    <td style="border:1px solid #D0D0D0;padding:6px 8px;text-align:right;">${formatValue(total)}</td>
    <td colspan="3" style="border:1px solid #D0D0D0;padding:6px 8px;"></td>
  </tr>`;

  return `
<table border="1" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;color:#111;" cellpadding="0" cellspacing="0">
  <thead>
    <tr>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">DOC</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">ND</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">REF. CLIENTE</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">NF</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">MODAL</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">TIPO DOC.</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">EMISSÃO</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">VENCTO</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">C.N.P.J</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">CLIENTE</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">VALOR</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">PROCESSO</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">MASTER</th>
      <th style="background:#ECECEC;border:1px solid #D0D0D0;padding:6px 8px;text-align:left;white-space:nowrap;">HOUSE</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;
};

// Textos por estágio - EXATAMENTE como no C#
const buildTemplateText = (
  tipoPagto: string,
  stage: string,
  titulos: InvoiceRow[],
  hoje: Date
): { subject: string; bodyBefore: string; bodyAfter: string } => {
  const first = titulos[0];
  const multi = titulos.length > 1;
  
  const nf = first.nf_exibicao || first.documento || "-";
  const dataV = first.data_vencimento || "-";
  
  // Parse data vencimento
  const [diaV, mesV, anoV] = (first.data_vencimento || "01/01/2000").split("/");
  const dataVDate = new Date(parseInt(anoV), parseInt(mesV) - 1, parseInt(diaV));
  
  const diasAteVenc = Math.floor((dataVDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  const diasAtraso = Math.floor((hoje.getTime() - dataVDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const valorBr = formatValue(first.valor_nf);
  
  const isVista = (tipoPagto || "").toLowerCase().includes("vista");

  let subject: string;
  let bodyBefore: string;
  let bodyAfter: string;

  // PRE - ANTES DO VENCIMENTO
  if (stage === "PRE") {
    subject = multi
      ? "Lembrete de Vencimento – Faturas em Aberto"
      : `Lembrete de Vencimento – Fatura ${nf}`;

    if (!multi) {
      bodyBefore = `Prezados(as),

Gostaríamos de informar que a fatura ${nf}, no valor de ${valorBr}, tem vencimento previsto para o dia ${dataV}, ou seja, em ${Math.max(diasAteVenc, 0)} dias.
Recomendamos verificar o agendamento do pagamento para evitar qualquer imprevisto quanto ao prazo. Caso o pagamento já esteja programado, pedimos a gentileza de desconsiderar esta mensagem.
Em caso de dúvidas ou necessidade de esclarecimentos, a nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e permanecemos à disposição.`;
      bodyAfter = "";
    } else {
      bodyBefore = `Prezados(as),

Segue relação de faturas até o momento:`;

      bodyAfter = `
Recomendamos verificar o agendamento dos pagamentos para evitar qualquer imprevisto quanto ao prazo. Caso já estejam programados, pedimos a gentileza de desconsiderar esta mensagem.
Em caso de dúvidas ou necessidade de esclarecimentos, a nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e permanecemos à disposição.`;
    }
    return { subject, bodyBefore, bodyAfter };
  }

  // A PRAZO
  if (!isVista) {
    switch (stage) {
      case "D1":
        subject = multi
          ? "Aviso de Atraso – Faturas em Aberto"
          : `Aviso de Atraso – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Verificamos que a fatura ${nf}, com vencimento em ${dataV} e no valor de ${valorBr}, encontra-se em atraso há ${Math.max(diasAtraso, 0)} dias.
Solicitamos, por gentileza, a regularização do pagamento no menor prazo possível. Caso já tenha sido efetuado, favor desconsiderar este aviso.
Havendo qualquer divergência ou necessidade de esclarecimentos, pedimos que nos informem para conferência imediata. Nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e contamos com a sua colaboração para a regularização desta pendência.
Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Verificamos em nosso sistema que a(s) fatura(s) abaixo encontram-se em atraso.`;

          bodyAfter = `
Solicitamos, por gentileza, a regularização dos pagamentos no menor prazo possível. Caso já tenham sido efetuados, favor desconsiderar este aviso.
Havendo qualquer divergência ou necessidade de esclarecimentos, pedimos que nos informem para conferência imediata. Nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e contamos com a sua colaboração para a regularização destas pendências.
Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D7":
        subject = multi
          ? "Pendência de Pagamento – Faturas em Aberto"
          : `Pendência de Pagamento – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Até o presente momento, não identificamos o pagamento da fatura ${nf}, vencida em ${dataV}, no valor de ${valorBr}.

Solicitamos, por gentileza, a regularização desta pendência no menor prazo possível. Caso o pagamento já tenha sido efetuado, favor desconsiderar este aviso.
Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a atenção e colaboração.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Até o momento, não identificamos o pagamento das faturas listadas abaixo:`;

          bodyAfter = `

Solicitamos a regularização destas pendências no menor prazo possível. Caso os pagamentos já tenham sido realizados, pedimos a gentileza de desconsiderar esta mensagem.
Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e colaboração.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D15":
      case "D30":
      case "D45":
      case "D60":
        // Genérico para estágios avançados
        subject = multi
          ? `Aviso Financeiro – Faturas em Aberto (${stage})`
          : `Aviso Financeiro – Fatura ${nf} (${stage})`;

        bodyBefore = `Prezados(as),

Há pendências financeiras em aberto.`;
        bodyAfter = `

Atenciosamente,
Dachser`;
        return { subject, bodyBefore, bodyAfter };
    }
  }

  // Default
  subject = "Aviso Financeiro";
  bodyBefore = "Prezados(as),\n\nHá pendências financeiras em aberto.";
  bodyAfter = "\n\nAtenciosamente,\nDachser";
  return { subject, bodyBefore, bodyAfter };
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

    // Build stage condition - EXATAMENTE como no C#
    const getStageCondition = (s: string): string => {
      switch (s) {
        case "PRE":
          return "t.data_vencimento >= CURDATE()";
        case "D1":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 2";
        case "D7":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 8";
        case "D15":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 16";
        case "D30":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 31";
        case "D45":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 46";
        case "D60":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 61";
        default:
          return "1=0";
      }
    };

    // Fetch invoices com JOIN para t_dados_nfs para pegar processo, house, master
    const sql = `
      SELECT 
        SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base,
        t.razao_social,
        t.documento,
        t.nd,
        t.referencia_cliente AS ref_cliente,
        COALESCE(NULLIF(t.numero_nf,''), t.documento) AS nf_exibicao,
        t.numero_nf,
        t.modal,
        t.tipo_documento,
        DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        DATEDIFF(CURDATE(), t.data_vencimento) AS dias,
        t.valor_nf,
        t.cnpj,
        CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagto,
        COALESCE(nf.processo, '') AS processo,
        COALESCE(nf.house, '') AS house,
        COALESCE(nf.master, '') AS master,
        (
          SELECT GROUP_CONCAT(DISTINCT c.email_contato SEPARATOR ';')
          FROM dados_dachser.t_dados_financeiro_contatos c
          WHERE REPLACE(REPLACE(REPLACE(c.cnpj,'.',''),'/',''),'-','')
                = REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-','')
        ) AS email_cliente
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      LEFT JOIN dados_dachser.t_dados_nfs nf ON nf.id_rm = t.id_rm
      WHERE COALESCE(sd.active, 1) = 1
        AND (t.disputa IS NULL OR t.disputa = 0)
        AND ${getStageCondition(stage)}
      ORDER BY t.data_vencimento ASC, t.razao_social ASC
    `;

    console.log(`[regua-send-emails] Executando query para stage ${stage}`);
    const invoices = await client.query(sql);
    console.log(`[regua-send-emails] Encontradas ${invoices.length} faturas`);

    if (invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura encontrada para este estágio", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group invoices by client (razao_base + cnpj) - COMO NO C#
    const clientGroups: Map<string, InvoiceRow[]> = new Map();
    for (const inv of invoices) {
      const cliente = inv.razao_base || inv.razao_social || "SEM NOME";
      const cnpjNorm = (inv.cnpj || "").replace(/\D/g, "");
      const key = `${cliente}|${cnpjNorm}`;
      
      if (!clientGroups.has(key)) {
        clientGroups.set(key, []);
      }
      clientGroups.get(key)!.push(inv);
    }

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const sentDetails: Array<{ cliente: string; email: string; invoiceCount: number }> = [];

    // TESTING: Process only the FIRST client for testing purposes
    const firstClientEntry = clientGroups.entries().next().value;
    if (!firstClientEntry) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhum cliente encontrado para este estágio" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const [clientKey, clientInvoices] = firstClientEntry;
    const clientName = clientKey.split("|")[0];
    
    // For testing, always use devs@z3us.ai
    const clientEmail = "devs@z3us.ai";

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
        return new Response(
          JSON.stringify({
            success: true,
            stage,
            totalClients: clientGroups.size,
            sent: 0,
            skipped: 1,
            message: `${clientName} já recebeu email hoje`,
            dryRun,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (checkErr) {
      console.log("Note: Could not check previous sends:", checkErr);
    }

    // Build template text - EXATAMENTE como no C#
    const tipoPagto = clientInvoices[0]?.tipo_pagto || "A prazo";
    const hoje = new Date();
    const { subject, bodyBefore, bodyAfter } = buildTemplateText(tipoPagto, stage, clientInvoices, hoje);

    // Sempre mostra tabela consolidada
    const isConsolidado = true;

    // Build HTML body
    const beforeHtml = htmlEncode(bodyBefore).replace(/\n/g, "<br>");
    
    let htmlBody = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;line-height:1.4;">`;
    htmlBody += beforeHtml;
    
    if (isConsolidado) {
      const tabelaHtml = buildTableHtml(clientInvoices);
      htmlBody += "<br>";
      htmlBody += tabelaHtml;
      
      if (bodyAfter) {
        const afterHtml = htmlEncode(bodyAfter).replace(/\n/g, "<br>");
        htmlBody += "<br>";
        htmlBody += afterHtml;
      }
    }
    
    htmlBody += "</div>";

    if (dryRun) {
      sentCount++;
      sentDetails.push({ cliente: clientName, email: clientEmail, invoiceCount: clientInvoices.length });
      console.log(`[DRY RUN] Would send to ${clientEmail} for ${clientName} (${clientInvoices.length} invoices)`);
    } else {
      try {
        const emailResponse = await resend!.emails.send({
          from: "Dachser <noreply@hermes.z3us.ai>",
          to: [clientEmail],
          subject: `[TESTE] ${subject}`,
          html: htmlBody,
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
            subject,
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
