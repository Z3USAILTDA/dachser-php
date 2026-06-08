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
    const payload: StageEmailRequest = await req.json();
    const { stage } = payload;

    if (!stage) {
      return new Response(
        JSON.stringify({ error: "stage é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== Fase 2C.3: whitelist de stages permitidos ======
    const ALLOWED_STAGES = ["PRE", "D1", "D7", "D15", "D30", "D45", "D60"] as const;
    if (!ALLOWED_STAGES.includes(stage as any)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "stage não permitido",
          permitidos: ALLOWED_STAGES,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== Fase 2C.3: três modos controlados (envio interno liberado para todos os buckets) ======
    // 1) dryRun:true                     → simula, não chama Resend, não grava log
    // 2) envio interno de teste          → exige dryRun:false + testMode:true + confirmInternalSend:"SEND_TO_DEVS_ONLY"
    //                                      → envia APENAS para devs@z3us.ai, não grava log
    // 3) qualquer outro caso             → bloqueado
    const isDryRun = payload?.dryRun === true;
    const isInternalTestSend =
      payload?.dryRun === false &&
      (payload as any)?.testMode === true &&
      (payload as any)?.confirmInternalSend === "SEND_TO_DEVS_ONLY";

    if (!isDryRun && !isInternalTestSend) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Fase 2C.3: envio real bloqueado. Travas ausentes ou inválidas.",
          requeridos: {
            dryRun: false,
            testMode: true,
            confirmInternalSend: "SEND_TO_DEVS_ONLY",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // Connect to MariaDB
    const host = Deno.env.get("MARIADB_FIN_HOST");
    const port = parseInt(Deno.env.get("MARIADB_FIN_PORT") || "3306");
    const database = Deno.env.get("MARIADB_FIN_DATABASE");
    const dbUser = Deno.env.get("MARIADB_FIN_USER");
    const dbPassword = Deno.env.get("MARIADB_FIN_PASSWORD");

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

    // ====== Stage condition — alinhado com a régua visual ======
    // Janelas fixas por dias de atraso, independente de tipo_documento.
    const getStageCondition = (s: string): string => {
      switch (s) {
        case "PRE":
          return "t.data_vencimento >= CURDATE()";
        case "D1":
          return "DATEDIFF(CURDATE(), t.data_vencimento) = 1";
        case "D7":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7 AND 14";
        case "D15":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29";
        case "D30":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44";
        case "D45":
          return "DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 45 AND 59";
        case "D60":
          return "DATEDIFF(CURDATE(), t.data_vencimento) >= 60";
        default:
          return "1=0";
      }
    };


    // ====== Query da view canônica ======
    // - Fonte única: dados_dachser.v_fin_regua_contas_receber
    // - Soft delete por doc_key (NOT EXISTS com sd.active = 0)
    // - Sem tbaixas, sem disputa, sem t_dados_financeiro_nfs, sem t_dados_nfs,
    //   sem t_dados_financeiro_contatos, sem email_cliente
    const sql = `
      SELECT
        t.doc_key,
        SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base,
        t.razao_social,
        t.documento,
        COALESCE(t.nd, '') AS nd,
        COALESCE(t.ref_cliente, '') AS ref_cliente,
        COALESCE(NULLIF(t.numero_nf,''), t.documento) AS nf_exibicao,
        COALESCE(t.numero_nf, '') AS numero_nf,
        COALESCE(t.modal, '') AS modal,
        t.tipo_documento,
        DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao,
        DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_vencimento,
        DATEDIFF(CURDATE(), t.data_vencimento) AS dias,
        t.valor_nf,
        t.cnpj,
        CASE WHEN t.tipo_documento = 'FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagto,
        COALESCE(t.processo, '') AS processo,
        COALESCE(t.house, '') AS house,
        COALESCE(t.master, '') AS master
      FROM dados_dachser.v_fin_regua_contas_receber t
      WHERE NOT EXISTS (
          SELECT 1 FROM ai_agente.t_financeiro_soft_delete sd
          WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
            AND sd.active = 0
        )
        AND ${getStageCondition(stage)}
      ORDER BY t.data_vencimento ASC, t.razao_social ASC
    `;

    console.log(`[regua-send-emails] [Fase 2C.3 ${isDryRun ? "dryRun" : "internalTestSend"}] stage=${stage}`);
    const invoices = await client.query(sql);
    const totalTitulosStage = invoices.length;
    console.log(`[regua-send-emails] total_titulos_stage=${totalTitulosStage}`);

    if (totalTitulosStage === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: isDryRun ? "dry_run" : "internal_test_send",
          stage,
          destinatario_simulado: "devs@z3us.ai",
          total_titulos_stage: 0,
          total_clientes_stage: 0,
          titulos_processados: 0,
          amostra: [],
          message: "Nenhum título encontrado para este estágio",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group invoices by client (razao_base + cnpj)
    const clientGroups: Map<string, InvoiceRow[]> = new Map();
    for (const inv of invoices) {
      const cliente = inv.razao_base || inv.razao_social || "SEM NOME";
      const cnpjNorm = (inv.cnpj || "").replace(/\D/g, "");
      const key = `${cliente}|${cnpjNorm}`;
      if (!clientGroups.has(key)) clientGroups.set(key, []);
      clientGroups.get(key)!.push(inv);
    }

    // Mantém trava: apenas primeiro cliente é processado
    const firstClientEntry = clientGroups.entries().next().value;
    const [clientKey, clientInvoices] = firstClientEntry;
    const clientName = clientKey.split("|")[0];

    // ====== Modo DRY-RUN: retorna amostra sanitizada e sai ======
    if (isDryRun) {
      const amostra = clientInvoices.slice(0, 5).map((r: any) => ({
        doc_key: r.doc_key,
        tipo_documento: r.tipo_documento,
        dias_atraso: Number(r.dias) || 0,
        valor_nf: Number(r.valor_nf) || 0,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          mode: "dry_run",
          dryRun: true,
          stage,
          destinatario_simulado: "devs@z3us.ai",
          total_titulos_stage: totalTitulosStage,
          total_clientes_stage: clientGroups.size,
          titulos_processados: clientInvoices.length,
          cliente_processado: clientName,
          amostra,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== Modo ENVIO INTERNO DE TESTE ======
    // Envia APENAS para devs@z3us.ai. Destinatário hardcoded.
    // Não lê email_cliente, não aceita forceRecipient, não grava log.
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }
    const resend = new Resend(resendApiKey);

    const tipoPagto = clientInvoices[0]?.tipo_pagto || "A prazo";
    const { subject, bodyBefore, bodyAfter } = buildTemplateText(
      tipoPagto,
      stage,
      clientInvoices,
      new Date()
    );

    const tableHtml = buildTableHtml(clientInvoices);
    const beforeHtml = htmlEncode(bodyBefore).replace(/\n/g, "<br>");
    const afterHtml = htmlEncode(bodyAfter).replace(/\n/g, "<br>");

    const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#000;">
<div>${beforeHtml}</div>
<br>
${tableHtml}
<br>
<div>${afterHtml}</div>
</body></html>`;

    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "onboarding@resend.dev";
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Dachser Financeiro";
    const fromHeader = `${fromName} <${fromEmail}>`;

    const testSubject = `[TESTE INTERNO - Cliente: ${clientName}] ${subject}`;

    console.log(`[regua-send-emails] enviando teste interno para devs@z3us.ai (stage=${stage}, cliente=${clientName}, titulos=${clientInvoices.length})`);

    const { data: sendData, error: sendError } = await resend.emails.send({
      from: fromHeader,
      to: ["devs@z3us.ai"],
      subject: testSubject,
      html,
    });

    if (sendError) {
      console.error("[regua-send-emails] Resend error:", sendError);
      return new Response(
        JSON.stringify({
          success: false,
          mode: "internal_test_send",
          stage,
          error: "Falha ao enviar via Resend",
          details: sendError,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "internal_test_send",
        stage,
        destinatario_real: "devs@z3us.ai",
        cliente_origem_dados: clientName,
        total_titulos_stage: totalTitulosStage,
        total_clientes_stage: clientGroups.size,
        total_titulos_enviados: clientInvoices.length,
        resend_message_id: sendData?.id || null,
        log_gravado: false,
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
