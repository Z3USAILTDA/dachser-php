import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetCodeRequest {
  email: string;
}

const generateEmailHtml = (username: string, code: string, forceTheme: string = "auto"): string => {
  const logoLight = "https://i.ibb.co/TgXzCqz/logo-preto.png";
  const logoDark = "https://i.ibb.co/sJkY7y5/logo-branco.png";
  const brand = "Z3US";
  const brandPlain = "Z3US&#8203;.AI";

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
<title>Recuperação de Senha</title>
<style>
  .bg{background:#fff}
  .panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .code-box{display:inline-block;background:rgba(255,165,0,.15);color:#ffa500;font-family:Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:8px;padding:16px 24px;border-radius:8px;border:2px dashed #ffa500}
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
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Recuperação de Senha</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Olá, <strong>${username}</strong>! Recebemos uma solicitação para redefinir sua senha no <span style="color:inherit;text-decoration:none">${brandPlain}</span> @ Dachser.
          </p>
        </td></tr>

        <tr><td style="padding:12px 28px 12px" align="center">
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px" class="muted">Seu código de verificação é:</p>
          <div class="code-box">${code}</div>
        </td></tr>

        <tr><td style="padding:12px 28px 22px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            <strong>⏱️ Este código expira em 15 minutos.</strong><br>
            Digite este código na tela de verificação para continuar com a redefinição de senha.
          </p>
        </td></tr>

        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">
            Caso não tenha solicitado esta recuperação de senha, ignore este e-mail. Sua conta permanecerá segura.
          </p>
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

const generateEmailText = (username: string, code: string): string => {
  return `Recuperação de Senha - Z3US.AI @ Dachser

Olá, ${username}!

Recebemos uma solicitação para redefinir sua senha.

Seu código de verificação é: ${code}

Este código expira em 15 minutos.

Digite este código na tela de verificação para continuar com a redefinição de senha.

Caso não tenha solicitado esta recuperação de senha, ignore este e-mail.`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let dbClient: Client | null = null;

  try {
    const { email }: ResetCodeRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail é obrigatório", success: false }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`Password reset requested for: ${normalizedEmail}`);

    // Connect to MariaDB
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(JSON.stringify({ error: "Configuração de banco de dados incompleta", success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    dbClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Check if email exists
    const users = await dbClient.query(
      'SELECT id, username, email FROM ai_agente.t_users_dachser WHERE email = ?',
      [normalizedEmail]
    );

    if (!users || users.length === 0) {
      console.log(`Email not found: ${normalizedEmail}`);
      // Return success even if email not found (security best practice)
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Se o e-mail estiver cadastrado, você receberá um código de verificação." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = users[0];
    console.log(`User found: ${user.username} (ID: ${user.id})`);

    // Create reset codes table if not exists
    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS ai_agente.t_password_reset_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        user_id INT NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_code (code)
      )
    `);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    // Invalidate any previous codes for this email
    await dbClient.execute(
      'UPDATE ai_agente.t_password_reset_codes SET used = 1 WHERE email = ? AND used = 0',
      [normalizedEmail]
    );

    // Insert new code
    await dbClient.execute(
      'INSERT INTO ai_agente.t_password_reset_codes (email, code, user_id, expires_at) VALUES (?, ?, ?, ?)',
      [normalizedEmail, code, user.id, expiresAtStr]
    );

    console.log(`Reset code created: ${code} for user ${user.username}`);

    // Send email with Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ error: "Configuração de e-mail incompleta", success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resend = new Resend(resendApiKey);

    const { data, error } = await resend.emails.send({
      from: "Z3US.AI - DACHSER <noreply@hermes.z3us.ai>",
      to: [normalizedEmail],
      subject: "Código de Recuperação de Senha - Z3US",
      html: generateEmailHtml(user.username, code),
      text: generateEmailText(user.username, code),
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: "Erro ao enviar e-mail", details: error.message, success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Reset code email sent to: ${normalizedEmail}, id: ${data?.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Código de verificação enviado para seu e-mail.",
      emailId: data?.id 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: unknown) {
    console.error("Error in send-password-reset-code:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Erro ao processar solicitação", details: errorMessage, success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } finally {
    if (dbClient) {
      await dbClient.close();
    }
  }
};

serve(handler);
