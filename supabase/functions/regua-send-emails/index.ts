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
// - Linhas de dados: cinza muito escuro (#1A1A1A), bordas #2A2A2A
const buildTableHtml = (rows: InvoiceRow[]): string => {
  let rowsHtml = "";

  // Cores do design
  const headerBgBlack = "#000000";
  const headerBgBlue = "#0070C0";
  const headerColor = "#FFFFFF";
  const headerBorder = "border:1px solid #333333;";
  const rowBg = "#1A1A1A";
  const rowColor = "#FFFFFF";
  const rowBorder = "border:1px solid #2A2A2A;";
  const cellPadding = "padding:6px 8px;";

  for (const r of rows) {
    rowsHtml += `<tr style="background-color:${rowBg};color:${rowColor};">
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.documento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.nd || "-")}</td>
      <td style="${rowBorder}${cellPadding}word-break:break-word;">${htmlEncode(r.ref_cliente || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.nf_exibicao || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.modal || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.tipo_documento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;text-align:center;">${htmlEncode(r.data_emissao || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;text-align:center;">${htmlEncode(r.data_vencimento || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(formatCnpj(r.cnpj))}</td>
      <td style="${rowBorder}${cellPadding}word-break:break-word;">${htmlEncode(formatRazaoSocial(r.razao_social))}</td>
      <td style="${rowBorder}${cellPadding}text-align:right;white-space:nowrap;">${Number(r.valor_nf || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.processo || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.master || "-")}</td>
      <td style="${rowBorder}${cellPadding}white-space:nowrap;">${htmlEncode(r.house || "-")}</td>
    </tr>`;
  }

  // Header com cores diferenciadas: preto para colunas 1-11, azul para PROCESSO/MASTER/HOUSE
  const thStyleBlack = `background-color:${headerBgBlack};color:${headerColor};${headerBorder}${cellPadding}text-align:left;white-space:nowrap;font-weight:bold;`;
  const thStyleBlue = `background-color:${headerBgBlue};color:${headerColor};${headerBorder}${cellPadding}text-align:left;white-space:nowrap;font-weight:bold;`;

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

  // ==================== PRE (ANTES DO VENCIMENTO) ====================
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

  // ==================== A PRAZO ====================
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
        subject = multi
          ? "2ª Cobrança – Faturas em Aberto"
          : `2ª Cobrança – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Esta é a segunda notificação referente à fatura ${nf}, vencida em ${dataV}, no valor de ${valorBr}, que permanece em aberto há ${Math.max(diasAtraso, 0)} dias.

Informamos que, caso a regularização não seja efetuada nos próximos dias, poderemos adotar medidas administrativas, incluindo a possível suspensão de serviços e/ou protesto do título.

Solicitamos a regularização imediata. Caso o pagamento já tenha sido realizado, favor nos enviar o comprovante para baixa em nosso sistema.
Em caso de dúvidas ou necessidade de negociação, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Esta é a segunda notificação referente às faturas listadas abaixo, que permanecem em aberto:`;

          bodyAfter = `

Informamos que, caso a regularização não seja efetuada nos próximos dias, poderemos adotar medidas administrativas, incluindo a possível suspensão de serviços e/ou protesto dos títulos.

Solicitamos a regularização imediata. Caso os pagamentos já tenham sido realizados, favor nos enviar os comprovantes para baixa em nosso sistema.
Em caso de dúvidas ou necessidade de negociação, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D30":
        subject = multi
          ? "Notificação Formal – Faturas em Aberto"
          : `Notificação Formal – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Notificamos formalmente que a fatura ${nf}, vencida em ${dataV}, no valor de ${valorBr}, encontra-se em aberto há ${Math.max(diasAtraso, 0)} dias.

Informamos que medidas administrativas serão iniciadas caso a regularização não ocorra em até 5 (cinco) dias úteis, incluindo:
• Suspensão de novos embarques e serviços
• Inclusão do débito em órgãos de proteção ao crédito
• Protesto do título em cartório

Caso deseje negociar o débito ou esclarecer qualquer divergência, solicitamos contato imediato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Notificamos formalmente que as faturas listadas abaixo encontram-se em aberto há mais de 30 dias:`;

          bodyAfter = `

Informamos que medidas administrativas serão iniciadas caso a regularização não ocorra em até 5 (cinco) dias úteis, incluindo:
• Suspensão de novos embarques e serviços
• Inclusão do débito em órgãos de proteção ao crédito
• Protesto dos títulos em cartório

Caso deseje negociar os débitos ou esclarecer qualquer divergência, solicitamos contato imediato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D45":
        subject = multi
          ? "Aviso de Bloqueio – Faturas em Aberto"
          : `Aviso de Bloqueio – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Comunicamos que, devido à falta de regularização da fatura ${nf}, vencida em ${dataV}, no valor de ${valorBr}, em aberto há ${Math.max(diasAtraso, 0)} dias, seu cadastro encontra-se BLOQUEADO para novos serviços até a quitação do débito.

Além disso, informamos que:
• O título será encaminhado para protesto em cartório nos próximos dias
• O débito será incluído nos órgãos de proteção ao crédito (SPC/SERASA)

Solicitamos a regularização urgente para evitar maiores transtornos. Para negociação ou esclarecimentos, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Comunicamos que, devido à falta de regularização das faturas listadas abaixo, seu cadastro encontra-se BLOQUEADO para novos serviços até a quitação dos débitos:`;

          bodyAfter = `

Além disso, informamos que:
• Os títulos serão encaminhados para protesto em cartório nos próximos dias
• Os débitos serão incluídos nos órgãos de proteção ao crédito (SPC/SERASA)

Solicitamos a regularização urgente para evitar maiores transtornos. Para negociação ou esclarecimentos, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D60":
        subject = multi
          ? "Última Notificação – Encaminhamento Jurídico"
          : `Última Notificação – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Esta é a ÚLTIMA NOTIFICAÇÃO referente à fatura ${nf}, vencida em ${dataV}, no valor de ${valorBr}, em aberto há ${Math.max(diasAtraso, 0)} dias.

Informamos que, caso a regularização não seja efetuada em até 48 (quarenta e oito) horas, o débito será encaminhado ao nosso departamento jurídico para adoção das medidas cabíveis, incluindo:
• Execução judicial do débito
• Penhora de bens
• Custas processuais e honorários advocatícios a cargo do devedor

Até o momento, não recebemos nenhuma notificação informando o motivo do atraso. Dessa forma, solicitamos que entre em contato conosco, gentilmente.
Em caso de dúvidas ou necessidade de esclarecimentos, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e colaboração.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Esta é a ÚLTIMA NOTIFICAÇÃO referente às faturas listadas abaixo, que encontram-se em aberto há mais de 60 dias:`;

          bodyAfter = `

Informamos que, caso a regularização não seja efetuada em até 48 (quarenta e oito) horas, os débitos serão encaminhados ao nosso departamento jurídico para adoção das medidas cabíveis, incluindo:
• Execução judicial dos débitos
• Penhora de bens
• Custas processuais e honorários advocatícios a cargo do devedor

Até o momento, não recebemos nenhuma notificação informando o motivo do atraso. Dessa forma, solicitamos que entre em contato conosco, gentilmente.
Em caso de dúvidas ou necessidade de esclarecimentos, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.
Agradecemos a sua atenção e colaboração.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };
    }
  } else {
    // ==================== À VISTA ====================
    switch (stage) {
      case "D1":
        subject = multi
          ? "Aviso de Atraso – Faturas à Vista em Aberto"
          : `Aviso de Atraso – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

Verificamos que a fatura ${nf}, com vencimento em ${dataV} e no valor de ${valorBr}, encontra-se em atraso.
Por se tratar de fatura à vista, solicitamos a regularização imediata do pagamento.
Havendo qualquer divergência ou necessidade de esclarecimentos, pedimos que nos informem. Nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

Verificamos em nosso sistema que as faturas à vista abaixo encontram-se em atraso:`;

          bodyAfter = `
Por se tratarem de faturas à vista, solicitamos a regularização imediata dos pagamentos.
Havendo qualquer divergência ou necessidade de esclarecimentos, pedimos que nos informem. Nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D7":
        subject = multi
          ? "Pendência Urgente – Faturas à Vista em Aberto"
          : `Pendência Urgente – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

A fatura à vista ${nf}, vencida em ${dataV}, no valor de ${valorBr}, permanece em aberto.
Por se tratar de fatura à vista, informamos que medidas administrativas poderão ser adotadas caso a regularização não ocorra nos próximos dias.

Solicitamos a regularização imediata. Em caso de dúvidas, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

As faturas à vista listadas abaixo permanecem em aberto:`;

          bodyAfter = `

Por se tratarem de faturas à vista, informamos que medidas administrativas poderão ser adotadas caso a regularização não ocorra nos próximos dias.

Solicitamos a regularização imediata. Em caso de dúvidas, nossa equipa está à disposição através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D15":
        subject = multi
          ? "Notificação – Faturas à Vista em Aberto"
          : `Notificação – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

A fatura à vista ${nf}, vencida em ${dataV}, no valor de ${valorBr}, encontra-se em aberto há ${Math.max(diasAtraso, 0)} dias.
Informamos que, por se tratar de fatura à vista, o débito será encaminhado para as medidas cabíveis caso não seja regularizado.

Para negociação ou esclarecimentos, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

As faturas à vista listadas abaixo encontram-se em aberto:`;

          bodyAfter = `

Informamos que, por se tratarem de faturas à vista, os débitos serão encaminhados para as medidas cabíveis caso não sejam regularizados.

Para negociação ou esclarecimentos, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
        return { subject, bodyBefore, bodyAfter };

      case "D30":
        subject = multi
          ? "Encaminhamento Jurídico – Faturas à Vista"
          : `Encaminhamento Jurídico – Fatura ${nf}`;

        if (!multi) {
          bodyBefore = `Prezados(as),

ÚLTIMA NOTIFICAÇÃO: A fatura à vista ${nf}, vencida em ${dataV}, no valor de ${valorBr}, será encaminhada ao departamento jurídico caso não seja regularizada em até 48 horas.

Para regularização imediata ou negociação, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
          bodyAfter = "";
        } else {
          bodyBefore = `Prezados(as),

ÚLTIMA NOTIFICAÇÃO: As faturas à vista listadas abaixo serão encaminhadas ao departamento jurídico caso não sejam regularizadas em até 48 horas:`;

          bodyAfter = `

Para regularização imediata ou negociação, entre em contato através do e-mail jessica.costa@dachser.com ou pelo telefone +55 (19) 3312-6185.

Atenciosamente,
Jessica Costa
Accounts Receivable Analyst
Air & Sea Logistics Brazil`;
        }
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
        t.id_rm AS id_rm_financeiro,
        COALESCE(nf.numero_processo, '') AS processo,
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
    
    // Debug: log primeira fatura para verificar os campos
    if (invoices.length > 0) {
      const first = invoices[0];
      console.log(`[regua-send-emails] DEBUG primeira fatura:`, JSON.stringify({
        documento: first.documento,
        id_rm_financeiro: first.id_rm_financeiro,
        processo: first.processo,
        house: first.house,
        master: first.master
      }));
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
