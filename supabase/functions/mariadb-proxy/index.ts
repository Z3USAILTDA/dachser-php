import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryRequest {
  action: string;
  doc_id?: number | string;
  id?: number | string;
  query?: string;
  observacoes?: string;
  username?: string;
  password?: string;
  userId?: number;
  rules?: Array<{cnpj: string; airportCode?: string; notes?: string; emailDespachante?: string; enderecoCompleto?: string}>;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  perPage?: number;
  page?: number;
  endpoint?: string;
  method?: string;
  matrixId?: number;
  customer?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
  fileUrl?: string;
  ruleId?: number;
  cnpj?: string;
  airportCode?: string;
  addressPattern?: string;
  notes?: string;
  emailDespachante?: string;
  enderecoCompleto?: string;
  refOthello?: string;
  empresa?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  pais?: string;
  documentId?: number;
  fileName?: string;
  fileType?: string;
  filePath?: string;
  fileSize?: number;
  parsedAwbId?: number;
  awbNumber?: string;
  shipper?: string;
  consignee?: string;
  origin?: string;
  destination?: string;
  routingLegs?: string[];
  carrier?: string;
  flightNumbers?: string[];
  mrn?: string;
  hsCodes?: string[];
  grossWeight?: number;
  chargeableWeight?: number;
  dimensions?: string;
  incoterms?: string;
  references?: string[];
  rawJson?: object;
  awbCheckId?: number;
  hawbDocumentId?: number;
  instructionDocumentId?: number;
  parsedDataId?: number;
  ruleRowId?: number;
  status?: string;
  validationStatus?: string;
  validationMessage?: string;
  validatedAt?: string;
  matchedRuleId?: number;
  createdBy?: string;
  hawbFileName?: string;
  hawbFilePath?: string;
  extractedAwb?: string;
  extractedCnpj?: string;
  extractedOrigin?: string;
  extractedDestination?: string;
  extractedCustomer?: string;
  confidenceScore?: number;
  logAction?: string;
  entity?: string;
  entityId?: number;
  details?: string;
  updates?: Record<string, unknown>;
  awbNumbers?: string[];
  cliente_nome?: string;
  cnpj_consignatario?: string;
  email_cliente?: string;
  aeroportos?: string;
  eventos_disparo?: string;
  canais?: string;
  template_id?: string;
  ativo?: boolean;
  itemId?: number;
  reference?: string;
  status_macro?: string;
  step1_status?: string;
  step2_status?: string;
  step3_status?: string;
  modal?: string;
  fileId?: number;
  filename?: string;
  mime?: string;
  sizeBytes?: number;
  sha256?: string;
  relPath?: string;
  url?: string;
  etapa?: string;
  docRole?: string;
  runId?: number;
  resultText?: string;
  resultHtml?: string;
  resultJson?: string;
  usedAsCtx?: boolean;
  analysisType?: string;
  search?: string;
  analysisId?: string;
  completed?: boolean;
  forceAll?: boolean;
  fileContent?: string;
  role?: string;
  metadata?: unknown;
  esteira_role?: string;
  esteira_active?: number;
  // Pagamentos module
  tipo_execucao_pagamento?: string;
  is_pronto?: boolean;
  status_pagamento?: string;
  codigo_barras?: string;
  voucher_ids?: string[];
  banco?: string;
  criado_por_user_id?: string;
  criado_por_user_name?: string;
  lote_id?: string;
  item_id?: number | string;
  voucher_id?: string;
  status_lote?: string;
  arquivo_remessa_url?: string;
  arquivo_retorno_url?: string;
  arquivo_url?: string;
  arquivo_nome?: string;
  uploaded_by_user_id?: string;
  uploaded_by_user_name?: string;
  checksum?: string;
  user_id?: string;
  user_name?: string;
  acao?: string;
  detalhe?: string;
  origin_log?: string;
  entity_type?: string;
  event_type?: string;
  payload_json?: object;
  filterVencimento?: string;
  filterStatusPagamento?: string;
  filterTipoExecucao?: string;
  filterFornecedor?: string;
  filterCobranca?: string;
  filterFilial?: string;
  filterMoeda?: string;
  filterFormaPagamento?: string;
  filterStatus?: string;
  filterBanco?: string;
  filterStatusIntegracaoRm?: string;
  status_integracao_rm?: string;
  statusIntegracaoRm?: string;
  statusBaixa?: string;
  cobrancaEmNomeDe?: string;
  dataInicio?: string;
  dataFim?: string;
  // Robo comprovantes
  numero_spo?: string;
  numero_nd?: string;
  comprovantes?: Array<{
    voucher_id: string;
    file_name: string;
    file_url: string;
    file_size?: number;
    user_id?: string;
    user_name?: string;
  }>;
  // Cancelamento
  motivo?: string;
  voucher_credito?: string;
  // Consolidação / Agrupamento
  master_id?: string;
  numero_rm?: string;
  consolidacao_rm_numero?: string;
  // API Usage Tracking
  api_name?: string;
  status_code?: number;
  response_time_ms?: number;
  error_message?: string;
  edge_function?: string;
  user_email?: string;
  cycle_key?: string;
  // Demurrage module
  container_id?: number;
  rate_id?: number;
  risk_status?: string;
  cronos_status?: string;
  cliente?: string;
  armador?: string;
  pre_invoice_status?: string;
  dispute_status?: string;
  audit_status?: string;
  limit?: number;
  setting_key?: string;
  setting_value?: string;
  free_time_days?: number;
  rate_usd?: number;
  container_type?: string;
  period_type?: string;
  period_start_day?: number;
  period_end_day?: number;
  // Demurrage pre-invoices, events, disputes
  pre_invoice_id?: number;
  invoice_number?: string;
  shipment_mbl?: string;
  bl_number?: string;
  vessel_name?: string;
  voyage_number?: string;
  origin_port?: string;
  destination_port?: string;
  arrival_date?: string;
  issue_date?: string;
  due_date?: string;
  total_usd?: number;
  total_brl?: number;
  exchange_rate?: number;
  workflow_status?: string;
  financial_status?: string;
  created_by?: string;
  events?: any[];
  demurrage_event_type?: string;
  demurrage_event_code?: string;
  demurrage_event_description?: string;
  demurrage_event_datetime?: string;
  demurrage_location?: string;
  demurrage_terminal?: string;
  demurrage_source?: string;
  demurrage_raw_data?: object;
  alert_type?: string;
  shipment_master?: string;
  recipient_emails?: string[];
  disputed_amount_usd?: number;
  recovered_amount_usd?: number;
  dispute_reason?: string;
  success_probability?: number;
  resolution_notes?: string;
  opened_by?: string;
  resolved_by?: string;
  resolved_at?: string;
  client_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json() as QueryRequest;
    const { action } = body;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} - Action: ${action}`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    let result;

    switch (action) {
      // ==================== AUTH ====================
      case 'login': {
        const { username, password } = body;
        if (!username || !password) {
          return new Response(
            JSON.stringify({ error: 'Usuário e senha são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Attempting login for: ${username}`);
        
        const users = await client.query(
          'SELECT id, username, email, is_admin, olimpo_only, metrics_only, must_change_password, password_hash FROM ai_agente.t_users_dachser WHERE username = ?',
          [username]
        );

        if (!users || users.length === 0) {
          console.log('Login failed: User not found');
          return new Response(
            JSON.stringify({ error: 'Credenciais inválidas' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = users[0];
        // Convert PHP's $2y$ prefix to $2a$ for Deno bcrypt compatibility
        let passwordHash = user.password_hash;
        if (passwordHash && passwordHash.startsWith('$2y$')) {
          passwordHash = '$2a$' + passwordHash.substring(4);
        }
        const isValidPassword = bcrypt.compareSync(password, passwordHash);
        
        if (!isValidPassword) {
          console.log('Login failed: Invalid password');
          return new Response(
            JSON.stringify({ error: 'Credenciais inválidas' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { 
          success: true, 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            is_admin: user.is_admin,
            olimpo_only: user.olimpo_only || 0,
            metrics_only: user.metrics_only || 0,
            must_change_password: user.must_change_password || 0
          }
        };
        console.log(`Login successful for user: ${user.username}`);
        break;
      }

      case 'get_user': {
        const { userId } = body;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const users = await client.query(
          'SELECT id, username, email, is_admin FROM ai_agente.t_users_dachser WHERE id = ?',
          [userId]
        );

        if (!users || users.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Usuário não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, user: users[0] };
        break;
      }

      case 'get_all_users_esteira': {
        // First, ensure the columns exist (add them if they don't)
        try {
          await client.query(`
            ALTER TABLE ai_agente.t_users_dachser 
            ADD COLUMN IF NOT EXISTS esteira_role VARCHAR(50) NULL,
            ADD COLUMN IF NOT EXISTS esteira_active TINYINT(1) DEFAULT 1
          `);
        } catch (alterErr) {
          // Columns might already exist or different MySQL version
          console.log('Note: ALTER TABLE might have failed (columns may already exist):', alterErr);
        }

        const users = await client.query(
          `SELECT id, username, email, is_admin, 
                  COALESCE(esteira_role, NULL) as esteira_role, 
                  COALESCE(esteira_active, 1) as esteira_active 
           FROM ai_agente.t_users_dachser 
           ORDER BY username ASC`
        );
        
        result = { success: true, users };
        break;
      }

      case 'update_user_esteira_role': {
        const { userId, esteira_role } = body;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.query(
          `UPDATE ai_agente.t_users_dachser SET esteira_role = ? WHERE id = ?`,
          [esteira_role || null, userId]
        );
        
        console.log(`Updated esteira_role for user ${userId} to ${esteira_role}`);
        result = { success: true };
        break;
      }

      case 'update_user_esteira_active': {
        const { userId, esteira_active } = body;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.query(
          `UPDATE ai_agente.t_users_dachser SET esteira_active = ? WHERE id = ?`,
          [esteira_active ? 1 : 0, userId]
        );
        
        console.log(`Updated esteira_active for user ${userId} to ${esteira_active}`);
        result = { success: true };
        break;
      }

      case 'get_user_esteira_role': {
        const { userId } = body;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // First, try to ensure columns exist
        try {
          await client.query(`
            ALTER TABLE ai_agente.t_users_dachser 
            ADD COLUMN IF NOT EXISTS esteira_role VARCHAR(50) NULL,
            ADD COLUMN IF NOT EXISTS esteira_active TINYINT(1) DEFAULT 1
          `);
        } catch (alterErr) {
          // Columns might already exist
        }

        const users = await client.query(
          `SELECT COALESCE(esteira_role, NULL) as esteira_role, 
                  COALESCE(esteira_active, 1) as esteira_active 
           FROM ai_agente.t_users_dachser WHERE id = ?`,
          [userId]
        );

        if (!users || users.length === 0) {
          result = { success: true, esteira_role: null, esteira_active: 0 };
        } else {
          result = { 
            success: true, 
            esteira_role: users[0].esteira_role, 
            esteira_active: users[0].esteira_active 
          };
        }
        break;
      }

      // ==================== METRICS ====================
      case 'log_usage': {
        const { username: logUsername, endpoint: logEndpoint, method: logMethod } = body;
        if (!logUsername || !logEndpoint) {
          return new Response(
            JSON.stringify({ error: 'Username e endpoint são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        await client.query(
          `INSERT INTO ai_agente.t_dachser_usage_logs (username, endpoint, method, event_time)
           VALUES (?, ?, ?, NOW())`,
          [logUsername, logEndpoint, logMethod || 'GET']
        );
        
        console.log(`Usage logged: ${logUsername} -> ${logMethod || 'GET'} ${logEndpoint}`);
        result = { success: true };
        break;
      }

      case 'get_metrics': {
        const { username, dateFrom: reqDateFrom, dateTo: reqDateTo, module: reqModule, perPage: reqPerPage, page: reqPage } = body;
        const dateFrom = reqDateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dateTo = reqDateTo || new Date().toISOString().split('T')[0];
        const usernameFilter = username || '';
        const moduleFilter = reqModule || '';
        const perPage = Math.min(Math.max(reqPerPage || 50, 10), 200);
        const page = Math.max(reqPage || 1, 1);
        const offset = (page - 1) * perPage;

        let whereConditions = ["event_time BETWEEN ? AND ?"];
        let params: (string | number)[] = [`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`];

        if (usernameFilter) {
          whereConditions.push("username LIKE ?");
          params.push(`%${usernameFilter}%`);
        }

        const validModules = ['air', 'chb', 'maritime'];
        if (moduleFilter && validModules.includes(moduleFilter.toLowerCase())) {
          whereConditions.push("LOWER(endpoint) LIKE ?");
          params.push(`%${moduleFilter.toLowerCase()}%`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM ai_agente.t_dachser_usage_logs ${whereClause}`,
          params
        );
        const total = Number(countResult[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        const statsResult = await client.query(
          `SELECT
            COUNT(DISTINCT username) AS users,
            COUNT(DISTINCT endpoint) AS endpoints,
            SUM(CASE WHEN method='GET' THEN 1 ELSE 0 END) AS get_calls,
            SUM(CASE WHEN method='POST' THEN 1 ELSE 0 END) AS post_calls
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}`,
          params
        );
        const statsRow = statsResult[0] || {};

        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        const daysDiff = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const avgPerDay = daysDiff > 0 ? total / daysDiff : total;

        const dailyResult = await client.query(
          `SELECT DATE(event_time) AS d, COUNT(*) AS total
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          GROUP BY DATE(event_time)
          ORDER BY d ASC`,
          params
        );
        const dailyData = dailyResult.map((row: { d: string; total: number }) => ({
          date: new Date(row.d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          total: Number(row.total)
        }));

        const endpointResult = await client.query(
          `SELECT endpoint, COUNT(*) AS total
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          GROUP BY endpoint
          ORDER BY total DESC
          LIMIT 5`,
          params
        );
        const endpointData = endpointResult.map((row: { endpoint: string; total: number }) => ({
          endpoint: row.endpoint,
          total: Number(row.total)
        }));

        const logsResult = await client.query(
          `SELECT id, username, endpoint, method, event_time
          FROM ai_agente.t_dachser_usage_logs
          ${whereClause}
          ORDER BY event_time DESC, id DESC
          LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        result = {
          logs: logsResult,
          stats: {
            total,
            distinctUsers: Number(statsRow.users || 0),
            distinctEndpoints: Number(statsRow.endpoints || 0),
            getCalls: Number(statsRow.get_calls || 0),
            postCalls: Number(statsRow.post_calls || 0),
            avgPerDay: Math.round(avgPerDay * 10) / 10
          },
          dailyData,
          endpointData,
          totalPages,
          currentPage: page
        };
        break;
      }

      case 'get_metric_users': {
        const usersResult = await client.query(
          `SELECT DISTINCT username FROM ai_agente.t_dachser_usage_logs ORDER BY username ASC`
        );
        const users = usersResult.map((row: { username: string }) => row.username);
        result = { success: true, users };
        break;
      }

      // ==================== RULE MATRIX ====================
      case 'get_rule_matrices': {
        const { customer, isActive } = body;
        let query = 'SELECT * FROM ai_agente.t_rule_matrix_awb WHERE 1=1';
        const params: (string | number | boolean)[] = [];

        if (customer) {
          query += ' AND customer = ?';
          params.push(customer);
        }
        if (isActive !== undefined) {
          query += ' AND is_active = ?';
          params.push(isActive ? 1 : 0);
        }
        query += ' ORDER BY created_at DESC';

        const matrices = await client.query(query, params);
        result = { success: true, matrices };
        break;
      }

      case 'get_rule_matrix': {
        const { matrixId } = body;
        if (!matrixId) {
          return new Response(
            JSON.stringify({ error: 'Matrix ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const matrices = await client.query(
          'SELECT * FROM ai_agente.t_rule_matrix_awb WHERE id = ?',
          [matrixId]
        );

        if (!matrices || matrices.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Matriz não encontrada' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, matrix: matrices[0] };
        break;
      }

      case 'create_rule_matrix': {
        const { customer, version, effectiveFrom, fileUrl, userId } = body;
        if (!customer || !version) {
          return new Response(
            JSON.stringify({ error: 'Customer e version são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Deactivate previous active matrices for this customer
        await client.execute(
          `UPDATE ai_agente.t_rule_matrix_awb 
           SET is_active = 0, effective_to = CURDATE() 
           WHERE customer = ? AND is_active = 1`,
          [customer]
        );

        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_rule_matrix_awb 
           (customer, version, is_active, effective_from, created_by_user_id, file_url) 
           VALUES (?, ?, 1, ?, ?, ?)`,
          [customer, version, effectiveFrom || new Date().toISOString().split('T')[0], userId || null, fileUrl || null]
        );

        result = { success: true, matrixId: insertResult.lastInsertId };
        console.log(`Created rule matrix: ${customer} v${version}, ID: ${insertResult.lastInsertId}`);
        break;
      }

      case 'deactivate_rule_matrix': {
        const { matrixId } = body;
        if (!matrixId) {
          return new Response(
            JSON.stringify({ error: 'Matrix ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE ai_agente.t_rule_matrix_awb 
           SET is_active = 0, effective_to = CURDATE() 
           WHERE id = ?`,
          [matrixId]
        );

        result = { success: true };
        break;
      }

      // ==================== RULE ROW ====================
      case 'get_rule_rows': {
        const { matrixId } = body;
        if (!matrixId) {
          return new Response(
            JSON.stringify({ error: 'Matrix ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const rules = await client.query(
          'SELECT * FROM ai_agente.t_rule_row_awb WHERE matrix_id = ? ORDER BY id',
          [matrixId]
        );

        result = { success: true, rules };
        break;
      }

      case 'create_rule_row': {
        const { matrixId, cnpj, airportCode, addressPattern, emailDespachante, refOthello, empresa, endereco, cidade, estado, cep, pais } = body;
        if (!matrixId || !cnpj) {
          return new Response(
            JSON.stringify({ error: 'Matrix ID e CNPJ são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_rule_row_awb 
           (matrix_id, cnpj, airport_code, address_pattern, email_despachante, ref_othello, empresa, endereco, cidade, estado, cep, pais) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [matrixId, cnpj, airportCode || null, addressPattern || null, emailDespachante || null, refOthello || null, empresa || null, endereco || null, cidade || null, estado || null, cep || null, pais || null]
        );

        result = { success: true, ruleId: insertResult.lastInsertId };
        break;
      }

      case 'create_rule_rows_batch': {
        const { matrixId, rules } = body as { matrixId: number; rules: Array<{cnpj: string; airportCode?: string; notes?: string; emailDespachante?: string; enderecoCompleto?: string}> };
        if (!matrixId || !rules || !Array.isArray(rules)) {
          return new Response(
            JSON.stringify({ error: 'Matrix ID e rules array são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let insertedCount = 0;
        for (const rule of rules) {
          await client.execute(
            `INSERT INTO ai_agente.t_rule_row_awb 
             (matrix_id, cnpj, airport_code, notes, email_despachante, endereco_completo) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [matrixId, rule.cnpj, rule.airportCode || null, rule.notes || null, rule.emailDespachante || null, rule.enderecoCompleto || null]
          );
          insertedCount++;
        }

        result = { success: true, insertedCount };
        console.log(`Batch inserted ${insertedCount} rules for matrix ${matrixId}`);
        break;
      }

      case 'delete_rule_row': {
        const { ruleId } = body;
        if (!ruleId) {
          return new Response(
            JSON.stringify({ error: 'Rule ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          'DELETE FROM ai_agente.t_rule_row_awb WHERE id = ?',
          [ruleId]
        );

        result = { success: true };
        console.log(`Deleted rule row ID: ${ruleId}`);
        break;
      }

      case 'find_matching_rule': {
        const { customer, cnpj, airportCode } = body;
        if (!customer || !cnpj) {
          return new Response(
            JSON.stringify({ error: 'Customer e CNPJ são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find active matrix for customer
        const matrices = await client.query(
          'SELECT id FROM ai_agente.t_rule_matrix_awb WHERE customer = ? AND is_active = 1 LIMIT 1',
          [customer]
        );

        if (!matrices || matrices.length === 0) {
          result = { success: true, rule: null, message: 'Nenhuma matriz ativa encontrada para este cliente' };
          break;
        }

        const matrixId = matrices[0].id;

        // Build query based on customer type
        let query: string;
        let params: (string | number)[];

        if (customer === 'KLABIN') {
          // KLABIN validates by CNPJ + airport code
          query = `SELECT * FROM ai_agente.t_rule_row_awb 
                   WHERE rule_matrix_id = ? AND cnpj = ? AND airport_code = ? 
                   LIMIT 1`;
          params = [matrixId, cnpj, airportCode || ''];
        } else {
          // ZF validates by CNPJ only
          query = `SELECT * FROM ai_agente.t_rule_row_awb 
                   WHERE rule_matrix_id = ? AND cnpj = ? 
                   LIMIT 1`;
          params = [matrixId, cnpj];
        }

        const rules = await client.query(query, params);

        result = { 
          success: true, 
          rule: rules && rules.length > 0 ? rules[0] : null,
          matrixId 
        };
        break;
      }

      // ==================== DOCUMENT ====================
      case 'create_document': {
        const { userId, fileName, fileType, filePath, fileSize } = body;
        if (!fileName || !filePath) {
          return new Response(
            JSON.stringify({ error: 'fileName e filePath são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_document_awb 
           (uploaded_by_user_id, file_name, file_type, file_path, file_size) 
           VALUES (?, ?, ?, ?, ?)`,
          [userId || null, fileName, fileType || null, filePath, fileSize || null]
        );

        result = { success: true, documentId: insertResult.lastInsertId };
        console.log(`Created document: ${fileName}, ID: ${insertResult.lastInsertId}`);
        break;
      }

      case 'get_document': {
        const { documentId } = body;
        if (!documentId) {
          return new Response(
            JSON.stringify({ error: 'Document ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const docs = await client.query(
          'SELECT * FROM ai_agente.t_document_awb WHERE id = ?',
          [documentId]
        );

        if (!docs || docs.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Documento não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, document: docs[0] };
        break;
      }

      // ==================== PARSED AWB ====================
      case 'create_parsed_awb': {
        const { 
          documentId, awbNumber, shipper, consignee, customer, cnpj, 
          origin, destination, routingLegs, carrier, flightNumbers, 
          mrn, hsCodes, grossWeight, chargeableWeight, dimensions, 
          incoterms, references, rawJson 
        } = body;

        if (!documentId) {
          return new Response(
            JSON.stringify({ error: 'Document ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_parsed_awb 
           (document_id, awb_number, shipper, consignee, customer, cnpj, origin, destination, 
            routing_legs, carrier, flight_numbers, mrn, hs_codes, gross_weight, chargeable_weight, 
            dimensions, incoterms, \`references\`, raw_json) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            documentId, awbNumber || null, shipper || null, consignee || null, customer || null, cnpj || null,
            origin || null, destination || null, 
            routingLegs ? JSON.stringify(routingLegs) : null,
            carrier || null,
            flightNumbers ? JSON.stringify(flightNumbers) : null,
            mrn || null,
            hsCodes ? JSON.stringify(hsCodes) : null,
            grossWeight || null, chargeableWeight || null, dimensions || null, incoterms || null,
            references ? JSON.stringify(references) : null,
            rawJson ? JSON.stringify(rawJson) : null
          ]
        );

        result = { success: true, parsedAwbId: insertResult.lastInsertId };
        console.log(`Created parsed AWB: ${awbNumber}, ID: ${insertResult.lastInsertId}`);
        break;
      }

      case 'get_parsed_awb': {
        const { parsedAwbId, documentId } = body;
        
        let query = 'SELECT * FROM ai_agente.t_parsed_awb WHERE ';
        let params: number[] = [];

        if (parsedAwbId) {
          query += 'id = ?';
          params.push(parsedAwbId);
        } else if (documentId) {
          query += 'document_id = ?';
          params.push(documentId);
        } else {
          return new Response(
            JSON.stringify({ error: 'parsedAwbId ou documentId é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const parsedDocs = await client.query(query, params);

        if (!parsedDocs || parsedDocs.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Parsed AWB não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Parse JSON fields
        const doc = parsedDocs[0];
        if (doc.routing_legs) doc.routing_legs = JSON.parse(doc.routing_legs);
        if (doc.flight_numbers) doc.flight_numbers = JSON.parse(doc.flight_numbers);
        if (doc.hs_codes) doc.hs_codes = JSON.parse(doc.hs_codes);
        if (doc.references) doc.references = JSON.parse(doc.references);
        if (doc.raw_json) doc.raw_json = JSON.parse(doc.raw_json);

        result = { success: true, parsedAwb: doc };
        break;
      }

      // ==================== AWB CHECK ====================
      case 'get_active_matrices': {
        const matrices = await client.query(
          `SELECT id, customer, version, is_active, effective_date, created_at
           FROM ai_agente.t_rule_matrix_awb 
           WHERE is_active = 1 
           ORDER BY customer, created_at DESC`
        );
        result = { success: true, matrices };
        break;
      }

      case 'get_rules_by_cnpj': {
        const { matrixId, cnpj } = body;
        if (!matrixId || !cnpj) {
          return new Response(
            JSON.stringify({ error: 'matrixId e cnpj são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const rules = await client.query(
          `SELECT id, cnpj, airport_code, address_pattern, email_despachante, 
                  ref_othello, empresa, endereco, cidade, estado, cep, pais, is_active
           FROM ai_agente.t_rule_row_awb 
           WHERE matrix_id = ? AND REPLACE(cnpj, '.', '') = REPLACE(REPLACE(?, '/', ''), '-', '')
           AND is_active = 1`,
          [matrixId, cnpj]
        );
        result = { success: true, rules };
        break;
      }

      case 'create_awb_check': {
        const { 
          awbNumber, cnpj, origin, destination, customer, 
          validationStatus, validationMessage, matchedRuleId, createdBy,
          hawbFileName, hawbFilePath, extractedAwb, extractedCnpj,
          extractedOrigin, extractedDestination, extractedCustomer, confidenceScore,
          // Additional parsed data fields
          shipper, consignee, carrier, grossWeight, chargeableWeight,
          mrn, routingLegs, flightNumbers, hsCodes, dimensions, incoterms, references
        } = body;

        // Insert AWB check
        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_awb_check 
           (awb_number, cnpj, origin, destination, customer, validation_status, validation_message, 
            matched_rule_id, created_by, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            awbNumber || 'N/A', cnpj || 'N/A', origin || 'N/A', destination || 'N/A',
            customer || 'KLABIN', validationStatus || 'PENDING', validationMessage || null,
            matchedRuleId || null, createdBy || null
          ]
        );

        const awbCheckId = insertResult.lastInsertId;

        // Create document record if file info is provided
        let documentId = null;
        if (hawbFileName && hawbFilePath) {
          const docResult = await client.execute(
            `INSERT INTO ai_agente.t_document_awb 
             (filename, storage_path, file_type, created_at) 
             VALUES (?, ?, ?, NOW())`,
            [hawbFileName, hawbFilePath, 'application/pdf']
          );
          documentId = docResult.lastInsertId;
          console.log(`Created document record: ${hawbFileName}, ID: ${documentId}`);
        }

        // Also create parsed_awb record with all extracted data
        if (extractedAwb || extractedCnpj || shipper || consignee) {
          await client.execute(
            `INSERT INTO ai_agente.t_parsed_awb 
             (awb_check_id, document_id, extracted_awb, extracted_cnpj, extracted_origin, extracted_destination,
              extracted_customer, confidence_score, shipper, consignee, carrier,
              gross_weight_kg, chargeable_weight_kg, mrn, routing_legs, flight_numbers,
              hs_codes, dims, incoterms, \`references\`) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              awbCheckId, documentId, extractedAwb || null, extractedCnpj || null,
              extractedOrigin || null, extractedDestination || null,
              extractedCustomer || null, confidenceScore || null,
              shipper || null, consignee || null, carrier || null,
              grossWeight || null, chargeableWeight || null, mrn || null,
              routingLegs ? JSON.stringify(routingLegs) : null,
              flightNumbers ? JSON.stringify(flightNumbers) : null,
              hsCodes ? JSON.stringify(hsCodes) : null,
              dimensions || null, incoterms || null,
              references ? JSON.stringify(references) : null
            ]
          );
        }

        result = { success: true, awbCheckId };
        console.log(`Created AWB check, ID: ${awbCheckId}, Status: ${validationStatus}`);
        break;
      }

      case 'update_awb_check': {
        const { awbCheckId, ruleRowId, status, validationMessage } = body;
        if (!awbCheckId) {
          return new Response(
            JSON.stringify({ error: 'AWB Check ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE ai_agente.t_awb_check 
           SET rule_row_id = ?, status = ?, validation_message = ?, validated_at = NOW() 
           WHERE id = ?`,
          [ruleRowId || null, status || 'PENDING', validationMessage || null, awbCheckId]
        );

        result = { success: true };
        break;
      }

      case 'get_awb_checks': {
        const { userId, status, perPage: reqPerPage, page: reqPage } = body;
        const perPage = Math.min(Math.max(reqPerPage || 20, 5), 100);
        const page = Math.max(reqPage || 1, 1);
        const offset = (page - 1) * perPage;

        let whereConditions: string[] = [];
        let params: (string | number)[] = [];

        if (userId) {
          whereConditions.push('c.user_id = ?');
          params.push(userId);
        }
        if (status) {
          whereConditions.push('c.status = ?');
          params.push(status);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM ai_agente.t_awb_check c ${whereClause}`,
          params
        );
        const total = Number(countResult[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        // Get checks with related data including all parsed fields
        const checks = await client.query(
          `SELECT c.id, c.awb_number, c.cnpj, c.customer, c.origin, c.destination,
            c.validation_status, c.validation_message, c.matched_rule_id, c.created_by, c.created_at,
            p.extracted_awb, p.extracted_cnpj, p.extracted_origin, p.extracted_destination, 
            p.extracted_customer, p.confidence_score,
            p.shipper, p.consignee, p.carrier, p.gross_weight_kg, p.chargeable_weight_kg,
            p.mrn, p.routing_legs, p.flight_numbers, p.hs_codes, p.dims, p.incoterms, p.\`references\`,
            d.filename as hawb_file_name, d.storage_path as hawb_file_path,
            r.email_despachante as rule_email, r.airport_code as rule_airport, r.ref_othello as rule_ref_othello
           FROM ai_agente.t_awb_check c
           LEFT JOIN ai_agente.t_parsed_awb p ON p.awb_check_id = c.id
           LEFT JOIN ai_agente.t_document_awb d ON p.document_id = d.id
           LEFT JOIN ai_agente.t_rule_row_awb r ON c.matched_rule_id = r.id
           ${whereClause}
           ORDER BY c.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        result = { success: true, checks, total, totalPages, currentPage: page };
        break;
      }

      case 'get_awb_check': {
        const { awbCheckId } = body;
        if (!awbCheckId) {
          return new Response(
            JSON.stringify({ error: 'AWB Check ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const checks = await client.query(
          `SELECT c.id, c.awb_number, c.cnpj, c.customer, c.origin, c.destination,
            c.validation_status, c.validation_message, c.matched_rule_id, c.created_by, c.created_at,
            p.extracted_awb, p.extracted_cnpj, p.extracted_origin, p.extracted_destination,
            p.extracted_customer, p.confidence_score,
            p.shipper, p.consignee, p.carrier, p.gross_weight_kg, p.chargeable_weight_kg,
            p.mrn, p.routing_legs, p.flight_numbers, p.hs_codes, p.dims, p.incoterms, p.\`references\`,
            d.filename as hawb_file_name, d.storage_path as hawb_file_path,
            r.airport_code as rule_airport, r.email_despachante as rule_email, r.ref_othello as rule_ref_othello
           FROM ai_agente.t_awb_check c
           LEFT JOIN ai_agente.t_parsed_awb p ON p.awb_check_id = c.id
           LEFT JOIN ai_agente.t_document_awb d ON p.document_id = d.id
           LEFT JOIN ai_agente.t_rule_row_awb r ON c.matched_rule_id = r.id
           WHERE c.id = ?`,
          [awbCheckId]
        );

        if (!checks || checks.length === 0) {
          return new Response(
            JSON.stringify({ error: 'AWB Check não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, check: checks[0] };
        break;
      }

      case 'delete_awb_check': {
        const { awbCheckId } = body;
        if (!awbCheckId) {
          return new Response(
            JSON.stringify({ error: 'AWB Check ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete related records first (cascade)
        await client.execute(
          'DELETE FROM ai_agente.t_parsed_awb WHERE awb_check_id = ?',
          [awbCheckId]
        );
        
        await client.execute(
          'DELETE FROM ai_agente.t_awb_check WHERE id = ?',
          [awbCheckId]
        );

        result = { success: true };
        console.log(`Deleted AWB Check ID: ${awbCheckId}`);
        break;
      }

      case 'update_parsed_awb': {
        const { 
          awbCheckId, shipper, consignee, carrier, grossWeight, chargeableWeight,
          mrn, routingLegs, flightNumbers, hsCodes, dimensions, incoterms, references,
          extractedAwb, extractedCnpj, extractedOrigin, extractedDestination, extractedCustomer
        } = body;
        
        if (!awbCheckId) {
          return new Response(
            JSON.stringify({ error: 'AWB Check ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE ai_agente.t_parsed_awb SET
            shipper = ?, consignee = ?, carrier = ?,
            gross_weight_kg = ?, chargeable_weight_kg = ?, mrn = ?,
            routing_legs = ?, flight_numbers = ?, hs_codes = ?,
            dims = ?, incoterms = ?, \`references\` = ?,
            extracted_awb = COALESCE(?, extracted_awb),
            extracted_cnpj = COALESCE(?, extracted_cnpj),
            extracted_origin = COALESCE(?, extracted_origin),
            extracted_destination = COALESCE(?, extracted_destination),
            extracted_customer = COALESCE(?, extracted_customer)
           WHERE awb_check_id = ?`,
          [
            shipper || null, consignee || null, carrier || null,
            grossWeight || null, chargeableWeight || null, mrn || null,
            routingLegs ? JSON.stringify(routingLegs) : null,
            flightNumbers ? JSON.stringify(flightNumbers) : null,
            hsCodes ? JSON.stringify(hsCodes) : null,
            dimensions || null, incoterms || null,
            references ? JSON.stringify(references) : null,
            extractedAwb || null, extractedCnpj || null, extractedOrigin || null,
            extractedDestination || null, extractedCustomer || null,
            awbCheckId
          ]
        );

        result = { success: true };
        console.log(`Updated parsed AWB for check ID: ${awbCheckId}`);
        break;
      }

      case 'get_awb_checks_with_files': {
        // Get all checks that have file paths for reextraction
        const checks = await client.query(
          `SELECT c.id, c.awb_number, c.cnpj, d.storage_path as file_path
           FROM ai_agente.t_awb_check c
           LEFT JOIN ai_agente.t_parsed_awb p ON p.awb_check_id = c.id
           LEFT JOIN ai_agente.t_document_awb d ON p.document_id = d.id
           WHERE d.storage_path IS NOT NULL
           ORDER BY c.created_at DESC`
        );
        result = { success: true, checks };
        break;
      }

      // ==================== DHL AWB TRACKING ====================
      case 'get_dhl_awb_tracking': {
        try {
          const rows = await client.query(
            `SELECT * FROM \`${database}\`.dhl_awb_tracking ORDER BY id DESC`
          );
          result = { success: true, data: rows };
          console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} AWB tracking records from ${database}.dhl_awb_tracking`);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("Erro em get_dhl_awb_tracking:", errorMessage);
          result = { success: false, error: errorMessage };
        }
        break;
      }

      case 'update_dhl_awb_tracking': {
        const { awbNumber, updates } = body;
        if (!awbNumber || !updates) {
          return new Response(
            JSON.stringify({ error: 'awbNumber e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateFields: string[] = [];
        const updateValues: any[] = [];
        
        for (const [key, value] of Object.entries(updates)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
        
        updateValues.push(awbNumber);

        await client.execute(
          `UPDATE ai_agente.dhl_awb_tracking SET ${updateFields.join(', ')} WHERE awb = ?`,
          updateValues
        );

        result = { success: true };
        console.log(`Updated dhl_awb_tracking for AWB: ${awbNumber}`);
        break;
      }

      case 'bulk_update_dhl_awb_tracking': {
        const { awbNumbers, updates } = body;
        if (!awbNumbers || !Array.isArray(awbNumbers) || !updates) {
          return new Response(
            JSON.stringify({ error: 'awbNumbers array e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateFields: string[] = [];
        const updateValues: any[] = [];
        
        for (const [key, value] of Object.entries(updates)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }

        const placeholders = awbNumbers.map(() => '?').join(', ');
        
        await client.execute(
          `UPDATE ai_agente.dhl_awb_tracking SET ${updateFields.join(', ')} WHERE awb IN (${placeholders})`,
          [...updateValues, ...awbNumbers]
        );

        result = { success: true, updatedCount: awbNumbers.length };
        console.log(`Bulk updated ${awbNumbers.length} AWB tracking records`);
        break;
      }

      // ==================== AWB LOGS ====================
      case 'get_awb_logs': {
        const { awbNumber } = body;
        if (!awbNumber) {
          return new Response(
            JSON.stringify({ error: 'awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const logs = await client.query(
          `SELECT * FROM ai_agente.udlog_zeus_console_log_udlog_airfreight 
           WHERE awb LIKE ? 
           ORDER BY created_at DESC`,
          [`%${awbNumber}%`]
        );

        result = { success: true, logs };
        console.log(`Fetched ${logs.length} logs for AWB: ${awbNumber}`);
        break;
      }

      // ==================== EMAIL HISTORY ====================
      case 'get_email_history': {
        const { awbNumber } = body;
        if (!awbNumber) {
          return new Response(
            JSON.stringify({ error: 'awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const history = await client.query(
          `SELECT * FROM ai_agente.udlog_af_email_history 
           WHERE awb = ? 
           ORDER BY created_at DESC`,
          [awbNumber]
        );

        result = { success: true, history };
        console.log(`Fetched ${history.length} email history records for AWB: ${awbNumber}`);
        break;
      }

      // ==================== ATTENTION LIST ====================
      case 'check_attention_list': {
        const { awbNumber } = body;
        if (!awbNumber) {
          return new Response(
            JSON.stringify({ error: 'awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const existing = await client.query(
          'SELECT id FROM ai_agente.udlog_af_attention_list WHERE awb = ? LIMIT 1',
          [awbNumber]
        );

        result = { success: true, exists: existing.length > 0, data: existing[0] || null };
        break;
      }

      case 'add_to_attention_list': {
        const { awbNumber } = body;
        if (!awbNumber) {
          return new Response(
            JSON.stringify({ error: 'awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          'INSERT INTO ai_agente.udlog_af_attention_list (awb, created_at) VALUES (?, NOW())',
          [awbNumber]
        );

        result = { success: true };
        console.log(`Added AWB ${awbNumber} to attention list`);
        break;
      }

      case 'remove_from_attention_list': {
        const { awbNumber } = body;
        if (!awbNumber) {
          return new Response(
            JSON.stringify({ error: 'awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Archive first
        await client.execute(
          'INSERT INTO ai_agente.udlog_af_attention_list_archive (awb, removed_at) VALUES (?, NOW())',
          [awbNumber]
        );

        // Then delete
        await client.execute(
          'DELETE FROM ai_agente.udlog_af_attention_list WHERE awb = ?',
          [awbNumber]
        );

        result = { success: true };
        console.log(`Removed AWB ${awbNumber} from attention list and archived`);
        break;
      }

      // ==================== LOG ENTRY ====================
      case 'create_log_entry': {
        const { userId, logAction, entity, entityId, details } = body;

        await client.execute(
          `INSERT INTO ai_agente.t_log_entry_awb 
           (user_id, action, entity, entity_id, details) 
           VALUES (?, ?, ?, ?, ?)`,
          [userId || null, logAction || 'UNKNOWN', entity || null, entityId || null, details || null]
        );

        result = { success: true };
        break;
      }

      case 'get_log_entries': {
        const { entity, entityId, perPage: reqPerPage, page: reqPage } = body;
        const perPage = Math.min(Math.max(reqPerPage || 50, 10), 200);
        const page = Math.max(reqPage || 1, 1);
        const offset = (page - 1) * perPage;

        let whereConditions: string[] = [];
        let params: (string | number)[] = [];

        if (entity) {
          whereConditions.push('l.entity = ?');
          params.push(entity);
        }
        if (entityId) {
          whereConditions.push('l.entity_id = ?');
          params.push(entityId);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const logs = await client.query(
          `SELECT l.*, u.username 
           FROM ai_agente.t_log_entry_awb l
           LEFT JOIN ai_agente.t_users_dachser u ON l.user_id = u.id
           ${whereClause}
           ORDER BY l.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        result = { success: true, logs };
        break;
      }

      // ==================== LOCAL CHARGES ====================
      case 'get_local_charges': {
        console.log('Fetching local charges data...');
        
        // Use separate database credentials for charges
        const chargesHost = Deno.env.get('MARIADB_CHARGES_HOST');
        const chargesPort = parseInt(Deno.env.get('MARIADB_CHARGES_PORT') || '3306');
        const chargesDatabase = Deno.env.get('MARIADB_CHARGES_DATABASE');
        const chargesUser = Deno.env.get('MARIADB_CHARGES_USER');
        const chargesPassword = Deno.env.get('MARIADB_CHARGES_PASSWORD');
        
        // Create separate client for charges database
        let chargesClient: Client | null = null;
        
        try {
          if (!chargesHost || !chargesDatabase || !chargesUser || !chargesPassword) {
            console.error('Missing charges database credentials, using default connection');
            // Fall back to default connection if charges credentials not set
            chargesClient = client;
          } else {
            console.log(`Connecting to Charges DB at ${chargesHost}:${chargesPort}/${chargesDatabase}`);
            chargesClient = await new Client().connect({
              hostname: chargesHost,
              port: chargesPort,
              db: chargesDatabase,
              username: chargesUser,
              password: chargesPassword,
            });
          }
          
          // Helper function to load data for a company
          async function loadChargesForCompany(
            dbClient: Client,
            preferredTable: string,
            empresa: string
          ): Promise<{ rows: any[]; meta: { updated_at: string | null; effective: string | null }; source: string }> {
            const emptyResult = { rows: [], meta: { updated_at: null, effective: null }, source: '' };
            
            try {
              // Try preferred table first (without schema prefix since we're connected to the specific database)
              const tableCheck = await dbClient.query(`SHOW TABLES LIKE ?`, [preferredTable]);
              
              if (tableCheck && tableCheck.length > 0) {
                const countResult = await dbClient.query(`SELECT COUNT(*) as cnt FROM ${preferredTable}`);
                const count = Number(countResult[0]?.cnt || 0);
                
                if (count > 0) {
                  // First get the latest data_atualizacao
                  const metaResult = await dbClient.query(`
                    SELECT MAX(data_atualizacao) AS updated_at, MAX(effective) AS effective 
                    FROM ${preferredTable}
                  `);
                  const meta = metaResult[0] || { updated_at: null, effective: null };
                  
                  // Only get rows from the most recent update DATE (not exact timestamp)
                  const rows = await dbClient.query(`
                    SELECT empresa, charge_description, charge_code, container_type, currency, fee,
                           unit_of_measure, effective_date, expiry_date, effective, data_atualizacao, user_atualizacao
                    FROM ${preferredTable}
                    WHERE DATE(data_atualizacao) = (SELECT DATE(MAX(data_atualizacao)) FROM ${preferredTable})
                    ORDER BY charge_description, container_type
                  `);
                  
                  return { rows, meta, source: preferredTable };
                }
              }
              
              // Fallback to unified table with empresa filter
              const fallbackTable = 't_local_charge';
              const fallbackCheck = await dbClient.query(`SHOW TABLES LIKE ?`, [fallbackTable]);
              
              if (fallbackCheck && fallbackCheck.length > 0) {
                const countResult = await dbClient.query(
                  `SELECT COUNT(*) as cnt FROM ${fallbackTable} WHERE empresa = ?`,
                  [empresa]
                );
                const count = Number(countResult[0]?.cnt || 0);
                
                if (count > 0) {
                  // First get the latest data_atualizacao for this empresa
                  const metaResult = await dbClient.query(`
                    SELECT MAX(data_atualizacao) AS updated_at, MAX(effective) AS effective 
                    FROM ${fallbackTable} WHERE empresa = ?
                  `, [empresa]);
                  const meta = metaResult[0] || { updated_at: null, effective: null };
                  
                  // Only get rows from the most recent update DATE for this empresa
                  const rows = await dbClient.query(`
                    SELECT empresa, charge_description, charge_code, container_type, currency, fee,
                           unit_of_measure, effective_date, expiry_date, effective, data_atualizacao, user_atualizacao
                    FROM ${fallbackTable}
                    WHERE empresa = ? 
                      AND DATE(data_atualizacao) = (SELECT DATE(MAX(data_atualizacao)) FROM ${fallbackTable} WHERE empresa = ?)
                    ORDER BY charge_description, container_type
                  `, [empresa, empresa]);
                  
                  return { rows, meta, source: `${fallbackTable} (empresa='${empresa}')` };
                }
              }
              
              return emptyResult;
            } catch (err) {
              console.error(`Error loading charges for ${empresa}:`, err);
              return emptyResult;
            }
          }
          
          // Load data for each company
          const hapag = await loadChargesForCompany(chargesClient, 't_local_charge', 'Hapag');
          const msc = await loadChargesForCompany(chargesClient, 't_local_charge_msc', 'MSC');
          const cma = await loadChargesForCompany(chargesClient, 't_local_charge_cma', 'CMA');
          const hmm = await loadChargesForCompany(chargesClient, 't_local_charge_hmm', 'HMM');
          const one = await loadChargesForCompany(chargesClient, 't_local_charge_one', 'ONE');
          
          console.log(`Local charges loaded: Hapag=${hapag.rows.length}, MSC=${msc.rows.length}, CMA=${cma.rows.length}, HMM=${hmm.rows.length}, ONE=${one.rows.length}`);
          
          result = { success: true, hapag, msc, cma, hmm, one };
          
        } finally {
          // Close charges client if it's different from main client
          if (chargesClient && chargesClient !== client) {
            try {
              await chargesClient.close();
            } catch (e) {
              console.error('Error closing charges client:', e);
            }
          }
        }
        
        break;
      }

      // ==================== FEE CHANGES (ALTERAÇÕES DE FEE) ====================
      case 'get_fee_changes': {
        console.log('Fetching fee changes data...');
        
        // Use separate database credentials for charges
        const chargesHost = Deno.env.get('MARIADB_CHARGES_HOST');
        const chargesPort = parseInt(Deno.env.get('MARIADB_CHARGES_PORT') || '3306');
        const chargesDatabase = Deno.env.get('MARIADB_CHARGES_DATABASE');
        const chargesUser = Deno.env.get('MARIADB_CHARGES_USER');
        const chargesPassword = Deno.env.get('MARIADB_CHARGES_PASSWORD');
        
        let chargesClient: Client | null = null;
        
        try {
          if (!chargesHost || !chargesDatabase || !chargesUser || !chargesPassword) {
            console.error('Missing charges database credentials, using default connection');
            chargesClient = client;
          } else {
            console.log(`Connecting to Charges DB at ${chargesHost}:${chargesPort}/${chargesDatabase} for fee changes`);
            chargesClient = await new Client().connect({
              hostname: chargesHost,
              port: chargesPort,
              db: chargesDatabase,
              username: chargesUser,
              password: chargesPassword,
            });
          }
          
          // PHP-style approach: load current and history data, then compare
          const pairs = [
            { main: 't_local_charge', hist: 't_local_charge_hapag_history' },
            { main: 't_local_charge_msc', hist: 't_local_charge_msc_history' },
            { main: 't_local_charge_cma', hist: 't_local_charge_cma_history' },
            { main: 't_local_charge_hmm', hist: 't_local_charge_hmm_history' },
            { main: 't_local_charge_one', hist: 't_local_charge_one_history' },
          ];
          
          const changes: any[] = [];
          
          // Helper to normalize date
          const normalizeDt = (row: any): string => {
            const candidates = [row.data_atualizacao_chave, row.data_atualizacao].filter(Boolean);
            for (const d of candidates) {
              if (d) {
                try {
                  const date = new Date(d);
                  if (!isNaN(date.getTime())) {
                    return date.toISOString();
                  }
                } catch {}
              }
            }
            return '1970-01-01T00:00:00.000Z';
          };
          
          // Helper to create unique key for matching
          const keyOf = (row: any): string => {
            return [
              (row.empresa || '').toUpperCase().trim(),
              (row.charge_description || '').trim(),
              (row.charge_code || '').trim(),
              (row.container_type || '').trim(),
              (row.currency || '').trim(),
              (row.unit_of_measure || '').trim(),
            ].join(' | ');
          };
          
          for (const pair of pairs) {
            try {
              // Check if tables exist
              const mainCheck = await chargesClient.query(`SHOW TABLES LIKE ?`, [pair.main]);
              const histCheck = await chargesClient.query(`SHOW TABLES LIKE ?`, [pair.hist]);
              
              if (!mainCheck.length || !histCheck.length) {
                console.log(`Tables not found: ${pair.main} or ${pair.hist}, skipping...`);
                continue;
              }
              
              // Load current data
              const currRows = await chargesClient.query(`
                SELECT id, chave, empresa, charge_description, charge_code, container_type,
                       currency, unit_of_measure, fee, effective, data_atualizacao_chave, data_atualizacao
                FROM ${pair.main}
              `);
              
              // Load history data
              const histRows = await chargesClient.query(`
                SELECT id, chave, empresa, charge_description, charge_code, container_type,
                       currency, unit_of_measure, fee, effective, data_atualizacao_chave, data_atualizacao
                FROM ${pair.hist}
              `);
              
              if (!currRows.length || !histRows.length) {
                console.log(`No data in ${pair.main} or ${pair.hist}, skipping...`);
                continue;
              }
              
              // Add normalized date to each row
              for (const r of currRows) {
                r._dt_key = normalizeDt(r);
              }
              for (const h of histRows) {
                h._dt_key = normalizeDt(h);
              }
              
              // Group history by key
              const histByKey: Record<string, any[]> = {};
              for (const h of histRows) {
                const k = keyOf(h);
                if (!histByKey[k]) histByKey[k] = [];
                histByKey[k].push(h);
              }
              
              // Sort each group by date desc
              for (const k in histByKey) {
                histByKey[k].sort((a, b) => {
                  if (a._dt_key === b._dt_key) return (b.id || 0) - (a.id || 0);
                  return b._dt_key.localeCompare(a._dt_key);
                });
              }
              
              // Find previous fee for each current row
              for (const c of currRows) {
                const k = keyOf(c);
                const cDt = c._dt_key;
                const list = histByKey[k] || [];
                
                if (!list.length) continue;
                
                let prev = null;
                for (const h of list) {
                  if (h._dt_key < cDt || (h._dt_key === cDt && (h.id || 0) < (c.id || 0))) {
                    if (parseFloat(h.fee) !== parseFloat(c.fee)) {
                      prev = h;
                      break;
                    }
                  }
                }
                
                if (!prev) continue;
                
                const feeAnterior = parseFloat(prev.fee) || 0;
                const feeAtual = parseFloat(c.fee) || 0;
                const diffAbs = feeAtual - feeAnterior;
                const diffPct = feeAnterior !== 0 ? ((feeAtual - feeAnterior) / feeAnterior) * 100 : null;
                
                changes.push({
                  chave: c.chave || null,
                  empresa: c.empresa || null,
                  charge_description: c.charge_description || null,
                  charge_code: c.charge_code || null,
                  container_type: c.container_type || null,
                  currency: c.currency || null,
                  unit_of_measure: c.unit_of_measure || null,
                  fee_anterior: feeAnterior,
                  fee_atual: feeAtual,
                  diff_abs: diffAbs,
                  diff_pct: diffPct,
                  effective_anterior: prev.effective || null,
                  effective_atual: c.effective || null,
                  dt_chave_anterior: prev.data_atualizacao_chave || null,
                  dt_chave_atual: c.data_atualizacao_chave || null,
                  dt_ordenacao_anterior: prev._dt_key,
                  dt_ordenacao_atual: c._dt_key,
                  src_anterior: pair.hist,
                  src_atual: pair.main,
                });
              }
              
            } catch (err) {
              console.error(`Error processing pair ${pair.main}/${pair.hist}:`, err);
            }
          }
          
          // Sort by dt_ordenacao_atual desc
          changes.sort((a, b) => {
            if ((a.dt_ordenacao_atual || '') === (b.dt_ordenacao_atual || '')) {
              return ((a.empresa || '') + (a.charge_description || '')).localeCompare(
                (b.empresa || '') + (b.charge_description || '')
              );
            }
            return (b.dt_ordenacao_atual || '').localeCompare(a.dt_ordenacao_atual || '');
          });
          
          // Find latest global and per empresa
          let latestIdx: number | null = null;
          let latestTs = 0;
          const latestByEmpresa: Record<string, { ts: number; idx: number }> = {};
          
          changes.forEach((r, i) => {
            const ts = new Date(r.dt_ordenacao_atual || r.dt_chave_atual || '').getTime();
            if (ts && ts > latestTs) {
              latestTs = ts;
              latestIdx = i;
            }
            
            const emp = r.empresa || '';
            if (emp && ts) {
              if (!latestByEmpresa[emp] || ts > latestByEmpresa[emp].ts) {
                latestByEmpresa[emp] = { ts, idx: i };
              }
            }
          });
          
          // Mark latest rows
          if (latestIdx !== null) {
            changes[latestIdx].is_latest = true;
          }
          for (const emp in latestByEmpresa) {
            const idx = latestByEmpresa[emp].idx;
            changes[idx].is_latest_empresa = true;
          }
          
          // Collect latest marked items
          const latestMarkedIdx = new Set<number>();
          if (latestIdx !== null) latestMarkedIdx.add(latestIdx);
          for (const emp in latestByEmpresa) {
            latestMarkedIdx.add(latestByEmpresa[emp].idx);
          }
          
          const latestMarked = Array.from(latestMarkedIdx)
            .map(i => changes[i])
            .sort((a, b) => {
              const tsA = new Date(a.dt_ordenacao_atual || '').getTime() || 0;
              const tsB = new Date(b.dt_ordenacao_atual || '').getTime() || 0;
              return tsB - tsA;
            });
          
          console.log(`Fee changes loaded: ${changes.length} total, ${latestMarked.length} marked as latest`);
          
          result = { success: true, changes, latestMarked };
          
        } finally {
          if (chargesClient && chargesClient !== client) {
            try {
              await chargesClient.close();
            } catch (e) {
              console.error('Error closing charges client:', e);
            }
          }
        }
        
        break;
      }

      // ==================== RÉGUA DE COBRANÇA ====================
      case 'get_regua_counts': {
        const MAX_DIAS_ATRASO = 120;
        
        const sqlCount = `
          SELECT stage, COUNT(*) as qt
          FROM (
            SELECT
              CASE
                WHEN DATEDIFF(CURDATE(), t.data_vencimento) < 0 THEN 'PRE'
                WHEN DATEDIFF(CURDATE(), t.data_vencimento) = 1 THEN 'D1'
                WHEN t.tipo_documento = 'FAT_NF' THEN
                  CASE
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7  AND 14 THEN 'D7'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29 THEN 'D15'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44 THEN 'D30'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) >= 45 THEN 'D60'
                    ELSE NULL
                  END
                ELSE
                  CASE
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7  AND 14 THEN 'D7'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29 THEN 'D15'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44 THEN 'D30'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 45 AND 59 THEN 'D45'
                    WHEN DATEDIFF(CURDATE(), t.data_vencimento) >= 60 THEN 'D60'
                    ELSE NULL
                  END
              END AS stage
            FROM dados_dachser.t_dados_financeiro_nfs t
            LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
            WHERE COALESCE(sd.active, 1) = 1
              AND (
                DATEDIFF(CURDATE(), t.data_vencimento) < 0
                OR DATEDIFF(CURDATE(), t.data_vencimento) <= ?
                OR (t.tipo_documento <> 'FAT_NF' AND DATEDIFF(CURDATE(), t.data_vencimento) >= 61)
                OR (t.tipo_documento = 'FAT_NF' AND DATEDIFF(CURDATE(), t.data_vencimento) >= 45)
              )
          ) x
          WHERE stage IS NOT NULL
          GROUP BY stage
        `;
        
        const countRows = await client.query(sqlCount, [MAX_DIAS_ATRASO]);
        const counts: Record<string, number> = { PRE: 0, D1: 0, D7: 0, D15: 0, D30: 0, D45: 0, D60: 0 };
        
        for (const row of countRows) {
          if (row.stage && counts.hasOwnProperty(row.stage)) {
            counts[row.stage] = Number(row.qt) || 0;
          }
        }
        
        console.log('Régua counts:', counts);
        result = { success: true, counts };
        break;
      }

      case 'get_regua_stage': {
        const { stage } = body as { stage?: string };
        if (!stage) {
          return new Response(
            JSON.stringify({ error: 'Stage é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const MAX_DIAS_ATRASO = 120;
        const sanitizedStage = (stage || '').replace(/[^A-Z0-9+]/g, '');
        
        const sql = `
          SELECT
            SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base,
            t.razao_social,
            t.documento,
            COALESCE(NULLIF(t.numero_nf,''), t.documento) AS nf_exibicao,
            DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS data_venc_br,
            DATEDIFF(CURDATE(), t.data_vencimento) AS dias,
            CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagto,
            t.valor_nf,
            t.cnpj
          FROM dados_dachser.t_dados_financeiro_nfs t
          LEFT JOIN ai_agente.t_financeiro_soft_delete sd ON sd.documento = t.documento
          WHERE COALESCE(sd.active, 1) = 1
            AND (
              (? IN ('PRE','D1','D7','D15','D30','D45') AND (? = 'PRE' OR DATEDIFF(CURDATE(), t.data_vencimento) <= ?))
              OR ? = 'D60'
            )
            AND (
              CASE
                WHEN ? = 'PRE' THEN DATEDIFF(CURDATE(), t.data_vencimento) < 0
                WHEN ? = 'D1' THEN DATEDIFF(CURDATE(), t.data_vencimento) = 1
                WHEN t.tipo_documento='FAT_NF' THEN
                  CASE ?
                    WHEN 'D7' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7 AND 14
                    WHEN 'D15' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29
                    WHEN 'D30' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44
                    ELSE FALSE
                  END
                ELSE
                  CASE ?
                    WHEN 'D7' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 7 AND 14
                    WHEN 'D15' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 15 AND 29
                    WHEN 'D30' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 30 AND 44
                    WHEN 'D45' THEN DATEDIFF(CURDATE(), t.data_vencimento) BETWEEN 45 AND 59
                    WHEN 'D60' THEN DATEDIFF(CURDATE(), t.data_vencimento) >= 60
                    ELSE FALSE
                  END
              END
            )
          ORDER BY t.data_vencimento ASC, t.razao_social ASC
        `;
        
        const rows = await client.query(sql, [
          sanitizedStage, sanitizedStage, MAX_DIAS_ATRASO,
          sanitizedStage,
          sanitizedStage, sanitizedStage, sanitizedStage, sanitizedStage
        ]);
        
        // Format valor_br
        const formattedRows = rows.map((r: any) => ({
          ...r,
          valor_br: r.valor_nf !== null && r.valor_nf !== undefined 
            ? 'R$ ' + Number(r.valor_nf).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '-'
        }));
        
        console.log(`Régua stage ${sanitizedStage}: ${formattedRows.length} rows`);
        result = { success: true, rows: formattedRows };
        break;
      }

      // ==================== DISPUTAS ====================
      case 'get_disputas': {
        const { tipo } = body as { tipo?: string };
        
        let whereClause = 't.disputa = 1 AND COALESCE(sd.active, 1) = 1';
        const params: string[] = [];
        
        if (tipo) {
          whereClause += " AND (CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END) = ?";
          params.push(tipo);
        }
        
        const sql = `
          SELECT
            COALESCE(NULLIF(t.numero_nf,''), NULLIF(t.documento,''), NULLIF(t.nd,'')) AS nf,
            t.nd,
            t.razao_social AS cliente,
            SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base,
            DATE_FORMAT(t.data_emissao, '%Y-%m-%dT%H:%i:%s-03:00') AS emissao,
            DATE_FORMAT(t.data_vencimento, '%Y-%m-%dT%H:%i:%s-03:00') AS vencimento,
            DATE_FORMAT(t.inicio_disputa, '%Y-%m-%dT%H:%i:%s-03:00') AS created_at,
            t.responsavel_disp AS responsavel,
            t.valor_nf AS valor,
            CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo,
            COALESCE(NULLIF(t.documento,''), NULLIF(t.nd,''), NULLIF(t.numero_nf,'')) AS doc_key,
            fd.departamento,
            fd.observacoes,
            fd.escalation
          FROM dados_dachser.t_dados_financeiro_nfs t
          LEFT JOIN ai_agente.t_financeiro_soft_delete sd
            ON sd.documento = t.documento
            OR sd.documento = t.nd
            OR sd.documento = t.numero_nf
          LEFT JOIN ai_agente.t_fin_disputas fd
            ON fd.nf = COALESCE(NULLIF(t.documento,''), NULLIF(t.nd,''), NULLIF(t.numero_nf,''))
          WHERE ${whereClause}
          ORDER BY t.inicio_disputa DESC, t.razao_social ASC
        `;
        
        const rows = await client.query(sql, params);
        console.log(`Disputas loaded: ${rows.length} rows`);
        result = { success: true, rows };
        break;
      }

      case 'update_disputa_observacoes': {
        const { doc_key, observacoes } = body as { doc_key?: string; observacoes?: string };
        
        if (!doc_key) {
          return new Response(
            JSON.stringify({ error: 'doc_key é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Upsert: insert if not exists, update if exists
        const upsertSql = `
          INSERT INTO ai_agente.t_fin_disputas (nf, observacoes, updated_at)
          VALUES (?, ?, NOW())
          ON DUPLICATE KEY UPDATE observacoes = VALUES(observacoes), updated_at = NOW()
        `;
        await client.execute(upsertSql, [doc_key, observacoes || '']);
        
        console.log(`Disputa observacoes updated for: ${doc_key}`);
        result = { success: true };
        break;
      }

      case 'lookup_documento': {
        const { nd } = body as { nd?: string };
        
        if (!nd) {
          return new Response(
            JSON.stringify({ error: 'ND/NF/Documento é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const searchTerm = nd.toString().trim();
        const lookupSql = `
          SELECT 
            COALESCE(NULLIF(documento,''), NULLIF(nd,''), NULLIF(numero_nf,'')) AS doc_key,
            razao_social AS cliente,
            numero_nf AS nf,
            nd,
            valor_nf AS valor,
            DATE_FORMAT(data_vencimento, '%Y-%m-%d') AS vencimento,
            DATE_FORMAT(data_emissao, '%Y-%m-%d') AS emissao,
            CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo,
            responsavel_disp AS responsavel
          FROM dados_dachser.t_dados_financeiro_nfs 
          WHERE documento = ? OR numero_nf = ? OR nd = ?
          LIMIT 1
        `;
        const rows = await client.query(lookupSql, [searchTerm, searchTerm, searchTerm]);
        
        if (!rows || rows.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'Documento não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`Lookup documento found: ${rows[0].doc_key}`);
        result = { success: true, data: rows[0] };
        break;
      }

      case 'save_disputa': {
        const { nf, responsavel, departamento, observacoes, escalation } = body as { 
          nf?: string; 
          responsavel?: string;
          departamento?: string;
          observacoes?: string;
          escalation?: string;
        };
        
        if (!nf) {
          return new Response(
            JSON.stringify({ error: 'Documento/NF é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const searchTerm = nf.toString().trim();
        
        // Check if document exists and get all required fields
        const checkSql = `
          SELECT 
            COALESCE(NULLIF(documento,''), NULLIF(nd,''), NULLIF(numero_nf,'')) AS doc_key,
            razao_social AS cliente,
            data_vencimento AS vencimento,
            valor_nf AS valor,
            CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo
          FROM dados_dachser.t_dados_financeiro_nfs 
          WHERE documento = ? OR numero_nf = ? OR nd = ?
          LIMIT 1
        `;
        const existingRows = await client.query(checkSql, [searchTerm, searchTerm, searchTerm]);
        
        if (!existingRows || existingRows.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Documento não encontrado', success: false }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const docKey = existingRows[0].doc_key;
        const cliente = existingRows[0].cliente || 'N/A';
        const vencimento = existingRows[0].vencimento || new Date().toISOString().split('T')[0];
        const valor = existingRows[0].valor || 0;
        const tipo = existingRows[0].tipo || 'A prazo';
        
        // Update to mark as disputa in t_dados_financeiro_nfs
        const updateSql = `
          UPDATE dados_dachser.t_dados_financeiro_nfs 
          SET disputa = 1, 
              inicio_disputa = NOW(), 
              responsavel_disp = ?
          WHERE documento = ? OR numero_nf = ? OR nd = ?
        `;
        await client.execute(updateSql, [responsavel || null, searchTerm, searchTerm, searchTerm]);
        
        // Insert/update extra data in t_fin_disputas with all required fields
        const upsertSql = `
          INSERT INTO ai_agente.t_fin_disputas (nf, cliente, vencimento, valor, tipo, responsavel, departamento, observacoes, escalation, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE 
            cliente = VALUES(cliente),
            vencimento = VALUES(vencimento),
            valor = VALUES(valor),
            tipo = VALUES(tipo),
            responsavel = VALUES(responsavel),
            departamento = VALUES(departamento),
            observacoes = VALUES(observacoes),
            escalation = VALUES(escalation),
            updated_at = NOW()
        `;
        await client.execute(upsertSql, [
          docKey, 
          cliente,
          vencimento,
          valor,
          tipo,
          responsavel || null,
          departamento || null, 
          observacoes || null,
          escalation || null
        ]);
        
        console.log(`Disputa saved for: ${searchTerm} (doc_key: ${docKey})`);
        result = { success: true };
        break;
      }

      case 'delete_disputa': {
        const { doc_key } = body as { doc_key?: string };
        
        if (!doc_key) {
          return new Response(
            JSON.stringify({ error: 'doc_key é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Soft delete via t_financeiro_soft_delete
        const insertSql = `
          INSERT IGNORE INTO ai_agente.t_financeiro_soft_delete (documento, active)
          VALUES (?, 0)
        `;
        await client.execute(insertSql, [doc_key]);
        
        console.log(`Disputa soft-deleted: ${doc_key}`);
        result = { success: true };
        break;
      }

      case 'resolve_disputa': {
        const { doc_key } = body as { doc_key?: string };
        
        if (!doc_key) {
          return new Response(
            JSON.stringify({ error: 'doc_key é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Mark disputa as resolved (disputa = 0)
        const updateSql = `
          UPDATE dados_dachser.t_dados_financeiro_nfs 
          SET disputa = 0, 
              fim_disputa = NOW()
          WHERE documento = ? OR numero_nf = ? OR nd = ?
        `;
        await client.execute(updateSql, [doc_key, doc_key, doc_key]);
        
        console.log(`Disputa resolved: ${doc_key}`);
        result = { success: true };
        break;
      }

      case 'import_disputas_planilha': {
        const { items } = body as { items?: Array<{
          nd: string;
          descricao?: string;
          departamento?: string;
          responsavel?: string;
          escalation?: string;
        }> };
        
        if (!items || !Array.isArray(items) || items.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Lista de itens é obrigatória', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        let successCount = 0;
        let notFoundCount = 0;
        let skippedCount = 0;
        const notFoundItems: string[] = [];
        const skippedItems: string[] = [];
        
        for (const item of items) {
          const nd = item.nd?.toString().trim();
          if (!nd) continue;
          
          // Check if document exists and get all required fields
          const checkSql = `
            SELECT 
              COALESCE(NULLIF(documento,''), NULLIF(nd,''), NULLIF(numero_nf,'')) AS doc_key,
              razao_social AS cliente,
              data_vencimento AS vencimento,
              valor_nf AS valor,
              CASE WHEN tipo_documento LIKE '%PRAZO%' THEN 'A prazo' ELSE 'À vista' END AS tipo,
              responsavel_disp
            FROM dados_dachser.t_dados_financeiro_nfs 
            WHERE documento = ? OR numero_nf = ? OR nd = ?
            LIMIT 1
          `;
          const existingRows = await client.query(checkSql, [nd, nd, nd]);
          
          if (!existingRows || existingRows.length === 0) {
            notFoundCount++;
            notFoundItems.push(nd);
            continue;
          }
          
          const docData = existingRows[0];
          const docKey = docData.doc_key;
          
          // Check if already exists in t_fin_disputas (skip if exists)
          const checkDisputaSql = `
            SELECT id FROM ai_agente.t_fin_disputas WHERE nf = ? LIMIT 1
          `;
          const existingDisputa = await client.query(checkDisputaSql, [docKey]);
          
          if (existingDisputa && existingDisputa.length > 0) {
            // Already in dispute, skip without overwriting
            skippedCount++;
            skippedItems.push(nd);
            continue;
          }
          
          // Update to mark as disputa in t_dados_financeiro_nfs
          const updateSql = `
            UPDATE dados_dachser.t_dados_financeiro_nfs 
            SET disputa = 1, 
                inicio_disputa = NOW(), 
                responsavel_disp = ?
            WHERE documento = ? OR numero_nf = ? OR nd = ?
          `;
          await client.execute(updateSql, [item.responsavel || null, nd, nd, nd]);
          
          // Insert new disputa (only if not exists)
          const insertSql = `
            INSERT INTO ai_agente.t_fin_disputas (nf, cliente, vencimento, valor, tipo, responsavel, departamento, observacoes, escalation, is_disputa, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
          `;
          await client.execute(insertSql, [
            docKey, 
            docData.cliente || 'N/A',
            docData.vencimento || null,
            docData.valor || 0,
            docData.tipo || 'À vista',
            item.responsavel || docData.responsavel_disp || null,
            item.departamento || null, 
            item.descricao || null,  // descricao → observacoes
            item.escalation || null
          ]);
          
          successCount++;
        }
        
        console.log(`Disputas import: ${successCount} success, ${skippedCount} skipped (already in dispute), ${notFoundCount} not found`);
        result = { 
          success: true, 
          imported: successCount, 
          skipped: skippedCount,
          notFound: notFoundCount,
          notFoundItems: notFoundItems.slice(0, 10),
          skippedItems: skippedItems.slice(0, 10)
        };
        break;
      }

      // ==================== USER REGISTRATION ====================
      case 'register_user': {
        const { username, password, email } = body as { username?: string; password?: string; email?: string };
        
        if (!username || !password || !email) {
          return new Response(
            JSON.stringify({ error: 'Username, password e email são obrigatórios', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if username already exists
        const existingUsername = await client.query(
          'SELECT id FROM ai_agente.t_users_dachser WHERE username = ?',
          [username]
        );
        if (existingUsername && existingUsername.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Este nome de usuário já está em uso', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if email already exists
        const existingEmail = await client.query(
          'SELECT id FROM ai_agente.t_users_dachser WHERE email = ?',
          [email]
        );
        if (existingEmail && existingEmail.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Este e-mail já está cadastrado', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hash password with bcrypt (using sync method to avoid Worker issues in Edge Functions)
        const passwordHash = bcrypt.hashSync(password);

        // Insert new user with must_change_password = 1
        const insertResult = await client.execute(
          `INSERT INTO ai_agente.t_users_dachser (username, email, password_hash, is_admin, must_change_password) 
           VALUES (?, ?, ?, 0, 1)`,
          [username, email, passwordHash]
        );

        console.log(`User registered successfully: ${username} (ID: ${insertResult.lastInsertId})`);
        result = { 
          success: true, 
          userId: insertResult.lastInsertId,
          message: 'Usuário cadastrado com sucesso'
        };
        break;
      }

      case 'change_password': {
        const { userId, password: newPassword } = body as { userId?: number; password?: string };
        
        if (!userId || !newPassword) {
          return new Response(
            JSON.stringify({ error: 'userId e password são obrigatórios', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (newPassword.length < 6) {
          return new Response(
            JSON.stringify({ error: 'A senha deve ter pelo menos 6 caracteres', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hash new password
        const newPasswordHash = bcrypt.hashSync(newPassword);

        // Update password and set must_change_password = 0
        await client.execute(
          `UPDATE ai_agente.t_users_dachser 
           SET password_hash = ?, must_change_password = 0 
           WHERE id = ?`,
          [newPasswordHash, userId]
        );

        console.log(`Password changed for user ID: ${userId}`);
        result = { 
          success: true, 
          message: 'Senha alterada com sucesso'
        };
        break;
      }

      // ==================== CCT (Control Tower) ====================
      case 'get_cct_shipments': {
        console.log('Fetching CCT shipments (post-tracking AWBs from t_status_aereo)...');
        
        // Registered airline codes for CCT filtering (43 airlines)
        const registeredAirlineCodes = [
          '001', '005', '006', '014', '016', '020', '023', '045', '047', '055',
          '057', '072', '074', '075', '081', '082', '086', '112', '118', '125',
          '139', '157', '160', '172', '176', '180', '205', '217', '235', '254',
          '263', '369', '399', '406', '416', '489', '549', '577', '615', '695',
          '724', '729', '881', '996', '999'
        ];
        const airlineFilter = registeredAirlineCodes.map(c => `'${c}'`).join(',');
        
        // SLA configuration by status (hours) for post-tracking
        const slaConfigByStatus: Record<string, number> = {
          'ATA': 6,
          'RCF': 12,
          'NFD': 24,
          'AWD': 24,
          'DLV': 48,
          'POD': 48,
          'ARR': 24, // For expired ARR
        };
        
        // Error/system statuses to exclude from CCT
        const errorStatuses = [
          'COMPANY_NOT_REGISTERED',
          'NOT_FOUND', 
          'ERRO',
          'ERROR',
          'INVALID_AWB',
          'API_ERROR',
          'TIMEOUT',
          'PARSE_ERROR',
          'SIS',
          'PENDING',
          'PROCESSING',
          'UNKNOWN',
          'N/A',
          'NULL'
        ];
        const errorStatusFilter = errorStatuses.map(s => `'${s}'`).join(',');
        
        // POST-TRACKING QUERY: AWBs that exited the tracking screen
        // Criteria:
        // 1. Post-ARR statuses (ATA, NFD, AWD, DLV, POD) - these don't appear in tracking
        // 2. ARR/RCF status with arr_datetime > 120 hours ago AND no active alerts (data_atraso IS NULL)
        // Use subquery to get the most recent record per house to avoid duplicates
        const shipments = await client.query(`
          SELECT 
            sub.id,
            sub.master,
            sub.house,
            sub.cliente,
            sub.nome_analista,
            sub.email_analista,
            sub.emails_cliente,
            sub.status_cct_oficial,
            sub.ultimo_evento_data,
            sub.ultimo_evento_codigo,
            sub.aeroporto_origem,
            sub.aeroporto_destino,
            sub.data_atraso,
            sub.arr_datetime,
            sub.dep_datetime,
            sub.tipo_servico,
            sub.airline_code,
            sub.peso_declarado,
            sub.peso_constatado,
            sub.volume_declarado,
            sub.volume_constatado,
            sub.eta,
            sub.etd,
            sub.data_decolagem_ultimo_trecho,
            sub.cnpj_consignatario,
            sub.data_manifestacao_cct,
            sub.tratamento,
            sub.ultimo_status_raw
          FROM (
            SELECT 
              s.id,
              TRIM(s.awb) as master,
              TRIM(s.hawb) as house,
              TRIM(s.\`destinatário\`) as cliente,
              s.nome_analista,
              s.email_analista,
              s.email_cliente as emails_cliente,
              s.\`último_status\` as ultimo_status_raw,
              s.\`última atualização\` as ultimo_evento_data,
              s.\`último_status\` as ultimo_evento_codigo,
              TRIM(s.origem) as aeroporto_origem,
              TRIM(s.destino) as aeroporto_destino,
              s.data_atraso,
              s.arr_datetime,
              s.dep_datetime,
              COALESCE(s.tipo_servico, 'N/A') as tipo_servico,
              LEFT(TRIM(s.awb), 3) as airline_code,
              cct.peso_declarado,
              cct.peso_constatado,
              cct.volume_declarado,
              cct.volume_constatado,
              cct.eta,
              cct.etd,
              cct.data_decolagem_ultimo_trecho,
              cct.cnpj_consignatario,
              cct.data_manifestacao_cct,
              TRIM(m.tratamento) as tratamento,
              -- Status de manifestação CCT (Nomenclatura Aduaneira)
              CASE 
                WHEN s.\`último_status\` IN ('ARR', 'ATA') THEN 'INFORMADA'
                WHEN s.\`último_status\` IN ('DEP', 'MAN', 'BKD') THEN 'MANIFESTADA'
                WHEN s.\`último_status\` IN ('RCF', 'RCS') THEN 'EM_AREA_TRANSFERENCIA'
                WHEN s.\`último_status\` IN ('NFD', 'AWD') THEN 'RECEPCIONADA'
                WHEN s.\`último_status\` IN ('DLV', 'POD') THEN 'ENTREGUE'
                WHEN s.\`último_status\` IN ('FRO', 'DIS', 'OFLD') THEN 'BLOQUEIO'
                ELSE 'INFORMADA'
              END as status_cct_oficial,
              ROW_NUMBER() OVER (PARTITION BY TRIM(s.hawb) ORDER BY s.\`última atualização\` DESC) as rn
            FROM ${database}.t_status_aereo s
            LEFT JOIN ${database}.t_cct_shipments cct ON TRIM(s.awb) COLLATE utf8mb4_unicode_ci = TRIM(cct.master) COLLATE utf8mb4_unicode_ci
            LEFT JOIN ${database}.t_master_dados m ON TRIM(s.awb) COLLATE utf8mb4_unicode_ci = TRIM(m.mawb) COLLATE utf8mb4_unicode_ci
            WHERE LEFT(TRIM(s.awb), 3) IN (${airlineFilter})
            AND s.\`último_status\` NOT IN (${errorStatusFilter})
            AND (m.tipo_processo = 'AIR IMPORT' OR m.tipo_processo IS NULL)
            AND (s.origem IS NOT NULL AND LOWER(TRIM(s.origem)) NOT IN ('n/a', 'na', 'erro', 'error', ''))
            AND (s.destino IS NOT NULL AND LOWER(TRIM(s.destino)) NOT IN ('n/a', 'na', 'erro', 'error', ''))
            AND (
              -- DEP status: espelhado no CCT (ainda em rastreio, mas também no CCT)
              s.\`último_status\` = 'DEP'
              OR
              -- Post-ARR statuses (not shown in tracking screen)
              s.\`último_status\` IN ('ATA', 'NFD', 'AWD', 'DLV', 'POD')
              OR 
              -- ARR/RCF with more than 120 hours (exited tracking by time)
              (s.\`último_status\` IN ('ARR', 'RCF') 
               AND s.arr_datetime IS NOT NULL 
               AND s.arr_datetime <= NOW() - INTERVAL 120 HOUR
               AND s.data_atraso IS NULL)
            )
            -- CCT RESET: Só mostrar AWBs atualizados a partir de 13/01/2026 22:00 (usando última atualização pois dep_datetime pode estar NULL)
            AND s.\`última atualização\` >= '2026-01-13 22:00:00'
          ) sub
          WHERE sub.rn = 1
          ORDER BY sub.ultimo_evento_data DESC
          LIMIT 500
        `);

        // Calculate SLA status based on specific status
        // NEW LOGIC: For manifested AWBs, SLA = DEP datetime - Manifestation datetime
        const now = new Date();
        const processedShipments = (shipments || []).map((row: any) => {
          const lastUpdate = row.ultimo_evento_data ? new Date(row.ultimo_evento_data) : null;
          const statusCode = row.status_cct_oficial || 'AGUARDANDO_MANIFESTACAO';
          
          // Parse dates for new SLA calculation
          const depDatetime = row.dep_datetime ? new Date(row.dep_datetime) : null;
          const manifestacaoDatetime = row.data_manifestacao_cct ? new Date(row.data_manifestacao_cct) : null;
          
          // Get SLA hours for this specific status
          const slaHours = slaConfigByStatus[statusCode] ?? 24;
          
          // SLA calculation
          let slaStatus = 'OK';
          let horasRestantes: number | null = null;
          let percentual: number | null = null;
          let tempoResposta: number | null = null; // Horas entre DEP e Manifestação
          let usouNovaLogica = false;
          
          // NEW LOGIC: If manifested and has DEP datetime, calculate SLA as DEP - Manifestação
          // This shows how long after manifestation the flight departed
          if (depDatetime && manifestacaoDatetime && statusCode === 'DEP') {
            tempoResposta = (depDatetime.getTime() - manifestacaoDatetime.getTime()) / (1000 * 60 * 60);
            usouNovaLogica = true;
            
            // SLA thresholds based on tempo de resposta (quanto menor, melhor)
            // OK: decolou em até 24h após manifestar
            // ALERTA: decolou entre 24h e 48h após manifestar
            // VENCIDO: decolou mais de 48h após manifestar
            if (tempoResposta <= 24) {
              slaStatus = 'OK';
              percentual = Math.min(100, (tempoResposta / 24) * 100);
            } else if (tempoResposta <= 48) {
              slaStatus = 'ALERTA';
              percentual = Math.min(100, (tempoResposta / 48) * 100);
            } else {
              slaStatus = 'VENCIDO';
              percentual = 100;
            }
            horasRestantes = null; // Não aplicável para tempo de resposta
          } else if (depDatetime || manifestacaoDatetime) {
            // Has at least one reference date - use time-based SLA
            const hoursSinceUpdate = lastUpdate ? (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60) : null;
            
            if (hoursSinceUpdate !== null) {
              horasRestantes = slaHours - hoursSinceUpdate;
              percentual = Math.min(100, Math.max(0, (hoursSinceUpdate / slaHours) * 100));
              
              if (horasRestantes <= 0) {
                slaStatus = 'VENCIDO';
              } else if (horasRestantes <= 2) {
                slaStatus = 'CRITICO';
              } else if (horasRestantes <= 4) {
                slaStatus = 'ALERTA';
              }
            }
          } else {
            // NO departure date AND no manifestation date - keep as OK
            // SLA will only be affected by divergence or flight delay (below)
            // This prevents false positives for AWBs without departure info
            slaStatus = 'OK';
            horasRestantes = null;
            percentual = null;
          }

          // Helper function to calculate divergence percentage
          const calcDivergencia = (declarado: number | null, constatado: number | null): number | null => {
            if (!declarado || !constatado || declarado === 0) return null;
            return Math.abs(((constatado - declarado) / declarado) * 100);
          };

          // Check for weight/volume divergence > 0%
          const divergenciaPeso = calcDivergencia(
            row.peso_declarado ? Number(row.peso_declarado) : null,
            row.peso_constatado ? Number(row.peso_constatado) : null
          );
          const divergenciaVolume = calcDivergencia(
            row.volume_declarado ? Number(row.volume_declarado) : null,
            row.volume_constatado ? Number(row.volume_constatado) : null
          );
          const temDivergencia = (divergenciaPeso !== null && divergenciaPeso > 0) || 
                                 (divergenciaVolume !== null && divergenciaVolume > 0);

          // Mark as CRITICO if there's any divergence (unless already VENCIDO)
          if (temDivergencia && slaStatus !== 'VENCIDO') {
            slaStatus = 'CRITICO';
          }

          // Check for flight delay from tracking screen (data_atraso)
          const temAtrasoVoo = row.data_atraso !== null && row.data_atraso !== undefined;

          // If flight is delayed, mark as ALERTA (unless already VENCIDO or CRITICO)
          if (temAtrasoVoo && slaStatus === 'OK') {
            slaStatus = 'ALERTA';
          }

          // Check for alert/frozen statuses
          const frozenStatuses = ['FRO', 'FROZEN'];
          const blockStatuses = ['DIS', 'OFLD', 'NOT_FOUND', 'ERRO', 'BLOQUEIO'];
          const isFrozen = frozenStatuses.includes(statusCode);
          const isBlock = blockStatuses.includes(statusCode);

          // Keep IATA code for hybrid nomenclature display (DEP - Embarcado, ARR - Chegada, etc.)
          // Valid IATA codes that should be displayed as-is
          const validIataCodes = ['DEP', 'ARR', 'ATA', 'RCF', 'RCS', 'NFD', 'AWD', 'DLV', 'POD', 'FRO', 'DIS', 'OFLD', 'MAN', 'BKD'];
          
          // Use IATA code directly if valid, otherwise fallback to original status or default
          const displayStatus = validIataCodes.includes(statusCode) 
            ? statusCode 
            : statusCode || 'AGUARDANDO_MANIFESTACAO';

          return {
            id: row.id?.toString() || row.master,
            house: row.house || '',
            master: row.master || '',
            cliente: row.cliente || '',
            aeroporto_origem: row.aeroporto_origem || 'N/A',
            aeroporto_destino: row.aeroporto_destino || 'GRU',
            status_cct_oficial: displayStatus,
            status_manifestacao: row.status_cct_oficial || 'INFORMADA',
            sla_status: slaStatus,
            sla_info: {
              status: slaStatus,
              horasRestantes: horasRestantes !== null ? Math.round(horasRestantes * 100) / 100 : null,
              percentual: percentual !== null ? Math.round(percentual * 100) / 100 : null,
              slaConfigHoras: slaHours,
              tempoResposta: tempoResposta !== null ? Math.round(tempoResposta * 100) / 100 : null, // Horas entre DEP e Manifestação
              usouNovaLogica: usouNovaLogica, // Indica se usou a lógica DEP - Manifestação
            },
            sla_limite: null,
            tipo_voo: null,
            ultimo_evento_data: row.ultimo_evento_data,
            ultimo_evento_codigo: statusCode,
            ultimo_evento_descricao: statusCode,
            nome_analista: row.nome_analista,
            email_analista: row.email_analista,
            emails_cliente: row.emails_cliente,
            eta: row.eta || null,
            etd: row.etd || null,
            peso_declarado: row.peso_declarado ? Number(row.peso_declarado) : null,
            peso_constatado: row.peso_constatado ? Number(row.peso_constatado) : null,
            volume_declarado: row.volume_declarado ? Number(row.volume_declarado) : null,
            volume_constatado: row.volume_constatado ? Number(row.volume_constatado) : null,
            cnpj_consignatario: row.cnpj_consignatario || null,
            tratamento: row.tratamento || null,
            excecoes_abertas: isFrozen ? 1 : isBlock ? 1 : 0,
            is_frozen: isFrozen,
            data_atraso: row.data_atraso,
            data_decolagem_ultimo_trecho: row.data_decolagem_ultimo_trecho || null,
            arr_datetime: row.arr_datetime,
            dep_datetime: row.dep_datetime, // Timestamp real do DEP da companhia aérea
            data_manifestacao_cct: row.data_manifestacao_cct, // Data de manifestação no CCT
            created_at: row.ultimo_evento_data || new Date().toISOString(),
            updated_at: row.ultimo_evento_data || new Date().toISOString(),
          };
        });

        console.log(`CCT: Found ${processedShipments.length} post-tracking AWBs (ARR expirado ou pós-chegada)`);
        result = { success: true, data: processedShipments };
        break;
      }

      case 'get_cct_shipment': {
        const { shipmentId, awbNumber } = body as { shipmentId?: string; awbNumber?: string };
        
        if (!shipmentId && !awbNumber) {
          return new Response(
            JSON.stringify({ error: 'shipmentId ou awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const whereClause = shipmentId 
          ? `s.id = ${parseInt(shipmentId)}` 
          : `TRIM(s.awb) = '${(awbNumber || '').trim()}'`;

        const shipment = await client.query(`
          SELECT 
            s.id,
            TRIM(s.awb) as master,
            TRIM(s.hawb) as house,
            TRIM(s.\`destinatário\`) as cliente,
            TRIM(s.origem) as aeroporto_origem,
            TRIM(s.destino) as aeroporto_destino,
            s.\`último_status\` as status_cct_oficial,
            s.\`última atualização\` as ultimo_evento_data,
            s.nome_analista,
            s.email_analista,
            s.email_cliente as emails_cliente,
            s.data_atraso,
            cct.eta,
            cct.etd,
            cct.peso_declarado,
            cct.peso_constatado,
            cct.volume_declarado,
            cct.volume_constatado,
            cct.data_decolagem_ultimo_trecho,
            cct.tratamentos_especiais,
            cct.cnpj_consignatario
          FROM ${database}.t_status_aereo s
          LEFT JOIN ${database}.t_master_dados m ON TRIM(s.awb) COLLATE utf8mb4_unicode_ci = TRIM(m.mawb) COLLATE utf8mb4_unicode_ci
          LEFT JOIN ${database}.t_cct_shipments cct ON TRIM(s.awb) COLLATE utf8mb4_unicode_ci = TRIM(cct.master) COLLATE utf8mb4_unicode_ci
          WHERE ${whereClause}
          LIMIT 1
        `);

        if (!shipment || shipment.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Shipment não encontrado', success: false }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, data: shipment[0] };
        break;
      }

      case 'update_cct_shipment': {
        const { shipmentId, awbNumber, updates } = body as { 
          shipmentId?: string; 
          awbNumber?: string; 
          updates?: Record<string, any>;
        };
        
        if (!shipmentId && !awbNumber) {
          return new Response(
            JSON.stringify({ error: 'shipmentId ou awbNumber é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!updates || Object.keys(updates).length === 0) {
          return new Response(
            JSON.stringify({ error: 'updates é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fields that go to t_cct_shipments
        const cctFields = [
          'peso_declarado', 'peso_constatado', 'peso_bruto', 'peso_real',
          'volume_declarado', 'volume_constatado', 'volume',
          'eta', 'etd', 'data_decolagem_ultimo_trecho',
          'tratamentos_especiais', 'tratamento_especial', 
          'cnpj_consignatario'
        ];

        // Fields that go to t_status_aereo
        const statusFieldMapping: Record<string, string> = {
          nome_analista: 'nome_analista',
          email_analista: 'email_analista',
          emails_cliente: 'email_cliente',
        };

        const cctUpdates: Record<string, any> = {};
        const statusUpdates: Record<string, any> = {};

        for (const [key, value] of Object.entries(updates)) {
          if (cctFields.includes(key)) {
            // Normalize field names for t_cct_shipments
            const normalizedKey = key === 'peso_bruto' || key === 'peso_real' ? 'peso_declarado' 
              : key === 'volume' ? 'volume_declarado'
              : key === 'tratamento_especial' ? 'tratamentos_especiais'
              : key;
            cctUpdates[normalizedKey] = value;
          } else if (statusFieldMapping[key]) {
            statusUpdates[statusFieldMapping[key]] = value;
          } else {
            statusUpdates[key] = value;
          }
        }

        const masterAwb = (awbNumber || '').trim();

        // UPSERT into t_cct_shipments if there are CCT updates
        if (Object.keys(cctUpdates).length > 0) {
          const cctColumns = ['master', ...Object.keys(cctUpdates), 'updated_at'];
          const cctPlaceholders = cctColumns.map(() => '?').join(', ');
          const cctValues = [masterAwb, ...Object.values(cctUpdates), new Date()];
          
          const updateClauses = Object.keys(cctUpdates)
            .map(col => `${col} = VALUES(${col})`)
            .join(', ');

          await client.execute(
            `INSERT INTO ${database}.t_cct_shipments (${cctColumns.join(', ')}) 
             VALUES (${cctPlaceholders})
             ON DUPLICATE KEY UPDATE ${updateClauses}, updated_at = NOW()`,
            cctValues
          );
          console.log(`CCT: Upserted t_cct_shipments for ${masterAwb}`);
        }

        // UPDATE t_status_aereo if there are status updates
        if (Object.keys(statusUpdates).length > 0) {
          const setClauses: string[] = [];
          const values: any[] = [];

          for (const [key, value] of Object.entries(statusUpdates)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
          }

          const whereClause = shipmentId 
            ? `id = ?` 
            : `TRIM(awb) = ?`;
          values.push(shipmentId || masterAwb);

          await client.execute(
            `UPDATE ${database}.t_status_aereo SET ${setClauses.join(', ')} WHERE ${whereClause}`,
            values
          );
          console.log(`CCT: Updated t_status_aereo for ${shipmentId || masterAwb}`);
        }

        console.log(`CCT: Updated shipment ${shipmentId || awbNumber}`);
        result = { success: true, message: 'Shipment atualizado' };
        break;
      }

      case 'get_cct_analytics': {
        console.log('Fetching CCT analytics...');
        
        // Get status distribution
        const statusCounts = await client.query(`
          SELECT 
            \`último_status\` as status,
            COUNT(*) as count
          FROM ${database}.t_status_aereo
          WHERE \`último_status\` NOT IN ('DLV', 'POD', 'FINALIZADO')
          GROUP BY \`último_status\`
          ORDER BY count DESC
        `);

        // Get alert counts (DIS, OFLD statuses)
        const alertCounts = await client.query(`
          SELECT COUNT(*) as count
          FROM ${database}.t_status_aereo
          WHERE \`último_status\` IN ('DIS', 'OFLD')
        `);

        // Get shipments with no update in 24h
        const staleShipments = await client.query(`
          SELECT COUNT(*) as count
          FROM ${database}.t_status_aereo
          WHERE \`último_status\` NOT IN ('DLV', 'POD', 'FINALIZADO')
          AND \`última atualização\` < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        // Get daily event counts for last 7 days
        const dailyEvents = await client.query(`
          SELECT 
            DATE(\`última atualização\`) as date,
            COUNT(*) as count
          FROM ${database}.t_status_aereo
          WHERE \`última atualização\` >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY DATE(\`última atualização\`)
          ORDER BY date DESC
        `);

        result = { 
          success: true, 
          data: {
            statusDistribution: statusCounts || [],
            alertCount: alertCounts?.[0]?.count || 0,
            staleCount: staleShipments?.[0]?.count || 0,
            dailyEvents: dailyEvents || [],
          }
        };
        break;
      }

      case 'get_cct_profiles': {
        console.log('Fetching CCT profiles (analysts)...');
        
        // Get unique analysts from t_status_aereo
        const analysts = await client.query(`
          SELECT DISTINCT
            nome_analista as nome,
            email_analista as email
          FROM ${database}.t_status_aereo
          WHERE nome_analista IS NOT NULL 
          AND nome_analista != ''
          ORDER BY nome_analista
        `);

        const profiles = (analysts || []).map((row: any, index: number) => ({
          id: `analyst-${index + 1}`,
          nome: row.nome || '',
          email: row.email || '',
          ativo: true,
        }));

        console.log(`CCT: Found ${profiles.length} analyst profiles`);
        result = { success: true, data: profiles };
        break;
      }

      case 'get_cct_regras_notificacao': {
        console.log('Fetching CCT notification rules...');
        
        // Create table if not exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_cct_regras_notificacao (
            id INT PRIMARY KEY AUTO_INCREMENT,
            cliente_nome VARCHAR(255),
            cnpj_consignatario VARCHAR(20),
            aeroportos TEXT,
            eventos_disparo TEXT,
            canais TEXT,
            template_id VARCHAR(100) DEFAULT 'default',
            ativo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        const regras = await client.query(`
          SELECT * FROM ${database}.t_cct_regras_notificacao
          ORDER BY created_at DESC
        `);

        console.log(`Found ${regras?.length || 0} notification rules`);
        result = { success: true, data: regras || [] };
        break;
      }

      case 'create_cct_regra_notificacao': {
        const { cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo } = body;
        console.log('Creating CCT notification rule:', { cliente_nome, cnpj_consignatario });

        await client.execute(`
          INSERT INTO ${database}.t_cct_regras_notificacao 
          (cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          cliente_nome || null,
          cnpj_consignatario || null,
          aeroportos || '[]',
          eventos_disparo || '[]',
          canais || '[]',
          template_id || 'default',
          ativo !== false ? 1 : 0
        ]);

        result = { success: true, message: 'Regra criada com sucesso' };
        break;
      }

      case 'update_cct_regra_notificacao': {
        const { id, cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo } = body;
        console.log('Updating CCT notification rule:', id);

        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (cliente_nome !== undefined) { updateFields.push('cliente_nome = ?'); updateValues.push(cliente_nome); }
        if (cnpj_consignatario !== undefined) { updateFields.push('cnpj_consignatario = ?'); updateValues.push(cnpj_consignatario); }
        if (aeroportos !== undefined) { updateFields.push('aeroportos = ?'); updateValues.push(aeroportos); }
        if (eventos_disparo !== undefined) { updateFields.push('eventos_disparo = ?'); updateValues.push(eventos_disparo); }
        if (canais !== undefined) { updateFields.push('canais = ?'); updateValues.push(canais); }
        if (template_id !== undefined) { updateFields.push('template_id = ?'); updateValues.push(template_id); }
        if (ativo !== undefined) { updateFields.push('ativo = ?'); updateValues.push(ativo ? 1 : 0); }

        if (updateFields.length > 0) {
          updateValues.push(id);
          await client.execute(`
            UPDATE ${database}.t_cct_regras_notificacao 
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `, updateValues);
        }

        result = { success: true, message: 'Regra atualizada com sucesso' };
        break;
      }

      case 'delete_cct_regra_notificacao': {
        const { id } = body;
        console.log('Deleting CCT notification rule:', id);

        await client.execute(`
          DELETE FROM ${database}.t_cct_regras_notificacao WHERE id = ?
        `, [id]);

        result = { success: true, message: 'Regra excluída com sucesso' };
        break;
      }

      // ==================== EMAIL CLIENTE REGRAS (AWB) ====================
      case 'get_email_cliente_regras': {
        console.log('Fetching email cliente rules...');
        
        // Create table if not exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_email_cliente (
            id INT PRIMARY KEY AUTO_INCREMENT,
            cliente_nome VARCHAR(255),
            cnpj_consignatario VARCHAR(20),
            email_cliente VARCHAR(255),
            aeroportos TEXT,
            eventos_disparo TEXT,
            canais TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        const regrasEmail = await client.query(`
          SELECT * FROM ${database}.t_email_cliente
          ORDER BY created_at DESC
        `);

        console.log(`Found ${regrasEmail?.length || 0} email cliente rules`);
        result = { success: true, data: regrasEmail || [] };
        break;
      }

      case 'create_email_cliente_regra': {
        const { cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo } = body;
        console.log('Creating email cliente rule:', { cliente_nome, cnpj_consignatario, email_cliente });

        await client.execute(`
          INSERT INTO ${database}.t_email_cliente 
          (cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          cliente_nome || null,
          cnpj_consignatario || null,
          email_cliente || null,
          aeroportos || '[]',
          eventos_disparo || '[]',
          canais || '[]',
          ativo !== false ? 1 : 0
        ]);

        result = { success: true, message: 'Regra criada com sucesso' };
        break;
      }

      case 'update_email_cliente_regra': {
        const { id, cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo } = body;
        console.log('Updating email cliente rule:', id);

        const updateFieldsEmail: string[] = [];
        const updateValuesEmail: any[] = [];

        if (cliente_nome !== undefined) { updateFieldsEmail.push('cliente_nome = ?'); updateValuesEmail.push(cliente_nome); }
        if (cnpj_consignatario !== undefined) { updateFieldsEmail.push('cnpj_consignatario = ?'); updateValuesEmail.push(cnpj_consignatario); }
        if (email_cliente !== undefined) { updateFieldsEmail.push('email_cliente = ?'); updateValuesEmail.push(email_cliente); }
        if (aeroportos !== undefined) { updateFieldsEmail.push('aeroportos = ?'); updateValuesEmail.push(aeroportos); }
        if (eventos_disparo !== undefined) { updateFieldsEmail.push('eventos_disparo = ?'); updateValuesEmail.push(eventos_disparo); }
        if (canais !== undefined) { updateFieldsEmail.push('canais = ?'); updateValuesEmail.push(canais); }
        if (ativo !== undefined) { updateFieldsEmail.push('ativo = ?'); updateValuesEmail.push(ativo ? 1 : 0); }

        if (updateFieldsEmail.length > 0) {
          updateValuesEmail.push(id);
          await client.execute(`
            UPDATE ${database}.t_email_cliente 
            SET ${updateFieldsEmail.join(', ')}
            WHERE id = ?
          `, updateValuesEmail);
        }

        result = { success: true, message: 'Regra atualizada com sucesso' };
        break;
      }

      case 'delete_email_cliente_regra': {
        const { id } = body;
        console.log('Deleting email cliente rule:', id);

        await client.execute(`
          DELETE FROM ${database}.t_email_cliente WHERE id = ?
        `, [id]);

        result = { success: true, message: 'Regra excluída com sucesso' };
        break;
      }

      // ==================== SEA CONTAINER COUNT ====================
      case 'get_sea_container_count': {
        console.log('Fetching sea container count from t_master_dados...');
        
        // Count distinct containers from t_master_dados with SEA imports
        const countResult = await client.query(`
          SELECT COUNT(DISTINCT container) as count 
          FROM ${database}.t_master_dados 
          WHERE container IS NOT NULL 
            AND container != '' 
            AND TRIM(container) != ''
            AND tipo_servico LIKE '%SEA%'
        `);
        
        const count = countResult?.[0]?.count || 0;
        console.log('Sea container count:', count);
        
        result = { success: true, count };
        break;
      }

      // ==================== CHB MODULE ====================
      case 'get_chb_items': {
        console.log('Fetching CHB items');
        const items = await client.query(`
          SELECT i.*, 
            (SELECT MAX(r.created_at) FROM ai_agente.t_dachser_chb_runs r WHERE r.item_id = i.id) as last_run_at
          FROM ai_agente.t_dachser_chb_items i 
          WHERE i.active = 1 
          ORDER BY i.created_at DESC
        `);
        result = { success: true, data: items || [] };
        break;
      }

      case 'get_chb_item': {
        const { id: itemId } = body;
        console.log('Fetching CHB item:', itemId);
        const items = await client.query(`
          SELECT * FROM ai_agente.t_dachser_chb_items WHERE id = ?
        `, [itemId]);
        result = { success: true, data: items?.[0] || null };
        break;
      }

      case 'create_chb_item': {
        const { reference, consignee, userId } = body as { reference?: string; consignee?: string; userId?: number };
        console.log('Creating CHB item:', { reference, consignee });
        
        const insertResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_items 
          (reference, consignee, status_macro, step1_status, step2_status, step3_status, active, created_by)
          VALUES (?, ?, 'pre_alerta_pendente', 'pendente', 'pendente', 'pendente', 1, ?)
        `, [reference || null, consignee || null, userId || null]);
        
        result = { success: true, id: insertResult.lastInsertId };
        break;
      }

      case 'update_chb_item': {
        // Note: modal column does not exist in database - removed to prevent error
        const { id: itemId, status_macro, step1_status, step2_status, step3_status, consignee } = body;
        console.log('Updating CHB item:', itemId, { status_macro, step1_status, step2_status, step3_status, consignee });
        
        // First, ensure ALL status columns can accept longer values - run each ALTER separately
        const alterColumns = [
          { col: 'status_macro', type: 'VARCHAR(100)' },
          { col: 'step1_status', type: 'VARCHAR(100)' },
          { col: 'step2_status', type: 'VARCHAR(100)' },
          { col: 'step3_status', type: 'VARCHAR(100)' },
          { col: 'consignee', type: 'VARCHAR(255)' },
        ];
        
        for (const { col, type } of alterColumns) {
          try {
            await client.execute(`ALTER TABLE ai_agente.t_dachser_chb_items MODIFY COLUMN ${col} ${type} NULL`);
            console.log(`[CHB] Column ${col} altered to ${type}`);
          } catch (alterErr) {
            // Ignore - column might already be correct or doesn't exist
          }
        }
        
        const fields: string[] = [];
        const values: any[] = [];
        if (status_macro !== undefined) { fields.push('status_macro = ?'); values.push(status_macro || null); }
        if (step1_status !== undefined) { fields.push('step1_status = ?'); values.push(step1_status || null); }
        if (step2_status !== undefined) { fields.push('step2_status = ?'); values.push(step2_status || null); }
        if (step3_status !== undefined) { fields.push('step3_status = ?'); values.push(step3_status || null); }
        if (consignee !== undefined) { fields.push('consignee = ?'); values.push(consignee || null); }
        
        if (fields.length > 0) {
          values.push(itemId);
          await client.execute(`
            UPDATE ai_agente.t_dachser_chb_items SET ${fields.join(', ')} WHERE id = ?
          `, values);
        }
        
        result = { success: true };
        break;
      }

      case 'delete_chb_item': {
        const { id: itemId } = body;
        console.log('Soft-deleting CHB item:', itemId);
        await client.execute(`
          UPDATE ai_agente.t_dachser_chb_items SET active = 0 WHERE id = ?
        `, [itemId]);
        result = { success: true };
        break;
      }

      case 'get_chb_files': {
        const { itemId } = body;
        console.log('Fetching CHB files for item:', itemId);
        const files = await client.query(`
          SELECT f.*, d.etapa, d.doc_role, d.is_active as doc_active
          FROM ai_agente.t_dachser_chb_files f
          INNER JOIN ai_agente.t_dachser_chb_docs d ON d.file_id = f.id
          WHERE d.item_id = ? AND d.is_active = 1
          ORDER BY d.etapa, f.created_at
        `, [itemId]);
        result = { success: true, data: files || [] };
        break;
      }

      case 'create_chb_file': {
        const { itemId, filename, mime, sizeBytes, sha256, relPath, url, etapa, docRole, userId } = body as any;
        console.log('Creating CHB file:', { filename, itemId, etapa, docRole });
        
        // First, ensure the doc_role column can accept longer values (ALTER TABLE if needed)
        try {
          await client.execute(`
            ALTER TABLE ai_agente.t_dachser_chb_docs MODIFY COLUMN doc_role VARCHAR(50) NULL
          `);
          console.log('[CHB] Successfully altered doc_role column to VARCHAR(50)');
        } catch (alterErr) {
          // Column might already be correct or we lack permissions - continue anyway
          console.log('[CHB] ALTER TABLE note (may already be correct):', (alterErr as Error).message?.substring(0, 100));
        }
        
        // Insert file
        const fileResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_files 
          (filename, mime, size_bytes, sha256, rel_path, url, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [filename, mime || null, sizeBytes || null, sha256 || null, relPath || '', url || null, userId || null]);
        
        const fileId = fileResult.lastInsertId;
        console.log('[CHB] File inserted with ID:', fileId);
        
        // Normalize doc_role - accept any format and store as-is (column is now VARCHAR(50))
        const rawDocRole = (docRole || 'O').toString().trim();
        console.log(`[CHB] Saving file with doc_role: "${rawDocRole}"`);
        
        // Link file to item
        await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_docs 
          (item_id, file_id, etapa, doc_role, version, is_active, created_by)
          VALUES (?, ?, ?, ?, 1, 1, ?)
        `, [itemId, fileId, etapa || '1', rawDocRole, userId || null]);
        
        console.log('[CHB] Document linked successfully to item:', itemId);
        result = { success: true, fileId };
        break;
      }

      case 'delete_chb_doc': {
        const { fileId, itemId } = body;
        console.log('Soft-deleting CHB doc:', { fileId, itemId });
        await client.execute(`
          UPDATE ai_agente.t_dachser_chb_docs SET is_active = 0 WHERE file_id = ? AND item_id = ?
        `, [fileId, itemId]);
        result = { success: true };
        break;
      }

      case 'get_chb_runs': {
        const { itemId, etapa } = body;
        console.log('Fetching CHB runs for item:', itemId, 'etapa:', etapa);
        
        let query = `
          SELECT r.*, u.username as created_by_name, u.email as created_by_email
          FROM ai_agente.t_dachser_chb_runs r
          LEFT JOIN ai_agente.t_users_dachser u ON u.id = r.created_by
          WHERE r.item_id = ?
        `;
        const params: any[] = [itemId];
        
        if (etapa !== undefined) {
          query += ` AND r.etapa = ?`;
          params.push(etapa);
        }
        
        query += ` ORDER BY r.created_at DESC`;
        
        const runs = await client.query(query, params);
        result = { success: true, data: runs || [] };
        break;
      }

      case 'create_chb_run': {
        const { itemId, etapa, status, resultText, resultHtml, resultJson, usedAsCtx, userId } = body as any;
        console.log('Creating CHB run:', { itemId, etapa, status, userId });
        
        const insertResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_runs 
          (item_id, etapa, status, result_text, result_html, result_json, used_as_ctx, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          itemId, 
          etapa || '1', 
          status || 'completed', 
          resultText || null, 
          resultHtml || null, 
          resultJson || null, 
          usedAsCtx ? 1 : 0,
          userId || null
        ]);
        
        result = { success: true, runId: insertResult.lastInsertId };
        break;
      }

      case 'update_chb_run_ctx': {
        const { runId, usedAsCtx } = body;
        console.log('Updating CHB run context flag:', runId);
        await client.execute(`
          UPDATE ai_agente.t_dachser_chb_runs SET used_as_ctx = ? WHERE id = ?
        `, [usedAsCtx ? 1 : 0, runId]);
        result = { success: true };
        break;
      }

      case 'update_chb_run': {
        const { runId, status, resultText, resultHtml, resultJson } = body;
        console.log('Updating CHB run:', { runId, status });
        
        const updates: string[] = [];
        const params: any[] = [];
        
        if (status !== undefined) {
          updates.push('status = ?');
          params.push(status);
        }
        if (resultText !== undefined) {
          updates.push('result_text = ?');
          params.push(resultText);
        }
        if (resultHtml !== undefined) {
          updates.push('result_html = ?');
          params.push(resultHtml);
        }
        if (resultJson !== undefined) {
          updates.push('result_json = ?');
          params.push(typeof resultJson === 'string' ? resultJson : JSON.stringify(resultJson));
        }
        
        if (updates.length === 0) {
          result = { success: false, error: 'No updates provided' };
          break;
        }
        
        params.push(runId);
        await client.execute(`
          UPDATE ai_agente.t_dachser_chb_runs SET ${updates.join(', ')} WHERE id = ?
        `, params);
        
        result = { success: true };
        break;
      }

      // ==================== SEA (MARITIME) MODULE ====================
      // Tables: t_dachser_sea_items (id, view, arquivo_id, arquivo_label, consignee, container, status, active, active_by, active_at, created_at)
      // t_dachser_sea_runs (id, item_id, mode, thread_id, run_id, status, result_text, created_at)
      // t_dachser_sea_files (id, filename, mime, size_bytes, sha256, rel_path, url, created_at, created_by)
      
      case 'get_maritimo_items': {
        const { analysisType, status, search } = body;
        console.log('Fetching SEA items:', { analysisType, status, search });
        
        let query = `
          SELECT i.id, i.view, i.arquivo_id, i.arquivo_label as base_file_name, 
                 i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
                 i.status, i.active, i.created_at,
                 (SELECT COUNT(*) FROM ai_agente.t_dachser_sea_runs r WHERE r.item_id = i.id) as run_count
          FROM ai_agente.t_dachser_sea_items i
          WHERE i.active = 1
        `;
        const params: any[] = [];
        
        // Filter by view (manifest_hbl, hbl_mbl, invoices_hbl)
        if (analysisType) {
          query += ` AND i.view = ?`;
          params.push(analysisType);
        }
        
        if (status && status !== 'todos') {
          query += ` AND i.status = ?`;
          params.push(status);
        }
        
        if (search) {
          query += ` AND (i.arquivo_label LIKE ? OR i.consignee LIKE ? OR i.container LIKE ?)`;
          const searchPattern = `%${search}%`;
          params.push(searchPattern, searchPattern, searchPattern);
        }
        
        query += ` ORDER BY i.created_at DESC`;
        
        const items = await client.query(query, params);
        result = { success: true, items: items || [] };
        break;
      }

      case 'get_maritimo_item': {
        const { itemId } = body;
        console.log('Fetching SEA item:', itemId);
        
        const items = await client.query(`
          SELECT i.id, i.view, i.arquivo_id, i.arquivo_label as base_file_name, 
                 i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
                 i.status, i.active, i.created_at
          FROM ai_agente.t_dachser_sea_items i 
          WHERE i.id = ?
        `, [itemId]);
        
        result = { success: true, item: items?.[0] || null };
        break;
      }

      case 'upload_maritimo_base_file': {
        const { fileName, fileType, analysisType, userId } = body as any;
        console.log('Uploading SEA base file:', fileName);
        
        // First create file record
        const fileResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, created_at, created_by)
          VALUES (?, ?, NOW(), ?)
        `, [fileName, fileType, userId || null]);
        
        const arquivoId = fileResult.lastInsertId;
        
        // Create item record linking to file
        const itemResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_sea_items 
          (view, arquivo_id, arquivo_label, status, active, created_at)
          VALUES (?, ?, ?, 'pendente', 1, NOW())
        `, [analysisType || 'manifest_hbl', arquivoId, fileName]);
        
        result = { success: true, itemId: itemResult.lastInsertId, fileId: arquivoId };
        break;
      }

      case 'get_maritimo_history': {
        const { itemId } = body;
        console.log('Fetching SEA history for item:', itemId);
        
        const items = await client.query(`
          SELECT i.id, i.arquivo_id, i.arquivo_label as base_file_name, i.consignee, i.container, i.status, i.view as analysis_type, i.created_at, i.updated_at
          FROM ai_agente.t_dachser_sea_items i
          WHERE i.id = ?
        `, [itemId]);
        
        const runs = await client.query(`
          SELECT r.id, r.item_id, r.mode, r.thread_id, r.run_id, r.status, r.result_text, r.created_at
          FROM ai_agente.t_dachser_sea_runs r
          WHERE r.item_id = ?
          ORDER BY r.created_at DESC
        `, [itemId]);
        
        // Get files via arquivo_id from items table (items.arquivo_id -> files.id)
        const arquivoId = items?.[0]?.arquivo_id;
        let itemFiles: any[] = [];
        if (arquivoId) {
          itemFiles = await client.query(`
            SELECT f.id, f.filename as file_name, f.url as file_url, f.mime as file_type, f.size_bytes, f.created_at
            FROM ai_agente.t_dachser_sea_files f
            WHERE f.id = ?
            ORDER BY f.created_at ASC
          `, [arquivoId]) || [];
        }
        
        // Attach files to runs
        const runsWithFiles = (runs || []).map((run: any) => ({
          ...run,
          files: itemFiles
        }));
        
        result = { 
          success: true, 
          item: items?.[0] || { base_file_name: '' },
          runs: runsWithFiles
        };
        break;
      }

      case 'get_maritimo_files': {
        const { itemId } = body;
        console.log('Fetching SEA files for item:', itemId);
        
        // Get arquivo_id (base file) from item
        const items = await client.query(`
          SELECT arquivo_id FROM ai_agente.t_dachser_sea_items WHERE id = ?
        `, [itemId]);
        
        const arquivoId = items?.[0]?.arquivo_id;
        
        // Fetch base file (arquivo_id) + all files linked to this item via item_id column
        const files = await client.query(`
          SELECT DISTINCT id, filename as file_name, mime as file_type, size_bytes, url, rel_path, created_at
          FROM ai_agente.t_dachser_sea_files
          WHERE id = ? OR item_id = ?
          ORDER BY created_at ASC
        `, [arquivoId || 0, itemId]);
        
        result = { success: true, files: files || [] };
        break;
      }

      case 'create_maritimo_run': {
        const { itemId, status, resultText, mode, threadId, runId } = body as any;
        console.log('Creating SEA run:', { itemId, status, mode });
        
        const insertResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_sea_runs 
          (item_id, mode, thread_id, run_id, status, result_text, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
          itemId, 
          mode || 'manifest_hbl',
          threadId || null,
          runId || null,
          status || 'completed', 
          resultText || null
        ]);
        
        // Update item status
        await client.execute(`
          UPDATE ai_agente.t_dachser_sea_items SET status = 'realizado' WHERE id = ?
        `, [itemId]);
        
        result = { success: true, runId: insertResult.lastInsertId };
        break;
      }

      case 'save_maritimo_file': {
        const { fileName, fileType, fileUrl, relPath, sizeBytes, sha256, userId } = body as any;
        console.log('Saving SEA file:', { fileName });
        
        const insertResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_sea_files 
          (filename, mime, size_bytes, sha256, rel_path, url, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
        `, [fileName, fileType, sizeBytes || null, sha256 || null, relPath || null, fileUrl || null, userId || null]);
        
        result = { success: true, fileId: insertResult.lastInsertId };
        break;
      }

      case 'delete_maritimo_item': {
        const { itemId } = body;
        console.log('Soft-deleting SEA item:', itemId);
        
        await client.execute(`
          UPDATE ai_agente.t_dachser_sea_items SET active = 0, active_at = NOW() WHERE id = ?
        `, [itemId]);
        
        result = { success: true };
        break;
      }

      case 'update_maritimo_item': {
        const { itemId, consignee, container, status } = body as any;
        console.log('Updating SEA item:', itemId);
        
        const updates: string[] = [];
        const params: any[] = [];
        
        if (consignee !== undefined) { updates.push('consignee = ?'); params.push(consignee); }
        if (container !== undefined) { updates.push('container = ?'); params.push(container); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        
        if (updates.length > 0) {
          params.push(itemId);
          await client.execute(`
            UPDATE ai_agente.t_dachser_sea_items SET ${updates.join(', ')} WHERE id = ?
          `, params);
        }
        
        result = { success: true };
        break;
      }

      case 'export_sea_report': {
        const { analysisType, dateFrom, dateTo, status } = body;
        console.log('Exporting SEA report:', { analysisType, dateFrom, dateTo, status });
        
        let query = `
          SELECT 
            i.id,
            i.arquivo_label as arquivo,
            i.mbl_number,
            i.carrier as armador,
            i.consignee as cliente,
            i.ata_date as data_atracacao,
            i.container,
            i.view as tipo_analise,
            i.status,
            i.created_at as data_criacao
          FROM ai_agente.t_dachser_sea_items i
          WHERE i.active = 1
        `;
        const params: any[] = [];
        
        if (analysisType && analysisType !== 'todos') {
          query += ` AND i.view = ?`;
          params.push(analysisType);
        }
        
        if (status && status !== 'todos') {
          query += ` AND i.status = ?`;
          params.push(status);
        }
        
        if (dateFrom) {
          query += ` AND DATE(i.created_at) >= ?`;
          params.push(dateFrom);
        }
        
        if (dateTo) {
          query += ` AND DATE(i.created_at) <= ?`;
          params.push(dateTo);
        }
        
        query += ` ORDER BY i.created_at DESC LIMIT 5000`;
        
        const items = await client.query(query, params);
        result = { success: true, items: items || [] };
        break;
      }

      case 'get_maritimo_analysis_status': {
        const { analysisId } = body;
        console.log('Fetching SEA analysis status:', analysisId);
        
        const runs = await client.query(`
          SELECT * FROM ai_agente.t_dachser_sea_runs WHERE id = ?
        `, [analysisId]);
        
        const run = runs?.[0];
        result = { 
          success: true, 
          status: run?.status || 'pending',
          progress: run?.status === 'completed' ? 100 : 50,
          step: run?.status === 'completed' ? 'Concluído' : 'Processando...',
          result_text: run?.result_text
        };
        break;
      }

      case 'complete_maritimo_analysis': {
        const { analysisId, itemId, completed } = body;
        console.log('Completing SEA analysis:', { analysisId, itemId, completed });
        
        await client.execute(`
          UPDATE ai_agente.t_dachser_sea_runs SET status = ? WHERE id = ?
        `, [completed ? 'completed' : 'error', analysisId]);
        
        if (completed) {
          await client.execute(`
            UPDATE ai_agente.t_dachser_sea_items SET status = 'realizado' WHERE id = ?
          `, [itemId]);
          
          // === NEW: Save container data to t_dachser_container on analysis completion ===
          try {
            // 1. Fetch item data (container, consignee)
            const itemData = await client.query(`
              SELECT container, consignee FROM ai_agente.t_dachser_sea_items WHERE id = ?
            `, [itemId]);
            
            // 2. Fetch last analysis result for this item (vessel, voyage, origem, destino)
            const runData = await client.query(`
              SELECT result_json FROM ai_agente.t_dachser_sea_runs 
              WHERE item_id = ? AND status = 'completed'
              ORDER BY updated_at DESC LIMIT 1
            `, [itemId]);
            
            if (itemData && itemData.length > 0 && itemData[0].container) {
              const containerNum = itemData[0].container;
              const consignee = itemData[0].consignee || '';
              
              // Parse shipping data from result_json
              let vessel = '', voyage = '', origem = '', destino = '';
              if (runData && runData.length > 0 && runData[0].result_json) {
                try {
                  const resultJson = typeof runData[0].result_json === 'string' 
                    ? JSON.parse(runData[0].result_json) 
                    : runData[0].result_json;
                  
                  if (resultJson.hblShippingData) {
                    vessel = resultJson.hblShippingData.vessel || '';
                    voyage = resultJson.hblShippingData.voyage || '';
                    origem = resultJson.hblShippingData.origin || resultJson.hblShippingData.portOfLoading || '';
                    destino = resultJson.hblShippingData.destination || resultJson.hblShippingData.portOfDischarge || '';
                  }
                } catch (parseErr) {
                  console.log('Error parsing result_json:', parseErr);
                }
              }
              
              console.log('Saving container data on completion:', { containerNum, vessel, voyage, origem, destino, consignee });
              
              // Ensure consignee column exists
              try {
                await client.execute(`
                  ALTER TABLE ai_agente.t_dachser_container 
                  ADD COLUMN IF NOT EXISTS consignee VARCHAR(255) DEFAULT NULL
                `);
              } catch (alterErr) {
                console.log('Consignee column check:', alterErr);
              }
              
              // Check if container already exists
              const existing = await client.query(`
                SELECT id FROM ai_agente.t_dachser_container WHERE container = ?
              `, [containerNum.trim()]);
              
              if (existing && existing.length > 0) {
                // Container already exists - skip to avoid duplicity
                console.log(`⚠️ Container ${containerNum} already exists in t_dachser_container, skipping save`);
              } else {
                await client.execute(`
                  INSERT INTO ai_agente.t_dachser_container 
                  (container, vessel, voyage, origem, destino, consignee)
                  VALUES (?, ?, ?, ?, ?, ?)
                `, [containerNum.trim(), vessel, voyage, origem, destino, consignee]);
                console.log(`✅ Container ${containerNum} inserted into t_dachser_container`);
              }
            } else {
              console.log('⚠️ No container found for item, skipping t_dachser_container save');
            }
          } catch (containerErr) {
            console.error('Error saving container data on completion:', containerErr);
            // Don't fail the whole operation, just log the error
          }
        }
        
        result = { success: true };
        break;
      }

      case 'reextract_maritimo_metadata': {
        const { forceAll } = body;
        console.log('Reextracting SEA metadata, forceAll:', forceAll);
        
        // Get items to process
        let query = `SELECT id, arquivo_label FROM ai_agente.t_dachser_sea_items WHERE active = 1`;
        if (!forceAll) {
          query += ` AND (consignee IS NULL OR container IS NULL)`;
        }
        
        const items = await client.query(query);
        let processed = 0;
        
        // Simple extraction from filename patterns (can be enhanced)
        for (const item of (items || [])) {
          // Extract container pattern (e.g., MSKU1234567)
          const containerMatch = item.arquivo_label?.match(/([A-Z]{4}\d{7})/);
          if (containerMatch) {
            await client.execute(`
              UPDATE ai_agente.t_dachser_sea_items SET container = ? WHERE id = ?
            `, [containerMatch[1], item.id]);
            processed++;
          }
        }
        
        result = { success: true, processed };
        break;
      }

      case 'extract_maritimo_attachments': {
        const { fileName, fileContent, fileType } = body as any;
        console.log('Extracting attachments from:', fileName);
        
        // For now, return the file itself as an attachment
        // In a real implementation, this would process EML/ZIP files
        result = { 
          success: true, 
          extracted: [{
            filename: fileName,
            type: fileType,
            size: fileContent?.length || 0,
            category: 'document'
          }]
        };
        break;
      }

      // ==================== VOUCHER ESTEIRA (dados_dachser.t_vouchers) ====================
      case 'save_voucher_esteira': {
        const voucherData = body as any;
        console.log('Saving voucher to dados_dachser.t_vouchers:', voucherData.numero_spo);
        
        // Ensure id_rm column exists
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS id_rm VARCHAR(50) DEFAULT NULL`);
        } catch (alterErr) {
          console.log('id_rm column alter skipped (may already exist)');
        }
        
        // Ensure tipo_documento column is VARCHAR if it's still ENUM
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN tipo_documento VARCHAR(100) DEFAULT NULL`);
        } catch (alterErr) {
          console.log('tipo_documento column alter skipped (may already be VARCHAR)');
        }
        
        // Ensure etapa_atual column is VARCHAR to accept all values (RASCUNHO, SUPERVISOR, etc)
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN etapa_atual VARCHAR(50) NOT NULL DEFAULT 'OPERACAO'`);
        } catch (alterErr) {
          console.log('etapa_atual column alter skipped (may already be VARCHAR)');
        }
        
        // Ensure urgencia_tipo column is VARCHAR
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN urgencia_tipo VARCHAR(50) DEFAULT 'NORMAL'`);
        } catch (alterErr) {
          console.log('urgencia_tipo column alter skipped');
        }
        
        // Ensure status_baixa column is VARCHAR
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN status_baixa VARCHAR(50) DEFAULT 'PENDENTE'`);
        } catch (alterErr) {
          console.log('status_baixa column alter skipped');
        }
        
        // Ensure remessa column is VARCHAR
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN remessa VARCHAR(50) DEFAULT 'NENHUM'`);
        } catch (alterErr) {
          console.log('remessa column alter skipped');
        }
        
        // Ensure forma_pagamento column is VARCHAR
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN forma_pagamento VARCHAR(50) DEFAULT 'BOLETO'`);
        } catch (alterErr) {
          console.log('forma_pagamento column alter skipped');
        }
        
        // Generate UUID for id
        const voucherId = voucherData.id || crypto.randomUUID();
        
        // Helper to convert ISO date to MySQL format (YYYY-MM-DD)
        const toMySQLDate = (isoDate: string | null): string | null => {
          if (!isoDate) return null;
          try {
            return isoDate.split('T')[0];
          } catch {
            return null;
          }
        };
        
        // Helper to convert empty strings to null (for ENUM fields)
        const emptyToNull = (val: any): any => {
          if (val === '' || val === undefined) return null;
          return val;
        };
        
        // Insert voucher data into existing t_vouchers table (with id_rm support)
        // Ensure processo_id, origem_processo, chave_pix and status_documento_fiscal columns exist
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS processo_id VARCHAR(100) DEFAULT NULL`);
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS origem_processo VARCHAR(10) DEFAULT NULL`);
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255) DEFAULT NULL`);
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS status_documento_fiscal VARCHAR(20) DEFAULT 'ANEXADO'`);
        } catch (e) {
          console.log('Columns may already exist:', e);
        }
        
        const insertResult = await client.execute(`
          INSERT INTO dados_dachser.t_vouchers (
            id, id_rm, numero_spo, vencimento, cobranca_em_nome_de,
            forma_pagamento, remessa, urgente, urgencia_tipo,
            etapa_atual, status_baixa, status_envio_cliente, status_financeiro,
            tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor,
            cliente_email, filial, data_emissao_documento,
            comentarios_operacao, comentarios_fiscal, comentarios_financeiro,
            ajuste_operacao, ajuste_fiscal, criado_por_user_id,
            processo_id, origem_processo, chave_pix, status_documento_fiscal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          voucherId,
          emptyToNull(voucherData.id_rm),
          emptyToNull(voucherData.numero_spo),
          toMySQLDate(voucherData.vencimento),
          emptyToNull(voucherData.cobranca_em_nome_de) || 'DACHSER',
          emptyToNull(voucherData.forma_pagamento) || 'BOLETO',
          emptyToNull(voucherData.remessa) || 'NENHUM',
          voucherData.urgente ? 1 : 0,
          emptyToNull(voucherData.urgencia_tipo) || 'NORMAL',
          emptyToNull(voucherData.etapa_atual) || 'OPERACAO',
          emptyToNull(voucherData.status_baixa) || 'PENDENTE',
          emptyToNull(voucherData.status_envio_cliente) || 'NAO_APLICA',
          emptyToNull(voucherData.status_financeiro) || 'PENDENTE',
          emptyToNull(voucherData.tipo_documento),
          emptyToNull(voucherData.valor),
          emptyToNull(voucherData.moeda) || 'BRL',
          emptyToNull(voucherData.fornecedor),
          voucherData.cnpj_fornecedor?.replace(/\D/g, '') || null,
          emptyToNull(voucherData.cliente_email),
          emptyToNull(voucherData.filial),
          toMySQLDate(voucherData.data_emissao_documento),
          emptyToNull(voucherData.comentarios_operacao),
          emptyToNull(voucherData.comentarios_fiscal),
          emptyToNull(voucherData.comentarios_financeiro),
          emptyToNull(voucherData.ajuste_operacao),
          emptyToNull(voucherData.ajuste_fiscal),
          emptyToNull(voucherData.criado_por_user_id),
          emptyToNull(voucherData.processo_id),
          emptyToNull(voucherData.origem_processo),
          emptyToNull(voucherData.chave_pix),
          emptyToNull(voucherData.status_documento_fiscal) || 'ANEXADO'
        ]);
        
        console.log('Voucher saved to MariaDB t_vouchers, ID:', voucherId, 'id_rm:', voucherData.id_rm);
        result = { success: true, mariadbId: voucherId };
        break;
      }

      case 'save_voucher_anexo': {
        const anexoData = body as {
          voucher_id?: string;
          tipo?: string;
          file_name?: string;
          file_url?: string;
          file_size?: number;
        };
        
        if (!anexoData.voucher_id || !anexoData.tipo || !anexoData.file_name || !anexoData.file_url) {
          return new Response(
            JSON.stringify({ error: 'voucher_id, tipo, file_name e file_url são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Ensure t_voucher_anexos table exists
        try {
          await client.execute(`
            CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_anexos (
              id VARCHAR(36) PRIMARY KEY,
              voucher_id VARCHAR(36) NOT NULL,
              tipo VARCHAR(50) NOT NULL,
              file_name VARCHAR(500) NOT NULL,
              file_url TEXT NOT NULL,
              file_size BIGINT DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_voucher_id (voucher_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
        } catch (createErr) {
          console.log('t_voucher_anexos table creation skipped (may already exist)');
        }

        console.log('Saving anexo to dados_dachser.t_voucher_anexos:', anexoData.voucher_id, anexoData.tipo);
        
        const anexoId = crypto.randomUUID();
        
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_anexos (
            id, voucher_id, tipo, file_name, file_url, file_size, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
          anexoId,
          anexoData.voucher_id,
          anexoData.tipo,
          anexoData.file_name,
          anexoData.file_url,
          anexoData.file_size || 0
        ]);
        
        // Se o anexo é do tipo FATURA ou FATURA_DEMONSTRATIVO, e o voucher é ADF, 
        // atualizar status_documento_fiscal para ANEXADO
        if (anexoData.tipo === 'FATURA' || anexoData.tipo === 'FATURA_DEMONSTRATIVO') {
          try {
            // Verificar se o voucher é do tipo ADF e está com status PENDENTE
            const voucherCheck = await client.execute(`
              SELECT tipo_documento, status_documento_fiscal 
              FROM dados_dachser.t_vouchers 
              WHERE id = ?
            `, [anexoData.voucher_id]);
            
            const voucherRows = voucherCheck.rows as Array<{tipo_documento: string; status_documento_fiscal: string}>;
            if (voucherRows.length > 0 && 
                voucherRows[0].tipo_documento === 'ADF' && 
                voucherRows[0].status_documento_fiscal === 'PENDENTE') {
              await client.execute(`
                UPDATE dados_dachser.t_vouchers 
                SET status_documento_fiscal = 'ANEXADO', updated_at = NOW() 
                WHERE id = ?
              `, [anexoData.voucher_id]);
              console.log('ADF voucher status_documento_fiscal updated to ANEXADO for:', anexoData.voucher_id);
            }
          } catch (updateErr) {
            console.log('Could not update status_documento_fiscal:', updateErr);
          }
        }
        
        console.log('Anexo saved to MariaDB t_voucher_anexos, ID:', anexoId);
        result = { success: true, anexoId };
        break;
      }

      case 'update_voucher_esteira': {
        const { voucher_id, updates: updatesObj, user_id, user_name, ...directFields } = body as any;
        console.log('Updating voucher in dados_dachser.t_vouchers:', voucher_id);
        
        // Support both formats: direct fields or nested 'updates' object
        const updateData = updatesObj || directFields;
        
        const updateClauses: string[] = [];
        const params: any[] = [];
        
        const fieldMapping: Record<string, string> = {
          // Status and workflow fields
          etapa_atual: 'etapa_atual',
          status_baixa: 'status_baixa',
          status_financeiro: 'status_financeiro',
          status_envio_cliente: 'status_envio_cliente',
          comentarios_operacao: 'comentarios_operacao',
          comentarios_fiscal: 'comentarios_fiscal',
          comentarios_financeiro: 'comentarios_financeiro',
          ajuste_operacao: 'ajuste_operacao',
          ajuste_fiscal: 'ajuste_fiscal',
          responsavel_operacao_user_id: 'responsavel_operacao_user_id',
          responsavel_fiscal_user_id: 'responsavel_fiscal_user_id',
          responsavel_financeiro_user_id: 'responsavel_financeiro_user_id',
          responsavel_supervisor_user_id: 'responsavel_supervisor_user_id',
          aprovado_por_user_id: 'aprovado_por_user_id',
          // Editable data fields
          numero_spo: 'numero_spo',
          fornecedor: 'fornecedor',
          cnpj_fornecedor: 'cnpj_fornecedor',
          valor: 'valor',
          moeda: 'moeda',
          vencimento: 'vencimento',
          data_emissao_documento: 'data_emissao_documento',
          cobranca_em_nome_de: 'cobranca_em_nome_de',
          forma_pagamento: 'forma_pagamento',
          tipo_documento: 'tipo_documento',
          filial: 'filial',
          urgencia_tipo: 'urgencia_tipo',
          cliente_email: 'cliente_email',
          remessa: 'remessa',
          // PIX field
          chave_pix: 'chave_pix',
          // ADF status
          status_documento_fiscal: 'status_documento_fiscal',
        };
        
        for (const [key, dbField] of Object.entries(fieldMapping)) {
          if (updateData[key] !== undefined) {
            updateClauses.push(`${dbField} = ?`);
            params.push(updateData[key]);
          }
        }
        
        if (updateClauses.length > 0) {
          // Always update updated_at
          updateClauses.push('updated_at = NOW()');
          params.push(voucher_id);
          await client.execute(`
            UPDATE dados_dachser.t_vouchers SET ${updateClauses.join(', ')} WHERE id = ?
          `, params);
          
          // Log the update if user info provided
          if (user_id || user_name) {
            await client.execute(`
              INSERT INTO dados_dachser.t_voucher_logs (
                id, voucher_id, user_id, user_name, acao, detalhe, data_hora
              ) VALUES (?, ?, ?, ?, 'VOUCHER_EDITADO', ?, NOW())
            `, [
              crypto.randomUUID(),
              voucher_id,
              user_id || null,
              user_name || 'Sistema',
              `Voucher editado. Campos alterados: ${Object.keys(updateData).filter(k => updateData[k] !== undefined && fieldMapping[k]).join(', ')}`
            ]);
          }
          
          console.log('Voucher updated successfully:', voucher_id);
        } else {
          console.log('No fields to update for voucher:', voucher_id);
        }
        
        result = { success: true };
        break;
      }

      // Admin action: Move all vouchers from one stage to another
      case 'admin_bulk_update_etapa': {
        const bulkBody = body as any;
        const from_etapa = bulkBody.from_etapa as string;
        const to_etapa = bulkBody.to_etapa as string;
        const bulk_user_id = bulkBody.user_id as string | undefined;
        const bulk_user_name = bulkBody.user_name as string | undefined;
        
        if (!from_etapa || !to_etapa) {
          return new Response(
            JSON.stringify({ error: 'from_etapa e to_etapa são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`Admin bulk update: Moving vouchers from ${from_etapa} to ${to_etapa}`);
        
        // Count affected vouchers first
        const countResult = await client.execute(`
          SELECT COUNT(*) as total FROM dados_dachser.t_vouchers WHERE etapa_atual = ?
        `, [from_etapa]);
        
        const affectedCount = (countResult.rows?.[0] as any)?.total || 0;
        console.log(`Found ${affectedCount} vouchers in stage ${from_etapa}`);
        
        if (affectedCount > 0) {
          // Update all vouchers
          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET etapa_atual = ?, updated_at = NOW() 
            WHERE etapa_atual = ?
          `, [to_etapa, from_etapa]);
          
          // Log the bulk action
          await client.execute(`
            INSERT INTO dados_dachser.t_voucher_logs (
              id, voucher_id, user_id, user_name, acao, detalhe, data_hora
            ) VALUES (?, 'BULK_ACTION', ?, ?, 'BULK_ETAPA_CHANGE', ?, NOW())
          `, [
            crypto.randomUUID(),
            bulk_user_id || null,
            bulk_user_name || 'Admin',
            `Alteração em massa: ${affectedCount} vouchers movidos de ${from_etapa} para ${to_etapa}`
          ]);
          
          console.log(`Successfully moved ${affectedCount} vouchers from ${from_etapa} to ${to_etapa}`);
        }
        
        result = { success: true, affectedCount };
        break;
      }

      case 'admin_reset_all_to_a_processar': {
        const resetBody = body as any;
        const reset_user_id = resetBody.user_id as string | undefined;
        const reset_user_name = resetBody.user_name as string | undefined;
        
        console.log('Admin reset: Moving ALL non-A_PROCESSAR vouchers to A_PROCESSAR');
        
        // Count affected vouchers first
        const countResult = await client.execute(`
          SELECT COUNT(*) as total FROM dados_dachser.t_vouchers WHERE etapa_atual != 'A_PROCESSAR'
        `);
        
        const affectedCount = (countResult.rows?.[0] as any)?.total || 0;
        console.log(`Found ${affectedCount} vouchers to reset to A_PROCESSAR`);
        
        if (affectedCount > 0) {
          // Update all vouchers
          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET etapa_atual = 'A_PROCESSAR', updated_at = NOW() 
            WHERE etapa_atual != 'A_PROCESSAR'
          `);
          
          // Log the bulk action
          await client.execute(`
            INSERT INTO dados_dachser.t_voucher_logs (
              id, voucher_id, user_id, user_name, acao, detalhe, data_hora
            ) VALUES (?, 'BULK_ACTION', ?, ?, 'RESET_ETAPA_A_PROCESSAR', ?, NOW())
          `, [
            crypto.randomUUID(),
            reset_user_id || null,
            reset_user_name || 'Admin',
            `Reset em massa: ${affectedCount} vouchers movidos para A_PROCESSAR`
          ]);
          
          console.log(`Successfully reset ${affectedCount} vouchers to A_PROCESSAR`);
        }
        
        result = { success: true, affectedCount };
        break;
      }

      // Reset vouchers NOT updated today to A_PROCESSAR
      case 'admin_reset_stale_to_a_processar': {
        const resetBody = body as any;
        const reset_user_id = resetBody.user_id as string | undefined;
        const reset_user_name = resetBody.user_name as string | undefined;
        
        console.log('Admin reset: Moving stale vouchers (not updated today) to A_PROCESSAR');
        
        // First, list affected vouchers for logging
        const staleVouchers = await client.query(`
          SELECT id, numero_spo, etapa_atual, updated_at 
          FROM dados_dachser.t_vouchers 
          WHERE etapa_atual NOT IN ('A_PROCESSAR', 'CONCLUIDO', 'CANCELADO')
            AND DATE(updated_at) < CURDATE()
        `);
        
        const affectedCount = staleVouchers?.length || 0;
        console.log(`Found ${affectedCount} stale vouchers to reset to A_PROCESSAR`);
        
        if (affectedCount > 0) {
          // Log each voucher being reset
          const affectedSpos = (staleVouchers || []).map((v: any) => v.numero_spo).join(', ');
          console.log(`Resetting vouchers: ${affectedSpos}`);
          
          // Update stale vouchers (not updated today)
          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET etapa_atual = 'A_PROCESSAR', updated_at = NOW() 
            WHERE etapa_atual NOT IN ('A_PROCESSAR', 'CONCLUIDO', 'CANCELADO')
              AND DATE(updated_at) < CURDATE()
          `);
          
          // Log the bulk action
          await client.execute(`
            INSERT INTO dados_dachser.t_voucher_logs (
              id, voucher_id, user_id, user_name, acao, detalhe, data_hora
            ) VALUES (?, 'BULK_ACTION', ?, ?, 'RESET_STALE_TO_A_PROCESSAR', ?, NOW())
          `, [
            crypto.randomUUID(),
            reset_user_id || null,
            reset_user_name || 'Admin',
            `Reset vouchers obsoletos: ${affectedCount} vouchers movidos para A_PROCESSAR (${affectedSpos})`
          ]);
          
          console.log(`Successfully reset ${affectedCount} stale vouchers to A_PROCESSAR`);
        }
        
        result = { success: true, affectedCount, vouchers: staleVouchers };
        break;
      }

      case 'get_vouchers_esteira': {
        const { search, etapa } = body as any;
        console.log('Fetching ALL vouchers from dados_dachser.t_vouchers (no limit)');
        
        let whereConditions: string[] = [];
        let params: any[] = [];
        
        // CRITICAL: Exclude child vouchers (consolidated into a master) from main grid
        whereConditions.push('(voucher_master_id IS NULL OR voucher_master_id = "")');
        
        if (search) {
          whereConditions.push('(numero_spo LIKE ? OR fornecedor LIKE ? OR cnpj_fornecedor LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (etapa) {
          whereConditions.push('etapa_atual = ?');
          params.push(etapa);
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        const vouchers = await client.query(`
          SELECT * FROM dados_dachser.t_vouchers ${whereClause} ORDER BY created_at DESC
        `, params);
        
        result = { success: true, data: vouchers };
        break;
      }

      case 'get_voucher_by_id': {
        const { voucher_id } = body as any;
        console.log('Fetching voucher by ID with anexos and logs:', voucher_id);
        
        if (!voucher_id) {
          return new Response(
            JSON.stringify({ error: 'voucher_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Fetch voucher
        const vouchers = await client.query(`
          SELECT * FROM dados_dachser.t_vouchers WHERE id = ?
        `, [voucher_id]);
        
        const voucher = vouchers?.[0] || null;
        
        if (!voucher) {
          result = { success: true, data: null, anexos: [], logs: [] };
          break;
        }
        
        // Fetch anexos
        let anexos: any[] = [];
        try {
          anexos = await client.query(`
            SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at
            FROM dados_dachser.t_voucher_anexos
            WHERE voucher_id = ?
            ORDER BY created_at DESC
          `, [voucher_id]);
        } catch (anexosErr) {
          console.log('Error fetching anexos (table may not exist):', anexosErr);
        }
        
        // Ensure t_voucher_logs table exists
        try {
          await client.execute(`
            CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_logs (
              id VARCHAR(36) PRIMARY KEY,
              voucher_id VARCHAR(36) NOT NULL,
              user_id VARCHAR(100) DEFAULT NULL,
              user_name VARCHAR(255) DEFAULT NULL,
              acao VARCHAR(100) NOT NULL,
              detalhe TEXT DEFAULT NULL,
              data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_voucher_logs_voucher_id (voucher_id),
              INDEX idx_voucher_logs_data_hora (data_hora)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
        } catch (createLogsErr) {
          console.log('t_voucher_logs table creation skipped (may already exist)');
        }
        
        // Fetch logs
        let logs: any[] = [];
        try {
          logs = await client.query(`
            SELECT id, voucher_id, user_id, user_name, acao, detalhe, data_hora
            FROM dados_dachser.t_voucher_logs
            WHERE voucher_id = ?
            ORDER BY data_hora DESC
          `, [voucher_id]);
        } catch (logsErr) {
          console.log('Error fetching logs (table may not exist):', logsErr);
        }
        
        // Fetch dados bancários if voucher has cnpj_fornecedor
        let dadosBancarios = null;
        if (voucher.cnpj_fornecedor) {
          try {
            const cnpjClean = (voucher.cnpj_fornecedor || '').replace(/\D/g, '');
            const dadosBancariosResult = await client.query(`
              SELECT 
                banco,
                agencia,
                digito_agencia,
                conta_corrente,
                digito_conta,
                razao_social,
                cnpj
              FROM dados_dachser.t_dados_financeiro_pag
              WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?
              LIMIT 1
            `, [cnpjClean]);
            
            if (dadosBancariosResult && dadosBancariosResult.length > 0) {
              const db = dadosBancariosResult[0];
              dadosBancarios = {
                banco: db.banco,
                agencia: db.agencia,
                conta: db.conta_corrente,
                favorecidoNome: db.razao_social,
                favorecidoDocumento: db.cnpj,
              };
            }
          } catch (dadosBancErr) {
            console.log('Error fetching dados bancarios:', dadosBancErr);
          }
        }
        
        result = { success: true, data: voucher, anexos: anexos || [], logs: logs || [], dadosBancarios };
        break;
      }

      case 'save_voucher_log': {
        const { voucher_id, user_id, user_name, acao, detalhe } = body as any;
        console.log('Saving voucher log:', voucher_id, acao);
        
        if (!voucher_id || !acao) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e acao são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Ensure t_voucher_logs table exists
        try {
          await client.execute(`
            CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_logs (
              id VARCHAR(36) PRIMARY KEY,
              voucher_id VARCHAR(36) NOT NULL,
              user_id VARCHAR(100) DEFAULT NULL,
              user_name VARCHAR(255) DEFAULT NULL,
              acao VARCHAR(100) NOT NULL,
              detalhe TEXT DEFAULT NULL,
              data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_voucher_logs_voucher_id (voucher_id),
              INDEX idx_voucher_logs_data_hora (data_hora)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
        } catch (createLogsErr) {
          console.log('t_voucher_logs table creation skipped (may already exist)');
        }
        
        const logId = crypto.randomUUID();
        
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [logId, voucher_id, user_id || null, user_name || 'Sistema', acao, detalhe || null]);
        
        console.log('Voucher log saved, ID:', logId);
        result = { success: true, logId };
        break;
      }

      case 'get_voucher_anexos': {
        const { voucher_id } = body as any;
        console.log('Fetching voucher anexos:', voucher_id);
        
        if (!voucher_id) {
          return new Response(
            JSON.stringify({ error: 'voucher_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        let anexos: any[] = [];
        try {
          anexos = await client.query(`
            SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at
            FROM dados_dachser.t_voucher_anexos
            WHERE voucher_id = ?
            ORDER BY created_at DESC
          `, [voucher_id]);
        } catch (anexosErr) {
          console.log('Error fetching anexos:', anexosErr);
        }
        
        result = { success: true, data: anexos || [] };
        break;
      }

      case 'delete_voucher_anexo': {
        const { anexo_id } = body as any;
        console.log('Deleting voucher anexo:', anexo_id);
        
        if (!anexo_id) {
          return new Response(
            JSON.stringify({ error: 'anexo_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        await client.execute(`
          DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?
        `, [anexo_id]);
        
        console.log('Voucher anexo deleted:', anexo_id);
        result = { success: true };
        break;
      }

      case 'delete_voucher_esteira': {
        const { voucher_id } = body as any;
        console.log('Deleting voucher from dados_dachser.t_vouchers:', voucher_id);
        
        if (!voucher_id) {
          result = { success: false, error: 'voucher_id is required' };
          break;
        }
        
        await client.execute(`
          DELETE FROM dados_dachser.t_vouchers WHERE id = ?
        `, [voucher_id]);
        
        console.log('Voucher deleted successfully:', voucher_id);
        result = { success: true };
        break;
      }

      // ==================== ESTEIRA USER MANAGEMENT ====================
      case 'get_esteira_users': {
        console.log('Fetching all users for Esteira management');
        
        // Ensure columns exist (will silently fail if they already exist)
        try {
          await client.execute(`
            ALTER TABLE ai_agente.t_users_dachser 
            ADD COLUMN esteira_role VARCHAR(50) NULL,
            ADD COLUMN esteira_active TINYINT(1) DEFAULT 1
          `);
          console.log('Added esteira columns to t_users_dachser');
        } catch (e) {
          // Columns likely already exist, ignore
        }
        
        const users = await client.query(`
          SELECT id, username, email, is_admin, esteira_role, esteira_active
          FROM ai_agente.t_users_dachser
          ORDER BY username ASC
        `);
        
        result = { success: true, users };
        break;
      }

      case 'update_esteira_role': {
        const { userId, esteira_role } = body as any;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`Updating esteira role for user ${userId} to ${esteira_role}`);
        
        await client.execute(`
          UPDATE ai_agente.t_users_dachser 
          SET esteira_role = ?
          WHERE id = ?
        `, [esteira_role || null, userId]);
        
        result = { success: true };
        break;
      }

      case 'toggle_esteira_active': {
        const { userId, esteira_active } = body as any;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'User ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`Toggling esteira active for user ${userId} to ${esteira_active}`);
        
        await client.execute(`
          UPDATE ai_agente.t_users_dachser 
          SET esteira_active = ?
          WHERE id = ?
        `, [esteira_active ? 1 : 0, userId]);
        
        result = { success: true };
        break;
      }

      // ==================== RAW QUERY (ADMIN) ====================
      case 'raw_query': {
        const { query, params: queryParams } = body as { query?: string; params?: any[] };
        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Query é obrigatória' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Executing raw query:', query.substring(0, 200));
        
        // Check if it's a SELECT query (read-only) or a modifying query
        const isReadOnly = query.trim().toUpperCase().startsWith('SELECT') || 
                           query.trim().toUpperCase().startsWith('SHOW') ||
                           query.trim().toUpperCase().startsWith('DESCRIBE');
        
        if (isReadOnly) {
          const queryResult = await client.query(query, queryParams || []);
          result = { success: true, data: queryResult };
        } else {
          const execResult = await client.execute(query, queryParams || []);
          result = { 
            success: true, 
            affectedRows: execResult.affectedRows,
            lastInsertId: execResult.lastInsertId 
          };
        }
        console.log('Raw query executed successfully');
        break;
      }

      // ==================== SEA CONTAINER DATA ====================
      case 'save_container_data': {
        const { container, vessel, voyage, origem, destino, consignee } = body as any;
        console.log('Saving container data:', { container, vessel, voyage, origem, destino, consignee });
        
        if (!container) {
          return new Response(
            JSON.stringify({ error: 'Container é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Ensure consignee column exists (add if missing)
        try {
          await client.execute(`
            ALTER TABLE ai_agente.t_dachser_container 
            ADD COLUMN IF NOT EXISTS consignee VARCHAR(255) DEFAULT NULL
          `);
        } catch (alterErr) {
          // Column may already exist, ignore error
          console.log('Consignee column check:', alterErr);
        }
        
        // Check if container already exists
        const existing = await client.query(`
          SELECT id FROM ai_agente.t_dachser_container WHERE container = ?
        `, [container.trim()]);
        
        if (existing && existing.length > 0) {
          // Update existing record
          await client.execute(`
            UPDATE ai_agente.t_dachser_container 
            SET vessel = ?, voyage = ?, origem = ?, destino = ?, consignee = ?
            WHERE container = ?
          `, [vessel || '', voyage || '', origem || '', destino || '', consignee || '', container.trim()]);
          result = { success: true, action: 'updated', id: existing[0].id };
        } else {
          // Insert new record
          const insertResult = await client.execute(`
            INSERT INTO ai_agente.t_dachser_container 
            (container, vessel, voyage, origem, destino, consignee)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [container.trim(), vessel || '', voyage || '', origem || '', destino || '', consignee || '']);
          result = { success: true, action: 'inserted', id: insertResult.lastInsertId };
        }
        break;
      }

      case 'get_container_data': {
        const { container } = body as any;
        console.log('Getting container data:', container);
        
        let query = `SELECT * FROM ai_agente.t_dachser_container`;
        const params: any[] = [];
        
        if (container) {
          query += ` WHERE container = ?`;
          params.push(container.trim());
        }
        
        query += ` ORDER BY created_at DESC`;
        
        const containers = await client.query(query, params);
        result = { success: true, data: containers || [] };
        break;
      }

      // ==================== CCT EVENTS HISTORY ====================
      case 'create_cct_events_table': {
        console.log('Creating t_cct_eventos_historico table if not exists...');
        
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_cct_eventos_historico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            awb VARCHAR(20) NOT NULL,
            codigo_evento VARCHAR(50) NOT NULL,
            descricao_evento TEXT,
            data_hora_evento DATETIME NOT NULL,
            fonte VARCHAR(20) DEFAULT 'TRACKING',
            aeroporto VARCHAR(10),
            nivel_confianca VARCHAR(20) DEFAULT 'PRIMARIA',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_awb (awb),
            INDEX idx_data_evento (data_hora_evento),
            UNIQUE KEY unique_event (awb, codigo_evento, data_hora_evento)
          )
        `);
        
        console.log('Table t_cct_eventos_historico created/verified');
        result = { success: true, message: 'Table created/verified' };
        break;
      }

      case 'insert_cct_event': {
        const { awb: eventAwb, codigo_evento, descricao_evento, data_hora_evento, fonte, aeroporto, nivel_confianca } = body as any;
        
        if (!eventAwb || !codigo_evento) {
          return new Response(
            JSON.stringify({ error: 'AWB e codigo_evento são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Inserting CCT event:', { awb: eventAwb, codigo_evento });

        // First ensure table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_cct_eventos_historico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            awb VARCHAR(20) NOT NULL,
            codigo_evento VARCHAR(50) NOT NULL,
            descricao_evento TEXT,
            data_hora_evento DATETIME NOT NULL,
            fonte VARCHAR(20) DEFAULT 'TRACKING',
            aeroporto VARCHAR(10),
            nivel_confianca VARCHAR(20) DEFAULT 'PRIMARIA',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_awb (awb),
            INDEX idx_data_evento (data_hora_evento),
            UNIQUE KEY unique_event (awb, codigo_evento, data_hora_evento)
          )
        `);

        // Insert event (ignore duplicates)
        await client.execute(`
          INSERT IGNORE INTO ${database}.t_cct_eventos_historico 
          (awb, codigo_evento, descricao_evento, data_hora_evento, fonte, aeroporto, nivel_confianca)
          VALUES (TRIM(?), TRIM(?), ?, ?, ?, ?, ?)
        `, [
          eventAwb,
          codigo_evento,
          descricao_evento || codigo_evento,
          data_hora_evento || new Date().toISOString().slice(0, 19).replace('T', ' '),
          fonte || 'TRACKING',
          aeroporto || null,
          nivel_confianca || 'PRIMARIA'
        ]);

        result = { success: true, message: 'Event inserted' };
        break;
      }

      case 'get_cct_events': {
        const { awb: queryAwb } = body as any;
        
        if (!queryAwb) {
          return new Response(
            JSON.stringify({ error: 'AWB é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Fetching CCT events for AWB from t_status_historico:', queryAwb);

        // Query from t_status_historico (tracking history table)
        try {
          const events = await client.query(`
            SELECT 
              id,
              TRIM(awb) as awb,
              TRIM(status_code) as codigo_evento,
              status_description as descricao_evento,
              data_evento as data_hora_evento,
              fonte,
              destino as aeroporto,
              'PRIMARIA' as nivel_confianca,
              data_registro as created_at
            FROM ${database}.t_status_historico
            WHERE TRIM(awb) = TRIM(?)
            ORDER BY data_evento DESC
            LIMIT 100
          `, [queryAwb]);

          console.log(`CCT: Found ${events?.length || 0} events in t_status_historico for AWB ${queryAwb}`);
          result = { success: true, data: events || [] };
        } catch (tableErr) {
          console.log('Error fetching from t_status_historico:', tableErr);
          result = { success: true, data: [] };
        }
        break;
      }

      // ==================== PASSWORD RESET ====================
      case 'get_user_by_email': {
        const { email } = body as { email?: string };
        
        if (!email) {
          return new Response(
            JSON.stringify({ error: 'E-mail é obrigatório', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Looking up user by email: ${email}`);
        
        const users = await client.query(
          'SELECT id, username, email FROM ai_agente.t_users_dachser WHERE email = ?',
          [email.trim().toLowerCase()]
        );

        if (!users || users.length === 0) {
          return new Response(
            JSON.stringify({ error: 'E-mail não encontrado', success: false }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, user: users[0] };
        break;
      }

      case 'create_reset_code': {
        const { email, userId } = body as { email?: string; userId?: number };
        
        if (!email || !userId) {
          return new Response(
            JSON.stringify({ error: 'E-mail e userId são obrigatórios', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create table if not exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_password_reset_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            code VARCHAR(10) NOT NULL,
            user_id INT NOT NULL,
            expires_at DATETIME NOT NULL,
            used TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_code (code)
          )
        `);

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Set expiration to 15 minutes from now
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        // Invalidate any previous codes for this email
        await client.execute(
          'UPDATE ai_agente.t_password_reset_codes SET used = 1 WHERE email = ? AND used = 0',
          [email.trim().toLowerCase()]
        );

        // Insert new code
        await client.execute(
          'INSERT INTO ai_agente.t_password_reset_codes (email, code, user_id, expires_at) VALUES (?, ?, ?, ?)',
          [email.trim().toLowerCase(), code, userId, expiresAtStr]
        );

        console.log(`Reset code created for email: ${email}`);
        result = { success: true, code };
        break;
      }

      case 'verify_reset_code': {
        const { email, code } = body as { email?: string; code?: string };
        
        if (!email || !code) {
          return new Response(
            JSON.stringify({ error: 'E-mail e código são obrigatórios', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Verifying reset code for email: ${email}`);

        const codes = await client.query(
          `SELECT rc.*, u.username 
           FROM ai_agente.t_password_reset_codes rc
           JOIN ai_agente.t_users_dachser u ON rc.user_id = u.id
           WHERE rc.email = ? AND rc.code = ? AND rc.used = 0 AND rc.expires_at > NOW()
           ORDER BY rc.created_at DESC
           LIMIT 1`,
          [email.trim().toLowerCase(), code.trim()]
        );

        if (!codes || codes.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Código inválido ou expirado', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const codeRecord = codes[0];
        
        // Mark code as used
        await client.execute(
          'UPDATE ai_agente.t_password_reset_codes SET used = 1 WHERE id = ?',
          [codeRecord.id]
        );

        result = { 
          success: true, 
          user: {
            id: codeRecord.user_id,
            username: codeRecord.username,
            email: codeRecord.email
          }
        };
        break;
      }

      case 'reset_password_by_email': {
        const { email, password: newPassword } = body as { email?: string; password?: string };
        
        if (!email || !newPassword) {
          return new Response(
            JSON.stringify({ error: 'E-mail e nova senha são obrigatórios', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (newPassword.length < 6) {
          return new Response(
            JSON.stringify({ error: 'A senha deve ter pelo menos 6 caracteres', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user by email first
        const users = await client.query(
          'SELECT id, username FROM ai_agente.t_users_dachser WHERE email = ?',
          [email.trim().toLowerCase()]
        );

        if (!users || users.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Usuário não encontrado', success: false }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hash new password
        const newPasswordHash = bcrypt.hashSync(newPassword);

        // Update password
        await client.execute(
          `UPDATE ai_agente.t_users_dachser 
           SET password_hash = ?, must_change_password = 0 
           WHERE email = ?`,
          [newPasswordHash, email.trim().toLowerCase()]
        );

        console.log(`Password reset for email: ${email}`);
        result = { 
          success: true, 
          message: 'Senha alterada com sucesso',
          username: users[0].username
        };
        break;
      }

      // ==================== APPROVED EXAMPLES (LEARNING) ====================
      case 'save_approved_example': {
        const { runId, itemId, analysisType, consignee, scenarioType, hblCount, inputSummary, resultText, approvedBy, approvedByName } = body as {
          runId?: number;
          itemId?: number;
          analysisType?: string;
          consignee?: string;
          scenarioType?: string;
          hblCount?: number;
          inputSummary?: string;
          resultText?: string;
          approvedBy?: number;
          approvedByName?: string;
        };

        if (!runId || !itemId || !analysisType || !resultText) {
          return new Response(
            JSON.stringify({ error: 'runId, itemId, analysisType, and resultText are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if example already exists for this run
        const existingExample = await client.query(
          `SELECT id FROM ai_agente.t_dachser_sea_approved_examples WHERE run_id = ? LIMIT 1`,
          [runId]
        );

        if (existingExample && existingExample.length > 0) {
          // Update existing example
          await client.execute(
            `UPDATE ai_agente.t_dachser_sea_approved_examples 
             SET result_text = ?, scenario_type = ?, hbl_count = ?, input_summary = ?, 
                 approved_by = ?, approved_by_name = ?, approved_at = NOW(), is_active = TRUE
             WHERE run_id = ?`,
            [resultText, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', approvedBy || null, approvedByName || null, runId]
          );
          console.log(`Updated approved example for run ${runId}`);
          result = { success: true, action: 'updated', id: existingExample[0].id };
        } else {
          // Insert new example
          await client.execute(
            `INSERT INTO ai_agente.t_dachser_sea_approved_examples 
             (run_id, item_id, analysis_type, consignee, scenario_type, hbl_count, input_summary, result_text, approved_by, approved_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [runId, itemId, analysisType, consignee || null, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', resultText, approvedBy || null, approvedByName || null]
          );
          
          const lastId = await client.query('SELECT LAST_INSERT_ID() as id');
          console.log(`Saved new approved example for run ${runId}`);
          result = { success: true, action: 'inserted', id: lastId[0]?.id };
        }
        break;
      }

      case 'get_approved_examples': {
        const { analysisType, hblCount, limit: exLimit } = body as {
          analysisType?: string;
          hblCount?: number;
          limit?: number;
        };

        if (!analysisType) {
          return new Response(
            JSON.stringify({ error: 'analysisType is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const maxExamples = Math.min(exLimit || 3, 5);
        
        // Get relevant examples prioritizing:
        // 1. Same analysis type
        // 2. Same or similar HBL count
        // 3. Higher effectiveness score
        // 4. More recent approvals
        const examples = await client.query(
          `SELECT id, run_id, analysis_type, scenario_type, hbl_count, consignee, 
                  input_summary, result_text, approved_by_name, approved_at, 
                  usage_count, effectiveness_score
           FROM ai_agente.t_dachser_sea_approved_examples 
           WHERE analysis_type = ? 
             AND is_active = TRUE
             AND effectiveness_score >= 50
           ORDER BY 
             CASE WHEN hbl_count = ? THEN 0 ELSE 1 END,
             effectiveness_score DESC,
             approved_at DESC
           LIMIT ?`,
          [analysisType, hblCount || 1, maxExamples]
        );

        // Increment usage count for retrieved examples
        if (examples && examples.length > 0) {
          const exampleIds = examples.map((e: any) => e.id);
          await client.execute(
            `UPDATE ai_agente.t_dachser_sea_approved_examples 
             SET usage_count = usage_count + 1, last_used_at = NOW() 
             WHERE id IN (${exampleIds.join(',')})`,
            []
          );
        }

        console.log(`Retrieved ${examples?.length || 0} approved examples for ${analysisType} with ${hblCount} HBLs`);
        result = { success: true, examples: examples || [] };
        break;
      }

      case 'update_example_effectiveness': {
        const { exampleId, success: wasSuccessful } = body as {
          exampleId?: number;
          success?: boolean;
        };

        if (!exampleId) {
          return new Response(
            JSON.stringify({ error: 'exampleId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (wasSuccessful) {
          // Increase effectiveness (max 100)
          await client.execute(
            `UPDATE ai_agente.t_dachser_sea_approved_examples 
             SET effectiveness_score = LEAST(effectiveness_score + 2, 100)
             WHERE id = ?`,
            [exampleId]
          );
        } else {
          // Decrease effectiveness, deactivate if too low
          await client.execute(
            `UPDATE ai_agente.t_dachser_sea_approved_examples 
             SET effectiveness_score = GREATEST(effectiveness_score - 5, 0),
                 is_active = CASE WHEN effectiveness_score - 5 < 30 THEN FALSE ELSE is_active END
             WHERE id = ?`,
            [exampleId]
          );
        }

        console.log(`Updated effectiveness for example ${exampleId}: success=${wasSuccessful}`);
        result = { success: true };
        break;
      }

      case 'list_approved_examples': {
        const { analysisType: filterType, isActive: filterActive, limit: listLimit, offset: listOffset } = body as {
          analysisType?: string;
          isActive?: boolean;
          limit?: number;
          offset?: number;
        };

        let query = `SELECT id, run_id, item_id, analysis_type, scenario_type, hbl_count, 
                            consignee, approved_by_name, approved_at, is_active, 
                            usage_count, effectiveness_score, last_used_at
                     FROM ai_agente.t_dachser_sea_approved_examples WHERE 1=1`;
        const params: (string | number | boolean)[] = [];

        if (filterType) {
          query += ` AND analysis_type = ?`;
          params.push(filterType);
        }
        if (filterActive !== undefined) {
          query += ` AND is_active = ?`;
          params.push(filterActive ? 1 : 0);
        }

        query += ` ORDER BY approved_at DESC LIMIT ? OFFSET ?`;
        params.push(listLimit || 20, listOffset || 0);

        const examples = await client.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM ai_agente.t_dachser_sea_approved_examples WHERE 1=1`;
        const countParams: (string | number | boolean)[] = [];
        if (filterType) {
          countQuery += ` AND analysis_type = ?`;
          countParams.push(filterType);
        }
        if (filterActive !== undefined) {
          countQuery += ` AND is_active = ?`;
          countParams.push(filterActive ? 1 : 0);
        }
        const countResult = await client.query(countQuery, countParams);

        result = { 
          success: true, 
          examples: examples || [], 
          total: countResult[0]?.total || 0 
        };
        break;
      }

      case 'toggle_example_active': {
        const { exampleId, isActive: setActive } = body as {
          exampleId?: number;
          isActive?: boolean;
        };

        if (!exampleId) {
          return new Response(
            JSON.stringify({ error: 'exampleId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE ai_agente.t_dachser_sea_approved_examples SET is_active = ? WHERE id = ?`,
          [setActive ? 1 : 0, exampleId]
        );

        console.log(`Toggled example ${exampleId} active status to ${setActive}`);
        result = { success: true };
        break;
      }

      case 'delete_approved_example': {
        const { exampleId } = body as { exampleId?: number };

        if (!exampleId) {
          return new Response(
            JSON.stringify({ error: 'exampleId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `DELETE FROM ai_agente.t_dachser_sea_approved_examples WHERE id = ?`,
          [exampleId]
        );

        console.log(`Deleted approved example ${exampleId}`);
        result = { success: true };
        break;
      }

      // ==================== FATURAS DO DIA ====================
      case 'get_faturas_do_dia': {
        console.log('Fetching faturas do dia...');
        
        // Ensure linha_digitavel column exists
        try {
          await client.execute(`
            ALTER TABLE dados_dachser.t_vouchers 
            ADD COLUMN IF NOT EXISTS linha_digitavel VARCHAR(60) DEFAULT NULL
          `);
        } catch (alterErr) {
          console.log('Column might already exist:', alterErr);
        }

        const faturas = await client.query(`
          SELECT 
            v.id,
            v.numero_spo,
            v.fornecedor,
            v.cnpj_fornecedor,
            v.valor,
            v.vencimento,
            v.forma_pagamento,
            v.status_baixa,
            v.etapa_atual,
            v.linha_digitavel,
            v.remessa
          FROM dados_dachser.t_vouchers v
          WHERE DATE(v.vencimento) = CURDATE()
            AND v.etapa_atual IN ('FINANCEIRO', 'ROBO')
          ORDER BY v.vencimento ASC, v.fornecedor ASC
        `);

        console.log(`Found ${faturas?.length || 0} faturas do dia`);
        result = { success: true, data: faturas || [] };
        break;
      }

      case 'get_dados_bancarios_fornecedor': {
        const { cnpj: cnpjFornecedor } = body as { cnpj?: string };
        
        if (!cnpjFornecedor) {
          return new Response(
            JSON.stringify({ error: 'CNPJ é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Fetching dados bancários for CNPJ:', cnpjFornecedor);
        
        const dados = await client.query(`
          SELECT 
            banco,
            agencia,
            digito_agencia,
            conta_corrente,
            digito_conta,
            razao_social,
            cnpj
          FROM dados_dachser.t_dados_financeiro_pag
          WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?
          LIMIT 1
        `, [cnpjFornecedor.replace(/\D/g, '')]);

        if (dados && dados.length > 0) {
          result = { success: true, data: dados[0] };
        } else {
          result = { success: false, error: 'Dados bancários não encontrados' };
        }
        break;
      }

      case 'insert_dados_rm': {
        const { 
          id_rm: idRm, 
          voucher_boleto: voucherBoleto, 
          forma_pag: formaPag, 
          fornecedor: fornecedorRm,
          cnpj_fornecedor: cnpjFornecedorRm,
          chave_pix: chavePix,
          pix_tipo_chave: pixTipoChave
        } = body as { 
          id_rm?: string; 
          voucher_boleto?: string; 
          forma_pag?: string; 
          fornecedor?: string; 
          cnpj_fornecedor?: string;
          chave_pix?: string;
          pix_tipo_chave?: string;
        };
        
        if (!idRm) {
          return new Response(
            JSON.stringify({ error: 'id_rm é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Determine regras_forma_pag based on bank: DOC for other banks, Crédito CC for Itaú
        let regrasFormaPagFinal = "DOC (Compe)"; // Default for other banks
        
        if (cnpjFornecedorRm) {
          try {
            const dadosBancarios = await client.query(`
              SELECT banco
              FROM dados_dachser.t_dados_financeiro_pag
              WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?
              LIMIT 1
            `, [cnpjFornecedorRm.replace(/\D/g, '')]);
            
            if (dadosBancarios && dadosBancarios.length > 0) {
              const bancoUpper = (dadosBancarios[0].banco || "").toUpperCase();
              // Itaú bank codes: 341, or contains "ITAU"
              if (bancoUpper.includes("ITAU") || bancoUpper.includes("ITAÚ") || bancoUpper.includes("341")) {
                regrasFormaPagFinal = "Crédito em Conta Corrente da Mesma Titularidade";
              }
            }
            console.log(`Bank lookup for CNPJ ${cnpjFornecedorRm}: regra = ${regrasFormaPagFinal}`);
          } catch (bankErr) {
            console.log('Could not lookup bank info, using default DOC:', bankErr);
          }
        }

        console.log('Inserting into t_dados_rm:', { idRm, formaPag, fornecedorRm, regrasFormaPag: regrasFormaPagFinal, chavePix, pixTipoChave });
        
        // Drop and recreate table if it has wrong structure
        try {
          // Check if table exists with wrong id type
          const tableInfo = await client.query(`DESCRIBE dados_dachser.t_dados_rm`);
          const idColumn = tableInfo.find((col: any) => col.Field === 'id');
          if (idColumn && !idColumn.Extra?.includes('auto_increment')) {
            console.log('t_dados_rm has wrong id column type, recreating table...');
            await client.execute(`DROP TABLE dados_dachser.t_dados_rm`);
          }
        } catch (descErr) {
          console.log('Table does not exist yet, will create');
        }
        
        // Create table with proper structure (includes chave_pix and pix_tipo_chave columns)
        await client.execute(`
          CREATE TABLE IF NOT EXISTS dados_dachser.t_dados_rm (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_rm VARCHAR(50) NOT NULL,
            nf_disputa TINYINT(1) DEFAULT 0,
            voucher_boleto VARCHAR(60) DEFAULT NULL,
            chave_pix VARCHAR(255) DEFAULT NULL,
            pix_tipo_chave VARCHAR(20) DEFAULT NULL,
            forma_pag VARCHAR(50) DEFAULT NULL,
            fornecedor VARCHAR(255) DEFAULT NULL,
            regras_forma_pag VARCHAR(100) DEFAULT NULL,
            inicio_disputa DATE DEFAULT NULL,
            fim_disputa DATE DEFAULT NULL,
            responsavel_disp VARCHAR(100) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_id_rm (id_rm)
          )
        `);

        // Add columns if they don't exist (for existing tables)
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN chave_pix VARCHAR(255) DEFAULT NULL AFTER voucher_boleto`);
        } catch (alterErr) {
          // Column might already exist
        }
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN pix_tipo_chave VARCHAR(20) DEFAULT NULL AFTER chave_pix`);
        } catch (alterErr) {
          // Column might already exist
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dados_rm 
          (id_rm, nf_disputa, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, regras_forma_pag)
          VALUES (?, 0, ?, ?, ?, ?, ?, ?)
        `, [idRm, voucherBoleto || null, chavePix || null, pixTipoChave || null, formaPag || null, fornecedorRm || null, regrasFormaPagFinal]);

        console.log('Inserted into t_dados_rm successfully');
        result = { success: true };
        break;
      }

      case 'sync_baixa_remessa_to_dados_rm': {
        // Find vouchers with BAIXA_REMESSA that are not yet in t_dados_rm
        console.log('Syncing BAIXA_REMESSA vouchers to t_dados_rm...');
        
        // Get vouchers with BAIXA_REMESSA status
        const vouchersToSync = await client.query(`
          SELECT v.id, v.numero_spo, v.forma_pagamento, v.fornecedor, v.cnpj_fornecedor,
                 v.linha_digitavel, v.codigo_barras, v.chave_pix
          FROM dados_dachser.t_vouchers v
          WHERE v.status_baixa = 'BAIXA_REMESSA'
            AND v.numero_spo IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM dados_dachser.t_dados_rm r 
              WHERE r.id_rm COLLATE utf8mb4_unicode_ci = v.numero_spo COLLATE utf8mb4_unicode_ci
            )
        `);

        console.log(`Found ${vouchersToSync.length} vouchers to sync`);

        let inserted = 0;
        let errors: string[] = [];

        for (const v of vouchersToSync) {
          try {
            // Determine regras_forma_pag based on bank
            let regrasFormaPag = "DOC (Compe)";
            
            if (v.cnpj_fornecedor) {
              try {
                const dadosBancarios = await client.query(`
                  SELECT banco
                  FROM dados_dachser.t_dados_financeiro_pag
                  WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?
                  LIMIT 1
                `, [v.cnpj_fornecedor.replace(/\D/g, '')]);
                
                if (dadosBancarios && dadosBancarios.length > 0) {
                  const bancoUpper = (dadosBancarios[0].banco || "").toUpperCase();
                  if (bancoUpper.includes("ITAU") || bancoUpper.includes("ITAÚ") || bancoUpper.includes("341")) {
                    regrasFormaPag = "Crédito em Conta Corrente da Mesma Titularidade";
                  }
                }
              } catch (bankErr) {
                console.log('Could not lookup bank info:', bankErr);
              }
            }

            // Insert into t_dados_rm
            await client.execute(`
              INSERT INTO dados_dachser.t_dados_rm 
              (id_rm, nf_disputa, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, regras_forma_pag)
              VALUES (?, 0, ?, ?, ?, ?, ?, ?)
            `, [
              v.numero_spo, 
              v.linha_digitavel || v.codigo_barras || null, 
              v.chave_pix || null, 
              null, 
              v.forma_pagamento || null, 
              v.fornecedor || null, 
              regrasFormaPag
            ]);

            // Update status_integracao_rm
            await client.execute(`
              UPDATE dados_dachser.t_vouchers 
              SET status_integracao_rm = 'ENVIADO_T_DADOS_RM', updated_at = NOW() 
              WHERE id = ?
            `, [v.id]);

            inserted++;
            console.log(`Synced voucher ${v.numero_spo} to t_dados_rm`);
          } catch (insertErr: any) {
            console.error(`Error syncing voucher ${v.numero_spo}:`, insertErr);
            errors.push(`${v.numero_spo}: ${insertErr.message}`);
          }
        }

        console.log(`Sync complete: ${inserted} inserted, ${errors.length} errors`);
        result = { 
          success: true, 
          total: vouchersToSync.length, 
          inserted, 
          errors: errors.length > 0 ? errors : undefined 
        };
        break;
      }

      case 'save_linha_digitavel': {
        const { voucher_id: vId, linha_digitavel: linhaDigitavel } = body as { 
          voucher_id?: string; 
          linha_digitavel?: string; 
        };
        
        if (!vId || !linhaDigitavel) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e linha_digitavel são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Saving linha_digitavel for voucher:', vId);
        
        await client.execute(`
          UPDATE dados_dachser.t_vouchers 
          SET linha_digitavel = ?
          WHERE id = ?
        `, [linhaDigitavel, vId]);

        result = { success: true };
        break;
      }

      case 'insert_dados_financeiro_voucher': {
        const { 
          documento,
          nd,
          nome_beneficiario,
          nome_cobranca,
          numero_nf,
          numero_processo,
          modal,
          tipo_pag,
          forma_pag,
          data_emissao,
          data_vencimento,
          valor_nf,
          moeda,
          cnpj,
          razao_social,
          id_rm
        } = body as {
          documento?: string;
          nd?: string;
          nome_beneficiario?: string;
          nome_cobranca?: string;
          numero_nf?: string;
          numero_processo?: string;
          modal?: string;
          tipo_pag?: string;
          forma_pag?: string;
          data_emissao?: string;
          data_vencimento?: string;
          valor_nf?: number;
          moeda?: string;
          cnpj?: string;
          razao_social?: string;
          id_rm?: string;
        };

        console.log('Inserting into t_dados_financeiro_voucher:', { nd, documento, id_rm });

        const insertResult = await client.execute(`
          INSERT INTO dados_dachser.t_dados_financeiro_voucher (
            documento, nd, nome_beneficiario, nome_cobranca, numero_nf,
            numero_processo, modal, tipo_pag, forma_pag, data_emissao,
            data_vencimento, valor_nf, moeda, cnpj, razao_social, id_rm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          documento || null,
          nd || null,
          nome_beneficiario || null,
          nome_cobranca || null,
          numero_nf || null,
          numero_processo || null,
          modal || null,
          tipo_pag || null,
          forma_pag || null,
          data_emissao || null,
          data_vencimento || null,
          valor_nf || 0,
          moeda || 'BRL',
          cnpj || null,
          razao_social || null,
          id_rm || null
        ]);

        console.log('Insert result:', insertResult);
        result = { success: true, insertId: insertResult.lastInsertId };
        break;
      }

      // ==================== PAGAMENTOS MODULE ====================
      case 'list_pagamentos': {
        console.log('Fetching pagamentos from dados_dachser.t_vouchers');
        
        // Ensure status_integracao_rm column exists
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS status_integracao_rm VARCHAR(50) DEFAULT 'PENDENTE'`);
        } catch (alterErr) {
          console.log('status_integracao_rm column may already exist');
        }
        
        // Ensure tipo_execucao_pagamento column exists
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS tipo_execucao_pagamento VARCHAR(50) DEFAULT NULL`);
        } catch (alterErr) {
          console.log('tipo_execucao_pagamento column may already exist');
        }
        
        const { 
          page = 1, 
          perPage = 50, 
          filterVencimento,
          filterStatusPagamento,
          filterTipoExecucao,
          filterFornecedor,
          filterCobranca,
          filterFilial,
          filterMoeda,
          filterFormaPagamento,
          filterStatusIntegracaoRm
        } = body as {
          page?: number;
          perPage?: number;
          filterVencimento?: 'hoje' | 'vencidos' | 'proximos7' | 'todos';
          filterStatusPagamento?: string;
          filterTipoExecucao?: string;
          filterFornecedor?: string;
          filterCobranca?: string;
          filterFilial?: string;
          filterMoeda?: string;
          filterFormaPagamento?: string;
          filterStatusIntegracaoRm?: string;
        };

        const offset = (page - 1) * perPage;
        // Filtrar FINANCEIRO ou ROBO sem comprovante, e excluir modal ADM
        const conditions: string[] = [
          "(v.etapa_atual = 'FINANCEIRO' OR (v.etapa_atual = 'ROBO' AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_voucher_anexos a WHERE a.voucher_id = v.id AND a.tipo = 'COMPROVANTE')))",
          "(v.modal IS NULL OR v.modal <> 'ADM')"
        ];
        const params: (string | number)[] = [];

        // Date filters
        if (filterVencimento === 'hoje') {
          conditions.push("v.vencimento = CURDATE()");
        } else if (filterVencimento === 'vencidos') {
          conditions.push("v.vencimento < CURDATE()");
        } else if (filterVencimento === 'proximos7') {
          conditions.push("v.vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)");
        }

        if (filterStatusPagamento) {
          conditions.push("v.status_pagamento = ?");
          params.push(filterStatusPagamento);
        }

        if (filterTipoExecucao) {
          conditions.push("v.tipo_execucao_pagamento = ?");
          params.push(filterTipoExecucao);
        }

        if (filterFornecedor) {
          conditions.push("v.fornecedor LIKE ?");
          params.push(`%${filterFornecedor}%`);
        }

        if (filterCobranca) {
          conditions.push("v.cobranca_em_nome_de = ?");
          params.push(filterCobranca);
        }

        if (filterFilial) {
          conditions.push("v.filial = ?");
          params.push(filterFilial);
        }

        if (filterMoeda) {
          conditions.push("v.moeda = ?");
          params.push(filterMoeda);
        }

        if (filterFormaPagamento) {
          conditions.push("v.forma_pagamento = ?");
          params.push(filterFormaPagamento);
        }

        if (filterStatusIntegracaoRm) {
          conditions.push("v.status_integracao_rm = ?");
          params.push(filterStatusIntegracaoRm);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM dados_dachser.t_vouchers v ${whereClause}`,
          params
        );
        const total = Number(countResult[0]?.total || 0);

        // Get paginated data
        const vouchers = await client.query(
          `SELECT 
            v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
            v.vencimento, v.forma_pagamento, v.tipo_documento, v.cobranca_em_nome_de,
            v.filial, v.linha_digitavel, v.codigo_barras, v.status_pagamento,
            v.tipo_execucao_pagamento, v.is_pronto_para_robo, v.lote_remessa_id,
            v.status_integracao_rm, v.etapa_atual, v.status_baixa, v.created_at, v.updated_at
          FROM dados_dachser.t_vouchers v
          ${whereClause}
          ORDER BY v.vencimento ASC, v.created_at DESC
          LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        // Get summary stats with new cards
        const statsResult = await client.query(
          `SELECT 
            COUNT(*) as total,
            -- A Vencer (vencimento >= hoje)
            SUM(CASE WHEN v.vencimento >= CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN 1 ELSE 0 END) as a_vencer_count,
            SUM(CASE WHEN v.vencimento >= CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN COALESCE(v.valor, 0) ELSE 0 END) as a_vencer_valor,
            -- Vencidos (vencimento < hoje)
            SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN 1 ELSE 0 END) as vencidos_count,
            SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN COALESCE(v.valor, 0) ELSE 0 END) as vencidos_valor,
            -- Em Remessa (não pronto, tipo execução REMESSA_10H ou REMESSA_15H)
            SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as em_remessa_count,
            SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as em_remessa_valor,
            -- Manual (não pronto, tipo execução MANUAL)
            SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as manual_count,
            SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as manual_valor,
            -- Prontos Em Remessa (is_pronto = 1 E tipo_execucao IN (REMESSA_10H, REMESSA_15H))
            SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as prontos_remessa_count,
            SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_remessa_valor,
            -- Prontos Manual (is_pronto = 1 E tipo_execucao = MANUAL)
            SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as prontos_manual_count,
            SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_manual_valor,
            -- Total valor
            SUM(COALESCE(v.valor, 0)) as valor_total
          FROM dados_dachser.t_vouchers v
          WHERE (v.etapa_atual = 'FINANCEIRO' OR (v.etapa_atual = 'ROBO' AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_voucher_anexos a WHERE a.voucher_id = v.id AND a.tipo = 'COMPROVANTE')))
          AND (v.modal IS NULL OR v.modal <> 'ADM')`
        );

        result = {
          success: true,
          vouchers,
          total,
          totalPages: Math.ceil(total / perPage),
          currentPage: page,
          stats: statsResult[0] || {}
        };
        break;
      }

      case 'set_tipo_execucao_pagamento': {
        const { id: voucherId, tipo_execucao_pagamento } = body as {
          id: string;
          tipo_execucao_pagamento: string;
        };

        if (!voucherId || !tipo_execucao_pagamento) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e tipo_execucao_pagamento são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE dados_dachser.t_vouchers SET tipo_execucao_pagamento = ?, updated_at = NOW() WHERE id = ?`,
          [tipo_execucao_pagamento, voucherId]
        );

        console.log(`Updated tipo_execucao_pagamento for voucher ${voucherId} to ${tipo_execucao_pagamento}`);
        result = { success: true };
        break;
      }

      case 'set_ready_for_robo': {
        const { id: voucherId, is_pronto } = body as {
          id: string;
          is_pronto: boolean;
        };

        if (!voucherId) {
          return new Response(
            JSON.stringify({ error: 'voucher_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // First get the voucher to check tipo_execucao_pagamento
        const voucherData = await client.query(
          `SELECT tipo_execucao_pagamento FROM dados_dachser.t_vouchers WHERE id = ?`,
          [voucherId]
        );
        
        const tipoExec = voucherData?.[0]?.tipo_execucao_pagamento;
        const statusBaixa = tipoExec === 'REMESSA' ? 'BAIXA_REMESSA' : 'BAIXA_MANUAL';

        // Update voucher - if marking as ready, also update status_baixa and etapa_atual to ROBO
        await client.execute(
          `UPDATE dados_dachser.t_vouchers 
           SET is_pronto_para_robo = ?, 
               status_pagamento = CASE WHEN ? = 1 THEN 'PRONTO' ELSE status_pagamento END,
               status_baixa = CASE WHEN ? = 1 THEN ? ELSE status_baixa END,
               etapa_atual = CASE WHEN ? = 1 THEN 'ROBO' ELSE etapa_atual END,
               updated_at = NOW() 
           WHERE id = ?`,
          [is_pronto ? 1 : 0, is_pronto ? 1 : 0, is_pronto ? 1 : 0, statusBaixa, is_pronto ? 1 : 0, voucherId]
        );

        console.log(`Updated is_pronto_para_robo for voucher ${voucherId} to ${is_pronto}, status_baixa=${statusBaixa}`);
        result = { success: true };
        break;
      }

      case 'update_status_pagamento': {
        const { id: voucherId, status_pagamento } = body as {
          id: string;
          status_pagamento: string;
        };

        if (!voucherId || !status_pagamento) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e status_pagamento são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE dados_dachser.t_vouchers SET status_pagamento = ?, updated_at = NOW() WHERE id = ?`,
          [status_pagamento, voucherId]
        );

        console.log(`Updated status_pagamento for voucher ${voucherId} to ${status_pagamento}`);
        result = { success: true };
        break;
      }

      case 'update_codigo_barras': {
        const { id: voucherId, codigo_barras } = body as {
          id: string;
          codigo_barras: string;
        };

        if (!voucherId) {
          return new Response(
            JSON.stringify({ error: 'voucher_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          `UPDATE dados_dachser.t_vouchers SET codigo_barras = ?, updated_at = NOW() WHERE id = ?`,
          [codigo_barras || null, voucherId]
        );

        console.log(`Updated codigo_barras for voucher ${voucherId}`);
        result = { success: true };
        break;
      }

      case 'batch_set_tipo_execucao': {
        const { voucher_ids, tipo_execucao_pagamento } = body as {
          voucher_ids: string[];
          tipo_execucao_pagamento: string;
        };

        if (!voucher_ids || voucher_ids.length === 0 || !tipo_execucao_pagamento) {
          return new Response(
            JSON.stringify({ error: 'voucher_ids e tipo_execucao_pagamento são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const placeholders = voucher_ids.map(() => '?').join(',');
        await client.execute(
          `UPDATE dados_dachser.t_vouchers 
           SET tipo_execucao_pagamento = ?, updated_at = NOW() 
           WHERE id IN (${placeholders})`,
          [tipo_execucao_pagamento, ...voucher_ids]
        );

        console.log(`Batch updated tipo_execucao_pagamento for ${voucher_ids.length} vouchers to ${tipo_execucao_pagamento}`);
        result = { success: true, updated: voucher_ids.length };
        break;
      }

      case 'list_comprovantes': {
        console.log('Fetching comprovantes from t_voucher_anexos');
        
        const { page = 1, perPage = 100 } = body as { page?: number; perPage?: number };
        const offset = (page - 1) * perPage;
        
        const comprovantesResult = await client.execute(`
          SELECT 
            a.id,
            a.voucher_id,
            v.numero_spo,
            a.file_name,
            a.file_url,
            a.file_size,
            a.created_at,
            v.forma_pagamento,
            v.valor
          FROM dados_dachser.t_voucher_anexos a
          LEFT JOIN dados_dachser.t_vouchers v ON a.voucher_id = v.id
          WHERE a.tipo = 'COMPROVANTE'
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?
        `, [perPage, offset]);
        
        const countResult = await client.execute(`
          SELECT COUNT(*) as total 
          FROM dados_dachser.t_voucher_anexos 
          WHERE tipo = 'COMPROVANTE'
        `);
        
        const total = countResult.rows?.[0]?.total || 0;
        
        result = { 
          comprovantes: comprovantesResult.rows,
          total,
          page,
          perPage,
          totalPages: Math.ceil(total / perPage)
        };
        break;
      }

      // ==================== REMESSA MODULE ====================
      case 'create_remessa_lote': {
        const { banco, criado_por_user_id, criado_por_user_name } = body as {
          banco: string;
          criado_por_user_id?: string;
          criado_por_user_name?: string;
        };

        if (!banco) {
          return new Response(
            JSON.stringify({ error: 'banco é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const loteId = crypto.randomUUID();
        await client.execute(
          `INSERT INTO dados_dachser.t_remessa_lotes (id, banco, criado_por_user_id, criado_por_user_name) 
           VALUES (?, ?, ?, ?)`,
          [loteId, banco, criado_por_user_id || null, criado_por_user_name || null]
        );

        console.log(`Created remessa lote ${loteId} for banco ${banco}`);
        result = { success: true, loteId };
        break;
      }

      case 'add_itens_remessa': {
        const { lote_id, voucher_ids } = body as {
          lote_id: string;
          voucher_ids: string[];
        };

        if (!lote_id || !voucher_ids || voucher_ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'lote_id e voucher_ids são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get voucher data for the items
        const placeholders = voucher_ids.map(() => '?').join(',');
        const vouchers = await client.query(
          `SELECT id, valor, vencimento, linha_digitavel, codigo_barras 
           FROM dados_dachser.t_vouchers WHERE id IN (${placeholders})`,
          voucher_ids
        );

        let insertedCount = 0;
        for (const v of vouchers) {
          const itemId = crypto.randomUUID();
          try {
            await client.execute(
              `INSERT INTO dados_dachser.t_remessa_itens 
               (id, lote_id, voucher_id, valor, vencimento, linha_digitavel, codigo_barras) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [itemId, lote_id, v.id, v.valor, v.vencimento, v.linha_digitavel, v.codigo_barras]
            );

            // Update voucher to link to lote
            await client.execute(
              `UPDATE dados_dachser.t_vouchers 
               SET lote_remessa_id = ?, status_pagamento = 'EM_REMESSA', updated_at = NOW() 
               WHERE id = ?`,
              [lote_id, v.id]
            );

            insertedCount++;
          } catch (e) {
            console.log(`Failed to add voucher ${v.id} to lote: ${e}`);
          }
        }

        // Update lote totals
        await client.execute(
          `UPDATE dados_dachser.t_remessa_lotes 
           SET total_itens = (SELECT COUNT(*) FROM dados_dachser.t_remessa_itens WHERE lote_id = ?),
               valor_total = (SELECT COALESCE(SUM(valor), 0) FROM dados_dachser.t_remessa_itens WHERE lote_id = ?),
               updated_at = NOW()
           WHERE id = ?`,
          [lote_id, lote_id, lote_id]
        );

        console.log(`Added ${insertedCount} items to remessa lote ${lote_id}`);
        result = { success: true, insertedCount };
        break;
      }

      case 'remove_item_remessa': {
        const { item_id, voucher_id } = body as {
          item_id?: string;
          voucher_id?: string;
        };

        if (!item_id && !voucher_id) {
          return new Response(
            JSON.stringify({ error: 'item_id ou voucher_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the lote_id before removing
        let loteId: string | null = null;
        if (item_id) {
          const itemResult = await client.query(
            `SELECT lote_id, voucher_id FROM dados_dachser.t_remessa_itens WHERE id = ?`,
            [item_id]
          );
          if (itemResult.length > 0) {
            loteId = itemResult[0].lote_id;
            await client.execute(`DELETE FROM dados_dachser.t_remessa_itens WHERE id = ?`, [item_id]);
            await client.execute(
              `UPDATE dados_dachser.t_vouchers 
               SET lote_remessa_id = NULL, status_pagamento = 'PENDENTE_DADOS', updated_at = NOW() 
               WHERE id = ?`,
              [itemResult[0].voucher_id]
            );
          }
        } else if (voucher_id) {
          const itemResult = await client.query(
            `SELECT lote_id FROM dados_dachser.t_remessa_itens WHERE voucher_id = ?`,
            [voucher_id]
          );
          if (itemResult.length > 0) {
            loteId = itemResult[0].lote_id;
          }
          await client.execute(`DELETE FROM dados_dachser.t_remessa_itens WHERE voucher_id = ?`, [voucher_id]);
          await client.execute(
            `UPDATE dados_dachser.t_vouchers 
             SET lote_remessa_id = NULL, status_pagamento = 'PENDENTE_DADOS', updated_at = NOW() 
             WHERE id = ?`,
            [voucher_id]
          );
        }

        // Update lote totals if we found a lote
        if (loteId) {
          await client.execute(
            `UPDATE dados_dachser.t_remessa_lotes 
             SET total_itens = (SELECT COUNT(*) FROM dados_dachser.t_remessa_itens WHERE lote_id = ?),
                 valor_total = (SELECT COALESCE(SUM(valor), 0) FROM dados_dachser.t_remessa_itens WHERE lote_id = ?),
                 updated_at = NOW()
             WHERE id = ?`,
            [loteId, loteId, loteId]
          );
        }

        console.log(`Removed item from remessa lote`);
        result = { success: true };
        break;
      }

      case 'update_lote_status': {
        const { lote_id, status_lote, arquivo_remessa_url, arquivo_retorno_url } = body as {
          lote_id: string;
          status_lote: string;
          arquivo_remessa_url?: string;
          arquivo_retorno_url?: string;
        };

        if (!lote_id || !status_lote) {
          return new Response(
            JSON.stringify({ error: 'lote_id e status_lote são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let updateQuery = `UPDATE dados_dachser.t_remessa_lotes SET status_lote = ?, updated_at = NOW()`;
        const updateParams: (string | null)[] = [status_lote];

        if (arquivo_remessa_url !== undefined) {
          updateQuery += `, arquivo_remessa_url = ?`;
          updateParams.push(arquivo_remessa_url);
        }

        if (arquivo_retorno_url !== undefined) {
          updateQuery += `, arquivo_retorno_url = ?`;
          updateParams.push(arquivo_retorno_url);
        }

        updateQuery += ` WHERE id = ?`;
        updateParams.push(lote_id);

        await client.execute(updateQuery, updateParams);

        console.log(`Updated remessa lote ${lote_id} status to ${status_lote}`);
        result = { success: true };
        break;
      }

      case 'get_remessa_lote_by_id': {
        const { lote_id } = body as { lote_id: string };

        if (!lote_id) {
          return new Response(
            JSON.stringify({ error: 'lote_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const lotes = await client.query(
          `SELECT * FROM dados_dachser.t_remessa_lotes WHERE id = ?`,
          [lote_id]
        );

        if (lotes.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Lote não encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const itens = await client.query(
          `SELECT ri.*, v.numero_spo, v.fornecedor, v.forma_pagamento
           FROM dados_dachser.t_remessa_itens ri
           LEFT JOIN dados_dachser.t_vouchers v ON ri.voucher_id = v.id
           WHERE ri.lote_id = ?
           ORDER BY ri.created_at ASC`,
          [lote_id]
        );

        result = { success: true, lote: lotes[0], itens };
        break;
      }

      case 'list_remessa_lotes': {
        const { page = 1, perPage = 20, filterStatus, filterBanco } = body as {
          page?: number;
          perPage?: number;
          filterStatus?: string;
          filterBanco?: string;
        };

        const offset = (page - 1) * perPage;
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (filterStatus) {
          conditions.push("status_lote = ?");
          params.push(filterStatus);
        }

        if (filterBanco) {
          conditions.push("banco = ?");
          params.push(filterBanco);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM dados_dachser.t_remessa_lotes ${whereClause}`,
          params
        );
        const total = Number(countResult[0]?.total || 0);

        const lotes = await client.query(
          `SELECT * FROM dados_dachser.t_remessa_lotes 
           ${whereClause}
           ORDER BY data_criacao DESC
           LIMIT ? OFFSET ?`,
          [...params, perPage, offset]
        );

        result = { success: true, lotes, total, totalPages: Math.ceil(total / perPage), currentPage: page };
        break;
      }

      // ==================== CRASS MODULE ====================
      case 'upload_crass': {
        const { arquivo_url, arquivo_nome, uploaded_by_user_id, uploaded_by_user_name, checksum } = body as {
          arquivo_url: string;
          arquivo_nome: string;
          uploaded_by_user_id?: string;
          uploaded_by_user_name?: string;
          checksum?: string;
        };

        if (!arquivo_url || !arquivo_nome) {
          return new Response(
            JSON.stringify({ error: 'arquivo_url e arquivo_nome são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark all existing as not vigente
        await client.execute(
          `UPDATE dados_dachser.t_crass SET is_vigente = 0 WHERE is_vigente = 1`
        );

        // Insert new CRASS
        const crassId = crypto.randomUUID();
        await client.execute(
          `INSERT INTO dados_dachser.t_crass (id, arquivo_url, arquivo_nome, uploaded_by_user_id, uploaded_by_user_name, checksum, is_vigente) 
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [crassId, arquivo_url, arquivo_nome, uploaded_by_user_id || null, uploaded_by_user_name || null, checksum || null]
        );

        console.log(`Uploaded new CRASS ${crassId}: ${arquivo_nome}`);
        result = { success: true, crassId };
        break;
      }

      case 'get_crass_vigente': {
        const crassResult = await client.query(
          `SELECT * FROM dados_dachser.t_crass WHERE is_vigente = 1 LIMIT 1`
        );

        result = { success: true, crass: crassResult.length > 0 ? crassResult[0] : null };
        break;
      }

      case 'list_crass_historico': {
        const { page = 1, perPage = 20 } = body as { page?: number; perPage?: number };
        const offset = (page - 1) * perPage;

        const countResult = await client.query(`SELECT COUNT(*) as total FROM dados_dachser.t_crass`);
        const total = Number(countResult[0]?.total || 0);

        const crassItems = await client.query(
          `SELECT * FROM dados_dachser.t_crass ORDER BY data_upload DESC LIMIT ? OFFSET ?`,
          [perPage, offset]
        );

        result = { success: true, items: crassItems, total, totalPages: Math.ceil(total / perPage), currentPage: page };
        break;
      }

      // ==================== ENHANCED LOGS ====================
      case 'save_voucher_log_extended': {
        const { 
          voucher_id, 
          user_id, 
          user_name, 
          acao, 
          detalhe,
          origin = 'UI',
          entity_type = 'VOUCHER',
          event_type,
          payload_json
        } = body as {
          voucher_id: string;
          user_id?: string;
          user_name?: string;
          acao: string;
          detalhe?: string;
          origin?: string;
          entity_type?: string;
          event_type?: string;
          payload_json?: object;
        };

        if (!voucher_id || !acao) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e acao são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const logId = crypto.randomUUID();
        await client.execute(
          `INSERT INTO dados_dachser.t_voucher_logs 
           (id, voucher_id, user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            logId, 
            voucher_id, 
            user_id || null, 
            user_name || null, 
            acao, 
            detalhe || null,
            origin,
            entity_type,
            event_type || null,
            payload_json ? JSON.stringify(payload_json) : null
          ]
        );

        console.log(`Saved extended log for voucher ${voucher_id}: ${acao}`);
        result = { success: true, logId };
        break;
      }

      case 'update_status_integracao_rm': {
        const { voucher_id, status_integracao_rm } = body;
        if (!voucher_id || !status_integracao_rm) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e status_integracao_rm são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Ensure the column exists
        try {
          await client.query(`
            ALTER TABLE dados_dachser.t_vouchers 
            ADD COLUMN IF NOT EXISTS status_integracao_rm VARCHAR(50) DEFAULT 'PENDENTE'
          `);
        } catch (alterErr) {
          console.log('Note: ALTER TABLE might have failed (column may already exist)');
        }

        await client.query(
          `UPDATE dados_dachser.t_vouchers SET status_integracao_rm = ?, updated_at = NOW() WHERE id = ?`,
          [status_integracao_rm, voucher_id]
        );

        console.log(`Updated status_integracao_rm to ${status_integracao_rm} for voucher ${voucher_id}`);
        result = { success: true };
        break;
      }

      // ==================== VOUCHERS REPORT EXPORT ====================
      case 'export_vouchers_report': {
        const {
          etapa,
          statusBaixa,
          cobrancaEmNomeDe,
          statusIntegracaoRm,
          tipoExecucaoPagamento,
          dataInicio,
          dataFim,
        } = body as {
          etapa?: string;
          statusBaixa?: string;
          cobrancaEmNomeDe?: string;
          statusIntegracaoRm?: string;
          tipoExecucaoPagamento?: string;
          dataInicio?: string;
          dataFim?: string;
        };

        let whereConditions: string[] = [];
        let params: (string | number)[] = [];

        if (etapa && etapa !== 'all') {
          whereConditions.push('v.etapa_atual = ?');
          params.push(etapa);
        }

        if (statusBaixa && statusBaixa !== 'all') {
          whereConditions.push('v.status_baixa = ?');
          params.push(statusBaixa);
        }

        if (cobrancaEmNomeDe && cobrancaEmNomeDe !== 'all') {
          whereConditions.push('v.cobranca_em_nome_de = ?');
          params.push(cobrancaEmNomeDe);
        }

        if (statusIntegracaoRm && statusIntegracaoRm !== 'all') {
          whereConditions.push('v.status_integracao_rm = ?');
          params.push(statusIntegracaoRm);
        }

        if (tipoExecucaoPagamento && tipoExecucaoPagamento !== 'all') {
          whereConditions.push('v.tipo_execucao_pagamento = ?');
          params.push(tipoExecucaoPagamento);
        }

        if (dataInicio) {
          whereConditions.push('v.created_at >= ?');
          params.push(dataInicio);
        }

        if (dataFim) {
          whereConditions.push('v.created_at <= ?');
          params.push(dataFim + ' 23:59:59');
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const query = `
          SELECT 
            v.*,
            u_criado.username AS criado_por_username,
            u_operacao.username AS responsavel_operacao_username,
            u_fiscal.username AS responsavel_fiscal_username,
            u_financeiro.username AS responsavel_financeiro_username,
            u_supervisor.username AS responsavel_supervisor_username
          FROM dados_dachser.t_vouchers v
          LEFT JOIN ai_agente.t_users_dachser u_criado ON v.criado_por_user_id = u_criado.id
          LEFT JOIN ai_agente.t_users_dachser u_operacao ON v.responsavel_operacao_user_id = u_operacao.id
          LEFT JOIN ai_agente.t_users_dachser u_fiscal ON v.responsavel_fiscal_user_id = u_fiscal.id
          LEFT JOIN ai_agente.t_users_dachser u_financeiro ON v.responsavel_financeiro_user_id = u_financeiro.id
          LEFT JOIN ai_agente.t_users_dachser u_supervisor ON v.responsavel_supervisor_user_id = u_supervisor.id
          ${whereClause}
          ORDER BY v.created_at DESC
          LIMIT 5000
        `;

        console.log('Export report query:', query);
        console.log('Export report params:', params);

        const vouchers = await client.query(query, params);

        result = { success: true, vouchers };
        console.log(`Export report returned ${vouchers.length} vouchers`);
        break;
      }

      // ==================== PENDING VOUCHERS FOR DAILY REPORT ====================
      case 'get_pending_vouchers_for_report': {
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        const cutoffDate = twentyFourHoursAgo.toISOString().replace('T', ' ').substring(0, 19);

        const query = `
          SELECT 
            v.id,
            v.numero_spo,
            v.etapa_atual,
            v.vencimento,
            v.updated_at,
            v.urgencia_tipo,
            v.criado_por_user_id,
            v.status_integracao_rm,
            v.fornecedor,
            v.valor,
            v.moeda
          FROM dados_dachser.t_vouchers v
          WHERE v.updated_at < ?
            AND v.etapa_atual != 'CONCLUIDO'
          ORDER BY v.etapa_atual, v.vencimento ASC
        `;

        const pendingVouchers = await client.query(query, [cutoffDate]);

        result = { success: true, vouchers: pendingVouchers };
        console.log(`Found ${pendingVouchers.length} pending vouchers for daily report`);
        break;
      }

      // ==================== ROBO COMPROVANTES ====================
      case 'find_voucher_by_spo': {
        const { numero_spo } = body as { numero_spo: string };
        console.log('Finding voucher by SPO:', numero_spo);
        
        if (!numero_spo) {
          return new Response(
            JSON.stringify({ error: 'numero_spo é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const vouchers = await client.query(`
          SELECT 
            id, numero_spo, fornecedor, valor, vencimento, etapa_atual, 
            status_comprovante, cobranca_em_nome_de, moeda
          FROM dados_dachser.t_vouchers
          WHERE numero_spo = ? OR numero_spo LIKE ?
          ORDER BY created_at DESC
          LIMIT 5
        `, [numero_spo, `%${numero_spo}%`]);

        result = { success: true, vouchers: vouchers || [] };
        console.log(`Found ${vouchers?.length || 0} vouchers for SPO ${numero_spo}`);
        break;
      }

      case 'find_voucher_by_nd': {
        const { numero_nd } = body as { numero_nd: string };
        console.log('Finding voucher by ND:', numero_nd);
        
        if (!numero_nd) {
          return new Response(
            JSON.stringify({ error: 'numero_nd é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ND is stored in id_rm or can be searched in processo_id
        const vouchers = await client.query(`
          SELECT 
            id, numero_spo, fornecedor, valor, vencimento, etapa_atual,
            status_comprovante, cobranca_em_nome_de, moeda, id_rm, processo_id
          FROM dados_dachser.t_vouchers
          WHERE id_rm = ? OR id_rm LIKE ? OR processo_id LIKE ?
          ORDER BY created_at DESC
          LIMIT 5
        `, [numero_nd, `%${numero_nd}%`, `%${numero_nd}%`]);

        result = { success: true, vouchers: vouchers || [] };
        console.log(`Found ${vouchers?.length || 0} vouchers for ND ${numero_nd}`);
        break;
      }

      case 'get_vouchers_for_comprovante': {
        // Get vouchers that are in FINANCEIRO stage and need comprovantes
        const { search, limit = 50 } = body as { search?: string; limit?: number };
        console.log('Fetching vouchers for comprovante attachment');
        
        let whereConditions = [`etapa_atual = 'FINANCEIRO'`];
        let params: any[] = [];
        
        if (search) {
          whereConditions.push('(numero_spo LIKE ? OR fornecedor LIKE ? OR id_rm LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const vouchers = await client.query(`
          SELECT 
            id, numero_spo, fornecedor, valor, vencimento, etapa_atual,
            status_comprovante, cobranca_em_nome_de, moeda, id_rm
          FROM dados_dachser.t_vouchers
          WHERE ${whereClause}
          ORDER BY vencimento ASC
          LIMIT ?
        `, [...params, limit]);

        result = { success: true, vouchers: vouchers || [] };
        console.log(`Found ${vouchers?.length || 0} vouchers for comprovante`);
        break;
      }

      case 'attach_comprovante_batch': {
        const { comprovantes } = body as {
          comprovantes: Array<{
            voucher_id: string;
            file_name: string;
            file_url: string;
            file_size?: number;
            user_id?: string;
            user_name?: string;
          }>;
        };
        
        if (!comprovantes || !Array.isArray(comprovantes) || comprovantes.length === 0) {
          return new Response(
            JSON.stringify({ error: 'comprovantes array é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Attaching ${comprovantes.length} comprovantes in batch`);
        
        const results: Array<{ voucher_id: string; success: boolean; error?: string }> = [];
        
        for (const comp of comprovantes) {
          try {
            const anexoId = crypto.randomUUID();
            
            // Insert attachment
            await client.execute(`
              INSERT INTO dados_dachser.t_voucher_anexos (
                id, voucher_id, tipo, file_name, file_url, file_size, created_at
              ) VALUES (?, ?, 'COMPROVANTE', ?, ?, ?, NOW())
            `, [anexoId, comp.voucher_id, comp.file_name, comp.file_url, comp.file_size || 0]);

            // Update voucher status_comprovante
            await client.execute(`
              UPDATE dados_dachser.t_vouchers 
              SET status_comprovante = 'ANEXADO', updated_at = NOW()
              WHERE id = ?
            `, [comp.voucher_id]);

            // Add log entry
            await client.execute(`
              INSERT INTO dados_dachser.t_voucher_logs (
                id, voucher_id, user_id, user_name, acao, detalhe, data_hora
              ) VALUES (?, ?, ?, ?, 'COMPROVANTE_ANEXADO', ?, NOW())
            `, [
              crypto.randomUUID(),
              comp.voucher_id,
              comp.user_id || null,
              comp.user_name || 'Sistema Robô',
              `Comprovante ${comp.file_name} anexado automaticamente pelo robô`
            ]);

            results.push({ voucher_id: comp.voucher_id, success: true });
          } catch (err) {
            console.error(`Error attaching comprovante to ${comp.voucher_id}:`, err);
            results.push({ 
              voucher_id: comp.voucher_id, 
              success: false, 
              error: err instanceof Error ? err.message : 'Unknown error' 
            });
          }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`Batch attach completed: ${successCount}/${comprovantes.length} successful`);
        
        result = { success: true, results, successCount, totalCount: comprovantes.length };
        break;
      }

      // ==================== VOUCHER CANCELAMENTO ====================
      case 'cancelar_voucher': {
        const { voucher_id, motivo, voucher_credito, user_id, user_name } = body as {
          voucher_id: string;
          motivo: string;
          voucher_credito: string;
          user_id?: string;
          user_name?: string;
        };

        if (!voucher_id || !motivo || !voucher_credito) {
          return new Response(
            JSON.stringify({ error: 'voucher_id, motivo e voucher_credito são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Canceling voucher ${voucher_id} with credit to ${voucher_credito}`);

        // First, ensure cancellation columns exist
        try {
          await client.query(`
            ALTER TABLE dados_dachser.t_vouchers 
            ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT,
            ADD COLUMN IF NOT EXISTS cancelamento_voucher_credito VARCHAR(100),
            ADD COLUMN IF NOT EXISTS cancelado_por_user_id VARCHAR(36),
            ADD COLUMN IF NOT EXISTS cancelado_por_user_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS cancelado_em DATETIME
          `);
        } catch (alterErr) {
          console.log('Note: Cancellation columns may already exist');
        }

        // Update voucher to CANCELADO
        await client.execute(`
          UPDATE dados_dachser.t_vouchers 
          SET 
            etapa_atual = 'CANCELADO',
            cancelamento_motivo = ?,
            cancelamento_voucher_credito = ?,
            cancelado_por_user_id = ?,
            cancelado_por_user_name = ?,
            cancelado_em = NOW(),
            updated_at = NOW()
          WHERE id = ?
        `, [motivo, voucher_credito, user_id || null, user_name || 'Sistema', voucher_id]);

        // Log the cancellation
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_logs (
            id, voucher_id, user_id, user_name, acao, detalhe, data_hora
          ) VALUES (?, ?, ?, ?, 'VOUCHER_CANCELADO', ?, NOW())
        `, [
          crypto.randomUUID(),
          voucher_id,
          user_id || null,
          user_name || 'Sistema',
          `Voucher cancelado. Motivo: ${motivo}. Crédito em: ${voucher_credito}`
        ]);

        console.log(`Voucher ${voucher_id} canceled successfully`);
        result = { success: true };
        break;
      }

      // ==================== VOUCHER AGRUPAMENTO (SEM MASTER) ====================
      case 'consolidar_vouchers': {
        const { voucher_ids, numero_rm, user_id, user_name } = body as {
          voucher_ids: string[];
          numero_rm: string;
          user_id?: string;
          user_name?: string;
        };

        if (!voucher_ids || voucher_ids.length < 2 || !numero_rm) {
          return new Response(
            JSON.stringify({ error: 'voucher_ids (min 2) e numero_rm são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Agrupando ${voucher_ids.length} vouchers com RM: ${numero_rm}`);

        // First, ensure consolidation column exists
        try {
          await client.query(`
            ALTER TABLE dados_dachser.t_vouchers 
            ADD COLUMN IF NOT EXISTS consolidacao_rm_numero VARCHAR(100)
          `);
        } catch (alterErr) {
          console.log('Note: Consolidation column may already exist');
        }

        // Update all vouchers with the same RM number
        for (const voucherId of voucher_ids) {
          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET 
              consolidacao_rm_numero = ?,
              updated_at = NOW()
            WHERE id = ?
          `, [numero_rm, voucherId]);

          // Log consolidation for each voucher
          await client.execute(`
            INSERT INTO dados_dachser.t_voucher_logs (
              id, voucher_id, user_id, user_name, acao, detalhe, data_hora
            ) VALUES (?, ?, ?, ?, 'VOUCHER_AGRUPADO', ?, NOW())
          `, [
            crypto.randomUUID(),
            voucherId,
            user_id || null,
            user_name || 'Sistema',
            `Agrupado com RM: ${numero_rm}. Total de ${voucher_ids.length} vouchers no grupo.`
          ]);
        }

        console.log(`Agrupados ${voucher_ids.length} vouchers com RM: ${numero_rm}`);
        result = { success: true, rmNumero: numero_rm, vouchersCount: voucher_ids.length };
        break;
      }

      // ==================== GET VOUCHERS AGRUPADOS (POR RM) ====================
      case 'get_vouchers_agrupados': {
        const { consolidacao_rm_numero } = body as { consolidacao_rm_numero: string };
        
        if (!consolidacao_rm_numero) {
          return new Response(
            JSON.stringify({ error: 'consolidacao_rm_numero é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const agrupados = await client.query(`
          SELECT 
            id, numero_spo, fornecedor, valor, moeda, vencimento, 
            etapa_atual, consolidacao_rm_numero
          FROM dados_dachser.t_vouchers
          WHERE consolidacao_rm_numero = ?
          ORDER BY created_at ASC
        `, [consolidacao_rm_numero]);

        result = { success: true, vouchers: agrupados || [] };
        break;
      }

      // ==================== GET VOUCHERS FILHOS (LEGADO - MANTIDO PARA COMPATIBILIDADE) ====================
      case 'get_vouchers_filhos': {
        const { master_id } = body as { master_id: string };
        
        if (!master_id) {
          return new Response(
            JSON.stringify({ error: 'master_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const filhos = await client.query(`
          SELECT 
            id, numero_spo, fornecedor, valor, moeda, vencimento, 
            etapa_atual, consolidacao_rm_numero
          FROM dados_dachser.t_vouchers
          WHERE voucher_master_id = ?
          ORDER BY created_at ASC
        `, [master_id]);

        result = { success: true, vouchers: filhos || [] };
        break;
      }

      // ==================== GET VOUCHERS PENDENTES RM ====================
      case 'get_vouchers_pendentes_rm': {
        // Busca TODOS os vouchers da t_dados_financeiro_voucher que não existem na t_vouchers
        // Excluindo apenas registros onde nome_beneficiario contém "dachser"
        console.log('Fetching ALL pending RM vouchers not yet in esteira (excluding Dachser beneficiaries)...');

        const pendentes = await client.query(`
          SELECT 
            dfv.id_rm,
            dfv.nd,
            dfv.documento,
            dfv.nome_beneficiario,
            dfv.nome_cobranca,
            dfv.numero_nf,
            dfv.numero_processo,
            dfv.modal,
            dfv.tipo_pag,
            dfv.forma_pag,
            dfv.data_emissao,
            dfv.data_vencimento,
            dfv.valor_nf,
            dfv.moeda,
            dfv.cnpj,
            dfv.razao_social
          FROM dados_dachser.t_dados_financeiro_voucher dfv
          LEFT JOIN dados_dachser.t_vouchers v ON dfv.nd COLLATE utf8mb4_unicode_ci = v.numero_spo COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
          WHERE v.id IS NULL
            AND b.IdLancamentoRM IS NULL
            AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
            AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
          ORDER BY dfv.data_vencimento ASC
        `);

        console.log(`Found ${pendentes?.length || 0} pending RM vouchers (excluding Dachser)`);
        result = { success: true, data: pendentes || [], count: pendentes?.length || 0 };
        break;
      }

      // ==================== GET HISTORICO BAIXAS ====================
      case 'get_historico_baixas': {
        // Busca vouchers que já foram baixados (existem na tbaixas)
        const periodoBody = body as unknown as { periodo?: string };
        const periodo = periodoBody.periodo || '30dias';
        
        let dateFilter = '';
        if (periodo === 'hoje') {
          dateFilter = `AND DATE(b.DataDaBaixa) = CURDATE()`;
        } else if (periodo === '7dias') {
          dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
        } else if (periodo === '30dias') {
          dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
        } else if (periodo === '90dias') {
          dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;
        }
        // 'all' = sem filtro de data
        
        console.log(`Fetching historico baixas (periodo: ${periodo})...`);

        const baixas = await client.query(`
          SELECT 
            b.IdLancamentoRM,
            b.IdBaixa,
            b.TipoPagRec as tipo_pag_rec,
            b.ValorBaixado as valor_baixa,
            b.DataDaBaixa as data_baixa,
            b.UsuarioBaixa as usuario_baixa,
            b.StatusLan as status_lan,
            dfv.nd,
            dfv.documento,
            dfv.nome_beneficiario,
            dfv.nome_cobranca,
            dfv.numero_processo,
            dfv.forma_pag,
            dfv.data_vencimento,
            dfv.valor_nf,
            dfv.moeda
          FROM dados_dachser.tbaixas b
          LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv 
            ON b.IdLancamentoRM = dfv.id_rm
          WHERE 1=1 ${dateFilter}
            AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
          ORDER BY b.DataDaBaixa DESC
          LIMIT 1000
        `);

        console.log(`Found ${baixas?.length || 0} baixas`);
        result = { success: true, data: baixas || [], count: baixas?.length || 0 };
        break;
      }

      // ==================== IMPORT VOUCHER FROM RM ====================
      case 'import_voucher_from_rm': {
        // Importa um voucher pendente do RM para a esteira como OPERACAO
        const importBody = body as unknown as { 
          nd?: string; 
          user_id?: string; 
          user_name?: string;
        };
        const nd = importBody.nd;
        const user_id = importBody.user_id;
        const user_name = importBody.user_name;

        if (!nd) {
          return new Response(
            JSON.stringify({ error: 'nd (número documento) é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Buscar dados do RM
        const rmData = await client.query(`
          SELECT 
            id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf,
            numero_processo, modal, tipo_pag, forma_pag, data_emissao,
            data_vencimento, valor_nf, moeda, cnpj, razao_social
          FROM dados_dachser.t_dados_financeiro_voucher
          WHERE nd = ?
          LIMIT 1
        `, [nd]);

        if (!rmData || rmData.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Voucher não encontrado no RM' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const rm = rmData[0];
        const voucherId = crypto.randomUUID();

        // Mapear forma_pag para FormaPagamento
        const mapFormaPag = (fp: string | null): string => {
          const mapping: Record<string, string> = {
            'BOL': 'BOLETO',
            'BOLETO': 'BOLETO',
            'PIX': 'PIX',
            'TED': 'TRANSFERENCIA',
            'TRANSF': 'TRANSFERENCIA',
            'DEBITO': 'DEBITO',
            'CAMBIO': 'CAMBIO',
            'DARF': 'DARF',
            'GPS': 'GPS',
          };
          return mapping[(fp || '').toUpperCase()] || 'BOLETO';
        };

        // Mapear tipo_pag para TipoDocumento  
        const mapTipoDoc = (tp: string | null): string => {
          const mapping: Record<string, string> = {
            'NF': 'NOTA_FISCAL',
            'FAT': 'FATURA',
            'FATURA': 'FATURA',
            'DEM': 'DEMONSTRATIVO',
            'NFS': 'NF_SERVICO',
          };
          return mapping[(tp || '').toUpperCase()] || 'FATURA';
        };

        // Inserir na t_vouchers
        await client.execute(`
          INSERT INTO dados_dachser.t_vouchers (
            id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda,
            vencimento, data_emissao_documento, forma_pagamento, tipo_documento,
            cobranca_em_nome_de, etapa_atual, status_baixa, urgencia_tipo,
            processo_id, criado_por_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 'PENDENTE', 'NORMAL', ?, ?, NOW(), NOW())
        `, [
          voucherId,
          rm.nd,
          rm.nome_beneficiario || rm.razao_social,
          rm.cnpj,
          rm.valor_nf || 0,
          rm.moeda || 'BRL',
          rm.data_vencimento,
          rm.data_emissao,
          mapFormaPag(rm.forma_pag),
          mapTipoDoc(rm.tipo_pag),
          rm.nome_cobranca === 'CLIENTE' ? 'CLIENTE' : 'DACHSER',
          rm.numero_processo,
          user_id
        ]);

        // Log de criação
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_logs (
            id, voucher_id, user_id, user_name, acao, detalhe, data_hora
          ) VALUES (?, ?, ?, ?, 'IMPORTADO_RM', ?, NOW())
        `, [
          crypto.randomUUID(),
          voucherId,
          user_id || null,
          user_name || 'Sistema',
          `Voucher importado do RM. ND: ${rm.nd}, ID_RM: ${rm.id_rm || 'N/A'}`
        ]);

        console.log(`Imported voucher ${rm.nd} from RM as ${voucherId}`);
        result = { success: true, voucherId, numeroSPO: rm.nd };
        break;
      }

      // NOTE: update_voucher_esteira is already defined earlier in this file (around line 3735)
      // Removed duplicate case here to avoid dead code

      // ==================== API USAGE TRACKING ====================
      case 'get_api_stats': {
        // First ensure the table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_api_usage_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            api_name VARCHAR(100) NOT NULL,
            endpoint VARCHAR(500),
            method VARCHAR(10) DEFAULT 'GET',
            status_code INT,
            response_time_ms INT,
            error_message TEXT,
            user_email VARCHAR(255),
            edge_function VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_api_name (api_name),
            INDEX idx_created_at (created_at)
          )
        `);

        // Get aggregated stats per API (last 30 days)
        const stats = await client.query(`
          SELECT 
            api_name,
            COUNT(*) as total_calls,
            MAX(created_at) as last_call,
            ROUND(AVG(response_time_ms), 0) as avg_response_time_ms,
            SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) as error_count,
            ROUND(100.0 * SUM(CASE WHEN status_code < 400 AND error_message IS NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
          FROM ai_agente.t_api_usage_logs
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY api_name
          ORDER BY total_calls DESC
        `);

        // Get recent logs
        const recentLogs = await client.query(`
          SELECT id, api_name, endpoint, method, status_code, response_time_ms, created_at, user_email, edge_function, error_message
          FROM ai_agente.t_api_usage_logs
          ORDER BY created_at DESC
          LIMIT 100
        `);

        // Get daily trend data (last 30 days, grouped by date and API)
        const dailyTrend = await client.query(`
          SELECT 
            DATE(created_at) as date,
            api_name,
            COUNT(*) as calls,
            SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) as errors,
            ROUND(AVG(response_time_ms), 0) as avg_response_time
          FROM ai_agente.t_api_usage_logs
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY DATE(created_at), api_name
          ORDER BY date ASC, api_name
        `);

        // Get total calls per day (for overview chart)
        const dailyTotal = await client.query(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total_calls,
            SUM(CASE WHEN status_code >= 400 OR error_message IS NOT NULL THEN 1 ELSE 0 END) as total_errors
          FROM ai_agente.t_api_usage_logs
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `);

        // Normalize numeric values (Deno MySQL driver returns aggregates as strings)
        const normalizedStats = stats.map((row: any) => ({
          api_name: row.api_name,
          total_calls: Number(row.total_calls) || 0,
          last_call: row.last_call,
          avg_response_time_ms: row.avg_response_time_ms != null ? Number(row.avg_response_time_ms) : null,
          error_count: Number(row.error_count) || 0,
          success_rate: Number(row.success_rate) || 0,
        }));

        const normalizedDailyTrend = dailyTrend.map((row: any) => ({
          date: row.date,
          api_name: row.api_name,
          calls: Number(row.calls) || 0,
          errors: Number(row.errors) || 0,
          avg_response_time: row.avg_response_time != null ? Number(row.avg_response_time) : null,
        }));

        const normalizedDailyTotal = dailyTotal.map((row: any) => ({
          date: row.date,
          total_calls: Number(row.total_calls) || 0,
          total_errors: Number(row.total_errors) || 0,
        }));

        console.log(`[get_api_stats] Found ${normalizedStats.length} APIs, ${recentLogs.length} recent logs, ${normalizedDailyTrend.length} daily trend records`);
        result = { success: true, stats: normalizedStats, recent_logs: recentLogs, daily_trend: normalizedDailyTrend, daily_total: normalizedDailyTotal };
        break;
      }

      case 'log_api_call': {
        const { 
          api_name, 
          endpoint, 
          method, 
          status_code, 
          response_time_ms, 
          error_message, 
          user_email,
          edge_function 
        } = body;

        if (!api_name) {
          return new Response(
            JSON.stringify({ error: 'api_name é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Ensure table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_api_usage_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            api_name VARCHAR(100) NOT NULL,
            endpoint VARCHAR(500),
            method VARCHAR(10) DEFAULT 'GET',
            status_code INT,
            response_time_ms INT,
            error_message TEXT,
            user_email VARCHAR(255),
            edge_function VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_api_name (api_name),
            INDEX idx_created_at (created_at)
          )
        `);

        await client.execute(`
          INSERT INTO ai_agente.t_api_usage_logs 
          (api_name, endpoint, method, status_code, response_time_ms, error_message, user_email, edge_function)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          api_name,
          endpoint || null,
          method || 'GET',
          status_code || null,
          response_time_ms || null,
          error_message || null,
          user_email || null,
          edge_function || null
        ]);

        console.log(`[log_api_call] Logged: ${api_name} - ${status_code || 'N/A'} - ${response_time_ms}ms`);
        result = { success: true };
        break;
      }

      case 'check_api_alert_sent': {
        // Check if an API usage alert was already sent for this cycle
        const { api_name, cycle_key } = body;
        console.log(`[check_api_alert_sent] Checking: ${api_name} - ${cycle_key}`);
        
        // Ensure table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_api_alerts_sent (
            id INT AUTO_INCREMENT PRIMARY KEY,
            api_name VARCHAR(100) NOT NULL,
            cycle_key VARCHAR(50) NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_api_cycle (api_name, cycle_key)
          )
        `);
        
        const existing = await client.query(`
          SELECT id FROM ai_agente.t_api_alerts_sent 
          WHERE api_name = ? AND cycle_key = ?
          LIMIT 1
        `, [api_name, cycle_key]);
        
        const alertSent = existing && existing.length > 0;
        console.log(`[check_api_alert_sent] ${api_name} ${cycle_key}: ${alertSent ? 'ALREADY SENT' : 'NOT SENT'}`);
        
        result = { success: true, alert_sent: alertSent };
        break;
      }

      case 'mark_api_alert_sent': {
        // Mark that an API usage alert was sent for this cycle
        const { api_name, cycle_key } = body;
        console.log(`[mark_api_alert_sent] Marking: ${api_name} - ${cycle_key}`);
        
        // Ensure table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_api_alerts_sent (
            id INT AUTO_INCREMENT PRIMARY KEY,
            api_name VARCHAR(100) NOT NULL,
            cycle_key VARCHAR(50) NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_api_cycle (api_name, cycle_key)
          )
        `);
        
        // Insert or ignore if already exists
        await client.execute(`
          INSERT IGNORE INTO ai_agente.t_api_alerts_sent (api_name, cycle_key)
          VALUES (?, ?)
        `, [api_name, cycle_key]);
        
        console.log(`[mark_api_alert_sent] Marked ${api_name} ${cycle_key} as sent`);
        result = { success: true };
        break;
      }

      // ==================== VOUCHER MASTER ====================
      case 'search_vouchers_for_master': {
        // Search vouchers that can be consolidated into a master
        const { search } = body as { search?: string };
        console.log('Searching vouchers for master consolidation:', search);
        
        if (!search || search.length < 2) {
          result = { success: true, data: [] };
          break;
        }
        
        const vouchers = await client.query(`
          SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, etapa_atual, filial
          FROM dados_dachser.t_vouchers
          WHERE (numero_spo LIKE ? OR fornecedor LIKE ?)
            AND etapa_atual IN ('OPERACAO', 'A_PROCESSAR', 'FISCAL')
            AND (voucher_master_id IS NULL OR voucher_master_id = '')
            AND (is_master IS NULL OR is_master = 0)
          ORDER BY numero_spo ASC
          LIMIT 20
        `, [`%${search}%`, `%${search}%`]);
        
        result = { success: true, data: vouchers || [] };
        break;
      }

      case 'create_voucher_master': {
        // Create a master voucher consolidating multiple child vouchers
        const {
          voucher_ids,
          nome_master,
          fornecedor,
          cnpj_fornecedor,
          valor_total,
          moeda,
          vencimento,
          forma_pagamento,
          tipo_documento,
          cobranca_em_nome_de,
          filial,
          comentarios_operacao,
          criado_por_user_id,
          criado_por_user_name,
        } = body as any;

        console.log('Creating voucher master with children:', voucher_ids);

        if (!voucher_ids || !Array.isArray(voucher_ids) || voucher_ids.length < 2) {
          return new Response(
            JSON.stringify({ error: 'É necessário selecionar pelo menos 2 vouchers para consolidar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Ensure columns exist
        try {
          await client.execute(`
            ALTER TABLE dados_dachser.t_vouchers 
            ADD COLUMN IF NOT EXISTS voucher_master_id VARCHAR(36) NULL,
            ADD COLUMN IF NOT EXISTS is_master TINYINT(1) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS nome_master VARCHAR(255) NULL
          `);
        } catch (alterErr) {
          console.log('Note: ALTER TABLE might have failed (columns may already exist)');
        }

        // Generate master voucher ID and numero_spo
        const masterId = crypto.randomUUID();
        const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
        const numeroSpoMaster = `MASTER-${randomSuffix}`;

        // Calculate total value from children if not provided
        let totalValor = valor_total;
        if (!totalValor) {
          const childVouchers = await client.query(`
            SELECT SUM(valor) as total FROM dados_dachser.t_vouchers WHERE id IN (${voucher_ids.map(() => '?').join(',')})
          `, voucher_ids);
          totalValor = childVouchers?.[0]?.total || 0;
        }

        // Get earliest vencimento, origem_processo and processo_ids from children if not provided
        let venc = vencimento;
        let origemProcesso = null;
        let processoId = null;
        const childData = await client.query(`
          SELECT MIN(vencimento) as min_venc, origem_processo, processo_id 
          FROM dados_dachser.t_vouchers 
          WHERE id IN (${voucher_ids.map(() => '?').join(',')})
          GROUP BY origem_processo, processo_id
        `, voucher_ids);
        if (!venc) {
          venc = childData?.[0]?.min_venc || new Date().toISOString().split('T')[0];
        }
        origemProcesso = childData?.[0]?.origem_processo || null;
        
        // Collect unique processo_ids from all children
        const processoIds = childData
          ?.map((c: any) => c.processo_id)
          .filter((p: any) => p && p.trim())
          .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        processoId = processoIds?.length > 0 ? processoIds.join(', ') : null;
        
        // Format vencimento as YYYY-MM-DD for MariaDB DATE column
        const formatDateForMariaDB = (dateValue: any): string => {
          if (!dateValue) return new Date().toISOString().split('T')[0];
          if (typeof dateValue === 'string') {
            // If it's an ISO string, extract just the date part
            if (dateValue.includes('T')) {
              return dateValue.split('T')[0];
            }
            // Already in YYYY-MM-DD format
            return dateValue;
          }
          if (dateValue instanceof Date) {
            return dateValue.toISOString().split('T')[0];
          }
          return new Date().toISOString().split('T')[0];
        };
        
        const vencFormatted = formatDateForMariaDB(venc);

        // Create the master voucher - starts in OPERACAO for user approval
        await client.execute(`
          INSERT INTO dados_dachser.t_vouchers (
            id, numero_spo, nome_master, fornecedor, cnpj_fornecedor, valor, moeda, vencimento,
            forma_pagamento, tipo_documento, cobranca_em_nome_de, filial,
            comentarios_operacao, etapa_atual, status_baixa, status_financeiro,
            criado_por_user_id, is_master, origem_processo, processo_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 'PENDENTE', 'PENDENTE', ?, 1, ?, ?, NOW(), NOW())
        `, [
          masterId,
          numeroSpoMaster,
          nome_master || null,
          fornecedor || null,
          cnpj_fornecedor || null,
          totalValor,
          moeda || 'BRL',
          vencFormatted,
          forma_pagamento || 'BOLETO',
          tipo_documento || null,
          cobranca_em_nome_de || 'DACHSER',
          filial || null,
          comentarios_operacao || null,
          criado_por_user_id || null,
          origemProcesso,
          processoId
        ]);

        // Update all child vouchers with the master ID
        await client.execute(`
          UPDATE dados_dachser.t_vouchers 
          SET voucher_master_id = ?, updated_at = NOW()
          WHERE id IN (${voucher_ids.map(() => '?').join(',')})
        `, [masterId, ...voucher_ids]);

        // Log the master creation
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
          VALUES (?, ?, ?, ?, 'MASTER_CRIADO', ?, NOW())
        `, [
          crypto.randomUUID(),
          masterId,
          criado_por_user_id || null,
          criado_por_user_name || 'Sistema',
          `Voucher Master criado consolidando ${voucher_ids.length} vouchers: ${voucher_ids.join(', ')}`
        ]);

        // Log for each child voucher
        for (const childId of voucher_ids) {
          await client.execute(`
            INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
            VALUES (?, ?, ?, ?, 'CONSOLIDADO_EM_MASTER', ?, NOW())
          `, [
            crypto.randomUUID(),
            childId,
            criado_por_user_id || null,
            criado_por_user_name || 'Sistema',
            `Consolidado no Voucher Master: ${numeroSpoMaster}`
          ]);
        }

        console.log(`Master voucher created: ${numeroSpoMaster} with ${voucher_ids.length} children`);
        result = { success: true, masterId, numeroSpo: numeroSpoMaster, childCount: voucher_ids.length };
        break;
      }

      case 'get_voucher_filhos': {
        // Get child vouchers of a master
        const { master_id } = body as { master_id: string };
        console.log('Fetching child vouchers for master:', master_id);

        if (!master_id) {
          return new Response(
            JSON.stringify({ error: 'master_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const filhos = await client.query(`
          SELECT id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual
          FROM dados_dachser.t_vouchers 
          WHERE voucher_master_id = ?
          ORDER BY numero_spo ASC
        `, [master_id]);

        result = { success: true, data: filhos || [] };
        break;
      }

      case 'update_voucher_numero_spo': {
        // Update the numero_spo of a master voucher (fiscal action)
        const { voucher_id, novo_numero_spo, user_id, user_name } = body as any;
        console.log('Updating voucher numero_spo:', voucher_id, '->', novo_numero_spo);

        if (!voucher_id || !novo_numero_spo) {
          return new Response(
            JSON.stringify({ error: 'voucher_id e novo_numero_spo são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get old numero_spo
        const oldVoucher = await client.query(`
          SELECT numero_spo FROM dados_dachser.t_vouchers WHERE id = ?
        `, [voucher_id]);
        const oldNumero = oldVoucher?.[0]?.numero_spo || 'N/A';

        // Update numero_spo
        await client.execute(`
          UPDATE dados_dachser.t_vouchers 
          SET numero_spo = ?, updated_at = NOW()
          WHERE id = ?
        `, [novo_numero_spo, voucher_id]);

        // Log the change
        await client.execute(`
          INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
          VALUES (?, ?, ?, ?, 'NUMERO_SPO_ALTERADO', ?, NOW())
        `, [
          crypto.randomUUID(),
          voucher_id,
          user_id || null,
          user_name || 'Sistema',
          `Número SPO alterado de "${oldNumero}" para "${novo_numero_spo}"`
        ]);

        console.log(`Voucher numero_spo updated: ${oldNumero} -> ${novo_numero_spo}`);
        result = { success: true, oldNumero, newNumero: novo_numero_spo };
        break;
      }

      case 'disassemble_master_voucher': {
        // Disassemble a master voucher: restore children and optionally delete master
        const { master_id, child_ids, keep_master } = body as { 
          master_id: string; 
          child_ids?: string[];
          keep_master?: boolean;
        };
        console.log('Disassembling master voucher:', master_id, 'child_ids:', child_ids, 'keep_master:', keep_master);

        if (!master_id) {
          return new Response(
            JSON.stringify({ error: 'master_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let childrenRestored = 0;

        if (child_ids && child_ids.length > 0) {
          // Desmembrar apenas os filhos selecionados
          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET voucher_master_id = NULL, updated_at = NOW()
            WHERE id IN (${child_ids.map(() => '?').join(',')})
          `, child_ids);
          childrenRestored = child_ids.length;
        } else {
          // Desmembrar todos (comportamento original)
          const childCount = await client.query(`
            SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?
          `, [master_id]);
          childrenRestored = childCount?.[0]?.count || 0;

          await client.execute(`
            UPDATE dados_dachser.t_vouchers 
            SET voucher_master_id = NULL, updated_at = NOW()
            WHERE voucher_master_id = ?
          `, [master_id]);
        }

        // Verificar se o master deve ser excluído
        const remainingChildren = await client.query(`
          SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?
        `, [master_id]);
        const remainingCount = remainingChildren?.[0]?.count || 0;

        // Se keep_master é false OU se não há mais filhos, excluir o master
        if (!keep_master || remainingCount === 0) {
          await client.execute(`
            DELETE FROM dados_dachser.t_vouchers WHERE id = ?
          `, [master_id]);
          console.log(`Master voucher ${master_id} deleted.`);
        }

        console.log(`Master voucher ${master_id} disassembled. ${childrenRestored} children restored. ${remainingCount} remaining.`);
        result = { success: true, childrenRestored, remainingChildren: remainingCount, masterDeleted: !keep_master || remainingCount === 0 };
        break;
      }

      case 'update_master_processo_ids': {
        // Update processo_id for existing master vouchers based on children
        console.log('Updating processo_id for master vouchers');

        // Get all master vouchers without processo_id
        const masterVouchers = await client.query(`
          SELECT id, numero_spo FROM dados_dachser.t_vouchers 
          WHERE is_master = 1 AND (processo_id IS NULL OR processo_id = '')
        `);

        let updatedCount = 0;
        for (const master of masterVouchers) {
          // Get unique processo_ids from children
          const childProcessos = await client.query(`
            SELECT DISTINCT processo_id 
            FROM dados_dachser.t_vouchers 
            WHERE voucher_master_id = ? AND processo_id IS NOT NULL AND processo_id != ''
          `, [master.id]);

          const processoIds = childProcessos
            ?.map((c: any) => c.processo_id)
            .filter((p: any) => p && p.trim())
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

          if (processoIds?.length > 0) {
            const processoIdStr = processoIds.join(', ');
            await client.execute(`
              UPDATE dados_dachser.t_vouchers 
              SET processo_id = ?, updated_at = NOW()
              WHERE id = ?
            `, [processoIdStr, master.id]);
            updatedCount++;
            console.log(`Updated master ${master.numero_spo} with processo_id: ${processoIdStr}`);
          }
        }

        console.log(`Updated ${updatedCount} master vouchers with processo_id`);
        result = { success: true, updatedCount, totalMasters: masterVouchers.length };
        break;
      }

      // ==================== DEMURRAGE ====================
      case 'demurrage_get_containers': {
        const { search, risk_status, cronos_status, cronos_status_list, cliente, armador, pre_invoice_status, dispute_status, audit_status, limit = 500 } = body as any;
        console.log('Fetching demurrage containers with filters:', { search, risk_status, cronos_status, cronos_status_list, cliente, armador });

        let whereConditions = ['active = 1'];
        let params: (string | number)[] = [];

        if (search) {
          whereConditions.push('(numero LIKE ? OR mbl LIKE ? OR cliente LIKE ? OR armador LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (risk_status && risk_status !== 'all') {
          whereConditions.push('risk_status = ?');
          params.push(risk_status);
        }
        // Support for multiple cronos_status values
        if (cronos_status_list && Array.isArray(cronos_status_list) && cronos_status_list.length > 0) {
          const placeholders = cronos_status_list.map(() => '?').join(', ');
          whereConditions.push(`cronos_status IN (${placeholders})`);
          params.push(...cronos_status_list);
        } else if (cronos_status && cronos_status !== 'all') {
          whereConditions.push('cronos_status = ?');
          params.push(cronos_status);
        }
        if (cliente) {
          whereConditions.push('cliente = ?');
          params.push(cliente);
        }
        if (armador) {
          whereConditions.push('armador = ?');
          params.push(armador);
        }
        if (pre_invoice_status && pre_invoice_status !== 'all') {
          whereConditions.push('pre_invoice_status = ?');
          params.push(pre_invoice_status);
        }
        if (dispute_status && dispute_status !== 'all') {
          whereConditions.push('dispute_status = ?');
          params.push(dispute_status);
        }
        if (audit_status && audit_status !== 'all') {
          whereConditions.push('audit_status = ?');
          params.push(audit_status);
        }

        const containers = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_containers
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY updated_at DESC
          LIMIT ?
        `, [...params, limit]);

        result = { success: true, data: containers || [] };
        break;
      }

      case 'demurrage_get_stats': {
        console.log('Fetching demurrage stats');

        const stats = await client.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN cronos_status IN ('IN_TRANSIT', 'ARRIVED', 'PENDING') THEN 1 ELSE 0 END) as in_transit,
            SUM(CASE WHEN risk_status IN ('at_risk', 'critical', 'exceeded') THEN 1 ELSE 0 END) as at_risk,
            SUM(CASE WHEN cronos_status IN ('GATE_OUT', 'RETURNED') THEN 1 ELSE 0 END) as delivered,
            COALESCE(SUM(expected_cost_usd), 0) as total_demurrage_usd
          FROM dados_dachser.t_dachser_demurrage_containers
          WHERE active = 1
        `);

        const row = stats?.[0] || {};
        result = { 
          success: true, 
          data: {
            total: Number(row.total || 0),
            inTransit: Number(row.in_transit || 0),
            atRisk: Number(row.at_risk || 0),
            delivered: Number(row.delivered || 0),
            totalDemurrageUsd: Number(row.total_demurrage_usd || 0),
          }
        };
        break;
      }

      case 'demurrage_update_container': {
        const { container_id, updates } = body as { container_id: number; updates: Record<string, unknown> };
        console.log('Updating demurrage container:', container_id, updates);

        if (!container_id || !updates) {
          return new Response(
            JSON.stringify({ error: 'container_id e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const allowedFields = [
          'notes', 'pre_invoice_number', 'pre_invoice_status', 'pre_invoice_total_usd',
          'disputed_amount_usd', 'recovered_amount_usd', 'dispute_status', 'dispute_reason',
          'armador_invoice_number', 'armador_cost_usd', 'armador_days_charged', 'audit_status', 'discrepancy_usd',
          'client_auto_alert', 'client_alert_days_before', 'client_report_frequency',
          'ft_started_at', 'data_devolucao', 'free_time_days'
        ];

        const setClauses: string[] = [];
        const values: unknown[] = [];
        for (const [key, value] of Object.entries(updates)) {
          if (allowedFields.includes(key)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
          }
        }

        if (setClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        setClauses.push('updated_at = NOW()');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_containers
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `, [...values, container_id]);

        result = { success: true };
        break;
      }

      case 'demurrage_get_rates': {
        console.log('Fetching demurrage rates');

        const rates = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_rates
          WHERE active = 1
          ORDER BY created_at DESC, armador ASC, container_type ASC
        `);

        result = { success: true, data: rates || [] };
        break;
      }

      case 'demurrage_create_rate': {
        const { armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day } = body as any;
        console.log('Creating demurrage rate:', { armador, container_type, rate_usd });

        if (!armador || !container_type || rate_usd === undefined) {
          return new Response(
            JSON.stringify({ error: 'armador, container_type e rate_usd são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_rates 
            (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          armador,
          container_type,
          free_time_days || 14,
          rate_usd,
          period_type || 'standard',
          period_start_day || null,
          period_end_day || null
        ]);

        result = { success: true };
        break;
      }

      case 'demurrage_update_rate': {
        const { rate_id, updates: rateUpdates } = body as { rate_id: number; updates: Record<string, unknown> };
        console.log('Updating demurrage rate:', rate_id);

        if (!rate_id || !rateUpdates) {
          return new Response(
            JSON.stringify({ error: 'rate_id e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const allowedRateFields = ['armador', 'container_type', 'free_time_days', 'rate_usd', 'period_type', 'period_start_day', 'period_end_day', 'active'];
        const rateSetClauses: string[] = [];
        const rateValues: unknown[] = [];

        for (const [key, value] of Object.entries(rateUpdates)) {
          if (allowedRateFields.includes(key)) {
            rateSetClauses.push(`${key} = ?`);
            rateValues.push(value);
          }
        }

        if (rateSetClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        rateSetClauses.push('updated_at = NOW()');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_rates
          SET ${rateSetClauses.join(', ')}
          WHERE id = ?
        `, [...rateValues, rate_id]);

        result = { success: true };
        break;
      }

      case 'demurrage_delete_rate': {
        const { rate_id: deleteRateId } = body as { rate_id: number };
        console.log('Deleting demurrage rate:', deleteRateId);

        if (!deleteRateId) {
          return new Response(
            JSON.stringify({ error: 'rate_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_rates
          SET active = 0, updated_at = NOW()
          WHERE id = ?
        `, [deleteRateId]);

        result = { success: true };
        break;
      }

      case 'demurrage_get_container_events': {
        const { container_number, mbl_id, limit: evtLimit = 50 } = body as any;
        console.log('Fetching container events:', { container_number, mbl_id });

        if (!container_number && !mbl_id) {
          return new Response(
            JSON.stringify({ error: 'container_number ou mbl_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const evtWhereConditions: string[] = [];
        const evtParams: (string | number)[] = [];

        if (container_number) {
          evtWhereConditions.push('container = ?');
          evtParams.push(container_number);
        }
        if (mbl_id) {
          evtWhereConditions.push('mbl_id = ?');
          evtParams.push(mbl_id);
        }

        const containerEvents = await client.query(`
          SELECT 
            id,
            mbl_id,
            container,
            event_code,
            event_description,
            event_datetime,
            location,
            vessel_name,
            voyage,
            container_status,
            eta,
            source,
            created_at
          FROM dados_dachser.t_tracking_sea_history
          WHERE ${evtWhereConditions.join(' AND ')}
          ORDER BY event_datetime DESC, created_at DESC
          LIMIT ?
        `, [...evtParams, evtLimit]);

        result = { success: true, data: containerEvents || [] };
        break;
      }

      case 'demurrage_get_settings': {
        console.log('Fetching demurrage settings');

        const settingsRows = await client.query(`
          SELECT setting_key, setting_value, description
          FROM dados_dachser.t_dachser_demurrage_settings
        `);

        const settingsMap: Record<string, string> = {};
        (settingsRows || []).forEach((s: any) => {
          settingsMap[s.setting_key] = s.setting_value;
        });

        result = { success: true, data: settingsMap };
        break;
      }

      case 'demurrage_update_setting': {
        const { setting_key, setting_value } = body as { setting_key: string; setting_value: string };
        console.log('Updating demurrage setting:', setting_key, '=', setting_value);

        if (!setting_key || setting_value === undefined) {
          return new Response(
            JSON.stringify({ error: 'setting_key e setting_value são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_settings (setting_key, setting_value)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
        `, [setting_key, setting_value, setting_value]);

        result = { success: true };
        break;
      }

      case 'demurrage_get_unique_clients': {
        console.log('Fetching unique demurrage clients');

        const clients = await client.query(`
          SELECT DISTINCT cliente, 
                 COUNT(*) as total_containers,
                 SUM(expected_cost_usd) as total_demurrage
          FROM dados_dachser.t_dachser_demurrage_containers
          WHERE active = 1 AND cliente IS NOT NULL AND cliente != ''
          GROUP BY cliente
          ORDER BY cliente ASC
        `);

        result = { success: true, data: clients || [] };
        break;
      }

      case 'demurrage_get_unique_armadores': {
        console.log('Fetching unique demurrage armadores');

        const armadores = await client.query(`
          SELECT DISTINCT armador, COUNT(*) as total_containers
          FROM dados_dachser.t_dachser_demurrage_containers
          WHERE active = 1 AND armador IS NOT NULL AND armador != ''
          GROUP BY armador
          ORDER BY armador ASC
        `);

        result = { success: true, data: armadores || [] };
        break;
      }

      case 'demurrage_get_client_profiles': {
        console.log('Fetching demurrage client profiles');

        const profiles = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_client_profiles
          ORDER BY cliente ASC
        `);

        // Parse contact_emails JSON
        const parsed = (profiles || []).map((p: any) => ({
          ...p,
          contact_emails: p.contact_emails ? JSON.parse(p.contact_emails) : []
        }));

        result = { success: true, data: parsed };
        break;
      }

      case 'demurrage_create_client_profile': {
        const { cliente, auto_alert_enabled, alert_days_before, report_frequency, contact_emails } = body as any;
        console.log('Creating demurrage client profile:', cliente);

        if (!cliente) {
          return new Response(
            JSON.stringify({ error: 'cliente é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if profile already exists
        const existing = await client.query(
          `SELECT id FROM dados_dachser.t_dachser_demurrage_client_profiles WHERE cliente = ?`,
          [cliente]
        );

        if (existing && existing.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Perfil já existe para este cliente' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_client_profiles 
            (cliente, auto_alert_enabled, alert_days_before, report_frequency, contact_emails)
          VALUES (?, ?, ?, ?, ?)
        `, [
          cliente,
          auto_alert_enabled ? 1 : 0,
          alert_days_before || 3,
          report_frequency || 'WEEKLY',
          JSON.stringify(contact_emails || [])
        ]);

        result = { success: true };
        break;
      }

      case 'demurrage_update_client_profile': {
        const { cliente: profileCliente, updates: profileUpdates } = body as { cliente: string; updates: Record<string, unknown> };
        console.log('Updating demurrage client profile:', profileCliente);

        if (!profileCliente || !profileUpdates) {
          return new Response(
            JSON.stringify({ error: 'cliente e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const allowedProfileFields = ['auto_alert_enabled', 'alert_days_before', 'report_frequency', 'contact_emails'];
        const profileSetClauses: string[] = [];
        const profileValues: unknown[] = [];

        for (const [key, value] of Object.entries(profileUpdates)) {
          if (allowedProfileFields.includes(key)) {
            if (key === 'contact_emails') {
              profileSetClauses.push(`${key} = ?`);
              profileValues.push(JSON.stringify(value));
            } else if (key === 'auto_alert_enabled') {
              profileSetClauses.push(`${key} = ?`);
              profileValues.push(value ? 1 : 0);
            } else {
              profileSetClauses.push(`${key} = ?`);
              profileValues.push(value);
            }
          }
        }

        if (profileSetClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        profileSetClauses.push('updated_at = NOW()');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_client_profiles
          SET ${profileSetClauses.join(', ')}
          WHERE cliente = ?
        `, [...profileValues, profileCliente]);

        result = { success: true };
        break;
      }

      case 'demurrage_delete_client_profile': {
        const { cliente: deleteCliente } = body as { cliente: string };
        console.log('Deleting demurrage client profile:', deleteCliente);

        if (!deleteCliente) {
          return new Response(
            JSON.stringify({ error: 'cliente é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          DELETE FROM dados_dachser.t_dachser_demurrage_client_profiles
          WHERE cliente = ?
        `, [deleteCliente]);

        result = { success: true };
        break;
      }

      // ==================== DEMURRAGE PRE-INVOICES ====================
      case 'demurrage_get_pre_invoices': {
        const { status: piStatus, workflow_status: piWorkflowStatus, client_name: piClient, limit: piLimit = 100 } = body as any;
        console.log('Fetching demurrage pre-invoices:', { piStatus, piWorkflowStatus, piClient });

        let piWhereConditions: string[] = [];
        let piParams: (string | number)[] = [];

        if (piStatus && piStatus !== 'all') {
          piWhereConditions.push('status = ?');
          piParams.push(piStatus);
        }
        if (piWorkflowStatus && piWorkflowStatus !== 'all') {
          piWhereConditions.push('workflow_status = ?');
          piParams.push(piWorkflowStatus);
        }
        if (piClient) {
          piWhereConditions.push('client_name LIKE ?');
          piParams.push(`%${piClient}%`);
        }

        const piWhere = piWhereConditions.length > 0 ? `WHERE ${piWhereConditions.join(' AND ')}` : '';

        const preInvoices = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoices
          ${piWhere}
          ORDER BY created_at DESC
          LIMIT ?
        `, [...piParams, piLimit]);

        result = { success: true, data: preInvoices || [] };
        break;
      }

      case 'demurrage_get_pre_invoice': {
        const { id: piId } = body as { id: number };
        console.log('Fetching demurrage pre-invoice:', piId);

        if (!piId) {
          return new Response(
            JSON.stringify({ error: 'id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const piRows = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoices WHERE id = ?
        `, [piId]);

        result = { success: true, data: piRows?.[0] || null };
        break;
      }

      case 'demurrage_create_pre_invoice': {
        const piData = body as any;
        console.log('Creating demurrage pre-invoice:', piData.invoice_number);

        if (!piData.invoice_number) {
          return new Response(
            JSON.stringify({ error: 'invoice_number é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoices (
            invoice_number, shipment_mbl, client_name, bl_number, vessel_name, voyage_number,
            origin_port, destination_port, arrival_date, issue_date, due_date,
            total_usd, total_brl, exchange_rate, status, workflow_status, financial_status,
            notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          piData.invoice_number,
          piData.shipment_mbl || null,
          piData.client_name || null,
          piData.bl_number || null,
          piData.vessel_name || null,
          piData.voyage_number || null,
          piData.origin_port || null,
          piData.destination_port || null,
          piData.arrival_date || null,
          piData.issue_date || null,
          piData.due_date || null,
          piData.total_usd || 0,
          piData.total_brl || 0,
          piData.exchange_rate || 6.16,
          piData.status || 'pending',
          piData.workflow_status || 'calculated',
          piData.financial_status || 'PENDING',
          piData.notes || null,
          piData.created_by || null
        ]);

        // Get the inserted ID
        const lastId = await client.query('SELECT LAST_INSERT_ID() as id');
        result = { success: true, id: lastId?.[0]?.id };
        break;
      }

      case 'demurrage_update_pre_invoice': {
        const { id: updatePiId, updates: piUpdates } = body as { id: number; updates: Record<string, unknown> };
        console.log('Updating demurrage pre-invoice:', updatePiId);

        if (!updatePiId || !piUpdates) {
          return new Response(
            JSON.stringify({ error: 'id e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const allowedPiFields = [
          'shipment_mbl', 'client_name', 'bl_number', 'vessel_name', 'voyage_number',
          'origin_port', 'destination_port', 'arrival_date', 'issue_date', 'due_date',
          'total_usd', 'total_brl', 'exchange_rate', 'status', 'workflow_status', 'financial_status',
          'notes', 'posted_at'
        ];

        const piSetClauses: string[] = [];
        const piValues: unknown[] = [];

        for (const [key, value] of Object.entries(piUpdates)) {
          if (allowedPiFields.includes(key)) {
            piSetClauses.push(`${key} = ?`);
            piValues.push(value);
          }
        }

        if (piSetClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        piSetClauses.push('updated_at = NOW()');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_pre_invoices
          SET ${piSetClauses.join(', ')}
          WHERE id = ?
        `, [...piValues, updatePiId]);

        result = { success: true };
        break;
      }

      case 'demurrage_delete_pre_invoice': {
        const { id: deletePiId } = body as { id: number };
        console.log('Deleting demurrage pre-invoice:', deletePiId);

        if (!deletePiId) {
          return new Response(
            JSON.stringify({ error: 'id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete items first
        await client.execute(`
          DELETE FROM dados_dachser.t_dachser_demurrage_pre_invoice_items WHERE pre_invoice_id = ?
        `, [deletePiId]);

        // Delete pre-invoice
        await client.execute(`
          DELETE FROM dados_dachser.t_dachser_demurrage_pre_invoices WHERE id = ?
        `, [deletePiId]);

        result = { success: true };
        break;
      }

      // ==================== DEMURRAGE PRE-INVOICE ITEMS ====================
      case 'demurrage_get_pre_invoice_items': {
        const { pre_invoice_id: itemPiId } = body as { pre_invoice_id: number };
        console.log('Fetching pre-invoice items for:', itemPiId);

        if (!itemPiId) {
          return new Response(
            JSON.stringify({ error: 'pre_invoice_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const piItems = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoice_items
          WHERE pre_invoice_id = ?
          ORDER BY container_number ASC
        `, [itemPiId]);

        result = { success: true, data: piItems || [] };
        break;
      }

      case 'demurrage_create_pre_invoice_item': {
        const itemData = body as any;
        console.log('Creating pre-invoice item for container:', itemData.container_number);

        if (!itemData.pre_invoice_id || !itemData.container_id) {
          return new Response(
            JSON.stringify({ error: 'pre_invoice_id e container_id são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoice_items (
            pre_invoice_id, container_id, container_number, container_type,
            free_time_days, period_start_date, period_end_date, days_count,
            daily_rate_usd, total_usd, period_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          itemData.pre_invoice_id,
          itemData.container_id,
          itemData.container_number || null,
          itemData.container_type || null,
          itemData.free_time_days || 14,
          itemData.period_start_date || null,
          itemData.period_end_date || null,
          itemData.days_count || 0,
          itemData.daily_rate_usd || null,
          itemData.total_usd || 0,
          itemData.period_type || null
        ]);

        const lastItemId = await client.query('SELECT LAST_INSERT_ID() as id');
        result = { success: true, id: lastItemId?.[0]?.id };
        break;
      }

      // ==================== DEMURRAGE CONTAINER EVENTS ====================
      case 'demurrage_get_container_events_new': {
        const { container_id: evtContainerId, container_number: evtContainerNumber, limit: evtNewLimit = 50 } = body as any;
        console.log('Fetching container events:', { evtContainerId, evtContainerNumber });

        if (!evtContainerId && !evtContainerNumber) {
          return new Response(
            JSON.stringify({ error: 'container_id ou container_number é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const evtNewConditions: string[] = [];
        const evtNewParams: (string | number)[] = [];

        if (evtContainerId) {
          evtNewConditions.push('container_id = ?');
          evtNewParams.push(evtContainerId);
        }
        if (evtContainerNumber) {
          evtNewConditions.push('container_number = ?');
          evtNewParams.push(evtContainerNumber);
        }

        const evtNewRows = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_container_events
          WHERE ${evtNewConditions.join(' OR ')}
          ORDER BY event_datetime DESC
          LIMIT ?
        `, [...evtNewParams, evtNewLimit]);

        result = { success: true, data: evtNewRows || [] };
        break;
      }

      case 'demurrage_create_container_event': {
        const evtData = body as any;
        console.log('Creating container event:', evtData.event_type);

        if (!evtData.container_id) {
          return new Response(
            JSON.stringify({ error: 'container_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_container_events (
            container_id, container_number, event_type, event_code, event_description,
            event_datetime, location, vessel_name, voyage_number, terminal, source, raw_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          evtData.container_id,
          evtData.container_number || null,
          evtData.event_type || null,
          evtData.event_code || null,
          evtData.event_description || null,
          evtData.event_datetime || null,
          evtData.location || null,
          evtData.vessel_name || null,
          evtData.voyage_number || null,
          evtData.terminal || null,
          evtData.source || 'JSONCARGO',
          evtData.raw_data ? JSON.stringify(evtData.raw_data) : null
        ]);

        result = { success: true };
        break;
      }

      case 'demurrage_bulk_create_events': {
        const { events } = body as { events: any[] };
        console.log('Bulk creating container events:', events?.length);

        if (!events || events.length === 0) {
          result = { success: true, inserted: 0 };
          break;
        }

        let evtInserted = 0;
        for (const evt of events) {
          await client.execute(`
            INSERT INTO dados_dachser.t_dachser_demurrage_container_events (
              container_id, container_number, event_type, event_code, event_description,
              event_datetime, location, vessel_name, voyage_number, terminal, source, raw_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            evt.container_id,
            evt.container_number || null,
            evt.event_type || null,
            evt.event_code || null,
            evt.event_description || null,
            evt.event_datetime || null,
            evt.location || null,
            evt.vessel_name || null,
            evt.voyage_number || null,
            evt.terminal || null,
            evt.source || 'JSONCARGO',
            evt.raw_data ? JSON.stringify(evt.raw_data) : null
          ]);
          evtInserted++;
        }

        result = { success: true, inserted: evtInserted };
        break;
      }

      // ==================== DEMURRAGE ALERTS ====================
      case 'demurrage_get_alerts': {
        const { container_id: alertContainerId, status: alertStatus, limit: alertLimit = 100 } = body as any;
        console.log('Fetching demurrage alerts:', { alertContainerId, alertStatus });

        let alertConditions: string[] = [];
        let alertParams: (string | number)[] = [];

        if (alertContainerId) {
          alertConditions.push('container_id = ?');
          alertParams.push(alertContainerId);
        }
        if (alertStatus && alertStatus !== 'all') {
          alertConditions.push('status = ?');
          alertParams.push(alertStatus);
        }

        const alertWhere = alertConditions.length > 0 ? `WHERE ${alertConditions.join(' AND ')}` : '';

        const alerts = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_alerts
          ${alertWhere}
          ORDER BY sent_at DESC
          LIMIT ?
        `, [...alertParams, alertLimit]);

        // Parse recipient_emails JSON
        const parsedAlerts = (alerts || []).map((a: any) => ({
          ...a,
          recipient_emails: a.recipient_emails ? JSON.parse(a.recipient_emails) : []
        }));

        result = { success: true, data: parsedAlerts };
        break;
      }

      case 'demurrage_create_alert': {
        const alertData = body as any;
        console.log('Creating demurrage alert for container:', alertData.container_number);

        if (!alertData.container_id) {
          return new Response(
            JSON.stringify({ error: 'container_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_alerts (
            container_id, container_number, alert_type, client_name, shipment_master,
            days_remaining, expected_cost_usd, recipient_emails, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          alertData.container_id,
          alertData.container_number || null,
          alertData.alert_type || null,
          alertData.client_name || null,
          alertData.shipment_master || null,
          alertData.days_remaining || null,
          alertData.expected_cost_usd || null,
          JSON.stringify(alertData.recipient_emails || []),
          alertData.status || 'sent'
        ]);

        const lastAlertId = await client.query('SELECT LAST_INSERT_ID() as id');
        result = { success: true, id: lastAlertId?.[0]?.id };
        break;
      }

      case 'demurrage_update_alert': {
        const { id: alertId, status: alertNewStatus, error_message: alertError } = body as any;
        console.log('Updating demurrage alert:', alertId);

        if (!alertId) {
          return new Response(
            JSON.stringify({ error: 'id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_alerts
          SET status = ?, error_message = ?
          WHERE id = ?
        `, [alertNewStatus || 'sent', alertError || null, alertId]);

        result = { success: true };
        break;
      }

      // ==================== DEMURRAGE DISPUTES ====================
      case 'demurrage_get_disputes': {
        const { container_id: dispContainerId, status: dispStatus, client_name: dispClient, limit: dispLimit = 100 } = body as any;
        console.log('Fetching demurrage disputes:', { dispContainerId, dispStatus, dispClient });

        let dispConditions: string[] = [];
        let dispParams: (string | number)[] = [];

        if (dispContainerId) {
          dispConditions.push('container_id = ?');
          dispParams.push(dispContainerId);
        }
        if (dispStatus && dispStatus !== 'all') {
          dispConditions.push('status = ?');
          dispParams.push(dispStatus);
        }
        if (dispClient) {
          dispConditions.push('client_name LIKE ?');
          dispParams.push(`%${dispClient}%`);
        }

        const dispWhere = dispConditions.length > 0 ? `WHERE ${dispConditions.join(' AND ')}` : '';

        const disputes = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_disputes
          ${dispWhere}
          ORDER BY opened_at DESC
          LIMIT ?
        `, [...dispParams, dispLimit]);

        result = { success: true, data: disputes || [] };
        break;
      }

      case 'demurrage_get_dispute': {
        const { id: dispGetId } = body as { id: number };
        console.log('Fetching demurrage dispute:', dispGetId);

        if (!dispGetId) {
          return new Response(
            JSON.stringify({ error: 'id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const dispRows = await client.query(`
          SELECT * FROM dados_dachser.t_dachser_demurrage_disputes WHERE id = ?
        `, [dispGetId]);

        result = { success: true, data: dispRows?.[0] || null };
        break;
      }

      case 'demurrage_create_dispute': {
        const dispData = body as any;
        console.log('Creating demurrage dispute for container:', dispData.container_number);

        if (!dispData.container_id) {
          return new Response(
            JSON.stringify({ error: 'container_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_disputes (
            container_id, container_number, client_name, armador, status,
            disputed_amount_usd, reason, success_probability, opened_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dispData.container_id,
          dispData.container_number || null,
          dispData.client_name || null,
          dispData.armador || null,
          dispData.status || 'opened',
          dispData.disputed_amount_usd || 0,
          dispData.reason || null,
          dispData.success_probability || 50,
          dispData.opened_by || null
        ]);

        // Update container dispute_status
        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_containers
          SET dispute_status = 'opened', disputed_amount_usd = ?, updated_at = NOW()
          WHERE id = ?
        `, [dispData.disputed_amount_usd || 0, dispData.container_id]);

        const lastDispId = await client.query('SELECT LAST_INSERT_ID() as id');
        result = { success: true, id: lastDispId?.[0]?.id };
        break;
      }

      case 'demurrage_update_dispute': {
        const { id: updateDispId, updates: dispUpdates } = body as { id: number; updates: Record<string, unknown> };
        console.log('Updating demurrage dispute:', updateDispId);

        if (!updateDispId || !dispUpdates) {
          return new Response(
            JSON.stringify({ error: 'id e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const allowedDispFields = [
          'status', 'disputed_amount_usd', 'recovered_amount_usd', 'reason',
          'success_probability', 'resolution_notes', 'resolved_by', 'resolved_at'
        ];

        const dispSetClauses: string[] = [];
        const dispValues: unknown[] = [];

        for (const [key, value] of Object.entries(dispUpdates)) {
          if (allowedDispFields.includes(key)) {
            dispSetClauses.push(`${key} = ?`);
            dispValues.push(value);
          }
        }

        if (dispSetClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        dispSetClauses.push('updated_at = NOW()');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_disputes
          SET ${dispSetClauses.join(', ')}
          WHERE id = ?
        `, [...dispValues, updateDispId]);

        // If status is resolved, update container too
        if (dispUpdates.status === 'won' || dispUpdates.status === 'lost') {
          const dispInfo = await client.query(
            'SELECT container_id, recovered_amount_usd FROM dados_dachser.t_dachser_demurrage_disputes WHERE id = ?',
            [updateDispId]
          );
          if (dispInfo?.[0]) {
            await client.execute(`
              UPDATE dados_dachser.t_dachser_demurrage_containers
              SET dispute_status = ?, recovered_amount_usd = ?, updated_at = NOW()
              WHERE id = ?
            `, [dispUpdates.status, dispUpdates.recovered_amount_usd || 0, dispInfo[0].container_id]);
          }
        }

        result = { success: true };
        break;
      }

      case 'demurrage_get_dispute_stats': {
        console.log('Fetching demurrage dispute stats');

        const dispStats = await client.query(`
          SELECT 
            COUNT(*) as total_disputes,
            SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
            SUM(CASE WHEN status = 'negotiating' THEN 1 ELSE 0 END) as negotiating,
            SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
            SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
            COALESCE(SUM(disputed_amount_usd), 0) as total_disputed_usd,
            COALESCE(SUM(recovered_amount_usd), 0) as total_recovered_usd
          FROM dados_dachser.t_dachser_demurrage_disputes
        `);

        const stats = dispStats?.[0] || {};
        const totalResolved = Number(stats.won || 0) + Number(stats.lost || 0);
        const successRate = totalResolved > 0 ? (Number(stats.won || 0) / totalResolved * 100) : 0;

        result = { 
          success: true, 
          data: {
            totalDisputes: Number(stats.total_disputes || 0),
            opened: Number(stats.opened || 0),
            negotiating: Number(stats.negotiating || 0),
            won: Number(stats.won || 0),
            lost: Number(stats.lost || 0),
            totalDisputedUsd: Number(stats.total_disputed_usd || 0),
            totalRecoveredUsd: Number(stats.total_recovered_usd || 0),
            successRate: Math.round(successRate * 10) / 10
          }
        };
        break;
      }

      // ==================== CHB CLIENT CONFIG (ai_agente) ====================
      case 'get_chb_client_configs': {
        console.log('Fetching CHB client configs from ai_agente');
        const configs = await client.query(`
          SELECT * FROM ai_agente.t_chb_client_config
          WHERE ativo = 1
          ORDER BY cliente_nome ASC
        `);
        
        // Parse JSON fields
        const parsed = (configs || []).map((c: any) => ({
          ...c,
          campos_obrigatorios: typeof c.campos_obrigatorios === 'string' 
            ? JSON.parse(c.campos_obrigatorios) 
            : c.campos_obrigatorios || [],
          regras_comparacao: typeof c.regras_comparacao === 'string'
            ? JSON.parse(c.regras_comparacao)
            : c.regras_comparacao || {}
        }));
        
        result = { success: true, data: parsed };
        break;
      }

      case 'get_chb_client_config': {
        const { cnpj } = body;
        console.log('Fetching CHB client config for CNPJ:', cnpj);
        
        const configs = await client.query(`
          SELECT * FROM ai_agente.t_chb_client_config
          WHERE cliente_cnpj = ? AND ativo = 1
          LIMIT 1
        `, [cnpj]);
        
        if (!configs || configs.length === 0) {
          result = { success: true, data: null };
        } else {
          const c = configs[0];
          result = { 
            success: true, 
            data: {
              ...c,
              campos_obrigatorios: typeof c.campos_obrigatorios === 'string' 
                ? JSON.parse(c.campos_obrigatorios) 
                : c.campos_obrigatorios || [],
              regras_comparacao: typeof c.regras_comparacao === 'string'
                ? JSON.parse(c.regras_comparacao)
                : c.regras_comparacao || {}
            }
          };
        }
        break;
      }

      case 'create_chb_client_config': {
        const configData = body as any;
        console.log('Creating CHB client config:', configData.cliente_cnpj);
        
        const newId = crypto.randomUUID();
        await client.execute(`
          INSERT INTO ai_agente.t_chb_client_config (
            id, cliente_cnpj, cliente_nome, tolerancia_peso, tolerancia_valor,
            campos_obrigatorios, regras_comparacao, instrucoes_personalizadas,
            armador, agente_destino, contato_email, prazo_resposta_dias,
            porto_descarga_real, tolerancia_taxas_acessorias_abs, tolerancia_taxas_acessorias_pct,
            beneficio_fiscal, cfop_padrao, estado_uf, icms_diferido, ativo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          newId,
          configData.cliente_cnpj,
          configData.cliente_nome || null,
          configData.tolerancia_peso ?? 2.0,
          configData.tolerancia_valor ?? 1.0,
          JSON.stringify(configData.campos_obrigatorios || []),
          JSON.stringify(configData.regras_comparacao || {}),
          configData.instrucoes_personalizadas || null,
          configData.armador || null,
          configData.agente_destino || null,
          configData.contato_email || null,
          configData.prazo_resposta_dias ?? 2,
          configData.porto_descarga_real || null,
          configData.tolerancia_taxas_acessorias_abs ?? 50,
          configData.tolerancia_taxas_acessorias_pct ?? 1.0,
          configData.beneficio_fiscal || null,
          configData.cfop_padrao || null,
          configData.estado_uf || null,
          configData.icms_diferido ? 1 : 0
        ]);
        
        result = { success: true, id: newId };
        break;
      }

      case 'update_chb_client_config': {
        const { id: configId, ...updateData } = body as any;
        console.log('Updating CHB client config:', configId);
        
        if (!configId) {
          return new Response(
            JSON.stringify({ error: 'ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const setClauses: string[] = [];
        const values: any[] = [];
        
        if (updateData.cliente_cnpj !== undefined) { setClauses.push('cliente_cnpj = ?'); values.push(updateData.cliente_cnpj); }
        if (updateData.cliente_nome !== undefined) { setClauses.push('cliente_nome = ?'); values.push(updateData.cliente_nome); }
        if (updateData.tolerancia_peso !== undefined) { setClauses.push('tolerancia_peso = ?'); values.push(updateData.tolerancia_peso); }
        if (updateData.tolerancia_valor !== undefined) { setClauses.push('tolerancia_valor = ?'); values.push(updateData.tolerancia_valor); }
        if (updateData.campos_obrigatorios !== undefined) { setClauses.push('campos_obrigatorios = ?'); values.push(JSON.stringify(updateData.campos_obrigatorios)); }
        if (updateData.regras_comparacao !== undefined) { setClauses.push('regras_comparacao = ?'); values.push(JSON.stringify(updateData.regras_comparacao)); }
        if (updateData.instrucoes_personalizadas !== undefined) { setClauses.push('instrucoes_personalizadas = ?'); values.push(updateData.instrucoes_personalizadas); }
        if (updateData.armador !== undefined) { setClauses.push('armador = ?'); values.push(updateData.armador); }
        if (updateData.agente_destino !== undefined) { setClauses.push('agente_destino = ?'); values.push(updateData.agente_destino); }
        if (updateData.contato_email !== undefined) { setClauses.push('contato_email = ?'); values.push(updateData.contato_email); }
        if (updateData.prazo_resposta_dias !== undefined) { setClauses.push('prazo_resposta_dias = ?'); values.push(updateData.prazo_resposta_dias); }
        if (updateData.porto_descarga_real !== undefined) { setClauses.push('porto_descarga_real = ?'); values.push(updateData.porto_descarga_real); }
        if (updateData.tolerancia_taxas_acessorias_abs !== undefined) { setClauses.push('tolerancia_taxas_acessorias_abs = ?'); values.push(updateData.tolerancia_taxas_acessorias_abs); }
        if (updateData.tolerancia_taxas_acessorias_pct !== undefined) { setClauses.push('tolerancia_taxas_acessorias_pct = ?'); values.push(updateData.tolerancia_taxas_acessorias_pct); }
        if (updateData.beneficio_fiscal !== undefined) { setClauses.push('beneficio_fiscal = ?'); values.push(updateData.beneficio_fiscal); }
        if (updateData.cfop_padrao !== undefined) { setClauses.push('cfop_padrao = ?'); values.push(updateData.cfop_padrao); }
        if (updateData.estado_uf !== undefined) { setClauses.push('estado_uf = ?'); values.push(updateData.estado_uf); }
        if (updateData.icms_diferido !== undefined) { setClauses.push('icms_diferido = ?'); values.push(updateData.icms_diferido ? 1 : 0); }
        if (updateData.ativo !== undefined) { setClauses.push('ativo = ?'); values.push(updateData.ativo ? 1 : 0); }
        
        if (setClauses.length > 0) {
          setClauses.push('updated_at = NOW()');
          values.push(configId);
          
          await client.execute(`
            UPDATE ai_agente.t_chb_client_config
            SET ${setClauses.join(', ')}
            WHERE id = ?
          `, values);
        }
        
        result = { success: true };
        break;
      }

      case 'delete_chb_client_config': {
        const { id: deleteConfigId } = body;
        console.log('Deleting CHB client config:', deleteConfigId);
        
        // Soft delete
        await client.execute(`
          UPDATE ai_agente.t_chb_client_config
          SET ativo = 0, updated_at = NOW()
          WHERE id = ?
        `, [deleteConfigId]);
        
        result = { success: true };
        break;
      }

      // ==================== SLA CONFIG (dados_dachser) ====================
      case 'get_sla_configs': {
        console.log('Fetching SLA configs from dados_dachser');
        const slaConfigs = await client.query(`
          SELECT * FROM dados_dachser.t_sla_config
          ORDER BY etapa ASC
        `);
        
        result = { success: true, data: slaConfigs || [] };
        break;
      }

      case 'update_sla_config': {
        const { id: slaId, horas_limite, ativo: slaAtivo } = body as { id: string; horas_limite?: number; ativo?: boolean };
        console.log('Updating SLA config:', slaId);
        
        if (!slaId) {
          return new Response(
            JSON.stringify({ error: 'ID é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const slaClauses: string[] = [];
        const slaValues: any[] = [];
        
        if (horas_limite !== undefined) { slaClauses.push('horas_limite = ?'); slaValues.push(horas_limite); }
        if (slaAtivo !== undefined) { slaClauses.push('ativo = ?'); slaValues.push(slaAtivo ? 1 : 0); }
        
        if (slaClauses.length > 0) {
          slaClauses.push('updated_at = NOW()');
          slaValues.push(slaId);
          
          await client.execute(`
            UPDATE dados_dachser.t_sla_config
            SET ${slaClauses.join(', ')}
            WHERE id = ?
          `, slaValues);
        }
        
        result = { success: true };
        break;
      }

      // ==================== ACCRUAL ENTRIES (dados_dachser) ====================
      case 'get_accrual_entries': {
        const { search: accSearch } = body;
        console.log('Fetching accrual entries from dados_dachser');
        
        let accQuery = `SELECT * FROM dados_dachser.t_accrual_entries ORDER BY created_at DESC`;
        let accParams: any[] = [];
        
        if (accSearch) {
          accQuery = `
            SELECT * FROM dados_dachser.t_accrual_entries
            WHERE fornecedor LIKE ? OR shared_code LIKE ?
            ORDER BY created_at DESC
          `;
          accParams = [`%${accSearch}%`, `%${accSearch}%`];
        }
        
        const accruals = await client.query(accQuery, accParams);
        result = { success: true, data: accruals || [] };
        break;
      }

      case 'create_accrual_entry': {
        const accData = body as any;
        console.log('Creating accrual entry:', accData.fornecedor);
        
        const accId = crypto.randomUUID();
        await client.execute(`
          INSERT INTO dados_dachser.t_accrual_entries (
            id, fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          accId,
          accData.fornecedor,
          accData.valor,
          accData.shared_code || null,
          accData.status_accrual || 'ATIVO',
          accData.uploaded_by_user_id || null
        ]);
        
        result = { success: true, id: accId };
        break;
      }

      case 'bulk_create_accrual': {
        const bodyAny = body as unknown as { entries: Array<{ fornecedor: string; valor: number; shared_code?: string }> };
        const entries = bodyAny.entries;
        console.log('Bulk creating accrual entries:', entries?.length);
        
        if (!entries || entries.length === 0) {
          result = { success: true, inserted: 0 };
          break;
        }
        
        let inserted = 0;
        for (const entry of entries) {
          const accId = crypto.randomUUID();
          await client.execute(`
            INSERT INTO dados_dachser.t_accrual_entries (
              id, fornecedor, valor, shared_code, status_accrual
            ) VALUES (?, ?, ?, ?, 'ATIVO')
          `, [accId, entry.fornecedor, entry.valor, entry.shared_code || null]);
          inserted++;
        }
        
        result = { success: true, inserted };
        break;
      }

      case 'delete_accrual_entry': {
        const { id: accDeleteId } = body;
        console.log('Deleting accrual entry:', accDeleteId);
        
        await client.execute(`
          DELETE FROM dados_dachser.t_accrual_entries WHERE id = ?
        `, [accDeleteId]);
        
        result = { success: true };
        break;
      }

      case 'clear_accrual_entries': {
        console.log('Clearing all accrual entries');
        
        await client.execute(`DELETE FROM dados_dachser.t_accrual_entries`);
        
        result = { success: true };
        break;
      }

      // ==================== CHB DOCUMENTS ====================
      case 'get_chb_docs': {
        const { item_id } = body;
        if (!item_id) {
          return new Response(
            JSON.stringify({ error: 'item_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const docs = await client.query(
          `SELECT d.id, d.doc_role, d.created_at, f.filename, f.url as file_url, f.size_bytes as file_size, d.etapa
           FROM ai_agente.t_dachser_chb_docs d
           JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
           WHERE d.item_id = ?
           ORDER BY d.created_at ASC`,
          [item_id]
        );

        result = { success: true, rows: docs };
        break;
      }

      case 'delete_chb_doc': {
        const { doc_id } = body;
        if (!doc_id) {
          return new Response(
            JSON.stringify({ error: 'doc_id é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await client.execute(
          'DELETE FROM ai_agente.t_dachser_chb_docs WHERE id = ?',
          [doc_id]
        );

        result = { success: true };
        break;
      }

      // ==================== DEMURRAGE BULK UPDATE ====================
      case 'demurrage_bulk_update_containers': {
        const bulkBody = body as unknown as { container_ids: number[]; updates: Record<string, unknown> };
        const { container_ids, updates: bulkUpdates } = bulkBody;
        console.log('Bulk updating demurrage containers:', container_ids?.length, 'containers');

        if (!container_ids || container_ids.length === 0 || !bulkUpdates) {
          return new Response(
            JSON.stringify({ error: 'container_ids e updates são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const bulkAllowedFields = [
          'notes', 'pre_invoice_number', 'pre_invoice_status', 'pre_invoice_total_usd',
          'disputed_amount_usd', 'recovered_amount_usd', 'dispute_status', 'dispute_reason',
          'armador_invoice_number', 'armador_cost_usd', 'armador_days_charged', 'audit_status', 'discrepancy_usd',
          'client_auto_alert', 'client_alert_days_before', 'client_report_frequency',
          'ft_started_at', 'data_devolucao', 'free_time_days'
        ];

        const bulkSetClauses: string[] = [];
        const bulkValues: unknown[] = [];
        for (const [key, value] of Object.entries(bulkUpdates)) {
          if (bulkAllowedFields.includes(key)) {
            bulkSetClauses.push(`${key} = ?`);
            bulkValues.push(value);
          }
        }

        if (bulkSetClauses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Nenhum campo válido para atualizar' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        bulkSetClauses.push('updated_at = NOW()');

        // Build placeholders for IN clause
        const placeholders = container_ids.map(() => '?').join(', ');

        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_containers
          SET ${bulkSetClauses.join(', ')}
          WHERE id IN (${placeholders})
        `, [...bulkValues, ...container_ids]);

        result = { success: true, updated: container_ids.length };
        break;
      }

      // ==================== ANTHROPIC CREDITS ====================
      case 'setup_anthropic_credits_table': {
        console.log('[anthropic_credits] Setting up credits table...');
        
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_anthropic_credits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            credit_date DATE NOT NULL,
            amount_usd DECIMAL(10,2) NOT NULL,
            notes VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255),
            is_balance_adjustment TINYINT(1) DEFAULT 0,
            consumption_baseline DECIMAL(10,2) DEFAULT 0,
            INDEX idx_credit_date (credit_date)
          )
        `);
        
        // Add columns if they don't exist (for existing tables)
        try {
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS is_balance_adjustment TINYINT(1) DEFAULT 0`);
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS consumption_baseline DECIMAL(10,2) DEFAULT 0`);
        } catch (e) {
          console.log('[anthropic_credits] Columns may already exist');
        }
        
        console.log('[anthropic_credits] Table created/verified');
        result = { success: true };
        break;
      }

      case 'get_anthropic_credits': {
        console.log('[anthropic_credits] Fetching credits data...');
        
        // Ensure table exists with new columns
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_anthropic_credits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            credit_date DATE NOT NULL,
            amount_usd DECIMAL(10,2) NOT NULL,
            notes VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255),
            is_balance_adjustment TINYINT(1) DEFAULT 0,
            consumption_baseline DECIMAL(10,2) DEFAULT 0,
            INDEX idx_credit_date (credit_date)
          )
        `);
        
        // Add columns if they don't exist
        try {
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS is_balance_adjustment TINYINT(1) DEFAULT 0`);
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS consumption_baseline DECIMAL(10,2) DEFAULT 0`);
        } catch (e) {
          console.log('[anthropic_credits] Columns may already exist');
        }
        
        // Get all topups and adjustments
        const topups = await client.query(`
          SELECT id, credit_date, amount_usd, notes, created_at, 
                 COALESCE(is_balance_adjustment, 0) as is_balance_adjustment,
                 COALESCE(consumption_baseline, 0) as consumption_baseline
          FROM ai_agente.t_anthropic_credits
          ORDER BY credit_date DESC, created_at DESC
        `);
        
        // Find the most recent balance adjustment
        const lastAdjustmentResult = await client.query(`
          SELECT id, credit_date, amount_usd, created_at, consumption_baseline
          FROM ai_agente.t_anthropic_credits
          WHERE is_balance_adjustment = 1
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const lastAdjustment = lastAdjustmentResult.length > 0 ? lastAdjustmentResult[0] : null;
        
        const costPerCall = 0.015; // $0.015 per call (avg ~1K tokens)
        let estimatedBalance = 0;
        let totalCredits = 0;
        let totalConsumption = 0;
        let consumptionSinceAdjustment = 0;
        
        if (lastAdjustment) {
          // NEW LOGIC: Start from the last balance adjustment
          const adjustmentDate = lastAdjustment.created_at;
          const baseBalance = Number(lastAdjustment.amount_usd);
          const consumptionBaseline = Number(lastAdjustment.consumption_baseline || 0);
          
          // Get topups AFTER the adjustment
          const topupsAfterResult = await client.query(`
            SELECT COALESCE(SUM(amount_usd), 0) as total
            FROM ai_agente.t_anthropic_credits
            WHERE is_balance_adjustment = 0
              AND created_at > ?
          `, [adjustmentDate]);
          const topupsAfter = Number(topupsAfterResult[0]?.total || 0);
          
          // Get consumption SINCE the adjustment (calls after adjustment date)
          const consumptionResult = await client.query(`
            SELECT COUNT(*) as successful_calls
            FROM ai_agente.t_api_usage_logs
            WHERE api_name = 'Anthropic'
              AND created_at > ?
              AND status_code < 400
              AND error_message IS NULL
          `, [adjustmentDate]);
          consumptionSinceAdjustment = Number(consumptionResult[0]?.successful_calls || 0) * costPerCall;
          
          // Calculate: baseBalance + topups_after - consumption_since_adjustment
          estimatedBalance = Math.max(0, baseBalance + topupsAfter - consumptionSinceAdjustment);
          totalCredits = baseBalance + topupsAfter;
          totalConsumption = consumptionSinceAdjustment;
          
          console.log(`[anthropic_credits] Using adjustment: base=$${baseBalance}, topups_after=$${topupsAfter}, consumption_since=$${consumptionSinceAdjustment.toFixed(2)}`);
        } else {
          // OLD LOGIC (fallback): Sum all topups - all consumption
          const totalCreditsResult = await client.query(`
            SELECT COALESCE(SUM(amount_usd), 0) as total
            FROM ai_agente.t_anthropic_credits
            WHERE is_balance_adjustment = 0 OR is_balance_adjustment IS NULL
          `);
          totalCredits = Number(totalCreditsResult[0]?.total || 0);
          
          const consumptionResult = await client.query(`
            SELECT COUNT(*) as successful_calls
            FROM ai_agente.t_api_usage_logs
            WHERE api_name = 'Anthropic'
              AND status_code < 400
              AND error_message IS NULL
          `);
          totalConsumption = Number(consumptionResult[0]?.successful_calls || 0) * costPerCall;
          estimatedBalance = Math.max(0, totalCredits - totalConsumption);
        }
        
        // Get last topup (not adjustment)
        const lastTopupResult = await client.query(`
          SELECT credit_date, amount_usd
          FROM ai_agente.t_anthropic_credits
          WHERE is_balance_adjustment = 0 OR is_balance_adjustment IS NULL
          ORDER BY credit_date DESC
          LIMIT 1
        `);
        const lastTopup = lastTopupResult.length > 0 ? lastTopupResult[0] : null;
        
        // Calculate days since last topup
        let daysSinceLastTopup = 0;
        if (lastTopup?.credit_date) {
          const lastDate = new Date(lastTopup.credit_date);
          const now = new Date();
          daysSinceLastTopup = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        // Calculate average daily consumption (last 30 days)
        const dailyConsumptionResult = await client.query(`
          SELECT COUNT(*) as calls_30d
          FROM ai_agente.t_api_usage_logs
          WHERE api_name = 'Anthropic'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND status_code < 400
            AND error_message IS NULL
        `);
        const calls30d = Number(dailyConsumptionResult[0]?.calls_30d || 0);
        const avgDailyConsumption = (calls30d / 30) * costPerCall;
        
        // Calculate projected days
        const projectedDaysRemaining = avgDailyConsumption > 0 
          ? Math.floor(estimatedBalance / avgDailyConsumption) 
          : 999;
        
        const balance = {
          total_credits: totalCredits,
          total_consumption: totalConsumption,
          estimated_balance: estimatedBalance,
          last_topup_date: lastTopup?.credit_date || null,
          last_topup_amount: lastTopup ? Number(lastTopup.amount_usd) : null,
          avg_daily_consumption: avgDailyConsumption,
          projected_days_remaining: Math.min(projectedDaysRemaining, 999),
          days_since_last_topup: daysSinceLastTopup,
          has_adjustment: !!lastAdjustment,
          last_adjustment_date: lastAdjustment?.created_at || null,
          last_adjustment_amount: lastAdjustment ? Number(lastAdjustment.amount_usd) : null
        };
        
        console.log(`[anthropic_credits] Balance: $${estimatedBalance.toFixed(2)}, ${projectedDaysRemaining} days remaining`);
        result = { success: true, balance, topups };
        break;
      }

      case 'add_anthropic_credit': {
        const creditBody = body as unknown as { 
          credit_date: string; 
          amount_usd: number; 
          notes?: string;
          created_by?: string;
        };
        
        if (!creditBody.credit_date || !creditBody.amount_usd) {
          return new Response(
            JSON.stringify({ error: 'credit_date e amount_usd são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[anthropic_credits] Adding credit: $${creditBody.amount_usd} on ${creditBody.credit_date}`);
        
        await client.execute(`
          INSERT INTO ai_agente.t_anthropic_credits (credit_date, amount_usd, notes, created_by, is_balance_adjustment)
          VALUES (?, ?, ?, ?, 0)
        `, [
          creditBody.credit_date,
          creditBody.amount_usd,
          creditBody.notes || null,
          creditBody.created_by || null
        ]);
        
        console.log('[anthropic_credits] Credit added successfully');
        result = { success: true };
        break;
      }

      case 'set_anthropic_balance': {
        // Set a balance adjustment - this becomes the new baseline
        const balanceBody = body as unknown as { 
          balance_usd: number; 
          notes?: string;
          created_by?: string;
        };
        
        if (balanceBody.balance_usd === undefined || balanceBody.balance_usd === null) {
          return new Response(
            JSON.stringify({ error: 'balance_usd é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[anthropic_credits] Setting balance adjustment: $${balanceBody.balance_usd}`);
        
        // Add columns if they don't exist
        try {
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS is_balance_adjustment TINYINT(1) DEFAULT 0`);
          await client.execute(`ALTER TABLE ai_agente.t_anthropic_credits ADD COLUMN IF NOT EXISTS consumption_baseline DECIMAL(10,2) DEFAULT 0`);
        } catch (e) {
          console.log('[anthropic_credits] Columns may already exist');
        }
        
        // Get current total consumption to store as baseline
        const consumptionResult = await client.query(`
          SELECT COUNT(*) as successful_calls
          FROM ai_agente.t_api_usage_logs
          WHERE api_name = 'Anthropic'
            AND status_code < 400
            AND error_message IS NULL
        `);
        const currentConsumption = Number(consumptionResult[0]?.successful_calls || 0) * 0.015;
        
        // Insert the balance adjustment
        await client.execute(`
          INSERT INTO ai_agente.t_anthropic_credits 
            (credit_date, amount_usd, notes, created_by, is_balance_adjustment, consumption_baseline)
          VALUES (CURDATE(), ?, ?, ?, 1, ?)
        `, [
          balanceBody.balance_usd,
          balanceBody.notes || 'Ajuste manual de saldo',
          balanceBody.created_by || null,
          currentConsumption
        ]);
        
        console.log(`[anthropic_credits] Balance adjustment set: $${balanceBody.balance_usd} (consumption baseline: $${currentConsumption.toFixed(2)})`);
        result = { success: true };
        break;
      }

      case 'import_anthropic_credits_history': {
        // Import historical credits from the provided data
        console.log('[anthropic_credits] Importing historical credits...');
        
        // Ensure table exists
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_agente.t_anthropic_credits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            credit_date DATE NOT NULL,
            amount_usd DECIMAL(10,2) NOT NULL,
            notes VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(255),
            INDEX idx_credit_date (credit_date)
          )
        `);
        
        // Historical data from user's screenshot (2024-2025)
        const historicalCredits = [
          { date: '2024-10-17', amount: 60.00, notes: 'Recarga histórica importada' },
          { date: '2024-11-27', amount: 60.00, notes: 'Recarga histórica importada' },
          { date: '2024-12-27', amount: 100.00, notes: 'Recarga histórica importada' },
          { date: '2025-02-11', amount: 60.00, notes: 'Recarga histórica importada' },
          { date: '2025-03-05', amount: 100.00, notes: 'Recarga histórica importada' },
          { date: '2025-04-08', amount: 80.00, notes: 'Recarga histórica importada' },
        ];
        
        let imported = 0;
        for (const credit of historicalCredits) {
          // Check if already exists
          const existing = await client.query(`
            SELECT id FROM ai_agente.t_anthropic_credits
            WHERE credit_date = ? AND amount_usd = ?
          `, [credit.date, credit.amount]);
          
          if (existing.length === 0) {
            await client.execute(`
              INSERT INTO ai_agente.t_anthropic_credits (credit_date, amount_usd, notes, created_by)
              VALUES (?, ?, ?, 'Sistema - Importação')
            `, [credit.date, credit.amount, credit.notes]);
            imported++;
          }
        }
        
        console.log(`[anthropic_credits] Imported ${imported} historical credits`);
        result = { success: true, imported };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Ação não suportada: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('MariaDB Proxy Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
