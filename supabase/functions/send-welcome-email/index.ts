import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  username: string;
  password: string;
}

const generateEmailHtml = (username: string, password: string): string => {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Z3US.AI - DACHSER</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #050608;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, rgba(4, 10, 30, 0.95), rgba(26, 93, 173, 0.3)); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <h1 style="margin: 0; color: #ffc800; font-size: 28px; font-weight: 600;">Z3US.AI</h1>
              <p style="margin: 8px 0 0; color: #b9c4e0; font-size: 14px;">Plataforma de Inteligência Logística</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #f5f7ff; font-size: 22px; font-weight: 500;">
                Bem-vindo(a), ${username}!
              </h2>
              
              <p style="margin: 0 0 20px; color: #b9c4e0; font-size: 15px; line-height: 1.6;">
                Sua conta no sistema DACHSER foi criada com sucesso. Abaixo estão suas credenciais de acesso:
              </p>
              
              <!-- Credentials Box -->
              <table role="presentation" style="width: 100%; margin: 25px 0; background: rgba(2, 8, 26, 0.6); border-radius: 12px; border: 1px solid rgba(255, 200, 0, 0.2);">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #b9c4e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Usuário</span>
                          <p style="margin: 6px 0 0; color: #ffc800; font-size: 18px; font-weight: 600;">${username}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 8px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                          <span style="color: #b9c4e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Senha Temporária</span>
                          <p style="margin: 6px 0 0; color: #ffc800; font-size: 18px; font-weight: 600; font-family: monospace;">${password}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Warning -->
              <table role="presentation" style="width: 100%; margin: 25px 0; background: rgba(255, 200, 0, 0.08); border-radius: 8px; border-left: 4px solid #ffc800;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; color: #f5f7ff; font-size: 14px; line-height: 1.5;">
                      <strong style="color: #ffc800;">⚠️ Importante:</strong> Recomendamos alterar sua senha no primeiro acesso para garantir a segurança da sua conta.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 25px 0 0; color: #b9c4e0; font-size: 14px; line-height: 1.6;">
                Em caso de dúvidas, entre em contato com o administrador do sistema.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 25px 40px; background: rgba(0, 0, 0, 0.3); border-top: 1px solid rgba(255, 255, 255, 0.05);">
              <p style="margin: 0; color: #6b7a99; font-size: 12px; text-align: center;">
                Este é um e-mail automático. Por favor, não responda.
              </p>
              <p style="margin: 10px 0 0; color: #6b7a99; font-size: 12px; text-align: center;">
                powered by <span style="color: #ffc800; font-weight: 600;">Z3US.AI</span> • DACHSER Brasil
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const generateEmailText = (username: string, password: string): string => {
  return `
Bem-vindo(a) ao Z3US.AI - DACHSER!

Sua conta foi criada com sucesso.

CREDENCIAIS DE ACESSO:
- Usuário: ${username}
- Senha Temporária: ${password}

IMPORTANTE: Recomendamos alterar sua senha no primeiro acesso.

Em caso de dúvidas, entre em contato com o administrador do sistema.

---
Este é um e-mail automático. Por favor, não responda.
powered by Z3US.AI • DACHSER Brasil
`;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, username, password }: WelcomeEmailRequest = await req.json();

    if (!email || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Email, username e password são obrigatórios", success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL");
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "Z3US.AI - DACHSER";

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      console.error("Missing SMTP configuration");
      return new Response(
        JSON.stringify({ error: "Configuração SMTP incompleta", success: false }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending welcome email to: ${email} (user: ${username})`);

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
      subject: `Bem-vindo ao Z3US.AI - Suas credenciais de acesso`,
      content: generateEmailText(username, password),
      html: generateEmailHtml(username, password),
    });

    await client.close();

    console.log(`Welcome email sent successfully to: ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "E-mail enviado com sucesso" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in send-welcome-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Erro ao enviar e-mail", details: errorMessage, success: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
