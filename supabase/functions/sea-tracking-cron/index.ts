import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * sea-tracking-cron: Orquestrador de sincronização SEA
 * 
 * Executa a sequência:
 * 1. olimpo-sync → Sincroniza t_olimpo_tracking com dados do MariaDB
 * 2. sea_seed_smart (batches) → Enriquece containers via JSONCargo API
 * 
 * Cron Schedule: 0 2 * * 1,3 (Segunda e Quarta às 02:00 UTC)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ 
      error: 'Supabase não configurado',
      missing: !supabaseUrl ? 'SUPABASE_URL' : 'SUPABASE_ANON_KEY'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const stats = {
    started_at: new Date().toISOString(),
    olimpo_sync: null as any,
    sea_seed_batches: [] as any[],
    total_api_calls: 0,
    total_cache_hits: 0,
    total_containers: 0,
    errors: [] as string[],
    duration_ms: 0
  };

  console.log('[sea-tracking-cron] Iniciando orquestração...');

  // ===== PASSO 1: Sincronizar dados base via olimpo-sync =====
  try {
    console.log('[sea-tracking-cron] Passo 1: Chamando olimpo-sync...');
    const syncRes = await fetch(`${supabaseUrl}/functions/v1/olimpo-sync`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const syncText = await syncRes.text();
    try {
      stats.olimpo_sync = JSON.parse(syncText);
    } catch {
      stats.olimpo_sync = { raw: syncText, status: syncRes.status };
    }
    
    if (!syncRes.ok) {
      stats.errors.push(`olimpo-sync falhou: ${syncRes.status}`);
      console.error('[sea-tracking-cron] olimpo-sync falhou:', syncRes.status, syncText);
    } else {
      console.log('[sea-tracking-cron] olimpo-sync concluído:', stats.olimpo_sync);
    }
  } catch (e: any) {
    const errMsg = `olimpo-sync erro: ${e.message}`;
    stats.errors.push(errMsg);
    console.error('[sea-tracking-cron]', errMsg);
  }

  // ===== PASSO 2: Enriquecer containers via sea_seed_smart (múltiplos batches) =====
  // FLAG: JsonCargo REATIVADO
  const JSONCARGO_DISABLED = false;

  if (JSONCARGO_DISABLED) {
    console.log('[sea-tracking-cron] Passo 2 PULADO: JsonCargo desativado até segunda ordem');
    stats.sea_seed_batches = [{ skipped: true, reason: 'JsonCargo desativado temporariamente' }];
  } else {
    const MAX_BATCHES = 5; // Até 50 chamadas API total (5 batches x 10 por batch)
    const BATCH_DELAY_MS = 3000; // 3 segundos entre batches

    console.log('[sea-tracking-cron] Passo 2: Enriquecendo containers...');

    for (let batchNum = 1; batchNum <= MAX_BATCHES; batchNum++) {
      try {
        console.log(`[sea-tracking-cron] Batch ${batchNum}/${MAX_BATCHES}...`);
        
        const seedRes = await fetch(
          `${supabaseUrl}/functions/v1/olimpo-proxy?action=sea_seed_smart`,
          { 
            headers: { 
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            } 
          }
        );
        
        const seedText = await seedRes.text();
        let seedData: any = {};
        try {
          seedData = JSON.parse(seedText);
        } catch {
          seedData = { raw: seedText, status: seedRes.status };
        }
        
        const batchStats = seedData.stats || {};
        stats.sea_seed_batches.push({
          batch: batchNum,
          api_calls: batchStats.api_calls || 0,
          cache_hits: batchStats.cache_hits || 0,
          total: batchStats.total || 0,
          status: seedRes.status
        });
        
        stats.total_api_calls += batchStats.api_calls || 0;
        stats.total_cache_hits += batchStats.cache_hits || 0;
        stats.total_containers = batchStats.total || stats.total_containers;
        
        console.log(`[sea-tracking-cron] Batch ${batchNum}: ${batchStats.api_calls || 0} API calls, ${batchStats.cache_hits || 0} cache hits`);
        
        // Se não fez nenhuma chamada API neste batch, cache está atualizado
        if ((batchStats.api_calls || 0) === 0) {
          console.log(`[sea-tracking-cron] Cache atualizado, parando batches.`);
          break;
        }
        
        // Delay entre batches para não sobrecarregar a API
        if (batchNum < MAX_BATCHES) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
        
      } catch (e: any) {
        const errMsg = `Batch ${batchNum} erro: ${e.message}`;
        stats.errors.push(errMsg);
        console.error('[sea-tracking-cron]', errMsg);
        break; // Parar em caso de erro
      }
    }
  }

  // ===== PASSO 3: Enriquecer coordenadas faltantes via enrich_missing_coords =====
  const ENRICH_BATCHES = 2;
  const ENRICH_DELAY_MS = 2000;
  const enrichResults: any[] = [];

  console.log('[sea-tracking-cron] Passo 3: Enriquecendo coordenadas faltantes...');

  for (let batch = 1; batch <= ENRICH_BATCHES; batch++) {
    try {
      console.log(`[sea-tracking-cron] Enrich batch ${batch}/${ENRICH_BATCHES}...`);
      const enrichRes = await fetch(
        `${supabaseUrl}/functions/v1/olimpo-proxy?action=enrich_missing_coords&limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const enrichText = await enrichRes.text();
      let enrichData: any = {};
      try { enrichData = JSON.parse(enrichText); } catch { enrichData = { raw: enrichText, status: enrichRes.status }; }

      enrichResults.push({ batch, status: enrichRes.status, enriched: enrichData.total_enriched || 0, missing: enrichData.total_missing || 0 });
      console.log(`[sea-tracking-cron] Enrich batch ${batch}: ${enrichData.total_enriched || 0} enriched, ${enrichData.total_missing || 0} missing`);

      // Se não há mais containers sem coordenadas, parar
      if ((enrichData.total_missing || 0) === 0 || (enrichData.total_enriched || 0) === 0) {
        console.log('[sea-tracking-cron] Coordenadas atualizadas, parando enrich.');
        break;
      }

      if (batch < ENRICH_BATCHES) {
        await new Promise(r => setTimeout(r, ENRICH_DELAY_MS));
      }
    } catch (e: any) {
      const errMsg = `Enrich batch ${batch} erro: ${e.message}`;
      stats.errors.push(errMsg);
      console.error('[sea-tracking-cron]', errMsg);
      break;
    }
  }

  (stats as any).enrich_coords = enrichResults;

  // ===== PASSO 4: Fallback multi-armador para MBLs PENDENTE/NAO_ENCONTRADO =====
  let carrierFallbackResult: any = null;
  try {
    console.log('[sea-tracking-cron] Passo 4: Carrier fallback para MBLs pendentes...');
    const fallbackRes = await fetch(`${supabaseUrl}/functions/v1/sea-carrier-fallback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    const fallbackText = await fallbackRes.text();
    try {
      carrierFallbackResult = JSON.parse(fallbackText);
    } catch {
      carrierFallbackResult = { raw: fallbackText, status: fallbackRes.status };
    }

    console.log('[sea-tracking-cron] Carrier fallback concluído:', {
      processed: carrierFallbackResult.processed || 0,
      discovered: carrierFallbackResult.discovered || 0,
      errors: carrierFallbackResult.errors?.length || 0,
    });
  } catch (e: any) {
    const errMsg = `carrier-fallback erro: ${e.message}`;
    stats.errors.push(errMsg);
    console.error('[sea-tracking-cron]', errMsg);
  }

  (stats as any).carrier_fallback = carrierFallbackResult;

  stats.duration_ms = Date.now() - startTime;
  
  console.log('[sea-tracking-cron] Concluído:', {
    duration_ms: stats.duration_ms,
    total_api_calls: stats.total_api_calls,
    total_cache_hits: stats.total_cache_hits,
    batches: stats.sea_seed_batches.length,
    enrich_batches: enrichResults.length,
    carrier_fallback_discovered: carrierFallbackResult?.discovered || 0,
    errors: stats.errors.length
  });

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
