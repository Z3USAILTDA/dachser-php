import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WelcomeEmailRequest {
  username: string;
  email: string;
  password: string;
  accessUrl?: string;
}

function buildWelcomeHtml(username: string, password: string, accessUrl: string): string {
  const logoLight = 'https://i.ibb.co/TgXzCqz/logo-preto.png';
  const logoDark = 'https://i.ibb.co/sJkY7y5/logo-branco.png';
  const brandPlain = 'Z3US&#8203;.AI';
  const hostHref = 'https://dachser.z3us.ai/';

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
  .logo-dark{display:none}
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="${logoLight}" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>

        <tr><td style="padding:8px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Bem-vindo(a), ${username}!</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Sua conta foi criada com sucesso no <span style="color:inherit;text-decoration:none">${brandPlain}</span> @ Dachser
            (<a href="${hostHref}" target="_blank" rel="noopener" style="color:#ffa500;text-decoration:none">dachser.z3us.ai</a>).
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
          <a href="${accessUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif">Acessar o Sistema</a>
        </td></tr>

        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso não tenha solicitado este cadastro, ignore este e-mail.</p>
        </td></tr>
      </table>
      <div style="height:20px;line-height:20px">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#888;text-align:center" class="muted">
        © Z3US — Esta é uma mensagem automática.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeText(username: string, password: string, accessUrl: string): string {
  return `Bem-vindo(a), ${username}!

Sua conta foi criada com sucesso no Z3US.AI @ Dachser (dachser.z3us.ai).
Usuário: ${username}
Senha temporária: ${password}

Acessar o sistema: ${accessUrl}

Por segurança, altere a senha no primeiro acesso.`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, email, password, accessUrl }: WelcomeEmailRequest = await req.json();

    if (!username || !email || !password) {
      return new Response(
        JSON.stringify({ error: 'username, email e password são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const smtpHost = Deno.env.get('SMTP_HOST');
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromEmail = Deno.env.get('SMTP_FROM_EMAIL');
    const fromName = Deno.env.get('SMTP_FROM_NAME') || 'Z3US';

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      console.error('Missing SMTP configuration');
      return new Response(
        JSON.stringify({ error: 'Configuração SMTP incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const finalAccessUrl = accessUrl || 'https://dachser.z3us.ai/';
    const htmlContent = buildWelcomeHtml(username, password, finalAccessUrl);
    const textContent = buildWelcomeText(username, password, finalAccessUrl);

    console.log(`Sending welcome email to ${email} via ${smtpHost}:${smtpPort}`);

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    });

    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: `Bem-vindo(a) ao Z3US`,
      content: textContent,
      html: htmlContent,
    });

    await client.close();

    console.log(`Welcome email sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: 'E-mail enviado com sucesso' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Send Welcome Email Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro ao enviar e-mail', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
