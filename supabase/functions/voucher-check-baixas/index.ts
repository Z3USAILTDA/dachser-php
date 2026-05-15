import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let sql: ReturnType<typeof postgres> | null = null;
  let advisoryLockAcquired = false;

  try {
    console.log('[voucher-check-baixas] Starting full status sync...');

    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      throw new Error('SUPABASE_DB_URL not configured');
    }

    sql = postgres(dbUrl, { max: 1 });
    const lockRows = await sql`SELECT pg_try_advisory_lock(847201, 44019) AS acquired`;
    advisoryLockAcquired = Boolean(lockRows[0]?.acquired);

    if (!advisoryLockAcquired) {
      console.log('[voucher-check-baixas] Skipped: another run is already in progress');
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already_running' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call mariadb-proxy with the sync_voucher_statuses action
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { action: 'sync_voucher_statuses' },
    });

    if (error) {
      console.error('[voucher-check-baixas] Error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[voucher-check-baixas] Result:', JSON.stringify(data));

    // Mirror t_vouchers <- t_dados_financeiro_voucher (id_rm authoritative)
    // Garante que campos de origem (fornecedor, cnpj, valor, data_emissao, processo, filial)
    // nunca divirjam do dfv.
    let mirrorResult: any = null;
    try {
      const { data: mData, error: mErr } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'mirror_vouchers_from_dfv' },
      });
      if (mErr) {
        console.warn('[voucher-check-baixas] mirror_vouchers_from_dfv error:', mErr);
      } else {
        mirrorResult = mData;
        console.log('[voucher-check-baixas] mirror result:', JSON.stringify(mData));
      }
    } catch (mirrorErr) {
      console.warn('[voucher-check-baixas] mirror_vouchers_from_dfv threw:', mirrorErr);
    }

    // Dedupe vouchers (mesmo SPO + fornecedor + valor) — preven\u00e7\u00e3o cont\u00ednua.
    // Mant\u00e9m o de updated_at mais recente; demais viram sync_status='DUPLICADO'.
    let dedupeResult: any = null;
    try {
      const { data: dData, error: dErr } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'dedupe_vouchers_by_spo_fornecedor_valor' },
      });
      if (dErr) {
        console.warn('[voucher-check-baixas] dedupe error:', dErr);
      } else {
        dedupeResult = dData;
        if ((dData?.marked_duplicated ?? 0) > 0) {
          console.log('[voucher-check-baixas] dedupe result:', JSON.stringify(dData));
        }
      }
    } catch (dedupeErr) {
      console.warn('[voucher-check-baixas] dedupe threw:', dedupeErr);
    }

    return new Response(JSON.stringify({ success: true, ...data, mirror: mirrorResult, dedupe: dedupeResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[voucher-check-baixas] Unhandled error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    if (sql) {
      try {
        if (advisoryLockAcquired) {
          await sql`SELECT pg_advisory_unlock(847201, 44019)`;
        }
      } catch (unlockError) {
        console.warn('[voucher-check-baixas] Failed to release advisory lock:', unlockError);
      }

      try {
        await sql.end();
      } catch (endError) {
        console.warn('[voucher-check-baixas] Failed to close postgres connection:', endError);
      }
    }
  }
});
