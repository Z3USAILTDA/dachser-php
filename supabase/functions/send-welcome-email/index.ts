import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  username: string;
  password: string;
}

const generateEmailHtml = (username: string, password: string, forceTheme: string = "auto"): string => {
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";
  const accessUrl = "https://dachser.z3us.app/";
  const hostHref = "https://dachser.z3us.app/";
  const brand = "Z3US";

  // Use ZWSP to prevent auto-linking of "Z3US.AI"
  const brandPlain = "Z3US&#8203;.AI";

  // Inline default + overrides de tema
  let lightInline = "display:block;";
  let darkInline = "display:none;";
  if (forceTheme === "dark") {
    lightInline = "display:none;";
    darkInline = "display:block;";
  }
  if (forceTheme === "light") {
    lightInline = "display:block;";
    darkInline = "display:none;";
  }

  let forceCss = "";
  if (forceTheme === "dark") {
    forceCss =
      ".logo-light{display:none!important}.logo-dark{display:block!important}" +
      ".bg{background:#0b0b0b!important}.panel{background:#141414!important;border-color:#262626!important}" +
      ".text{color:#ededed!important}.muted{color:#bdbdbd!important}";
  } else if (forceTheme === "light") {
    forceCss =
      ".logo-dark{display:none!important}.logo-light{display:block!important}" +
      ".bg{background:#ffffff!important}.panel{background:#ffffff!important;border-color:#e8e8e8!important}" +
      ".text{color:#111!important}.muted{color:#666!important}";
  }

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Boas-vindas</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .btn{display:inline-block;background:#ffa500;color:#111;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px}
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
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="${brand}" class="logo-light" style="${lightInline}margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="${brand}" class="logo-dark" style="${darkInline}margin:0 auto 8px;border:0">
        </td></tr>

        <tr><td style="padding:8px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Bem-vindo(a), ${username}!</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Sua conta foi criada com sucesso no <span style="color:inherit;text-decoration:none">${brandPlain}</span> @ Dachser
            (<a href="${hostHref}" target="_blank" rel="noopener" style="color:#ffa500;text-decoration:none">dachser.z3us.app</a>).
            Seguem seus dados iniciais de acesso:
          </p>
        </td></tr>

        <tr><td style="padding:0 28px 12px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Usuário:</b> ${username}</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Senha atual:</b> <code style="font-family:Consolas,monospace;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.06)">${password}</code></td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px" class="muted">Por segurança, altere sua senha no primeiro acesso.</p>
        </td></tr>

        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="${accessUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif">Alterar senha</a>
        </td></tr>

        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso não tenha solicitado este cadastro, ignore este e-mail.</p>
        </td></tr>
      </table>
      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © ${brand} — Esta é uma mensagem automática.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
};

const generateEmailText = (username: string, password: string): string => {
  return `Bem-vindo(a), ${username}!

Sua conta foi criada com sucesso no Z3US.AI @ Dachser (dachser.z3us.ai).
Usuário: ${username}
Senha temporária: ${password}

Alterar senha: https://dachser.z3us.ai/change_password.php

Por segurança, altere a senha no primeiro acesso.`;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, username, password }: WelcomeEmailRequest = await req.json();

    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: "Email, username e password são obrigatórios", success: false }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ error: "Configuração Resend incompleta", success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Sending welcome email to: ${email} (user: ${username})`);

    const resend = new Resend(resendApiKey);

    const startTime = Date.now();
    const { data, error } = await resend.emails.send({
      from: "Z3US.AI - DACHSER <noreply@hermes.z3us.ai>",
      to: [email],
      subject: "Bem-vindo(a) ao Z3US",
      html: generateEmailHtml(username, password),
      text: generateEmailText(username, password),
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
            endpoint: "/emails",
            method: "POST",
            status_code: error ? 500 : 200,
            response_time_ms: elapsed,
            error_message: error?.message,
            edge_function: "send-welcome-email"
          }),
        });
      } catch (e) {
        console.error("[logApiCall] Failed:", e);
      }
    };
    logApiCall(); // Fire and forget

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: "Erro ao enviar e-mail", details: error.message, success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Welcome email sent successfully to: ${email}, id: ${data?.id}`);

    return new Response(JSON.stringify({ success: true, message: "E-mail enviado com sucesso", emailId: data?.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-welcome-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Erro ao enviar e-mail", details: errorMessage, success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
