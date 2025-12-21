import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string;
  container: string;
  vessel?: string;
  shipping_line?: string;
  status?: string;
  eta?: string;
  consignee?: string;
  origem?: string;
  destino?: string;
  custom_message?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest = await req.json();
    const { to, container, vessel, shipping_line, status, eta, consignee, origem, destino, custom_message } = body;

    // Sempre enviar para devs@z3us.ai (hardcoded por enquanto)
    const recipient = 'devs@z3us.ai';
    
    console.log(`[send-container-status-email] Request to send to ${to}, but sending to ${recipient} instead`);

    if (!container) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: container' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format ETA for display
    const formattedEta = eta ? new Date(eta).toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    }) : null;

    // Build email content (SEM BL conforme solicitado)
    const statusChangeHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atualização de Status - Container ${container}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #050608; padding: 20px; text-align: center; }
    .header img { max-height: 50px; }
    .content { padding: 30px; }
    .status-box { background-color: #f8f9fa; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; }
    .status-badge { padding: 8px 16px; border-radius: 4px; font-weight: bold; background-color: #0ea5e9; color: #ffffff; display: inline-block; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .info-table td { padding: 12px 10px; border-bottom: 1px solid #eee; }
    .info-table td:first-child { font-weight: bold; color: #666; width: 140px; }
    .info-table td:last-child { color: #333; }
    .footer { background-color: #050608; color: #ffffff; padding: 20px; text-align: center; font-size: 12px; }
    .footer a { color: #0ea5e9; text-decoration: none; }
    .custom-message { background-color: #e0f2fe; border: 1px solid #0ea5e9; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .custom-message p { margin: 0; color: #0369a1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://z3us.ai/logo-branco.png" alt="Z3US" />
    </div>
    <div class="content">
      <h2 style="color: #333; margin-bottom: 20px;">🚢 Atualização de Status - Rastreio Marítimo</h2>
      
      <div class="status-box">
        <p style="margin: 0 0 10px 0; color: #666;">Container: <strong style="font-size: 1.2em; color: #333;">${container}</strong></p>
        ${status ? `<span class="status-badge">${status}</span>` : ''}
      </div>

      <table class="info-table">
        ${vessel ? `<tr><td>🛳️ Navio</td><td>${vessel}</td></tr>` : ''}
        ${shipping_line ? `<tr><td>📦 Armador</td><td>${shipping_line}</td></tr>` : ''}
        ${consignee ? `<tr><td>👤 Consignatário</td><td>${consignee}</td></tr>` : ''}
        ${origem ? `<tr><td>📍 Origem</td><td>${origem}</td></tr>` : ''}
        ${destino ? `<tr><td>🎯 Destino</td><td>${destino}</td></tr>` : ''}
        ${formattedEta ? `<tr><td>📅 ETA</td><td>${formattedEta}</td></tr>` : ''}
        <tr><td>⏰ Data/Hora</td><td>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
      </table>

      ${custom_message ? `
      <div class="custom-message">
        <p><strong>📝 Mensagem:</strong></p>
        <p style="margin-top: 8px;">${custom_message}</p>
      </div>
      ` : ''}

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Este é um email automático do sistema de rastreamento marítimo Z3US. Para mais detalhes, acesse a plataforma.
      </p>
    </div>
    <div class="footer">
      <p>Z&#8203;3US.AI - Inteligência Logística</p>
      <p><a href="https://z3us.ai">z3us.ai</a></p>
    </div>
  </div>
</body>
</html>
    `;

    const plainText = `
Atualização de Status - Rastreio Marítimo

Container: ${container}
${status ? `Status: ${status}` : ''}
${vessel ? `Navio: ${vessel}` : ''}
${shipping_line ? `Armador: ${shipping_line}` : ''}
${consignee ? `Consignatário: ${consignee}` : ''}
${origem ? `Origem: ${origem}` : ''}
${destino ? `Destino: ${destino}` : ''}
${formattedEta ? `ETA: ${formattedEta}` : ''}
Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

${custom_message || ''}

---
Z3US.AI - Inteligência Logística
https://z3us.ai
    `.trim();

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Z3US Maritime <noreply@hermes.z3us.ai>',
        to: [recipient],
        subject: `[Z3US] Container ${container} - ${status || 'Atualização de Status'}`,
        html: statusChangeHtml,
        text: plainText,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Email send failed: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log(`[send-container-status-email] Email sent successfully for Container ${container} to ${recipient}`);

    return new Response(
      JSON.stringify({ success: true, id: result.id, sent_to: recipient }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[send-container-status-email] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
