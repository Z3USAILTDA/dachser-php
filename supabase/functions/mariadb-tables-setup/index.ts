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

  const results: { table: string; database: string; status: string; error?: string }[] = [];

  // Connection for ai_agente database
  let aiAgenteClient: Client | null = null;
  // Connection for dados_dachser database
  let dadosDachserClient: Client | null = null;

  try {
    const { database } = await req.json().catch(() => ({ database: 'all' }));

    // ========== AI_AGENTE TABLES ==========
    if (database === 'all' || database === 'ai_agente') {
      try {
        aiAgenteClient = await new Client().connect({
          hostname: Deno.env.get("MARIADB_HOST")!,
          port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
          username: Deno.env.get("MARIADB_USER")!,
          password: Deno.env.get("MARIADB_PASSWORD")!,
          db: "ai_agente",
        });

        // 1. t_chb_client_config
        try {
          await aiAgenteClient.execute(`
            CREATE TABLE IF NOT EXISTS t_chb_client_config (
              id VARCHAR(36) PRIMARY KEY,
              cliente_cnpj VARCHAR(20) NOT NULL,
              cliente_nome VARCHAR(255),
              tolerancia_peso DECIMAL(5,2) DEFAULT 2.0,
              tolerancia_valor DECIMAL(5,2) DEFAULT 1.0,
              campos_obrigatorios JSON,
              regras_comparacao JSON,
              instrucoes_personalizadas TEXT,
              armador VARCHAR(100),
              agente_destino VARCHAR(100),
              contato_email VARCHAR(255),
              prazo_resposta_dias INT DEFAULT 2,
              porto_descarga_real VARCHAR(100),
              tolerancia_taxas_acessorias_abs DECIMAL(10,2) DEFAULT 50,
              tolerancia_taxas_acessorias_pct DECIMAL(5,2) DEFAULT 1.0,
              beneficio_fiscal VARCHAR(100),
              cfop_padrao VARCHAR(10),
              estado_uf VARCHAR(2),
              icms_diferido BOOLEAN DEFAULT FALSE,
              ativo BOOLEAN DEFAULT TRUE,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_cliente_cnpj (cliente_cnpj)
            )
          `);
          results.push({ table: 't_chb_client_config', database: 'ai_agente', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_chb_client_config', database: 'ai_agente', status: 'error', error: (e as Error).message });
        }

        // 2. t_analise_documental_historico
        try {
          await aiAgenteClient.execute(`
            CREATE TABLE IF NOT EXISTS t_analise_documental_historico (
              id VARCHAR(36) PRIMARY KEY,
              pdf_file_name VARCHAR(255) NOT NULL,
              excel_file_name VARCHAR(255) NOT NULL,
              pdf_summary JSON,
              excel_summary JSON,
              comparison JSON,
              analysis JSON,
              metadata JSON,
              total_items INT DEFAULT 0,
              success_count INT DEFAULT 0,
              warning_count INT DEFAULT 0,
              error_count INT DEFAULT 0,
              overall_status VARCHAR(50) DEFAULT 'pending',
              created_by_user_id VARCHAR(36),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_created_at (created_at),
              INDEX idx_status (overall_status)
            )
          `);
          results.push({ table: 't_analise_documental_historico', database: 'ai_agente', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_analise_documental_historico', database: 'ai_agente', status: 'error', error: (e as Error).message });
        }

        await aiAgenteClient.close();
      } catch (connError: unknown) {
        results.push({ table: 'connection', database: 'ai_agente', status: 'error', error: (connError as Error).message });
      }
    }

    // ========== DADOS_DACHSER TABLES ==========
    if (database === 'all' || database === 'dados_dachser') {
      try {
        dadosDachserClient = await new Client().connect({
          hostname: Deno.env.get("MARIADB_HOST")!,
          port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
          username: Deno.env.get("MARIADB_USER")!,
          password: Deno.env.get("MARIADB_PASSWORD")!,
          db: "dados_dachser",
        });

        // 1. t_sla_config
        try {
          await dadosDachserClient.execute(`
            CREATE TABLE IF NOT EXISTS t_sla_config (
              id VARCHAR(36) PRIMARY KEY,
              etapa VARCHAR(50) NOT NULL,
              horas_limite INT NOT NULL DEFAULT 24,
              ativo BOOLEAN DEFAULT TRUE,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE INDEX idx_etapa (etapa)
            )
          `);
          results.push({ table: 't_sla_config', database: 'dados_dachser', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_sla_config', database: 'dados_dachser', status: 'error', error: (e as Error).message });
        }

        // 2. t_accrual_entries
        try {
          await dadosDachserClient.execute(`
            CREATE TABLE IF NOT EXISTS t_accrual_entries (
              id VARCHAR(36) PRIMARY KEY,
              fornecedor VARCHAR(255) NOT NULL,
              valor DECIMAL(15,2) NOT NULL,
              shared_code VARCHAR(100),
              status_accrual VARCHAR(20) DEFAULT 'ATIVO',
              data_upload TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              uploaded_by_user_id VARCHAR(36),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_fornecedor (fornecedor),
              INDEX idx_status (status_accrual),
              INDEX idx_shared_code (shared_code)
            )
          `);
          results.push({ table: 't_accrual_entries', database: 'dados_dachser', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_accrual_entries', database: 'dados_dachser', status: 'error', error: (e as Error).message });
        }

        await dadosDachserClient.close();
      } catch (connError: unknown) {
        results.push({ table: 'connection', database: 'dados_dachser', status: 'error', error: (connError as Error).message });
      }
    }

    const hasErrors = results.some(r => r.status === 'error');

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        message: hasErrors ? 'Some tables failed to create' : 'All tables created successfully',
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
