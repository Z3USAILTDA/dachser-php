import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MariaDBRecord {
  id: number;
  cliente: string;
  mawb: string;
  hawb: string;
  emails_cliente: string | null;
  nome_analista: string | null;
  email_analista: string | null;
  active: number;
  tipo_processo: string | null;
  container: string | null;
  previsao_faturamento: string | null;
  data_finalizacao: string | null;
  num_voo: string | null;
  data_insert: string | null;
}

// Map airline codes to hub airports
const airlineHubs: Record<string, string> = {
  '020': 'FRA', // Lufthansa - Frankfurt
  '057': 'FRA', // Lufthansa Cargo - Frankfurt
  '074': 'AMS', // KLM - Amsterdam
  '045': 'HEL', // Finnair - Helsinki
  '172': 'LIS', // TAP - Lisbon
  '047': 'FRA', // Lufthansa - Frankfurt
  '157': 'IST', // Turkish - Istanbul
  '055': 'MIA', // Avianca - (use MIA for US)
  '001': 'JFK', // American - JFK
  '577': 'HAM', // Hamburg
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: Client | null = null;
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { action, aeroporto_destino_padrao = 'GRU', limit, batch_size = 100 } = body;

    // Health check
    if (action === 'health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // MariaDB credentials
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!host || !database || !username || !password) {
      throw new Error('MariaDB credentials not configured');
    }

    console.log(`[MARIADB-SYNC] Connecting to ${host}:${port}/${database}`);

    mariaClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('[MARIADB-SYNC] Connected successfully');

    if (action === 'sync') {
      // Build query - apply limit only if specified
      const baseQuery = `SELECT id, cliente, mawb, hawb, emails_cliente, nome_analista, email_analista, 
                active, tipo_processo, container, previsao_faturamento, data_finalizacao, num_voo, data_insert
         FROM t_master_dados 
         WHERE active = 1 AND tipo_processo = 'AIR IMPORT'
         ORDER BY id DESC`;
      
      const mariaData = limit 
        ? await mariaClient.query(`${baseQuery} LIMIT ?`, [limit]) as MariaDBRecord[]
        : await mariaClient.query(baseQuery) as MariaDBRecord[];

      console.log(`[MARIADB-SYNC] Found ${mariaData.length} records to sync`);

      // Filter records with valid HAWB
      const validRecords = mariaData.filter(row => row.hawb?.trim());
      console.log(`[MARIADB-SYNC] ${validRecords.length} records have valid HAWB`);

      // Deduplicate by HAWB - keep the most recent record (highest id) for each HAWB
      const hawbMap = new Map<string, MariaDBRecord>();
      for (const row of validRecords) {
        const normalizedHawb = row.hawb.trim().toUpperCase();
        const existing = hawbMap.get(normalizedHawb);
        // Keep the record with higher id (more recent)
        if (!existing || row.id > existing.id) {
          hawbMap.set(normalizedHawb, row);
        }
      }
      
      const uniqueRecords = Array.from(hawbMap.values());
      const duplicatesRemoved = validRecords.length - uniqueRecords.length;
      
      if (duplicatesRemoved > 0) {
        console.log(`[MARIADB-SYNC] Removed ${duplicatesRemoved} duplicate HAWBs, ${uniqueRecords.length} unique records`);
      }

      // Prepare all shipments for batch upsert
      // Using nome_analista_legado directly from MariaDB
      const shipments = uniqueRecords.map(row => {
        const normalizedHawb = row.hawb.trim();
        const clienteNome = row.cliente?.split(' - ')[0]?.trim() || row.cliente;
        
        let aeroportoOrigem = 'FRA';
        if (row.mawb) {
          const prefix = row.mawb.split('-')[0];
          aeroportoOrigem = airlineHubs[prefix] || 'FRA';
        }

        // Parse dates
        let previsaoFaturamento: string | null = null;
        if (row.previsao_faturamento) {
          try {
            const date = new Date(row.previsao_faturamento);
            if (!isNaN(date.getTime())) {
              previsaoFaturamento = date.toISOString().split('T')[0]; // YYYY-MM-DD
            }
          } catch { /* ignore */ }
        }

        let dataFinalizacao: string | null = null;
        if (row.data_finalizacao) {
          try {
            const date = new Date(row.data_finalizacao);
            if (!isNaN(date.getTime())) {
              dataFinalizacao = date.toISOString();
            }
          } catch { /* ignore */ }
        }

        return {
          master: row.mawb?.trim() || '',
          house: normalizedHawb,
          cliente: clienteNome,
          aeroporto_origem: aeroportoOrigem,
          aeroporto_destino: aeroporto_destino_padrao,
          nome_analista_legado: row.nome_analista?.trim() || null,
          email_analista: row.email_analista?.trim() || null,
          emails_cliente: row.emails_cliente?.trim() || null,
          previsao_faturamento: previsaoFaturamento,
          data_finalizacao: dataFinalizacao,
          status_manifestacao: 'RECEBIDO_NOVA' as const,
        };
      });

      // Process in batches using upsert
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (let i = 0; i < shipments.length; i += batch_size) {
        const batch = shipments.slice(i, i + batch_size);
        
        const { data: upsertResult, error: upsertError } = await supabase
          .from('shipments')
          .upsert(batch, { 
            onConflict: 'house',
            ignoreDuplicates: false 
          })
          .select('id');

        if (upsertError) {
          console.error(`[MARIADB-SYNC] Batch ${i}-${i + batch.length} error:`, upsertError.message);
          errors.push(`Batch ${i}: ${upsertError.message}`);
        } else {
          // Count results - upsert doesn't distinguish created vs updated
          updated += upsertResult?.length || 0;
          console.log(`[MARIADB-SYNC] Batch ${i}-${i + batch.length}: ${upsertResult?.length || 0} records processed`);
        }
      }

      // Log sync summary
      await supabase.from('cct_log_entry').insert({
        conector: 'MARIADB_SYNC',
        tipo: 'INFO',
        mensagem: `Sincronização concluída: ${updated} processados, ${errors.length} erros`,
      });

      await mariaClient.close();
      const duration = Date.now() - startTime;

      console.log(`[MARIADB-SYNC] Completed in ${duration}ms: ${updated} processed`);

      return new Response(JSON.stringify({
        success: true,
        summary: {
          total: mariaData.length,
          valid: validRecords.length,
          processed: updated,
          skipped: mariaData.length - validRecords.length,
          errors: errors.length,
          duration_ms: duration,
        },
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'preview') {
      // Preview data without syncing
      const mariaData = await mariaClient.query(
        `SELECT id, cliente, mawb, hawb, nome_analista, email_analista, tipo_processo
         FROM t_master_dados 
         WHERE active = 1 AND tipo_processo = 'AIR IMPORT'
         ORDER BY id DESC
         LIMIT 10`
      );

      // Check which already exist in Supabase
      const hawbs = (mariaData as MariaDBRecord[]).map(r => r.hawb).filter(Boolean);
      const { data: existingShipments } = await supabase
        .from('shipments')
        .select('house')
        .in('house', hawbs);
      
      const existingHawbs = new Set(existingShipments?.map(s => s.house) || []);

      await mariaClient.close();

      return new Response(JSON.stringify({
        success: true,
        preview: (mariaData as MariaDBRecord[]).map(r => ({
          ...r,
          cliente: r.cliente?.split(' - ')[0]?.trim(),
          already_synced: existingHawbs.has(r.hawb),
        })),
        count: mariaData.length,
        already_synced: existingHawbs.size,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'count') {
      // Count records available for sync
      const countResult = await mariaClient.query(
        `SELECT COUNT(*) as total FROM t_master_dados WHERE active = 1 AND tipo_processo = 'AIR IMPORT'`
      ) as Array<{ total: number }>;

      const { count: supabaseCount } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true });

      await mariaClient.close();

      return new Response(JSON.stringify({
        success: true,
        mariadb_count: countResult[0]?.total || 0,
        supabase_count: supabaseCount || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'duplicates') {
      // Find duplicate HAWBs in MariaDB
      const duplicates = await mariaClient.query(
        `SELECT hawb, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT cliente SEPARATOR ' | ') as clientes
         FROM t_master_dados 
         WHERE active = 1 AND tipo_processo = 'AIR IMPORT' AND hawb IS NOT NULL AND hawb != ''
         GROUP BY hawb 
         HAVING COUNT(*) > 1 
         ORDER BY cnt DESC 
         LIMIT 100`
      );

      await mariaClient.close();

      return new Response(JSON.stringify({
        success: true,
        duplicates,
        total_duplicates: (duplicates as unknown[]).length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error(`Unknown action: ${action}. Valid actions: health, sync, preview, count, duplicates`);
    }

  } catch (error) {
    console.error('[MARIADB-SYNC] Error:', error);

    if (mariaClient) {
      try {
        await mariaClient.close();
      } catch (closeError) {
        console.error('[MARIADB-SYNC] Error closing connection:', closeError);
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
