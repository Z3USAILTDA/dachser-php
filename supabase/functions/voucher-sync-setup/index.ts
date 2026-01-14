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
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('Missing MariaDB credentials');
    }

    console.log(`[voucher-sync-setup] Connecting to MariaDB at ${host}:${port}/${database}`);

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('[voucher-sync-setup] Connected. Setting up sync infrastructure...');

    const results: string[] = [];

    // 1. Add sync columns to t_vouchers if they don't exist
    const alterTableStatements = [
      {
        name: 'data_insert_rm column',
        sql: `ALTER TABLE dados_dachser.t_vouchers 
              ADD COLUMN IF NOT EXISTS data_insert_rm DATETIME DEFAULT NULL 
              COMMENT 'data_insert from t_dados_financeiro_voucher for incremental sync'`
      },
      {
        name: 'sync_status column',
        sql: `ALTER TABLE dados_dachser.t_vouchers 
              ADD COLUMN IF NOT EXISTS sync_status ENUM('ATIVO', 'BAIXADO') DEFAULT 'ATIVO'
              COMMENT 'Status for fast filtering - ATIVO or BAIXADO'`
      },
      {
        name: 'sync_status index',
        sql: `CREATE INDEX IF NOT EXISTS idx_sync_status ON dados_dachser.t_vouchers(sync_status)`
      }
    ];

    for (const stmt of alterTableStatements) {
      try {
        await client.execute(stmt.sql);
        results.push(`✅ ${stmt.name} - OK`);
        console.log(`[voucher-sync-setup] ${stmt.name} - OK`);
      } catch (err) {
        // Ignore "Duplicate column/key" errors
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('Duplicate') || errMsg.includes('already exists')) {
          results.push(`⚪ ${stmt.name} - Already exists`);
          console.log(`[voucher-sync-setup] ${stmt.name} - Already exists`);
        } else {
          results.push(`❌ ${stmt.name}: ${errMsg}`);
          console.error(`[voucher-sync-setup] Error with ${stmt.name}:`, err);
        }
      }
    }

    // 2. Create t_sync_control table
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_sync_control (
          id INT PRIMARY KEY AUTO_INCREMENT,
          sync_type VARCHAR(50) NOT NULL UNIQUE,
          last_sync_datetime DATETIME DEFAULT NULL COMMENT 'Last synced data_insert timestamp',
          last_sync_id_rm BIGINT DEFAULT NULL COMMENT 'Last synced id_rm for reference',
          records_synced INT DEFAULT 0 COMMENT 'Total records synced in last run',
          total_records INT DEFAULT 0 COMMENT 'Total records in t_vouchers',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      results.push('✅ t_sync_control table created/verified');
      console.log('[voucher-sync-setup] t_sync_control table created/verified');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(`❌ t_sync_control table: ${errMsg}`);
      console.error('[voucher-sync-setup] Error creating t_sync_control:', err);
    }

    // 3. Insert initial control record if not exists
    try {
      await client.execute(`
        INSERT IGNORE INTO dados_dachser.t_sync_control (sync_type, last_sync_datetime, records_synced) 
        VALUES ('voucher_rm', NULL, 0)
      `);
      results.push('✅ Initial sync control record inserted/verified');
      console.log('[voucher-sync-setup] Initial sync control record OK');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(`❌ Initial control record: ${errMsg}`);
      console.error('[voucher-sync-setup] Error inserting control record:', err);
    }

    // 4. Update existing vouchers to have sync_status = 'ATIVO' if null
    try {
      const updateResult = await client.execute(`
        UPDATE dados_dachser.t_vouchers 
        SET sync_status = 'ATIVO' 
        WHERE sync_status IS NULL
      `);
      results.push(`✅ Updated ${updateResult.affectedRows || 0} existing vouchers with sync_status = ATIVO`);
      console.log(`[voucher-sync-setup] Updated existing vouchers: ${updateResult.affectedRows || 0}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(`⚠️ Update existing vouchers: ${errMsg}`);
      console.warn('[voucher-sync-setup] Error updating existing vouchers:', err);
    }

    // 5. Populate data_insert_rm for existing vouchers from t_dados_financeiro_voucher
    try {
      const joinUpdate = await client.execute(`
        UPDATE dados_dachser.t_vouchers v
        JOIN dados_dachser.t_dados_financeiro_voucher dfv 
          ON v.numero_spo COLLATE utf8mb4_unicode_ci = dfv.nd COLLATE utf8mb4_unicode_ci
        SET v.data_insert_rm = dfv.data_insert
        WHERE v.data_insert_rm IS NULL AND dfv.data_insert IS NOT NULL
      `);
      results.push(`✅ Populated data_insert_rm for ${joinUpdate.affectedRows || 0} vouchers`);
      console.log(`[voucher-sync-setup] Populated data_insert_rm: ${joinUpdate.affectedRows || 0}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(`⚠️ Populate data_insert_rm: ${errMsg}`);
      console.warn('[voucher-sync-setup] Error populating data_insert_rm:', err);
    }

    // 6. Mark vouchers as BAIXADO if they exist in tbaixas
    try {
      const baixadosUpdate = await client.execute(`
        UPDATE dados_dachser.t_vouchers v
        JOIN dados_dachser.t_dados_financeiro_voucher dfv 
          ON v.numero_spo COLLATE utf8mb4_unicode_ci = dfv.nd COLLATE utf8mb4_unicode_ci
        JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
        SET v.sync_status = 'BAIXADO'
        WHERE v.sync_status = 'ATIVO'
      `);
      results.push(`✅ Marked ${baixadosUpdate.affectedRows || 0} vouchers as BAIXADO`);
      console.log(`[voucher-sync-setup] Marked as BAIXADO: ${baixadosUpdate.affectedRows || 0}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(`⚠️ Mark BAIXADO: ${errMsg}`);
      console.warn('[voucher-sync-setup] Error marking BAIXADO:', err);
    }

    // 7. Get stats
    let stats = { total: 0, ativos: 0, baixados: 0 };
    try {
      const totalResult = await client.query(`SELECT COUNT(*) as cnt FROM dados_dachser.t_vouchers`);
      const ativosResult = await client.query(`SELECT COUNT(*) as cnt FROM dados_dachser.t_vouchers WHERE sync_status = 'ATIVO'`);
      const baixadosResult = await client.query(`SELECT COUNT(*) as cnt FROM dados_dachser.t_vouchers WHERE sync_status = 'BAIXADO'`);
      
      stats.total = totalResult?.[0]?.cnt || 0;
      stats.ativos = ativosResult?.[0]?.cnt || 0;
      stats.baixados = baixadosResult?.[0]?.cnt || 0;
      
      results.push(`📊 Stats: Total=${stats.total}, Ativos=${stats.ativos}, Baixados=${stats.baixados}`);
    } catch (err) {
      console.warn('[voucher-sync-setup] Error getting stats:', err);
    }

    await client.close();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Sync infrastructure setup complete',
      details: results,
      stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voucher-sync-setup] Setup Error:', error);
    
    if (client) {
      try { await client.close(); } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
