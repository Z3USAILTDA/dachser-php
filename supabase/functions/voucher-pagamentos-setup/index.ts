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
  const results: { step: string; success: boolean; message: string }[] = [];

  try {
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Connecting to MariaDB for Pagamentos setup...');
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // Step 1: Add new columns to t_vouchers
    console.log('Step 1: Adding columns to t_vouchers...');
    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS tipo_execucao_pagamento ENUM('MANUAL', 'REMESSA', 'TED', 'PIX') DEFAULT NULL
      `);
      results.push({ step: 'Add tipo_execucao_pagamento to t_vouchers', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('tipo_execucao_pagamento:', msg);
      results.push({ step: 'Add tipo_execucao_pagamento to t_vouchers', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS is_pronto_para_robo TINYINT(1) DEFAULT 0
      `);
      results.push({ step: 'Add is_pronto_para_robo to t_vouchers', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('is_pronto_para_robo:', msg);
      results.push({ step: 'Add is_pronto_para_robo to t_vouchers', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(44) DEFAULT NULL
      `);
      results.push({ step: 'Add codigo_barras to t_vouchers', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('codigo_barras:', msg);
      results.push({ step: 'Add codigo_barras to t_vouchers', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS status_pagamento ENUM('PENDENTE_DADOS', 'PRONTO', 'EM_REMESSA', 'PAGO', 'ERRO') DEFAULT 'PENDENTE_DADOS'
      `);
      results.push({ step: 'Add status_pagamento to t_vouchers', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('status_pagamento:', msg);
      results.push({ step: 'Add status_pagamento to t_vouchers', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_vouchers 
        ADD COLUMN IF NOT EXISTS lote_remessa_id VARCHAR(36) DEFAULT NULL
      `);
      results.push({ step: 'Add lote_remessa_id to t_vouchers', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('lote_remessa_id:', msg);
      results.push({ step: 'Add lote_remessa_id to t_vouchers', success: false, message: msg });
    }

    // Step 2: Add PIX columns to t_dados_financeiro_pag if they don't exist
    console.log('Step 2: Adding PIX columns to t_dados_financeiro_pag...');
    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_dados_financeiro_pag 
        ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255) DEFAULT NULL
      `);
      results.push({ step: 'Add chave_pix to t_dados_financeiro_pag', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('chave_pix:', msg);
      results.push({ step: 'Add chave_pix to t_dados_financeiro_pag', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_dados_financeiro_pag 
        ADD COLUMN IF NOT EXISTS pix_tipo_chave VARCHAR(20) DEFAULT NULL
      `);
      results.push({ step: 'Add pix_tipo_chave to t_dados_financeiro_pag', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('pix_tipo_chave:', msg);
      results.push({ step: 'Add pix_tipo_chave to t_dados_financeiro_pag', success: false, message: msg });
    }

    // Step 3: Create t_remessa_lotes table
    console.log('Step 3: Creating t_remessa_lotes table...');
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_remessa_lotes (
          id VARCHAR(36) PRIMARY KEY,
          banco VARCHAR(50) NOT NULL,
          data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          criado_por_user_id VARCHAR(36),
          criado_por_user_name VARCHAR(255),
          status_lote ENUM('DRAFT', 'GERADO', 'ENVIADO', 'RETORNO_IMPORTADO', 'FINALIZADO', 'ERRO') DEFAULT 'DRAFT',
          arquivo_remessa_url TEXT,
          arquivo_retorno_url TEXT,
          metadata_json JSON,
          total_itens INT DEFAULT 0,
          valor_total DECIMAL(15,2) DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      results.push({ step: 'Create t_remessa_lotes table', success: true, message: 'Table created or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('t_remessa_lotes:', msg);
      results.push({ step: 'Create t_remessa_lotes table', success: false, message: msg });
    }

    // Step 4: Create t_remessa_itens table
    console.log('Step 4: Creating t_remessa_itens table...');
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_remessa_itens (
          id VARCHAR(36) PRIMARY KEY,
          lote_id VARCHAR(36) NOT NULL,
          voucher_id VARCHAR(36) NOT NULL,
          valor DECIMAL(15,2),
          vencimento DATE,
          linha_digitavel VARCHAR(100),
          codigo_barras VARCHAR(44),
          status_item ENUM('INCLUIDO', 'REGISTRADO', 'AUTORIZADO', 'PAGO', 'REJEITADO', 'ERRO') DEFAULT 'INCLUIDO',
          retorno_json JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_voucher_lote (voucher_id, lote_id),
          INDEX idx_lote (lote_id),
          INDEX idx_voucher (voucher_id)
        )
      `);
      results.push({ step: 'Create t_remessa_itens table', success: true, message: 'Table created or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('t_remessa_itens:', msg);
      results.push({ step: 'Create t_remessa_itens table', success: false, message: msg });
    }

    // Step 5: Create t_crass table
    console.log('Step 5: Creating t_crass table...');
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_crass (
          id VARCHAR(36) PRIMARY KEY,
          arquivo_url TEXT NOT NULL,
          arquivo_nome VARCHAR(255) NOT NULL,
          data_upload TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          uploaded_by_user_id VARCHAR(36),
          uploaded_by_user_name VARCHAR(255),
          checksum VARCHAR(64),
          is_vigente TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_vigente (is_vigente)
        )
      `);
      results.push({ step: 'Create t_crass table', success: true, message: 'Table created or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('t_crass:', msg);
      results.push({ step: 'Create t_crass table', success: false, message: msg });
    }

    // Step 6: Add new columns to t_voucher_logs
    console.log('Step 6: Adding columns to t_voucher_logs...');
    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_voucher_logs 
        ADD COLUMN IF NOT EXISTS origin ENUM('UI', 'ROBO', 'RM', 'SYSTEM') DEFAULT 'UI'
      `);
      results.push({ step: 'Add origin to t_voucher_logs', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('origin:', msg);
      results.push({ step: 'Add origin to t_voucher_logs', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_voucher_logs 
        ADD COLUMN IF NOT EXISTS entity_type ENUM('VOUCHER', 'ANEXO', 'PAGAMENTO', 'REMESSA') DEFAULT 'VOUCHER'
      `);
      results.push({ step: 'Add entity_type to t_voucher_logs', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('entity_type:', msg);
      results.push({ step: 'Add entity_type to t_voucher_logs', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_voucher_logs 
        ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT NULL
      `);
      results.push({ step: 'Add event_type to t_voucher_logs', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('event_type:', msg);
      results.push({ step: 'Add event_type to t_voucher_logs', success: false, message: msg });
    }

    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_voucher_logs 
        ADD COLUMN IF NOT EXISTS payload_json JSON DEFAULT NULL
      `);
      results.push({ step: 'Add payload_json to t_voucher_logs', success: true, message: 'Column added or already exists' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('payload_json:', msg);
      results.push({ step: 'Add payload_json to t_voucher_logs', success: false, message: msg });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Setup complete: ${successCount} successful, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Setup completed: ${successCount} steps successful, ${failCount} steps failed`,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Setup failed', details: errorMessage, results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
