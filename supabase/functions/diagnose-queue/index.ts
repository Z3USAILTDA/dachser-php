import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let conn;
  try {
    console.log('Starting queue diagnostics...');

    // Connect to MariaDB
    const connection = await import('https://deno.land/x/mysql@v2.12.1/mod.ts');
    conn = await new connection.Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // 1. Get total AWBs in processing queue
    const queueCountResult = await conn.query(
      'SELECT COUNT(*) as count FROM t_awb_processing_queue'
    );
    const queueCount = queueCountResult[0]?.count || 0;
    console.log(`Queue count: ${queueCount}`);

    // 2. Get first 10 AWBs from queue
    const queueSample = await conn.query(
      'SELECT mawb, hawb, destinatario, nome_analista FROM t_awb_processing_queue ORDER BY mawb ASC LIMIT 10'
    );
    console.log(`Queue sample: ${queueSample.length} records`);

    // 3. Get count of unprocessed AWBs (in t_dados_master but not in t_status_aereo)
    const unprocessedCountQuery = `
      SELECT COUNT(DISTINCT dm.mawb) as count
      FROM t_dados_master dm
      LEFT JOIN t_status_aereo sa ON dm.mawb = sa.awb
      WHERE sa.awb IS NULL
        AND dm.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
    `;
    const unprocessedCountResult = await conn.query(unprocessedCountQuery);
    const unprocessedCount = unprocessedCountResult[0]?.count || 0;
    console.log(`Unprocessed count (anti-join): ${unprocessedCount}`);

    // 4. Get sample of unprocessed AWBs from t_dados_master
    const unprocessedSampleQuery = `
      SELECT dm.mawb, MIN(dm.hawb) as hawb, MIN(dm.cliente) as cliente, MIN(dm.nome_analista) as nome_analista
      FROM t_dados_master dm
      LEFT JOIN t_status_aereo sa ON dm.mawb = sa.awb
      WHERE sa.awb IS NULL
        AND dm.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        AND dm.mawb IS NOT NULL
        AND TRIM(dm.mawb) != ''
      GROUP BY dm.mawb
      ORDER BY dm.mawb ASC
      LIMIT 10
    `;
    const unprocessedSample = await conn.query(unprocessedSampleQuery);
    console.log(`Unprocessed sample: ${unprocessedSample.length} records`);

    // 5. Find AWBs that are in queue BUT already in t_status_aereo (should not exist!)
    const invalidQueueQuery = `
      SELECT q.mawb
      FROM t_awb_processing_queue q
      INNER JOIN t_status_aereo sa ON q.mawb = sa.awb
      LIMIT 10
    `;
    const invalidQueue = await conn.query(invalidQueueQuery);
    console.log(`Invalid queue entries (already processed): ${invalidQueue.length} records`);

    // 6. Get count of invalid entries
    const invalidCountQuery = `
      SELECT COUNT(*) as count
      FROM t_awb_processing_queue q
      INNER JOIN t_status_aereo sa ON q.mawb = sa.awb
    `;
    const invalidCountResult = await conn.query(invalidCountQuery);
    const invalidCount = invalidCountResult[0]?.count || 0;
    console.log(`Total invalid queue entries: ${invalidCount}`);

    await conn.close();
    console.log('MariaDB connection closed');

    const diagnostics = {
      queue: {
        total: queueCount,
        sample: queueSample,
      },
      unprocessed: {
        total: unprocessedCount,
        sample: unprocessedSample,
      },
      invalid: {
        total: invalidCount,
        sample: invalidQueue,
      },
      summary: {
        queueMatchesUnprocessed: queueCount === unprocessedCount,
        hasInvalidEntries: invalidCount > 0,
        recommendation: invalidCount > 0
          ? 'CRITICAL: Queue contains already-processed AWBs. Need to clear invalid entries.'
          : queueCount === unprocessedCount
          ? 'OK: Queue correctly contains all unprocessed AWBs.'
          : `WARNING: Queue (${queueCount}) doesn't match unprocessed count (${unprocessedCount}).`,
      },
    };

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    if (conn) {
      try {
        await conn.close();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
