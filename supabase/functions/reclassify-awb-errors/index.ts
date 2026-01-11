import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWB Format Validation Function
function isValidAwbFormat(awb: string): { valid: boolean; reason?: string } {
  // Remove spaces and format
  const cleaned = awb.trim();
  const formattedAwb = cleaned.includes('-') 
    ? cleaned 
    : `${cleaned.substring(0, 3)}-${cleaned.substring(3)}`;
  
  // Validation 1: Format XXX-XXXXXXXX (3 digits + dash + 8 digits)
  const awbFormatRegex = /^\d{3}-\d{8}$/;
  if (!awbFormatRegex.test(formattedAwb)) {
    return { valid: false, reason: 'Formato inválido (deve ser XXX-XXXXXXXX)' };
  }
  
  // Validation 2: Check digit (modulo 7)
  const serialPart = formattedAwb.split('-')[1]; // 8 digits after dash
  const serialNumber = parseInt(serialPart.substring(0, 7), 10); // First 7 digits
  const checkDigit = parseInt(serialPart.substring(7, 8), 10); // Last digit (8th)
  const calculatedCheckDigit = serialNumber % 7;
  
  if (calculatedCheckDigit !== checkDigit) {
    return { valid: false, reason: `Dígito verificador inválido (esperado: ${calculatedCheckDigit}, recebido: ${checkDigit})` };
  }
  
  return { valid: true };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'preview', limit = 500 } = body;

    console.log(`[reclassify-awb-errors] Action: ${action}, Limit: ${limit}`);

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('[reclassify-awb-errors] Connected to MariaDB');

    // Fetch AWBs with ERRO status that might be AWB_INVALID
    const rows = await client.query(
      `SELECT awb, último_status 
       FROM t_status_aereo 
       WHERE último_status IN ('ERRO', 'AWB', 'ERR') 
       LIMIT ?`,
      [limit]
    );

    console.log(`[reclassify-awb-errors] Found ${rows.length} AWBs with error status`);

    const results = {
      total: rows.length,
      invalid_format: [] as { awb: string; reason: string }[],
      valid_format: [] as string[],
      reclassified: 0,
    };

    for (const row of rows) {
      const awbValue = row.awb?.toString().trim() || '';
      if (!awbValue) continue;

      const validation = isValidAwbFormat(awbValue);
      
      if (!validation.valid) {
        results.invalid_format.push({ awb: awbValue, reason: validation.reason || 'Unknown' });
        
        // If action is 'reclassify', update the database
        if (action === 'reclassify') {
          await client.execute(
            `UPDATE t_status_aereo 
             SET último_status = 'AWB_INVALID', 
                 \`última atualização\` = NOW()
             WHERE awb = ?`,
            [awbValue]
          );
          results.reclassified++;
        }
      } else {
        results.valid_format.push(awbValue);
      }
    }

    await client.close();

    console.log(`[reclassify-awb-errors] Results:`, {
      total: results.total,
      invalid: results.invalid_format.length,
      valid: results.valid_format.length,
      reclassified: results.reclassified,
    });

    return new Response(
      JSON.stringify({
        success: true,
        action,
        results: {
          total_analyzed: results.total,
          invalid_format_count: results.invalid_format.length,
          valid_format_count: results.valid_format.length,
          reclassified_count: results.reclassified,
          invalid_awbs: action === 'preview' ? results.invalid_format.slice(0, 50) : undefined, // Only show first 50 in preview
          message: action === 'preview' 
            ? `Found ${results.invalid_format.length} AWBs with invalid format that can be reclassified`
            : `Reclassified ${results.reclassified} AWBs from ERRO to AWB_INVALID`,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[reclassify-awb-errors] Error:', error);
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
