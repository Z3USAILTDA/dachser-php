import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryRequest {
  action: string;
  id?: number | string; // For update/delete operations
  query?: string; // For raw_query action
  observacoes?: string; // For disputa observacoes update
  // Auth/User
  username?: string;
  password?: string;
  userId?: number;
  // Batch rules
  rules?: Array<{cnpj: string; airportCode?: string; notes?: string; emailDespachante?: string; enderecoCompleto?: string}>;
  // Metrics / Usage Log
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  perPage?: number;
  page?: number;
  endpoint?: string;
  method?: string;
  // Rule Matrix
  matrixId?: number;
  customer?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
  fileUrl?: string;
  // Rule Row
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
  // Document
  documentId?: number;
  fileName?: string;
  fileType?: string;
  filePath?: string;
  fileSize?: number;
  // Parsed AWB
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
  // AWB Check - new fields
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
  // Log Entry
  logAction?: string;
  entity?: string;
  entityId?: number;
  details?: string;
  // DHL AWB Tracking updates
  updates?: Record<string, any>;
  awbNumbers?: string[];
  // CCT Notification Rules
  cliente_nome?: string;
  cnpj_consignatario?: string;
  aeroportos?: string;
  eventos_disparo?: string;
  canais?: string;
  template_id?: string;
  ativo?: boolean;
  // CHB Module
  itemId?: number;
  reference?: string;
  status_macro?: string;
  step1_status?: string;
  step2_status?: string;
  step3_status?: string;
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
  // SEA (Maritime) Module
  analysisType?: string;
  search?: string;
  analysisId?: string;
  completed?: boolean;
  forceAll?: boolean;
  fileContent?: string;
  role?: string;
  metadata?: any;
  // User Esteira Management
  esteira_role?: string;
  esteira_active?: number;
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
                  const rows = await dbClient.query(`
                    SELECT empresa, charge_description, charge_code, container_type, currency, fee,
                           unit_of_measure, effective_date, expiry_date, effective, data_atualizacao, user_atualizacao
                    FROM ${preferredTable}
                    ORDER BY id DESC
                  `);
                  
                  const metaResult = await dbClient.query(`
                    SELECT MAX(data_atualizacao) AS updated_at, MAX(effective) AS effective 
                    FROM ${preferredTable}
                  `);
                  const meta = metaResult[0] || { updated_at: null, effective: null };
                  
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
                  const rows = await dbClient.query(`
                    SELECT empresa, charge_description, charge_code, container_type, currency, fee,
                           unit_of_measure, effective_date, expiry_date, effective, data_atualizacao, user_atualizacao
                    FROM ${fallbackTable}
                    WHERE empresa = ?
                    ORDER BY id DESC
                  `, [empresa]);
                  
                  const metaResult = await dbClient.query(`
                    SELECT MAX(data_atualizacao) AS updated_at, MAX(effective) AS effective 
                    FROM ${fallbackTable} WHERE empresa = ?
                  `, [empresa]);
                  const meta = metaResult[0] || { updated_at: null, effective: null };
                  
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
            t.valor_nf
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
        console.log('Fetching CCT shipments from t_master_dados (AIR IMPORT)...');
        
        // Registered airline codes for CCT filtering
        const registeredAirlineCodes = [
          '001', '016', '020', '006', '047', '055', '045', '057', '074', '075',
          '118', '125', '139', '157', '172', '176', '235', '369', '399', '406',
          '549', '577', '615', '724', '729', '881', '996'
        ];
        const airlineFilter = registeredAirlineCodes.map(c => `'${c}'`).join(',');
        
        // SLA configuration by status (hours)
        const slaConfigByStatus: Record<string, number> = {
          'COLETA_REALIZADA': 1,
          'CARGA_RECEBIDA_TECA': 6,
          'DEP': 1,
          'ATD': 1,
          'ARR': 1,
          'ATA': 1,
          'RCF': 6,
          'NFD': 6,
          'AWD': 6,
          'DLV': 2,
          'POD': 2,
          'AGUARDANDO_MANIFESTACAO': 24,
        };
        
        // Error statuses to exclude from CCT
        const errorStatuses = [
          'COMPANY_NOT_REGISTERED',
          'NOT_FOUND', 
          'ERRO',
          'ERROR',
          'INVALID_AWB',
          'API_ERROR',
          'TIMEOUT',
          'PARSE_ERROR'
        ];
        const errorStatusFilter = errorStatuses.map(s => `'${s}'`).join(',');
        
        // Query from t_master_dados as primary source, LEFT JOIN t_status_aereo for latest status
        // IMPORTANT: Filter by registered airlines and exclude error statuses
        const shipments = await client.query(`
          SELECT 
            m.id,
            TRIM(m.mawb) as master,
            TRIM(m.hawb) as house,
            TRIM(m.cliente) as cliente,
            TRIM(m.nome_analista) as nome_analista,
            TRIM(m.email_analista) as email_analista,
            m.emails_cliente,
            m.previsao_faturamento,
            m.data_finalizacao,
            COALESCE(s.\`último_status\`, 'AGUARDANDO_MANIFESTACAO') as status_cct_oficial,
            s.\`última atualização\` as ultimo_evento_data,
            COALESCE(s.\`último_status\`, 'AGUARDANDO_MANIFESTACAO') as ultimo_evento_codigo,
            TRIM(s.origem) as aeroporto_origem,
            TRIM(s.destino) as aeroporto_destino,
            s.data_atraso,
            LEFT(TRIM(m.mawb), 3) as airline_code
          FROM ${database}.t_master_dados m
          LEFT JOIN ${database}.t_status_aereo s ON TRIM(m.mawb) = TRIM(s.awb)
          WHERE m.active = 1 
          AND m.tipo_processo = 'AIR IMPORT'
          AND m.data_finalizacao IS NULL
          AND LEFT(TRIM(m.mawb), 3) IN (${airlineFilter})
          AND (s.\`último_status\` IS NULL OR s.\`último_status\` NOT IN (${errorStatusFilter}))
          ORDER BY s.\`última atualização\` DESC, m.id DESC
          LIMIT 500
        `);

        // Calculate SLA status based on specific status, not generic 24h/48h
        const now = new Date();
        const processedShipments = (shipments || []).map((row: any) => {
          const lastUpdate = row.ultimo_evento_data ? new Date(row.ultimo_evento_data) : null;
          const statusCode = row.status_cct_oficial || 'AGUARDANDO_MANIFESTACAO';
          
          // Get SLA hours for this specific status
          const slaHours = slaConfigByStatus[statusCode] ?? 24;
          const hoursSinceUpdate = lastUpdate ? (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60) : null;
          
          // SLA calculation based on status-specific hours
          let slaStatus = 'OK';
          let horasRestantes: number | null = null;
          let percentual: number | null = null;
          
          if (hoursSinceUpdate !== null) {
            horasRestantes = slaHours - hoursSinceUpdate;
            percentual = Math.min(100, Math.max(0, (hoursSinceUpdate / slaHours) * 100));
            
            if (horasRestantes <= 0) {
              slaStatus = 'VENCIDO';
            } else if (horasRestantes <= 0.5) { // 30 minutes
              slaStatus = 'CRITICO';
            } else if (percentual >= 75) {
              slaStatus = 'ALERTA';
            }
          }

          // Check for alert/frozen statuses
          const frozenStatuses = ['FRO', 'FROZEN'];
          const blockStatuses = ['DIS', 'OFLD', 'NOT_FOUND', 'ERRO', 'BLOQUEIO'];
          const isFrozen = frozenStatuses.includes(statusCode);
          const isBlock = blockStatuses.includes(statusCode);

          // Derive CCT status from ultimo_status with expanded mapping
          const statusMap: Record<string, string> = {
            'DEP': 'EM_TRANSITO',
            'MAN': 'MANIFESTADO',
            'BKD': 'MANIFESTADO',
            'ARR': 'CHEGADA_INFORMADA',
            'ATA': 'CHEGADA_INFORMADA',
            'RCF': 'RECEPCIONADO',
            'RCS': 'RECEPCIONADO',
            'NFD': 'DISPONIVEL_RETIRADA',
            'AWD': 'DISPONIVEL_RETIRADA',
            'DLV': 'ENTREGUE',
            'POD': 'ENTREGUE',
            'FRO': 'FROZEN',
            'DIS': 'BLOQUEIO',
            'OFLD': 'BLOQUEIO',
          };
          const derivedStatus = statusMap[statusCode] || statusCode || 'AGUARDANDO_MANIFESTACAO';

          return {
            id: row.id?.toString() || row.master,
            house: row.house || '',
            master: row.master || '',
            cliente: row.cliente || '',
            aeroporto_origem: row.aeroporto_origem || 'N/A',
            aeroporto_destino: row.aeroporto_destino || 'GRU',
            status_cct_oficial: derivedStatus,
            status_manifestacao: statusCode && statusCode !== 'AGUARDANDO_MANIFESTACAO' ? 'MANIFESTADO_CCT' : 'RECEBIDO_NOVA',
            sla_status: slaStatus,
            sla_info: {
              status: slaStatus,
              horasRestantes: horasRestantes !== null ? Math.round(horasRestantes * 100) / 100 : null,
              percentual: percentual !== null ? Math.round(percentual * 100) / 100 : null,
              slaConfigHoras: slaHours,
            },
            sla_limite: null,
            tipo_voo: null,
            ultimo_evento_data: row.ultimo_evento_data,
            ultimo_evento_codigo: statusCode,
            ultimo_evento_descricao: statusCode,
            nome_analista: row.nome_analista,
            email_analista: row.email_analista,
            emails_cliente: row.emails_cliente,
            eta: null,
            etd: null,
            peso_declarado: null,
            peso_constatado: null,
            volume_declarado: null,
            volume_constatado: null,
            cnpj_consignatario: null,
            tratamentos_especiais: null,
            excecoes_abertas: isFrozen ? 1 : isBlock ? 1 : 0,
            is_frozen: isFrozen,
            data_atraso: row.data_atraso,
            data_decolagem_ultimo_trecho: null,
            previsao_faturamento: row.previsao_faturamento,
            data_finalizacao: row.data_finalizacao,
            created_at: row.ultimo_evento_data || new Date().toISOString(),
            updated_at: row.ultimo_evento_data || new Date().toISOString(),
          };
        });

        console.log(`CCT: Found ${processedShipments.length} active AIR IMPORT shipments from registered airlines`);
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
            m.eta,
            m.etd,
            m.peso_bruto as peso_declarado,
            m.cnpj as cnpj_consignatario
          FROM ${database}.t_status_aereo s
          LEFT JOIN ${database}.t_master_dados m ON TRIM(s.awb) = TRIM(m.mawb)
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

        // Map CCT field names to t_status_aereo column names
        const fieldMapping: Record<string, string> = {
          nome_analista: 'nome_analista',
          email_analista: 'email_analista',
          emails_cliente: 'email_cliente',
        };

        const setClauses: string[] = [];
        const values: any[] = [];

        for (const [key, value] of Object.entries(updates)) {
          const dbColumn = fieldMapping[key] || key;
          setClauses.push(`${dbColumn} = ?`);
          values.push(value);
        }

        const whereClause = shipmentId 
          ? `id = ?` 
          : `TRIM(awb) = ?`;
        values.push(shipmentId || (awbNumber || '').trim());

        await client.execute(
          `UPDATE ${database}.t_status_aereo SET ${setClauses.join(', ')} WHERE ${whereClause}`,
          values
        );

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
        const { id: itemId, status_macro, step1_status, step2_status, step3_status } = body;
        console.log('Updating CHB item:', itemId);
        
        const fields: string[] = [];
        const values: any[] = [];
        if (status_macro !== undefined) { fields.push('status_macro = ?'); values.push(status_macro); }
        if (step1_status !== undefined) { fields.push('step1_status = ?'); values.push(step1_status); }
        if (step2_status !== undefined) { fields.push('step2_status = ?'); values.push(step2_status); }
        if (step3_status !== undefined) { fields.push('step3_status = ?'); values.push(step3_status); }
        
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
        console.log('Creating CHB file:', { filename, itemId, etapa });
        
        // Insert file
        const fileResult = await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_files 
          (filename, mime, size_bytes, sha256, rel_path, url, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [filename, mime || null, sizeBytes || null, sha256 || null, relPath || null, url || null, userId || null]);
        
        const fileId = fileResult.lastInsertId;
        
        // Link file to item
        await client.execute(`
          INSERT INTO ai_agente.t_dachser_chb_docs 
          (item_id, file_id, etapa, doc_role, version, is_active, created_by)
          VALUES (?, ?, ?, ?, 1, 1, ?)
        `, [itemId, fileId, etapa || '1', docRole || 'pre_alert', userId || null]);
        
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

      // ==================== SEA (MARITIME) MODULE ====================
      // Tables: t_dachser_sea_items (id, view, arquivo_id, arquivo_label, consignee, container, status, active, active_by, active_at, created_at)
      // t_dachser_sea_runs (id, item_id, mode, thread_id, run_id, status, result_text, created_at)
      // t_dachser_sea_files (id, filename, mime, size_bytes, sha256, rel_path, url, created_at, created_by)
      
      case 'get_maritimo_items': {
        const { analysisType, status, search } = body;
        console.log('Fetching SEA items:', { analysisType, status, search });
        
        let query = `
          SELECT i.id, i.view, i.arquivo_id, i.arquivo_label as base_file_name, 
                 i.consignee, i.container, i.status, i.active, i.created_at,
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
                 i.consignee, i.container, i.status, i.active, i.created_at
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
        
        // First, try to alter the tipo_documento column to VARCHAR if it's still ENUM
        try {
          await client.execute(`ALTER TABLE dados_dachser.t_vouchers MODIFY COLUMN tipo_documento VARCHAR(100) DEFAULT NULL`);
        } catch (alterErr) {
          // Column might already be VARCHAR, ignore error
          console.log('tipo_documento column alter skipped (may already be VARCHAR)');
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
        
        // Insert voucher data into existing t_vouchers table
        const insertResult = await client.execute(`
          INSERT INTO dados_dachser.t_vouchers (
            id, numero_spo, vencimento, cobranca_em_nome_de,
            forma_pagamento, remessa, urgente, urgencia_tipo,
            etapa_atual, status_baixa, status_envio_cliente, status_financeiro,
            tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor,
            cliente_email, filial, data_emissao_documento,
            comentarios_operacao, comentarios_fiscal, comentarios_financeiro,
            ajuste_operacao, ajuste_fiscal, criado_por_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          voucherId,
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
          emptyToNull(voucherData.criado_por_user_id)
        ]);
        
        console.log('Voucher saved to MariaDB t_vouchers, ID:', voucherId);
        result = { success: true, mariadbId: voucherId };
        break;
      }

      case 'update_voucher_esteira': {
        const { voucher_id, ...updateData } = body as any;
        console.log('Updating voucher in dados_dachser.t_vouchers:', voucher_id);
        
        const updates: string[] = [];
        const params: any[] = [];
        
        const fieldMapping: Record<string, string> = {
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
        };
        
        for (const [key, dbField] of Object.entries(fieldMapping)) {
          if (updateData[key] !== undefined) {
            updates.push(`${dbField} = ?`);
            params.push(updateData[key]);
          }
        }
        
        if (updates.length > 0) {
          params.push(voucher_id);
          await client.execute(`
            UPDATE dados_dachser.t_vouchers SET ${updates.join(', ')} WHERE id = ?
          `, params);
        }
        
        result = { success: true };
        break;
      }

      case 'get_vouchers_esteira': {
        const { search, etapa, limit = 100, offset = 0 } = body as any;
        console.log('Fetching vouchers from dados_dachser.t_vouchers');
        
        let whereConditions: string[] = [];
        let params: any[] = [];
        
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
          SELECT * FROM dados_dachser.t_vouchers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        result = { success: true, data: vouchers };
        break;
      }

      case 'get_voucher_by_id': {
        const { voucher_id } = body as any;
        console.log('Fetching voucher by ID:', voucher_id);
        
        const vouchers = await client.query(`
          SELECT * FROM dados_dachser.t_vouchers WHERE id = ?
        `, [voucher_id]);
        
        result = { success: true, data: vouchers?.[0] || null };
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

        console.log('Fetching CCT events for AWB:', queryAwb);

        // Check if table exists first
        try {
          const events = await client.query(`
            SELECT 
              id,
              TRIM(awb) as awb,
              TRIM(codigo_evento) as codigo_evento,
              descricao_evento,
              data_hora_evento,
              fonte,
              aeroporto,
              nivel_confianca,
              created_at
            FROM ${database}.t_cct_eventos_historico
            WHERE TRIM(awb) = TRIM(?)
            ORDER BY data_hora_evento DESC
          `, [queryAwb]);

          result = { success: true, data: events || [] };
        } catch (tableErr) {
          // Table might not exist yet
          console.log('Events table may not exist yet:', tableErr);
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
