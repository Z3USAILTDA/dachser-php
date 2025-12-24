import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const client = await new Client().connect({
    hostname: Deno.env.get("MARIADB_HOST") || "",
    port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
    username: Deno.env.get("MARIADB_USER") || "",
    password: Deno.env.get("MARIADB_PASSWORD") || "",
    db: Deno.env.get("MARIADB_DATABASE") || "",
  });

  try {
    console.log("Starting processo migration for existing vouchers...");

    // Step 1: Ensure columns exist
    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS processo_id VARCHAR(100) DEFAULT NULL
      `);
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS origem_processo VARCHAR(10) DEFAULT NULL
      `);
      console.log("Columns processo_id and origem_processo ensured.");
    } catch (e) {
      console.log("Columns may already exist:", e);
    }

    // Step 2: Find vouchers with id_rm but missing processo data
    const vouchersToMigrate = await client.query(`
      SELECT v.id, v.id_rm, v.numero_spo
      FROM dados_dachser.t_vouchers v
      WHERE v.id_rm IS NOT NULL 
        AND v.id_rm != ''
        AND (v.processo_id IS NULL OR v.processo_id = '')
    `);

    console.log(`Found ${vouchersToMigrate.length} vouchers to migrate.`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const voucher of vouchersToMigrate) {
      try {
        // Fetch RM data using id_rm column (not id)
        const rmData = await client.query(`
          SELECT numero_processo, modal
          FROM dados_dachser.t_dados_financeiro_voucher
          WHERE id_rm = ?
          LIMIT 1
        `, [voucher.id_rm]);

        if (rmData.length > 0) {
          const { numero_processo, modal } = rmData[0];
          
          if (numero_processo || modal) {
            await client.execute(`
              UPDATE dados_dachser.t_vouchers
              SET processo_id = ?, origem_processo = ?
              WHERE id = ?
            `, [
              numero_processo || null,
              modal || null,
              voucher.id
            ]);
            
            updated++;
            console.log(`Updated voucher ${voucher.numero_spo} with processo: ${numero_processo}, origem: ${modal}`);
          } else {
            skipped++;
            console.log(`Skipped voucher ${voucher.numero_spo}: no processo data in RM`);
          }
        } else {
          skipped++;
          console.log(`Skipped voucher ${voucher.numero_spo}: RM record not found for id_rm=${voucher.id_rm}`);
        }
      } catch (e) {
        const errorMsg = `Error updating voucher ${voucher.id}: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    await client.close();

    const result = {
      success: true,
      message: `Migration completed. Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`,
      details: {
        total: vouchersToMigrate.length,
        updated,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      }
    };

    console.log("Migration result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Migration error:", error);
    await client.close();
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
