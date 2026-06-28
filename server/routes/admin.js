/**
 * server/routes/admin.js
 * Rotas admin: /api/admin/*, /api/system-logs
 * Pool: fin pool (MARIADB_FIN_*) para queries gerais
 *       air pool (MARIADB_AIR_*) para dados_dachser.t_master_dados
 *       sea pool (MARIADB_SEA_*) para bulk-insert
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';

const finQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

export function registerAdminRoutes(app, { resend }) {

  // ==================== SLA CONFIG ====================

  // GET /api/admin/sla-config
  app.get('/api/admin/sla-config', async (req, res) => {
    try {
      const slaConfigs = await finQuery(`SELECT * FROM dados_dachser.t_sla_config ORDER BY etapa ASC`);
      res.json({ success: true, data: slaConfigs || [] });
    } catch (err) {
      console.error('[GET /api/admin/sla-config]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/admin/sla-config/:id
  app.patch('/api/admin/sla-config/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { horas_limite, ativo } = req.body;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
      const slaClauses = [];
      const slaValues = [];
      if (horas_limite !== undefined) { slaClauses.push('horas_limite = ?'); slaValues.push(horas_limite); }
      if (ativo !== undefined) { slaClauses.push('ativo = ?'); slaValues.push(ativo ? 1 : 0); }
      if (slaClauses.length > 0) {
        slaClauses.push('updated_at = NOW()');
        slaValues.push(id);
        await finQuery(`UPDATE dados_dachser.t_sla_config SET ${slaClauses.join(', ')} WHERE id = ?`, slaValues);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/admin/sla-config/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== ADMIN: CONEXÕES ATIVAS ====================

  // GET /api/admin/connections
  app.get('/api/admin/connections', async (req, res) => {
    try {
      const ACTIVITY_WINDOW_MIN = 20;
      const HIDDEN_LOG_USERS = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];

      const acConds = [
        `event_time >= (NOW() - INTERVAL ? MINUTE)`,
        `username != 'unknown'`,
        `username IS NOT NULL`,
        `username != ''`,
        `session_id IS NOT NULL`,
        `username NOT IN (${HIDDEN_LOG_USERS.map(() => '?').join(', ')})`,
      ];
      const acParams = [ACTIVITY_WINDOW_MIN, ...HIDDEN_LOG_USERS];

      const acRows = await finQuery(
        `SELECT
           session_id,
           MIN(username)   AS username,
           MIN(event_time) AS session_started_at,
           MAX(event_time) AS last_activity_at,
           COUNT(*)        AS event_count,
           SUBSTRING_INDEX(
             GROUP_CONCAT(endpoint ORDER BY event_time DESC SEPARATOR '||'),
             '||', 1
           ) AS current_endpoint
         FROM dados_dachser.t_usage_logs
         WHERE ${acConds.join(' AND ')}
         GROUP BY session_id
         ORDER BY last_activity_at DESC`,
        acParams
      );

      const connections = (acRows || []).map(r => ({
        sessionId: r.session_id,
        username: r.username,
        sessionStartedAt: r.session_started_at,
        lastActivityAt: r.last_activity_at,
        eventCount: Number(r.event_count),
        currentEndpoint: String(r.current_endpoint || '').replace(/#dur=\d+$/, ''),
      }));

      const uniqueUsers = new Set(connections.map(c => c.username)).size;
      res.json({
        success: true,
        activityWindowMin: ACTIVITY_WINDOW_MIN,
        totalSessions: connections.length,
        uniqueUsers,
        connections,
        serverNow: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[GET /api/admin/connections]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ==================== ADMIN: METRIC USERS ====================

  // GET /api/admin/metric-users
  app.get('/api/admin/metric-users', async (req, res) => {
    try {
      const HIDDEN_LOG_USERS = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];
      const usersResult = await finQuery(
        `SELECT DISTINCT username FROM dados_dachser.t_usage_logs WHERE username != 'unknown' AND username NOT IN (${HIDDEN_LOG_USERS.map(() => '?').join(', ')}) ORDER BY username ASC`,
        HIDDEN_LOG_USERS
      );
      const users = usersResult.map(row => row.username);
      res.json({ success: true, users });
    } catch (err) {
      console.error('[GET /api/admin/metric-users]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================== ADMIN: DATABASE STATS ====================

  // GET /api/admin/database-stats
  app.get('/api/admin/database-stats', async (req, res) => {
    try {
      const [masterGeneral, masterByModal, uniqueInsertsRows, finNfs, finVoucher, baixas] = await Promise.all([
        queryWithRetry(`
          SELECT MAX(data_insert) as last_update, COUNT(*) as total_records,
            SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
          FROM dados_dachser.t_master_dados WHERE active = 1
        `),
        queryWithRetry(`
          SELECT
            CASE WHEN tipo_processo IN ('AIR IMPORT','AIR EXPORT') THEN 'AIR'
                 WHEN tipo_processo IN ('SEA IMPORT','SEA EXPORT') THEN 'SEA' ELSE 'OTHER' END as modal,
            tipo_processo,
            MAX(data_insert) as last_update, COUNT(*) as total_records,
            SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
          FROM dados_dachser.t_master_dados
          WHERE active = 1 AND tipo_processo IN ('AIR IMPORT','AIR EXPORT','SEA IMPORT','SEA EXPORT')
          GROUP BY modal, tipo_processo ORDER BY modal, tipo_processo
        `),
        queryWithRetry(`
          SELECT tipo_processo, COUNT(*) as unique_inserts
          FROM (
            SELECT DISTINCT n.mawb, n.hawb, n.tipo_processo
            FROM dados_dachser.t_master_dados n
            WHERE n.active = 1 AND n.data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
              AND n.tipo_processo IN ('AIR IMPORT','AIR EXPORT','SEA IMPORT','SEA EXPORT')
              AND NOT EXISTS (
                SELECT 1 FROM dados_dachser.t_master_dados a
                WHERE a.mawb = n.mawb AND a.hawb = n.hawb AND a.active = 1
                  AND a.data_insert < DATE_SUB(NOW(), INTERVAL 24 HOUR)
              )
          ) AS unicos GROUP BY tipo_processo
        `),
        finQuery(`SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.t_dados_financeiro_nfs`),
        finQuery(`SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.t_dados_financeiro_voucher`),
        finQuery(`SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.tbaixas`),
      ]);

      const uniqueMap = {};
      for (const row of uniqueInsertsRows) uniqueMap[row.tipo_processo] = Number(row.unique_inserts || 0);

      const airB = { lastUpdate: null, totalRecords: 0, recentInserts: 0, uniqueInserts: 0, breakdown: { 'AIR IMPORT': { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 }, 'AIR EXPORT': { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 } } };
      const seaB = { lastUpdate: null, totalRecords: 0, recentInserts: 0, uniqueInserts: 0, breakdown: { 'SEA IMPORT': { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 }, 'SEA EXPORT': { lastUpdate: null, count: 0, recentInserts: 0, uniqueInserts: 0 } } };
      let airMax = null, seaMax = null;

      for (const row of masterByModal) {
        const lu = row.last_update ? new Date(row.last_update).toISOString() : null;
        const cnt = Number(row.total_records);
        const ri = Number(row.recent_inserts || 0);
        const ui = uniqueMap[row.tipo_processo] || 0;
        if (row.modal === 'AIR') {
          airB.totalRecords += cnt; airB.recentInserts += ri; airB.uniqueInserts += ui;
          airB.breakdown[row.tipo_processo] = { lastUpdate: lu, count: cnt, recentInserts: ri, uniqueInserts: ui };
          if (row.last_update) { const d = new Date(row.last_update); if (!airMax || d > airMax) airMax = d; }
        } else if (row.modal === 'SEA') {
          seaB.totalRecords += cnt; seaB.recentInserts += ri; seaB.uniqueInserts += ui;
          seaB.breakdown[row.tipo_processo] = { lastUpdate: lu, count: cnt, recentInserts: ri, uniqueInserts: ui };
          if (row.last_update) { const d = new Date(row.last_update); if (!seaMax || d > seaMax) seaMax = d; }
        }
      }
      airB.lastUpdate = airMax ? airMax.toISOString() : null;
      seaB.lastUpdate = seaMax ? seaMax.toISOString() : null;

      res.json({
        t_master_dados: {
          lastUpdate: masterGeneral[0]?.last_update ? new Date(masterGeneral[0].last_update).toISOString() : null,
          totalRecords: Number(masterGeneral[0]?.total_records || 0),
          recentInserts: Number(masterGeneral[0]?.recent_inserts || 0),
          applications: ['AIR', 'SEA', 'CCT', 'TRACKING', 'OLIMPO'],
          byModal: { AIR: airB, SEA: seaB },
        },
        t_dados_financeiro_nfs: {
          lastUpdate: finNfs[0]?.last_update ? new Date(finNfs[0].last_update).toISOString() : null,
          totalRecords: Number(finNfs[0]?.total_records || 0),
          recentInserts: Number(finNfs[0]?.recent_inserts || 0),
          applications: ['REGUA'],
        },
        t_dados_financeiro_voucher: {
          lastUpdate: finVoucher[0]?.last_update ? new Date(finVoucher[0].last_update).toISOString() : null,
          totalRecords: Number(finVoucher[0]?.total_records || 0),
          recentInserts: Number(finVoucher[0]?.recent_inserts || 0),
          applications: ['ESTEIRA'],
        },
        tbaixas: {
          lastUpdate: baixas[0]?.last_update ? new Date(baixas[0].last_update).toISOString() : null,
          totalRecords: Number(baixas[0]?.total_records || 0),
          recentInserts: Number(baixas[0]?.recent_inserts || 0),
          applications: ['ESTEIRA'],
        },
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[GET /api/admin/database-stats]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== ADMIN: MAPBOX TOKEN ====================

  // GET /api/admin/mapbox-token
  app.get('/api/admin/mapbox-token', (req, res) => {
    const token = process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_TOKEN || null;
    if (!token) return res.status(404).json({ error: 'Mapbox token not configured' });
    res.json({ token });
  });

  // GET /api/system-logs
  app.get('/api/system-logs', async (req, res) => {
    res.json({ success: true, data: [], message: 'System logs endpoint (stub — migrate from Supabase edge logs)' });
  });

  // POST /api/admin/test-api-key
  app.post('/api/admin/test-api-key', async (req, res) => {
    const start = Date.now();
    const { apiName, customKey } = req.body || {};
    if (!apiName) return res.status(400).json({ success: false, error: 'apiName é obrigatório', responseTimeMs: 0 });
    const testFns = {
      gemini: async () => {
        const key = customKey || process.env.GEMINI_API_KEY;
        if (!key) return { success: false, error: 'GEMINI_API_KEY não configurada' };
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
        return { success: true, details: 'Gemini API acessível' };
      },
      anthropic: async () => {
        const key = customKey || process.env.ANTHROPIC_API_KEY;
        if (!key) return { success: false, error: 'ANTHROPIC_API_KEY não configurada' };
        const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
        if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
        return { success: true, details: 'Anthropic API acessível' };
      },
      resend: async () => {
        const key = customKey || process.env.RESEND_API_KEY;
        if (!key) return { success: false, error: 'RESEND_API_KEY não configurada' };
        const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } });
        if (!r.ok) return { success: false, error: `HTTP ${r.status}` };
        return { success: true, details: 'Resend API acessível' };
      },
      jsoncargo: async () => {
        const key = customKey || process.env.JSONCARGO_API_KEY;
        if (!key) return { success: false, error: 'JSONCARGO_API_KEY não configurada' };
        return { success: true, details: 'Chave configurada' };
      },
      hapag: async () => {
        const clientId = process.env.HAPAG_CLIENT_ID;
        const apiKey = customKey || process.env.HAPAG_API_KEY;
        if (!clientId || !apiKey) return { success: false, error: 'HAPAG_CLIENT_ID / HAPAG_API_KEY não configuradas' };
        return { success: true, details: 'Credenciais configuradas' };
      },
    };
    try {
      const fn = testFns[apiName];
      if (!fn) return res.json({ success: false, error: `Teste não implementado para "${apiName}"`, responseTimeMs: Date.now() - start });
      const result = await fn();
      return res.json({ ...result, responseTimeMs: Date.now() - start });
    } catch (err) {
      return res.json({ success: false, error: err.message, responseTimeMs: Date.now() - start });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN — Bulk insert master (AIR / SEA) e Clientes Base
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/admin/bulk-insert-master
  app.post('/api/admin/bulk-insert-master', async (req, res) => {
    try {
      const { rows, modal } = req.body || {};
      if (!rows || !Array.isArray(rows) || rows.length === 0)
        return res.status(400).json({ success: false, error: 'Nenhuma linha para inserir' });
      if (!modal || !['AIR', 'SEA'].includes(modal))
        return res.status(400).json({ success: false, error: 'Modal deve ser AIR ou SEA' });

      const tableName = modal === 'AIR' ? 'dados_dachser.t_air_master' : 'dados_dachser.t_sea_master';
      const db = getPoolFor('sea');

      try {
        if (modal === 'AIR') {
          await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hawb ON dados_dachser.t_air_master (master(100), hawb(100))`);
        } else {
          await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hbl ON dados_dachser.t_sea_master (master(100), hbl(100))`);
        }
      } catch (_) {}

      let inserted = 0, updated = 0;
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          let sql, params;
          if (modal === 'SEA') {
            sql = `INSERT INTO ${tableName} (
              nome_analista, customer_no, po, hbl, hawb, master,
              etd, pre_alert_sent, oea_cl_doc, customer_order,
              accrual, dep, eta_ata, email_title, te, at_field,
              wh_treatment, cct_transm, remarks, tipo_processo, data_insert,
              deadline_draft_vgm, drafts_sent, deadline_load, cargo_departed,
              d_term, pod_available, dn_available
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
              nome_analista=COALESCE(VALUES(nome_analista),nome_analista),
              customer_no=COALESCE(VALUES(customer_no),customer_no),
              po=COALESCE(VALUES(po),po),
              hawb=COALESCE(VALUES(hawb),hawb),
              etd=COALESCE(VALUES(etd),etd),
              pre_alert_sent=COALESCE(VALUES(pre_alert_sent),pre_alert_sent),
              oea_cl_doc=COALESCE(VALUES(oea_cl_doc),oea_cl_doc),
              customer_order=COALESCE(VALUES(customer_order),customer_order),
              accrual=COALESCE(VALUES(accrual),accrual),
              dep=COALESCE(VALUES(dep),dep),
              eta_ata=COALESCE(VALUES(eta_ata),eta_ata),
              email_title=COALESCE(VALUES(email_title),email_title),
              te=COALESCE(VALUES(te),te),
              at_field=COALESCE(VALUES(at_field),at_field),
              wh_treatment=COALESCE(VALUES(wh_treatment),wh_treatment),
              cct_transm=COALESCE(VALUES(cct_transm),cct_transm),
              remarks=COALESCE(VALUES(remarks),remarks),
              tipo_processo=COALESCE(VALUES(tipo_processo),tipo_processo),
              data_insert=COALESCE(VALUES(data_insert),data_insert),
              deadline_draft_vgm=COALESCE(VALUES(deadline_draft_vgm),deadline_draft_vgm),
              drafts_sent=COALESCE(VALUES(drafts_sent),drafts_sent),
              deadline_load=COALESCE(VALUES(deadline_load),deadline_load),
              cargo_departed=COALESCE(VALUES(cargo_departed),cargo_departed),
              d_term=COALESCE(VALUES(d_term),d_term),
              pod_available=COALESCE(VALUES(pod_available),pod_available),
              dn_available=COALESCE(VALUES(dn_available),dn_available)`;
            params = [
              row.nome_analista||null, row.customer_no||null, row.po||null,
              row.hbl||null, row.hawb||null, row.master||null,
              row.etd||null, row.pre_alert_sent||null, row.oea_cl_doc??null,
              row.customer_order||null, row.accrual??null, row.dep??null,
              row.eta_ata||null, row.email_title||null, row.te||null, row.at_field||null,
              row.wh_treatment||null, row.cct_transm||null, row.remarks||null,
              row.tipo_processo||null, row.data_insert||null,
              row.deadline_draft_vgm||null, row.drafts_sent??null, row.deadline_load||null,
              row.cargo_departed||null, row.d_term||null, row.pod_available??null, row.dn_available??null,
            ];
          } else {
            sql = `INSERT INTO ${tableName} (
              nome_analista, customer_no, po, hawb, master,
              etd, pre_alert_sent, oea_cl_doc, cargo_departed,
              d_term, pod_dn_available, remarks, tipo_processo, data_insert,
              wh_treatment, cct_transm, eta_ata, email_title
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
              nome_analista=COALESCE(VALUES(nome_analista),nome_analista),
              customer_no=COALESCE(VALUES(customer_no),customer_no),
              po=COALESCE(VALUES(po),po),
              etd=COALESCE(VALUES(etd),etd),
              pre_alert_sent=COALESCE(VALUES(pre_alert_sent),pre_alert_sent),
              oea_cl_doc=COALESCE(VALUES(oea_cl_doc),oea_cl_doc),
              cargo_departed=COALESCE(VALUES(cargo_departed),cargo_departed),
              d_term=COALESCE(VALUES(d_term),d_term),
              pod_dn_available=COALESCE(VALUES(pod_dn_available),pod_dn_available),
              remarks=COALESCE(VALUES(remarks),remarks),
              tipo_processo=COALESCE(VALUES(tipo_processo),tipo_processo),
              data_insert=COALESCE(VALUES(data_insert),data_insert),
              wh_treatment=COALESCE(VALUES(wh_treatment),wh_treatment),
              cct_transm=COALESCE(VALUES(cct_transm),cct_transm),
              eta_ata=COALESCE(VALUES(eta_ata),eta_ata),
              email_title=COALESCE(VALUES(email_title),email_title)`;
            params = [
              row.nome_analista||null, row.customer_no||null, row.po||null,
              row.hawb||null, row.master||null,
              row.etd||null, row.pre_alert_sent||null, row.oea_cl_doc??null,
              row.cargo_departed||null, row.d_term||null, row.pod_dn_available||null,
              row.remarks||null, row.tipo_processo||null, row.data_insert||null,
              row.wh_treatment||null, row.cct_transm||null, row.eta_ata||null, row.email_title||null,
            ];
          }
          const [upsertResult] = await db.execute(sql, params);
          if (upsertResult.affectedRows === 1) inserted++;
          else if (upsertResult.affectedRows === 2) updated++;
          else inserted++;
        } catch (err) {
          errors.push({ index: i, message: err.message });
        }
      }

      res.json({ success: true, inserted, updated, rejected: errors.length, errors });
    } catch (err) {
      console.error('[POST /api/admin/bulk-insert-master]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/admin/bulk-insert-clientes
  app.post('/api/admin/bulk-insert-clientes', async (req, res) => {
    try {
      const { rows } = req.body || {};
      if (!rows || !Array.isArray(rows) || rows.length === 0)
        return res.status(400).json({ success: false, error: 'Nenhuma linha para inserir' });

      const db = getPoolFor('sea');
      let clienteInserted = 0;
      const clienteErrors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          await db.execute(`
            INSERT INTO dados_dachser.t_clientes_base (
              ativo, classificacao, cod_rm, dchr_customer_number, cnpj,
              nome_cliente, cidade_uf, pais, logradouro, cep, info_complementar
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `, [
            row.ativo??1, row.classificacao||null, row.cod_rm??null,
            row.dchr_customer_number||null, row.cnpj||null, row.nome_cliente||null,
            row.cidade_uf||null, row.pais||null, row.logradouro||null,
            row.cep||null, row.info_complementar||null,
          ]);
          clienteInserted++;
        } catch (err) {
          clienteErrors.push({ index: i, message: err.message });
        }
      }

      res.json({ success: true, inserted: clienteInserted, rejected: clienteErrors.length, errors: clienteErrors });
    } catch (err) {
      console.error('[POST /api/admin/bulk-insert-clientes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

}
