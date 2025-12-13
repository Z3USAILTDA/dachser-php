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

  let dbClient: Client | null = null;

  try {
    const { id: analysisId } = await req.json();

    console.log(`Polling analysis ${analysisId}`);

    // Connect to MariaDB
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error('Database configuration error');
    }

    dbClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Query run from MariaDB
    const runs = await dbClient.query(`
      SELECT id, item_id, mode, thread_id, run_id, status, result_text, created_at
      FROM ai_agente.t_dachser_sea_runs 
      WHERE id = ?
    `, [analysisId]);

    await dbClient.close();

    if (!runs || runs.length === 0) {
      console.error('Analysis not found:', analysisId);
      return new Response(
        JSON.stringify({ error: 'Analysis not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const run = runs[0];

    // Calculate percentage based on status
    const statusPercentMap: Record<string, number> = {
      'queued': 10,
      'extracting': 30,
      'processing': 60,
      'comparing': 80,
      'completed': 100,
      'pendente': 100,
      'error': 0,
    };

    const progress = {
      step: run.status || 'queued',
      message: run.status === 'completed' || run.status === 'pendente' ? 'Análise concluída' : 
               run.status === 'error' ? 'Erro na análise' :
               run.status === 'processing' ? 'Analisando documentos...' : 'Aguardando processamento',
      percent: statusPercentMap[run.status || 'queued'] || 0,
    };

    console.log(`Analysis ${analysisId} status: ${run.status}`);

    return new Response(
      JSON.stringify({
        analysis: {
          id: String(run.id),
          status: run.status,
          progress_step: progress.step,
          progress_message: progress.message,
          progress_percent: progress.percent,
          result_text: run.result_text || null,
          result_data: run.result_text ? { result_text: run.result_text } : null,
          error_message: run.status === 'error' ? run.result_text : null,
          completed_at: run.status === 'completed' || run.status === 'pendente' ? run.created_at : null,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    if (dbClient) {
      try { await dbClient.close(); } catch (e) { /* ignore */ }
    }
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
