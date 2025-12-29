import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const mariadbHost = Deno.env.get('MARIADB_HOST');
  const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
  const mariadbUser = Deno.env.get('MARIADB_USER');
  const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
  const mariadbDb = 'dados_dachser';

  if (!mariadbHost || !mariadbUser || !mariadbPass) {
    return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
    const client = await new Client().connect({
      hostname: mariadbHost,
      port: parseInt(mariadbPort, 10),
      username: mariadbUser,
      password: mariadbPass,
      db: mariadbDb,
    });

    console.log('[olimpo-setup] Criando tabela t_olimpo_tracking em dados_dachser...');

    // Criar tabela centralizada do Olimpo
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_olimpo_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        
        -- Identificação
        mode VARCHAR(10) NOT NULL,
        asset VARCHAR(50) NOT NULL,
        flight VARCHAR(20) DEFAULT NULL,
        
        -- Dados do processo
        tipo_processo VARCHAR(50) DEFAULT NULL,
        cliente VARCHAR(255) DEFAULT NULL,
        
        -- Rota
        origem_code VARCHAR(10) DEFAULT NULL,
        destino_code VARCHAR(10) DEFAULT NULL,
        origem_lat DECIMAL(10,6) DEFAULT NULL,
        origem_lon DECIMAL(10,6) DEFAULT NULL,
        destino_lat DECIMAL(10,6) DEFAULT NULL,
        destino_lon DECIMAL(10,6) DEFAULT NULL,
        
        -- Status e tempos
        status VARCHAR(50) DEFAULT 'Em trânsito',
        eta DATETIME DEFAULT NULL,
        ata DATETIME DEFAULT NULL,
        etd DATETIME DEFAULT NULL,
        atd DATETIME DEFAULT NULL,
        
        -- Posição atual (para mapa)
        current_lat DECIMAL(10,6) DEFAULT NULL,
        current_lon DECIMAL(10,6) DEFAULT NULL,
        
        -- Dados específicos SEA
        vessel_name VARCHAR(100) DEFAULT NULL,
        shipping_line VARCHAR(100) DEFAULT NULL,
        container_status VARCHAR(100) DEFAULT NULL,
        
        -- Metadados
        last_api_update DATETIME DEFAULT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        -- Índices
        UNIQUE KEY uk_mode_asset (mode, asset),
        INDEX idx_mode (mode),
        INDEX idx_cliente (cliente),
        INDEX idx_status (status),
        INDEX idx_eta (eta),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[olimpo-setup] Tabela criada com sucesso!');

    // Verificar estrutura
    const cols = await client.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'dados_dachser' 
      AND TABLE_NAME = 't_olimpo_tracking'
      ORDER BY ORDINAL_POSITION
    `);

    await client.close();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tabela t_olimpo_tracking criada com sucesso em dados_dachser',
      columns: cols.map((c: any) => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[olimpo-setup] Error:', e);
    return new Response(JSON.stringify({ 
      error: 'Falha ao criar tabela', 
      detail: e.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
