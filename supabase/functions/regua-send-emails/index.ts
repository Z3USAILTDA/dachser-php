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

// Constrói tabela HTML - Design escuro igual ao modelo com PROCESSO, MASTER, HOUSE
// Cores conforme especificação:
// - Cabeçalho: preto (#000000) para colunas 1-11, azul (#0070C0) para PROCESSO/MASTER/HOUSE
// - Linhas de dados: fundo transparente, bordas pretas, texto preto
const buildTableHtml = (rows: InvoiceRow[]): string => {
  let rowsHtml = "";

  // Cores do design
  const headerBgBlack = "#000000";
  const headerBgBlue = "#0070C0";
  const headerColor = "#FFFFFF";
  const headerBorder = "border:1px solid #000000;";
  const rowBg = "transparent";
  const rowColor = "#000000";
  const rowBorder = "border:1px solid #000000;";
  const cellPadding = "padding:6px 8px;";

  for (const r of rows) {
    rowsHtml += `<tr style="background-color:${rowBg};color:${rowColor};">
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.documento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.nd || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.ref_cliente || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.nf_exibicao || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.modal || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.tipo_documento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;text-align:center;">${htmlEncode(r.data_emissao || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;text-align:center;">${htmlEncode(r.data_vencimento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(formatCnpj(r.cnpj))}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(formatRazaoSocial(r.razao_social))}</td>
      <td style="${rowBorder}${cellPadding}text-align:right;white-space:nowrap;">${Number(r.valor_nf || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.processo || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.master || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.house || "-")}</td>
    </tr>`;
  }

  // Header com cores diferenciadas: preto para colunas 1-11, azul para PROCESSO/MASTER/HOUSE (texto centralizado)
  const thStyleBlack = `background-color:${headerBgBlack};color:${headerColor};${headerBorder}${cellPadding}text-align:center;white-space:nowrap;font-weight:bold;`;
  const thStyleBlue = `background-color:${headerBgBlue};color:${headerColor};${headerBorder}${cellPadding}text-align:center;white-space:nowrap;font-weight:bold;`;

  return `
<table border="0" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;" cellpadding="0" cellspacing="0">
  <thead>
    <tr>
      <th style="${thStyleBlack}">DOC</th>
      <th style="${thStyleBlack}">ND</th>
      <th style="${thStyleBlack}">REF. CLIENTE</th>
      <th style="${thStyleBlack}">NF</th>
      <th style="${thStyleBlack}">MODAL</th>
      <th style="${thStyleBlack}">TIPO DOC.</th>
      <th style="${thStyleBlack}">EMISSÃO</th>
      <th style="${thStyleBlack}">VENCTO</th>
      <th style="${thStyleBlack}">C.N.P.J</th>
      <th style="${thStyleBlack}">CLIENTE</th>
      <th style="${thStyleBlack}">VALOR</th>
      <th style="${thStyleBlue}">PROCESSO</th>
      <th style="${thStyleBlue}">MASTER</th>
      <th style="${thStyleBlue}">HOUSE</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;
};

// Rodapé padrão - igual ao do aging
const FOOTER_LEGAL = `
Atenciosamente,
Financeiro Dachser

──────────────────────────────────────────────────────────────────────────

Nossos serviços são regidos pelas CONDIÇÕES GERAIS DE NEGÓCIOS, registradas no 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica da Comarca de Campinas, SP, sob nº 1.216.692 e também disponível em nosso website dachser.com.br. Consideração especial é feita para a regra a qual limita a responsabilidade civil do freight forwarder, na ocorrência de falta ou avaria nas mercadorias, em 2 Direitos Especiais de Saque (DES) por quilograma. Para qualquer tipo de perda não mencionada nas regras FIATA, a responsabilidade não excederá 50.000 DES por ocorrência.

Our legal services are governed by the GENERAL CONDITIONS OF BUSINESS, registered in the 1º RTD - Oficial de Registro de Títulos e Documentos e Civil de Pessoa Jurídica of the County of Campinas, SP, under No. 1.216.692, also available in our website dachser.com.br. Special remark is made to the FIATA Model Rules limits the liability of the freight forwarder, in case of loss or damage to goods, to 2 Special Drawing Rights (SDR) per kilogram. For any other loss not mentioned in FIATA rules, the liability shall not exceed 50,000 SDR per occurrence.`;

// Textos por estágio - SEMPRE usa formato consolidado (tabela de faturas)
const buildTemplateText = (
  tipoPagto: string,
  stage: string,
  titulos: InvoiceRow[],
  hoje: Date
): { subject: string; bodyBefore: string; bodyAfter: string } => {
  const isVista = (tipoPagto || "").toLowerCase().includes("vista");

  let subject: string;
  let bodyBefore: string;
  let bodyAfter: string;

  // ==================== PRE (ANTES DO VENCIMENTO) ====================
  if (stage === "PRE") {
    subject = "Lembrete de Vencimento – Faturas em Aberto";
    bodyBefore = `Prezados(as),

Gostaríamos de informar que as faturas listadas abaixo têm vencimento previsto para os próximos dias.`;
    bodyAfter = `
Recomendamos verificar o agendamento do pagamento para evitar qualquer imprevisto quanto ao prazo. Caso o pagamento já esteja programado, pedimos a gentileza de desconsiderar esta mensagem.

Em caso de dúvidas ou necessidade de esclarecimentos, a nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e permanecemos à disposição.
${FOOTER_LEGAL}`;
    return { subject, bodyBefore, bodyAfter };
  }

  // ==================== A PRAZO ====================
  if (!isVista) {
    switch (stage) {
      case "D1":
        subject = "Aviso de Atraso – Faturas em Aberto";
        bodyBefore = `Prezados(as),

Verificamos que as faturas listadas abaixo, encontram-se em atraso.`;
        bodyAfter = `
Solicitamos, por gentileza, a regularização do pagamento no menor prazo possível. Caso já tenha sido efetuado, favor desconsiderar este aviso.

Havendo qualquer divergência ou necessidade de esclarecimentos, pedimos que nos informem para conferência imediata. Nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e contamos com a sua colaboração para a regularização desta pendência.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D7":
        subject = "Pendência de Pagamento – Faturas em Aberto";
        bodyBefore = `Prezados(as),

Até o presente momento, não identificamos o pagamento das faturas listadas abaixo.`;
        bodyAfter = `
Solicitamos, por gentileza, a regularização desta pendência no menor prazo possível. Caso o pagamento já tenha sido efetuado, favor desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a atenção e colaboração.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D15":
        subject = "Urgente – Regularização de Faturas em Aberto";
        bodyBefore = `Prezados(as),

Constatamos que as faturas listadas abaixo permanecem em aberto até a presente data.`;
        bodyAfter = `
Para evitar a incidência de encargos adicionais e o encaminhamento do título para protesto, solicitamos a regularização imediata do pagamento.

Caso o pagamento já tenha sido efetuado, pedimos a gentileza de desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a atenção e aguardamos a sua colaboração.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D30":
        subject = "Pendência de Pagamento – Faturas em Aberto";
        bodyBefore = `Prezados(as),

Verificamos que as faturas listadas abaixo permanecem em aberto até a presente data.`;
        bodyAfter = `
Ressaltamos a importância de que os pagamentos sejam efetuados dentro dos prazos estabelecidos, a fim de evitar a suspensão de prazos concedidos e o eventual bloqueio do cadastro em nosso sistema.

Caso o pagamento já tenha sido realizado, favor desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e aguardamos a regularização desta pendência.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D45":
        subject = "Notificação de Cobrança – Faturas em Aberto";
        bodyBefore = `Prezados(as),

Notificamos que as faturas listadas abaixo permanecem em aberto em nosso sistema.`;
        bodyAfter = `
Salientamos que, caso o pagamento não seja regularizado de forma imediata, poderemos adotar medidas cabíveis, incluindo:
• Suspensão dos serviços prestados;
• Inclusão do débito em órgãos de proteção ao crédito;
• Encaminhamento do processo ao nosso departamento jurídico.

Caso o pagamento já tenha sido realizado, favor desconsiderar esta notificação.

Em caso de dúvidas ou divergências, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Aguardamos a sua colaboração para evitar a adoção das medidas acima mencionadas.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D60":
        subject = "Notificação Final – Faturas em Aberto";
        bodyBefore = `Prezados(as),

Conforme nossos registros, as faturas listadas abaixo permanecem em aberto até a presente data.`;
        bodyAfter = `
Notificamos que, caso não ocorra a regularização imediata do débito, este será encaminhado para cobrança extrajudicial, podendo resultar na inclusão do nome da empresa em órgãos de proteção ao crédito.

Caso o pagamento já tenha sido efetuado, favor desconsiderar esta notificação.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };
    }
  } else {
    // ==================== À VISTA ====================
    switch (stage) {
      case "D1":
        subject = "Aviso de Atraso – Faturas à Vista em Aberto";
        bodyBefore = `Prezados(as),

Identificamos que as faturas listadas abaixo, encontram-se em atraso.`;
        bodyAfter = `
Solicitamos a regularização do pagamento no menor prazo possível. Caso já tenha sido efetuado, favor desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e colaboração.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D7":
        subject = "Pendência de Pagamento – Faturas à Vista em Aberto";
        bodyBefore = `Prezados(as),

Até o momento, não identificamos o pagamento das faturas listadas abaixo.`;
        bodyAfter = `
Solicitamos a regularização desta pendência no menor prazo possível. Caso o pagamento já tenha sido efetuado, favor desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e colaboração.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D15":
        subject = "Urgente – Regularização de Faturas à Vista";
        bodyBefore = `Prezados(as),

Identificamos que as faturas listadas abaixo ainda não foram quitadas.`;
        bodyAfter = `
Para evitar a incidência de encargos adicionais e o encaminhamento do boleto com instrução de protesto em 3 dias, solicitamos que a regularização seja feita imediatamente.

Caso o pagamento já tenha sido efetuado, favor desconsiderar este aviso.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Agradecemos a sua atenção e colaboração.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };

      case "D30":
        subject = "Notificação Final – Faturas à Vista em Aberto";
        bodyBefore = `Prezados(as),

De acordo com nossos registros, as faturas listadas abaixo ainda não foram regularizadas.`;
        bodyAfter = `
Informamos que, caso o pagamento não seja efetuado imediatamente, o débito poderá ser encaminhado para cobrança extrajudicial ou judicial, podendo acarretar custos adicionais e inclusão em órgãos de proteção ao crédito.

Caso o pagamento já tenha sido realizado, favor desconsiderar esta notificação.

Em caso de dúvidas ou divergências, nossa equipa encontra-se à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
${FOOTER_LEGAL}`;
        return { subject, bodyBefore, bodyAfter };
    }
  }

  // Default
  subject = "Aviso Financeiro";
  bodyBefore = "Prezados(as),\n\nSegue relação de faturas em aberto:";
  bodyAfter = FOOTER_LEGAL;
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
    // A conexão é feita por documento (numero NF) pois id_rm pode estar vazio ou diferente
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
        t.id_rm AS id_rm_financeiro,
        COALESCE(nf.numero_processo, '') AS processo,
        COALESCE(nf.house, '') AS house,
        COALESCE(nf.master, '') AS master,
        t.id_rm AS debug_id_rm,
        (
          SELECT GROUP_CONCAT(DISTINCT c.email_contato SEPARATOR ';')
          FROM dados_dachser.t_dados_financeiro_contatos c
          WHERE REPLACE(REPLACE(REPLACE(c.cnpj,'.',''),'/',''),'-','')
                = REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-','')
        ) AS email_cliente
      FROM dados_dachser.t_dados_financeiro_nfs t
      LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
      LEFT JOIN dados_dachser.t_dados_nfs nf ON CAST(nf.id_rm AS CHAR) = CAST(t.id_rm AS CHAR)
      WHERE COALESCE(sd.active, 1) = 1
        AND (t.disputa IS NULL OR t.disputa = 0)
        AND ${getStageCondition(stage)}
      ORDER BY t.data_vencimento ASC, t.razao_social ASC
    `;

    console.log(`[regua-send-emails] Executando query para stage ${stage}`);
    const invoices = await client.query(sql);
    console.log(`[regua-send-emails] Encontradas ${invoices.length} faturas`);
    
    // Debug: log primeira fatura para verificar os campos
    if (invoices.length > 0) {
      const first = invoices[0];
      console.log(`[regua-send-emails] DEBUG primeira fatura:`, JSON.stringify({
        documento: first.documento,
        id_rm_financeiro: first.id_rm_financeiro,
        debug_id_rm: first.debug_id_rm,
        processo: first.processo,
        house: first.house,
        master: first.master
      }));
      
      // Diagnóstico detalhado para descobrir a conexão correta
      try {
        // 1. Verificar estrutura da tabela t_dados_nfs
        const cols = await client.query(`SHOW COLUMNS FROM dados_dachser.t_dados_nfs`);
        console.log(`[regua-send-emails] DEBUG colunas t_dados_nfs:`, JSON.stringify(cols.map((c: any) => c.Field)));
        
        // 2. Contar total de registros
        const countResult = await client.query(`SELECT COUNT(*) as total FROM dados_dachser.t_dados_nfs`);
        console.log(`[regua-send-emails] DEBUG total registros t_dados_nfs:`, countResult[0]?.total);
        
        // 3. Buscar por numero NF similar
        const nfNumerico = (first.documento || "").replace(/\D/g, "");
        if (nfNumerico) {
          const byNf = await client.query(`
            SELECT id_rm, numero_nf, numero_processo, house, master 
            FROM dados_dachser.t_dados_nfs 
            WHERE numero_nf LIKE ? OR numero_nf LIKE ?
            LIMIT 3
          `, [`%${nfNumerico}%`, `%${nfNumerico.slice(-6)}%`]);
          console.log(`[regua-send-emails] DEBUG t_dados_nfs por numero_nf (${nfNumerico}):`, JSON.stringify(byNf));
        }
        
        // 4. Mostrar amostra de registros
        const sample = await client.query(`
          SELECT id_rm, numero_nf, numero_processo, house, master 
          FROM dados_dachser.t_dados_nfs 
          LIMIT 3
        `);
        console.log(`[regua-send-emails] DEBUG amostra t_dados_nfs:`, JSON.stringify(sample));
      } catch (e) {
        console.log(`[regua-send-emails] DEBUG erro ao diagnosticar t_dados_nfs:`, e);
      }
    }

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
          subject: subject,
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
