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
  email_type?: 'interno' | 'cliente'; // Tipo de email
}

// Tradução de status para português - status real traduzido
function getCustomerFriendlyStatus(status: string | null | undefined): string {
  if (!status) return 'N/A';
  
  const statusMap: Record<string, string> = {
    // Booking / Reserva
    'BOOKED': 'Reserva confirmada',
    'BOOKING': 'Reserva confirmada',
    'BOOKING_CONFIRMED': 'Reserva confirmada',
    
    // Coleta / Pickup
    'EMPTY_TO_SHIPPER': 'Coleta da carga',
    'Empty to shipper': 'Coleta da carga',
    'PICKED_UP': 'Carga coletada',
    'PICKUP': 'Coleta da carga',
    'EMPTY_PICK_UP': 'Container vazio retirado',
    
    // Entrada no terminal
    'GATE_IN': 'Entrada no terminal',
    'GATE_IN_FULL': 'Entrada no terminal',
    'RECEIVED': 'Recebido no terminal',
    'RECEIVED_FOR_EXPORT': 'Recebido para exportação',
    'Received for export transfer': 'Recebido para transferência',
    
    // Carregamento
    'LOADED': 'Carregado no navio',
    'LOADING': 'Carregando',
    'LOADED_ON_VESSEL': 'Carregado no navio',
    'Loaded on board': 'Carregado no navio',
    'LOAD': 'Carregado',
    
    // Partida / Em trânsito
    'DEPARTED': 'Em trânsito marítimo',
    'DEPARTURE': 'Partida do navio',
    'VESSEL_DEPARTURE': 'Partida do navio',
    'Departed by Vessel': 'Em trânsito marítimo',
    'Vessel Departure': 'Partida do navio',
    'IN_TRANSIT': 'Em trânsito marítimo',
    'Container in transit': 'Em trânsito marítimo',
    'Container in transit for export': 'Em trânsito para exportação',
    
    // Transbordo
    'TRANSSHIPMENT': 'Em transbordo',
    'TRANSHIPMENT_ARRIVAL': 'Chegada em transbordo',
    'TRANSHIPMENT_DEPARTURE': 'Partida de transbordo',
    
    // Chegada
    'ARRIVED': 'Chegada no porto de destino',
    'ARRIVAL': 'Chegada no porto',
    'VESSEL_ARRIVAL': 'Chegada do navio',
    'ARRIVED_AT_PORT': 'Chegada no porto',
    
    // Descarga
    'DISCHARGED': 'Descarregado do navio',
    'DISCHARGE': 'Descarga do navio',
    'UNLOADED': 'Descarregado',
    
    // Alfândega
    'CUSTOMS_HOLD': 'Retenção aduaneira',
    'CUSTOMS_RELEASED': 'Liberado pela alfândega',
    'CUSTOMS_INSPECTION': 'Inspeção aduaneira',
    'CUSTOMS_CLEARED': 'Desembaraço concluído',
    
    // Saída do terminal / Liberação
    'GATE_OUT': 'Saída do terminal',
    'GATE_OUT_FULL': 'Saída do terminal',
    'GATE_OUT_EMPTY': 'Saída de container vazio',
    'RELEASED': 'Liberado para retirada',
    
    // Entrega
    'DELIVERED': 'Entregue ao cliente',
    'DELIVERY': 'Em entrega',
    'CONTAINER_TO_CONSIGNEE': 'Entregue ao consignatário',
    'Container to consignee': 'Entregue ao consignatário',
    
    // Devolução de vazio
    'EMPTY_RETURNED': 'Container vazio devolvido',
    'EMPTY_IN': 'Devolução de container vazio',
    'EMPTY_RECEIVED': 'Container vazio recebido',
    'Empty returned by Truck': 'Vazio devolvido por caminhão',
    'Empty received at CY': 'Vazio recebido no pátio',
    'Empty in depot': 'Vazio no depósito',
    
    // Alertas
    'DELAYED': 'Atrasado',
    'DELAY': 'Atraso',
    'CANCELLED': 'Cancelado',
    'MISSED_CONNECTION': 'Conexão perdida',
    'HELD': 'Retido',
    'HOLD': 'Retido',
  };
  
  // Busca exata
  if (statusMap[status]) {
    return statusMap[status];
  }
  
  // Busca case-insensitive
  const upperStatus = status.toUpperCase().replace(/[_\s-]/g, '_');
  for (const [key, value] of Object.entries(statusMap)) {
    if (key.toUpperCase().replace(/[_\s-]/g, '_') === upperStatus) {
      return value;
    }
  }
  
  // Busca parcial para status não mapeados
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('empty') && lowerStatus.includes('shipper')) return 'Coleta da carga';
  if (lowerStatus.includes('load')) return 'Carregado no navio';
  if (lowerStatus.includes('depart')) return 'Em trânsito marítimo';
  if (lowerStatus.includes('transit')) return 'Em trânsito marítimo';
  if (lowerStatus.includes('arriv')) return 'Chegada no porto';
  if (lowerStatus.includes('discharg')) return 'Descarregado do navio';
  if (lowerStatus.includes('deliver')) return 'Entregue ao cliente';
  if (lowerStatus.includes('gate') && lowerStatus.includes('out')) return 'Saída do terminal';
  if (lowerStatus.includes('gate') && lowerStatus.includes('in')) return 'Entrada no terminal';
  if (lowerStatus.includes('custom')) return 'Em processo aduaneiro';
  if (lowerStatus.includes('transship')) return 'Em transbordo';
  
  // Retorna o status original se não houver tradução
  return status;
}

// Check if status is alert/delay
function isAlertStatus(status: string): boolean {
  const upperStatus = status.toUpperCase();
  return upperStatus.includes('DELAY') || upperStatus.includes('HOLD') || 
         upperStatus.includes('CANCEL') || upperStatus.includes('MISS');
}

// Get status badge color
function getStatusColor(status: string): { bg: string; text: string; style?: string } {
  const upperStatus = status.toUpperCase();

  if (isAlertStatus(upperStatus)) {
    return {
      bg: '#ff0000',
      text: '#ffffff',
      style: 'font-weight: bold; border: 3px solid #cc0000; box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);',
    };
  }
  if (upperStatus.includes('ARR') || upperStatus.includes('DELIVERED') || upperStatus.includes('DISCHARGED')) {
    return { bg: '#d4edda', text: '#155724' };
  }
  if (upperStatus.includes('DEP') || upperStatus.includes('TRANSIT') || upperStatus.includes('LOADED')) {
    return { bg: '#cce5ff', text: '#004085' };
  }
  if (upperStatus.includes('TRANS') || upperStatus.includes('BOOKING')) {
    return { bg: '#fff3cd', text: '#856404' };
  }
  return { bg: '#e9ecef', text: '#495057' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest = await req.json();
    const { to, container, vessel, shipping_line, status, eta, consignee, origem, destino, custom_message, email_type } = body;

    // Sempre enviar para devs@z3us.ai (hardcoded por enquanto)
    const recipient = 'devs@z3us.ai';
    
    console.log(`[send-container-status-email] Received request:`, JSON.stringify(body));
    console.log(`[send-container-status-email] Email type: ${email_type || 'interno'}`);
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
    let formattedEta = '—';
    if (eta) {
      try {
        const etaDate = new Date(eta);
        if (!isNaN(etaDate.getTime())) {
          formattedEta = etaDate.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric'
          });
        }
      } catch (e) {
        formattedEta = eta;
      }
    }

    // Format current date
    const now = new Date();
    const formattedNow = now.toLocaleString('pt-BR', { 
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    }) + ' (horário de Brasília)';

    const friendlyStatus = getCustomerFriendlyStatus(status);
    const statusColors = getStatusColor(status || '');
    const isAlert = isAlertStatus(status || '');
    const extraStyle = statusColors.style || '';

    console.log(`[send-container-status-email] Status: "${status}" -> "${friendlyStatus}"`);

    let htmlBody: string;
    let emailSubject: string;

    if (email_type === 'cliente') {
      // EMAIL PARA CLIENTE - Formato simplificado igual ao AWB
      emailSubject = `${container} - ${friendlyStatus} | ETA: ${formattedEta}`;
      
      htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Status da Carga</title>
</head>
<body style="margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f6f8; padding: 20px 0;">
<tr>
<td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
<tr>
  <td style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #FF9933 100%); padding: 32px 24px; text-align: center;">
    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Atualização de Status</h1>
  </td>
</tr>
<tr>
<td style="padding: 32px 24px;">
  <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">Prezado cliente,</p>
  
  <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
    Informamos que a carga enviada sob Container <strong>${container}</strong> teve seu status atualizado para <strong>${friendlyStatus}</strong>.
  </p>
  
  <table cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0; border-left: 4px solid #FF9933; padding-left: 16px;">
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Armador:</td>
      <td style="padding: 8px 0 8px 16px; color: #1f2937; font-size: 14px; font-weight: 500;">${shipping_line || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Origem:</td>
      <td style="padding: 8px 0 8px 16px; color: #1f2937; font-size: 14px; font-weight: 500;">${origem || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Destino:</td>
      <td style="padding: 8px 0 8px 16px; color: #1f2937; font-size: 14px; font-weight: 500;">${destino || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">ETA (Previsão de Chegada):</td>
      <td style="padding: 8px 0 8px 16px; color: #1f2937; font-size: 14px; font-weight: 500;">${formattedEta}</td>
    </tr>
  </table>
  
  ${custom_message ? `
  <div style="margin: 24px 0; padding: 16px; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px;">
    <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;"><strong>Mensagem:</strong> ${custom_message}</p>
  </div>
  ` : ''}
  
  <p style="margin: 32px 0 0 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
    Para quaisquer informações adicionais pertinentes ao envio de sua carga por gentileza consulte o analista responsável pelo seu embarque.
  </p>
</td>
</tr>
<tr>
  <td style="background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
    <img src="https://erwldnydbwecnkvodegm.supabase.co/storage/v1/object/public/assets/dachser-logo-email.png" alt="Dachser - Intelligent Logistics" style="display: block; margin: 0 auto 12px auto; border: 0; width: 200px;" />
    <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">Este é um e-mail automático. Em caso de dúvidas, entre em contato com a Dachser.</p>
  </td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
    } else {
      // EMAIL INTERNO (ANALISTA) - Formato com tabela igual ao AWB
      emailSubject = `${container} - ${friendlyStatus} | ETA: ${formattedEta}`;
      
      const rowBg = isAlert ? 'rgba(255, 0, 0, 0.15)' : '#ffffff';
      const rowStyle = isAlert
        ? `background-color: ${rowBg}; border: 3px solid #ff0000; box-shadow: 0 0 15px rgba(255, 0, 0, 0.4);`
        : `background-color: ${rowBg};`;
      const cellStyle = isAlert ? 'color: #8b0000; font-weight: bold;' : 'color: #495057;';

      htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de Status - Container</title>
</head>
<body style="margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f6f8; padding: 20px 0;">
<tr>
<td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 900px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
<tr>
  <td style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #FF9933 100%); padding: 32px 24px; text-align: center;">
    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Relatório de Status – Rastreio Marítimo</h1>
  </td>
</tr>
<tr>
<td style="padding: 32px 24px;">
<p style="margin: 0 0 16px 0; color: #1f2937; font-size: 16px; line-height: 1.5;">Olá,</p>
<p style="margin: 0 0 24px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">Segue abaixo o status atualizado do container rastreado:</p>

<div style="background-color: #fff5eb; border-left: 4px solid #FF9933; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
<p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;"><strong>Container:</strong> ${container}</p>
</div>

<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin-top: 24px; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
<thead>
<tr style="background-color: #f8f9fa;">
<th style="padding: 14px 12px; text-align: left; font-weight: 600; font-size: 13px; color: #495057; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6;">Container</th>
<th style="padding: 14px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #495057; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6;">Armador</th>
<th style="padding: 14px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #495057; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6;">ETA</th>
<th style="padding: 14px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #495057; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6;">Status Atual</th>
<th style="padding: 14px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #495057; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dee2e6;">Data do Envio</th>
</tr>
</thead>
<tbody>
<tr style="${rowStyle}">
  <td style="padding: 16px 12px; border-bottom: 1px solid #dee2e6; ${cellStyle} font-weight: 600;">${container}</td>
  <td style="padding: 16px 12px; border-bottom: 1px solid #dee2e6; text-align: center; ${cellStyle}">${shipping_line || '—'}</td>
  <td style="padding: 16px 12px; border-bottom: 1px solid #dee2e6; text-align: center; ${cellStyle}">${formattedEta}</td>
  <td style="padding: 16px 12px; border-bottom: 1px solid #dee2e6; text-align: center;">
    <span style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background-color: ${statusColors.bg}; color: ${statusColors.text}; ${extraStyle}">${friendlyStatus}</span>
  </td>
  <td style="padding: 16px 12px; border-bottom: 1px solid #dee2e6; text-align: center; font-size: 13px; ${cellStyle}">${formattedNow}</td>
</tr>
</tbody>
</table>

${custom_message ? `
<div style="margin: 24px 0; padding: 16px; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px;">
  <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;"><strong>Mensagem:</strong> ${custom_message}</p>
</div>
` : ''}

<div style="text-align: center; margin: 32px 0;">
  <a href="https://dachser.z3us.ai/sea/tracking" style="display: inline-block; background-color: #FF9933; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(255, 153, 51, 0.3);">Acessar painel de rastreio</a>
</div>
</td>
</tr>
<tr>
  <td style="background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
    <img src="https://erwldnydbwecnkvodegm.supabase.co/storage/v1/object/public/assets/dachser-logo-email.png" alt="Dachser - Intelligent Logistics" style="display: block; margin: 0 auto 12px auto; border: 0; width: 200px;" />
    <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">Este é um e-mail automático gerado pelo sistema de rastreamento marítimo.</p>
  </td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
    }

    const plainText = `
${email_type === 'cliente' ? 'Atualização de Status' : 'Relatório de Status - Rastreio Marítimo'}

Container: ${container}
Armador: ${shipping_line || '—'}
Status: ${friendlyStatus}
Origem: ${origem || '—'}
Destino: ${destino || '—'}
ETA: ${formattedEta}
Data: ${formattedNow}

${custom_message || ''}

---
Dachser - Intelligent Logistics
    `.trim();

    console.log(`[send-container-status-email] Sending email via Resend API...`);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dachser Rastreio <noreply@hermes.z3us.ai>',
        to: [recipient],
        subject: emailSubject,
        html: htmlBody,
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
    console.log(`[send-container-status-email] Email sent successfully! ID: ${result.id}, Container: ${container}, To: ${recipient}, Type: ${email_type || 'interno'}`);

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
