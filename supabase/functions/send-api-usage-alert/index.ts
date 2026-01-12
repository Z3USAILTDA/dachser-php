import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Destinatários fixos do alerta
const ALERT_RECIPIENTS = [
  "herbert@z3us.ai",
  "rodrigo@z3us.ai",
  "devs@z3us.ai"
];

// Limites de cada API (80% do total mensal)
interface ApiLimit {
  name: string;
  monthlyLimit: number;
  alertThreshold: number; // 80% do limite
  unit: string;
  plan: string;
}

const API_LIMITS: Record<string, ApiLimit> = {
  "JSONCargo": {
    name: "JSONCargo",
    monthlyLimit: 5000,
    alertThreshold: 4000, // 80% de 5000
    unit: "chamadas",
    plan: "Navigator (€299/mês)"
  }
  // Adicionar outras APIs aqui conforme necessário
};

interface AlertRequest {
  api_name: string;
  current_usage: number;
  period_start: string;
  period_end: string;
  test_mode?: boolean; // Se true, envia apenas para devs@z3us.ai
}

const generateAlertEmailHtml = (
  apiName: string, 
  currentUsage: number, 
  limit: ApiLimit,
  periodStart: string,
  periodEnd: string
): string => {
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";
  const dashboardUrl = "https://dachser.z3us.app/";
  const brand = "Z3US";
  const brandPlain = "Z3US&#8203;.AI";

  const percentageUsed = ((currentUsage / limit.monthlyLimit) * 100).toFixed(1);
  const remaining = limit.monthlyLimit - currentUsage;

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Alerta de Uso de API</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .btn{display:inline-block;background:#ffa500;color:#111;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px}
  .alert-badge{display:inline-block;background:#fff3cd;color:#856404;padding:4px 12px;border-radius:999px;font-weight:600;font-size:12px;border:1px solid #ffc107}
  .progress-bar{height:8px;border-radius:999px;background:#e8e8e8;overflow:hidden}
  .progress-fill{height:100%;border-radius:999px;transition:width 0.3s}
  @media (prefers-color-scheme: dark){
    .bg{background:#0b0b0b!important}
    .panel{background:#141414!important;border-color:#262626!important}
    .text{color:#ededed!important}.muted{color:#bdbdbd!important}
    .logo-light{display:none!important}.logo-dark{display:block!important}
    .alert-badge{background:#332701!important;color:#ffc107!important;border-color:#664d03!important}
    .progress-bar{background:#333!important}
  }
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="${brand}" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="${brand}" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>

        <tr><td style="padding:16px 28px 0" align="center">
          <span class="alert-badge">⚠️ ALERTA DE USO</span>
        </td></tr>

        <tr><td style="padding:16px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">
            API ${apiName} atingiu ${percentageUsed}% do limite
          </h1>
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            O uso da API <strong>${apiName}</strong> está se aproximando do limite mensal contratado.
          </p>
        </td></tr>

        <tr><td style="padding:0 28px 16px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:rgba(255,193,7,0.1);border-radius:8px;border:1px solid rgba(255,193,7,0.3)">
            <tr><td style="padding:16px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Plano:</strong> ${limit.plan}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Período:</strong> ${periodStart} a ${periodEnd}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Uso atual:</strong> <span style="color:#d97706;font-weight:700">${currentUsage.toLocaleString()}</span> de ${limit.monthlyLimit.toLocaleString()} ${limit.unit}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text">
                    <strong>Restante:</strong> ${remaining.toLocaleString()} ${limit.unit}
                  </td>
                </tr>
              </table>
              
              <div style="margin-top:12px">
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${percentageUsed}%;background:${Number(percentageUsed) >= 90 ? '#dc2626' : '#f59e0b'}"></div>
                </div>
                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:center" class="muted">
                  ${percentageUsed}% utilizado
                </p>
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 28px 12px" align="left">
          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            <strong>Recomendações:</strong>
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7" class="muted">
            <li>Monitore o uso nos próximos dias</li>
            <li>Considere otimizar chamadas desnecessárias</li>
            <li>Avalie upgrade de plano se necessário</li>
          </ul>
        </td></tr>

        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="${dashboardUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif">Ver Dashboard de APIs</a>
        </td></tr>

        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">
            Este é um alerta automático gerado pelo sistema de monitoramento ${brandPlain}.
          </p>
        </td></tr>
      </table>
      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © ${brand} — Monitoramento de APIs
      </div>
    </td></tr>
  </table>
</body>
</html>`;
};

const generateAlertEmailText = (
  apiName: string, 
  currentUsage: number, 
  limit: ApiLimit,
  periodStart: string,
  periodEnd: string
): string => {
  const percentageUsed = ((currentUsage / limit.monthlyLimit) * 100).toFixed(1);
  const remaining = limit.monthlyLimit - currentUsage;

  return `⚠️ ALERTA DE USO DE API

API ${apiName} atingiu ${percentageUsed}% do limite mensal

Plano: ${limit.plan}
Período: ${periodStart} a ${periodEnd}
Uso atual: ${currentUsage.toLocaleString()} de ${limit.monthlyLimit.toLocaleString()} ${limit.unit}
Restante: ${remaining.toLocaleString()} ${limit.unit}

Recomendações:
- Monitore o uso nos próximos dias
- Considere otimizar chamadas desnecessárias
- Avalie upgrade de plano se necessário

Ver Dashboard: https://dachser.z3us.app/

---
Z3US.AI - Monitoramento de APIs`;
};

// Verifica no banco se já foi enviado alerta para este ciclo
const checkAlertSentForCycle = async (apiName: string, cycleKey: string): Promise<boolean> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) return false;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "check_api_alert_sent",
        api_name: apiName,
        cycle_key: cycleKey
      }),
    });
    
    const data = await response.json();
    return data?.alert_sent === true;
  } catch (e) {
    console.error("[checkAlertSentForCycle] Failed:", e);
    return false;
  }
};

// Marca no banco que o alerta foi enviado para este ciclo
const markAlertSentForCycle = async (apiName: string, cycleKey: string): Promise<void> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "mark_api_alert_sent",
        api_name: apiName,
        cycle_key: cycleKey
      }),
    });
  } catch (e) {
    console.error("[markAlertSentForCycle] Failed:", e);
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { api_name, current_usage, period_start, period_end, test_mode }: AlertRequest = await req.json();

    if (!api_name || current_usage === undefined) {
      return new Response(JSON.stringify({ 
        error: "api_name e current_usage são obrigatórios", 
        success: false 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const limit = API_LIMITS[api_name];
    if (!limit) {
      return new Response(JSON.stringify({ 
        error: `Limite não configurado para API: ${api_name}`, 
        success: false 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Em modo de teste, ignorar verificação de threshold
    if (!test_mode && current_usage < limit.alertThreshold) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Uso atual (${current_usage}) abaixo do threshold (${limit.alertThreshold}). Nenhum alerta enviado.`,
        alert_sent: false
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Gerar chave do ciclo baseada no período (ex: "JSONCargo_2026_01")
    const now = new Date();
    const cycleKey = `${api_name}_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Verificar se já enviou alerta para este ciclo (exceto em modo de teste)
    if (!test_mode) {
      const alreadySent = await checkAlertSentForCycle(api_name, cycleKey);
      if (alreadySent) {
        console.log(`[API Alert] Alerta já enviado para ${api_name} neste ciclo (${cycleKey}). Ignorando.`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Alerta já foi enviado para este ciclo (${cycleKey}). Apenas 1 email por ciclo.`,
          alert_sent: false,
          already_sent: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ 
        error: "Configuração Resend incompleta", 
        success: false 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Destinatários: em modo de teste, apenas devs@z3us.ai
    const recipients = test_mode ? ["devs@z3us.ai"] : ALERT_RECIPIENTS;
    
    console.log(`Sending API usage alert for ${api_name} to ${recipients.join(", ")}${test_mode ? " (TEST MODE)" : ""}`);
    console.log(`Usage: ${current_usage}/${limit.monthlyLimit} (${((current_usage/limit.monthlyLimit)*100).toFixed(1)}%)`);

    const resend = new Resend(resendApiKey);

    const percentageUsed = ((current_usage / limit.monthlyLimit) * 100).toFixed(0);
    const subjectPrefix = test_mode ? "[TESTE] " : "";

    const startTime = Date.now();
    const { data, error } = await resend.emails.send({
      from: "Z3US.AI - Alertas <alertas@hermes.z3us.ai>",
      to: recipients,
      subject: `${subjectPrefix}⚠️ Alerta: API ${api_name} em ${percentageUsed}% do limite mensal`,
      html: generateAlertEmailHtml(api_name, current_usage, limit, period_start, period_end),
      text: generateAlertEmailText(api_name, current_usage, limit, period_start, period_end),
    });
    const elapsed = Date.now() - startTime;

    // Log API call
    const logApiCall = async () => {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !supabaseKey) return;
        
        await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "log_api_call",
            api_name: "Resend (Email)",
            endpoint: "/emails/api-alert",
            method: "POST",
            status_code: error ? 500 : 200,
            response_time_ms: elapsed,
            error_message: error?.message,
            edge_function: "send-api-usage-alert"
          }),
        });
      } catch (e) {
        console.error("[logApiCall] Failed:", e);
      }
    };
    logApiCall();

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ 
        error: "Erro ao enviar e-mail de alerta", 
        details: error.message, 
        success: false 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`API usage alert sent successfully, id: ${data?.id}`);

    // Marcar no banco que o alerta foi enviado para este ciclo (exceto em modo de teste)
    if (!test_mode) {
      await markAlertSentForCycle(api_name, cycleKey);
      console.log(`[API Alert] Marked ${api_name} ${cycleKey} as sent in database`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: test_mode ? "Alerta de teste enviado com sucesso" : "Alerta enviado com sucesso", 
      emailId: data?.id,
      alert_sent: true,
      recipients: recipients,
      test_mode: test_mode || false
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-api-usage-alert:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      error: "Erro ao processar alerta", 
      details: errorMessage, 
      success: false 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
