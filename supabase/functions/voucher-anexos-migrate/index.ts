import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize MariaDB client
    const mariaClient = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      db: 'dados_dachser',
    });

    // Fetch all voucher_anexos from Supabase
    const { data: anexos, error: fetchError } = await supabase
      .from('voucher_anexos')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch voucher_anexos: ${fetchError.message}`);
    }

    console.log(`Found ${anexos?.length || 0} anexos to migrate`);

    const results = {
      total: anexos?.length || 0,
      migrated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const anexo of anexos || []) {
      try {
        // Check if already exists in MariaDB by id
        const existing = await mariaClient.query(
          `SELECT id FROM t_voucher_anexos WHERE id = ? LIMIT 1`,
          [anexo.id]
        );

        if (existing.length > 0) {
          console.log(`Skipping already migrated: ${anexo.id}`);
          results.skipped++;
          continue;
        }

        // Convert ISO date to MySQL timestamp format
        const createdAt = anexo.created_at 
          ? new Date(anexo.created_at).toISOString().slice(0, 19).replace('T', ' ')
          : new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Insert into MariaDB
        await mariaClient.execute(
          `INSERT INTO t_voucher_anexos 
           (id, voucher_id, tipo, file_name, file_url, file_size, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            anexo.id,
            anexo.voucher_id,
            anexo.tipo,
            anexo.file_name,
            anexo.file_url,
            anexo.file_size || 0,
            createdAt,
          ]
        );

        results.migrated++;
        console.log(`Migrated anexo: ${anexo.file_name} (${anexo.tipo})`);

      } catch (anexoError: unknown) {
        const errorMsg = `Error migrating anexo ${anexo.id}: ${anexoError instanceof Error ? anexoError.message : String(anexoError)}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    await mariaClient.close();

    return new Response(JSON.stringify({
      success: true,
      message: `Migration completed`,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
