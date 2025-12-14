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

    console.log(`[voucher-mariadb-setup] Connecting to MariaDB at ${host}:${port}/${database}`);

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });

    console.log('[voucher-mariadb-setup] Connected successfully. Creating tables...');

    const results: string[] = [];

    // Create tables one by one
    const tables = [
      { name: 't_profiles', sql: `CREATE TABLE IF NOT EXISTS t_profiles (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        role ENUM('OPERACAO', 'FISCAL', 'FINANCEIRO', 'GESTOR', 'ADMIN', 'GESTOR_OPERACAO', 'GESTOR_FISCAL', 'GESTOR_FINANCEIRO', 'GESTOR_SUPERVISOR') NOT NULL DEFAULT 'OPERACAO',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` },
      { name: 't_user_roles', sql: `CREATE TABLE IF NOT EXISTS t_user_roles (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        role ENUM('OPERACAO', 'FISCAL', 'FINANCEIRO', 'GESTOR', 'ADMIN', 'GESTOR_OPERACAO', 'GESTOR_FISCAL', 'GESTOR_FINANCEIRO', 'GESTOR_SUPERVISOR') NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` },
      { name: 't_vouchers', sql: `CREATE TABLE IF NOT EXISTS t_vouchers (
        id VARCHAR(36) PRIMARY KEY,
        numero_spo VARCHAR(100) NOT NULL,
        vencimento DATETIME NOT NULL,
        cobranca_em_nome_de ENUM('DACHSER', 'CLIENTE') NOT NULL,
        forma_pagamento ENUM('BOLETO', 'TRANSFERENCIA_PIX', 'DEBITO', 'CAMBIO', 'ADF') NOT NULL,
        remessa ENUM('NENHUM', 'REMESSA_12H', 'REMESSA_15H') NOT NULL DEFAULT 'NENHUM',
        urgente BOOLEAN NOT NULL DEFAULT FALSE,
        urgencia_tipo ENUM('NORMAL', 'URGENTE_REAL', 'URGENTE_AUTOMATICO') DEFAULT 'NORMAL',
        etapa_atual ENUM('OPERACAO', 'FISCAL', 'FINANCEIRO', 'ROBO', 'CONCLUIDO', 'AJUSTE_OPERACAO', 'AJUSTE_FISCAL', 'SUPERVISOR') NOT NULL DEFAULT 'OPERACAO',
        status_baixa ENUM('PENDENTE', 'BAIXA_MANUAL', 'BAIXA_REMESSA', 'BAIXADO_RM') NOT NULL DEFAULT 'PENDENTE',
        status_envio_cliente ENUM('NAO_APLICA', 'AGUARDANDO_CLIENTE', 'CONFIRMADO_CLIENTE') NOT NULL DEFAULT 'NAO_APLICA',
        status_financeiro ENUM('PENDENTE', 'APROVADO', 'REJEITADO', 'BAIXADO') DEFAULT 'PENDENTE',
        tipo_documento ENUM('NF_SERVICO', 'NF_DEBITO', 'BOLETO', 'ARMAZENAGEM', 'ICMS', 'OUTROS') DEFAULT NULL,
        valor DECIMAL(15,2) DEFAULT NULL,
        moeda VARCHAR(10) DEFAULT 'BRL',
        fornecedor VARCHAR(255) DEFAULT NULL,
        cnpj_fornecedor VARCHAR(20) DEFAULT NULL,
        cliente_email VARCHAR(255) DEFAULT NULL,
        filial VARCHAR(100) DEFAULT NULL,
        data_emissao_documento DATE DEFAULT NULL,
        comentarios_operacao TEXT DEFAULT NULL,
        comentarios_fiscal TEXT DEFAULT NULL,
        comentarios_financeiro TEXT DEFAULT NULL,
        ajuste_operacao TEXT DEFAULT NULL,
        ajuste_fiscal TEXT DEFAULT NULL,
        criado_por_user_id VARCHAR(36) NOT NULL,
        responsavel_operacao_user_id VARCHAR(36) DEFAULT NULL,
        responsavel_fiscal_user_id VARCHAR(36) DEFAULT NULL,
        responsavel_financeiro_user_id VARCHAR(36) DEFAULT NULL,
        responsavel_supervisor_user_id VARCHAR(36) DEFAULT NULL,
        aprovado_por_user_id VARCHAR(36) DEFAULT NULL,
        urgencia_autorizacao_anexo_id VARCHAR(36) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_numero_spo (numero_spo),
        INDEX idx_etapa_atual (etapa_atual),
        INDEX idx_vencimento (vencimento),
        INDEX idx_status_baixa (status_baixa),
        INDEX idx_criado_por (criado_por_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` },
      { name: 't_attachments', sql: `CREATE TABLE IF NOT EXISTS t_attachments (
        id VARCHAR(36) PRIMARY KEY,
        voucher_id VARCHAR(36) NOT NULL,
        tipo ENUM('FATURA_DEMONSTRATIVO', 'BOLETO_INSTRUCOES', 'COMPROVANTE', 'OUTROS') NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_url TEXT NOT NULL,
        file_size BIGINT DEFAULT NULL,
        uploaded_by_user_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_voucher_id (voucher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` },
      { name: 't_log_entries', sql: `CREATE TABLE IF NOT EXISTS t_log_entries (
        id VARCHAR(36) PRIMARY KEY,
        voucher_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) DEFAULT NULL,
        acao ENUM('INCLUSAO', 'ENVIADO_FISCAL', 'DEVOLVIDO_OPERACAO', 'ENVIADO_FINANCEIRO', 'DEVOLVIDO_FISCAL', 'BAIXADO', 'COMPROVANTE_ANEXADO', 'EMAIL_DISPARADO') NOT NULL,
        detalhe TEXT DEFAULT NULL,
        data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_voucher_id (voucher_id),
        INDEX idx_user_id (user_id),
        INDEX idx_acao (acao),
        INDEX idx_data_hora (data_hora)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` }
    ];

    for (const table of tables) {
      try {
        await client.execute(table.sql);
        results.push(`✅ Tabela ${table.name} criada/verificada`);
        console.log(`[voucher-mariadb-setup] Table ${table.name} created/verified`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push(`❌ Erro na tabela ${table.name}: ${errorMsg}`);
        console.error(`[voucher-mariadb-setup] Error creating table ${table.name}:`, err);
      }
    }

    await client.close();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tabelas criadas com sucesso',
      details: results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voucher-mariadb-setup] MariaDB Setup Error:', error);
    
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
