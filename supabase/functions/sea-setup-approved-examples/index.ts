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
      throw new Error('Missing database configuration');
    }

    console.log('Connecting to MariaDB...');
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Create the approved examples table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ai_agente.t_dachser_sea_approved_examples (
        id INT AUTO_INCREMENT PRIMARY KEY,
        run_id INT NOT NULL COMMENT 'Reference to the original run in t_dachser_sea_runs',
        item_id INT NOT NULL COMMENT 'Reference to the item in t_dachser_sea_items',
        analysis_type VARCHAR(50) NOT NULL COMMENT 'manifest_hbl, hbl_mbl, invoices_hbl',
        consignee VARCHAR(255) NULL COMMENT 'To group by customer/consignee',
        scenario_type VARCHAR(100) NOT NULL COMMENT 'Scenario classification (1_hbl, 2_hbls, 3+_hbls, weight_discrepancy, etc.)',
        hbl_count INT NOT NULL DEFAULT 1 COMMENT 'Number of HBLs in the analysis',
        input_summary TEXT NULL COMMENT 'Summary of inputs (files, totals)',
        result_text MEDIUMTEXT NOT NULL COMMENT 'The approved analysis result',
        approved_by INT NULL COMMENT 'User ID who approved',
        approved_by_name VARCHAR(100) NULL COMMENT 'Username who approved',
        approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE COMMENT 'Whether this example is active and should be used',
        usage_count INT DEFAULT 0 COMMENT 'How many times this was used as an example',
        effectiveness_score DECIMAL(5,2) DEFAULT 100.00 COMMENT 'Effectiveness score (0-100)',
        last_used_at TIMESTAMP NULL COMMENT 'Last time this example was used',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_analysis_type (analysis_type),
        INDEX idx_scenario_type (scenario_type),
        INDEX idx_hbl_count (hbl_count),
        INDEX idx_is_active (is_active),
        INDEX idx_effectiveness (effectiveness_score DESC),
        INDEX idx_consignee (consignee),
        INDEX idx_approved_at (approved_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Stores approved analysis examples for AI learning';
    `;

    console.log('Creating table t_dachser_sea_approved_examples...');
    await client.execute(createTableSQL);
    console.log('Table created successfully!');

    // Check if table was created
    const checkTable = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'ai_agente' 
      AND table_name = 't_dachser_sea_approved_examples'
    `);

    const tableExists = checkTable[0]?.count > 0;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Table t_dachser_sea_approved_examples created successfully',
        tableExists
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Setup Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Setup failed', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
