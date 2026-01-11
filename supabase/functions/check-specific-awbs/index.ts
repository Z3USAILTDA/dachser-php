import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWB Format Validation Function
function isValidAwbFormat(awb: string): { valid: boolean; reason?: string } {
  const cleaned = awb.trim();
  const formattedAwb = cleaned.includes('-') 
    ? cleaned 
    : `${cleaned.substring(0, 3)}-${cleaned.substring(3)}`;
  
  // Validation 1: Format XXX-XXXXXXXX (3 digits + dash + 8 digits)
  const awbFormatRegex = /^\d{3}-\d{8}$/;
  if (!awbFormatRegex.test(formattedAwb)) {
    return { valid: false, reason: 'Formato inválido (deve ser XXX-XXXXXXXX com apenas dígitos)' };
  }
  
  // Validation 2: Check digit (modulo 7)
  const serialPart = formattedAwb.split('-')[1];
  const serialNumber = parseInt(serialPart.substring(0, 7), 10);
  const checkDigit = parseInt(serialPart.substring(7, 8), 10);
  const calculatedCheckDigit = serialNumber % 7;
  
  if (calculatedCheckDigit !== checkDigit) {
    return { valid: false, reason: `Dígito verificador inválido (esperado: ${calculatedCheckDigit}, recebido: ${checkDigit})` };
  }
  
  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { awbs = [], action = 'check' } = body;

    console.log(`[check-specific-awbs] Action: ${action}, AWBs: ${awbs.join(', ')}`);

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('[check-specific-awbs] Connected to MariaDB');

    const results: Array<{
      awb: string;
      found: boolean;
      current_status?: string;
      validation: { valid: boolean; reason?: string };
      updated?: boolean;
    }> = [];

    for (const awb of awbs) {
      const awbValue = awb.toString().trim();
      const validation = isValidAwbFormat(awbValue);
      
      // Check if AWB exists in database
      const rows = await client.query(
        `SELECT awb, último_status, origem, destino, destinatário 
         FROM t_status_aereo 
         WHERE awb = ? OR awb = ?`,
        [awbValue, awbValue.replace('-', '')]
      );

      const found = rows.length > 0;
      const currentStatus = found ? rows[0]['último_status'] : undefined;
      
      const result: typeof results[0] = {
        awb: awbValue,
        found,
        current_status: currentStatus,
        validation,
      };

      // If action is 'fix' and AWB has invalid format, update it
      if (action === 'fix' && found && !validation.valid && currentStatus !== 'AWB_INVALID') {
        await client.execute(
          `UPDATE t_status_aereo 
           SET último_status = 'AWB_INVALID', 
               \`última atualização\` = NOW()
           WHERE awb = ? OR awb = ?`,
          [awbValue, awbValue.replace('-', '')]
        );
        result.updated = true;
      }

      results.push(result);
    }

    await client.close();

    // Summary
    const summary = {
      total: results.length,
      found_in_db: results.filter(r => r.found).length,
      invalid_format: results.filter(r => !r.validation.valid).length,
      updated: results.filter(r => r.updated).length,
    };

    console.log(`[check-specific-awbs] Summary:`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        summary,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[check-specific-awbs] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
