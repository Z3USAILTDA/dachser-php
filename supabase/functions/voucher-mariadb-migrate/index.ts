import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationResult {
  table: string;
  total: number;
  migrated: number;
  errors: string[];
}

// Convert ISO timestamp to MySQL datetime format
function toMySQLDateTime(isoString: string | null): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return null;
  }
}

// Convert ISO date to MySQL date format
function toMySQLDate(isoString: string | null): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: Client | null = null;

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Connect to MariaDB
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const username = Deno.env.get('MARIADB_USER');
    const password = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !username || !password) {
      throw new Error('Missing MariaDB credentials');
    }

    console.log('[voucher-mariadb-migrate] Connecting to MariaDB...');
    mariaClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: username,
      password: password,
    });
    console.log('[voucher-mariadb-migrate] Connected to MariaDB');

    const results: MigrationResult[] = [];

    // 1. Migrate profiles
    console.log('[voucher-mariadb-migrate] Migrating profiles...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) throw new Error(`Error fetching profiles: ${profilesError.message}`);

    const profileResult: MigrationResult = { table: 't_profiles', total: profiles?.length || 0, migrated: 0, errors: [] };

    for (const profile of profiles || []) {
      try {
        await mariaClient.execute(
          `INSERT INTO t_profiles (id, name, email, role, active, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), active=VALUES(active), updated_at=VALUES(updated_at)`,
          [profile.id, profile.name, profile.email, profile.role || 'OPERACAO', profile.active, toMySQLDateTime(profile.created_at), toMySQLDateTime(profile.updated_at)]
        );
        profileResult.migrated++;
      } catch (err) {
        profileResult.errors.push(`Profile ${profile.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    results.push(profileResult);
    console.log(`[voucher-mariadb-migrate] Profiles: ${profileResult.migrated}/${profileResult.total}`);

    // 2. Migrate user_roles
    console.log('[voucher-mariadb-migrate] Migrating user_roles...');
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');

    if (rolesError) throw new Error(`Error fetching user_roles: ${rolesError.message}`);

    const rolesResult: MigrationResult = { table: 't_user_roles', total: userRoles?.length || 0, migrated: 0, errors: [] };

    for (const role of userRoles || []) {
      try {
        await mariaClient.execute(
          `INSERT INTO t_user_roles (id, user_id, role, created_at) 
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), role=VALUES(role)`,
          [role.id, role.user_id, role.role, toMySQLDateTime(role.created_at)]
        );
        rolesResult.migrated++;
      } catch (err) {
        rolesResult.errors.push(`Role ${role.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    results.push(rolesResult);
    console.log(`[voucher-mariadb-migrate] User roles: ${rolesResult.migrated}/${rolesResult.total}`);

    // 3. Migrate vouchers
    console.log('[voucher-mariadb-migrate] Migrating vouchers...');
    const { data: vouchers, error: vouchersError } = await supabase
      .from('vouchers')
      .select('*');

    if (vouchersError) throw new Error(`Error fetching vouchers: ${vouchersError.message}`);

    const vouchersResult: MigrationResult = { table: 't_vouchers', total: vouchers?.length || 0, migrated: 0, errors: [] };

    for (const v of vouchers || []) {
      try {
        await mariaClient.execute(
          `INSERT INTO t_vouchers (
            id, numero_spo, vencimento, cobranca_em_nome_de, forma_pagamento, remessa, urgente, urgencia_tipo,
            etapa_atual, status_baixa, status_envio_cliente, status_financeiro, tipo_documento, valor, moeda,
            fornecedor, cnpj_fornecedor, cliente_email, filial, data_emissao_documento,
            comentarios_operacao, comentarios_fiscal, comentarios_financeiro, ajuste_operacao, ajuste_fiscal,
            criado_por_user_id, responsavel_operacao_user_id, responsavel_fiscal_user_id, 
            responsavel_financeiro_user_id, responsavel_supervisor_user_id, aprovado_por_user_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            numero_spo=VALUES(numero_spo), vencimento=VALUES(vencimento), etapa_atual=VALUES(etapa_atual),
            status_baixa=VALUES(status_baixa), status_financeiro=VALUES(status_financeiro), updated_at=VALUES(updated_at)`,
          [
            v.id, v.numero_spo, toMySQLDateTime(v.vencimento), v.cobranca_em_nome_de, v.forma_pagamento, v.remessa || 'NENHUM', v.urgente || false, v.urgencia_tipo || 'NORMAL',
            v.etapa_atual, v.status_baixa || 'PENDENTE', v.status_envio_cliente || 'NAO_APLICA', v.status_financeiro || 'PENDENTE', v.tipo_documento, v.valor, v.moeda || 'BRL',
            v.fornecedor, v.cnpj_fornecedor, v.cliente_email, v.filial, toMySQLDate(v.data_emissao_documento),
            v.comentarios_operacao, v.comentarios_fiscal, v.comentarios_financeiro, v.ajuste_operacao, v.ajuste_fiscal,
            v.criado_por_user_id, v.responsavel_operacao_user_id, v.responsavel_fiscal_user_id,
            v.responsavel_financeiro_user_id, v.responsavel_supervisor_user_id, v.aprovado_por_user_id,
            toMySQLDateTime(v.created_at), toMySQLDateTime(v.updated_at)
          ]
        );
        vouchersResult.migrated++;
      } catch (err) {
        vouchersResult.errors.push(`Voucher ${v.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    results.push(vouchersResult);
    console.log(`[voucher-mariadb-migrate] Vouchers: ${vouchersResult.migrated}/${vouchersResult.total}`);

    // 4. Migrate voucher_anexos as attachments
    console.log('[voucher-mariadb-migrate] Migrating attachments...');
    const { data: attachments, error: attachmentsError } = await supabase
      .from('voucher_anexos')
      .select('*');

    if (attachmentsError) throw new Error(`Error fetching voucher_anexos: ${attachmentsError.message}`);

    const attachmentsResult: MigrationResult = { table: 't_attachments', total: attachments?.length || 0, migrated: 0, errors: [] };

    for (const a of attachments || []) {
      try {
        await mariaClient.execute(
          `INSERT INTO t_attachments (id, voucher_id, tipo, file_name, file_url, file_size, uploaded_by_user_id, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE file_name=VALUES(file_name), file_url=VALUES(file_url)`,
          [a.id, a.voucher_id, a.tipo, a.file_name, a.file_url, a.file_size, a.uploaded_by_user_id, toMySQLDateTime(a.created_at)]
        );
        attachmentsResult.migrated++;
      } catch (err) {
        attachmentsResult.errors.push(`Attachment ${a.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    results.push(attachmentsResult);
    console.log(`[voucher-mariadb-migrate] Attachments: ${attachmentsResult.migrated}/${attachmentsResult.total}`);

    // 5. Migrate voucher_logs as log_entries
    console.log('[voucher-mariadb-migrate] Migrating log_entries...');
    const { data: logs, error: logsError } = await supabase
      .from('voucher_logs')
      .select('*');

    if (logsError) throw new Error(`Error fetching voucher_logs: ${logsError.message}`);

    const logsResult: MigrationResult = { table: 't_log_entries', total: logs?.length || 0, migrated: 0, errors: [] };

    for (const log of logs || []) {
      try {
        await mariaClient.execute(
          `INSERT INTO t_log_entries (id, voucher_id, user_id, acao, detalhe, data_hora, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE detalhe=VALUES(detalhe)`,
          [log.id, log.voucher_id, log.user_id, log.acao, log.detalhe, toMySQLDateTime(log.data_hora), toMySQLDateTime(log.data_hora)]
        );
        logsResult.migrated++;
      } catch (err) {
        logsResult.errors.push(`Log ${log.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    results.push(logsResult);
    console.log(`[voucher-mariadb-migrate] Log entries: ${logsResult.migrated}/${logsResult.total}`);

    await mariaClient.close();

    // Summary
    const totalRecords = results.reduce((acc, r) => acc + r.total, 0);
    const totalMigrated = results.reduce((acc, r) => acc + r.migrated, 0);
    const totalErrors = results.reduce((acc, r) => acc + r.errors.length, 0);

    return new Response(JSON.stringify({
      success: true,
      message: `Migração concluída: ${totalMigrated}/${totalRecords} registros`,
      summary: {
        total: totalRecords,
        migrated: totalMigrated,
        errors: totalErrors
      },
      details: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voucher-mariadb-migrate] Migration Error:', error);

    if (mariaClient) {
      try { await mariaClient.close(); } catch (_) { /* ignore */ }
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
