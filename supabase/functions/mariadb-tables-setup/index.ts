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

        // 3. t_dachser_chb_runs - CHB analysis runs (migrated from Supabase chb_analysis_requests)
        try {
          await aiAgenteClient.execute(`
            CREATE TABLE IF NOT EXISTS t_dachser_chb_runs (
              id VARCHAR(36) PRIMARY KEY,
              item_id INT NOT NULL,
              etapa VARCHAR(10) NOT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'pending',
              result_text TEXT,
              result_html LONGTEXT,
              result_json JSON,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_item_id (item_id),
              INDEX idx_status (status)
            )
          `);
          results.push({ table: 't_dachser_chb_runs', database: 'ai_agente', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_dachser_chb_runs', database: 'ai_agente', status: 'error', error: (e as Error).message });
        }

        // 4. t_dachser_chb_extracted_data - CHB extracted data cache (migrated from Supabase chb_extracted_data)
        try {
          await aiAgenteClient.execute(`
            CREATE TABLE IF NOT EXISTS t_dachser_chb_extracted_data (
              id INT AUTO_INCREMENT PRIMARY KEY,
              item_id INT NOT NULL,
              filename VARCHAR(255) NOT NULL,
              etapa VARCHAR(10) NOT NULL,
              extracted_fields JSON,
              raw_text LONGTEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uk_item_file_etapa (item_id, filename, etapa),
              INDEX idx_item_id (item_id)
            )
          `);
          results.push({ table: 't_dachser_chb_extracted_data', database: 'ai_agente', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_dachser_chb_extracted_data', database: 'ai_agente', status: 'error', error: (e as Error).message });
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

        // 3. t_leadcomex_enrichment_logs - LeadComex reverse ladder enrichment logs
        try {
          await dadosDachserClient.execute(`
            CREATE TABLE IF NOT EXISTS t_leadcomex_enrichment_logs (
              -- === CHAVE PRIMARIA ===
              id INT AUTO_INCREMENT PRIMARY KEY,
              
              -- === METADADOS DE EXECUCAO ===
              hawb VARCHAR(50) NOT NULL COMMENT 'HAWB buscado',
              mawb VARCHAR(50) COMMENT 'MAWB associado',
              dep_date DATE COMMENT 'Data DEP original do MariaDB',
              success BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Se encontrou dados',
              matched_date DATE COMMENT 'Data que retornou dados',
              offset_days INT DEFAULT 0 COMMENT 'Dias de offset aplicado (0 a 15)',
              total_attempts INT DEFAULT 1 COMMENT 'Quantidade de tentativas feitas',
              total_time_ms INT COMMENT 'Tempo total de execucao em ms',
              execution_source VARCHAR(50) DEFAULT 'manual' COMMENT 'manual, cron-hourly, batch',
              
              -- === IDENTIFICACAO (API) ===
              lc_hawb VARCHAR(100) COMMENT 'identificacao.hawb retornado',
              lc_data_emissao DATETIME COMMENT 'identificacao.dataEmissao',
              lc_situacao_lead VARCHAR(50) COMMENT 'identificacao.situacaoLead',
              lc_situacao_portal VARCHAR(50) COMMENT 'identificacao.situacaoPortal',
              lc_data_ultima_atualizacao DATETIME COMMENT 'dataUltimaAtualizacaoCargaDetalhada',
              lc_data_integracao_lead DATETIME COMMENT 'identificacao.dataIntegracaoLead',
              
              -- === CARGA DETALHADA - CAMPOS ESCALARES ===
              lc_tipo VARCHAR(20) COMMENT 'tipo (HAWB/MAWB)',
              lc_situacao VARCHAR(5) COMMENT 'situacao',
              lc_situacao_carga INT COMMENT 'situacaoCarga',
              lc_categoria_carga VARCHAR(10) COMMENT 'categoriaCarga',
              lc_ruc VARCHAR(100) COMMENT 'ruc',
              lc_identificacao VARCHAR(100) COMMENT 'identificacao',
              lc_nro_mawb_associado VARCHAR(50) COMMENT 'nroMawbAssociado',
              
              -- === AEROPORTOS ===
              lc_aeroporto_origem VARCHAR(10) COMMENT 'codigoAeroportoOrigemConhecimento',
              lc_aeroporto_destino VARCHAR(10) COMMENT 'codigoAeroportoDestinoConhecimento',
              lc_recinto_aduaneiro_destino VARCHAR(20) COMMENT 'recintoAduaneiroDestino',
              
              -- === PESO E VOLUMES ===
              lc_peso_bruto DECIMAL(12,3) COMMENT 'pesoBrutoConhecimento',
              lc_quantidade_volumes INT COMMENT 'quantidadeVolumesConhecimento',
              lc_descricao_resumida TEXT COMMENT 'descricaoResumida',
              lc_indicador_partes_madeira VARCHAR(5) COMMENT 'indicadorPartesMadeira',
              
              -- === CONSIGNATARIO ===
              lc_cnpj_consignatario VARCHAR(20) COMMENT 'identificacaoDocumentoConsignatario',
              lc_nome_consignatario VARCHAR(200) COMMENT 'nomeConsignatarioConhecimento',
              lc_razao_social_consignatario VARCHAR(200) COMMENT 'razaoSocialDocumentoConsignatario',
              lc_tipo_documento_consignatario VARCHAR(20) COMMENT 'tipoDocumentoConsignatario',
              lc_endereco_consignatario TEXT COMMENT 'enderecoConsignatarioConhecimento',
              lc_cidade_consignatario VARCHAR(100) COMMENT 'cidadeConsignatarioConhecimento',
              lc_cep_consignatario VARCHAR(20) COMMENT 'caixaPostalConsignatarioConhecimento',
              lc_pais_consignatario VARCHAR(5) COMMENT 'paisConsignatarioConhecimento',
              
              -- === EMBARCADOR ===
              lc_nome_embarcador VARCHAR(200) COMMENT 'nomeEmbarcadorEstrangeiro',
              lc_endereco_embarcador TEXT COMMENT 'enderecoEmbarcadorEstrangeiro',
              lc_cidade_embarcador VARCHAR(100) COMMENT 'cidadeEmbarcadorEstrangeiro',
              lc_cep_embarcador VARCHAR(20) COMMENT 'caixaPostalEmbarcadorEstrangeiro',
              lc_pais_embarcador VARCHAR(5) COMMENT 'paisEmbarcadorEstrangeiro',
              
              -- === AGENTE DE CARGA ===
              lc_nome_agente_carga VARCHAR(200) COMMENT 'nomeAgenteDeCargaConsolidadorEstrang',
              lc_endereco_agente_carga TEXT COMMENT 'enderecoAgenteDeCargaConsolidadorEstrang',
              lc_cidade_agente_carga VARCHAR(100) COMMENT 'cidadeAgenteDeCargaConsolidadorEstrang',
              lc_pais_agente_carga VARCHAR(5) COMMENT 'paisAgenteDeCargaConsolidadorEstrang',
              lc_cnpj_responsavel_arquivo VARCHAR(20) COMMENT 'cnpjResponsavelArquivo',
              
              -- === ASSINATURA TRANSPORTADOR ===
              lc_nome_assinatura_transportador VARCHAR(200) COMMENT 'nomeAssinaturaTransportador',
              lc_local_assinatura_transportador VARCHAR(100) COMMENT 'localAssinaturaTransportador',
              lc_data_assinatura_transportador DATETIME COMMENT 'dataHoraAssinaturaTransportador',
              lc_data_hora_situacao_atual DATETIME COMMENT 'dataHoraSituacaoAtual',
              
              -- === FRETE (resumo) ===
              lc_frete_pendencia_pagamento VARCHAR(5) COMMENT 'frete.pendenciaPagamento',
              lc_frete_moeda_codigo VARCHAR(10) COMMENT 'frete.moedaOrigem.codigo',
              lc_frete_moeda_descricao VARCHAR(50) COMMENT 'frete.moedaOrigem.descricao',
              lc_frete_valor_total DECIMAL(15,2) COMMENT 'frete total prepaid',
              lc_frete_por_item DECIMAL(15,2) COMMENT 'somatorioFretePorItemCarga.valor',
              
              -- === ARRAYS/OBJETOS COMPLEXOS (JSON) ===
              lc_bloqueios_ativos_json TEXT COMMENT 'bloqueiosAtivos JSON array',
              lc_bloqueios_baixados_json TEXT COMMENT 'bloqueiosBaixados JSON array',
              lc_divergencias_json TEXT COMMENT 'divergencias JSON array',
              lc_viagens_associadas_json TEXT COMMENT 'viagensAssociadas JSON array',
              lc_mawb_associados_json TEXT COMMENT 'mawbAwbAssociados JSON array',
              lc_partes_estoque_json TEXT COMMENT 'partesEstoque JSON array',
              lc_itens_carga_json TEXT COMMENT 'itensCarga JSON array',
              lc_frete_json TEXT COMMENT 'frete JSON completo',
              
              -- === DETALHES DE TENTATIVAS ===
              attempts_json TEXT COMMENT 'Array de tentativas com detalhes de cada offset',
              
              -- === RAW JSON COMPLETO ===
              raw_response_json MEDIUMTEXT COMMENT 'Resposta completa da API LeadComex',
              
              -- === TIMESTAMPS ===
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              
              -- === INDICES ===
              INDEX idx_hawb (hawb),
              INDEX idx_mawb (mawb),
              INDEX idx_success (success),
              INDEX idx_created_at (created_at),
              INDEX idx_lc_cnpj (lc_cnpj_consignatario),
              INDEX idx_lc_situacao (lc_situacao_lead),
              INDEX idx_execution_source (execution_source)
            ) ENGINE=InnoDB 
              DEFAULT CHARSET=utf8mb4 
              COLLATE=utf8mb4_general_ci 
              COMMENT='Logs de enriquecimento LeadComex com escada reversa de datas'
          `);
          results.push({ table: 't_leadcomex_enrichment_logs', database: 'dados_dachser', status: 'success' });
        } catch (e: unknown) {
          results.push({ table: 't_leadcomex_enrichment_logs', database: 'dados_dachser', status: 'error', error: (e as Error).message });
        }

        // 4. ALTER TABLE t_sea_master - Add SEA-specific columns if they don't exist
        const seaColumns = [
          { name: 'hbl', definition: 'VARCHAR(100) NULL' },
          { name: 'customer_order', definition: 'VARCHAR(100) NULL' },
          { name: 'accrual', definition: 'TINYINT NULL' },
          { name: 'dep', definition: 'TINYINT NULL' },
          { name: 'eta_ata', definition: 'DATETIME NULL' },
          { name: 'email_title', definition: 'TEXT NULL' },
          { name: 'te', definition: 'VARCHAR(50) NULL' },
          { name: 'at_field', definition: 'VARCHAR(50) NULL' },
          { name: 'wh_treatment', definition: 'VARCHAR(100) NULL' },
          { name: 'cct_transm', definition: 'VARCHAR(100) NULL' },
        ];

        for (const col of seaColumns) {
          try {
            // Check if column exists
            const checkResult = await dadosDachserClient.execute(`
              SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = 'dados_dachser' 
                AND TABLE_NAME = 't_sea_master' 
                AND COLUMN_NAME = ?
            `, [col.name]);
            
            const exists = (checkResult.rows?.[0] as { cnt: number })?.cnt > 0;
            
            if (!exists) {
              await dadosDachserClient.execute(`
                ALTER TABLE dados_dachser.t_sea_master ADD COLUMN ${col.name} ${col.definition}
              `);
              results.push({ table: `t_sea_master.${col.name}`, database: 'dados_dachser', status: 'added' });
            } else {
              results.push({ table: `t_sea_master.${col.name}`, database: 'dados_dachser', status: 'exists' });
            }
          } catch (e: unknown) {
            results.push({ table: `t_sea_master.${col.name}`, database: 'dados_dachser', status: 'error', error: (e as Error).message });
          }
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
