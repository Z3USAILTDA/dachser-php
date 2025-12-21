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
  old_status?: string;
  eta?: string;
  consignee?: string;
  origem?: string;
  destino?: string;
  custom_message?: string;
}

// Tradução de status para português
function translateStatus(status: string | null | undefined): string {
  if (!status) return 'N/A';
  
  const translations: Record<string, string> = {
    'BOOKED': 'Reserva confirmada',
    'BOOKING': 'Reserva confirmada',
    'BOOKING_CONFIRMED': 'Reserva confirmada',
    'BOOKING_CREATED': 'Reserva criada',
    'PENDING': 'Pendente',
    'EMPTY_TO_SHIPPER': 'Container vazio enviado ao embarcador',
    'EMPTY_PICK_UP': 'Container vazio retirado',
    'GATE_OUT_EMPTY': 'Saída de container vazio',
    'PICKED_UP': 'Coletado',
    'PICKUP': 'Coleta',
    'Empty to shipper': 'Container vazio enviado ao embarcador',
    'GATE_IN_FULL': 'Entrada de container cheio',
    'FULL_IN': 'Entrada cheio',
    'RECEIVED': 'Recebido',
    'RECEIVED_FOR_EXPORT': 'Recebido para exportação',
    'RECEIVED_FOR_EXPORT_TRANSFER': 'Recebido para transferência de exportação',
    'Received for export transfer': 'Recebido para transferência de exportação',
    'LOADED': 'Carregado',
    'LOAD': 'Carregado',
    'LOADED_ON_VESSEL': 'Carregado no navio',
    'LOADING': 'Carregando',
    'Loaded on board': 'Carregado a bordo',
    'DEPARTED': 'Partiu',
    'DEPARTURE': 'Partida',
    'VESSEL_DEPARTURE': 'Partida do navio',
    'DEPARTED_BY_VESSEL': 'Partiu via navio',
    'Vessel Departure': 'Partida do navio',
    'Departed by Vessel': 'Partiu via navio',
    'IN_TRANSIT': 'Em trânsito',
    'TRANSSHIPMENT': 'Em transbordo',
    'TRANSHIPMENT_ARRIVAL': 'Chegada em transbordo',
    'TRANSHIPMENT_DEPARTURE': 'Partida de transbordo',
    'Container in transit': 'Container em trânsito',
    'Container in transit for export': 'Container em trânsito para exportação',
    'ARRIVED': 'Chegou',
    'ARRIVAL': 'Chegada',
    'VESSEL_ARRIVAL': 'Chegada do navio',
    'ARRIVED_AT_PORT': 'Chegou ao porto',
    'DISCHARGED': 'Descarregado',
    'DISCHARGE': 'Descarga',
    'UNLOADED': 'Descarregado',
    'CUSTOMS_HOLD': 'Retenção aduaneira',
    'CUSTOMS_RELEASED': 'Liberado pela alfândega',
    'CUSTOMS_INSPECTION': 'Inspeção aduaneira',
    'GATE_OUT': 'Saída do terminal',
    'GATE_OUT_FULL': 'Saída de container cheio',
    'RELEASED': 'Liberado',
    'DELIVERED': 'Entregue',
    'DELIVERY': 'Entrega',
    'CONTAINER_TO_CONSIGNEE': 'Container entregue ao consignatário',
    'Container to consignee': 'Container entregue ao consignatário',
    'EMPTY_RETURNED': 'Container vazio devolvido',
    'EMPTY_IN': 'Entrada de container vazio',
    'EMPTY_RECEIVED': 'Container vazio recebido',
    'Empty returned by Truck': 'Container vazio devolvido por caminhão',
    'Empty received at CY': 'Container vazio recebido no pátio',
    'Empty in depot': 'Container vazio no depósito',
    'DELAYED': 'Atrasado',
    'DELAY': 'Atraso',
    'CANCELLED': 'Cancelado',
    'MISSED_CONNECTION': 'Conexão perdida',
  };
  
  if (translations[status]) {
    return translations[status];
  }
  
  const upperStatus = status.toUpperCase().replace(/[_\s-]/g, '_');
  for (const [key, value] of Object.entries(translations)) {
    if (key.toUpperCase().replace(/[_\s-]/g, '_') === upperStatus) {
      return value;
    }
  }
  
  return status;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest = await req.json();
    const { to, container, vessel, shipping_line, status, old_status, eta, consignee, origem, destino, custom_message } = body;

    // Sempre enviar para devs@z3us.ai (hardcoded por enquanto)
    const recipient = 'devs@z3us.ai';
    
    console.log(`[send-container-status-email] Received request:`, JSON.stringify(body));
    console.log(`[send-container-status-email] Sending to ${recipient} (original: ${to})`);

    if (!container) {
      console.error('[send-container-status-email] Missing container field');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: container' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('[send-container-status-email] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format ETA for display
    let formattedEta: string | null = null;
    if (eta) {
      try {
        const etaDate = new Date(eta);
        formattedEta = etaDate.toLocaleDateString('pt-BR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric'
        });
      } catch (e) {
        formattedEta = eta;
      }
    }

    // Traduz os status para português
    const translatedStatus = translateStatus(status);
    const translatedOldStatus = old_status ? translateStatus(old_status) : null;
    console.log(`[send-container-status-email] Status: "${status}" -> "${translatedStatus}"`);

    // Build email content - SEGUINDO EXATAMENTE O PADRÃO DO AWB
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
        <p style="margin: 0 0 10px 0; color: #666;">Container: <strong>${container}</strong></p>
        ${vessel ? `<p style="margin: 0 0 10px 0; color: #666;">Navio: <strong>${vessel}</strong></p>` : ''}
        <div class="status-change">
          ${translatedOldStatus ? `<span class="status-badge status-old">${translatedOldStatus}</span><span class="arrow">→</span>` : ''}
          <span class="status-badge status-new">${translatedStatus}</span>
        </div>
      </div>

      <table class="info-table">
        ${consignee ? `<tr><td>Destinatário</td><td>${consignee}</td></tr>` : ''}
        ${shipping_line ? `<tr><td>Armador</td><td>${shipping_line}</td></tr>` : ''}
        ${origem ? `<tr><td>Origem</td><td>${origem}</td></tr>` : ''}
        ${destino ? `<tr><td>Destino</td><td>${destino}</td></tr>` : ''}
        ${formattedEta ? `<tr><td>ETA</td><td>${formattedEta}</td></tr>` : ''}
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

Container: ${container}
${vessel ? `Navio: ${vessel}` : ''}
${translatedOldStatus ? `Status anterior: ${translatedOldStatus}` : ''}
Novo status: ${translatedStatus}

${consignee ? `Destinatário: ${consignee}` : ''}
${shipping_line ? `Armador: ${shipping_line}` : ''}
${origem ? `Origem: ${origem}` : ''}
${destino ? `Destino: ${destino}` : ''}
${formattedEta ? `ETA: ${formattedEta}` : ''}
Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

${custom_message || ''}

---
Z3US.AI - Inteligência Logística
https://z3us.ai
    `.trim();

    console.log(`[send-container-status-email] Sending email via Resend API...`);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Z3US Tracking <noreply@hermes.z3us.ai>',
        to: [recipient],
        subject: `[Z3US] Atualização Container ${container} - ${translatedStatus}`,
        html: statusChangeHtml,
        text: plainText,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[send-container-status-email] Resend API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Email send failed: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log(`[send-container-status-email] Email sent successfully! ID: ${result.id}, Container: ${container}, To: ${recipient}`);

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
