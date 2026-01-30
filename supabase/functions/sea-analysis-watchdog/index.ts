import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

/**
 * SEA Analysis Watchdog
 * 
 * Monitors maritime document analysis runs and automatically marks as "erro"
 * any analysis that has been stuck in "analisando" or "pendente" status for too long.
 * 
 * This prevents analyses from appearing stuck forever when the background task crashes.
 * 
 * Run via cron every 5 minutes or manually invoke for immediate cleanup.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout thresholds (in minutes)
const ANALISANDO_TIMEOUT_MINUTES = 10;  // Analysis shouldn't take more than 10 minutes
const PENDENTE_TIMEOUT_MINUTES = 30;     // Pending shouldn't stay more than 30 minutes

async function getDbClient(): Promise<Client> {
  const host = Deno.env.get('MARIADB_HOST');
  const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
  const database = Deno.env.get('MARIADB_DATABASE');
  const dbUser = Deno.env.get('MARIADB_USER');
  const dbPassword = Deno.env.get('MARIADB_PASSWORD');

  if (!host || !database || !dbUser || !dbPassword) {
    throw new Error('Database configuration missing');
  }

  return await new Client().connect({
    hostname: host,
    port: port,
    db: database,
    username: dbUser,
    password: dbPassword,
    charset: "utf8mb4",
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let dbClient: Client | null = null;
  const results = {
    checked: 0,
    timedOutAnalisando: 0,
    timedOutPendente: 0,
    errors: [] as string[],
    updatedRuns: [] as number[],
    updatedItems: [] as number[],
  };

  try {
    console.log('🔍 [Watchdog] Starting SEA analysis watchdog check...');
    
    dbClient = await getDbClient();

    // Find runs stuck in "analisando" for too long
    const stuckAnalisando = await dbClient.query(`
      SELECT id, item_id, status, created_at
      FROM ai_agente.t_dachser_sea_runs
      WHERE status = 'analisando'
        AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY created_at ASC
      LIMIT 50
    `, [ANALISANDO_TIMEOUT_MINUTES]);

    console.log(`🔍 [Watchdog] Found ${stuckAnalisando.length} runs stuck in 'analisando'`);

    for (const run of stuckAnalisando) {
      try {
        const runId = run.id;
        const itemId = run.item_id;
        const createdAt = run.created_at;
        
        // Calculate how long it's been stuck
        const minutesStuck = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
        
        console.log(`⚠️ [Watchdog] Run ${runId} stuck for ${minutesStuck} minutes - marking as error`);
        
        // Update run status to 'erro'
        await dbClient.execute(`
          UPDATE ai_agente.t_dachser_sea_runs 
          SET status = 'erro',
              result_text = ?
          WHERE id = ?
        `, [
          `Análise excedeu o tempo limite de ${ANALISANDO_TIMEOUT_MINUTES} minutos. O arquivo pode ser muito grande ou houve um erro de processamento. Por favor, tente novamente com arquivos menores.`,
          runId
        ]);
        
        results.updatedRuns.push(runId);
        results.timedOutAnalisando++;
        
        // Also update the item status back to 'queued' so user can retry
        if (itemId) {
          await dbClient.execute(`
            UPDATE ai_agente.t_dachser_sea_items 
            SET status = 'erro'
            WHERE id = ? AND status IN ('queued', 'analisando')
          `, [itemId]);
          
          results.updatedItems.push(itemId);
          console.log(`📦 [Watchdog] Updated item ${itemId} status to 'erro'`);
        }
        
      } catch (runError) {
        const errMsg = `Error processing run ${run.id}: ${runError instanceof Error ? runError.message : 'Unknown error'}`;
        console.error(`❌ [Watchdog] ${errMsg}`);
        results.errors.push(errMsg);
      }
    }

    // Find runs stuck in "pendente" for too long (maybe never started)
    const stuckPendente = await dbClient.query(`
      SELECT id, item_id, status, created_at
      FROM ai_agente.t_dachser_sea_runs
      WHERE status = 'pendente'
        AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY created_at ASC
      LIMIT 50
    `, [PENDENTE_TIMEOUT_MINUTES]);

    console.log(`🔍 [Watchdog] Found ${stuckPendente.length} runs stuck in 'pendente'`);

    for (const run of stuckPendente) {
      try {
        const runId = run.id;
        const itemId = run.item_id;
        
        console.log(`⚠️ [Watchdog] Run ${runId} stuck in pendente - marking as error`);
        
        await dbClient.execute(`
          UPDATE ai_agente.t_dachser_sea_runs 
          SET status = 'erro',
              result_text = ?
          WHERE id = ?
        `, [
          `Análise não foi iniciada após ${PENDENTE_TIMEOUT_MINUTES} minutos. Houve um erro ao processar a solicitação. Por favor, tente novamente.`,
          runId
        ]);
        
        results.updatedRuns.push(runId);
        results.timedOutPendente++;
        
        if (itemId) {
          await dbClient.execute(`
            UPDATE ai_agente.t_dachser_sea_items 
            SET status = 'erro'
            WHERE id = ? AND status IN ('queued', 'pendente')
          `, [itemId]);
          
          results.updatedItems.push(itemId);
        }
        
      } catch (runError) {
        const errMsg = `Error processing pending run ${run.id}: ${runError instanceof Error ? runError.message : 'Unknown error'}`;
        console.error(`❌ [Watchdog] ${errMsg}`);
        results.errors.push(errMsg);
      }
    }

    results.checked = stuckAnalisando.length + stuckPendente.length;

    console.log(`✅ [Watchdog] Check complete:`, {
      checked: results.checked,
      timedOutAnalisando: results.timedOutAnalisando,
      timedOutPendente: results.timedOutPendente,
      updatedRuns: results.updatedRuns.length,
      updatedItems: results.updatedItems.length,
    });

    await dbClient.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Watchdog check complete. Fixed ${results.timedOutAnalisando + results.timedOutPendente} stuck analyses.`,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [Watchdog] Fatal error:', error);
    
    if (dbClient) {
      try {
        await dbClient.close();
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
