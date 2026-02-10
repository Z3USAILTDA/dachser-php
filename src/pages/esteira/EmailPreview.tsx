import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type NotificationType = "VOUCHER_ENVIADO" | "AJUSTE_SOLICITADO" | "URGENCIA_REJEITADA" | "VOUCHER_CONCLUIDO" | "VENCIMENTO_PROXIMO";

const TYPES: { value: NotificationType; label: string }[] = [
  { value: "VOUCHER_ENVIADO", label: "Voucher Enviado" },
  { value: "AJUSTE_SOLICITADO", label: "Ajuste Solicitado" },
  { value: "URGENCIA_REJEITADA", label: "Urgência Rejeitada" },
  { value: "VOUCHER_CONCLUIDO", label: "Voucher Concluído" },
  { value: "VENCIMENTO_PROXIMO", label: "Vencimento Próximo" },
];

const mockData = {
  voucherNumber: "SPO-2025-00123",
  fornecedor: "Transportes Silva Ltda",
  valor: "R$ 15.750,00",
  moeda: "BRL",
  vencimento: "15/02/2025",
  etapaDestino: "FISCAL",
  reason: "Nota fiscal com CNPJ divergente do cadastro",
  fromStage: "FISCAL",
  toStage: "OPERAÇÃO",
  senderName: "Maria Santos",
  voucherLink: "https://dachser.z3us.app",
};

const typeConfig: Record<NotificationType, { title: string; titleColor: string; btnBg: string; btnColor: string; subject: string }> = {
  VOUCHER_ENVIADO: { title: "Novo Voucher para Análise", titleColor: "#F5B843", btnBg: "#F5B843", btnColor: "#111", subject: "Voucher Recebido" },
  AJUSTE_SOLICITADO: { title: "Ajuste Solicitado", titleColor: "#F97316", btnBg: "#F97316", btnColor: "#fff", subject: "Ajuste Solicitado" },
  URGENCIA_REJEITADA: { title: "Urgência Rejeitada", titleColor: "#DC2626", btnBg: "#DC2626", btnColor: "#fff", subject: "Urgência Rejeitada" },
  VOUCHER_CONCLUIDO: { title: "Voucher Concluído com Sucesso", titleColor: "#22C55E", btnBg: "#22C55E", btnColor: "#fff", subject: "Voucher Concluído" },
  VENCIMENTO_PROXIMO: { title: "⚠️ Atenção: Vencimento Próximo", titleColor: "#F59E0B", btnBg: "#F59E0B", btnColor: "#111", subject: "Vencimento Próximo" },
};

function generateContentBlock(type: NotificationType): string {
  const d = mockData;
  switch (type) {
    case "VOUCHER_ENVIADO":
      return `
        <p class="muted" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
          Você recebeu um novo voucher para análise na etapa <b>${d.etapaDestino}</b>.
        </p>`;
    case "AJUSTE_SOLICITADO":
      return `
        <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
          O voucher <b>${d.voucherNumber}</b> foi devolvido de <b>${d.fromStage}</b> para <b>${d.toStage}</b>.
        </p>
        <p class="text" style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700">Motivo:</p>
        <div style="background:rgba(249,115,22,.08);border-left:4px solid #F97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p class="text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${d.reason}</p>
        </div>
        <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px">
          Solicitado por: <b>${d.senderName}</b>
        </p>`;
    case "URGENCIA_REJEITADA":
      return `
        <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
          A solicitação de urgência para o voucher <b>${d.voucherNumber}</b> foi <span style="color:#DC2626;font-weight:700">rejeitada</span> pelo Supervisor.
        </p>
        <p class="text" style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700">Motivo da rejeição:</p>
        <div style="background:rgba(220,38,38,.06);border-left:4px solid #DC2626;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p class="text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${d.reason}</p>
        </div>
        <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px">
          O voucher foi devolvido para a Operação.
        </p>`;
    case "VOUCHER_CONCLUIDO":
      return `
        <p class="muted" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
          O voucher <b>${d.voucherNumber}</b> foi processado e concluído com sucesso em todas as etapas.
        </p>`;
    case "VENCIMENTO_PROXIMO":
      return `
        <p class="muted" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
          O voucher <b>${d.voucherNumber}</b> está próximo do vencimento (<b>${d.vencimento}</b>). Por favor, verifique e tome as ações necessárias.
        </p>`;
  }
}

function generateEmailHtml(type: NotificationType, forceTheme: "auto" | "light" | "dark"): string {
  const cfg = typeConfig[type];
  const d = mockData;
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";
  const brand = "Z3US";
  const brandPlain = "Z3US&#8203;.AI";

  let lightInline = "display:block;";
  let darkInline = "display:none;";
  if (forceTheme === "dark") { lightInline = "display:none;"; darkInline = "display:block;"; }
  if (forceTheme === "light") { lightInline = "display:block;"; darkInline = "display:none;"; }

  let forceCss = "";
  if (forceTheme === "dark") {
    forceCss = ".logo-light{display:none!important}.logo-dark{display:block!important}.bg{background:#0b0b0b!important}.panel{background:#141414!important;border-color:#262626!important}.text{color:#ededed!important}.muted{color:#bdbdbd!important}";
  } else if (forceTheme === "light") {
    forceCss = ".logo-dark{display:none!important}.logo-light{display:block!important}.bg{background:#ffffff!important}.panel{background:#ffffff!important;border-color:#e8e8e8!important}.text{color:#111!important}.muted{color:#666!important}";
  }

  const ctaLabel = type === "VOUCHER_CONCLUIDO" ? "Ver Detalhes" : type === "VOUCHER_ENVIADO" ? "Analisar Voucher" : "Ver Voucher";

  const contentBlock = generateContentBlock(type);

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${cfg.subject}</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  @media (prefers-color-scheme: dark){
    .bg{background:#0b0b0b!important}
    .panel{background:#141414!important;border-color:#262626!important}
    .text{color:#ededed!important}.muted{color:#bdbdbd!important}
    .logo-light{display:none!important}.logo-dark{display:block!important}
  }
  ${forceCss}
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <!-- Logo -->
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="${brand}" class="logo-light" style="${lightInline}margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="${brand}" class="logo-dark" style="${darkInline}margin:0 auto 8px;border:0">
        </td></tr>

        <!-- Title -->
        <tr><td style="padding:12px 28px 0" align="left">
          <h1 style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${cfg.titleColor}">${cfg.title}</h1>
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px" class="muted">
            ${cfg.subject} — ${d.voucherNumber}
          </p>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:0 28px" align="left">
          ${contentBlock}
        </td></tr>

        <!-- Voucher data table -->
        <tr><td style="padding:0 28px 16px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
            <tr style="background:rgba(0,0,0,.03)">
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted" colspan="2">DADOS DO VOUCHER</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);width:140px" class="muted">Número</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${d.voucherNumber}</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Fornecedor</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${d.fornecedor}</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Valor</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${d.valor}</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Vencimento</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${d.vencimento}</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px" class="muted">Etapa</td>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:8px 14px" class="text">
                <span style="display:inline-block;background:${cfg.titleColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${d.etapaDestino}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:4px 28px 24px" align="left">
          <a href="${d.voucherLink}" style="display:inline-block;background:${cfg.btnBg};color:${cfg.btnColor};text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px">${ctaLabel}</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 28px 24px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso tenha dúvidas, entre em contato com o responsável pela sua área.</p>
        </td></tr>
      </table>

      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © ${brandPlain} — Esta é uma mensagem automática.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

export default function EmailPreview() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<NotificationType>("VOUCHER_ENVIADO");
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("light");

  const html = generateEmailHtml(selectedType, theme);

  return (
    <div className="min-h-screen bg-[#050608] text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/fin/esteira")} className="text-[#aaa] hover:text-[#ffc800]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-[#F5B843]">Preview de E-mails — Esteira de Vouchers</h1>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-xl border border-[#262626] bg-[#0d0d0d]">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-[#888] mb-1 block">Tipo de Notificação</label>
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as NotificationType)}>
              <SelectTrigger className="bg-[#141414] border-[#333] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-[#888] mb-1 block">Tema do E-mail</label>
            <div className="flex gap-1">
              <Button size="sm" variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className="gap-1.5">
                <Sun className="w-3.5 h-3.5" /> Light
              </Button>
              <Button size="sm" variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className="gap-1.5">
                <Moon className="w-3.5 h-3.5" /> Dark
              </Button>
              <Button size="sm" variant={theme === "auto" ? "default" : "outline"} onClick={() => setTheme("auto")} className="gap-1.5">
                <Monitor className="w-3.5 h-3.5" /> Auto
              </Button>
            </div>
          </div>
        </div>

        {/* Subject line */}
        <div className="mb-4 p-3 rounded-lg border border-[#262626] bg-[#0d0d0d] text-sm">
          <span className="text-[#888]">Subject: </span>
          <span className="text-white font-medium">{typeConfig[selectedType].subject} — {mockData.voucherNumber}</span>
        </div>

        {/* Preview iframe */}
        <div className="rounded-xl border border-[#262626] overflow-hidden" style={{ background: theme === "dark" ? "#0b0b0b" : "#fff" }}>
          <iframe
            srcDoc={html}
            title="Email Preview"
            className="w-full border-0"
            style={{ height: "700px" }}
          />
        </div>
      </div>
    </div>
  );
}
