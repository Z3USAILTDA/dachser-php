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

  let client: Client | null = null;

  try {
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    const diagnostics: Record<string, unknown> = {};

    // 1. Total count in queue
    const queueCountResult = await client.query(
      `SELECT COUNT(*) as total FROM ${database}.t_awb_processing_queue`
    );
    diagnostics.queueTotal = queueCountResult[0]?.total || 0;

    // 2. Count of AWBs with invalid format (too short, empty, etc.)
    const invalidAwbsResult = await client.query(`
      SELECT COUNT(*) as total 
      FROM ${database}.t_awb_processing_queue 
      WHERE mawb IS NULL OR TRIM(mawb) = '' OR LENGTH(TRIM(mawb)) < 3
    `);
    diagnostics.invalidAwbs = invalidAwbsResult[0]?.total || 0;

    // 3. Sample of invalid AWBs
    const invalidSampleResult = await client.query(`
      SELECT id, mawb, hawb, created_at 
      FROM ${database}.t_awb_processing_queue 
      WHERE mawb IS NULL OR TRIM(mawb) = '' OR LENGTH(TRIM(mawb)) < 3
      LIMIT 10
    `);
    diagnostics.invalidSamples = invalidSampleResult || [];

    // 4. AWBs in queue that are already processed (exist in t_status_aereo)
    const alreadyProcessedResult = await client.query(`
      SELECT COUNT(*) as total
      FROM ${database}.t_awb_processing_queue q
      INNER JOIN ${database}.t_status_aereo s ON TRIM(q.mawb) = TRIM(s.awb)
    `);
    diagnostics.alreadyProcessed = alreadyProcessedResult[0]?.total || 0;

    // 5. Sample of already processed AWBs still in queue
    const processedSampleResult = await client.query(`
      SELECT q.id, TRIM(q.mawb) as mawb, s.último_status as status_atual, s.\`última atualização\` as last_update
      FROM ${database}.t_awb_processing_queue q
      INNER JOIN ${database}.t_status_aereo s ON TRIM(q.mawb) = TRIM(s.awb)
      LIMIT 10
    `);
    diagnostics.processedSamples = processedSampleResult || [];

    // 6. Queue age analysis
    const ageAnalysisResult = await client.query(`
      SELECT 
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_hour,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_day,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 END) as last_week,
        COUNT(CASE WHEN created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as older
      FROM ${database}.t_awb_processing_queue
    `);
    diagnostics.ageDistribution = ageAnalysisResult[0] || {};

    // 7. Duplicate check
    const duplicatesResult = await client.query(`
      SELECT TRIM(mawb) as mawb, COUNT(*) as cnt
      FROM ${database}.t_awb_processing_queue
      GROUP BY TRIM(mawb)
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    diagnostics.duplicates = duplicatesResult || [];
    diagnostics.duplicateCount = duplicatesResult?.length || 0;

    // 8. t_status_aereo stats
    const statusStatsResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT awb) as unique_awbs,
        MIN(\`última atualização\`) as oldest_update,
        MAX(\`última atualização\`) as newest_update
      FROM ${database}.t_status_aereo
    `);
    diagnostics.statusAereoStats = statusStatsResult[0] || {};

    // 9. Status distribution
    const statusDistResult = await client.query(`
      SELECT último_status as status, COUNT(*) as cnt
      FROM ${database}.t_status_aereo
      GROUP BY último_status
      ORDER BY cnt DESC
      LIMIT 10
    `);
    diagnostics.statusDistribution = statusDistResult || [];

    console.log('Queue diagnostics completed');

    return new Response(
      JSON.stringify({ success: true, diagnostics }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in diagnose-queue:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
