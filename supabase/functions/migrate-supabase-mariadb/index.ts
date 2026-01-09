import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const results: { table: string; source: string; destination: string; records: number; status: string; error?: string }[] = [];

  // Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // MariaDB clients
  let aiAgenteClient: Client | null = null;
  let dadosDachserClient: Client | null = null;

  try {
    const { tables } = await req.json().catch(() => ({ tables: 'all' }));

    // ========== MIGRATE CHB_CLIENT_CONFIG → ai_agente.t_chb_client_config ==========
    if (tables === 'all' || tables === 'chb_client_config') {
      try {
        const { data: configs, error: sbError } = await supabase
          .from('chb_client_config')
          .select('*');

        if (sbError) throw sbError;

        if (configs && configs.length > 0) {
          aiAgenteClient = await new Client().connect({
            hostname: Deno.env.get("MARIADB_HOST")!,
            port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
            username: Deno.env.get("MARIADB_USER")!,
            password: Deno.env.get("MARIADB_PASSWORD")!,
            db: "ai_agente",
          });

          for (const cfg of configs) {
            await aiAgenteClient.execute(`
              INSERT IGNORE INTO t_chb_client_config (
                id, cliente_cnpj, cliente_nome, tolerancia_peso, tolerancia_valor,
                campos_obrigatorios, regras_comparacao, instrucoes_personalizadas,
                armador, agente_destino, contato_email, prazo_resposta_dias,
                porto_descarga_real, tolerancia_taxas_acessorias_abs, tolerancia_taxas_acessorias_pct,
                beneficio_fiscal, cfop_padrao, estado_uf, icms_diferido, ativo, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              cfg.id,
              cfg.cliente_cnpj,
              cfg.cliente_nome,
              cfg.tolerancia_peso || 2.0,
              cfg.tolerancia_valor || 1.0,
              JSON.stringify(cfg.campos_obrigatorios || []),
              JSON.stringify(cfg.regras_comparacao || {}),
              cfg.instrucoes_personalizadas,
              cfg.armador,
              cfg.agente_destino,
              cfg.contato_email,
              cfg.prazo_resposta_dias || 2,
              cfg.porto_descarga_real,
              cfg.tolerancia_taxas_acessorias_abs || 50,
              cfg.tolerancia_taxas_acessorias_pct || 1.0,
              cfg.beneficio_fiscal,
              cfg.cfop_padrao,
              cfg.estado_uf,
              cfg.icms_diferido ? 1 : 0,
              cfg.ativo !== false ? 1 : 0,
              cfg.created_at,
              cfg.updated_at
            ]);
          }

          await aiAgenteClient.close();
          results.push({
            table: 'chb_client_config',
            source: 'supabase',
            destination: 'ai_agente.t_chb_client_config',
            records: configs.length,
            status: 'success'
          });
        } else {
          results.push({
            table: 'chb_client_config',
            source: 'supabase',
            destination: 'ai_agente.t_chb_client_config',
            records: 0,
            status: 'skipped',
            error: 'No records to migrate'
          });
        }
      } catch (e: unknown) {
        results.push({
          table: 'chb_client_config',
          source: 'supabase',
          destination: 'ai_agente.t_chb_client_config',
          records: 0,
          status: 'error',
          error: (e as Error).message
        });
      }
    }

    // ========== MIGRATE SLA_CONFIG → dados_dachser.t_sla_config ==========
    if (tables === 'all' || tables === 'sla_config') {
      try {
        const { data: slaConfigs, error: sbError } = await supabase
          .from('sla_config')
          .select('*');

        if (sbError) throw sbError;

        if (slaConfigs && slaConfigs.length > 0) {
          dadosDachserClient = await new Client().connect({
            hostname: Deno.env.get("MARIADB_HOST")!,
            port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
            username: Deno.env.get("MARIADB_USER")!,
            password: Deno.env.get("MARIADB_PASSWORD")!,
            db: "dados_dachser",
          });

          for (const sla of slaConfigs) {
            await dadosDachserClient.execute(`
              INSERT IGNORE INTO t_sla_config (
                id, etapa, horas_limite, ativo, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
              sla.id,
              sla.etapa,
              sla.horas_limite,
              sla.ativo ? 1 : 0,
              sla.created_at,
              sla.updated_at
            ]);
          }

          await dadosDachserClient.close();
          results.push({
            table: 'sla_config',
            source: 'supabase',
            destination: 'dados_dachser.t_sla_config',
            records: slaConfigs.length,
            status: 'success'
          });
        } else {
          results.push({
            table: 'sla_config',
            source: 'supabase',
            destination: 'dados_dachser.t_sla_config',
            records: 0,
            status: 'skipped',
            error: 'No records to migrate'
          });
        }
      } catch (e: unknown) {
        results.push({
          table: 'sla_config',
          source: 'supabase',
          destination: 'dados_dachser.t_sla_config',
          records: 0,
          status: 'error',
          error: (e as Error).message
        });
      }
    }

    // ========== MIGRATE ACCRUAL_ENTRIES → dados_dachser.t_accrual_entries ==========
    if (tables === 'all' || tables === 'accrual_entries') {
      try {
        const { data: accruals, error: sbError } = await supabase
          .from('accrual_entries')
          .select('*');

        if (sbError) throw sbError;

        if (accruals && accruals.length > 0) {
          if (!dadosDachserClient) {
            dadosDachserClient = await new Client().connect({
              hostname: Deno.env.get("MARIADB_HOST")!,
              port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
              username: Deno.env.get("MARIADB_USER")!,
              password: Deno.env.get("MARIADB_PASSWORD")!,
              db: "dados_dachser",
            });
          }

          for (const acc of accruals) {
            await dadosDachserClient.execute(`
              INSERT IGNORE INTO t_accrual_entries (
                id, fornecedor, valor, shared_code, status_accrual, data_upload, uploaded_by_user_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              acc.id,
              acc.fornecedor,
              acc.valor,
              acc.shared_code,
              acc.status_accrual || 'ATIVO',
              acc.data_upload,
              acc.uploaded_by_user_id,
              acc.created_at
            ]);
          }

          results.push({
            table: 'accrual_entries',
            source: 'supabase',
            destination: 'dados_dachser.t_accrual_entries',
            records: accruals.length,
            status: 'success'
          });
        } else {
          results.push({
            table: 'accrual_entries',
            source: 'supabase',
            destination: 'dados_dachser.t_accrual_entries',
            records: 0,
            status: 'skipped',
            error: 'No records to migrate'
          });
        }
      } catch (e: unknown) {
        results.push({
          table: 'accrual_entries',
          source: 'supabase',
          destination: 'dados_dachser.t_accrual_entries',
          records: 0,
          status: 'error',
          error: (e as Error).message
        });
      }
    }

    const hasErrors = results.some(r => r.status === 'error');

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        message: hasErrors ? 'Some migrations failed' : 'All migrations completed successfully',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, results }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (aiAgenteClient) await aiAgenteClient.close().catch(() => {});
    if (dadosDachserClient) await dadosDachserClient.close().catch(() => {});
  }
});
