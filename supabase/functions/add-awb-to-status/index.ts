import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper function to extract status code/abbreviation
  const extractStatusCode = (lastEvent: string | null): string => {
    if (!lastEvent) return 'AGUARDANDO';
    
    // Error cases - check for exact status codes first
    if (lastEvent === 'NOT_FOUND' || 
        lastEvent.includes('AWB_NOT_FOUND') || 
        lastEvent.includes('Status não encontrado') || 
        lastEvent.includes('AWB não encontrado')) {
      return 'NOT_FOUND';
    }
    
    // Processing/Timeout cases
    if (lastEvent === 'PROCESSING' ||
        lastEvent.includes('PROCESSING') ||
        lastEvent.includes('Timeout') ||
        lastEvent.includes('timeout') ||
        lastEvent.includes('Processando')) {
      return 'Em Processamento';
    }
    
    if (lastEvent === 'COMPANY_NOT_REGISTERED' ||
        lastEvent.includes('COMPANY_NOT_REGISTERED') || 
        lastEvent.includes('Companhia não cadastrada') || 
        lastEvent.includes('Companhia não registrada')) {
      return 'COMPANY_NOT_REGISTERED';
    }
    
    if (lastEvent === 'ERRO' ||
        lastEvent.includes('Erro') || 
        lastEvent.includes('ERROR') || 
        lastEvent.includes('Failed') ||
        lastEvent.includes('erro no rastreio')) {
      return 'ERRO';
    }
    
    // If format is "CODE - Description", extract just the code
    if (lastEvent.includes(' - ')) {
      return lastEvent.split(' - ')[0].trim();
    }
    
    // Otherwise return first 3 characters as code
    return lastEvent.substring(0, 3).toUpperCase();
  };

  try {
    const { mawb, hawb, last_event, status, consignee_name, airline_code, nome_analista, email_analista, origin, destination, email_cliente, tipo_servico } = await req.json();
    
    // SANITIZE ALL INPUT DATA - Apply trim to prevent whitespace issues
    const sanitizedMawb = mawb ? mawb.toString().trim() : '';
    const sanitizedHawb = hawb ? hawb.toString().trim() : 'N/A';
    const sanitizedConsigneeName = consignee_name ? consignee_name.toString().trim() : 'N/A';
    const sanitizedNomeAnalista = nome_analista ? nome_analista.toString().trim() : 'N/A';
    const sanitizedEmailAnalista = email_analista ? email_analista.toString().trim() : null;
    const sanitizedOrigin = origin ? origin.toString().trim() : 'N/A';
    const sanitizedDestination = destination ? destination.toString().trim() : 'N/A';
    const sanitizedEmailCliente = email_cliente ? email_cliente.toString().trim() : null;
    const sanitizedTipoServico = tipo_servico ? tipo_servico.toString().trim() : 'N/A';
    
    // Extract airline code from AWB if not provided (first 3 digits)
    const finalAirlineCode = airline_code || (sanitizedMawb ? sanitizedMawb.substring(0, 3) : 'N/A');
    const finalConsigneeName = sanitizedConsigneeName;
    const finalHawb = sanitizedHawb;
    const finalNomeAnalista = sanitizedNomeAnalista;
    const finalEmailAnalista = sanitizedEmailAnalista;
    const finalOrigin = sanitizedOrigin;
    const finalDestination = sanitizedDestination;
    const finalEmailCliente = sanitizedEmailCliente;
    const finalTipoServico = sanitizedTipoServico;
    // Extract abbreviated status code
    const finalLastEvent = extractStatusCode(last_event);
    
    // Check if status is DIS or OFLD to set the delay date
    const isAlertStatus = finalLastEvent === 'DIS' || finalLastEvent === 'OFLD';
    
    console.log('Adding AWB to t_status_aereo:', { 
      mawb: sanitizedMawb, 
      finalConsigneeName, 
      finalAirlineCode,
      finalHawb,
      finalNomeAnalista,
      finalEmailAnalista,
      finalOrigin,
      finalDestination,
      finalEmailCliente,
      finalTipoServico,
      originalEvent: last_event,
      finalLastEvent,
      isAlertStatus
    });

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Insert AWB into t_status_aereo with correct column names
    // Columns: id, awb, destinatário, última atualização, último_status, origem, destino, hawb, nome_analista, email_analista, email_cliente, data_atraso, tipo_servico
    // During INSERT: use provided values, set data_atraso to NOW() if DIS/OFLD
    // During UPDATE: only update hawb/nome_analista/email_analista/email_cliente/tipo_servico if they are NOT 'N/A' or NULL (preserve existing values)
    // data_atraso: set to NOW() when DIS/OFLD first occurs, reset to NULL when status becomes DLV
    // Use sanitized AWB for insert - TRIM applied to prevent whitespace issues
    await client.execute(
      `INSERT INTO t_status_aereo (awb, destinatário, \`última atualização\`, último_status, origem, destino, hawb, nome_analista, email_analista, email_cliente, data_atraso, tipo_servico) 
       VALUES (TRIM(?), TRIM(?), NOW(), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), TRIM(?), ${isAlertStatus ? 'NOW()' : 'NULL'}, TRIM(?))
       ON DUPLICATE KEY UPDATE 
         destinatário = TRIM(?),
         \`última atualização\` = NOW(),
         último_status = TRIM(?),
         origem = IF(TRIM(?) != 'N/A', TRIM(?), origem),
         destino = IF(TRIM(?) != 'N/A', TRIM(?), destino),
         hawb = IF(TRIM(?) != 'N/A', TRIM(?), hawb),
         nome_analista = IF(TRIM(?) != 'N/A', TRIM(?), nome_analista),
         email_analista = IF(? IS NOT NULL AND TRIM(?) != '', TRIM(?), email_analista),
         email_cliente = IF(? IS NOT NULL AND TRIM(?) != '', TRIM(?), email_cliente),
         data_atraso = IF(TRIM(?) = 'DLV', NULL, IF(? = 1 AND data_atraso IS NULL, NOW(), data_atraso)),
         tipo_servico = IF(TRIM(?) != 'N/A', TRIM(?), tipo_servico)`,
      [
        sanitizedMawb, finalConsigneeName, finalLastEvent, finalOrigin, finalDestination, finalHawb, finalNomeAnalista, finalEmailAnalista, finalEmailCliente, finalTipoServico,
        finalConsigneeName, finalLastEvent, 
        finalOrigin, finalOrigin, 
        finalDestination, finalDestination, 
        finalHawb, finalHawb, 
        finalNomeAnalista, finalNomeAnalista,
        finalEmailAnalista, finalEmailAnalista, finalEmailAnalista,
        finalEmailCliente, finalEmailCliente, finalEmailCliente,
        finalLastEvent, isAlertStatus ? 1 : 0,
        finalTipoServico, finalTipoServico
      ]
    );

    await client.close();
    console.log('AWB added to t_status_aereo successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'AWB added to t_status_aereo' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error adding AWB to t_status_aereo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
