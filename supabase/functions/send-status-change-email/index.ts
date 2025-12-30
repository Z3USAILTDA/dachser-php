import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string | string[];
  subject: string;
  awb: string;
  hawb?: string;
  old_status?: string;
  new_status: string;
  destinatario?: string;
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
    const { to, subject, awb, hawb, old_status, new_status, destinatario, origem, destino, custom_message } = body;

    if (!to || !awb || !new_status) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, awb, new_status' }),
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

    // Build email content
    const statusChangeHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atualização de Status - AWB ${awb}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #050608; padding: 20px; text-align: center; }
    .header img { max-height: 50px; }
    .content { padding: 30px; }
    .status-box { background-color: #f8f9fa; border-left: 4px solid #F5B843; padding: 15px; margin: 20px 0; }
    .status-change { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
    .status-badge { padding: 5px 12px; border-radius: 4px; font-weight: bold; }
    .status-old { background-color: #e9ecef; color: #495057; }
    .status-new { background-color: #F5B843; color: #000000; }
    .arrow { font-size: 20px; color: #666; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .info-table td { padding: 10px; border-bottom: 1px solid #eee; }
    .info-table td:first-child { font-weight: bold; color: #666; width: 120px; }
    .footer { background-color: #050608; color: #ffffff; padding: 20px; text-align: center; font-size: 12px; }
    .footer a { color: #F5B843; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://z3us.ai/logo-branco.png" alt="Z3US" />
    </div>
    <div class="content">
      <h2 style="color: #333; margin-bottom: 20px;">Atualização de Status de Rastreamento</h2>
      
      <div class="status-box">
        <p style="margin: 0 0 10px 0; color: #666;">AWB: <strong>${awb}</strong></p>
        ${hawb ? `<p style="margin: 0 0 10px 0; color: #666;">HAWB: <strong>${hawb}</strong></p>` : ''}
        <div class="status-change">
          ${old_status ? `<span class="status-badge status-old">${old_status}</span><span class="arrow">→</span>` : ''}
          <span class="status-badge status-new">${new_status}</span>
        </div>
      </div>

      <table class="info-table">
        ${destinatario ? `<tr><td>Destinatário</td><td>${destinatario}</td></tr>` : ''}
        ${origem ? `<tr><td>Origem</td><td>${origem}</td></tr>` : ''}
        ${destino ? `<tr><td>Destino</td><td>${destino}</td></tr>` : ''}
        <tr><td>Data/Hora</td><td>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
      </table>

      ${custom_message ? `
      <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;">${custom_message}</p>
      </div>
      ` : ''}

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Este é um email automático do sistema de rastreamento Z3US. Para mais detalhes, acesse a plataforma.
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
Atualização de Status de Rastreamento

AWB: ${awb}
${hawb ? `HAWB: ${hawb}` : ''}
${old_status ? `Status anterior: ${old_status}` : ''}
Novo status: ${new_status}

${destinatario ? `Destinatário: ${destinatario}` : ''}
${origem ? `Origem: ${origem}` : ''}
${destino ? `Destino: ${destino}` : ''}
Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

${custom_message || ''}

---
Z3US.AI - Inteligência Logística
https://z3us.ai
    `.trim();

    // Send via Resend
    const recipients = Array.isArray(to) ? to : [to];
    
    const startTime = Date.now();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Z3US Tracking <noreply@hermes.z3us.ai>',
        to: recipients,
        subject: subject || `[Z3US] Atualização AWB ${awb} - ${new_status}`,
        html: statusChangeHtml,
        text: plainText,
      }),
    });
    const elapsed = Date.now() - startTime;

    // Log API call
    const logApiCall = async () => {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseKey) return;
        
        await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'log_api_call',
            api_name: 'Resend (Email)',
            endpoint: '/emails',
            method: 'POST',
            status_code: response.status,
            response_time_ms: elapsed,
            error_message: response.ok ? undefined : 'Email send failed',
            edge_function: 'send-status-change-email'
          }),
        });
      } catch (e) {
        console.error('[logApiCall] Failed:', e);
      }
    };
    logApiCall(); // Fire and forget

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Email send failed: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log(`Email sent successfully for AWB ${awb} to ${recipients.join(', ')}`);

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in send-status-change-email:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
