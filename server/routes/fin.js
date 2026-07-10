/**
 * server/routes/fin.js
 * Rotas FIN: /api/fin/*, /api/notifications/voucher, /api/freetime/*, /api/fin/disputas/*
 * Pool: MARIADB_FIN_* — databases: dados_dachser, ai_agente
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';
import { randomUUID } from 'crypto';

const finQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

// helper: normaliza campo de data para YYYY-MM-DD HH:MM:SS
function formatDateForMariaDB(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'Invalid Date') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return `${s.split('T')[0]} 00:00:00`;
  const p = new Date(s);
  if (!isNaN(p.getTime())) {
    return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')} 00:00:00`;
  }
  return null;
}

export function registerFinRoutes(app, { resend }) {

// GET /api/fin/pagamentos
app.get('/api/fin/pagamentos', async (req, res) => {
  res.json({ success: true, pagamentos: [], total: 0 });
});

// GET /api/fin/baixas/historico
app.get('/api/fin/baixas/historico', async (req, res) => {
  res.json({ success: true, historico: [], total: 0 });
});

// GET /api/fin/users/:id/esteira-role
app.get('/api/fin/users/:id/esteira-role', async (req, res) => {
  try {
    const { id } = req.params;
    const authUsersTable = process.env.AUTH_USERS_TABLE || 'dados_dachser.t_users_dachser';
    const rows = await finQuery(`SELECT is_admin, esteira_role FROM ${authUsersTable} WHERE id = ?`, [id]);
    let role = 'user';
    if (rows && rows.length > 0) {
      if (rows[0].esteira_role) role = rows[0].esteira_role;
      else if (rows[0].is_admin) role = 'admin';
    }
    res.json({
      success: true,
      data: {
        user_id: Number(id) || id,
        role: role,
        can_approve: true,
        can_pay: true,
        can_upload: true,
        can_view_all: true
      }
    });
  } catch (err) {
    console.error('[GET /api/fin/users/:id/esteira-role]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/filhos-batch
app.post('/api/fin/vouchers/filhos-batch', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/filhos-batch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/stats
app.get('/api/fin/stats', async (req, res) => {
  try {
    const [lastRows, statsRows, etapaRows] = await Promise.all([
      finQuery(`SELECT MAX(data_insert) as last_update FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'`),
      finQuery(`SELECT COUNT(*) as total_records, COALESCE(SUM(valor_nf), 0) as total_valor FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'`),
      finQuery(`SELECT COALESCE(etapa_atual, 'OPERACAO') as etapa, COUNT(*) as count FROM dados_dachser.t_vouchers GROUP BY etapa_atual ORDER BY count DESC`),
    ]);
    const etapaLabels = { RASCUNHO:'Rascunho', OPERACAO:'Operação', FISCAL:'Fiscal', SUPERVISOR:'Supervisor', FINANCEIRO:'Financeiro', ROBO:'Robô', CONCLUIDO:'Concluído', CANCELADO:'Cancelado', A_PROCESSAR:'A Processar' };
    res.json({
      success: true,
      stats: {
        lastUpdate: lastRows[0]?.last_update || null,
        totalVouchers: Number(statsRows[0]?.total_records) || 0,
        totalValor: Number(statsRows[0]?.total_valor) || 0,
        etapaBreakdown: (etapaRows || []).map(r => ({ etapa: r.etapa, label: etapaLabels[r.etapa] || r.etapa, count: Number(r.count) || 0 })),
      },
    });
  } catch (err) {
    console.error('[GET /api/fin/stats]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/users
app.get('/api/fin/users', async (req, res) => {
  try {
    const users = await finQuery(
      `SELECT id, username, email, is_admin,
              COALESCE(esteira_role, NULL) as esteira_role,
              COALESCE(esteira_active, 1) as esteira_active,
              supervisor_id
       FROM dados_dachser.t_users_dachser
       ORDER BY username ASC`
    );
    res.json({ success: true, users: users || [] });
  } catch (err) {
    console.error('[GET /api/fin/users]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/search-masters?spo_prefix=...
app.get('/api/fin/vouchers/search-masters', async (req, res) => {
  try {
    const { spo_prefix } = req.query;
    if (!spo_prefix || String(spo_prefix).length < 2) {
      return res.json({ success: true, data: [] });
    }
    const rows = await finQuery(
      `SELECT DISTINCT voucher_master_id, numero_spo
         FROM dados_dachser.t_vouchers
        WHERE voucher_master_id IS NOT NULL
          AND SUBSTRING_INDEX(TRIM(numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
        LIMIT 50`,
      [spo_prefix]
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/search-masters]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/search?search=...
app.get('/api/fin/vouchers/search', async (req, res) => {
  try {
    const rawTerm = String(req.query.search || '').trim();
    if (!rawTerm || rawTerm.length < 2) return res.json({ success: true, data: [], count: 0 });
    const looksLikeFullNd = /^[A-Z0-9._\-\/]{4,}$/i.test(rawTerm);
    const exactNd = looksLikeFullNd ? rawTerm.split(' ')[0] : null;
    let vouchers = [];
    if (exactNd) {
      vouchers = await finQuery(`
        SELECT v.*,
          COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
          dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
          dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario,
          dfv.valor_nf as dfv_valor_nf, dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
          COALESCE(NULLIF(v.ref_fornecedor, ''), dfv.ref_fornecedor) AS ref_fornecedor,
          COALESCE(NULLIF(v.mawb_mbl, ''), dfv.mawb_mbl) AS mawb_mbl,
          CASE WHEN v.is_master = 1 THEN COALESCE(
            (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
            v.criado_por_user_id)
          ELSE COALESCE(dfv.created_by,
            (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
            v.criado_por_user_id)
          END as dfv_created_by,
          COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_nome,
          COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_user_name,
          (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_nome,
          (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_user_name
        FROM dados_dachser.t_vouchers v
        LEFT JOIN (
          SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao,
            MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social,
            MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf,
            MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
          FROM dados_dachser.t_dados_financeiro_voucher
          WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
          GROUP BY nd
        ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
        WHERE v.sync_status = 'ATIVO'
          AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '')
          AND v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')
          AND (SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci OR dfv.nd IS NOT NULL)
        ORDER BY v.updated_at DESC LIMIT 100`,
      [exactNd, exactNd]);
    }
    res.json({ success: true, data: vouchers || [], count: vouchers?.length || 0 });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/pendentes-rm
app.get('/api/fin/vouchers/pendentes-rm', async (req, res) => {
  try {
    let pendentes;
    try {
      pendentes = await finQuery(`
        WITH spo AS (
          SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario,
                 dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal,
                 dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento,
                 dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.created_by, dfs.detalhes
            FROM dados_dachser.t_dados_financeiro_spo dfs
           WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')
        ),
        voucher AS (
          SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
                 dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
                 dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
                 dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes
            FROM dados_dachser.t_dados_financeiro_voucher dfv
           WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
        ),
        unified AS (
          SELECT * FROM spo
          UNION ALL
          SELECT v.* FROM voucher v
           WHERE NOT EXISTS (
             SELECT 1 FROM spo s
              WHERE s.numero_processo IS NOT NULL
                AND s.numero_processo COLLATE utf8mb4_unicode_ci = v.numero_processo COLLATE utf8mb4_unicode_ci
           )
        )
        SELECT u.* FROM unified u
          LEFT JOIN dados_dachser.t_vouchers v
                 ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
         ORDER BY u.data_vencimento ASC`);
    } catch (e) {
      console.warn('[pendentes-rm] CTE fallback:', e.message);
      pendentes = await finQuery(`
        SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
               dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
               dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
               dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes
          FROM dados_dachser.t_dados_financeiro_voucher dfv
          LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
           AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
           AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ORDER BY dfv.data_vencimento ASC`);
    }
    const normalized = (pendentes || []).map(row => {
      let processos_associados = [];
      if (row.source === 'SPO' && row.detalhes) {
        const seen = new Set();
        processos_associados = String(row.detalhes).split(';').map(s => s.trim()).filter(s => s && !seen.has(s) && seen.add(s));
      }
      return { ...row, processos_associados };
    });
    res.json({ success: true, data: normalized });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/pendentes-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/combined?data_vencimento_inicio=&data_vencimento_fim=
app.get('/api/fin/vouchers/combined', async (req, res) => {
  try {
    const dataVencInicio = req.query.data_vencimento_inicio || req.query.data_emissao_inicio || null;
    const dataVencFim = req.query.data_vencimento_fim || req.query.data_emissao_fim || null;
    const hasMonthFilter = !!(dataVencInicio && dataVencFim);

    // backfill ref_fornecedor/mawb_mbl (idempotente, silencioso)
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS ref_fornecedor VARCHAR(255) DEFAULT NULL`); } catch (_) {}
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS mawb_mbl VARCHAR(255) DEFAULT NULL`); } catch (_) {}
    try {
      await finQuery(`UPDATE dados_dachser.t_vouchers v JOIN (SELECT SUBSTRING_INDEX(TRIM(nd), ' ', 1) AS nd_key, MAX(ref_fornecedor) AS ref_fornecedor, MAX(mawb_mbl) AS mawb_mbl FROM dados_dachser.t_dados_financeiro_voucher WHERE (ref_fornecedor IS NOT NULL AND ref_fornecedor <> '') OR (mawb_mbl IS NOT NULL AND mawb_mbl <> '') GROUP BY nd_key) dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci = dfv.nd_key COLLATE utf8mb4_general_ci SET v.ref_fornecedor = COALESCE(NULLIF(v.ref_fornecedor,''), dfv.ref_fornecedor), v.mawb_mbl = COALESCE(NULLIF(v.mawb_mbl,''), dfv.mawb_mbl) WHERE (v.ref_fornecedor IS NULL OR v.ref_fornecedor = '' OR v.mawb_mbl IS NULL OR v.mawb_mbl = '')`);
    } catch (_) {}

    const ativosMonthClause = hasMonthFilter ? `AND (v.etapa_atual IN ('RASCUNHO','OPERACAO','FINANCEIRO') OR (v.vencimento >= ? AND v.vencimento < ?) OR (v.vencimento IS NULL AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?))` : '';
    const ativosParams = hasMonthFilter ? [dataVencInicio, dataVencFim, dataVencInicio, dataVencFim] : [];

    const combinedAtivos = await finQuery(`
      SELECT v.*,
        COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
        dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
        dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario,
        dfv.valor_nf as dfv_valor_nf, dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
        COALESCE(NULLIF(v.ref_fornecedor, ''), dfv.ref_fornecedor) AS ref_fornecedor,
        COALESCE(NULLIF(v.mawb_mbl, ''), dfv.mawb_mbl) AS mawb_mbl,
        CASE WHEN v.is_master = 1 THEN COALESCE(
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        ELSE COALESCE(dfv.created_by,
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        END as dfv_created_by,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_nome,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_user_name,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_nome,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_user_name
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao,
          MAX(data_vencimento) as data_vencimento, MIN(numero_processo) as numero_processo,
          MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario,
          MAX(valor_nf) as valor_nf, MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE sync_status = "ATIVO"
        AND (voucher_master_id IS NULL OR voucher_master_id = "")
        AND etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')
        AND (etapa_atual NOT IN ("CONCLUIDO","CANCELADO") OR (etapa_atual IN ("CONCLUIDO","CANCELADO") AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
        ${ativosMonthClause}
      ORDER BY v.created_at DESC`, ativosParams);

    const pendentesMonthClause = hasMonthFilter ? `AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?` : '';
    const pendentesParams = hasMonthFilter ? [dataVencInicio, dataVencFim] : [];

    const combinedPendentes = await finQuery(`
      SELECT dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca,
             dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag,
             dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by
        FROM dados_dachser.t_dados_financeiro_voucher dfv
        LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
       WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
         AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
         AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ${pendentesMonthClause}
       ORDER BY dfv.data_vencimento ASC`, pendentesParams);

    res.json({
      success: true,
      ativos: combinedAtivos || [],
      pendentes_rm: combinedPendentes || [],
      count_ativos: combinedAtivos?.length || 0,
      count_pendentes: combinedPendentes?.length || 0,
    });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/combined]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/esteira?search=&etapa=
app.get('/api/fin/vouchers/esteira', async (req, res) => {
  try {
    const { search, etapa } = req.query;
    const whereClauses = [
      '(v.voucher_master_id IS NULL OR v.voucher_master_id = "")',
      `v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')`,
      '(dfv.modal IS NULL OR dfv.modal <> "ADM")',
      '(v.etapa_atual != "CONCLUIDO" OR (v.etapa_atual = "CONCLUIDO" AND v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))',
      `NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = dfv.id_rm AND b.StatusLan IN (1, 2, 3))`,
    ];
    const params = [];
    if (search) {
      whereClauses.push('(v.numero_spo LIKE ? OR v.fornecedor LIKE ? OR v.cnpj_fornecedor LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (etapa) { whereClauses.push('v.etapa_atual = ?'); params.push(etapa); }
    params.push(); // no extra needed
    const vouchers = await finQuery(`
      SELECT v.*, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo,
        dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf,
        dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
        COALESCE(NULLIF(v.ref_fornecedor, ''), dfv.ref_fornecedor) AS ref_fornecedor,
        COALESCE(NULLIF(v.mawb_mbl, ''), dfv.mawb_mbl) AS mawb_mbl,
        CASE WHEN v.is_master = 1 THEN COALESCE(
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'MASTER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        ELSE COALESCE(dfv.created_by,
          (SELECT lc.user_name FROM dados_dachser.t_voucher_logs lc WHERE lc.voucher_id COLLATE utf8mb4_general_ci = v.id COLLATE utf8mb4_general_ci AND lc.acao = 'VOUCHER_CRIADO' ORDER BY lc.data_hora ASC LIMIT 1),
          v.criado_por_user_id)
        END as dfv_created_by,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_nome,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_user_name,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_nome,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_user_name
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MIN(numero_processo) as numero_processo,
          MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf,
          MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY v.id
      ORDER BY v.created_at DESC`, params);
    res.json({ success: true, data: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/esteira]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/find-multi  (usado pelo RoboTab — batch de identificação)
app.post('/api/fin/vouchers/find-multi', async (req, res) => {
  try {
    const { spoPrimary, ndPrimary, spoCandidates = [], ndCandidates = [] } = req.body || {};

    const cols = `id, numero_spo, fornecedor, valor, vencimento, etapa_atual,
                  cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master`;

    const lookupBySPO = async (spo) => {
      if (!spo) return null;
      // busca direta
      const rows = await finQuery(
        `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
           FROM dados_dachser.t_vouchers
          WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
              = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci
          ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5`, [spo]
      );
      if (rows?.length) return { voucher: rows[0], matchedCandidate: `SPO:${spo}` };
      // filho → master
      const child = await finQuery(
        `SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual,
                m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master,
                c.numero_spo as child_spo, 1 as matched_via_child
           FROM dados_dachser.t_vouchers c
           JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
          WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
              = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci
            AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
          LIMIT 1`, [spo]
      );
      if (child?.length) return { voucher: child[0], matchedCandidate: `SPO:${spo}` };
      return null;
    };

    const lookupByND = async (nd) => {
      if (!nd) return null;
      for (const whereClause of [
        `id_rm = ?`,
        `processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`,
        `SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci`,
      ]) {
        const rows = await finQuery(
          `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
             FROM dados_dachser.t_vouchers WHERE ${whereClause}
             ORDER BY created_at DESC LIMIT 5`, [nd]
        );
        if (rows?.length) return { voucher: rows[0], matchedCandidate: `ND:${nd}` };
      }
      return null;
    };

    // Tenta em ordem de prioridade
    const candidates = [
      () => lookupBySPO(spoPrimary),
      () => lookupByND(ndPrimary),
      ...spoCandidates.map(s => () => lookupBySPO(s)),
      ...ndCandidates.map(n => () => lookupByND(n)),
    ];

    for (const fn of candidates) {
      const result = await fn();
      if (result) return res.json({ success: true, ...result });
    }

    res.json({ success: true, voucher: null, matchedCandidate: null });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/find-multi]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/find-by-spo?spo=...  (usado pelo RoboTab)
app.get('/api/fin/vouchers/find-by-spo', async (req, res) => {
  try {
    const spo = String(req.query.spo || '').trim();
    if (!spo) return res.status(400).json({ success: false, error: 'spo é obrigatório' });

    const cols = `id, numero_spo, fornecedor, valor, vencimento, etapa_atual,
                  cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master`;

    // Busca direta por numero_spo
    let vouchers = await finQuery(
      `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
         FROM dados_dachser.t_vouchers
        WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
            = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci
        ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 10`,
      [spo]
    );

    // Fallback: SPO pertence a um voucher filho — retorna o master
    if (!vouchers?.length) {
      vouchers = await finQuery(
        `SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual,
                m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master,
                c.numero_spo as child_spo, 1 as matched_via_child
           FROM dados_dachser.t_vouchers c
           JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
          WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
              = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci
            AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
          LIMIT 5`,
        [spo]
      );
    }

    res.json({ success: true, vouchers: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/find-by-spo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/find-by-nd?nd=...  (usado pelo RoboTab)
app.get('/api/fin/vouchers/find-by-nd', async (req, res) => {
  try {
    const nd = String(req.query.nd || '').trim();
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const cols = `id, numero_spo, fornecedor, valor, vencimento, etapa_atual,
                  cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master`;

    // id_rm exato
    let vouchers = await finQuery(
      `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
         FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5`, [nd]
    );

    // processo_id exato
    if (!vouchers?.length) {
      vouchers = await finQuery(
        `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
           FROM dados_dachser.t_vouchers
          WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
          ORDER BY created_at DESC LIMIT 5`, [nd]
      );
    }

    // numero_spo como ND
    if (!vouchers?.length) {
      vouchers = await finQuery(
        `SELECT ${cols}, NULL as child_spo, 0 as matched_via_child
           FROM dados_dachser.t_vouchers
          WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
              = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci
          ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5`, [nd]
      );
    }

    // Filho → retorna master
    const masterVouchers = await finQuery(
      `SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual,
              m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master,
              c.numero_spo as child_spo, 1 as matched_via_child
         FROM dados_dachser.t_vouchers c
         JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
        WHERE (c.id_rm = ? OR c.processo_id = ?)
          AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
        LIMIT 5`, [nd, nd]
    ).catch(() => []);

    res.json({ success: true, vouchers: [...(vouchers || []), ...(masterVouchers || [])] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/find-by-nd]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/by-nd?nd=...
app.get('/api/fin/vouchers/by-nd', async (req, res) => {
  try {
    const nd = String(req.query.nd || '').trim();
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const cols = `id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id`;
    let vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5`, [nd]);
    if (!vouchers?.length) {
      vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5`, [nd]);
    }
    if (!vouchers?.length) {
      vouchers = await finQuery(`SELECT ${cols} FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5`, [nd]);
    }
    const masterVouchers = await finQuery(`
      SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.is_master, m.nome_master, m.id_rm, m.processo_id, c.id as child_voucher_id, c.numero_spo as child_spo
      FROM dados_dachser.t_vouchers c
      JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
      WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
      LIMIT 5`, [nd, nd]).catch(() => []);

    res.json({ success: true, vouchers: vouchers || [], masterVouchers: masterVouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/by-nd]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/:id
app.get('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const vouchers = await finQuery(`
      SELECT v.*,
        COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento,
        dfv.id_rm AS dfv_id_rm, dfv.numero_processo AS dfv_numero_processo,
        dfv.razao_social AS dfv_razao_social, dfv.nome_beneficiario AS dfv_nome_beneficiario,
        dfv.valor_nf AS dfv_valor_nf, dfv.moeda AS dfv_moeda, dfv.cnpj AS dfv_cnpj, dfv.nome_cobranca AS dfv_nome_cobranca,
        dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
        COALESCE(NULLIF(v.ref_fornecedor, ''), dfv.ref_fornecedor) AS ref_fornecedor,
        COALESCE(NULLIF(v.mawb_mbl, ''), dfv.mawb_mbl) AS mawb_mbl,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_nome,
        COALESCE((SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1), (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_user_name,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_nome,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_user_name
      FROM dados_dachser.t_vouchers v
      LEFT JOIN (
        SELECT nd, MIN(id_rm) AS id_rm, MAX(data_emissao) AS data_emissao, MIN(numero_processo) AS numero_processo,
          MAX(razao_social) AS razao_social, MAX(nome_beneficiario) AS nome_beneficiario, MAX(valor_nf) AS valor_nf,
          MAX(moeda) AS moeda, MAX(cnpj) AS cnpj, MAX(nome_cobranca) AS nome_cobranca,
          MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
        FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      WHERE v.id = ?`, [id]);

    const voucher = vouchers?.[0] || null;
    if (!voucher) return res.json({ success: true, data: null, anexos: [], logs: [] });

    const [anexos, logs] = await Promise.all([
      finQuery(`SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC`, [id]).catch(() => []),
      finQuery(`SELECT id, voucher_id, user_id, user_name, acao, detalhe, data_hora FROM dados_dachser.t_voucher_logs WHERE voucher_id = ? ORDER BY data_hora DESC`, [id]).catch(() => []),
    ]);

    res.json({ success: true, data: voucher, anexos: anexos || [], logs: logs || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/log  (usado pelo RoboTab e outros componentes)
app.post('/api/fin/vouchers/log', async (req, res) => {
  try {
    const { voucher_id, user_id, user_name, acao, detalhe } = req.body || {};
    if (!voucher_id || !acao) return res.status(400).json({ success: false, error: 'voucher_id e acao são obrigatórios' });
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW())`,
      [voucher_id, user_id || null, user_name || 'Sistema', acao, detalhe || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/log]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/esteira  (usado pelo RoboTab — atualiza etapa/status sem guards de edição)
app.patch('/api/fin/vouchers/:id/esteira', async (req, res) => {
  try {
    const { id } = req.params;
    const { updates } = req.body || {};
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'updates é obrigatório' });
    }

    const ALLOWED = new Set([
      'etapa_atual', 'status_baixa', 'status_financeiro', 'status_comprovante',
      'status_envio_cliente', 'status_documento_fiscal', 'is_pronto_para_robo',
      'responsavel_operacao_user_id', 'responsavel_fiscal_user_id',
      'responsavel_financeiro_user_id', 'aprovado_por_user_id',
    ]);

    const setClauses = [];
    const params = [];
    for (const [key, val] of Object.entries(updates)) {
      if (ALLOWED.has(key)) {
        setClauses.push(`${key} = ?`);
        params.push(val);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'Nenhum campo permitido informado' });

    setClauses.push('updated_at = NOW()');
    params.push(id);
    await finQuery(`UPDATE dados_dachser.t_vouchers SET ${setClauses.join(', ')} WHERE id = ?`, params);

    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/esteira]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id
app.patch('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { updates: updatesObj, user_id, user_name, ...directFields } = req.body || {};
    const updateData = updatesObj || directFields;

    const ETAPAS_EDITAVEIS = ['RASCUNHO', 'A_PROCESSAR', 'OPERACAO', 'AJUSTE_OPERACAO'];
    const DATA_EDIT_FIELDS = new Set(['numero_spo','fornecedor','cnpj_fornecedor','valor','moeda','vencimento','data_emissao_documento','cobranca_em_nome_de','forma_pagamento','tipo_documento','filial','urgencia_tipo','cliente_email','remessa','chave_pix']);
    const hasDataEdit = Object.keys(updateData || {}).some(k => DATA_EDIT_FIELDS.has(k));

    const etapaRows = await finQuery(`SELECT etapa_atual, vencimento, valor, forma_pagamento, tipo_documento, fornecedor, cnpj_fornecedor, moeda, data_emissao_documento, cobranca_em_nome_de, filial, urgencia_tipo, chave_pix, numero_spo FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [id]);
    const currentEtapa = etapaRows?.[0]?.etapa_atual || null;
    const beforeRow = etapaRows?.[0] || {};

    if (hasDataEdit && currentEtapa && !ETAPAS_EDITAVEIS.includes(currentEtapa)) {
      try {
        await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDICAO_BLOQUEADA', ?, NOW())`,
          [id, user_id || null, user_name || 'Sistema', `Tentativa de edição bloqueada — etapa: ${currentEtapa}. Campos: ${Object.keys(updateData).join(', ')}`]);
      } catch (_) {}
      return res.status(403).json({ success: false, error: 'EDICAO_BLOQUEADA_ETAPA', message: 'Edição de dados permitida apenas nas etapas A Processar, Operacional e Ajuste Operacional.', etapa_atual: currentEtapa });
    }

    const novaEtapa = updateData?.etapa_atual;
    const ETAPAS_LIVRES_DESTINO = new Set(['A_PROCESSAR','OPERACAO','AJUSTE_OPERACAO','CANCELADO','DEVOLVIDO_FISCAL','RASCUNHO']);
    const ETAPAS_GATED_ORIGEM = new Set(['A_PROCESSAR','OPERACAO']);
    if (novaEtapa && currentEtapa && ETAPAS_GATED_ORIGEM.has(currentEtapa) && !ETAPAS_LIVRES_DESTINO.has(novaEtapa) && novaEtapa !== currentEtapa) {
      const anxRows = await finQuery(`SELECT COUNT(*) AS c FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [id]);
      if (Number(anxRows?.[0]?.c || 0) === 0) {
        try {
          await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'ETAPA_BLOQUEADA_SEM_ANEXO', ?, NOW())`,
            [id, user_id || null, user_name || 'Sistema', `Bloqueado: ${currentEtapa} → ${novaEtapa} sem anexos.`]);
        } catch (_) {}
        return res.status(400).json({ success: false, error: 'ANEXOS_OBRIGATORIOS', message: 'Anexe ao menos 1 documento antes de avançar o voucher.', etapa_atual: currentEtapa, etapa_destino: novaEtapa });
      }
    }

    const fieldMapping = {
      etapa_atual:'etapa_atual', status_baixa:'status_baixa', status_financeiro:'status_financeiro', status_envio_cliente:'status_envio_cliente',
      comentarios_operacao:'comentarios_operacao', comentarios_fiscal:'comentarios_fiscal', comentarios_financeiro:'comentarios_financeiro',
      ajuste_operacao:'ajuste_operacao', ajuste_fiscal:'ajuste_fiscal',
      responsavel_operacao_user_id:'responsavel_operacao_user_id', responsavel_fiscal_user_id:'responsavel_fiscal_user_id',
      responsavel_financeiro_user_id:'responsavel_financeiro_user_id', responsavel_supervisor_user_id:'responsavel_supervisor_user_id',
      aprovado_por_user_id:'aprovado_por_user_id',
      numero_spo:'numero_spo', fornecedor:'fornecedor', cnpj_fornecedor:'cnpj_fornecedor', valor:'valor', moeda:'moeda',
      vencimento:'vencimento', data_emissao_documento:'data_emissao_documento', cobranca_em_nome_de:'cobranca_em_nome_de',
      forma_pagamento:'forma_pagamento', tipo_documento:'tipo_documento', filial:'filial', urgencia_tipo:'urgencia_tipo',
      cliente_email:'cliente_email', remessa:'remessa', chave_pix:'chave_pix',
      status_documento_fiscal:'status_documento_fiscal', status_comprovante:'status_comprovante',
      origem_processo:'origem_processo', is_pronto_para_robo:'is_pronto_para_robo',
      linha_digitavel:'linha_digitavel',
    };
    const dateFields = new Set(['vencimento','data_emissao_documento']);

    const setClauses = [];
    const params = [];
    const diffParts = [];

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (updateData[key] !== undefined) {
        setClauses.push(`${dbField} = ?`);
        const val = dateFields.has(key) ? formatDateForMariaDB(updateData[key]) : updateData[key];
        params.push(val);
        if (key in beforeRow) {
          const bv = String(beforeRow[key] ?? '');
          const av = String(updateData[key] ?? '');
          if (bv !== av) diffParts.push(`${key}: ${bv || '(vazio)'} → ${av || '(vazio)'}`);
        }
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      params.push(id);
      await finQuery(`UPDATE dados_dachser.t_vouchers SET ${setClauses.join(', ')} WHERE id = ?`, params);
      const detalhe = diffParts.length > 0 ? `Voucher editado.\n${diffParts.join('\n')}` : `Voucher editado. Campos: ${Object.keys(updateData).filter(k => fieldMapping[k] !== undefined).join(', ')}`;
      try {
        await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDITADO', ?, NOW())`,
          [id, user_id || null, user_name || 'Sistema', detalhe]);
      } catch (_) {}
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/:id/log
app.post('/api/fin/vouchers/:id/log', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json } = req.body || {};
    if (!acao) return res.status(400).json({ success: false, error: 'acao é obrigatório' });
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_logs
       (id, voucher_id, user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json, data_hora)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, user_id || null, user_name || 'Sistema', acao, detalhe || null,
        origin || 'UI', entity_type || 'VOUCHER', event_type || null,
        payload_json ? JSON.stringify(payload_json) : null,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/log]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/vouchers/:id
app.delete('/api/fin/vouchers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [id]);
    try { await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [id]); } catch (_) {}
    await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/vouchers/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/:id/disassemble
app.post('/api/fin/vouchers/:id/disassemble', async (req, res) => {
  try {
    const master_id = req.params.id;
    const { child_ids, keep_master } = req.body || {};
    const computeDestino = (urgencia, cobranca) => {
      if (String(urgencia || '').toUpperCase() === 'URGENTE_REAL') return 'SUPERVISOR';
      if (String(cobranca || '').toUpperCase() === 'CLIENTE') return 'FINANCEIRO';
      return 'FISCAL';
    };
    const targetIds = (child_ids && child_ids.length > 0)
      ? child_ids
      : ((await finQuery(`SELECT id FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?`, [master_id])) || []).map(r => r.id).filter(Boolean);

    let childrenRestored = 0;
    if (targetIds.length > 0) {
      const ph = targetIds.map(() => '?').join(',');
      const childRows = await finQuery(`SELECT id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN (${ph})`, targetIds);
      for (const c of childRows) {
        await finQuery(`UPDATE dados_dachser.t_vouchers SET voucher_master_id = NULL, etapa_atual = ?, updated_at = NOW() WHERE id = ?`, [computeDestino(c.urgencia_tipo, c.cobranca_em_nome_de), c.id]);
      }
      childrenRestored = childRows.length;
    }

    const remaining = await finQuery(`SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?`, [master_id]);
    const remainingCount = Number(remaining?.[0]?.count || 0);

    if (!keep_master || remainingCount === 0) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [master_id]); } catch (_) {}
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [master_id]); } catch (_) {}
      await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [master_id]);
    }
    res.json({ success: true, childrenRestored, remainingChildren: remainingCount, masterDeleted: !keep_master || remainingCount === 0 });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/disassemble]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/role
app.patch('/api/fin/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_role } = req.body || {};
    await finQuery(`UPDATE dados_dachser.t_users_dachser SET esteira_role = ? WHERE id = ?`, [esteira_role || null, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/role]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/active
app.patch('/api/fin/users/:id/active', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_active } = req.body || {};
    await finQuery(`UPDATE dados_dachser.t_users_dachser SET esteira_active = ? WHERE id = ?`, [esteira_active ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/active]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-2: ACCRUAL ──────────────────────────────────────────────────────────

// GET /api/fin/accrual?search=
app.get('/api/fin/accrual', async (req, res) => {
  try {
    const { search } = req.query;
    let rows;
    if (search) {
      rows = await finQuery(`SELECT * FROM dados_dachser.t_accrual_entries WHERE fornecedor LIKE ? OR shared_code LIKE ? ORDER BY created_at DESC`, [`%${search}%`, `%${search}%`]);
    } else {
      rows = await finQuery(`SELECT * FROM dados_dachser.t_accrual_entries ORDER BY created_at DESC`);
    }
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/accrual]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/accrual
app.post('/api/fin/accrual', async (req, res) => {
  try {
    const { fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id } = req.body || {};
    if (!fornecedor || valor == null) return res.status(400).json({ success: false, error: 'fornecedor e valor são obrigatórios' });
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    await finQuery(`INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fornecedor, valor, shared_code || null, status_accrual || 'ATIVO', uploaded_by_user_id || null]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[POST /api/fin/accrual]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/accrual/bulk
app.post('/api/fin/accrual/bulk', async (req, res) => {
  try {
    const { entries } = req.body || {};
    if (!entries?.length) return res.json({ success: true, inserted: 0 });
    const { randomUUID } = await import('crypto');
    let inserted = 0;
    for (const e of entries) {
      await finQuery(`INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual) VALUES (?, ?, ?, ?, 'ATIVO')`,
        [randomUUID(), e.fornecedor, e.valor, e.shared_code || null]);
      inserted++;
    }
    res.json({ success: true, inserted });
  } catch (err) {
    console.error('[POST /api/fin/accrual/bulk]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/accrual/all
app.delete('/api/fin/accrual/all', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_accrual_entries`);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/accrual/all]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/accrual/:id
app.delete('/api/fin/accrual/:id', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_accrual_entries WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/accrual/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/sync/incremental
app.post('/api/fin/sync/incremental', async (req, res) => {
  try {
    // placeholder — sync lógica gerenciada pelo sistema externo RM
    res.json({ success: true, message: 'Sync iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/sync/baixados
app.post('/api/fin/sync/baixados', async (req, res) => {
  try {
    try { await finQuery(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS sync_status ENUM('ATIVO', 'BAIXADO') DEFAULT 'ATIVO'`); } catch (_) {}
    const result = await finQuery(`
      UPDATE dados_dachser.t_vouchers v
      JOIN dados_dachser.t_dados_financeiro_voucher dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci
      JOIN dados_dachser.tbaixas b ON CAST(dfv.id_rm AS UNSIGNED) = b.IdLancamentoRM
      SET v.sync_status = 'BAIXADO', v.etapa_atual = 'CONCLUIDO'
      WHERE v.sync_status = 'ATIVO'`);
    res.json({ success: true, marked: result?.affectedRows || 0 });
  } catch (err) {
    console.error('[POST /api/fin/sync/baixados]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-3: ANEXOS / COMPROVANTES / MASTER / FILHOS ──────────────────────────

// Migrations idempotentes na inicialização
(async () => {
  try {
    await finQuery(`ALTER TABLE dados_dachser.t_voucher_anexos ADD COLUMN IF NOT EXISTS file_content LONGBLOB NULL`);
  } catch (_) {}
  try {
    await finQuery(`ALTER TABLE dados_dachser.t_voucher_anexos MODIFY COLUMN file_content LONGBLOB NULL`);
  } catch (_) {}
  try {
    await finQuery(`ALTER TABLE dados_dachser.t_voucher_anexos ADD COLUMN IF NOT EXISTS mime_type VARCHAR(200) NULL`);
  } catch (_) {}
  // FIN-5: colunas estendidas de log
  for (const col of [
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'UI'`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30) DEFAULT 'VOUCHER'`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) NULL`,
    `ALTER TABLE dados_dachser.t_voucher_logs ADD COLUMN IF NOT EXISTS payload_json JSON NULL`,
  ]) { try { await finQuery(col); } catch (_) {} }
  // FIN-5: tabela t_dados_rm
  try {
    await finQuery(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dados_rm (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_rm VARCHAR(50) NOT NULL,
        nd VARCHAR(60) DEFAULT NULL,
        nf_disputa TINYINT(1) DEFAULT 0,
        voucher_boleto VARCHAR(60) DEFAULT NULL,
        chave_pix VARCHAR(255) DEFAULT NULL,
        pix_tipo_chave VARCHAR(20) DEFAULT NULL,
        forma_pag VARCHAR(50) DEFAULT NULL,
        fornecedor VARCHAR(255) DEFAULT NULL,
        regras_forma_pag VARCHAR(100) DEFAULT NULL,
        tipo_exec VARCHAR(20) DEFAULT NULL,
        inicio_disputa DATE DEFAULT NULL,
        fim_disputa DATE DEFAULT NULL,
        responsavel_disp VARCHAR(100) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_id_rm (id_rm)
      )
    `);
  } catch (_) {}
  for (const col of [
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS nd VARCHAR(60) DEFAULT NULL AFTER id_rm`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255) DEFAULT NULL AFTER voucher_boleto`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS pix_tipo_chave VARCHAR(20) DEFAULT NULL AFTER chave_pix`,
    `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN IF NOT EXISTS tipo_exec VARCHAR(20) DEFAULT NULL AFTER regras_forma_pag`,
    // FIN-5b: colunas de cancelamento e campos extras de voucher
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelamento_voucher_credito VARCHAR(100) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_por_user_id VARCHAR(36) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_por_user_name VARCHAR(100) NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS cancelado_em DATETIME NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS is_pronto_para_robo TINYINT(1) DEFAULT 0 NULL`,
    `ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS origem_processo VARCHAR(255) NULL`,
  ]) { try { await finQuery(col); } catch (_) {} }
})();

// Migração: coluna file_content para arquivos SEA e tabela de tokens de supervisor
(async () => {
  try { await finQuery(`ALTER TABLE dados_dachser.t_sea_files ADD COLUMN IF NOT EXISTS file_content MEDIUMBLOB NULL`); } catch (_) {}
  try {
    await finQuery(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_supervisor_email_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(36) NOT NULL UNIQUE,
        voucher_id VARCHAR(100) NOT NULL,
        action_type ENUM('APPROVE','REJECT') NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (_) {}
})();

// POST /api/fin/vouchers/anexos — upload arquivo como BLOB
app.post('/api/fin/vouchers/anexos', async (req, res) => {
  try {
    const { voucher_id, tipo, file_name, file_size, mime_type, file_base64, user_id, user_name } = req.body || {};
    if (!voucher_id || !file_name) return res.status(400).json({ success: false, error: 'voucher_id e file_name são obrigatórios' });

    const id = randomUUID();
    let fileBuffer = null;
    if (file_base64) {
      const base64Data = file_base64.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
    }

    const file_url = `/api/fin/vouchers/anexos/${id}/download`;
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [id, voucher_id, tipo || 'OUTROS', file_name, file_url, file_size || 0, mime_type || null, fileBuffer]
    );

    if (user_id || user_name) {
      try {
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
           VALUES (UUID(), ?, ?, ?, 'ANEXO_ADICIONADO', ?, NOW())`,
          [voucher_id, user_id || null, user_name || 'Sistema', `Anexo "${file_name}" (${tipo || 'OUTROS'}) adicionado`]
        );
      } catch (_) {}
    }

    res.json({ success: true, id, file_url });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/anexos/:id/download — serve BLOB
app.get('/api/fin/vouchers/anexos/:id/download', async (req, res) => {
  try {
    const rows = await finQuery(
      `SELECT file_name, mime_type, file_content FROM dados_dachser.t_voucher_anexos WHERE id = ?`,
      [req.params.id]
    );
    const row = rows?.[0];
    if (!row || !row.file_content) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const mime = row.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`);
    res.send(Buffer.isBuffer(row.file_content) ? row.file_content : Buffer.from(row.file_content));
  } catch (err) {
    console.error('[GET /api/fin/vouchers/anexos/:id/download]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fin/vouchers/:id/anexos — lista anexos de um voucher
app.get('/api/fin/vouchers/:id/anexos', async (req, res) => {
  try {
    const rows = await finQuery(
      `SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type
       FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/vouchers/anexos/:id — deleta registro de anexo
app.delete('/api/fin/vouchers/anexos/:id', async (req, res) => {
  try {
    await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/vouchers/anexos/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/comprovantes/batch — attach_comprovante_batch
app.post('/api/fin/vouchers/comprovantes/batch', async (req, res) => {
  try {
    const { comprovantes } = req.body || {};
    if (!Array.isArray(comprovantes) || comprovantes.length === 0) {
      return res.status(400).json({ success: false, error: 'comprovantes[] é obrigatório' });
    }

    const results = comprovantes.map(c => ({ voucher_id: c.voucher_id, success: false }));
    for (let i = 0; i < comprovantes.length; i++) {
      const c = comprovantes[i];
      try {
        let fileBuffer = null;
        if (c.file_base64) {
          const base64Data = c.file_base64.replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(base64Data, 'base64');
        }
        const anexoId = randomUUID();
        const file_url = fileBuffer
          ? `/api/fin/vouchers/anexos/${anexoId}/download`
          : (c.file_url || '');

        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content)
           VALUES (?, ?, 'COMPROVANTE', ?, ?, ?, NOW(), ?, ?)`,
          [anexoId, c.voucher_id, c.file_name, file_url, c.file_size || 0, c.mime_type || null, fileBuffer]
        );
        await finQuery(
          `UPDATE dados_dachser.t_vouchers SET status_comprovante = 'ANEXADO' WHERE id = ?`,
          [c.voucher_id]
        );
        try {
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
             VALUES (UUID(), ?, ?, ?, 'COMPROVANTE_ANEXADO', ?, NOW())`,
            [c.voucher_id, c.user_id || null, c.user_name || 'Sistema', `Comprovante "${c.file_name}" anexado`]
          );
        } catch (_) {}
        results[i].success = true;
      } catch (e) {
        results[i].error = e.message;
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: true, results, successCount, totalCount: comprovantes.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/comprovantes/batch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/batch-documents — upload_batch_document_bulk
app.post('/api/fin/vouchers/batch-documents', async (req, res) => {
  try {
    const { batch_id, userId, documents } = req.body || {};
    if (!batch_id || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, error: 'batch_id e documents[] são obrigatórios' });
    }
    try {
      await finQuery(`CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_batch_documents (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL,
        file_name VARCHAR(500),
        file_url TEXT,
        mime_type VARCHAR(200),
        size_bytes BIGINT DEFAULT 0,
        tipo_anexo VARCHAR(50),
        status VARCHAR(50) DEFAULT 'PENDENTE',
        uploaded_by_user_id VARCHAR(50),
        uploaded_by_user_name VARCHAR(200),
        file_content MEDIUMBLOB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (_) {}

    const ids = [];
    for (const doc of documents) {
      const docId = randomUUID();
      let fileBuffer = null;
      if (doc.file_base64) {
        const base64Data = doc.file_base64.replace(/^data:[^;]+;base64,/, '');
        fileBuffer = Buffer.from(base64Data, 'base64');
      }
      const file_url = fileBuffer
        ? `/api/fin/vouchers/batch-documents/${docId}/download`
        : (doc.file_url || '');
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_batch_documents
         (id, batch_id, file_name, file_url, mime_type, size_bytes, tipo_anexo, status, uploaded_by_user_id, file_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
        [docId, batch_id, doc.file_name, file_url, doc.mime_type || null, doc.size_bytes || 0,
         doc.tipo_anexo || null, String(userId || ''), fileBuffer]
      );
      ids.push(docId);
    }

    res.json({ success: true, ids, inserted: ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch-documents]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/report — export_vouchers_report
app.get('/api/fin/vouchers/report', async (req, res) => {
  try {
    const { etapa, statusBaixa, cobrancaEmNomeDe, statusIntegracaoRm, tipoExecucaoPagamento, dataInicio, dataFim } = req.query;

    const whereConditions = [];
    const params = [];

    if (etapa && etapa !== 'all') {
      if (etapa === 'OPERACAO') {
        whereConditions.push("v.etapa_atual IN ('OPERACAO','A_PROCESSAR','AJUSTE_OPERACAO')");
      } else if (etapa === 'FISCAL') {
        whereConditions.push("v.etapa_atual IN ('FISCAL','AJUSTE_FISCAL')");
      } else {
        whereConditions.push('v.etapa_atual = ?');
        params.push(etapa);
      }
    }
    if (statusBaixa && statusBaixa !== 'all') { whereConditions.push('v.status_baixa = ?'); params.push(statusBaixa); }
    if (cobrancaEmNomeDe && cobrancaEmNomeDe !== 'all') { whereConditions.push('v.cobranca_em_nome_de = ?'); params.push(cobrancaEmNomeDe); }
    if (statusIntegracaoRm && statusIntegracaoRm !== 'all') { whereConditions.push('v.status_integracao_rm = ?'); params.push(statusIntegracaoRm); }
    if (tipoExecucaoPagamento && tipoExecucaoPagamento !== 'all') { whereConditions.push('v.tipo_execucao_pagamento = ?'); params.push(tipoExecucaoPagamento); }
    if (dataInicio) { whereConditions.push('v.created_at >= ?'); params.push(dataInicio); }
    if (dataFim) { whereConditions.push('v.created_at <= ?'); params.push(`${dataFim} 23:59:59`); }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const vouchers = await finQuery(`
      SELECT v.*,
        dfv.ref_fornecedor as dfv_ref_fornecedor, dfv.mawb_mbl as dfv_mawb_mbl,
        COALESCE(NULLIF(v.ref_fornecedor, ''), dfv.ref_fornecedor) AS ref_fornecedor,
        COALESCE(NULLIF(v.mawb_mbl, ''), dfv.mawb_mbl) AS mawb_mbl,
        COALESCE(u_criado.username, (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_nome,
        COALESCE(u_criado.username, (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('VOUCHER_CRIADO', 'MASTER_CRIADO', 'VOUCHER_CRIADO_LOTE', 'VOUCHER_CRIADO_BATCH', 'IMPORTADO_RM', 'MASTER_CRIADO_LOTE', 'VOUCHER_MASTER_CRIADO', 'LOTE_FINALIZADO') ORDER BY data_hora ASC LIMIT 1)) AS criado_por_username,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_nome,
        (SELECT user_name FROM dados_dachser.t_voucher_logs WHERE voucher_id = v.id AND acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE') ORDER BY data_hora DESC LIMIT 1) AS enviado_por_user_name,
        u_operacao.username AS responsavel_operacao_username,
        u_fiscal.username AS responsavel_fiscal_username,
        u_financeiro.username AS responsavel_financeiro_username,
        u_supervisor.username AS responsavel_supervisor_username,
        dfv.created_by AS dfv_created_by
      FROM dados_dachser.t_vouchers v
      LEFT JOIN dados_dachser.t_users_dachser u_criado ON v.criado_por_user_id = u_criado.id
      LEFT JOIN dados_dachser.t_users_dachser u_operacao ON v.responsavel_operacao_user_id = u_operacao.id
      LEFT JOIN dados_dachser.t_users_dachser u_fiscal ON v.responsavel_fiscal_user_id = u_fiscal.id
      LEFT JOIN dados_dachser.t_users_dachser u_financeiro ON v.responsavel_financeiro_user_id = u_financeiro.id
      LEFT JOIN dados_dachser.t_users_dachser u_supervisor ON v.responsavel_supervisor_user_id = u_supervisor.id
      LEFT JOIN (
        SELECT nd, MAX(created_by) AS created_by, MAX(ref_fornecedor) as ref_fornecedor, MAX(mawb_mbl) as mawb_mbl
        FROM dados_dachser.t_dados_financeiro_voucher
        GROUP BY nd
      ) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT 5000
    `, params);

    res.json({ success: true, vouchers: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/report]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/master/search?search= — search_vouchers_for_master
app.get('/api/fin/vouchers/master/search', async (req, res) => {
  try {
    const { search } = req.query;
    if (!search || String(search).length < 6) return res.json({ success: true, data: [] });
    const pattern = `%${search}`;
    const vouchers = await finQuery(`
      SELECT * FROM (
        SELECT
          v.numero_spo COLLATE utf8mb4_general_ci AS processo,
          v.fornecedor COLLATE utf8mb4_general_ci AS fornecedor,
          v.cnpj_fornecedor COLLATE utf8mb4_general_ci AS cnpj_fornecedor,
          v.valor,
          v.moeda COLLATE utf8mb4_general_ci AS moeda,
          v.vencimento
        FROM dados_dachser.t_vouchers v
        WHERE v.is_master = 0 AND v.voucher_master_id IS NULL
          AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO')
        UNION ALL
        SELECT
          a.nd COLLATE utf8mb4_general_ci AS processo,
          a.razao_social COLLATE utf8mb4_general_ci AS fornecedor,
          a.cnpj COLLATE utf8mb4_general_ci AS cnpj_fornecedor,
          a.valor_nf AS valor,
          a.moeda COLLATE utf8mb4_general_ci AS moeda,
          a.data_vencimento AS vencimento
        FROM dados_dachser.t_dados_financeiro_voucher a
      ) x
      WHERE x.processo LIKE ?
    `, [pattern]);
    res.json({ success: true, data: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/master/search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/master — create_voucher_master
app.post('/api/fin/vouchers/master', async (req, res) => {
  try {
    const {
      voucher_ids, nome_master, fornecedor, cnpj_fornecedor, valor_total, moeda,
      vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, filial,
      comentarios_operacao, criado_por_user_id, criado_por_user_name,
    } = req.body || {};

    if (!Array.isArray(voucher_ids) || voucher_ids.length < 2) {
      return res.status(400).json({ success: false, error: 'Mínimo 2 voucher_ids são obrigatórios' });
    }

    const masterId = randomUUID();
    const seqRows = await finQuery(
      `SELECT IFNULL(MAX(CAST(REPLACE(numero_spo,'MASTER-','') AS UNSIGNED)),0)+1 AS next_num
       FROM dados_dachser.t_vouchers WHERE numero_spo LIKE 'MASTER-%'`
    );
    const nextNum = Number(seqRows?.[0]?.next_num || 1);
    const numeroSpoMaster = nome_master || `MASTER-${String(nextNum).padStart(5, '0')}`;

    const criadoPorUserId = criado_por_user_id || req.body?.userId || req.body?.user_id || null;
    await finQuery(
      `INSERT INTO dados_dachser.t_vouchers
       (id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento,
        tipo_documento, cobranca_em_nome_de, filial, comentarios_operacao,
        etapa_atual, is_master, origem_criacao, criado_por_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 1, 'MASTER', ?, NOW(), NOW())`,
      [masterId, numeroSpoMaster, fornecedor || null, cnpj_fornecedor || null,
       valor_total || null, moeda || 'BRL', vencimento || null, forma_pagamento || null,
       tipo_documento || null, cobranca_em_nome_de || 'DACHSER', filial || null,
       comentarios_operacao || null, criadoPorUserId]
    );

    const placeholders = voucher_ids.map(() => '?').join(',');
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET voucher_master_id = ? WHERE numero_spo IN (${placeholders})`,
      [masterId, ...voucher_ids]
    );

    try {
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (UUID(), ?, ?, ?, 'MASTER_CRIADO', ?, NOW())`,
        [masterId, criado_por_user_id || null, criado_por_user_name || 'Sistema',
         `Voucher Master ${numeroSpoMaster} criado consolidando ${voucher_ids.length} processos`]
      );
    } catch (_) {}

    res.json({ success: true, masterId, numeroSpo: numeroSpoMaster, childCount: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/master]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/:id/filhos — filhos de um voucher master
app.get('/api/fin/vouchers/:id/filhos', async (req, res) => {
  try {
    const filhos = await finQuery(
      `SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento,
              etapa_atual, status_envio_cliente, cobranca_em_nome_de, forma_pagamento, tipo_documento
       FROM dados_dachser.t_vouchers
       WHERE voucher_master_id = ?
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: filhos || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/:id/filhos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5e: RM Fetch + Criação de Voucher + Anexos (Criação) ──────────────────────────

// GET /api/fin/rm/fetch?nd= — voucher-integrate-rm action=fetch
app.get('/api/fin/rm/fetch', async (req, res) => {
  try {
    const nd = String(req.query.nd || '').trim();
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const ndBase = nd.split(/\s+/)[0];
    const ndCandidates = [...new Set([nd, ndBase].filter(Boolean))];
    const placeholders = ndCandidates.map(() => '?').join(', ');
    const selectCols = `id_rm, nd, documento, nome_beneficiario, nome_cobranca,
      numero_nf, numero_processo, modal, tipo_pag, forma_pag,
      data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social`;
    const isSpoLike = /^\d+-/.test(ndBase);

    const mapFormaPagamento = (v) => {
      if (!v) return 'BOLETO';
      const u = v.toUpperCase();
      if (u.includes('BOL')) return 'BOLETO';
      if (u.includes('PIX')) return 'TRANSFERENCIA_PIX';
      if (u.includes('TED') || u.includes('DOC') || u.includes('TRANSF')) return 'TRANSFERENCIA_PIX';
      if (u.includes('DEBITO')) return 'DEBITO_CONTA';
      if (u.includes('DARF')) return 'DARF';
      if (u.includes('GPS')) return 'GPS';
      return 'BOLETO';
    };

    let result = [];
    const querySpo = () => finQuery(
      `SELECT ${selectCols} FROM dados_dachser.t_dados_financeiro_spo WHERE nd IN (${placeholders}) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1`,
      [...ndCandidates, ndBase]
    );
    const queryVoucher = () => finQuery(
      `SELECT ${selectCols} FROM dados_dachser.t_dados_financeiro_voucher WHERE nd IN (${placeholders}) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1`,
      [...ndCandidates, ndBase]
    );

    if (isSpoLike) {
      result = await querySpo();
      if (!result || result.length === 0) result = await queryVoucher();
    } else {
      result = await queryVoucher();
      if (!result || result.length === 0) result = await querySpo();
    }

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, error: `ND "${nd}" não encontrado` });
    }

    const r = result[0];
    const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toISOString().split('T')[0]; } catch { return null; } };

    res.json({
      success: true,
      data: {
        idRM: r.id_rm?.toString() || '',
        numeroVoucher: r.nd || '',
        numeroDocumento: r.documento || '',
        fornecedor: r.nome_beneficiario || r.razao_social || '',
        filial: r.nome_cobranca || '',
        numeroNF: r.numero_nf || '',
        numeroProcesso: r.numero_processo || '',
        modal: r.modal || '',
        tipoDocumento: r.tipo_pag || '',
        formaPagamento: mapFormaPagamento(r.forma_pag),
        dataEmissao: fmtDate(r.data_emissao),
        vencimento: fmtDate(r.data_vencimento),
        valor: r.valor_nf ? parseFloat(r.valor_nf) : null,
        moeda: r.moeda || 'BRL',
        cnpjFornecedor: r.cnpj || null,
      },
    });
  } catch (err) {
    console.error('[GET /api/fin/rm/fetch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers — save_voucher_esteira (criar novo voucher)
app.post('/api/fin/vouchers', async (req, res) => {
  try {
    const d = req.body || {};
    const numeroSpo = (d.numero_spo || '').toString().trim();
    if (!numeroSpo) return res.status(400).json({ error: 'numero_spo é obrigatório' });
    if (numeroSpo.startsWith('MANUAL-')) return res.status(400).json({ error: 'Número de voucher/SPO inválido. Use um número real do RM.' });

    const emptyToNull = (v) => (v === '' || v === undefined) ? null : v;
    const toMySQLDate = (dateValue) => {
      const now = new Date();
      const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} 00:00:00.000`;
      if (!dateValue) return fallback;
      try {
        const s = String(dateValue).trim();
        if (!s || s === 'null' || s === 'undefined') return fallback;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00.000`;
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return `${s.split('T')[0]} 00:00:00.000`;
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
          const y = parsed.getFullYear();
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const day = String(parsed.getDate()).padStart(2, '0');
          return `${y}-${m}-${day} 00:00:00.000`;
        }
        return fallback;
      } catch { return fallback; }
    };

    // Duplicate check
    const existing = await finQuery(`SELECT id, numero_spo, etapa_atual FROM dados_dachser.t_vouchers WHERE numero_spo = ?`, [numeroSpo]);
    if (existing && existing.length > 0) {
      const advanced = existing.find(v => v.etapa_atual !== 'A_PROCESSAR');
      if (advanced) {
        return res.status(200).json({
          error: `Voucher com número ${numeroSpo} já existe na etapa ${advanced.etapa_atual}`,
          existingId: advanced.id, existingEtapa: advanced.etapa_atual, duplicate: true,
        });
      }
      for (const ex of existing) {
        await finQuery(`DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?`, [ex.id]);
        await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?`, [ex.id]);
        await finQuery(`DELETE FROM dados_dachser.t_vouchers WHERE id = ?`, [ex.id]);
      }
    }

    const voucherId = d.id || crypto.randomUUID();
    await finQuery(`
      INSERT INTO dados_dachser.t_vouchers (
        id, id_rm, numero_spo, vencimento, cobranca_em_nome_de,
        forma_pagamento, remessa, urgente, urgencia_tipo,
        etapa_atual, status_baixa, status_envio_cliente, status_financeiro,
        tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor,
        cliente_email, filial, data_emissao_documento,
        comentarios_operacao, comentarios_fiscal, comentarios_financeiro,
        ajuste_operacao, ajuste_fiscal, criado_por_user_id,
        processo_id, origem_processo, chave_pix, status_documento_fiscal,
        tipo_execucao_pagamento
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucherId,
        emptyToNull(d.id_rm),
        emptyToNull(d.numero_spo),
        toMySQLDate(d.vencimento),
        emptyToNull(d.cobranca_em_nome_de) || 'DACHSER',
        emptyToNull(d.forma_pagamento) || 'BOLETO',
        emptyToNull(d.remessa) || 'NENHUM',
        d.urgente ? 1 : 0,
        emptyToNull(d.urgencia_tipo) || 'NORMAL',
        emptyToNull(d.etapa_atual) || 'OPERACAO',
        emptyToNull(d.status_baixa) || 'PENDENTE',
        emptyToNull(d.status_envio_cliente) || 'NAO_APLICA',
        emptyToNull(d.status_financeiro) || 'PENDENTE',
        emptyToNull(d.tipo_documento),
        emptyToNull(d.valor),
        emptyToNull(d.moeda) || 'BRL',
        emptyToNull(d.fornecedor),
        d.cnpj_fornecedor ? d.cnpj_fornecedor.replace(/\D/g, '') : null,
        emptyToNull(d.cliente_email),
        emptyToNull(d.filial),
        toMySQLDate(d.data_emissao_documento),
        emptyToNull(d.comentarios_operacao),
        emptyToNull(d.comentarios_fiscal),
        emptyToNull(d.comentarios_financeiro),
        emptyToNull(d.ajuste_operacao),
        emptyToNull(d.ajuste_fiscal),
        emptyToNull(d.criado_por_user_id || d.userId || d.user_id || d.created_by_user_id),
        emptyToNull(d.processo_id),
        emptyToNull(d.origem_processo),
        emptyToNull(d.chave_pix),
        emptyToNull(d.status_documento_fiscal) || 'ANEXADO',
        'A_DEFINIR',
      ]
    );
    res.json({ success: true, mariadbId: voucherId });
  } catch (err) {
    console.error('[POST /api/fin/vouchers]', err.message);
    if (err.message?.includes('já existe') || err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Voucher já existe', duplicate: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fin/vouchers/:id/anexos — save_voucher_anexo
app.post('/api/fin/vouchers/:id/anexos', async (req, res) => {
  try {
    const { id: voucherId } = req.params;
    const { tipo, file_name, file_url, file_size } = req.body || {};
    if (!voucherId || !tipo || !file_name || !file_url) {
      return res.status(400).json({ error: 'voucher_id, tipo, file_name e file_url são obrigatórios' });
    }

    // Detect if master to snapshot filhos_spos
    let isMaster = 0;
    let filhosSposJson = null;
    try {
      const [masterRow] = await finQuery(`SELECT COALESCE(is_master,0) AS is_master FROM dados_dachser.t_vouchers WHERE id = ?`, [voucherId]);
      if (masterRow && Number(masterRow.is_master) === 1) {
        isMaster = 1;
        const filhos = await finQuery(`SELECT numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY numero_spo`, [voucherId]);
        const spos = (filhos || []).map(f => f.numero_spo).filter(Boolean);
        if (spos.length > 0) filhosSposJson = JSON.stringify(spos);
      }
    } catch { /* non-fatal */ }

    const anexoId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, is_master, filhos_spos)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [anexoId, voucherId, tipo, file_name, file_url, file_size || 0, isMaster, filhosSposJson]
    );

    // Post-insert verification
    const [verify] = await finQuery(`SELECT id FROM dados_dachser.t_voucher_anexos WHERE id = ? LIMIT 1`, [anexoId]);
    if (!verify) return res.status(500).json({ success: false, error: 'Falha ao confirmar o anexo no banco.' });

    res.json({ success: true, anexoId });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/anexos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5f: Batch Import ──────────────────────────────────────────────────────

// POST /api/fin/batch-import — create_empty_batch_import (Fechamento Quinzenal)
app.post('/api/fin/batch-import', async (req, res) => {
  try {
    const { userId } = req.body || {};
    // Auto-cleanup: remove lotes abandonados do usuário
    try {
      await finQuery(
        `UPDATE dados_dachser.t_voucher_batch_import SET status = 'ABANDONED'
          WHERE created_by_user_id = ? AND status = 'PENDING_DOCUMENTS'
            AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [String(userId || '')]
      );
    } catch (_) {}
    const batchId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_batch_import
         (id, status, original_file_name, total_rows, valid_rows, error_rows, created_by_user_id, created_by_user_name, tipo)
       VALUES (?, 'PENDING_DOCUMENTS', ?, 0, 0, 0, ?, ?, 'FECHAMENTO_QUINZENAL')`,
      [batchId, 'FECHAMENTO_QUINZENAL', String(userId || ''), String(userId || '')]
    );
    res.json({ success: true, batch_id: batchId, tipo: 'FECHAMENTO_QUINZENAL' });
  } catch (err) {
    console.error('[POST /api/fin/batch-import]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/batch-import/:id/status — get_batch_import_status
app.get('/api/fin/batch-import/:id/status', async (req, res) => {
  try {
    const batchId = req.params.id;
    const batchRows = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_import WHERE id = ?`, [batchId]);
    if (!batchRows || batchRows.length === 0) return res.status(404).json({ success: false, error: 'Lote não encontrado' });
    const items = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? ORDER BY row_index ASC`, [batchId]);
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ? ORDER BY uploaded_at ASC`, [batchId]);

    const voucherIds = (items || []).filter(i => i.voucher_id).map(i => i.voucher_id);
    let anexosByVoucher = {};
    let spoByVoucher = {};
    if (voucherIds.length > 0) {
      const ph = voucherIds.map(() => '?').join(',');
      const allAnexos = await finQuery(`SELECT id, voucher_id, tipo, file_name FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, voucherIds);
      for (const a of (allAnexos || [])) (anexosByVoucher[a.voucher_id] ||= []).push(a);
      try {
        const vrows = await finQuery(`SELECT id, numero_spo FROM dados_dachser.t_vouchers WHERE id IN (${ph})`, voucherIds);
        for (const v of (vrows || [])) spoByVoucher[v.id] = v.numero_spo;
      } catch (_) {}
    }

    const parsedDocs = (docs || []).map(d => {
      let mids = [];
      if (Number(d.is_master_group) === 1 && d.master_voucher_ids) {
        try { mids = typeof d.master_voucher_ids === 'string' ? JSON.parse(d.master_voucher_ids) : d.master_voucher_ids; } catch (_) {}
      }
      return { ...d, is_master_group: Number(d.is_master_group) === 1, master_voucher_ids: mids };
    });
    const masterAnexosByVoucher = {};
    for (const d of parsedDocs) {
      if (!d.is_master_group || !d.tipo_anexo) continue;
      for (const vid of d.master_voucher_ids) (masterAnexosByVoucher[vid] ||= []).push(d.tipo_anexo);
    }

    const checklist = (items || []).filter(i => i.voucher_id).map(i => {
      const ax = anexosByVoucher[i.voucher_id] || [];
      const tiposReais = ax.map(a => a.tipo);
      const tiposGrupo = masterAnexosByVoucher[i.voucher_id] || [];
      const tiposAll = [...tiposReais, ...tiposGrupo];
      let temFatura = tiposAll.some(t => t === 'FATURA' || t === 'FATURA_DEMONSTRATIVO');
      let temBoleto = tiposAll.some(t => t === 'BOLETO' || t === 'BOLETO_INSTRUCOES');
      const temDai = tiposAll.some(t => t === 'DAI');
      if (temDai) { temFatura = true; temBoleto = true; }
      const requerBoleto = i.forma_pagamento === 'BOLETO';
      const isPreLanc = String(i.etapa_destino || '').toUpperCase() === 'PRE_LANCAMENTO';
      let status = 'COMPLETO';
      if (isPreLanc) {
        if (!temFatura && !temBoleto && !temDai) status = 'PENDENTE_DOCUMENTO';
      } else {
        if (!temFatura && requerBoleto && !temBoleto) status = 'PENDENTE_FATURA_E_BOLETO';
        else if (!temFatura) status = 'PENDENTE_FATURA';
        else if (requerBoleto && !temBoleto) status = 'PENDENTE_BOLETO';
      }
      return {
        voucher_id: i.voucher_id,
        numero_spo: spoByVoucher[i.voucher_id] || i.spo || null,
        fornecedor: i.fornecedor, valor: i.valor, vencimento: i.vencimento,
        forma_pagamento: i.forma_pagamento, fatura: i.fatura, id_rm: i.id_rm ?? null,
        temFatura, temBoleto, temDai, requerBoleto, status,
        etapa_destino: i.etapa_destino || null,
      };
    });

    res.json({ success: true, batch: batchRows[0], items, documents: parsedDocs, checklist });
  } catch (err) {
    console.error('[GET /api/fin/batch-import/:id/status]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/batch-import/:id/pre-lancamento — search_pre_lancamento_by_fornecedores
app.get('/api/fin/batch-import/:id/pre-lancamento', async (req, res) => {
  try {
    const batchId = req.params.id;
    const rows = await finQuery(
      `SELECT DISTINCT fornecedor FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND fornecedor IS NOT NULL AND fornecedor <> ''`,
      [batchId]
    );
    const fornecedoresNorm = (rows || []).map(r => String(r.fornecedor).trim().toUpperCase()).filter(Boolean);
    const hasForn = fornecedoresNorm.length > 0;
    const phForn = hasForn ? fornecedoresNorm.map(() => '?').join(',') : '';
    const orderPriority = hasForn ? `CASE WHEN UPPER(TRIM(fornecedor)) IN (${phForn}) THEN 0 ELSE 1 END,` : '';
    const queryParams = [];
    if (hasForn) queryParams.push(...fornecedoresNorm);
    queryParams.push(batchId);
    const vouchers = await finQuery(
      `SELECT id, numero_spo, id_rm, fornecedor, cnpj_fornecedor, valor, moeda,
              vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de,
              urgencia_tipo, processo_id, origem_processo, filial,
              data_emissao_documento, comentarios_operacao, created_at
         FROM dados_dachser.t_vouchers
        WHERE etapa_atual = 'PRE_LANCAMENTO'
          AND voucher_master_id IS NULL
          AND id NOT IN (
            SELECT bi.voucher_id FROM dados_dachser.t_voucher_batch_import_item bi
              JOIN dados_dachser.t_voucher_batch_import b ON b.id = bi.batch_id
             WHERE bi.voucher_id IS NOT NULL
               AND (bi.batch_id = ? OR b.status = 'PENDING_DOCUMENTS')
          )
        ORDER BY ${orderPriority || ''} vencimento ASC, fornecedor ASC, numero_spo ASC
        LIMIT 500`,
      queryParams
    );
    res.json({ success: true, vouchers: vouchers || [] });
  } catch (err) {
    console.error('[GET /api/fin/batch-import/:id/pre-lancamento]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/attach-prelancamento — attach_pre_lancamento_to_batch
app.post('/api/fin/batch-import/:id/attach-prelancamento', async (req, res) => {
  try {
    const batchId = req.params.id;
    const { userId, voucher_ids: voucherIds } = req.body || {};
    if (!Array.isArray(voucherIds) || voucherIds.length === 0)
      return res.status(400).json({ success: false, error: 'voucher_ids são obrigatórios' });
    const batchRows = await finQuery(`SELECT id, status FROM dados_dachser.t_voucher_batch_import WHERE id = ?`, [batchId]);
    if (!batchRows || batchRows.length === 0) return res.status(404).json({ success: false, error: 'Lote não encontrado' });
    if (batchRows[0].status === 'COMPLETE') return res.status(422).json({ success: false, error: 'Lote já finalizado' });
    const ph = voucherIds.map(() => '?').join(',');
    const vchs = await finQuery(
      `SELECT id, numero_spo, id_rm, fornecedor, valor, vencimento, data_emissao_documento,
              forma_pagamento, comentarios_operacao, processo_id, urgencia_tipo, cobranca_em_nome_de
         FROM dados_dachser.t_vouchers WHERE id IN (${ph}) AND etapa_atual = 'PRE_LANCAMENTO'`,
      voucherIds
    );
    if (!vchs || vchs.length === 0) return res.status(404).json({ success: false, error: 'Nenhum voucher elegível encontrado' });
    const existingItems = await finQuery(
      `SELECT voucher_id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IN (${ph})`,
      [batchId, ...voucherIds]
    );
    const alreadyIn = new Set((existingItems || []).map(r => r.voucher_id));
    const maxRow = await finQuery(`SELECT COALESCE(MAX(row_index), -1) AS m FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ?`, [batchId]);
    let nextRow = Number(maxRow?.[0]?.m ?? -1) + 1;
    let attached = 0;
    for (const v of vchs) {
      if (alreadyIn.has(v.id)) continue;
      const destino = String(v.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL'
        ? 'SUPERVISOR'
        : (String(v.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
      const itemId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_batch_import_item
           (id, batch_id, row_index, voucher_id, processo, fornecedor, valor,
            vencimento, data_fatura, forma_pagamento, fatura, historico,
            status, validation_message, raw_json, etapa_destino)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VOUCHER_CRIADO', 'Pré-lançamento anexado ao lote', '{}', ?)`,
        [itemId, batchId, nextRow++, v.id, v.processo_id || null, v.fornecedor, v.valor,
         v.vencimento, v.data_emissao_documento, v.forma_pagamento, v.numero_spo,
         v.comentarios_operacao || null, destino]
      );
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE', updated_at = NOW() WHERE id = ? AND etapa_atual = 'PRE_LANCAMENTO'`,
        [v.id]
      );
      attached++;
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'PRE_LANCAMENTO_ANEXADO_LOTE', ?, NOW())`,
          [logId, v.id, String(userId || ''), String(userId || ''), `batch_id=${batchId}`]
        );
      } catch (_) {}
    }
    res.json({ success: true, attached });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/attach-prelancamento]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/bind-to-voucher — bind_batch_document_to_voucher
app.post('/api/fin/batch-import/:id/bind-to-voucher', async (req, res) => {
  try {
    const { userId, batch_document_id, voucher_id, tipo_anexo } = req.body || {};
    if (!batch_document_id || !voucher_id || !tipo_anexo)
      return res.status(400).json({ success: false, error: 'batch_document_id, voucher_id, tipo_anexo são obrigatórios' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    const items = await finQuery(`SELECT id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id = ?`, [doc.batch_id, voucher_id]);
    if (!items || items.length === 0) return res.status(403).json({ success: false, error: 'Voucher não pertence a este lote' });
    const anexoId = crypto.randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [anexoId, voucher_id, tipo_anexo, doc.file_name, doc.file_url, doc.size_bytes || 0]
    );
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ?, tipo_anexo = ?, status = 'VINCULADO', bound_by_user_id = ?, bound_by_user_name = ?, bound_at = NOW() WHERE id = ?`,
      [voucher_id, anexoId, tipo_anexo, String(userId || ''), String(userId || ''), batch_document_id]
    );
    try {
      const logId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_VINCULADO_LOTE', ?, NOW())`,
        [logId, voucher_id, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; tipo=${tipo_anexo}; file=${doc.file_name}`]
      );
    } catch (_) {}
    res.json({ success: true, anexo_id: anexoId });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/bind-to-voucher]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/bind-to-master — bind_batch_document_to_master_group
app.post('/api/fin/batch-import/:id/bind-to-master', async (req, res) => {
  try {
    const { userId, batch_document_id, voucher_ids, tipo_anexo } = req.body || {};
    if (!batch_document_id || !Array.isArray(voucher_ids) || voucher_ids.length < 2 || !tipo_anexo)
      return res.status(400).json({ success: false, error: 'batch_document_id, voucher_ids[>=2], tipo_anexo obrigatórios' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    const ph = voucher_ids.map(() => '?').join(',');
    const items = await finQuery(
      `SELECT voucher_id FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IN (${ph})`,
      [doc.batch_id, ...voucher_ids]
    );
    if (!items || items.length !== voucher_ids.length)
      return res.status(403).json({ success: false, error: 'Um ou mais vouchers não pertencem a este lote' });
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = NULL, anexo_id = NULL, is_master_group = 1, master_voucher_ids = ?, tipo_anexo = ?, status = 'VINCULADO', bound_by_user_id = ?, bound_by_user_name = ?, bound_at = NOW() WHERE id = ?`,
      [JSON.stringify(voucher_ids), tipo_anexo, String(userId || ''), String(userId || ''), batch_document_id]
    );
    for (const vid of voucher_ids) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_VINCULADO_LOTE_MASTER', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; tipo=${tipo_anexo}; file=${doc.file_name}; group_size=${voucher_ids.length}`]
        );
      } catch (_) {}
    }
    res.json({ success: true, master_pending: true, group_size: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/bind-to-master]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/unbind — unbind_batch_document
app.post('/api/fin/batch-import/:id/unbind', async (req, res) => {
  try {
    const { userId, batch_document_id } = req.body || {};
    if (!batch_document_id) return res.status(400).json({ success: false, error: 'batch_document_id obrigatório' });
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [batch_document_id]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    if (doc.anexo_id) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [doc.anexo_id]); } catch (_) {}
    }
    let masterGroup = [];
    if (Number(doc.is_master_group) === 1 && doc.master_voucher_ids) {
      try { masterGroup = typeof doc.master_voucher_ids === 'string' ? JSON.parse(doc.master_voucher_ids) : doc.master_voucher_ids; } catch (_) {}
    }
    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = NULL, anexo_id = NULL, status = 'PENDENTE', is_master_group = 0, master_voucher_ids = NULL, bound_by_user_id = NULL, bound_by_user_name = NULL, bound_at = NULL WHERE id = ?`,
      [batch_document_id]
    );
    const logTargets = doc.voucher_id ? [doc.voucher_id] : masterGroup;
    for (const vid of logTargets) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'ANEXO_DESVINCULADO_LOTE', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; file=${doc.file_name}`]
        );
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/unbind]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/batch-import/doc/:id — delete_batch_document
app.delete('/api/fin/batch-import/doc/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const { userId } = req.body || {};
    const docs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [docId]);
    if (!docs || docs.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    const doc = docs[0];
    let masterGroup = [];
    if (Number(doc.is_master_group) === 1 && doc.master_voucher_ids) {
      try { masterGroup = typeof doc.master_voucher_ids === 'string' ? JSON.parse(doc.master_voucher_ids) : doc.master_voucher_ids; } catch (_) {}
    }
    if (doc.anexo_id) {
      try { await finQuery(`DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?`, [doc.anexo_id]); } catch (_) {}
    }
    await finQuery(`DELETE FROM dados_dachser.t_voucher_batch_documents WHERE id = ?`, [docId]);
    const logTargets = doc.voucher_id ? [doc.voucher_id] : masterGroup;
    for (const vid of logTargets) {
      try {
        const logId = crypto.randomUUID();
        await finQuery(
          `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'DOCUMENTO_LOTE_EXCLUIDO', ?, NOW())`,
          [logId, vid, String(userId || ''), String(userId || ''), `batch_id=${doc.batch_id}; file=${doc.file_name}`]
        );
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/batch-import/doc/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/batch-import/:id/finalize — finalize_batch_import
app.post('/api/fin/batch-import/:id/finalize', async (req, res) => {
  try {
    const batchId = req.params.id;
    const { userId } = req.body || {};
    const userName = String(userId || '');

    const items = await finQuery(
      `SELECT voucher_id, fornecedor, forma_pagamento, etapa_destino FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IS NOT NULL`,
      [batchId]
    );
    const voucherIds = (items || []).map(i => i.voucher_id);

    const allDocs = await finQuery(`SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ?`, [batchId]);
    const masterDocs = (allDocs || []).filter(d => Number(d.is_master_group) === 1 && d.master_voucher_ids);
    const groupDocs = [];
    for (const d of masterDocs) {
      let vids = [];
      try { vids = typeof d.master_voucher_ids === 'string' ? JSON.parse(d.master_voucher_ids) : d.master_voucher_ids; } catch (_) {}
      if (Array.isArray(vids) && vids.length >= 2) groupDocs.push({ doc: d, vids });
    }
    const masterTiposByVoucher = {};
    for (const g of groupDocs) {
      for (const vid of g.vids) {
        if (g.doc.tipo_anexo) (masterTiposByVoucher[vid] ||= []).push(g.doc.tipo_anexo);
      }
    }

    // Verificar pendências
    const pendentes = [];
    if (voucherIds.length > 0) {
      const ph = voucherIds.map(() => '?').join(',');
      const allAnexos = await finQuery(`SELECT voucher_id, tipo FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, voucherIds);
      const byV = {};
      for (const a of (allAnexos || [])) (byV[a.voucher_id] ||= []).push(a.tipo);
      for (const it of (items || [])) {
        const tipos = [...(byV[it.voucher_id] || []), ...(masterTiposByVoucher[it.voucher_id] || [])];
        let temFatura = tipos.some(t => t === 'FATURA' || t === 'FATURA_DEMONSTRATIVO');
        let temBoleto = tipos.some(t => t === 'BOLETO' || t === 'BOLETO_INSTRUCOES');
        const temDai = tipos.some(t => t === 'DAI');
        if (temDai) { temFatura = true; temBoleto = true; }
        const requerBoleto = it.forma_pagamento === 'BOLETO';
        const isPreLanc = String(it.etapa_destino || '').toUpperCase() === 'PRE_LANCAMENTO';
        const motivos = [];
        if (isPreLanc) {
          if (!temFatura && !temBoleto && !temDai) motivos.push('PENDENTE_DOCUMENTO');
        } else {
          if (!temFatura) motivos.push('PENDENTE_FATURA');
          if (requerBoleto && !temBoleto) motivos.push('PENDENTE_BOLETO');
        }
        if (motivos.length) pendentes.push({ voucher_id: it.voucher_id, fornecedor: it.fornecedor, motivos });
      }
    }
    if (pendentes.length > 0) return res.status(422).json({ success: false, error: 'Lote possui pendências', pendentes });

    // Criar masters a partir dos grupos
    let mastersCreated = 0;
    const groupKey = (vids) => [...vids].sort().join('|');
    const groupsByKey = new Map();
    for (const g of groupDocs) {
      const k = groupKey(g.vids);
      const existing = groupsByKey.get(k);
      if (existing) existing.docs.push(g.doc);
      else groupsByKey.set(k, { vids: g.vids, docs: [g.doc] });
    }
    const childrenPromoted = new Set();
    const extraMasterItems = [];
    const masterErrors = [];

    for (const grp of groupsByKey.values()) {
      try {
        const ph = grp.vids.map(() => '?').join(',');
        const childRows = await finQuery(`
          SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
                 v.vencimento, v.data_emissao_documento, v.tipo_documento, v.forma_pagamento,
                 v.cobranca_em_nome_de, v.filial, v.urgencia_tipo, v.id_rm,
                 v.processo_id, v.origem_processo, v.comentarios_operacao,
                 dfv.idmov AS dfv_idmov,
                 COALESCE(dfv.idmov, v.id_rm) AS sort_key
            FROM dados_dachser.t_vouchers v
            LEFT JOIN dados_dachser.t_dados_financeiro_voucher dfv
              ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci
               = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci
           WHERE v.id IN (${ph})
        `, grp.vids);
        if (!childRows || childRows.length === 0) { masterErrors.push(`Master vazio (vids=${grp.vids.join(',')})`); continue; }

        const withKey = childRows.filter(c => c.sort_key != null);
        let masterSpo;
        if (withKey.length > 0) {
          withKey.sort((a, b) => (parseInt(a.sort_key) || Infinity) - (parseInt(b.sort_key) || Infinity));
          masterSpo = withKey[0].numero_spo;
        } else {
          masterSpo = childRows[0].numero_spo || `MASTER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        }
        try {
          const dup = await finQuery(`SELECT 1 FROM dados_dachser.t_vouchers WHERE numero_spo = ? AND id_rm IS NULL AND is_master = 1 LIMIT 1`, [masterSpo]);
          if (dup && dup.length > 0) masterSpo = `${masterSpo}-M${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        } catch (_) {}

        const totalValor = childRows.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
        const ref = childRows[0];
        const masterId = crypto.randomUUID();
        const destinoMaster = String(ref.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL'
          ? 'SUPERVISOR'
          : (String(ref.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');

        await finQuery(`
          INSERT INTO dados_dachser.t_vouchers
            (id, numero_spo, processo_id, origem_processo, fornecedor, cnpj_fornecedor,
             valor, moeda, vencimento, data_emissao_documento, tipo_documento, filial,
             forma_pagamento, cobranca_em_nome_de, urgencia_tipo, comentarios_operacao,
             etapa_atual, status_baixa, status_financeiro, is_master, nome_master,
             origem_criacao, tipo_execucao_pagamento, criado_por_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', 'PENDENTE', 1, ?, 'IMPORT_LOTE', 'A_DEFINIR', ?, NOW(), NOW())
        `, [
          masterId, masterSpo, ref.processo_id || null, ref.origem_processo || 'CHB',
          ref.fornecedor, ref.cnpj_fornecedor, totalValor, ref.moeda || 'BRL',
          ref.vencimento, ref.data_emissao_documento, ref.tipo_documento, ref.filial,
          ref.forma_pagamento, ref.cobranca_em_nome_de, ref.urgencia_tipo, ref.comentarios_operacao || null,
          destinoMaster, `MASTER ${masterSpo} (${childRows.length})`, String(userId || 'SISTEMA_LOTE'),
        ]);

        await finQuery(
          `UPDATE dados_dachser.t_vouchers SET voucher_master_id = ?, etapa_atual = 'CONSOLIDADO_NO_MASTER', updated_at = NOW() WHERE id IN (${ph})`,
          [masterId, ...grp.vids]
        );
        for (const vid of grp.vids) childrenPromoted.add(vid);

        const masterAnexoKeys = new Set();
        for (const d of grp.docs) {
          const anexoId = crypto.randomUUID();
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [anexoId, masterId, d.tipo_anexo, d.file_name, d.file_url, d.size_bytes || 0]
          );
          masterAnexoKeys.add(`${String(d.tipo_anexo || '').toUpperCase()}|${String(d.file_url || '')}`);
          await finQuery(
            `UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ? WHERE id = ?`,
            [masterId, anexoId, d.id]
          );
        }

        // Extração de linha digitável para master (boleto/DAI) via Supabase edge function
        try {
          const boletoDoc = grp.docs.find(d => ['BOLETO', 'BOLETO_INSTRUCOES'].includes(String(d.tipo_anexo || '').toUpperCase()));
          const daiDoc = grp.docs.find(d => String(d.tipo_anexo || '').toUpperCase() === 'DAI');
          const sourceDoc = boletoDoc || daiDoc;
          if (sourceDoc?.file_url) {
            const fileResponse = await fetch(sourceDoc.file_url);
            if (fileResponse.ok) {
              const ext = await finExtractBoletoWithAnthropic({
                base64: Buffer.from(await fileResponse.arrayBuffer()).toString('base64'),
                mediaType: fileResponse.headers.get('content-type')?.split(';')[0]?.trim() || 'application/pdf',
              });
              if (ext?.linhaDigitavel) {
              await finQuery(
                `UPDATE dados_dachser.t_vouchers SET linha_digitavel = ?, codigo_barras = ?, updated_at = NOW() WHERE id = ?`,
                [ext.linhaDigitavel, ext.codigoBarras || null, masterId]
              );
              }
            }
          }
        } catch (e) { console.warn('[finalize] linha_digitavel master falhou:', e?.message); }

        // Espelhar anexos dos filhos no master
        try {
          const childAnexos = await finQuery(`SELECT tipo, file_name, file_url, file_size FROM dados_dachser.t_voucher_anexos WHERE voucher_id IN (${ph})`, grp.vids);
          for (const a of (childAnexos || [])) {
            const key = `${String(a.tipo || '').toUpperCase()}|${String(a.file_url || '')}`;
            if (masterAnexoKeys.has(key)) continue;
            try {
              const newId = crypto.randomUUID();
              await finQuery(
                `INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [newId, masterId, a.tipo, a.file_name, a.file_url, a.file_size || 0]
              );
              masterAnexoKeys.add(key);
            } catch (_) {}
          }
        } catch (e) { console.error('[finalize] copy child anexos failed:', e?.message); }

        try {
          const logId = crypto.randomUUID();
          await finQuery(
            `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'MASTER_CRIADO_LOTE', ?, NOW())`,
            [logId, masterId, userName, userName, `batch_id=${batchId}; spo=${masterSpo}; children=${grp.vids.length}; total=${totalValor}`]
          );
        } catch (_) {}
        extraMasterItems.push({ voucher_id: masterId, etapa_destino: destinoMaster, fornecedor: ref.fornecedor, forma_pagamento: ref.forma_pagamento });
        mastersCreated++;
      } catch (e) {
        masterErrors.push(`vids=${grp.vids.join(',')}: ${e?.message || String(e)}`);
        console.error('[finalize] master creation failed:', e?.message, 'vids=', grp.vids);
      }
    }

    if (groupsByKey.size > 0 && mastersCreated === 0) {
      return res.status(500).json({ success: false, error: 'Falha ao criar voucher master. Nenhum voucher foi promovido.', master_errors: masterErrors });
    }

    // Promover vouchers para etapa de destino
    const itemsToPromote = [
      ...(items || []).filter(it => !childrenPromoted.has(it.voucher_id)),
      ...extraMasterItems,
    ];
    let promoted = 0;
    for (const it of itemsToPromote) {
      let destino = String(it.etapa_destino || '').toUpperCase();
      if (!destino || !['FISCAL', 'FINANCEIRO', 'SUPERVISOR', 'PRE_LANCAMENTO'].includes(destino)) {
        try {
          const vrows = await finQuery(`SELECT urgencia_tipo, cobranca_em_nome_de, etapa_atual FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [it.voucher_id]);
          const v = vrows && vrows[0];
          if (v) {
            if (String(v.etapa_atual || '').toUpperCase() === 'PRE_LANCAMENTO') destino = 'PRE_LANCAMENTO';
            else destino = String(v.urgencia_tipo || '').toUpperCase() === 'URGENTE_REAL' ? 'SUPERVISOR' : (String(v.cobranca_em_nome_de || '').toUpperCase() === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
          }
        } catch (_) {}
      }
      if (!destino) destino = 'FISCAL';
      try {
        const fromEtapa = destino === 'PRE_LANCAMENTO' ? 'PRE_LANCAMENTO' : 'AGUARDANDO_DOCUMENTOS_LOTE';
        const upd = await finQuery(
          `UPDATE dados_dachser.t_vouchers SET etapa_atual = ?, updated_at = NOW() WHERE id = ? AND etapa_atual = ?`,
          [destino, it.voucher_id, fromEtapa]
        );
        const aff = Number(upd?.affectedRows ?? upd?.affected_rows ?? 0);
        if (aff > 0) {
          promoted++;
          try {
            const logId = crypto.randomUUID();
            await finQuery(
              `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'VOUCHER_PROMOVIDO_LOTE', ?, NOW())`,
              [logId, it.voucher_id, userName, userName, `batch_id=${batchId}; etapa=${destino}`]
            );
          } catch (_) {}
        }
      } catch (e) { console.log('promote voucher failed:', it.voucher_id, e); }
    }

    await finQuery(
      `UPDATE dados_dachser.t_voucher_batch_import SET status = 'COMPLETE', finalized_at = NOW(), finalized_by_user_id = ?, finalized_by_user_name = ? WHERE id = ?`,
      [userName, userName, batchId]
    );
    try {
      const logId = crypto.randomUUID();
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (?, ?, ?, ?, 'IMPORTACAO_LOTE_FINALIZADA', ?, NOW())`,
        [logId, voucherIds[0] || batchId, userName, userName, `batch_id=${batchId}; vouchers=${voucherIds.length}; promovidos=${promoted}`]
      );
    } catch (_) {}
    res.json({ success: true, batch_id: batchId, finalized: true, masters_created: mastersCreated, promoted });
  } catch (err) {
    console.error('[POST /api/fin/batch-import/:id/finalize]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/filhos-batch — get_voucher_filhos_batch
app.post('/api/fin/vouchers/filhos-batch', async (req, res) => {
  try {
    const { master_ids } = req.body || {};
    if (!master_ids || master_ids.length === 0) return res.json({ success: true, data: {} });
    const placeholders = master_ids.map(() => '?').join(',');
    const filhos = await finQuery(
      `SELECT voucher_master_id, MIN(id) as id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual,
              COUNT(*) as qtd_duplicados
       FROM dados_dachser.t_vouchers
       WHERE voucher_master_id IN (${placeholders})
       GROUP BY voucher_master_id, numero_spo, fornecedor, valor, moeda, vencimento, etapa_atual
       ORDER BY numero_spo ASC`,
      master_ids
    );
    const grouped = {};
    for (const filho of (filhos || [])) {
      const mid = filho.voucher_master_id;
      if (!grouped[mid]) grouped[mid] = [];
      grouped[mid].push(filho);
    }
    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/filhos-batch]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/pagamentos — list_pagamentos
app.get('/api/fin/pagamentos', async (req, res) => {
  try {
    const {
      page = 1, perPage,
      filterVencimento, filterStatusPagamento, filterTipoExecucao,
      filterFornecedor, filterBusca, filterCobranca, filterFilial,
      filterMoeda, filterFormaPagamento, filterStatusIntegracaoRm,
      filterDataVencimentoInicio, filterDataVencimentoFim,
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const unlimited = !perPage || perPage === 'all' || perPage === '0';
    const perPageNum = unlimited ? null : (parseInt(perPage) || 50);
    const offset = unlimited ? 0 : (pageNum - 1) * perPageNum;

    const conditions = [
      "v.etapa_atual IN ('FINANCEIRO', 'ROBO')",
      "NOT EXISTS (SELECT 1 FROM dados_dachser.t_dados_financeiro_voucher dfv2 WHERE SUBSTRING_INDEX(TRIM(dfv2.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci AND dfv2.modal = 'ADM')",
      "v.sync_status = 'ATIVO'",
      "(v.voucher_master_id IS NULL OR v.voucher_master_id = '')",
    ];
    const params = [];

    if (filterVencimento === 'hoje') {
      conditions.push("v.vencimento = CURDATE()");
    } else if (filterVencimento === 'vencidos') {
      conditions.push("v.vencimento < CURDATE()");
      conditions.push("(v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL)");
    } else if (filterVencimento === 'proximos7') {
      conditions.push("v.vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)");
    } else if (filterVencimento === 'a_vencer') {
      conditions.push("v.vencimento >= CURDATE()");
    }

    if (filterStatusPagamento) { conditions.push("v.status_pagamento = ?"); params.push(filterStatusPagamento); }
    if (filterTipoExecucao) {
      if (filterTipoExecucao === 'REMESSA') {
        conditions.push("v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H')");
      } else if (filterTipoExecucao === 'A_DEFINIR') {
        conditions.push("(v.tipo_execucao_pagamento IS NULL OR v.tipo_execucao_pagamento = '' OR v.tipo_execucao_pagamento = 'A_DEFINIR')");
      } else {
        conditions.push("v.tipo_execucao_pagamento = ?"); params.push(filterTipoExecucao);
      }
    }
    const termoBusca = (filterBusca || filterFornecedor || '').trim();
    if (termoBusca) {
      if (/^\d+$/.test(termoBusca)) {
        conditions.push("v.numero_spo LIKE ?"); params.push(`${termoBusca}%`);
      } else {
        conditions.push("(v.numero_spo LIKE ? OR v.fornecedor LIKE ?)");
        params.push(`${termoBusca}%`, `%${termoBusca}%`);
      }
    }
    if (filterCobranca) { conditions.push("v.cobranca_em_nome_de = ?"); params.push(filterCobranca); }
    if (filterFilial) { conditions.push("v.filial = ?"); params.push(filterFilial); }
    if (filterMoeda) { conditions.push("v.moeda = ?"); params.push(filterMoeda); }
    if (filterFormaPagamento) { conditions.push("v.forma_pagamento = ?"); params.push(filterFormaPagamento); }
    if (filterStatusIntegracaoRm) { conditions.push("v.status_integracao_rm = ?"); params.push(filterStatusIntegracaoRm); }
    if (filterDataVencimentoInicio) { conditions.push("v.vencimento >= ?"); params.push(filterDataVencimentoInicio); }
    if (filterDataVencimentoFim) { conditions.push("v.vencimento <= ?"); params.push(filterDataVencimentoFim); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = unlimited ? '' : 'LIMIT ? OFFSET ?';
    const listParams = unlimited ? params : [...params, perPageNum, offset];

    const listSql = `
      WITH page_v AS (
        SELECT v.* FROM dados_dachser.t_vouchers v ${whereClause}
        ORDER BY v.vencimento ASC, v.created_at DESC ${limitClause}
      )
      SELECT
        v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda,
        v.vencimento, v.forma_pagamento, v.tipo_documento, v.cobranca_em_nome_de,
        v.filial, v.linha_digitavel, v.codigo_barras, v.status_pagamento,
        v.tipo_execucao_pagamento, v.is_pronto_para_robo, v.lote_remessa_id,
        v.status_integracao_rm, v.etapa_atual, v.status_baixa, v.status_comprovante, v.created_at, v.updated_at,
        v.urgencia_tipo, v.is_master, v.nome_master, v.voucher_master_id, v.comentarios_operacao,
        COALESCE(a.has_boleto_anexo, 0) AS has_boleto_anexo,
        l.user_name AS enviado_por_user_name
      FROM page_v v
      LEFT JOIN (
        SELECT voucher_id, COUNT(*) AS has_boleto_anexo
        FROM dados_dachser.t_voucher_anexos
        WHERE tipo IN ('BOLETO', 'BOLETO_INSTRUCOES') AND voucher_id IN (SELECT id FROM page_v)
        GROUP BY voucher_id
      ) a ON a.voucher_id = v.id
      LEFT JOIN (
        SELECT l1.voucher_id, l1.user_name
        FROM dados_dachser.t_voucher_logs l1
        INNER JOIN (
          SELECT voucher_id, MAX(data_hora) AS max_dh
          FROM dados_dachser.t_voucher_logs
          WHERE acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE')
            AND voucher_id IN (SELECT id FROM page_v)
          GROUP BY voucher_id
        ) m ON m.voucher_id = l1.voucher_id AND m.max_dh = l1.data_hora
        WHERE l1.acao IN ('ENVIADO_OPERACAO','APROVADO_FISCAL','APROVADO_SUPERVISOR','REENVIO_APOS_AJUSTE','APROVADO_URGENTE')
      ) l ON l.voucher_id = v.id
      ORDER BY v.vencimento ASC, v.created_at DESC
    `;
    const statsSql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN v.vencimento >= CURDATE() THEN 1 ELSE 0 END) as a_vencer_count,
        SUM(CASE WHEN v.vencimento >= CURDATE() THEN COALESCE(v.valor, 0) ELSE 0 END) as a_vencer_valor,
        SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN 1 ELSE 0 END) as vencidos_count,
        SUM(CASE WHEN v.vencimento < CURDATE() AND (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) THEN COALESCE(v.valor, 0) ELSE 0 END) as vencidos_valor,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as em_remessa_count,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as em_remessa_valor,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as manual_count,
        SUM(CASE WHEN (v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL) AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as manual_valor,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN 1 ELSE 0 END) as prontos_remessa_count,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H') THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_remessa_valor,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN 1 ELSE 0 END) as prontos_manual_count,
        SUM(CASE WHEN v.is_pronto_para_robo = 1 AND v.tipo_execucao_pagamento = 'MANUAL' THEN COALESCE(v.valor, 0) ELSE 0 END) as prontos_manual_valor,
        SUM(COALESCE(v.valor, 0)) as valor_total
      FROM dados_dachser.t_vouchers v ${whereClause}
    `;

    const countSql = `SELECT COUNT(*) as total FROM dados_dachser.t_vouchers v ${whereClause}`;
    const [countResult, vouchers, statsResult] = await Promise.all([
      finQuery(countSql, params),
      finQuery(listSql, listParams),
      finQuery(statsSql, params),
    ]);
    const total = Number(countResult[0]?.total || 0);
    res.json({
      success: true,
      vouchers: vouchers || [],
      total,
      totalPages: unlimited ? 1 : Math.ceil(total / perPageNum),
      currentPage: unlimited ? 1 : pageNum,
      stats: statsResult[0] || {},
    });
  } catch (err) {
    console.error('[GET /api/fin/pagamentos]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/tipo-execucao — set_tipo_execucao_pagamento
app.patch('/api/fin/vouchers/:id/tipo-execucao', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_execucao_pagamento } = req.body || {};
    const ALLOWED = new Set(['A_DEFINIR', 'MANUAL', 'REMESSA_10H', 'REMESSA_15H', 'PAGO_ADF']);
    if (!id || !tipo_execucao_pagamento) return res.status(400).json({ error: 'id e tipo_execucao_pagamento são obrigatórios' });
    if (!ALLOWED.has(tipo_execucao_pagamento)) return res.status(400).json({ error: `tipo_execucao_pagamento inválido: ${tipo_execucao_pagamento}` });

    if (tipo_execucao_pagamento === 'PAGO_ADF') {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET tipo_execucao_pagamento = ?,
         etapa_atual = CASE WHEN etapa_atual = 'FINANCEIRO' THEN 'ROBO' ELSE etapa_atual END,
         updated_at = NOW() WHERE id = ?`,
        [tipo_execucao_pagamento, id]
      );
    } else {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET tipo_execucao_pagamento = ?, updated_at = NOW() WHERE id = ?`,
        [tipo_execucao_pagamento, id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/tipo-execucao]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/batch-tipo-execucao — batch_set_tipo_execucao
app.post('/api/fin/vouchers/batch-tipo-execucao', async (req, res) => {
  try {
    const { voucher_ids, tipo_execucao_pagamento } = req.body || {};
    const ALLOWED = new Set(['A_DEFINIR', 'MANUAL', 'REMESSA_10H', 'REMESSA_15H', 'PAGO_ADF']);
    if (!voucher_ids || voucher_ids.length === 0 || !tipo_execucao_pagamento)
      return res.status(400).json({ error: 'voucher_ids e tipo_execucao_pagamento são obrigatórios' });
    if (!ALLOWED.has(tipo_execucao_pagamento))
      return res.status(400).json({ error: `tipo_execucao_pagamento inválido: ${tipo_execucao_pagamento}` });

    const placeholders = voucher_ids.map(() => '?').join(',');
    const isAdf = tipo_execucao_pagamento === 'PAGO_ADF';
    await finQuery(
      `UPDATE dados_dachser.t_vouchers
       SET tipo_execucao_pagamento = ?,
           ${isAdf ? "etapa_atual = CASE WHEN etapa_atual = 'FINANCEIRO' THEN 'ROBO' ELSE etapa_atual END," : ''}
           updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [tipo_execucao_pagamento, ...voucher_ids]
    );
    res.json({ success: true, updated: voucher_ids.length });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch-tipo-execucao]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/pronto-robo — set_ready_for_robo
app.patch('/api/fin/vouchers/:id/pronto-robo', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pronto } = req.body || {};
    if (!id) return res.status(400).json({ error: 'voucher_id é obrigatório' });

    const [voucher] = await finQuery(
      `SELECT tipo_execucao_pagamento, forma_pagamento, status_comprovante FROM dados_dachser.t_vouchers WHERE id = ?`,
      [id]
    );
    const tipoExec = voucher?.tipo_execucao_pagamento;
    const formaPag = String(voucher?.forma_pagamento || '').toUpperCase();
    const statusComp = String(voucher?.status_comprovante || '').toUpperCase();
    const isDebito = formaPag === 'DEBITO';
    const isPagoAdf = tipoExec === 'PAGO_ADF';

    if (is_pronto && isPagoAdf) {
      if (statusComp !== 'ANEXADO' && statusComp !== 'VALIDADO') {
        return res.status(409).json({ error: 'COMPROVANTE_OBRIGATORIO', message: 'Anexe o comprovante antes de marcar como pronto.' });
      }
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET is_pronto_para_robo = 1, status_pagamento = 'PAGO',
         status_baixa = 'BAIXA_MANUAL', status_financeiro = 'CONCLUIDO', etapa_atual = 'CONCLUIDO', updated_at = NOW()
         WHERE id = ?`,
        [id]
      );
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (?, ?, NULL, 'Sistema', 'CONCLUIDO_PAGO_ADF', 'Voucher concluído via Pago em ADF — comprovante anexado, sem passar pelo robô', NOW())`,
        [crypto.randomUUID(), id]
      ).catch(() => {});
      return res.json({ success: true, auto_concluded: true, reason: 'PAGO_ADF' });
    }

    if (is_pronto && isDebito) {
      await finQuery(
        `UPDATE dados_dachser.t_vouchers SET is_pronto_para_robo = 1, status_pagamento = 'PAGO',
         status_baixa = 'BAIXA_DEBITO', status_financeiro = 'CONCLUIDO', status_comprovante = 'NAO_APLICA',
         etapa_atual = 'CONCLUIDO', updated_at = NOW() WHERE id = ?`,
        [id]
      );
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (?, ?, NULL, 'Sistema', 'BAIXA_DEBITO_AUTOMATICA', 'Voucher concluído via débito automático — sem comprovante necessário', NOW())`,
        [crypto.randomUUID(), id]
      ).catch(() => {});
      return res.json({ success: true, auto_concluded: true, reason: 'DEBITO' });
    }

    const statusBaixa = (tipoExec || '').includes('REMESSA') ? 'BAIXA_REMESSA' : 'BAIXA_MANUAL';
    await finQuery(
      `UPDATE dados_dachser.t_vouchers
       SET is_pronto_para_robo = ?,
           status_pagamento = CASE WHEN ? = 1 THEN 'PRONTO' ELSE status_pagamento END,
           status_baixa = CASE WHEN ? = 1 THEN ? ELSE status_baixa END,
           etapa_atual = CASE WHEN ? = 1 THEN 'ROBO' ELSE etapa_atual END,
           updated_at = NOW()
       WHERE id = ?`,
      [is_pronto ? 1 : 0, is_pronto ? 1 : 0, is_pronto ? 1 : 0, statusBaixa, is_pronto ? 1 : 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/pronto-robo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/dados-rm/tipo-exec — update_tipo_exec_dados_rm
app.patch('/api/fin/dados-rm/tipo-exec', async (req, res) => {
  try {
    const { id_rm, numero_spo, tipo_exec } = req.body || {};
    const updateKey = id_rm || numero_spo;
    if (!updateKey) return res.status(400).json({ error: 'id_rm ou numero_spo é obrigatório' });
    await finQuery(
      `UPDATE dados_dachser.t_dados_rm SET tipo_exec = ? WHERE id_rm = ? OR nd = ?`,
      [tipo_exec || null, updateKey, numero_spo || updateKey]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/dados-rm/tipo-exec]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5c: Fornecedores sem Fiscal + Backlog RM + Faturas + Dados Bancários ──────────────────────────

// Ensure table exists helper (called once per endpoint)
const ensureFornecedoresSemFiscalTable = async () => {
  await finQuery(`CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_fornecedores_sem_fiscal (
    id INT AUTO_INCREMENT PRIMARY KEY, cnpj VARCHAR(20) NOT NULL, nome VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(150) NULL,
    active TINYINT(1) DEFAULT 1, UNIQUE KEY uniq_cnpj (cnpj)
  ) COLLATE=utf8mb4_unicode_ci`);
};

// GET /api/fin/fornecedores-sem-fiscal
app.get('/api/fin/fornecedores-sem-fiscal', async (req, res) => {
  try {
    await ensureFornecedoresSemFiscalTable();
    const countRows = await finQuery('SELECT COUNT(*) as total FROM dados_dachser.t_voucher_fornecedores_sem_fiscal');
    if (Number(countRows?.[0]?.total || 0) === 0) {
      const seed = [
        ["10.250.551/0003-29","LECHMAN TERMINAIS EIRELI"],["02.762.121/0009-53","SANTOS BRASIL PARTICIPACOES S/A"],
        ["15.578.569/0001-06","GRU AIRPORT"],["86.846.847/0001-07","ALLINK TRANSPORTES INTERNACIONAIS LTDA"],
        ["02.502.234/0001-62","COSCO BRASIL"],["01.831.941/0001-30","CRAFT"],
        ["37.115.342/0031-82","DEPARTAMENTO FUNDO DE MARINHA MERCANTE"],["05.895.924/0001-17","TK BR DESPACHANTE ADUANEIRO"],
        ["24.620.316/0003-06","PAC LOG"],["28.689.596/0001-06","ONE OCEAN"],["02.378.779/0001-09","MSC MEDITERRANEAN"],
      ];
      for (const [cnpj, nome] of seed) {
        try { await finQuery('INSERT IGNORE INTO dados_dachser.t_voucher_fornecedores_sem_fiscal (cnpj, nome, created_by) VALUES (?,?,?)', [cnpj, nome, 'SEED']); } catch (_) {}
      }
    }
    const rows = await finQuery('SELECT id, cnpj, nome, created_by, created_at FROM dados_dachser.t_voucher_fornecedores_sem_fiscal WHERE active = 1 ORDER BY nome ASC');
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/fornecedores-sem-fiscal]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/fornecedores-sem-fiscal
app.post('/api/fin/fornecedores-sem-fiscal', async (req, res) => {
  try {
    const { cnpj, nome, created_by } = req.body || {};
    if (!cnpj || !nome) return res.status(400).json({ success: false, error: 'cnpj e nome são obrigatórios' });
    await ensureFornecedoresSemFiscalTable();
    const exists = await finQuery('SELECT id FROM dados_dachser.t_voucher_fornecedores_sem_fiscal WHERE cnpj = ? LIMIT 1', [cnpj]);
    if (exists && exists.length > 0) {
      await finQuery('UPDATE dados_dachser.t_voucher_fornecedores_sem_fiscal SET nome=?, active=1, created_by=COALESCE(?,created_by) WHERE cnpj=?', [nome, created_by||null, cnpj]);
      res.json({ success: true, message: 'Fornecedor reativado/atualizado' });
    } else {
      await finQuery('INSERT INTO dados_dachser.t_voucher_fornecedores_sem_fiscal (cnpj, nome, created_by) VALUES (?,?,?)', [cnpj, nome, created_by||null]);
      res.json({ success: true, message: 'Fornecedor adicionado' });
    }
  } catch (err) {
    console.error('[POST /api/fin/fornecedores-sem-fiscal]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/fornecedores-sem-fiscal/:id
app.delete('/api/fin/fornecedores-sem-fiscal/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await finQuery('UPDATE dados_dachser.t_voucher_fornecedores_sem_fiscal SET active=0 WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/fin/fornecedores-sem-fiscal/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/faturas/hoje
app.get('/api/fin/faturas/hoje', async (req, res) => {
  try {
    const rows = await finQuery(`
      SELECT v.id, v.numero_spo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.vencimento,
             v.forma_pagamento, v.status_baixa, v.etapa_atual, v.linha_digitavel, v.remessa, v.id_rm
      FROM dados_dachser.t_vouchers v
      WHERE DATE(v.vencimento) = CURDATE() AND v.etapa_atual IN ('FINANCEIRO', 'ROBO')
      ORDER BY v.vencimento ASC, v.fornecedor ASC
    `);
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/faturas/hoje]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/fornecedor/dados-bancarios?cnpj=
app.get('/api/fin/fornecedor/dados-bancarios', async (req, res) => {
  try {
    const cnpj = String(req.query.cnpj || '').replace(/\D/g, '');
    if (!cnpj) return res.status(400).json({ success: false, error: 'cnpj é obrigatório' });
    const rows = await finQuery(`
      SELECT banco, agencia, digito_agencia, conta_corrente, digito_conta, razao_social, cnpj
      FROM dados_dachser.t_dados_financeiro_pag
      WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? LIMIT 1
    `, [cnpj]);
    if (rows && rows.length > 0) {
      res.json({ success: true, data: rows[0] });
    } else {
      res.json({ success: false, error: 'Dados bancários não encontrados' });
    }
  } catch (err) {
    console.error('[GET /api/fin/fornecedor/dados-bancarios]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/pendentes-rm
app.get('/api/fin/vouchers/pendentes-rm', async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || '200'));
    let pendentes;
    try {
      pendentes = await finQuery(`
        WITH spo AS (
          SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario,
                 dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal,
                 dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento,
                 dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.detalhes
            FROM dados_dachser.t_dados_financeiro_spo dfs
           WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')
        ),
        voucher AS (
          SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
                 dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
                 dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
                 dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, NULL AS detalhes
            FROM dados_dachser.t_dados_financeiro_voucher dfv
           WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
             AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
        ),
        unified AS (
          SELECT * FROM spo
          UNION ALL
          SELECT v.* FROM voucher v
           WHERE NOT EXISTS (
             SELECT 1 FROM spo s WHERE s.numero_processo IS NOT NULL
               AND s.numero_processo = v.numero_processo COLLATE utf8mb4_unicode_ci
           )
        )
        SELECT u.* FROM unified u
        LEFT JOIN dados_dachser.t_vouchers v
               ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci
                = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
        LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM
        WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
        ORDER BY u.data_vencimento ASC LIMIT ?
      `, [limit]);
    } catch (_) {
      pendentes = await finQuery(`
        SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario,
               dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal,
               dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento,
               dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, NULL AS detalhes
          FROM dados_dachser.t_dados_financeiro_voucher dfv
          LEFT JOIN dados_dachser.t_vouchers v
                 ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci
                  = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci
          LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM
         WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL
           AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%')
           AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')
         ORDER BY dfv.data_vencimento ASC LIMIT ?
      `, [limit]);
    }
    const normalized = (pendentes || []).map(row => {
      let processos_associados = [];
      if (row.source === 'SPO' && row.detalhes) {
        const seen = new Set();
        processos_associados = String(row.detalhes).split(';').map(s => s.trim()).filter(s => {
          if (!s) return false; const k = s.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true;
        });
      }
      return { ...row, processos_associados };
    });
    res.json({ success: true, data: normalized, count: normalized.length });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/pendentes-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/importar-rm
app.post('/api/fin/vouchers/importar-rm', async (req, res) => {
  try {
    const { nd, user_id, user_name } = req.body || {};
    if (!nd) return res.status(400).json({ success: false, error: 'nd é obrigatório' });

    const ndPrefix = String(nd).trim().split(/\s+/)[0] || '';
    const isSpoLike = /^[0-9]{2,4}-/.test(ndPrefix);
    const tables = isSpoLike
      ? ['t_dados_financeiro_spo', 't_dados_financeiro_voucher']
      : ['t_dados_financeiro_voucher', 't_dados_financeiro_spo'];

    let lookupIdRm = null;
    let sourceTable = null;
    for (const tbl of tables) {
      try {
        const r = await finQuery(`SELECT id_rm FROM dados_dachser.${tbl} WHERE SUBSTRING_INDEX(TRIM(nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci LIMIT 1`, [nd]);
        if (r && r.length > 0) { lookupIdRm = r[0].id_rm; sourceTable = tbl; break; }
      } catch (_) {}
    }

    const existing = await finQuery(`SELECT id, etapa_atual, numero_spo FROM dados_dachser.t_vouchers WHERE numero_spo = ? OR (id_rm IS NOT NULL AND id_rm = ?) LIMIT 1`, [nd, lookupIdRm]);
    if (existing && existing.length > 0) {
      const ev = existing[0];
      try { await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id,voucher_id,user_id,user_name,acao,detalhe,data_hora) VALUES (UUID(),?,?,?,'VOUCHER_RM_DUPLICADO_IGNORADO',?,NOW())`, [ev.id, user_id||null, user_name||'Sistema', `Import duplicado bloqueado. nd=${nd}`]); } catch (_) {}
      return res.json({ success: true, voucherId: ev.id, numeroSPO: nd, alreadyExists: true });
    }

    const fetchTable = sourceTable || (isSpoLike ? 't_dados_financeiro_spo' : 't_dados_financeiro_voucher');
    const includeDetalhes = fetchTable === 't_dados_financeiro_spo';
    const rmData = await finQuery(`SELECT id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social${includeDetalhes ? ', detalhes' : ''} FROM dados_dachser.${fetchTable} WHERE nd = ? LIMIT 1`, [nd]);
    if (!rmData || rmData.length === 0) return res.status(404).json({ success: false, error: 'Registro não encontrado no RM' });

    const rm = rmData[0];
    const mapFormaPag = (fp) => ({ BOL:'BOLETO',BOLETO:'BOLETO',PIX:'PIX',TED:'TRANSFERENCIA',TRANSF:'TRANSFERENCIA',DEBITO:'DEBITO',CAMBIO:'CAMBIO',DARF:'DARF',GPS:'GPS' })[(fp||'').toUpperCase()] || 'BOLETO';
    const mapTipoDoc = (tp) => ({ NF:'NOTA_FISCAL',FAT:'FATURA',FATURA:'FATURA',DEM:'DEMONSTRATIVO',NFS:'NF_SERVICO' })[(tp||'').toUpperCase()] || 'FATURA';
    const toDate = (d) => {
      if (!d) return null;
      const s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) return s.slice(0, 10);
      const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return `${br[3]}-${br[2]}-${br[1]}`;
      return null;
    };

    const voucherId = randomUUID();
    await finQuery(`INSERT INTO dados_dachser.t_vouchers (id,numero_spo,id_rm,fornecedor,cnpj_fornecedor,valor,moeda,vencimento,data_emissao_documento,forma_pagamento,tipo_documento,cobranca_em_nome_de,etapa_atual,status_baixa,urgencia_tipo,processo_id,criado_por_user_id,tipo_execucao_pagamento,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [voucherId, rm.nd, rm.id_rm||null, rm.nome_beneficiario||rm.razao_social, rm.cnpj, rm.valor_nf||0, rm.moeda||'BRL', toDate(rm.data_vencimento), toDate(rm.data_emissao), mapFormaPag(rm.forma_pag), mapTipoDoc(rm.tipo_pag), rm.nome_cobranca === 'CLIENTE' ? 'CLIENTE' : 'DACHSER', 'OPERACAO', 'PENDENTE', 'NORMAL', rm.numero_processo, user_id||null, 'A_DEFINIR']);
    try { await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id,voucher_id,user_id,user_name,acao,detalhe,data_hora) VALUES (UUID(),?,?,?,'IMPORTADO_RM',?,NOW())`, [voucherId, user_id||null, user_name||'Sistema', `Voucher importado do RM. ND: ${rm.nd}`]); } catch (_) {}

    res.json({ success: true, voucherId, numeroSPO: rm.nd });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/importar-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5b: Cancelamento + Comprovantes + Histórico + Datas ──────────────────────────

// POST /api/fin/vouchers/:id/cancelar — cancelar_voucher
app.post('/api/fin/vouchers/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, voucher_credito, user_id, user_name } = req.body || {};
    if (!motivo || !voucher_credito) return res.status(400).json({ success: false, error: 'motivo e voucher_credito são obrigatórios' });
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET etapa_atual='CANCELADO', cancelamento_motivo=?, cancelamento_voucher_credito=?, cancelado_por_user_id=?, cancelado_por_user_name=?, cancelado_em=NOW(), updated_at=NOW() WHERE id=?`,
      [motivo, voucher_credito, user_id || null, user_name || 'Sistema', id]
    );
    try {
      await finQuery(`INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(),?,?,?,'VOUCHER_CANCELADO',?,NOW())`,
        [id, user_id || null, user_name || 'Sistema', `Voucher cancelado. Motivo: ${motivo}. Crédito em: ${voucher_credito}`]);
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/:id/cancelar]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/comprovantes — list_comprovantes
app.get('/api/fin/vouchers/comprovantes', async (req, res) => {
  try {
    const page = parseInt(String(req.query.page || '1'));
    const perPage = parseInt(String(req.query.perPage || '100'));
    const offset = (page - 1) * perPage;
    const rows = await finQuery(`
      SELECT a.id, a.voucher_id, v.numero_spo, a.file_name, a.file_url, a.file_size,
             a.created_at, a.tipo as tipo_anexo, v.forma_pagamento, v.valor, v.fornecedor, v.tipo_documento
      FROM dados_dachser.t_voucher_anexos a
      INNER JOIN dados_dachser.t_vouchers v ON a.voucher_id = v.id
      WHERE v.etapa_atual = 'CONCLUIDO' AND a.tipo = 'COMPROVANTE'
        AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `, [perPage, offset]);
    const countRows = await finQuery(`
      SELECT COUNT(*) as total FROM dados_dachser.t_voucher_anexos a
      INNER JOIN dados_dachser.t_vouchers v ON a.voucher_id = v.id
      WHERE v.etapa_atual = 'CONCLUIDO' AND a.tipo = 'COMPROVANTE'
    `);
    const total = Number(countRows?.[0]?.total || 0);
    res.json({ success: true, comprovantes: rows || [], total, page, perPage, totalPages: Math.ceil(total / perPage) });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/comprovantes]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/baixas/historico — get_historico_baixas
app.get('/api/fin/baixas/historico', async (req, res) => {
  try {
    const { periodo = '30dias' } = req.query;
    let dateFilter = '';
    if (periodo === 'hoje') dateFilter = `AND DATE(b.DataDaBaixa) = CURDATE()`;
    else if (periodo === '7dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    else if (periodo === '30dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
    else if (periodo === '90dias') dateFilter = `AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;

    const baixasRaw = await finQuery(`
      SELECT b.IdLancamentoRM, b.IdBaixa, b.TipoPagRec as tipo_pag_rec,
             b.ValorBaixado as valor_baixa, b.DataDaBaixa as data_baixa,
             b.UsuarioBaixa as usuario_baixa, b.StatusLan as status_lan
      FROM dados_dachser.tbaixas b
      WHERE b.TipoPagRec = 1 AND b.StatusLan IN (0, 1, 2, 3) ${dateFilter}
      ORDER BY b.DataDaBaixa DESC LIMIT 1500
    `);

    if (!baixasRaw || baixasRaw.length === 0) {
      return res.json({ success: true, data: [], count: 0 });
    }

    const idRms = [...new Set(baixasRaw.map(b => b.IdLancamentoRM).filter(Boolean))];
    let dfvMap = {};
    let nfsIdSet = new Set();
    if (idRms.length > 0) {
      const placeholders = idRms.map(() => '?').join(',');
      const [dfvRows, nfsRows] = await Promise.all([
        finQuery(`SELECT id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_processo, forma_pag, data_vencimento, valor_nf, moeda, modal FROM dados_dachser.t_dados_financeiro_voucher WHERE id_rm IN (${placeholders})`, idRms),
        finQuery(`SELECT DISTINCT id_rm FROM dados_dachser.t_dados_financeiro_nfs WHERE id_rm IN (${placeholders})`, idRms),
      ]);
      for (const row of (dfvRows || [])) dfvMap[String(row.id_rm)] = row;
      for (const row of (nfsRows || [])) nfsIdSet.add(String(row.id_rm));
    }

    const baixas = baixasRaw
      .filter(b => !nfsIdSet.has(String(b.IdLancamentoRM)))
      .map(b => {
        const dfv = dfvMap[String(b.IdLancamentoRM)] || {};
        return { ...b, nd: dfv.nd || null, documento: dfv.documento || null, nome_beneficiario: dfv.nome_beneficiario || null, nome_cobranca: dfv.nome_cobranca || null, numero_processo: dfv.numero_processo || null, forma_pag: dfv.forma_pag || null, data_vencimento: dfv.data_vencimento || null, valor_nf: dfv.valor_nf || null, moeda: dfv.moeda || null, _modal: dfv.modal || null };
      })
      .filter(b => b._modal !== 'ADM')
      .map(({ _modal, ...rest }) => rest);

    res.json({ success: true, data: baixas, count: baixas.length });
  } catch (err) {
    console.error('[GET /api/fin/baixas/historico]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/vouchers/datas-antigas — get_datas_emissao_vencimento_antigas
app.get('/api/fin/vouchers/datas-antigas', async (req, res) => {
  try {
    const rows = await finQuery(`
      SELECT 'VOUCHER' AS origem, dfv.nd, dfv.data_emissao, dfv.data_vencimento, dfv.data_insert
        FROM dados_dachser.t_dados_financeiro_voucher dfv
       WHERE (dfv.data_emissao IS NOT NULL AND YEAR(dfv.data_emissao) <= 2024)
          OR (dfv.data_vencimento IS NOT NULL AND YEAR(dfv.data_vencimento) <= 2024)
      UNION ALL
      SELECT 'SPO' AS origem, dfs.nd, dfs.data_emissao, dfs.data_vencimento, dfs.data_insert
        FROM dados_dachser.t_dados_financeiro_spo dfs
       WHERE (dfs.data_emissao IS NOT NULL AND YEAR(dfs.data_emissao) <= 2024)
          OR (dfs.data_vencimento IS NOT NULL AND YEAR(dfs.data_vencimento) <= 2024)
      ORDER BY data_insert DESC LIMIT 500
    `);
    res.json({ success: true, total: rows?.length || 0, rows: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/datas-antigas]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIN-5: RM + Integração + Número SPO ──────────────────────────

// GET /api/fin/vouchers/rm-ready — check_voucher_rm_ready
app.get('/api/fin/vouchers/rm-ready', async (req, res) => {
  try {
    const { numero_spo } = req.query;
    if (!numero_spo || !String(numero_spo).trim()) {
      return res.json({ ready: false, found: false, missingFields: ['numero_spo'] });
    }
    const ndRaw = String(numero_spo).trim();
    const rows = await finQuery(`
      SELECT documento, nd, numero_nf, numero_processo, modal, tipo_pag,
             forma_pag, data_emissao, data_vencimento, valor_nf, cnpj, razao_social
      FROM dados_dachser.t_dados_financeiro_voucher
      WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci
          = SUBSTRING_INDEX(TRIM(?), ' ', 1) COLLATE utf8mb4_unicode_ci
      LIMIT 1
    `, [ndRaw]);
    if (!rows || rows.length === 0) {
      return res.json({ ready: false, found: false, isManual: true, missingFields: ['registro inexistente em t_dados_financeiro_voucher'] });
    }
    const row = rows[0];
    const required = ['documento','nd','numero_nf','numero_processo','modal','tipo_pag','forma_pag','data_emissao','data_vencimento','valor_nf','cnpj','razao_social'];
    const informational = [];
    for (const f of required) {
      const v = row[f];
      if (v === null || v === undefined) { informational.push(f); continue; }
      if (typeof v === 'string' && v.trim() === '') { informational.push(f); continue; }
      if (f === 'valor_nf' && (Number(v) === 0 || Number.isNaN(Number(v)))) { informational.push(f); continue; }
    }
    res.json({ ready: true, found: true, isManual: false, missingFields: [], informationalEmptyFields: informational });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/rm-ready]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/dados-rm — insert_dados_rm
app.post('/api/fin/vouchers/dados-rm', async (req, res) => {
  try {
    const { id_rm, numero_spo, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, cnpj_fornecedor, tipo_exec } = req.body || {};
    const finalIdRm = (id_rm && String(id_rm).trim()) ? id_rm : (numero_spo || 'DESCONHECIDO');

    let regrasFormaPagFinal = 'DOC (Compe)';
    const isBoletoPag = forma_pag && String(forma_pag).toUpperCase().includes('BOL');
    if (isBoletoPag) {
      regrasFormaPagFinal = 'Boleto';
    } else if (cnpj_fornecedor) {
      try {
        const dadosBancarios = await finQuery(
          `SELECT banco FROM dados_dachser.t_dados_financeiro_pag
           WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ? LIMIT 1`,
          [String(cnpj_fornecedor).replace(/\D/g, '')]
        );
        if (dadosBancarios && dadosBancarios.length > 0) {
          const bancoUpper = (dadosBancarios[0].banco || '').toUpperCase();
          if (bancoUpper.includes('ITAU') || bancoUpper.includes('ITAÚ') || bancoUpper.includes('341')) {
            regrasFormaPagFinal = 'Crédito em Conta Corrente da Mesma Titularidade';
          }
        }
      } catch (_) {}
    }

    let voucherBoletoFinal = (voucher_boleto && String(voucher_boleto).trim()) ? voucher_boleto : null;
    let chavePixFinal = (chave_pix && String(chave_pix).trim()) ? chave_pix : null;
    const needsBoletoLookup = !voucherBoletoFinal && isBoletoPag;
    const needsPixLookup = !chavePixFinal && forma_pag && String(forma_pag).toUpperCase().includes('PIX');
    if (needsBoletoLookup || needsPixLookup) {
      try {
        const lookupRows = await finQuery(
          `SELECT linha_digitavel, codigo_barras, chave_pix FROM dados_dachser.t_vouchers
           WHERE (id_rm COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
               OR numero_spo COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci)
           ORDER BY created_at DESC LIMIT 1`,
          [finalIdRm, numero_spo || finalIdRm]
        );
        if (lookupRows && lookupRows.length > 0) {
          const dbRow = lookupRows[0];
          if (needsBoletoLookup) voucherBoletoFinal = dbRow.linha_digitavel || dbRow.codigo_barras || null;
          if (needsPixLookup && dbRow.chave_pix) chavePixFinal = dbRow.chave_pix;
        }
      } catch (_) {}
    }

    await finQuery(
      `INSERT INTO dados_dachser.t_dados_rm
       (id_rm, nd, nf_disputa, voucher_boleto, chave_pix, pix_tipo_chave, forma_pag, fornecedor, regras_forma_pag, tipo_exec)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [finalIdRm, numero_spo || null, voucherBoletoFinal, chavePixFinal, pix_tipo_chave || null,
       forma_pag || null, fornecedor || null, regrasFormaPagFinal, tipo_exec || 'A_DEFINIR']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/dados-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/status-integracao-rm — update_status_integracao_rm
app.patch('/api/fin/vouchers/:id/status-integracao-rm', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_integracao_rm } = req.body || {};
    if (!status_integracao_rm) return res.status(400).json({ success: false, error: 'status_integracao_rm é obrigatório' });
    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET status_integracao_rm = ?, updated_at = NOW() WHERE id = ?`,
      [status_integracao_rm, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/status-integracao-rm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/vouchers/:id/numero-spo — update_voucher_numero_spo
app.patch('/api/fin/vouchers/:id/numero-spo', async (req, res) => {
  try {
    const { id } = req.params;
    const { novo_numero_spo, user_id, user_name } = req.body || {};
    if (!novo_numero_spo) return res.status(400).json({ success: false, error: 'novo_numero_spo é obrigatório' });
    const oldRows = await finQuery(`SELECT numero_spo FROM dados_dachser.t_vouchers WHERE id = ?`, [id]);
    const oldNumero = oldRows?.[0]?.numero_spo || 'N/A';
    await finQuery(`UPDATE dados_dachser.t_vouchers SET numero_spo = ?, updated_at = NOW() WHERE id = ?`, [novo_numero_spo, id]);
    try {
      await finQuery(
        `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
         VALUES (UUID(), ?, ?, ?, 'NUMERO_SPO_ALTERADO', ?, NOW())`,
        [id, user_id || null, user_name || 'Sistema', `Número SPO alterado de ${oldNumero} para ${novo_numero_spo}`]
      );
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/vouchers/:id/numero-spo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// NOTIFICAÇÕES — send-voucher-notification (email via Resend)
// ═══════════════════════════════════════════════════════════════════

function formatVencimentoBR(value) {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch { return String(value); }
}

function buildVoucherEmailContent(data) {
  const baseUrl = 'https://dachser.z3us.ai';
  const logoLight = 'https://i.ibb.co/TgXzCqz/logo-preto.png';
  const logoDark  = process.env.EMAIL_LOGO_URL || 'https://i.ibb.co/sJkY7y5/logo-branco.png';

  const cfgMap = {
    URGENCIA_SOLICITADA:             { title: 'Solicitação de Urgência',           titleColor: '#F5B843', btnBg: '#F5B843', btnColor: '#111', subject: 'Solicitação de Urgência' },
    AJUSTE_SOLICITADO:               { title: 'Ajuste Solicitado',                 titleColor: '#F97316', btnBg: '#F97316', btnColor: '#fff', subject: 'Ajuste Solicitado' },
    URGENCIA_REJEITADA:              { title: 'Urgência Rejeitada',                titleColor: '#DC2626', btnBg: '#DC2626', btnColor: '#fff', subject: 'Urgência Rejeitada' },
    URGENCIA_APROVADA:               { title: 'Urgência Aprovada pelo Supervisor', titleColor: '#22C55E', btnBg: '#22C55E', btnColor: '#fff', subject: 'Urgência Aprovada' },
    URGENCIA_SOLICITADA_CONFIRMACAO: { title: 'Solicitação de Urgência Enviada',   titleColor: '#22C55E', btnBg: '#22C55E', btnColor: '#fff', subject: 'Solicitação de Urgência Enviada' },
  };
  const cfg = cfgMap[data.type] || cfgMap.URGENCIA_SOLICITADA;
  const ctaLabel = data.type === 'URGENCIA_SOLICITADA' ? 'Analisar Voucher' : 'Ver Voucher';

  let contentBlock = '';
  switch (data.type) {
    case 'URGENCIA_SOLICITADA':
      contentBlock = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Foi solicitada <b>urgência manual</b> para o voucher <b>${data.voucherNumber}</b>${data.senderName ? ` por <b>${data.senderName}</b>` : ''}. Por favor, avalie e aprove ou rejeite usando os botões abaixo.</p>`;
      break;
    case 'AJUSTE_SOLICITADO':
      contentBlock = `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">O voucher <b>${data.voucherNumber}</b> foi devolvido de <b>${data.fromStage}</b> para <b>${data.toStage}</b>.</p>
        <p style="margin:0 0 4px;font-size:13px;font-weight:700">Motivo:</p>
        <div style="background:rgba(249,115,22,.08);border-left:4px solid #F97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p style="margin:0;font-size:14px;line-height:1.5">${data.reason || 'Não especificado'}</p>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#666">Solicitado por: <b>${data.senderName || 'Sistema'}</b></p>`;
      break;
    case 'URGENCIA_REJEITADA':
      contentBlock = `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">A solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi <span style="color:#DC2626;font-weight:700">rejeitada</span> pelo Supervisor.</p>
        <p style="margin:0 0 4px;font-size:13px;font-weight:700">Motivo da rejeição:</p>
        <div style="background:rgba(220,38,38,.06);border-left:4px solid #DC2626;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px">
          <p style="margin:0;font-size:14px;line-height:1.5">${data.reason || 'Não especificado'}</p>
        </div>`;
      break;
    case 'URGENCIA_APROVADA':
      contentBlock = `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666">A solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi <span style="color:#22C55E;font-weight:700">aprovada</span> pelo Supervisor e enviada ao Financeiro.</p>
        ${data.senderName ? `<p style="margin:0 0 8px;font-size:13px;color:#666">Aprovado por: <b>${data.senderName}</b></p>` : ''}`;
      break;
    case 'URGENCIA_SOLICITADA_CONFIRMACAO':
      contentBlock = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Sua solicitação de urgência para o voucher <b>${data.voucherNumber}</b> foi enviada ao supervisor responsável.</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#666">Você será notificado por e-mail assim que houver aprovação ou rejeição.</p>`;
      break;
  }

  const subject = `${cfg.subject} — ${data.voucherNumber}`;
  const anexosBlock = data.anexos && data.anexos.length > 0
    ? `<tr><td style="padding:0 28px 16px" align="left">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
          <tr style="background:rgba(0,0,0,.03)"><td style="font-size:12px;font-weight:700;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" colspan="2">DOCUMENTOS ANEXADOS</td></tr>
          ${data.anexos.map((a, i) => `<tr><td style="font-size:13px;padding:8px 14px;${i < data.anexos.length - 1 ? 'border-bottom:1px solid rgba(0,0,0,.06);' : ''}" colspan="2">
            <a href="${a.file_url}" target="_blank" style="color:#F5B843;text-decoration:none;font-weight:600">${a.file_name}</a>
            <span style="font-size:11px;color:#999;margin-left:8px">${a.tipo || ''}</span>
          </td></tr>`).join('')}
        </table>
      </td></tr>`
    : '';

  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${subject}</title>
<style>.bg{background:#fff}.panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}.text{color:#111}.muted{color:#666}
@media(prefers-color-scheme:dark){.bg{background:#0b0b0b!important}.panel{background:#141414!important;border-color:#262626!important}.text{color:#ededed!important}.muted{color:#bdbdbd!important}.logo-light{display:none!important}.logo-dark{display:block!important}}</style>
</head><body class="bg" style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
  <tr><td style="padding:28px 28px 0" align="center">
    <img src="${logoLight}" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
    <img src="${logoDark}" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
  </td></tr>
  <tr><td style="padding:12px 28px 0" align="left">
    <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:${cfg.titleColor}">${cfg.title}</h1>
    <p style="margin:0 0 16px;font-size:12px" class="muted">${cfg.subject} — ${data.voucherNumber}</p>
  </td></tr>
  <tr><td style="padding:0 28px" align="left">${contentBlock}</td></tr>
  <tr><td style="padding:0 28px 16px" align="left">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
      <tr style="background:rgba(0,0,0,.03)"><td style="font-size:12px;font-weight:700;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" colspan="2">DADOS DO VOUCHER</td></tr>
      <tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);width:140px" class="muted">Número</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${data.voucherNumber}</td></tr>
      ${data.fornecedor ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Fornecedor</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.fornecedor}</td></tr>` : ''}
      ${data.cnpj ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">CNPJ</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.cnpj}</td></tr>` : ''}
      ${data.valor ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Valor</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:700" class="text">${data.moeda || 'BRL'} ${data.valor}</td></tr>` : ''}
      ${data.vencimento ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Vencimento</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${formatVencimentoBR(data.vencimento)}</td></tr>` : ''}
      ${data.filial ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Filial</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.filial}</td></tr>` : ''}
      ${data.centroCusto ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Centro de Custo</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.centroCusto}</td></tr>` : ''}
      ${data.formaPagamento ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Forma Pgto</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="text">${data.formaPagamento}</td></tr>` : ''}
      ${data.motivoUrgencia ? `<tr><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06)" class="muted">Motivo Urgência</td><td style="font-size:13px;padding:8px 14px;border-bottom:1px solid rgba(0,0,0,.06);color:#DC2626;font-weight:600" class="text">${data.motivoUrgencia}</td></tr>` : ''}
      <tr><td style="font-size:13px;padding:8px 14px" class="muted">Etapa</td><td style="font-size:13px;padding:8px 14px" class="text"><span style="display:inline-block;background:${cfg.titleColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${data.toStage}</span></td></tr>
    </table>
  </td></tr>
  ${anexosBlock}
  <tr><td style="padding:4px 28px 24px" align="left">
    <a href="${baseUrl}" style="display:inline-block;background:${cfg.btnBg};color:${cfg.btnColor};text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">${ctaLabel}</a>
  </td></tr>
  <tr><td style="padding:0 28px 24px" align="left">
    <p style="margin:0;font-size:12px;line-height:1.5;color:#888">Caso tenha dúvidas, entre em contato com o responsável pela sua área.</p>
  </td></tr>
</table>
<div style="height:20px">&nbsp;</div>
<div style="font-size:11px;color:#888;text-align:center">© Z3US.AI — Esta é uma mensagem automática.</div>
</td></tr></table></body></html>`;

  return { subject, html };
}

function injectSupervisorButtons(html, approveToken, rejectToken) {
  const baseUrl = 'https://dachser.z3us.ai';
  const approveUrl = `${baseUrl}/supervisor-approve?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl  = `${baseUrl}/supervisor-reject?token=${encodeURIComponent(rejectToken)}`;
  const buttonsHtml = `<tr><td style="padding:0 28px 8px" align="left">
    <div style="background:rgba(245,184,67,.08);border:1px solid rgba(245,184,67,.25);border-radius:10px;padding:16px 20px;margin-bottom:8px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="padding-right:12px"><a href="${approveUrl}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">✓ Aprovar</a></td>
        <td><a href="${rejectUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px;font-size:14px">✗ Rejeitar</a></td>
      </tr></table>
      <p style="margin:8px 0 0;font-size:11px;color:#999">Links válidos por 48 horas. Uso único.</p>
    </div>
  </td></tr>`;
  return html.replace('<tr><td style="padding:4px 28px 24px" align="left">', buttonsHtml + '\n  <tr><td style="padding:4px 28px 24px" align="left">');
}

// POST /api/notifications/voucher
app.post('/api/notifications/voucher', async (req, res) => {
  try {
    let data = req.body || {};
    const { type, voucherId } = data;

    if (!type) return res.status(400).json({ success: false, error: 'type é obrigatório' });

    // Enriquecer com dados do voucher para URGENCIA_SOLICITADA
    if (type === 'URGENCIA_SOLICITADA' && voucherId) {
      try {
        const vRows = await finQuery(`SELECT cnpj_fornecedor, filial, centro_custo, forma_pagamento, urgencia_motivo, fornecedor, valor, moeda, vencimento FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [voucherId]);
        const v = vRows?.[0];
        if (v) {
          data = {
            ...data,
            cnpj:           data.cnpj           || v.cnpj_fornecedor,
            filial:         data.filial         || v.filial,
            centroCusto:    data.centroCusto    || v.centro_custo,
            formaPagamento: data.formaPagamento || v.forma_pagamento,
            motivoUrgencia: data.motivoUrgencia || v.urgencia_motivo,
            fornecedor:     data.fornecedor     || v.fornecedor,
            valor:          data.valor          || (v.valor != null ? String(v.valor) : undefined),
            moeda:          data.moeda          || v.moeda,
            vencimento:     data.vencimento     || v.vencimento,
          };
        }
        const anexoRows = await finQuery(`SELECT tipo, file_name, file_url FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC`, [voucherId]);
        if (anexoRows?.length > 0) {
          data.anexos = anexoRows.map(a => ({ tipo: a.tipo || '', file_name: a.file_name || 'Documento', file_url: a.file_url || '' })).filter(a => a.file_url);
        }
      } catch (enrichErr) {
        console.error('[notifications/voucher] enrich error:', enrichErr.message);
      }
    }

    // Resolver e-mails dos responsáveis
    let responsaveis = null;
    if (voucherId) {
      try {
        const rows = await finQuery(`
          SELECT
            (SELECT email    FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS creator_email,
            (SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS creator_username,
            (SELECT email    FROM dados_dachser.t_users_dachser WHERE id = v.responsavel_fiscal_user_id LIMIT 1) AS fiscal_email,
            (SELECT email    FROM dados_dachser.t_users_dachser WHERE id = v.responsavel_supervisor_user_id LIMIT 1) AS supervisor_resp_email,
            (SELECT email    FROM dados_dachser.t_users_dachser WHERE id = v.responsavel_financeiro_user_id LIMIT 1) AS financeiro_email,
            (SELECT email    FROM dados_dachser.t_users_dachser
              WHERE id = (SELECT supervisor_id FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1)
              LIMIT 1) AS creator_supervisor_email
          FROM dados_dachser.t_vouchers v WHERE v.id = ? LIMIT 1`, [voucherId]);
        const r = rows?.[0] || {};
        let creatorEmail = r.creator_email || null;
        let fiscalEmail  = r.fiscal_email  || null;
        // Fallback fiscal via log
        if (!fiscalEmail) {
          try {
            const fb = await finQuery(`SELECT u.email FROM dados_dachser.t_voucher_logs l JOIN dados_dachser.t_users_dachser u ON CAST(u.id AS CHAR) = CAST(l.user_id AS CHAR) WHERE l.voucher_id = ? AND l.acao IN ('APROVADO_FISCAL','REENVIO_APOS_AJUSTE') AND u.email IS NOT NULL AND u.email != '' ORDER BY l.data_hora DESC LIMIT 1`, [voucherId]);
            if (fb?.[0]?.email) fiscalEmail = String(fb[0].email);
          } catch (_) {}
        }
        // Fallback creator via log
        if (!creatorEmail) {
          try {
            const fb = await finQuery(`SELECT u.email FROM dados_dachser.t_voucher_logs l JOIN dados_dachser.t_users_dachser u ON CAST(u.id AS CHAR) = CAST(l.user_id AS CHAR) WHERE l.voucher_id = ? AND l.acao IN ('VOUCHER_ENVIADO','RASCUNHO_ENVIADO','VOUCHER_CRIADO','RASCUNHO_CRIADO','REENVIO_APOS_AJUSTE') AND u.email IS NOT NULL AND u.email != '' ORDER BY l.data_hora DESC LIMIT 1`, [voucherId]);
            if (fb?.[0]?.email) creatorEmail = String(fb[0].email);
          } catch (_) {}
        }
        responsaveis = { creator_email: creatorEmail, creator_username: r.creator_username || null, fiscal_email: fiscalEmail, supervisor_resp_email: r.supervisor_resp_email || null, financeiro_email: r.financeiro_email || null, creator_supervisor_email: r.creator_supervisor_email || null };
      } catch (respErr) {
        console.error('[notifications/voucher] responsaveis error:', respErr.message);
      }
    }

    // Determinar destinatário (regra 1:1 — nunca broadcast)
    let toEmails = [];
    if (type === 'URGENCIA_SOLICITADA') {
      if (responsaveis?.creator_supervisor_email) toEmails = [responsaveis.creator_supervisor_email];
      else return res.json({ success: true, sent: 0, reason: 'no_creator_supervisor' });
    } else if (type === 'URGENCIA_SOLICITADA_CONFIRMACAO') {
      if (responsaveis?.creator_email) toEmails = [responsaveis.creator_email];
    } else if (type === 'URGENCIA_APROVADA' || type === 'URGENCIA_REJEITADA') {
      if (responsaveis?.creator_email) toEmails = [responsaveis.creator_email];
    } else if (type === 'AJUSTE_SOLICITADO') {
      if (data.toStage === 'AJUSTE_OPERACAO') {
        if (responsaveis?.creator_email) toEmails = [responsaveis.creator_email];
        else return res.json({ success: true, sent: 0, reason: 'no_specific_operacao_recipient' });
      } else if (data.toStage === 'AJUSTE_FISCAL') {
        if (responsaveis?.fiscal_email) toEmails = [responsaveis.fiscal_email];
        else return res.json({ success: true, sent: 0, reason: 'no_specific_fiscal_recipient' });
      }
    }

    toEmails = [...new Set(toEmails.filter(Boolean))];
    if (toEmails.length > 1) toEmails = [toEmails[0]]; // guard 1:1
    if (toEmails.length === 0) return res.json({ success: true, sent: 0, message: 'No recipients' });

    let { subject, html } = buildVoucherEmailContent(data);

    // Tokens de aprovação/rejeição para supervisor
    if (type === 'URGENCIA_SOLICITADA' && voucherId) {
      try {
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        const approveToken = crypto.randomUUID();
        const rejectToken  = crypto.randomUUID();
        await finQuery(`INSERT INTO dados_dachser.t_fin_supervisor_email_tokens (token, voucher_id, action_type, expires_at) VALUES (?, ?, 'APPROVE', ?)`, [approveToken, voucherId, expiresAt]);
        await finQuery(`INSERT INTO dados_dachser.t_fin_supervisor_email_tokens (token, voucher_id, action_type, expires_at) VALUES (?, ?, 'REJECT', ?)`,  [rejectToken,  voucherId, expiresAt]);
        html = injectSupervisorButtons(html, approveToken, rejectToken);
      } catch (tokenErr) {
        console.error('[notifications/voucher] token error:', tokenErr.message);
      }
    }

    if (!process.env.RESEND_API_KEY) {
      return res.json({ success: true, sent: 0, message: 'RESEND_API_KEY não configurada — e-mail logado', toEmails, subject });
    }

    const emailPayload = { from: 'Z3US Esteira <noreply@hermes.z3us.ai>', to: toEmails, subject, html };
    if (type === 'URGENCIA_SOLICITADA' && responsaveis?.creator_email) {
      emailPayload.reply_to = responsaveis.creator_email;
    }

    const emailResp = await resend.emails.send(emailPayload);
    res.json({ success: true, sent: toEmails.length, toEmails, subject, resendId: emailResp?.data?.id });
  } catch (err) {
    console.error('[POST /api/notifications/voucher]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

  // ─── FREETIME ──────────────────────────────────────────────────────────────

app.get('/api/freetime', async (req, res) => {
  try {
    const rows = await finQuery(`SELECT * FROM dados_dachser.t_client_free_time WHERE ativo = TRUE ORDER BY created_at DESC`);
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('[GET /api/freetime]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/freetime/for-client - find applicable free time for client/mbl
app.get('/api/freetime/for-client', async (req, res) => {
  try {
    const { cliente_nome, mbl } = req.query;
    if (mbl) {
      const rows = await finQuery(
        `SELECT * FROM dados_dachser.t_client_free_time WHERE tipo_ft = 'PROCESSO' AND mbl = ? AND ativo = TRUE LIMIT 1`,
        [mbl]
      );
      if (rows && rows.length > 0) return res.json({ success: true, data: rows[0] });
    }
    if (cliente_nome) {
      const rows = await finQuery(
        `SELECT * FROM dados_dachser.t_client_free_time WHERE tipo_ft = 'CONTRATO' AND cliente_nome = ? AND ativo = TRUE AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE()) AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE()) ORDER BY created_at DESC LIMIT 1`,
        [cliente_nome]
      );
      if (rows && rows.length > 0) return res.json({ success: true, data: rows[0] });
    }
    res.json({ success: true, data: null });
  } catch (err) {
    console.error('[GET /api/freetime/for-client]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/freetime - create
app.post('/api/freetime', async (req, res) => {
  try {
    const d = req.body;
    const newId = randomUUID();
    await finQuery(
      `INSERT INTO dados_dachser.t_client_free_time (id, cliente_nome, cliente_cnpj, tipo_ft, mbl, armador, free_time_days, vigencia_inicio, vigencia_fim, tipo_conteiner, notas, ativo, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
      [newId, d.cliente_nome, d.cliente_cnpj || null, d.tipo_ft, d.mbl || null, d.armador || null, d.free_time_days, d.vigencia_inicio || null, d.vigencia_fim || null, d.tipo_conteiner || null, d.notas || null, d.created_by || null]
    );
    res.json({ success: true, id: newId });
  } catch (err) {
    console.error('[POST /api/freetime]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/freetime/:id - update
app.patch('/api/freetime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const allowed = ['cliente_nome','cliente_cnpj','tipo_ft','mbl','armador','free_time_days','vigencia_inicio','vigencia_fim','tipo_conteiner','notas','ativo'];
    const setClauses = [], values = [];
    for (const [key, value] of Object.entries(d)) {
      if (allowed.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido' });
    setClauses.push('updated_at = NOW()');
    await finQuery(`UPDATE dados_dachser.t_client_free_time SET ${setClauses.join(', ')} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/freetime/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/freetime/:id - soft delete
app.delete('/api/freetime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await finQuery(`UPDATE dados_dachser.t_client_free_time SET ativo = FALSE WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/freetime/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ═══ FINANCEIRO DISPUTAS ════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/fin/disputas - list disputes
app.get('/api/fin/disputas', async (req, res) => {
  try {
    const { tipo } = req.query;
    const tipoFiltro = tipo && String(tipo).trim() ? String(tipo).trim() : null;
    const tipoExpr = "CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' WHEN tipo_documento IS NULL THEN NULL ELSE 'A prazo' END";
    const params = [];
    let whereTipo = '';
    if (tipoFiltro) {
      whereTipo = ` AND tipo_documento IS NOT NULL AND ${tipoExpr} = ?`;
      params.push(tipoFiltro);
    }
    const sql = `
      WITH fd_ativas AS (
        SELECT fd.id, fd.documento, fd.nf, fd.cliente, fd.responsavel, fd.departamento,
               fd.observacoes, fd.escalation, fd.tipo, fd.created_at
        FROM dados_dachser.t_fin_disputas fd
        WHERE fd.is_disputa = 1 AND fd.resolved_at IS NULL AND fd.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = CONCAT(COALESCE(fd.documento,''),'|',COALESCE(fd.nf,'')) COLLATE utf8mb4_unicode_ci AND sd.active = 0)
      ),
      candidatos AS (
        SELECT fd.id AS fd_id, CONVERT(fd.nf USING utf8mb4) COLLATE utf8mb4_unicode_ci AS fd_nf,
               CONVERT(fd.responsavel USING utf8mb4) COLLATE utf8mb4_unicode_ci AS fd_responsavel,
               CONVERT(fd.departamento USING utf8mb4) COLLATE utf8mb4_unicode_ci AS departamento,
               CONVERT(fd.observacoes USING utf8mb4) COLLATE utf8mb4_unicode_ci AS observacoes,
               CONVERT(fd.escalation USING utf8mb4) COLLATE utf8mb4_unicode_ci AS escalation,
               fd.created_at AS fd_created_at,
               CONVERT(v.doc_key USING utf8mb4) COLLATE utf8mb4_unicode_ci AS doc_key,
               CONVERT(v.idlan USING utf8mb4) COLLATE utf8mb4_unicode_ci AS idlan,
               CONVERT(v.id_rm USING utf8mb4) COLLATE utf8mb4_unicode_ci AS id_rm,
               CONVERT(v.documento USING utf8mb4) COLLATE utf8mb4_unicode_ci AS documento,
               CONVERT(v.numero_nf USING utf8mb4) COLLATE utf8mb4_unicode_ci AS numero_nf,
               CONVERT(v.nd USING utf8mb4) COLLATE utf8mb4_unicode_ci AS nd,
               CONVERT(v.razao_social USING utf8mb4) COLLATE utf8mb4_unicode_ci AS cliente,
               v.data_emissao, v.data_vencimento, v.valor_nf,
               CONVERT(v.tipo_documento USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_documento,
               CONVERT(v.modal USING utf8mb4) COLLATE utf8mb4_unicode_ci AS modal,
               CONVERT('nova_base' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origem_disputa
        FROM fd_ativas fd
        INNER JOIN dados_dachser.v_fin_regua_contas_receber v ON v.doc_key COLLATE utf8mb4_unicode_ci = CONCAT('CR|', fd.nf) COLLATE utf8mb4_unicode_ci
        WHERE fd.documento = 'CR'
        UNION ALL
        SELECT fd.id, CONVERT(fd.nf USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(fd.responsavel USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(fd.departamento USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(fd.observacoes USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(fd.escalation USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               fd.created_at,
               CONVERT(v.doc_key USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.idlan USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.id_rm USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.documento USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.numero_nf USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.nd USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.razao_social USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               v.data_emissao, v.data_vencimento, v.valor_nf,
               CONVERT(v.tipo_documento USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT(v.modal USING utf8mb4) COLLATE utf8mb4_unicode_ci,
               CONVERT('legado_casado' USING utf8mb4) COLLATE utf8mb4_unicode_ci
        FROM fd_ativas fd
        INNER JOIN dados_dachser.v_fin_regua_contas_receber v ON (fd.documento COLLATE utf8mb4_unicode_ci = v.documento COLLATE utf8mb4_unicode_ci AND fd.nf COLLATE utf8mb4_unicode_ci = v.numero_nf COLLATE utf8mb4_unicode_ci)
        WHERE COALESCE(fd.documento,'') <> 'CR'
      ),
      dedup AS (SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.fd_id ORDER BY c.data_vencimento ASC, c.idlan ASC) AS rn FROM candidatos c),
      casadas AS (SELECT * FROM dedup WHERE rn = 1),
      orfas AS (
        SELECT fd.id AS fd_id, CONVERT(fd.nf USING utf8mb4) COLLATE utf8mb4_unicode_ci AS fd_nf,
               CONVERT(fd.responsavel USING utf8mb4) COLLATE utf8mb4_unicode_ci AS fd_responsavel,
               CONVERT(fd.departamento USING utf8mb4) COLLATE utf8mb4_unicode_ci AS departamento,
               CONVERT(fd.observacoes USING utf8mb4) COLLATE utf8mb4_unicode_ci AS observacoes,
               CONVERT(fd.escalation USING utf8mb4) COLLATE utf8mb4_unicode_ci AS escalation,
               fd.created_at AS fd_created_at,
               CONVERT(CASE WHEN fd.documento = 'CR' THEN CONCAT('CR|', fd.nf) ELSE CONCAT(COALESCE(fd.documento,''),'|',COALESCE(fd.nf,'')) END USING utf8mb4) COLLATE utf8mb4_unicode_ci AS doc_key,
               CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS idlan, CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS id_rm,
               CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS documento, CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS numero_nf,
               CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS nd, CONVERT(fd.cliente USING utf8mb4) COLLATE utf8mb4_unicode_ci AS cliente,
               CAST(NULL AS DATETIME) AS data_emissao, CAST(NULL AS DATETIME) AS data_vencimento, CAST(NULL AS DECIMAL(18,2)) AS valor_nf,
               CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS tipo_documento, CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS modal,
               CONVERT('legado_orfao' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origem_disputa, 1 AS rn
        FROM fd_ativas fd
        WHERE NOT EXISTS (SELECT 1 FROM casadas k WHERE k.fd_id = fd.id)
      ),
      todas AS (SELECT * FROM casadas UNION ALL SELECT * FROM orfas)
      SELECT
        doc_key,
        COALESCE(NULLIF(numero_nf,''), NULLIF(documento,''), NULLIF(nd,''), fd_nf) AS nf,
        nd,
        SUBSTRING_INDEX(cliente, ' - ', 1) AS razao_base,
        cliente,
        DATE_FORMAT(data_emissao, '%Y-%m-%dT%H:%i:%s-03:00') AS emissao,
        DATE_FORMAT(data_vencimento, '%Y-%m-%dT%H:%i:%s-03:00') AS vencimento,
        valor_nf AS valor,
        ${tipoExpr} AS tipo,
        fd_responsavel AS responsavel,
        observacoes, departamento, escalation,
        DATE_FORMAT(fd_created_at, '%Y-%m-%dT%H:%i:%s-03:00') AS created_at,
        origem_disputa, id_rm, idlan, modal
      FROM todas
      WHERE 1=1${whereTipo}
      ORDER BY fd_created_at DESC, cliente ASC
    `;
    const rows = await finQuery(sql, params);
    res.json({ success: true, rows: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/disputas]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/disputas/lookup - lookup document by ND/NF
app.get('/api/fin/disputas/lookup', async (req, res) => {
  try {
    const { nd } = req.query;
    if (!nd) return res.status(400).json({ success: false, error: 'ND/NF é obrigatório' });
    const searchTerm = String(nd).trim();
    const rows = await finQuery(`
      SELECT doc_key, idlan, id_rm, documento, numero_nf, nd, razao_social AS cliente, cnpj,
             DATE_FORMAT(data_vencimento, '%Y-%m-%d') AS vencimento, DATE_FORMAT(data_emissao, '%Y-%m-%d') AS emissao,
             valor_nf AS valor, CASE WHEN tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo,
             modal, processo, master, house
      FROM dados_dachser.v_fin_regua_contas_receber
      WHERE documento = ? OR numero_nf = ? OR nd = ?
      ORDER BY data_vencimento ASC, idlan ASC
    `, [searchTerm, searchTerm, searchTerm]);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    res.json({ success: true, rows });
  } catch (err) {
    console.error('[GET /api/fin/disputas/lookup]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/bulk - save dispute bulk by doc_keys
app.post('/api/fin/disputas/bulk', async (req, res) => {
  try {
    const { doc_keys, responsavel, observacoes, departamento, escalation } = req.body;
    const keys = Array.isArray(doc_keys) ? [...new Set(doc_keys.map(k => String(k).trim()).filter(Boolean))] : [];
    if (keys.length === 0) return res.status(400).json({ success: false, error: 'doc_keys é obrigatório' });
    const resp = responsavel || null, obs = observacoes || null, dep = departamento || null, esc = escalation || null;
    let inserted = 0, updated = 0;
    const failed = [];
    for (const dk of keys) {
      try {
        const titulo = await finQuery(`SELECT doc_key, documento, numero_nf, nd, razao_social, data_vencimento, valor_nf, tipo_documento FROM dados_dachser.v_fin_regua_contas_receber WHERE doc_key = ? LIMIT 1`, [dk]);
        if (!titulo || titulo.length === 0) { failed.push({ doc_key: dk, message: 'Título não encontrado' }); continue; }
        const t = titulo[0];
        const parts = String(dk).split('|');
        const nfFromKey = parts.length > 1 ? parts.slice(1).join('|') : dk;
        const docPart = (t.documento || '').toString().trim() || 'CR';
        const nfPart = (t.numero_nf || '').toString().trim() || nfFromKey;
        const existing = await finQuery(`SELECT id FROM dados_dachser.t_fin_disputas WHERE documento = ? AND nf = ? LIMIT 1`, [docPart, nfPart]);
        if (existing && existing.length > 0) {
          await finQuery(`UPDATE dados_dachser.t_fin_disputas SET nd=?,cliente=?,vencimento=?,valor=?,tipo=?,responsavel=COALESCE(?,responsavel),observacoes=COALESCE(?,observacoes),departamento=COALESCE(?,departamento),escalation=COALESCE(?,escalation),is_disputa=1,resolved_at=NULL,deleted_at=NULL,updated_at=NOW() WHERE documento=? AND nf=?`,
            [t.nd||null,t.razao_social||null,t.data_vencimento||null,t.valor_nf||null,t.tipo_documento==='FAT_NF'?'À vista':'A prazo',resp,obs,dep,esc,docPart,nfPart]);
          updated++;
        } else {
          await finQuery(`INSERT INTO dados_dachser.t_fin_disputas (documento,nf,nd,cliente,vencimento,valor,tipo,responsavel,observacoes,departamento,escalation,is_disputa,resolved_at,deleted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,NOW(),NOW())`,
            [docPart,nfPart,t.nd||null,t.razao_social||null,t.data_vencimento||null,t.valor_nf||null,t.tipo_documento==='FAT_NF'?'À vista':'A prazo',resp,obs,dep,esc]);
          inserted++;
        }
      } catch (e) { failed.push({ doc_key: dk, message: e.message }); }
    }
    res.json({ success: true, total: keys.length, inserted, updated, failed });
  } catch (err) {
    console.error('[POST /api/fin/disputas/bulk]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/resolve - resolve single dispute
app.post('/api/fin/disputas/resolve', async (req, res) => {
  try {
    const { nf, doc_key } = req.body;
    const key = String(nf || doc_key || '').trim();
    if (!key) return res.status(400).json({ success: false, error: 'nf ou doc_key é obrigatório' });
    const parts = key.split('|');
    const docPart = parts.length > 1 ? parts[0] : 'CR';
    const nfPart = parts.length > 1 ? parts.slice(1).join('|') : key;
    const upd = await finQuery(`UPDATE dados_dachser.t_fin_disputas SET resolved_at=NOW(),is_disputa=0,updated_at=NOW() WHERE documento=? AND nf=?`, [docPart, nfPart]);
    const affectedRows = upd?.[0]?.affectedRows ?? (Array.isArray(upd) ? 0 : upd?.affectedRows ?? 0);
    res.json({ success: true, affectedRows, message: 'Disputa resolvida' });
  } catch (err) {
    console.error('[POST /api/fin/disputas/resolve]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fin/disputas/:docKey - soft delete dispute
app.delete('/api/fin/disputas/:docKey', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.docKey);
    const parts = key.split('|');
    const docPart = parts.length > 1 ? parts[0] : 'CR';
    const nfPart = parts.length > 1 ? parts.slice(1).join('|') : key;
    // Find and soft-delete matching disputes
    const resolved = await finQuery(
      `SELECT DISTINCT fd.id FROM dados_dachser.t_fin_disputas fd LEFT JOIN dados_dachser.v_fin_regua_contas_receber v ON (v.doc_key COLLATE utf8mb4_unicode_ci = CONCAT(COALESCE(fd.documento,''),'|',COALESCE(fd.nf,'')) COLLATE utf8mb4_unicode_ci OR (COALESCE(fd.documento,'') <> 'CR' AND fd.documento COLLATE utf8mb4_unicode_ci = v.documento COLLATE utf8mb4_unicode_ci AND fd.nf COLLATE utf8mb4_unicode_ci = v.numero_nf COLLATE utf8mb4_unicode_ci)) WHERE fd.is_disputa=1 AND fd.deleted_at IS NULL AND ((fd.documento COLLATE utf8mb4_unicode_ci=? COLLATE utf8mb4_unicode_ci AND fd.nf COLLATE utf8mb4_unicode_ci=? COLLATE utf8mb4_unicode_ci) OR v.doc_key COLLATE utf8mb4_unicode_ci=? COLLATE utf8mb4_unicode_ci)`,
      [docPart, nfPart, key]
    );
    const ids = (resolved || []).map(r => r.id).filter(Boolean);
    let affectedRows = 0;
    if (ids.length > 0) {
      await finQuery(`UPDATE dados_dachser.t_fin_disputas SET deleted_at=NOW(),is_disputa=0,updated_at=NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      affectedRows = ids.length;
    }
    // Always write soft delete entry
    await finQuery(`INSERT INTO dados_dachser.t_fin_soft_delete (documento, active, active_at) VALUES (?, 0, NOW()) ON DUPLICATE KEY UPDATE active = 0, active_at = NOW()`, [key]);
    res.json({ success: true, affectedRows, message: 'Disputa removida' });
  } catch (err) {
    console.error('[DELETE /api/fin/disputas/:docKey]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/disputas/:docKey/observacoes
app.patch('/api/fin/disputas/:docKey/observacoes', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.docKey);
    const { observacoes, nf } = req.body;
    const resolveKey = nf || key;
    const parts = String(resolveKey).split('|');
    const docPart = parts.length > 1 ? parts[0] : 'CR';
    const nfPart = parts.length > 1 ? parts.slice(1).join('|') : resolveKey;
    await finQuery(`UPDATE dados_dachser.t_fin_disputas SET observacoes=?,updated_at=NOW() WHERE documento=? AND nf=?`, [observacoes||null, docPart, nfPart]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/disputas/:docKey/observacoes]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/disputas/:docKey/responsavel
app.patch('/api/fin/disputas/:docKey/responsavel', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.docKey);
    const { responsavel, nf } = req.body;
    const resolveKey = nf || key;
    const parts = String(resolveKey).split('|');
    const docPart = parts.length > 1 ? parts[0] : 'CR';
    const nfPart = parts.length > 1 ? parts.slice(1).join('|') : resolveKey;
    await finQuery(`UPDATE dados_dachser.t_fin_disputas SET responsavel=?,updated_at=NOW() WHERE documento=? AND nf=?`, [responsavel||null, docPart, nfPart]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/disputas/:docKey/responsavel]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/bulk-delete
app.post('/api/fin/disputas/bulk-delete', async (req, res) => {
  try {
    const { doc_keys } = req.body;
    const keys = Array.isArray(doc_keys) ? doc_keys.map(k => String(k).trim()).filter(Boolean) : [];
    if (keys.length === 0) return res.status(400).json({ success: false, error: 'doc_keys é obrigatório' });
    let deleted = 0;
    for (const key of keys) {
      try {
        const parts = key.split('|');
        const docPart = parts.length > 1 ? parts[0] : 'CR';
        const nfPart = parts.length > 1 ? parts.slice(1).join('|') : key;
        await finQuery(`UPDATE dados_dachser.t_fin_disputas SET deleted_at=NOW(),is_disputa=0,updated_at=NOW() WHERE documento=? AND nf=? AND deleted_at IS NULL`, [docPart, nfPart]);
        await finQuery(`INSERT INTO dados_dachser.t_fin_soft_delete (documento, active, active_at) VALUES (?, 0, NOW()) ON DUPLICATE KEY UPDATE active = 0, active_at = NOW()`, [key]);
        deleted++;
      } catch (e) { console.error('[bulk-delete] key error:', key, e.message); }
    }
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[POST /api/fin/disputas/bulk-delete]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/bulk-resolve
app.post('/api/fin/disputas/bulk-resolve', async (req, res) => {
  try {
    const { doc_keys } = req.body;
    const keys = Array.isArray(doc_keys) ? doc_keys.map(k => String(k).trim()).filter(Boolean) : [];
    if (keys.length === 0) return res.status(400).json({ success: false, error: 'doc_keys é obrigatório' });
    let resolved = 0;
    for (const key of keys) {
      try {
        const parts = key.split('|');
        const docPart = parts.length > 1 ? parts[0] : 'CR';
        const nfPart = parts.length > 1 ? parts.slice(1).join('|') : key;
        await finQuery(`UPDATE dados_dachser.t_fin_disputas SET resolved_at=NOW(),is_disputa=0,updated_at=NOW() WHERE documento=? AND nf=? AND resolved_at IS NULL`, [docPart, nfPart]);
        resolved++;
      } catch (e) { console.error('[bulk-resolve] key error:', key, e.message); }
    }
    res.json({ success: true, resolved });
  } catch (err) {
    console.error('[POST /api/fin/disputas/bulk-resolve]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/check - check which NDs already exist as active disputes
app.post('/api/fin/disputas/check', async (req, res) => {
  try {
    const { items } = req.body;
    const nds = (items || []).map(i => String(i.nd || '').trim()).filter(Boolean);
    if (nds.length === 0) return res.json({ success: true, existingItems: [], newItems: [] });
    const placeholders = nds.map(() => '?').join(',');
    const existing = await finQuery(`
      SELECT fd.nf AS nd, COALESCE(fd.cliente, fd.nf) AS cliente, fd.responsavel
      FROM dados_dachser.t_fin_disputas fd
      WHERE fd.is_disputa = 1 AND fd.deleted_at IS NULL AND fd.resolved_at IS NULL
        AND fd.nf IN (${placeholders})
      GROUP BY fd.nf, fd.cliente, fd.responsavel
    `, nds);
    const existingNds = new Set((existing || []).map(r => r.nd));
    const newItems = nds.filter(nd => !existingNds.has(nd));
    res.json({ success: true, existingItems: existing || [], newItems });
  } catch (err) {
    console.error('[POST /api/fin/disputas/check]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/disputas/import - import disputes from spreadsheet
app.post('/api/fin/disputas/import', async (req, res) => {
  try {
    const { items, forceUpdate } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, error: 'items é obrigatório' });
    let count = 0, updatedCount = 0, skippedCount = 0, notFoundCount = 0;
    for (const item of items) {
      const { nd, descricao, departamento, responsavel, escalation } = item;
      if (!nd) continue;
      try {
        const titulos = await finQuery(
          `SELECT doc_key, documento, numero_nf, nd AS nd_col, razao_social, data_vencimento, valor_nf, tipo_documento FROM dados_dachser.v_fin_regua_contas_receber WHERE documento = ? OR numero_nf = ? OR nd = ? ORDER BY data_vencimento ASC LIMIT 1`,
          [nd, nd, nd]
        );
        if (!titulos || titulos.length === 0) { notFoundCount++; continue; }
        const t = titulos[0];
        const parts = String(t.doc_key || '').split('|');
        const docPart = parts.length > 1 ? parts[0] : 'CR';
        const nfPart = parts.length > 1 ? parts.slice(1).join('|') : nd;
        const existing = await finQuery(`SELECT id FROM dados_dachser.t_fin_disputas WHERE documento = ? AND nf = ? LIMIT 1`, [docPart, nfPart]);
        if (existing && existing.length > 0) {
          if (!forceUpdate) { skippedCount++; continue; }
          await finQuery(
            `UPDATE dados_dachser.t_fin_disputas SET nd=?,cliente=?,vencimento=?,valor=?,tipo=?,responsavel=COALESCE(?,responsavel),observacoes=COALESCE(?,observacoes),departamento=COALESCE(?,departamento),escalation=COALESCE(?,escalation),is_disputa=1,resolved_at=NULL,deleted_at=NULL,updated_at=NOW() WHERE documento=? AND nf=?`,
            [t.nd_col||null, t.razao_social||null, t.data_vencimento||null, t.valor_nf||null, t.tipo_documento==='FAT_NF'?'À vista':'A prazo', responsavel||null, descricao||null, departamento||null, escalation||null, docPart, nfPart]
          );
          updatedCount++;
        } else {
          await finQuery(
            `INSERT INTO dados_dachser.t_fin_disputas (documento,nf,nd,cliente,vencimento,valor,tipo,responsavel,observacoes,departamento,escalation,is_disputa,resolved_at,deleted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NULL,NULL,NOW(),NOW())`,
            [docPart, nfPart, t.nd_col||null, t.razao_social||null, t.data_vencimento||null, t.valor_nf||null, t.tipo_documento==='FAT_NF'?'À vista':'A prazo', responsavel||null, descricao||null, departamento||null, escalation||null]
          );
          count++;
        }
      } catch (e) { console.error('[import] item error:', nd, e.message); notFoundCount++; }
    }
    res.json({ success: true, count, updatedCount, skippedCount, notFoundCount });
  } catch (err) {
    console.error('[POST /api/fin/disputas/import]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/demurrage/health-check
async function buildDemurrageHealthCheck(testEmail) {
  const startTime = Date.now();
  const services = [];

  const dbStart = Date.now();
  try {
    await finQuery('SELECT 1');
    services.push({
      service: 'Database',
      status: 'healthy',
      latency_ms: Date.now() - dbStart,
      message: 'MariaDB accessible',
      last_checked: new Date().toISOString(),
    });
  } catch (err) {
    services.push({
      service: 'Database',
      status: 'unhealthy',
      latency_ms: Date.now() - dbStart,
      message: err.message,
      last_checked: new Date().toISOString(),
    });
  }

  if (!process.env.JSONCARGO_API_KEY) {
    services.push({
      service: 'JSONCARGO',
      status: 'unhealthy',
      latency_ms: 0,
      message: 'JSONCARGO_API_KEY não configurada',
      last_checked: new Date().toISOString(),
    });
  } else {
    services.push({
      service: 'JSONCARGO',
      status: 'healthy',
      latency_ms: 0,
      message: 'API key configured',
      last_checked: new Date().toISOString(),
    });
  }

  const resendStart = Date.now();
  if (!process.env.RESEND_API_KEY) {
    services.push({
      service: 'Resend (Email)',
      status: 'unhealthy',
      latency_ms: 0,
      message: 'RESEND_API_KEY não configurada',
      last_checked: new Date().toISOString(),
    });
  } else if (testEmail) {
    try {
      const response = await resend.emails.send({
        from: process.env.RESEND_FROM || 'CRONOS Health Check <alerts@hermes.z3us.ai>',
        to: [testEmail],
        subject: 'CRONOS Health Check - Email Service OK',
        html: '<p>Serviço de email operacional.</p>',
      });
      if (response?.error) throw new Error(response.error.message || 'Falha ao enviar e-mail de teste');
      services.push({
        service: 'Resend (Email)',
        status: 'healthy',
        latency_ms: Date.now() - resendStart,
        message: `Test email sent to ${testEmail}`,
        last_checked: new Date().toISOString(),
      });
    } catch (err) {
      services.push({
        service: 'Resend (Email)',
        status: 'unhealthy',
        latency_ms: Date.now() - resendStart,
        message: err.message,
        last_checked: new Date().toISOString(),
      });
    }
  } else {
    services.push({
      service: 'Resend (Email)',
      status: process.env.RESEND_API_KEY.startsWith('re_') ? 'healthy' : 'degraded',
      latency_ms: Date.now() - resendStart,
      message: process.env.RESEND_API_KEY.startsWith('re_') ? 'API key configured' : 'Invalid API key format',
      last_checked: new Date().toISOString(),
    });
  }

  const hasUnhealthy = services.some((s) => s.status === 'unhealthy');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  return {
    status: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
    total_latency_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    services,
  };
}



  // ─── RÉGUA DE COBRANÇA ────────────────────────────────────────────────────

// ═══ RÉGUA DE COBRANÇA ══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/fin/regua/counts - stage counts with amounts
app.get('/api/fin/regua/counts', async (req, res) => {
  try {
    const MAX_DIAS_ATRASO = 120;
    const sql = `
      SELECT stage, COUNT(*) AS qt, COALESCE(SUM(valor_nf), 0) AS total_valor
      FROM (
        SELECT
          CASE
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN 'PRE'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) = 2 THEN 'D1'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 8 AND 14 THEN 'D7'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 16 AND 29 THEN 'D15'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 44 THEN 'D30'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 46 AND 59 AND t.tipo_documento <> 'FAT_NF' THEN 'D45'
            WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) >= 61 AND t.tipo_documento <> 'FAT_NF' THEN 'D60'
            ELSE NULL
          END AS stage, t.valor_nf
        FROM dados_dachser.v_fin_regua_contas_receber t
        WHERE NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
          AND (DATEDIFF(CURDATE(), t.data_prev_baixa) < 0 OR DATEDIFF(CURDATE(), t.data_prev_baixa) <= ? OR DATEDIFF(CURDATE(), t.data_prev_baixa) >= 46)
      ) x
      WHERE stage IS NOT NULL
      GROUP BY stage
    `;
    const rows = await finQuery(sql, [MAX_DIAS_ATRASO]);
    const counts = { PRE: 0, D1: 0, D7: 0, D15: 0, D30: 0, D45: 0, D60: 0 };
    const amounts = { PRE: 0, D1: 0, D7: 0, D15: 0, D30: 0, D45: 0, D60: 0 };
    for (const row of (rows || [])) {
      if (row.stage && counts.hasOwnProperty(row.stage)) {
        counts[row.stage] = Number(row.qt) || 0;
        amounts[row.stage] = Number(row.total_valor) || 0;
      }
    }
    res.json({ success: true, counts, amounts });
  } catch (err) {
    console.error('[GET /api/fin/regua/counts]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/regua/stats - database stats
app.get('/api/fin/regua/stats', async (req, res) => {
  try {
    const rows = await finQuery(`SELECT COUNT(*) AS total_records, SUM(valor_nf) AS total_open_amount, MAX(datavalidade) AS last_update FROM dados_dachser.v_fin_regua_contas_receber`);
    const r = rows?.[0] || {};
    res.json({ success: true, stats: { lastUpdate: r.last_update || null, totalRecords: Number(r.total_records || 0), totalOpenAmount: Number(r.total_open_amount || 0) } });
  } catch (err) {
    console.error('[GET /api/fin/regua/stats]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/regua/aging-defaults - email defaults
app.get('/api/fin/regua/aging-defaults', async (req, res) => {
  res.json({
    success: true,
    recipients: process.env.REGUA_EMAIL_RECIPIENTS || 'devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com',
    contato_email: process.env.REGUA_CONTATO_EMAIL || 'jessica.costa@dachser.com',
    contato_telefone: process.env.REGUA_CONTATO_TELEFONE || '+55 (19) 3312-6185',
  });
});

// GET /api/fin/regua/stage?stage= - rows for a given stage
app.get('/api/fin/regua/stage', async (req, res) => {
  try {
    const { stage } = req.query;
    if (!stage) return res.status(400).json({ success: false, error: 'stage é obrigatório' });
    const MAX_DIAS_ATRASO = 120;
    const s = String(stage).replace(/[^A-Z0-9+]/g, '');
    const sql = `
      SELECT
        SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base,
        t.razao_social, t.documento,
        COALESCE(NULLIF(t.numero_nf,''), t.documento) AS nf_exibicao,
        DATE_FORMAT(t.data_prev_baixa, '%d/%m/%Y') AS data_venc_br,
        DATEDIFF(CURDATE(), t.data_prev_baixa) AS dias,
        CASE WHEN t.tipo_documento='FAT_NF' THEN 'À vista' ELSE 'A prazo' END AS tipo_pagto,
        t.valor_nf, t.cnpj, t.doc_key, t.id_rm, t.idlan, t.nd, t.modal,
        t.tipo_documento, t.data_emissao, t.data_prev_baixa AS data_vencimento,
        t.processo, t.master, t.house
      FROM dados_dachser.v_fin_regua_contas_receber t
      WHERE NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
        AND (
          (? IN ('PRE','D1','D7','D15','D30','D45') AND (? = 'PRE' OR DATEDIFF(CURDATE(), t.data_prev_baixa) <= ?)) OR ? = 'D60'
        )
        AND (
          CASE ?
            WHEN 'PRE' THEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0
            WHEN 'D1'  THEN DATEDIFF(CURDATE(), t.data_prev_baixa) = 2
            WHEN 'D7'  THEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 8 AND 14
            WHEN 'D15' THEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 16 AND 29
            WHEN 'D30' THEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 44
            WHEN 'D45' THEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 46 AND 59 AND t.tipo_documento <> 'FAT_NF'
            WHEN 'D60' THEN DATEDIFF(CURDATE(), t.data_prev_baixa) >= 61 AND t.tipo_documento <> 'FAT_NF'
            ELSE FALSE
          END
        )
      ORDER BY t.data_prev_baixa ASC, t.razao_social ASC
    `;
    const rows = await finQuery(sql, [s, s, MAX_DIAS_ATRASO, s, s]);
    const formattedRows = (rows || []).map(r => ({
      ...r,
      valor_br: r.valor_nf != null ? 'R$ ' + Number(r.valor_nf).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
    }));
    res.json({ success: true, rows: formattedRows });
  } catch (err) {
    console.error('[GET /api/fin/regua/stage]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/regua/clientes-resumo?cliente= - client search with outstanding NFs
app.get('/api/fin/regua/clientes-resumo', async (req, res) => {
  try {
    const { cliente } = req.query;
    if (!cliente) return res.status(400).json({ success: false, error: 'cliente é obrigatório' });
    const searchTerm = `%${String(cliente)}%`;
    const rows = await finQuery(`
      SELECT SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base, t.razao_social, t.cnpj, COUNT(*) AS qtd_faturas
      FROM dados_dachser.v_fin_regua_contas_receber t
      WHERE NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
        AND (t.razao_social LIKE ? OR t.cnpj LIKE ?)
      GROUP BY t.cnpj, t.razao_social
      ORDER BY razao_base ASC LIMIT 50
    `, [searchTerm, searchTerm]);
    res.json({ success: true, rows: rows || [] });
  } catch (err) {
    console.error('[GET /api/fin/regua/clientes-resumo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/regua/send-aging - send aging list email via Resend
app.post('/api/fin/regua/send-aging', async (req, res) => {
  try {
    const { cnpj, cnpjs, razao_base, razao_bases, cliente, email_to, custom_text } = req.body;
    if (!cnpj && (!cnpjs || !cnpjs.length) && !razao_base && (!razao_bases || !razao_bases.length)) {
      return res.status(400).json({ success: false, error: 'cnpj, cnpjs, razao_base ou razao_bases é obrigatório' });
    }
    const XLSX = (await import('xlsx-js-style')).default;
    const parseEmails = (input) => {
      const fallbackStr = process.env.REGUA_EMAIL_RECIPIENTS || 'devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com';
      const fallback = fallbackStr.split(/[;,\n]/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (!input?.trim()) return fallback;
      const emails = input.split(/[;,\n]/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      return emails.length > 0 ? emails : fallback;
    };
    const formatCnpj = (c) => {
      const d = String(c || '').replace(/\D/g, '');
      return d.length === 14 ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}` : c;
    };
    const formatCnpjShort = (c) => {
      const d = String(c || '').replace(/\D/g, '');
      return d.length === 14 ? `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)} ${d.slice(8,12)}-${d.slice(12,14)}` : c;
    };

    const allRazaoBases = (razao_bases && Array.isArray(razao_bases) && razao_bases.length > 0) ? razao_bases : (razao_base ? [razao_base] : []);
    const inputCnpjsRaw = (cnpjs && Array.isArray(cnpjs) && cnpjs.length > 0) ? cnpjs : (cnpj ? [cnpj] : []);
    const recipientList = parseEmails(email_to);

    let allCnpjs = [];
    if (allRazaoBases.length > 0) {
      const ph = allRazaoBases.map(() => '?').join(',');
      const cnpjRows = await finQuery(`SELECT DISTINCT REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') AS cnpj FROM dados_dachser.v_fin_regua_contas_receber WHERE SUBSTRING_INDEX(razao_social, ' - ', 1) IN (${ph})`, allRazaoBases);
      allCnpjs = (cnpjRows || []).map(r => String(r.cnpj || '')).filter(Boolean);
    } else {
      allCnpjs = [...new Set(inputCnpjsRaw.map(c => c.replace(/\D/g, '')).filter(Boolean))];
    }
    if (allCnpjs.length === 0) return res.json({ success: false, error: 'Nenhum CNPJ encontrado para gerar o Aging List.' });

    const ph = allCnpjs.map(() => '?').join(',');
    const invoices = await finQuery(`
      SELECT t.documento, COALESCE(t.nd,'') AS nd, COALESCE(t.ref_cliente,'') AS referencia_cliente,
        COALESCE(NULLIF(t.numero_nf,''),'') AS numero_nf, COALESCE(t.modal,'') AS modal, t.tipo_documento,
        DATE_FORMAT(t.data_emissao,'%d/%m/%Y') AS data_emissao, DATE_FORMAT(t.data_vencimento,'%d/%m/%Y') AS data_vencimento,
        t.valor_nf, t.razao_social, t.cnpj,
        COALESCE(t.processo,'') AS numero_processo, COALESCE(t.house,'') AS house, COALESCE(t.master,'') AS master,
        'Em atraso' AS status_fatura, 'Financeiro' AS responsavel
      FROM dados_dachser.v_fin_regua_contas_receber t
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-',''),' ','') IN (${ph})
        AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
        AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
      ORDER BY t.cnpj, t.data_vencimento ASC
    `, allCnpjs);

    if (!invoices || invoices.length === 0) return res.json({ success: false, error: 'Nenhum título vencido encontrado para este cliente.' });

    const invoicesByCnpj = {};
    for (const inv of invoices) {
      if (!invoicesByCnpj[inv.cnpj]) invoicesByCnpj[inv.cnpj] = [];
      invoicesByCnpj[inv.cnpj].push(inv);
    }
    const clienteName = cliente || invoices[0]?.razao_social || 'Cliente';
    const currentDate = new Date().toLocaleDateString('pt-BR');

    const HEADERS = ["DOCUMENTO","ND","REF. CLIENTE","NOTA FISC","MODAL","TIPO DOC","EMISSÃO","VENCTO","C.N.P.J","CLIENTE","VALOR","PROCESSO","MASTER","HOUSE","STATUS","RESPONSÁVEL"];
    const S = {
      logo: { font: { name:'Arial', sz:8, bold:true, color:{rgb:'FFCC00'} }, fill: { fgColor:{rgb:'003366'} }, alignment:{horizontal:'center',vertical:'center'} },
      title: { font: { name:'Arial', sz:8, bold:true, color:{rgb:'333333'} }, alignment:{horizontal:'center',vertical:'center'} },
      boxLabel: { font:{name:'Arial',sz:8,bold:true,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'0070C0'}}, alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}} },
      boxValue: { font:{name:'Arial',sz:8,bold:true,color:{rgb:'FF0000'}}, fill:{fgColor:{rgb:'FFFFFF'}}, alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'000000'}},bottom:{style:'thin',color:{rgb:'000000'}},left:{style:'thin',color:{rgb:'000000'}},right:{style:'thin',color:{rgb:'000000'}}} },
      headerBlack: { font:{name:'Arial',sz:8,bold:true,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'000000'}}, alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'333333'}},bottom:{style:'thin',color:{rgb:'333333'}},left:{style:'thin',color:{rgb:'333333'}},right:{style:'thin',color:{rgb:'333333'}}} },
      headerBlue: { font:{name:'Arial',sz:8,bold:true,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'0070C0'}}, alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'333333'}},bottom:{style:'thin',color:{rgb:'333333'}},left:{style:'thin',color:{rgb:'333333'}},right:{style:'thin',color:{rgb:'333333'}}} },
      dataCell: { font:{name:'Arial',sz:8,color:{rgb:'000000'}}, alignment:{horizontal:'center',vertical:'center',wrapText:true}, border:{top:{style:'thin',color:{rgb:'D0D0D0'}},bottom:{style:'thin',color:{rgb:'D0D0D0'}},left:{style:'thin',color:{rgb:'D0D0D0'}},right:{style:'thin',color:{rgb:'D0D0D0'}}} },
      dataCellOverdue: { font:{name:'Arial',sz:8,color:{rgb:'FF0000'}}, alignment:{horizontal:'center',vertical:'center',wrapText:true}, border:{top:{style:'thin',color:{rgb:'D0D0D0'}},bottom:{style:'thin',color:{rgb:'D0D0D0'}},left:{style:'thin',color:{rgb:'D0D0D0'}},right:{style:'thin',color:{rgb:'D0D0D0'}}} },
    };

    const wb = XLSX.utils.book_new();
    for (const [cnpjKey, cnpjInvoices] of Object.entries(invoicesByCnpj)) {
      const totalValue = cnpjInvoices.reduce((s, i) => s + (Number(i.valor_nf) || 0), 0);
      const ws = {};
      ws['A1'] = { v: 'DACHSER', s: S.logo };
      ws['O1'] = { v: 'Valor total em atraso', s: S.boxLabel };
      ws['P1'] = { v: '', s: S.boxLabel };
      ws['D2'] = { v: `${clienteName} - Demonstrativo de Faturamento`, s: S.title };
      ws['O2'] = { v: 'R$ ' + totalValue.toLocaleString('pt-BR', {minimumFractionDigits:2}), s: S.boxValue };
      ws['P2'] = { v: '', s: S.boxValue };
      ws['P3'] = { v: currentDate, s: {} };
      ws['A4'] = { v: 'Período de Faturamento:', s: {} };
      ws['B4'] = { v: '01/01/2022 a 31/12/2027', s: {} };
      HEADERS.forEach((h, idx) => {
        const ref = XLSX.utils.encode_cell({ r: 4, c: idx });
        ws[ref] = { v: h, s: idx <= 10 ? S.headerBlack : S.headerBlue };
      });
      cnpjInvoices.forEach((inv, rowIdx) => {
        const row = 5 + rowIdx;
        const rowData = [inv.documento||'',inv.nd||'',inv.referencia_cliente||'',inv.numero_nf||'',inv.modal||'',inv.tipo_documento||'',inv.data_emissao||'',inv.data_vencimento||'',formatCnpj(inv.cnpj||''),inv.razao_social||'',null,inv.numero_processo||'',inv.master||'',inv.house||'',inv.status_fatura||'Em atraso',inv.responsavel||''];
        rowData.forEach((value, colIdx) => {
          const ref = XLSX.utils.encode_cell({ r: row, c: colIdx });
          if (colIdx === 10) return;
          ws[ref] = { v: value, s: colIdx === 7 ? { ...S.dataCell, font: { ...S.dataCell.font, color: { rgb: 'FF0000' } } } : S.dataCell };
        });
        ws[XLSX.utils.encode_cell({ r: row, c: 10 })] = { v: Number(inv.valor_nf) || 0, t: 'n', s: S.dataCellOverdue, z: '#,##0.00' };
      });
      ws['!cols'] = [{wch:14},{wch:14},{wch:50},{wch:18},{wch:6},{wch:10},{wch:12},{wch:12},{wch:20},{wch:28},{wch:22},{wch:12},{wch:14},{wch:14},{wch:12},{wch:16}];
      ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:6+cnpjInvoices.length, c:15} });
      XLSX.utils.book_append_sheet(wb, ws, formatCnpjShort(cnpjKey).substring(0, 31));
    }
    const excelBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const dateForFile = new Date().toLocaleDateString('pt-BR').replace(/\//g, '.');

    let emailBodyHtml;
    if (custom_text && custom_text.trim()) {
      const htmlContent = custom_text.replace(/\n/g, '<br/>').replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');
      emailBodyHtml = `<p>${htmlContent}</p>`;
    } else {
      const cnpjsList = allCnpjs.map(c => `<strong>${formatCnpj(c)}</strong>`).join('<br/>');
      emailBodyHtml = `<p>Boa tarde!<br/>Tudo bem?</p><p>Segue anexo, aging list para os CNPJ's:</p><p>${cnpjsList}</p><p>Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?</p><p>Agradecemos a sua atenção e colaboração.</p><p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>`;
    }
    const emailHtml = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;">${emailBodyHtml}</div>`;

    await resend.emails.send({
      from: 'Financeiro Dachser <noreply@hermes.z3us.ai>',
      to: recipientList,
      subject: `Aging List - ${clienteName}`,
      html: emailHtml,
      attachments: [{ filename: `Aging_${clienteName}_${dateForFile}.xlsx`, content: excelBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
    });

    res.json({ success: true, message: `Aging List enviada para ${recipientList.length} destinatário(s)`, sent_to: recipientList });
  } catch (err) {
    console.error('[POST /api/fin/regua/send-aging]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/regua/send-emails - bulk email for a stage (stub)
app.post('/api/fin/regua/send-emails', async (req, res) => {
  try {
    res.json({ success: true, sent: 0, skipped: 0, errors: [], message: 'Bulk send endpoint — implementação completa pendente' });
  } catch (err) {
    console.error('[POST /api/fin/regua/send-emails]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ═══ DEMURRAGE IMPORT JSONCARGO ═════════════════════════════════════════════

// FIN — Esteira metrics dashboard
// ═══════════════════════════════════════════════════════════════════

// GET /api/fin/esteira/metrics
app.get('/api/fin/esteira/metrics', async (req, res) => {
  try {
    const rows = await finQuery(`
      SELECT
        SUM(etapa_atual = 'OPERACAO')                                                    AS pendentes_operacao,
        SUM(etapa_atual = 'FISCAL')                                                      AS pendentes_fiscal,
        SUM(etapa_atual = 'SUPERVISOR')                                                  AS pendentes_supervisor,
        SUM(etapa_atual = 'FINANCEIRO')                                                  AS pendentes_financeiro,
        SUM(urgencia_tipo = 'URGENTE_REAL')                                              AS urgentes_real,
        SUM(urgencia_tipo = 'URGENTE_AUTOMATICO')                                        AS urgentes_automatico,
        SUM(vencimento >= CURDATE() AND vencimento < DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND etapa_atual != 'ROBO') AS vencendo_24h,
        SUM(vencimento < CURDATE() AND etapa_atual != 'ROBO')                            AS vencidos,
        SUM(etapa_atual = 'ROBO' OR status_baixa != 'PENDENTE')                         AS baixados
      FROM dados_dachser.t_vouchers
    `);
    const r = rows[0] || {};
    res.json({
      success: true,
      pendentesOperacao:    Number(r.pendentes_operacao    || 0),
      pendentesFiscal:      Number(r.pendentes_fiscal      || 0),
      pendentesSupervisor:  Number(r.pendentes_supervisor  || 0),
      pendentesFinanceiro:  Number(r.pendentes_financeiro  || 0),
      urgentesReal:         Number(r.urgentes_real         || 0),
      urgentesAutomatico:   Number(r.urgentes_automatico   || 0),
      vencendo24h:          Number(r.vencendo_24h          || 0),
      vencidos:             Number(r.vencidos              || 0),
      baixados:             Number(r.baixados              || 0),
    });
  } catch (err) {
    console.error('[GET /api/fin/esteira/metrics]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

  // ─── FIN: VOUCHERS BATCH + SUPERVISOR ACTION ─────────────────────────────

// POST /api/fin/vouchers/batch/preview
app.post('/api/fin/vouchers/batch/preview', async (req, res) => {
  try {
    const { userId, rows } = req.body || {};
    if (!userId) return res.status(403).json({ success: false, error: 'Usuário não autenticado.' });
    const userRows = await finQuery('SELECT id FROM dados_dachser.t_users_dachser WHERE id=?',[userId]);
    if (!userRows||userRows.length===0) return res.status(403).json({ success: false, error: 'Usuário não encontrado.' });
    try { await _biCleanup(); } catch(_) {}
    const items = await _biBuildPreview(rows||[]);
    const existing = await _biFetchExisting(items);
    _biMarkExisting(items, existing);
    const valid=items.filter(i=>i.status==='VALID').length;
    const errors=items.filter(i=>i.status==='ERROR').length;
    res.json({ success: true, items, total: items.length, valid, errors });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch/preview]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fin/vouchers/batch/create
app.post('/api/fin/vouchers/batch/create', async (req, res) => {
  try {
    const { userId, rows, items: editedItems, file_name: fileName, pre_lancamento: preLancamento } = req.body || {};
    if (!userId) return res.status(403).json({ success: false, error: 'Usuário não autenticado.' });
    const userRows = await finQuery('SELECT username FROM dados_dachser.t_users_dachser WHERE id=?',[userId]);
    if (!userRows||userRows.length===0) return res.status(403).json({ success: false, error: 'Usuário não encontrado.' });
    const adminUserName = userRows[0].username||'user';
    try { await _biCleanup(); } catch(_) {}

    const items = (Array.isArray(editedItems)&&editedItems.length) ? editedItems : await _biBuildPreview(rows||[]);
    const existingNow = await _biFetchExisting(items);
    _biMarkExisting(items, existingNow);

    const validItems = items.filter(i=>i.status==='VALID');
    const errs = items.length - validItems.length;
    const db = getPoolFor('fin');
    const batchId = crypto.randomUUID();

    await db.execute(`
      INSERT INTO dados_dachser.t_voucher_batch_import
        (id,status,original_file_name,total_rows,valid_rows,error_rows,created_by_user_id,created_by_user_name)
      VALUES (?,?,?,?,?,?,?,?)
    `,[batchId,'PENDING_DOCUMENTS',fileName||null,items.length,validItems.length,errs,String(userId),adminUserName]);

    let createdCount=0, skippedExisting=0;

    for (const it of items) {
      const itemId=crypto.randomUUID();
      let voucherId=null, itemStatus=it.status, itemMsg=it.validation_message;

      if (it.status==='VALID') {
        voucherId=crypto.randomUUID();
        const numeroSpo=it.spo||it.processo||`LOTE-${batchId.slice(0,8)}-${it.row_index+1}`;
        try { await db.execute(`ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS origem_criacao VARCHAR(50) DEFAULT NULL`); } catch(_) {}
        const isUrgenteReal=!!it.urgente;
        const tipoDocUp=String(it.tipo_documento||'').toUpperCase();
        const autoUrgent=!isUrgenteReal&&(tipoDocUp==='ICMS'||tipoDocUp==='ARMAZENAGEM');
        const urgenciaTipo=isUrgenteReal?'URGENTE_REAL':(autoUrgent?'URGENTE_AUTOMATICO':'NORMAL');
        const etapaDestino=urgenciaTipo==='URGENTE_REAL'?'SUPERVISOR':(it.cobranca_em_nome_de==='CLIENTE'?'FINANCEIRO':'FISCAL');
        const etapaAtual=preLancamento?'PRE_LANCAMENTO':'AGUARDANDO_DOCUMENTOS_LOTE';
        it.__etapa_destino=preLancamento?'PRE_LANCAMENTO':etapaDestino;
        const statusEnvioCliente=it.cobranca_em_nome_de==='CLIENTE'?'AGUARDANDO_CLIENTE':'NAO_APLICA';
        const urgenteFlag=(isUrgenteReal||autoUrgent)?1:0;
        const chavePixFinal=String(it.forma_pagamento||'').toUpperCase()==='PIX'?(it.chave_pix||null):null;

        const [insertRes]=await db.execute(`
          INSERT IGNORE INTO dados_dachser.t_vouchers (
            id,numero_spo,id_rm,fornecedor,cnpj_fornecedor,valor,moeda,
            vencimento,data_emissao_documento,forma_pagamento,tipo_documento,
            cobranca_em_nome_de,etapa_atual,status_baixa,status_envio_cliente,status_financeiro,
            remessa,urgente,urgencia_tipo,processo_id,origem_processo,
            filial,comentarios_operacao,criado_por_user_id,chave_pix,status_documento_fiscal,
            tipo_execucao_pagamento,origem_criacao,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDENTE',?,'PENDENTE','NENHUM',?,?,?,?,?,?,?,?,'PENDENTE','A_DEFINIR','LOTE_PLANILHA',NOW(),NOW())
        `,[
          voucherId,numeroSpo,it.id_rm||null,it.fornecedor,it.cnpj_fornecedor||null,it.valor,it.moeda||'BRL',
          it.vencimento?`${it.vencimento} 00:00:00`:null,
          it.data_emissao?`${it.data_emissao} 00:00:00`:null,
          it.forma_pagamento,it.tipo_documento||'OUTROS',it.cobranca_em_nome_de||'DACHSER',
          etapaAtual,statusEnvioCliente,urgenteFlag,urgenciaTipo,
          it.processo,it.origem_processo,it.filial||null,it.comentarios||null,
          String(userId),chavePixFinal,
        ]);

        if (Number(insertRes?.affectedRows??1)===0) {
          voucherId=null; skippedExisting++;
          itemStatus='ERROR';
          const skipMsg='Já existente — pulado';
          itemMsg=itemMsg?`${itemMsg}; ${skipMsg}`:skipMsg;
        } else {
          createdCount++;
          try {
            await db.execute(
              `INSERT INTO dados_dachser.t_voucher_logs (id,voucher_id,user_id,user_name,acao,detalhe,data_hora) VALUES (?,?,?,?,'VOUCHER_CRIADO_LOTE',?,NOW())`,
              [crypto.randomUUID(),voucherId,String(userId),adminUserName,`batch_id=${batchId}; row=${it.row_index}; spo=${it.spo??''}`]
            );
          } catch(_) {}
        }
      } else if (it.already_exists) { skippedExisting++; }

      await db.execute(`
        INSERT INTO dados_dachser.t_voucher_batch_import_item
          (id,batch_id,row_index,voucher_id,processo,fornecedor,valor,vencimento,data_fatura,forma_pagamento,fatura,historico,status,validation_message,raw_json,etapa_destino)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
        itemId,batchId,it.row_index,voucherId,
        it.processo,it.fornecedor,it.valor,it.vencimento,it.data_emissao,
        it.forma_pagamento,it.fatura||it.spo,it.comentarios,
        voucherId?'VOUCHER_CRIADO':itemStatus,itemMsg,
        JSON.stringify(it.raw_json||it||{}),it.__etapa_destino||null,
      ]);
    }

    res.json({ success: true, batch_id: batchId, total: items.length, created: createdCount, errors: errs, skipped_existing: skippedExisting });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/batch/create]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SUPERVISOR EMAIL ACTION
// ═══════════════════════════════════════════════════════════════════

// GET /api/fin/vouchers/supervisor-action — validate token, approve, or reject GET
app.get('/api/fin/vouchers/supervisor-action', async (req, res) => {
  const { token, action } = req.query;
  if (!token || !action || !['approve', 'reject'].includes(String(action))) {
    return res.status(400).json({ status: 'error', code: 'INVALID_PARAMS', message: 'Link inválido ou parâmetros ausentes.' });
  }
  try {
    const tokenRows = await finQuery(
      `SELECT id, token, voucher_id, action_type, used, expires_at FROM dados_dachser.t_fin_supervisor_email_tokens WHERE token = ? LIMIT 1`,
      [token]
    );
    if (!tokenRows || tokenRows.length === 0) {
      return res.status(400).json({ status: 'error', code: 'NOT_FOUND', message: 'Este link não é válido ou já foi removido.' });
    }
    const tr = tokenRows[0];
    if (tr.used) {
      return res.status(400).json({ status: 'error', code: 'ALREADY_USED', message: 'Este link já foi utilizado anteriormente.' });
    }
    if (new Date(tr.expires_at) < new Date()) {
      return res.status(400).json({ status: 'error', code: 'EXPIRED', message: 'Este link expirou (validade de 48h). Acesse o sistema para realizar a ação.' });
    }
    const { voucher_id, action_type } = tr;
    if ((action === 'approve' && action_type !== 'APPROVE') || (action === 'reject' && action_type !== 'REJECT')) {
      return res.status(400).json({ status: 'error', code: 'ACTION_MISMATCH', message: 'O tipo de ação não corresponde ao token.' });
    }
    if (action === 'reject') {
      return res.json({ status: 'valid', message: 'Token válido. Envie o motivo da rejeição.' });
    }
    // action === 'approve'
    const vRows = await finQuery(
      `SELECT numero_spo, cobranca_em_nome_de, id_rm, forma_pagamento, linha_digitavel, codigo_barras, chave_pix, fornecedor, cnpj_fornecedor FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`,
      [voucher_id]
    );
    const v = vRows?.[0] || null;
    const voucherNumber = v?.numero_spo || voucher_id;
    const proximaEtapa = v?.cobranca_em_nome_de === 'DACHSER' ? 'FISCAL' : 'FINANCEIRO';

    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET etapa_atual = ?, status_financeiro = 'APROVADO', updated_at = NOW() WHERE id = ?`,
      [proximaEtapa, voucher_id]
    );
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
       VALUES (UUID(), ?, '0', 'Supervisor (via e-mail)', 'APROVADO_SUPERVISOR', ?, NOW())`,
      [voucher_id, `Voucher/SPO urgente aprovado via link do e-mail — encaminhado para ${proximaEtapa}`]
    );
    if (proximaEtapa === 'FINANCEIRO' && v) {
      try {
        const voucherBoleto = ['BOLETO', 'DARF', 'GPS'].includes(v.forma_pagamento || '')
          ? (v.linha_digitavel || v.codigo_barras || null)
          : null;
        const finalIdRm = (v.id_rm && String(v.id_rm).trim()) ? v.id_rm : (v.numero_spo || 'DESCONHECIDO');
        await finQuery(
          `INSERT INTO dados_dachser.t_dados_rm (id_rm, nd, nf_disputa, voucher_boleto, chave_pix, forma_pag, fornecedor, regras_forma_pag, tipo_exec)
           VALUES (?, ?, 0, ?, ?, ?, ?, 'DOC (Compe)', 'A_DEFINIR')`,
          [finalIdRm, v.numero_spo || null, voucherBoleto, v.chave_pix || null, v.forma_pagamento || null, v.fornecedor || null]
        );
      } catch (_) {}
    }
    await finQuery(`UPDATE dados_dachser.t_fin_supervisor_email_tokens SET used = 1 WHERE token = ?`, [token]);
    try {
      await fetch(`http://localhost:${PORT}/api/notifications/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'URGENCIA_APROVADA', voucherId: voucher_id, voucherNumber, toStage: proximaEtapa, fromStage: 'SUPERVISOR', senderName: 'Supervisor (via e-mail)' }),
      });
    } catch (_) {}

    const destinoLabel = proximaEtapa === 'FISCAL' ? 'Fiscal' : 'Financeiro';
    res.json({ status: 'approved', message: `O voucher foi aprovado com sucesso e enviado para o ${destinoLabel}.` });
  } catch (err) {
    console.error('[GET /api/fin/vouchers/supervisor-action]', err.message);
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'Ocorreu um erro ao processar sua ação. Tente novamente.' });
  }
});

// POST /api/fin/vouchers/supervisor-action — reject voucher
app.post('/api/fin/vouchers/supervisor-action', async (req, res) => {
  const { token, action } = req.query;
  if (!token || String(action) !== 'reject') {
    return res.status(400).json({ status: 'error', code: 'INVALID_PARAMS', message: 'Link inválido.' });
  }
  const reason = (req.body?.reason || '').trim();
  if (!reason || reason.length < 5) {
    return res.status(400).json({ status: 'error', code: 'REASON_REQUIRED', message: 'Informe o motivo da rejeição (mínimo 5 caracteres).' });
  }
  try {
    const tokenRows = await finQuery(
      `SELECT id, voucher_id, action_type, used, expires_at FROM dados_dachser.t_fin_supervisor_email_tokens WHERE token = ? LIMIT 1`,
      [token]
    );
    if (!tokenRows || tokenRows.length === 0) return res.status(400).json({ status: 'error', code: 'NOT_FOUND', message: 'Este link não é válido ou já foi removido.' });
    const tr = tokenRows[0];
    if (tr.used) return res.status(400).json({ status: 'error', code: 'ALREADY_USED', message: 'Este link já foi utilizado anteriormente.' });
    if (new Date(tr.expires_at) < new Date()) return res.status(400).json({ status: 'error', code: 'EXPIRED', message: 'Este link expirou.' });
    if (tr.action_type !== 'REJECT') return res.status(400).json({ status: 'error', code: 'ACTION_MISMATCH', message: 'O tipo de ação não corresponde ao token.' });

    const { voucher_id } = tr;
    const vRows = await finQuery(`SELECT numero_spo FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1`, [voucher_id]);
    const voucherNumber = vRows?.[0]?.numero_spo || voucher_id;

    await finQuery(
      `UPDATE dados_dachser.t_vouchers SET etapa_atual = 'OPERACAO', status_financeiro = 'REJEITADO', ajuste_operacao = ?, updated_at = NOW() WHERE id = ?`,
      [`REJEITADO PELO SUPERVISOR via e-mail: ${reason}`, voucher_id]
    );
    await finQuery(
      `INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora)
       VALUES (UUID(), ?, '0', 'Supervisor (via e-mail)', 'REJEITADO_SUPERVISOR', ?, NOW())`,
      [voucher_id, `Voucher/SPO rejeitado via e-mail. Motivo: ${reason}`]
    );
    await finQuery(`UPDATE dados_dachser.t_fin_supervisor_email_tokens SET used = 1 WHERE token = ?`, [token]);
    try {
      await fetch(`http://localhost:${PORT}/api/notifications/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'URGENCIA_REJEITADA', voucherId: voucher_id, voucherNumber, toStage: 'AJUSTE_OPERACAO', fromStage: 'SUPERVISOR', senderName: 'Supervisor (via e-mail)', reason }),
      });
    } catch (_) {}

    res.json({ status: 'rejected', message: 'O voucher foi rejeitado e devolvido para a Operação.' });
  } catch (err) {
    console.error('[POST /api/fin/vouchers/supervisor-action]', err.message);
    res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'Ocorreu um erro ao processar sua ação. Tente novamente.' });
  }
});

// ═══════════════════════════════════════════════════════════════════

// ── LOCAL CHARGES ──────────────────────────────────────────────────

// GET /api/fin/local-charges
app.get('/api/fin/local-charges', async (req, res) => {
  const empty = (source) => ({ rows: [], meta: { updated_at: null, effective: null }, source });

  const companies = [
    { key: 'hapag', name: 'HAPAG-LLOYD', table: 't_local_charge' },
    { key: 'cma',   name: 'CMA-CGM',    table: 't_local_charge_cma' },
    { key: 'hmm',   name: 'HMM',        table: 't_local_charge_hmm' },
    { key: 'msc',   name: 'MSC',        table: 't_local_charge_msc' },
    { key: 'one',   name: 'ONE',        table: 't_local_charge_one' },
    { key: 'zim',   name: 'ZIM',        table: 't_local_charge_zim' },
  ];

  try {
    const settled = await Promise.allSettled(
      companies.map(({ key, name, table }) =>
        finQuery(`
          SELECT charge_description, charge_code, container_type, currency,
                 fee, unit_of_measure, effective_date, expiry_date, effective,
                 data_atualizacao, user_atualizacao
          FROM dados_dachser.${table}
          ORDER BY charge_code
        `).then(rows => ({ key, name, rows: rows || [] }))
      )
    );

    const map = {
      hapag: empty('HAPAG-LLOYD'),
      cma:   empty('CMA-CGM'),
      hmm:   empty('HMM'),
      msc:   empty('MSC'),
      one:   empty('ONE'),
      zim:   empty('ZIM'),
    };

    for (const result of settled) {
      if (result.status === 'rejected') {
        console.error('[GET /api/fin/local-charges] company query failed:', result.reason?.message);
        continue;
      }
      const { key, name, rows } = result.value;
      map[key].rows = rows.map(r => ({ ...r, empresa: name }));
      if (rows.length > 0) {
        map[key].meta.updated_at = rows[0].data_atualizacao ?? null;
        map[key].meta.effective  = rows[0].effective ?? null;
      }
    }

    res.json({ success: true, ...map });
  } catch (err) {
    console.error('[GET /api/fin/local-charges]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fin/fee-changes
app.get('/api/fin/fee-changes', async (req, res) => {
  const historyCompanies = [
    { empresa: 'HAPAG-LLOYD', table: 't_local_charge_hapag_history' },
    { empresa: 'CMA-CGM',    table: 't_local_charge_cma_history' },
    { empresa: 'HMM',        table: 't_local_charge_hmm_history' },
    { empresa: 'MSC',        table: 't_local_charge_msc_history' },
    { empresa: 'ONE',        table: 't_local_charge_one_history' },
    { empresa: 'ZIM',        table: 't_local_charge_zim_history' },
  ];

  try {
    const allChanges = [];

    for (const { empresa, table } of historyCompanies) {
      try {
        const rows = await finQuery(`
          WITH ranked AS (
            SELECT
              charge_description, charge_code, container_type, currency, unit_of_measure,
              fee, effective, chave, data_atualizacao_chave, data_atualizacao, user_atualizacao,
              ROW_NUMBER() OVER (
                PARTITION BY charge_code, container_type, currency
                ORDER BY data_atualizacao_chave DESC, data_atualizacao DESC
              ) AS rn
            FROM dados_dachser.${table}
          )
          SELECT
            prev.fee                    AS fee_anterior,
            curr.fee                    AS fee_atual,
            (curr.fee - prev.fee)       AS diff_abs,
            CASE WHEN prev.fee IS NOT NULL AND prev.fee != 0
                 THEN ROUND((curr.fee - prev.fee) / prev.fee * 100, 4)
                 ELSE NULL
            END                         AS diff_pct,
            curr.charge_description,
            curr.charge_code,
            curr.container_type,
            curr.currency,
            curr.unit_of_measure,
            prev.effective              AS effective_anterior,
            curr.effective              AS effective_atual,
            prev.chave                  AS dt_chave_anterior,
            curr.chave                  AS dt_chave_atual,
            prev.data_atualizacao_chave AS dt_ordenacao_anterior,
            curr.data_atualizacao_chave AS dt_ordenacao_atual,
            prev.user_atualizacao       AS src_anterior,
            curr.user_atualizacao       AS src_atual
          FROM ranked curr
          LEFT JOIN ranked prev
            ON  curr.charge_code    = prev.charge_code
            AND curr.container_type = prev.container_type
            AND curr.currency       = prev.currency
            AND prev.rn = 2
          WHERE curr.rn = 1
            AND prev.fee IS NOT NULL
            AND curr.fee != prev.fee
          ORDER BY curr.data_atualizacao_chave DESC, curr.charge_code
        `);

        for (const row of rows || []) {
          allChanges.push({
            chave:              row.dt_chave_atual || null,
            empresa,
            charge_description: row.charge_description,
            charge_code:        row.charge_code,
            container_type:     row.container_type,
            currency:           row.currency,
            unit_of_measure:    row.unit_of_measure,
            fee_anterior:       row.fee_anterior,
            fee_atual:          row.fee_atual,
            diff_abs:           row.diff_abs,
            diff_pct:           row.diff_pct,
            effective_anterior: row.effective_anterior,
            effective_atual:    row.effective_atual,
            dt_chave_anterior:  row.dt_chave_anterior,
            dt_chave_atual:     row.dt_chave_atual,
            dt_ordenacao_anterior: row.dt_ordenacao_anterior,
            dt_ordenacao_atual:    row.dt_ordenacao_atual,
            src_anterior:       row.src_anterior,
            src_atual:          row.src_atual,
          });
        }
      } catch (companyErr) {
        console.error(`[GET /api/fin/fee-changes] ${table}: ${companyErr.message}`);
      }
    }

    allChanges.sort((a, b) => {
      const ta = a.dt_ordenacao_atual ? new Date(a.dt_ordenacao_atual).getTime() : 0;
      const tb = b.dt_ordenacao_atual ? new Date(b.dt_ordenacao_atual).getTime() : 0;
      return tb - ta;
    });

    if (allChanges.length > 0) allChanges[0].is_latest = true;

    const seenEmpresa = new Set();
    for (const c of allChanges) {
      if (!seenEmpresa.has(c.empresa)) {
        seenEmpresa.add(c.empresa);
        c.is_latest_empresa = true;
      }
    }

    const latestMarked = allChanges.filter(c => c.is_latest || c.is_latest_empresa);

    res.json({ success: true, changes: allChanges, latestMarked });
  } catch (err) {
    console.error('[GET /api/fin/fee-changes]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── USUÁRIOS ESTEIRA ────────────────────────────────────────────────

// GET /api/fin/users/esteira
app.get('/api/fin/users/esteira', async (req, res) => {
  try {
    const users = await finQuery(`
      SELECT id, username AS nome, email, esteira_role, esteira_active, supervisor_id
      FROM dados_dachser.t_users_dachser
      ORDER BY username ASC
    `);
    res.json({ success: true, users: users || [] });
  } catch (err) {
    console.error('[GET /api/fin/users/esteira]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/esteira-role
app.patch('/api/fin/users/:id/esteira-role', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_role } = req.body || {};
    await finQuery(`UPDATE dados_dachser.t_users_dachser SET esteira_role = ? WHERE id = ?`, [esteira_role || null, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/esteira-role]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/esteira-active
app.patch('/api/fin/users/:id/esteira-active', async (req, res) => {
  try {
    const { id } = req.params;
    const { esteira_active } = req.body || {};
    await finQuery(`UPDATE dados_dachser.t_users_dachser SET esteira_active = ? WHERE id = ?`, [esteira_active ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/esteira-active]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fin/users/:id/supervisor
app.patch('/api/fin/users/:id/supervisor', async (req, res) => {
  try {
    const { id } = req.params;
    const { supervisor_id } = req.body || {};
    await finQuery(`UPDATE dados_dachser.t_users_dachser SET supervisor_id = ? WHERE id = ?`, [supervisor_id || null, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/fin/users/:id/supervisor]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── MÉTRICAS POR MÓDULO ─────────────────────────────────────────────

// GET /api/fin/metrics/by-module
app.get('/api/fin/metrics/by-module', async (req, res) => {
  try {
    const { dateFrom, dateTo, username } = req.query;
    const from = dateFrom || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);
    const HIDDEN = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];
    const params = [from, to, ...HIDDEN];
    let userFilter = '';
    if (username) { userFilter = ' AND username = ?'; params.push(username); }
    const rows = await finQuery(`
      SELECT
        SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '/', 2), '/', -1) AS module,
        COUNT(*)                AS totalAccesses,
        COUNT(DISTINCT username) AS uniqueUsers,
        SUBSTRING_INDEX(
          GROUP_CONCAT(endpoint ORDER BY endpoint SEPARATOR '||'),
          '||', 1
        ) AS topEndpoint
      FROM dados_dachser.t_usage_logs
      WHERE DATE(event_time) BETWEEN ? AND ?
        AND username NOT IN (${HIDDEN.map(() => '?').join(', ')})
        AND endpoint NOT LIKE '/dashboard%'
        AND endpoint NOT LIKE 'dashboard%'
        AND endpoint NOT LIKE '/admin%'
        AND endpoint NOT LIKE 'admin%'
        AND username IS NOT NULL AND username != ''
        ${userFilter}
      GROUP BY module
      ORDER BY totalAccesses DESC
    `, params);
    const LABELS = { air: 'AIR', sea: 'Marítimo', fin: 'Financeiro', admin: 'Admin', olimpo: 'Olimpo', chb: 'CHB', cct: 'CCT' };
    const BLOCKED_MODULES = ['dashboard', 'admin', 'outros', '', null];
    
    const modules = (rows || [])
      .filter(r => !BLOCKED_MODULES.includes(r.module))
      .map(r => ({
      module: r.module,
      label: LABELS[r.module] || (r.module || 'Outros').toUpperCase(),
      totalAccesses: Number(r.totalAccesses) || 0,
      uniqueUsers: Number(r.uniqueUsers) || 0,
      avgTimeOnScreenSec: 0,
      topEndpoint: r.topEndpoint || null,
    }));
    res.json({ success: true, modules });
  } catch (err) {
    console.error('[GET /api/fin/metrics/by-module]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════

}
