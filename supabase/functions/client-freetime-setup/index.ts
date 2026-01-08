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

    console.log(`[client-freetime-setup] Connecting to MariaDB at ${host}:${port}/${database}`);

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('[client-freetime-setup] Connected successfully. Creating table...');

    // Create t_client_free_time table in MariaDB
    await client.execute(`
      CREATE TABLE IF NOT EXISTS t_client_free_time (
        id VARCHAR(36) PRIMARY KEY,
        cliente_nome VARCHAR(255) NOT NULL,
        cliente_cnpj VARCHAR(20) DEFAULT NULL,
        tipo_ft ENUM('CONTRATO', 'PROCESSO') NOT NULL DEFAULT 'CONTRATO',
        mbl VARCHAR(100) DEFAULT NULL,
        armador VARCHAR(100) DEFAULT NULL,
        free_time_days INT NOT NULL DEFAULT 14,
        vigencia_inicio DATE DEFAULT NULL,
        vigencia_fim DATE DEFAULT NULL,
        notas TEXT DEFAULT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(36) DEFAULT NULL,
        INDEX idx_cliente_nome (cliente_nome),
        INDEX idx_tipo_ft (tipo_ft),
        INDEX idx_mbl (mbl),
        INDEX idx_ativo (ativo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[client-freetime-setup] Table t_client_free_time created/verified');

    await client.close();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tabela t_client_free_time criada com sucesso no MariaDB'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[client-freetime-setup] Error:', error);
    
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
