import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import mysql from "npm:mysql2@3.11.3/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getConnection(retries = 2, backoffMs = 1500): Promise<any> {
  const host = Deno.env.get('MARIADB_HOST');
  const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
  const database = Deno.env.get('MARIADB_DATABASE');
  const user = Deno.env.get('MARIADB_USER');
  const password = Deno.env.get('MARIADB_PASSWORD');

  if (!host || !database || !user || !password) {
    throw new Error('Database configuration error');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mysql.createConnection({
        host, port, database, user, password,
        connectTimeout: 10000,
        charset: 'utf8mb4',
      });
      console.log(`Connected to MariaDB on attempt ${attempt}`);
      return conn;
    } catch (err) {
      console.error(`Connection attempt ${attempt} failed:`, err.message);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let conn: any = null;

  try {
    const { id: analysisId } = await req.json();
    console.log(`Polling analysis ${analysisId}`);

    conn = await getConnection();

    const [rows] = await conn.execute(
      `SELECT id, item_id, mode, thread_id, run_id, status, result_text, created_at
       FROM ai_agente.t_dachser_sea_runs WHERE id = ?`,
      [analysisId]
    );

    await conn.end();
    conn = null;

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Analysis not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const run = rows[0];

    const statusPercentMap: Record<string, number> = {
      'queued': 10, 'extracting': 30, 'processing': 60,
      'comparing': 80, 'completed': 100, 'pendente': 100, 'error': 0,
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
    if (conn) {
      try { await conn.end(); } catch (_) {}
    }
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
