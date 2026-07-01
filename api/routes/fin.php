<?php
// api/routes/fin.php
// Rotas FIN: /api/fin/*, /api/freetime/*, /api/notifications/voucher

global $router;

if (!function_exists('finQuery')) {
    function finQuery($sql, $params = []) {
        return queryWithRetry(getFinPDO(), $sql, $params);
    }
}

function formatDateForDB($d) {
    if (!$d) return null;
    $s = trim((string)$d);
    if (!$s || in_array($s, ['null','undefined','Invalid Date'])) return null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return "$s 00:00:00";
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/', $s)) return $s;
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m)) return "{$m[3]}-{$m[2]}-{$m[1]} 00:00:00";
    if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) return substr($s, 0, 10) . ' 00:00:00';
    return null;
}

function genUUID() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
}

function mapFormaPagamento($v) {
    if (!$v) return 'BOLETO';
    $u = strtoupper($v);
    if (str_contains($u,'BOL')) return 'BOLETO';
    if (str_contains($u,'PIX')) return 'TRANSFERENCIA_PIX';
    if (str_contains($u,'TED') || str_contains($u,'DOC') || str_contains($u,'TRANSF')) return 'TRANSFERENCIA_PIX';
    if (str_contains($u,'DEBITO')) return 'DEBITO_CONTA';
    if (str_contains($u,'DARF')) return 'DARF';
    if (str_contains($u,'GPS')) return 'GPS';
    return 'BOLETO';
}

// ── GET /api/fin/stats ────────────────────────────────────────────────────────
$router->get('fin/stats', function($params) {
    try {
        $lastRows = finQuery("SELECT MAX(data_insert) as last_update FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'");
        $statsRows = finQuery("SELECT COUNT(*) as total_records, COALESCE(SUM(valor_nf), 0) as total_valor FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'");
        $etapaRows = finQuery("SELECT COALESCE(etapa_atual, 'OPERACAO') as etapa, COUNT(*) as count FROM dados_dachser.t_vouchers GROUP BY etapa_atual ORDER BY count DESC");
        $etapaLabels = ['RASCUNHO'=>'Rascunho','OPERACAO'=>'Operação','FISCAL'=>'Fiscal','SUPERVISOR'=>'Supervisor','FINANCEIRO'=>'Financeiro','ROBO'=>'Robô','CONCLUIDO'=>'Concluído','CANCELADO'=>'Cancelado','A_PROCESSAR'=>'A Processar'];
        sendJson(['success' => true, 'stats' => ['lastUpdate' => $lastRows[0]['last_update'] ?? null, 'totalVouchers' => (int)($statsRows[0]['total_records'] ?? 0), 'totalValor' => (float)($statsRows[0]['total_valor'] ?? 0), 'etapaBreakdown' => array_map(fn($r) => ['etapa' => $r['etapa'], 'label' => $etapaLabels[$r['etapa']] ?? $r['etapa'], 'count' => (int)$r['count']], $etapaRows ?: [])]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/users ───────────────────────────────────────────────────────
$router->get('fin/users', function($params) {
    try { sendJson(['success' => true, 'users' => finQuery("SELECT id, username, email, is_admin, COALESCE(esteira_role, NULL) as esteira_role, COALESCE(esteira_active, 1) as esteira_active, supervisor_id FROM dados_dachser.t_users_dachser ORDER BY username ASC") ?: []]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/search-masters ─────────────────────────────────────
$router->get('fin/vouchers/search-masters', function($params) {
    try {
        $spo = trim($_GET['spo_prefix'] ?? '');
        if (strlen($spo) < 2) sendJson(['success' => true, 'data' => []]);
        sendJson(['success' => true, 'data' => finQuery("SELECT DISTINCT voucher_master_id, numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id IS NOT NULL AND SUBSTRING_INDEX(TRIM(numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci LIMIT 50", [$spo]) ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/search ─────────────────────────────────────────────
$router->get('fin/vouchers/search', function($params) {
    try {
        $term = trim($_GET['search'] ?? '');
        if (strlen($term) < 2) sendJson(['success' => true, 'data' => [], 'count' => 0]);
        $exactNd = preg_match('/^[A-Z0-9._\-\/]{4,}$/i', $term) ? explode(' ', $term)[0] : null;
        $vouchers = [];
        if ($exactNd) {
            $vouchers = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf FROM dados_dachser.t_dados_financeiro_voucher WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE v.sync_status = 'ATIVO' AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '') AND v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER') AND (SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci OR dfv.nd IS NOT NULL) ORDER BY v.updated_at DESC LIMIT 100", [$exactNd, $exactNd]) ?: [];
        }
        sendJson(['success' => true, 'data' => $vouchers, 'count' => count($vouchers)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/pendentes-rm ───────────────────────────────────────
$router->get('fin/vouchers/pendentes-rm', function($params) {
    try {
        try {
            $pendentes = finQuery("WITH spo AS (SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario, dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal, dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento, dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.created_by, dfs.detalhes FROM dados_dachser.t_dados_financeiro_spo dfs WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%') AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')), voucher AS (SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes FROM dados_dachser.t_dados_financeiro_voucher dfv WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')), unified AS (SELECT * FROM spo UNION ALL SELECT v.* FROM voucher v WHERE NOT EXISTS (SELECT 1 FROM spo s WHERE s.numero_processo IS NOT NULL AND s.numero_processo COLLATE utf8mb4_unicode_ci = v.numero_processo COLLATE utf8mb4_unicode_ci)) SELECT u.* FROM unified u LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL ORDER BY u.data_vencimento ASC");
        } catch (Exception $e) {
            $pendentes = finQuery("SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes FROM dados_dachser.t_dados_financeiro_voucher dfv LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM') ORDER BY dfv.data_vencimento ASC");
        }
        $normalized = array_map(function($row) {
            $processos = [];
            if ($row['source'] === 'SPO' && !empty($row['detalhes'])) {
                $seen = []; $parts = explode(';', $row['detalhes']);
                foreach ($parts as $p) { $p = trim($p); if ($p && !in_array($p, $seen)) { $processos[] = $p; $seen[] = $p; } }
            }
            return array_merge($row, ['processos_associados' => $processos]);
        }, $pendentes ?: []);
        sendJson(['success' => true, 'data' => $normalized]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/combined ───────────────────────────────────────────
$router->get('fin/vouchers/combined', function($params) {
    try {
        $dataVencInicio = $_GET['data_vencimento_inicio'] ?? $_GET['data_emissao_inicio'] ?? null;
        $dataVencFim = $_GET['data_vencimento_fim'] ?? $_GET['data_emissao_fim'] ?? null;
        $hasMonthFilter = !empty($dataVencInicio) && !empty($dataVencFim);

        try { finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS ref_fornecedor VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}
        try { finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS mawb_mbl VARCHAR(255) DEFAULT NULL"); } catch (Exception $e) {}

        $ativosMonthClause = $hasMonthFilter ? "AND (v.etapa_atual IN ('RASCUNHO','OPERACAO','FINANCEIRO') OR (v.vencimento >= ? AND v.vencimento < ?) OR (v.vencimento IS NULL AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?))" : '';
        $ativosParams = $hasMonthFilter ? [$dataVencInicio, $dataVencFim, $dataVencInicio, $dataVencFim] : [];

        $combinedAtivos = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao, MAX(data_vencimento) as data_vencimento, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE sync_status = 'ATIVO' AND (voucher_master_id IS NULL OR voucher_master_id = '') AND etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER') AND (etapa_atual NOT IN ('CONCLUIDO','CANCELADO') OR (etapa_atual IN ('CONCLUIDO','CANCELADO') AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR))) $ativosMonthClause ORDER BY v.created_at DESC", $ativosParams) ?: [];

        $pendentesMonthClause = $hasMonthFilter ? 'AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?' : '';
        $pendentesParams = $hasMonthFilter ? [$dataVencInicio, $dataVencFim] : [];

        $combinedPendentes = finQuery("SELECT dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by FROM dados_dachser.t_dados_financeiro_voucher dfv LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM') $pendentesMonthClause ORDER BY dfv.data_vencimento ASC", $pendentesParams) ?: [];

        sendJson(['success' => true, 'ativos' => $combinedAtivos, 'pendentes_rm' => $combinedPendentes, 'count_ativos' => count($combinedAtivos), 'count_pendentes' => count($combinedPendentes)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/esteira ────────────────────────────────────────────
$router->get('fin/vouchers/esteira', function($params) {
    try {
        $search = $_GET['search'] ?? null;
        $etapa = $_GET['etapa'] ?? null;
        $where = ["(v.voucher_master_id IS NULL OR v.voucher_master_id = '')", "v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')", "(dfv.modal IS NULL OR dfv.modal <> 'ADM')", "(v.etapa_atual != 'CONCLUIDO' OR (v.etapa_atual = 'CONCLUIDO' AND v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))", "NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = dfv.id_rm AND b.StatusLan IN (1, 2, 3))"];
        $qp = [];
        if ($search) { $where[] = '(v.numero_spo LIKE ? OR v.fornecedor LIKE ? OR v.cnpj_fornecedor LIKE ?)'; $qp[] = "%$search%"; $qp[] = "%$search%"; $qp[] = "%$search%"; }
        if ($etapa) { $where[] = 'v.etapa_atual = ?'; $qp[] = $etapa; }
        $whereStr = implode(' AND ', $where);
        $vouchers = finQuery("SELECT v.*, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf, (SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS criado_por_user_name FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf, MAX(modal) as modal FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE $whereStr GROUP BY v.id ORDER BY v.created_at DESC", $qp) ?: [];
        sendJson(['success' => true, 'data' => $vouchers]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/find-multi ────────────────────────────────────────
$router->post('fin/vouchers/find-multi', function($params) {
    try {
        $body = getRequestBody();
        $spoPrimary = $body['spoPrimary'] ?? null;
        $ndPrimary = $body['ndPrimary'] ?? null;
        $spoCandidates = $body['spoCandidates'] ?? [];
        $ndCandidates = $body['ndCandidates'] ?? [];
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";

        $lookupBySPO = function($spo) use ($cols) {
            if (!$spo) return null;
            $rows = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$spo]);
            if (!empty($rows)) return ['voucher' => $rows[0], 'matchedCandidate' => "SPO:$spo"];
            $child = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 1", [$spo]);
            if (!empty($child)) return ['voucher' => $child[0], 'matchedCandidate' => "SPO:$spo"];
            return null;
        };
        $lookupByND = function($nd) use ($cols) {
            if (!$nd) return null;
            foreach (["id_rm = ?", "processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci", "SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci"] as $w) {
                $rows = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE $w ORDER BY created_at DESC LIMIT 5", [$nd]);
                if (!empty($rows)) return ['voucher' => $rows[0], 'matchedCandidate' => "ND:$nd"];
            }
            return null;
        };

        $candidates = [fn() => $lookupBySPO($spoPrimary), fn() => $lookupByND($ndPrimary)];
        foreach ($spoCandidates as $s) $candidates[] = fn() => $lookupBySPO($s);
        foreach ($ndCandidates as $n) $candidates[] = fn() => $lookupByND($n);

        foreach ($candidates as $fn) { $result = $fn(); if ($result) sendJson(array_merge(['success' => true], $result)); }
        sendJson(['success' => true, 'voucher' => null, 'matchedCandidate' => null]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/find-by-spo ────────────────────────────────────────
$router->get('fin/vouchers/find-by-spo', function($params) {
    try {
        $spo = trim($_GET['spo'] ?? '');
        if (!$spo) sendJson(['success' => false, 'error' => 'spo é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";
        $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 10", [$spo]) ?: [];
        if (empty($vouchers)) $vouchers = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$spo]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/find-by-nd ─────────────────────────────────────────
$router->get('fin/vouchers/find-by-nd', function($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd) sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";
        $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers)) $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers)) $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$nd]) ?: [];
        $masters = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$nd, $nd]) ?: [];
        sendJson(['success' => true, 'vouchers' => array_merge($vouchers, $masters)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/by-nd ───────────────────────────────────────────────
$router->get('fin/vouchers/by-nd', function($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd) sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id";
        $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers)) $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers)) $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$nd]) ?: [];
        $masters = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.is_master, m.nome_master, m.id_rm, m.processo_id, c.id as child_voucher_id, c.numero_spo as child_spo FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$nd, $nd]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers, 'masterVouchers' => $masters]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/log ────────────────────────────────────────────────
$router->post('fin/vouchers/log', function($params) {
    try {
        $b = getRequestBody();
        if (empty($b['voucher_id']) || empty($b['acao'])) sendJson(['success' => false, 'error' => 'voucher_id e acao são obrigatórios'], 400);
        finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, ?, ?, NOW())", [$b['voucher_id'], $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', $b['acao'], $b['detalhe'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/report ─────────────────────────────────────────────
$router->get('fin/vouchers/report', function($params) {
    try {
        $where = []; $qp = [];
        $etapa = $_GET['etapa'] ?? null; $statusBaixa = $_GET['statusBaixa'] ?? null; $cobranca = $_GET['cobrancaEmNomeDe'] ?? null; $dataInicio = $_GET['dataInicio'] ?? null; $dataFim = $_GET['dataFim'] ?? null;
        if ($etapa && $etapa !== 'all') { if ($etapa === 'OPERACAO') { $where[] = "v.etapa_atual IN ('OPERACAO','A_PROCESSAR','AJUSTE_OPERACAO')"; } elseif ($etapa === 'FISCAL') { $where[] = "v.etapa_atual IN ('FISCAL','AJUSTE_FISCAL')"; } else { $where[] = 'v.etapa_atual = ?'; $qp[] = $etapa; } }
        if ($statusBaixa && $statusBaixa !== 'all') { $where[] = 'v.status_baixa = ?'; $qp[] = $statusBaixa; }
        if ($cobranca && $cobranca !== 'all') { $where[] = 'v.cobranca_em_nome_de = ?'; $qp[] = $cobranca; }
        if ($dataInicio) { $where[] = 'v.created_at >= ?'; $qp[] = $dataInicio; }
        if ($dataFim) { $where[] = 'v.created_at <= ?'; $qp[] = "$dataFim 23:59:59"; }
        $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
        $vouchers = finQuery("SELECT v.*, u_criado.username AS criado_por_username FROM dados_dachser.t_vouchers v LEFT JOIN dados_dachser.t_users_dachser u_criado ON v.criado_por_user_id = u_criado.id LEFT JOIN (SELECT nd, MAX(created_by) AS created_by FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci $whereClause ORDER BY v.created_at DESC LIMIT 5000", $qp) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/master/search ──────────────────────────────────────
$router->get('fin/vouchers/master/search', function($params) {
    try {
        $search = $_GET['search'] ?? '';
        if (strlen($search) < 6) sendJson(['success' => true, 'data' => []]);
        $rows = finQuery("SELECT * FROM (SELECT v.numero_spo AS processo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda, v.vencimento FROM dados_dachser.t_vouchers v WHERE v.is_master = 0 AND v.voucher_master_id IS NULL AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO') UNION ALL SELECT a.nd AS processo, a.razao_social AS fornecedor, a.cnpj AS cnpj_fornecedor, a.valor_nf AS valor, a.moeda, a.data_vencimento AS vencimento FROM dados_dachser.t_dados_financeiro_voucher a) x WHERE x.processo LIKE ?", ["%$search"]) ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/:id/filhos ─────────────────────────────────────────
$router->get('fin/vouchers/:id/filhos', function($params) {
    try {
        $filhos = finQuery("SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, etapa_atual, status_envio_cliente, cobranca_em_nome_de, forma_pagamento, tipo_documento FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY created_at ASC", [$params['id']]) ?: [];
        sendJson(['success' => true, 'data' => $filhos]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/:id/anexos ─────────────────────────────────────────
$router->get('fin/vouchers/:id/anexos', function($params) {
    try {
        sendJson(['success' => true, 'data' => finQuery("SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC", [$params['id']]) ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/:id ─────────────────────────────────────────────────
$router->get('fin/vouchers/:id', function($params) {
    try {
        $id = $params['id'];
        $vouchers = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm AS dfv_id_rm, dfv.numero_processo AS dfv_numero_processo, dfv.razao_social AS dfv_razao_social, dfv.nome_beneficiario AS dfv_nome_beneficiario, dfv.valor_nf AS dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) AS id_rm, MAX(data_emissao) AS data_emissao, MIN(numero_processo) AS numero_processo, MAX(razao_social) AS razao_social, MAX(nome_beneficiario) AS nome_beneficiario, MAX(valor_nf) AS valor_nf FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE v.id = ?", [$id]) ?: [];
        $voucher = $vouchers[0] ?? null;
        if (!$voucher) sendJson(['success' => true, 'data' => null, 'anexos' => [], 'logs' => []]);
        $anexos = finQuery("SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC", [$id]) ?: [];
        $logs = finQuery("SELECT id, voucher_id, user_id, user_name, acao, detalhe, data_hora FROM dados_dachser.t_voucher_logs WHERE voucher_id = ? ORDER BY data_hora DESC", [$id]) ?: [];
        sendJson(['success' => true, 'data' => $voucher, 'anexos' => $anexos, 'logs' => $logs]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers ────────────────────────────────────────────────────
$router->post('fin/vouchers', function($params) {
    try {
        $d = getRequestBody();
        $numeroSpo = trim((string)($d['numero_spo'] ?? ''));
        if (!$numeroSpo) sendJson(['error' => 'numero_spo é obrigatório'], 400);
        if (str_starts_with($numeroSpo, 'MANUAL-')) sendJson(['error' => 'Número de voucher/SPO inválido. Use um número real do RM.'], 400);
        $nil = fn($v) => ($v === '' || $v === null) ? null : $v;
        $toDate = function($v) { if (!$v) return date('Y-m-d 00:00:00'); $s = trim((string)$v); if (!$s || in_array($s, ['null','undefined'])) return date('Y-m-d 00:00:00'); if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return "$s 00:00:00"; if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) return substr($s,0,10) . ' 00:00:00'; return date('Y-m-d 00:00:00'); };

        $existing = finQuery("SELECT id, numero_spo, etapa_atual FROM dados_dachser.t_vouchers WHERE numero_spo = ?", [$numeroSpo]) ?: [];
        if (!empty($existing)) {
            $advanced = array_filter($existing, fn($v) => $v['etapa_atual'] !== 'A_PROCESSAR');
            if (!empty($advanced)) { $adv = array_values($advanced)[0]; sendJson(['error' => "Voucher com número $numeroSpo já existe na etapa {$adv['etapa_atual']}", 'existingId' => $adv['id'], 'existingEtapa' => $adv['etapa_atual'], 'duplicate' => true]); }
            foreach ($existing as $ex) { finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$ex['id']]); finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$ex['id']]); finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$ex['id']]); }
        }
        $voucherId = $d['id'] ?? genUUID();
        finQuery("INSERT INTO dados_dachser.t_vouchers (id, id_rm, numero_spo, vencimento, cobranca_em_nome_de, forma_pagamento, remessa, urgente, urgencia_tipo, etapa_atual, status_baixa, status_envio_cliente, status_financeiro, tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor, cliente_email, filial, data_emissao_documento, comentarios_operacao, comentarios_fiscal, comentarios_financeiro, ajuste_operacao, ajuste_fiscal, criado_por_user_id, processo_id, origem_processo, chave_pix, status_documento_fiscal, tipo_execucao_pagamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$voucherId, $nil($d['id_rm'] ?? null), $nil($d['numero_spo'] ?? null), $toDate($d['vencimento'] ?? null), $nil($d['cobranca_em_nome_de'] ?? null) ?? 'DACHSER', $nil($d['forma_pagamento'] ?? null) ?? 'BOLETO', $nil($d['remessa'] ?? null) ?? 'NENHUM', !empty($d['urgente']) ? 1 : 0, $nil($d['urgencia_tipo'] ?? null) ?? 'NORMAL', $nil($d['etapa_atual'] ?? null) ?? 'OPERACAO', $nil($d['status_baixa'] ?? null) ?? 'PENDENTE', $nil($d['status_envio_cliente'] ?? null) ?? 'NAO_APLICA', $nil($d['status_financeiro'] ?? null) ?? 'PENDENTE', $nil($d['tipo_documento'] ?? null), $nil($d['valor'] ?? null), $nil($d['moeda'] ?? null) ?? 'BRL', $nil($d['fornecedor'] ?? null), isset($d['cnpj_fornecedor']) ? preg_replace('/\D/', '', $d['cnpj_fornecedor']) : null, $nil($d['cliente_email'] ?? null), $nil($d['filial'] ?? null), $toDate($d['data_emissao_documento'] ?? null), $nil($d['comentarios_operacao'] ?? null), $nil($d['comentarios_fiscal'] ?? null), $nil($d['comentarios_financeiro'] ?? null), $nil($d['ajuste_operacao'] ?? null), $nil($d['ajuste_fiscal'] ?? null), $nil($d['criado_por_user_id'] ?? null), $nil($d['processo_id'] ?? null), $nil($d['origem_processo'] ?? null), $nil($d['chave_pix'] ?? null), $nil($d['status_documento_fiscal'] ?? null) ?? 'ANEXADO', 'A_DEFINIR']);
        sendJson(['success' => true, 'mariadbId' => $voucherId]);
    } catch (Exception $e) { sendJson(['error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/master ─────────────────────────────────────────────
$router->post('fin/vouchers/master', function($params) {
    try {
        $b = getRequestBody();
        $voucher_ids = $b['voucher_ids'] ?? [];
        if (!is_array($voucher_ids) || count($voucher_ids) < 2) sendJson(['success' => false, 'error' => 'Mínimo 2 voucher_ids são obrigatórios'], 400);
        $masterId = genUUID();
        $seqRows = finQuery("SELECT IFNULL(MAX(CAST(REPLACE(numero_spo,'MASTER-','') AS UNSIGNED)),0)+1 AS next_num FROM dados_dachser.t_vouchers WHERE numero_spo LIKE 'MASTER-%'");
        $nextNum = (int)($seqRows[0]['next_num'] ?? 1);
        $numeroSpoMaster = $b['nome_master'] ?? 'MASTER-' . str_pad($nextNum, 5, '0', STR_PAD_LEFT);
        finQuery("INSERT INTO dados_dachser.t_vouchers (id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, filial, comentarios_operacao, etapa_atual, is_master, origem_criacao, criado_por_user_id, criado_por_user_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 1, 'MASTER', ?, ?, NOW(), NOW())", [$masterId, $numeroSpoMaster, $b['fornecedor'] ?? null, $b['cnpj_fornecedor'] ?? null, $b['valor_total'] ?? null, $b['moeda'] ?? 'BRL', $b['vencimento'] ?? null, $b['forma_pagamento'] ?? null, $b['tipo_documento'] ?? null, $b['cobranca_em_nome_de'] ?? 'DACHSER', $b['filial'] ?? null, $b['comentarios_operacao'] ?? null, $b['criado_por_user_id'] ?? null, $b['criado_por_user_name'] ?? 'Sistema']);
        $ph = implode(',', array_fill(0, count($voucher_ids), '?'));
        finQuery("UPDATE dados_dachser.t_vouchers SET voucher_master_id = ? WHERE numero_spo IN ($ph)", array_merge([$masterId], $voucher_ids));
        try { finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'MASTER_CRIADO', ?, NOW())", [$masterId, $b['criado_por_user_id'] ?? null, $b['criado_por_user_name'] ?? 'Sistema', "Voucher Master $numeroSpoMaster criado consolidando " . count($voucher_ids) . " processos"]); } catch (Exception $e) {}
        sendJson(['success' => true, 'masterId' => $masterId, 'numeroSpo' => $numeroSpoMaster, 'childCount' => count($voucher_ids)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── PATCH /api/fin/vouchers/:id/esteira ──────────────────────────────────────
$router->patch('fin/vouchers/:id/esteira', function($params) {
    try {
        $id = $params['id'];
        $b = getRequestBody();
        $updates = $b['updates'] ?? [];
        if (empty($updates)) sendJson(['success' => false, 'error' => 'updates é obrigatório'], 400);
        $allowed = ['etapa_atual','status_baixa','status_financeiro','status_comprovante','status_envio_cliente','status_documento_fiscal','is_pronto_para_robo','responsavel_operacao_user_id','responsavel_fiscal_user_id','responsavel_financeiro_user_id','aprovado_por_user_id'];
        $set = []; $qp = [];
        foreach ($updates as $k => $v) { if (in_array($k, $allowed)) { $set[] = "$k = ?"; $qp[] = $v; } }
        if (empty($set)) sendJson(['success' => false, 'error' => 'Nenhum campo permitido informado'], 400);
        $set[] = 'updated_at = NOW()'; $qp[] = $id;
        finQuery("UPDATE dados_dachser.t_vouchers SET " . implode(', ', $set) . " WHERE id = ?", $qp);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── PATCH /api/fin/vouchers/:id ───────────────────────────────────────────────
$router->patch('fin/vouchers/:id', function($params) {
    try {
        $id = $params['id'];
        $b = getRequestBody();
        $updates = $b['updates'] ?? array_diff_key($b, array_flip(['user_id','user_name']));
        $user_id = $b['user_id'] ?? null; $user_name = $b['user_name'] ?? 'Sistema';

        $etapasEditaveis = ['RASCUNHO','A_PROCESSAR','OPERACAO','AJUSTE_OPERACAO'];
        $dataEditFields = ['numero_spo','fornecedor','cnpj_fornecedor','valor','moeda','vencimento','data_emissao_documento','cobranca_em_nome_de','forma_pagamento','tipo_documento','filial','urgencia_tipo','cliente_email','remessa','chave_pix'];
        $hasDataEdit = !empty(array_intersect(array_keys($updates ?? []), $dataEditFields));

        $etapaRows = finQuery("SELECT etapa_atual FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1", [$id]);
        $currentEtapa = $etapaRows[0]['etapa_atual'] ?? null;
        if ($hasDataEdit && $currentEtapa && !in_array($currentEtapa, $etapasEditaveis)) { sendJson(['success' => false, 'error' => 'EDICAO_BLOQUEADA_ETAPA', 'message' => 'Edição de dados permitida apenas nas etapas A Processar, Operacional e Ajuste Operacional.', 'etapa_atual' => $currentEtapa], 403); }

        $fieldMapping = ['etapa_atual','status_baixa','status_financeiro','status_envio_cliente','comentarios_operacao','comentarios_fiscal','comentarios_financeiro','ajuste_operacao','ajuste_fiscal','responsavel_operacao_user_id','responsavel_fiscal_user_id','responsavel_financeiro_user_id','responsavel_supervisor_user_id','aprovado_por_user_id','numero_spo','fornecedor','cnpj_fornecedor','valor','moeda','vencimento','data_emissao_documento','cobranca_em_nome_de','forma_pagamento','tipo_documento','filial','urgencia_tipo','cliente_email','remessa','chave_pix','status_documento_fiscal','status_comprovante','origem_processo','is_pronto_para_robo','linha_digitavel'];
        $dateFields = ['vencimento','data_emissao_documento'];
        $set = []; $qp = [];
        foreach ($fieldMapping as $field) {
            if (isset($updates[$field])) {
                $set[] = "$field = ?";
                $qp[] = in_array($field, $dateFields) ? formatDateForDB($updates[$field]) : $updates[$field];
            }
        }
        if (!empty($set)) {
            $set[] = 'updated_at = NOW()'; $qp[] = $id;
            finQuery("UPDATE dados_dachser.t_vouchers SET " . implode(', ', $set) . " WHERE id = ?", $qp);
            try { finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDITADO', ?, NOW())", [$id, $user_id, $user_name, 'Voucher editado. Campos: ' . implode(', ', array_keys($updates))]); } catch (Exception $e) {}
        }
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/:id/log ───────────────────────────────────────────
$router->post('fin/vouchers/:id/log', function($params) {
    try {
        $b = getRequestBody(); $id = $params['id'];
        if (empty($b['acao'])) sendJson(['success' => false, 'error' => 'acao é obrigatório'], 400);
        finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json, data_hora) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())", [$id, $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', $b['acao'], $b['detalhe'] ?? null, $b['origin'] ?? 'UI', $b['entity_type'] ?? 'VOUCHER', $b['event_type'] ?? null, isset($b['payload_json']) ? json_encode($b['payload_json']) : null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/vouchers/:id ──────────────────────────────────────────────
$router->delete('fin/vouchers/:id', function($params) {
    try {
        $id = $params['id'];
        finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$id]);
        try { finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$id]); } catch (Exception $e) {}
        finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$id]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/:id/disassemble ────────────────────────────────────
$router->post('fin/vouchers/:id/disassemble', function($params) {
    try {
        $master_id = $params['id']; $b = getRequestBody();
        $child_ids = $b['child_ids'] ?? null; $keep_master = $b['keep_master'] ?? false;
        $computeDestino = fn($urgencia, $cobranca) => strtoupper($urgencia ?? '') === 'URGENTE_REAL' ? 'SUPERVISOR' : (strtoupper($cobranca ?? '') === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
        $targetIds = (!empty($child_ids) && is_array($child_ids)) ? $child_ids : array_column(finQuery("SELECT id FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?", [$master_id]) ?: [], 'id');
        $childrenRestored = 0;
        if (!empty($targetIds)) {
            $ph = implode(',', array_fill(0, count($targetIds), '?'));
            $childRows = finQuery("SELECT id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN ($ph)", $targetIds) ?: [];
            foreach ($childRows as $c) { finQuery("UPDATE dados_dachser.t_vouchers SET voucher_master_id = NULL, etapa_atual = ?, updated_at = NOW() WHERE id = ?", [$computeDestino($c['urgencia_tipo'], $c['cobranca_em_nome_de']), $c['id']]); $childrenRestored++; }
        }
        $remaining = (int)(finQuery("SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?", [$master_id])[0]['count'] ?? 0);
        if (!$keep_master || $remaining === 0) {
            try { finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$master_id]); } catch (Exception $e) {}
            try { finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$master_id]); } catch (Exception $e) {}
            finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$master_id]);
        }
        sendJson(['success' => true, 'childrenRestored' => $childrenRestored, 'remainingChildren' => $remaining, 'masterDeleted' => !$keep_master || $remaining === 0]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── PATCH /api/fin/users/:id/role ─────────────────────────────────────────────
$router->patch('fin/users/:id/role', function($params) {
    try { $b = getRequestBody(); finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_role = ? WHERE id = ?", [$b['esteira_role'] ?? null, $params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── PATCH /api/fin/users/:id/active ──────────────────────────────────────────
$router->patch('fin/users/:id/active', function($params) {
    try { $b = getRequestBody(); finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_active = ? WHERE id = ?", [!empty($b['esteira_active']) ? 1 : 0, $params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/accrual ──────────────────────────────────────────────────────
$router->get('fin/accrual', function($params) {
    try {
        $search = $_GET['search'] ?? null;
        $rows = $search ? finQuery("SELECT * FROM dados_dachser.t_accrual_entries WHERE fornecedor LIKE ? OR shared_code LIKE ? ORDER BY created_at DESC", ["%$search%", "%$search%"]) : finQuery("SELECT * FROM dados_dachser.t_accrual_entries ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/accrual ─────────────────────────────────────────────────────
$router->post('fin/accrual', function($params) {
    try {
        $b = getRequestBody();
        if (empty($b['fornecedor']) || !isset($b['valor'])) sendJson(['success' => false, 'error' => 'fornecedor e valor são obrigatórios'], 400);
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", [$id, $b['fornecedor'], $b['valor'], $b['shared_code'] ?? null, $b['status_accrual'] ?? 'ATIVO', $b['uploaded_by_user_id'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/accrual/bulk ────────────────────────────────────────────────
$router->post('fin/accrual/bulk', function($params) {
    try {
        $b = getRequestBody(); $entries = $b['entries'] ?? [];
        if (empty($entries)) sendJson(['success' => true, 'inserted' => 0]);
        $inserted = 0;
        foreach ($entries as $e) { finQuery("INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual) VALUES (?, ?, ?, ?, 'ATIVO')", [genUUID(), $e['fornecedor'], $e['valor'], $e['shared_code'] ?? null]); $inserted++; }
        sendJson(['success' => true, 'inserted' => $inserted]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/accrual/all ───────────────────────────────────────────────
$router->delete('fin/accrual/all', function($params) {
    try { finQuery("DELETE FROM dados_dachser.t_accrual_entries"); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/accrual/:id ───────────────────────────────────────────────
$router->delete('fin/accrual/:id', function($params) {
    try { finQuery("DELETE FROM dados_dachser.t_accrual_entries WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/sync/incremental ───────────────────────────────────────────
$router->post('fin/sync/incremental', function($params) { sendJson(['success' => true, 'message' => 'Sync iniciado']); });

// ── POST /api/fin/sync/baixados ───────────────────────────────────────────────
$router->post('fin/sync/baixados', function($params) {
    try {
        try { finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS sync_status ENUM('ATIVO', 'BAIXADO') DEFAULT 'ATIVO'"); } catch (Exception $e) {}
        $result = finQuery("UPDATE dados_dachser.t_vouchers v JOIN dados_dachser.t_dados_financeiro_voucher dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci JOIN dados_dachser.tbaixas b ON CAST(dfv.id_rm AS UNSIGNED) = b.IdLancamentoRM SET v.sync_status = 'BAIXADO', v.etapa_atual = 'CONCLUIDO' WHERE v.sync_status = 'ATIVO'");
        sendJson(['success' => true, 'marked' => $result['affectedRows'] ?? 0]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/anexos (upload BLOB) ───────────────────────────────
$router->post('fin/vouchers/anexos', function($params) {
    try {
        $b = getRequestBody();
        $voucher_id = $b['voucher_id'] ?? null; $file_name = $b['file_name'] ?? null;
        if (!$voucher_id || !$file_name) sendJson(['success' => false, 'error' => 'voucher_id e file_name são obrigatórios'], 400);
        $id = genUUID();
        $fileBlob = null;
        if (!empty($b['file_base64'])) { $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $b['file_base64']); $fileBlob = base64_decode($base64Data); }
        $file_url = "/api/fin/vouchers/anexos/$id/download";
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)", [$id, $voucher_id, $b['tipo'] ?? 'OUTROS', $file_name, $file_url, $b['file_size'] ?? 0, $b['mime_type'] ?? null, $fileBlob]);
        if (!empty($b['user_id']) || !empty($b['user_name'])) { try { finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'ANEXO_ADICIONADO', ?, NOW())", [$voucher_id, $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', "Anexo \"$file_name\" ({$b['tipo']})"  . ' adicionado']); } catch (Exception $e) {} }
        sendJson(['success' => true, 'id' => $id, 'file_url' => $file_url]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/vouchers/anexos/:id/download ─────────────────────────────────
$router->get('fin/vouchers/anexos/:id/download', function($params) {
    try {
        $rows = finQuery("SELECT file_name, mime_type, file_content FROM dados_dachser.t_voucher_anexos WHERE id = ?", [$params['id']]);
        $row = $rows[0] ?? null;
        if (!$row || !$row['file_content']) sendJson(['error' => 'Arquivo não encontrado'], 404);
        $mime = $row['mime_type'] ?? 'application/octet-stream';
        header("Content-Type: $mime");
        header('Content-Disposition: inline; filename="' . rawurlencode($row['file_name']) . '"');
        echo $row['file_content'];
        exit;
    } catch (Exception $e) { sendJson(['error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/vouchers/anexos/:id ───────────────────────────────────────
$router->delete('fin/vouchers/anexos/:id', function($params) {
    try { finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/comprovantes/batch ─────────────────────────────────
$router->post('fin/vouchers/comprovantes/batch', function($params) {
    try {
        $b = getRequestBody(); $comprovantes = $b['comprovantes'] ?? [];
        if (empty($comprovantes)) sendJson(['success' => false, 'error' => 'comprovantes[] é obrigatório'], 400);
        $results = array_map(fn($c) => ['voucher_id' => $c['voucher_id'], 'success' => false], $comprovantes);
        foreach ($comprovantes as $i => $c) {
            try {
                $fileBlob = null;
                if (!empty($c['file_base64'])) { $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $c['file_base64']); $fileBlob = base64_decode($base64Data); }
                $anexoId = genUUID();
                $file_url = $fileBlob ? "/api/fin/vouchers/anexos/$anexoId/download" : ($c['file_url'] ?? '');
                finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content) VALUES (?, ?, 'COMPROVANTE', ?, ?, ?, NOW(), ?, ?)", [$anexoId, $c['voucher_id'], $c['file_name'], $file_url, $c['file_size'] ?? 0, $c['mime_type'] ?? null, $fileBlob]);
                finQuery("UPDATE dados_dachser.t_vouchers SET status_comprovante = 'ANEXADO' WHERE id = ?", [$c['voucher_id']]);
                $results[$i]['success'] = true;
            } catch (Exception $e) { $results[$i]['error'] = $e->getMessage(); }
        }
        sendJson(['success' => true, 'results' => $results, 'successCount' => count(array_filter($results, fn($r) => $r['success'])), 'totalCount' => count($comprovantes)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/:id/anexos ────────────────────────────────────────
$router->post('fin/vouchers/:id/anexos', function($params) {
    try {
        $voucherId = $params['id']; $b = getRequestBody();
        if (!$voucherId || empty($b['tipo']) || empty($b['file_name']) || empty($b['file_url'])) sendJson(['error' => 'voucher_id, tipo, file_name e file_url são obrigatórios'], 400);
        $isMaster = 0; $filhosSposJson = null;
        try { $masterRow = finQuery("SELECT COALESCE(is_master,0) AS is_master FROM dados_dachser.t_vouchers WHERE id = ?", [$voucherId]); if (!empty($masterRow) && (int)$masterRow[0]['is_master'] === 1) { $isMaster = 1; $filhos = finQuery("SELECT numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY numero_spo", [$voucherId]); $spos = array_filter(array_column($filhos ?: [], 'numero_spo')); if (!empty($spos)) $filhosSposJson = json_encode(array_values($spos)); } } catch (Exception $e) {}
        $anexoId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, is_master, filhos_spos) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)", [$anexoId, $voucherId, $b['tipo'], $b['file_name'], $b['file_url'], $b['file_size'] ?? 0, $isMaster, $filhosSposJson]);
        sendJson(['success' => true, 'anexoId' => $anexoId]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/rm/fetch ─────────────────────────────────────────────────────
$router->get('fin/rm/fetch', function($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd) sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $ndBase = explode(' ', $nd)[0];
        $ndCandidates = array_unique(array_filter([$nd, $ndBase]));
        $ph = implode(',', array_fill(0, count($ndCandidates), '?'));
        $selectCols = "id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social";
        $isSpoLike = (bool)preg_match('/^\d+-/', $ndBase);
        $result = [];
        $querySpo = fn() => finQuery("SELECT $selectCols FROM dados_dachser.t_dados_financeiro_spo WHERE nd IN ($ph) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1", array_merge($ndCandidates, [$ndBase]));
        $queryVoucher = fn() => finQuery("SELECT $selectCols FROM dados_dachser.t_dados_financeiro_voucher WHERE nd IN ($ph) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1", array_merge($ndCandidates, [$ndBase]));
        if ($isSpoLike) { $result = $querySpo(); if (empty($result)) $result = $queryVoucher(); }
        else { $result = $queryVoucher(); if (empty($result)) $result = $querySpo(); }
        if (empty($result)) sendJson(['success' => false, 'error' => "ND \"$nd\" não encontrado"], 404);
        $r = $result[0];
        $fmtDate = fn($d) => $d ? (date('Y-m-d', strtotime($d))) : null;
        sendJson(['success' => true, 'data' => ['idRM' => (string)($r['id_rm'] ?? ''), 'numeroVoucher' => $r['nd'] ?? '', 'numeroDocumento' => $r['documento'] ?? '', 'fornecedor' => $r['nome_beneficiario'] ?? $r['razao_social'] ?? '', 'filial' => $r['nome_cobranca'] ?? '', 'numeroNF' => $r['numero_nf'] ?? '', 'numeroProcesso' => $r['numero_processo'] ?? '', 'modal' => $r['modal'] ?? '', 'tipoDocumento' => $r['tipo_pag'] ?? '', 'formaPagamento' => mapFormaPagamento($r['forma_pag']), 'dataEmissao' => $fmtDate($r['data_emissao']), 'vencimento' => $fmtDate($r['data_vencimento']), 'valor' => $r['valor_nf'] !== null ? (float)$r['valor_nf'] : null, 'moeda' => $r['moeda'] ?? 'BRL', 'cnpjFornecedor' => $r['cnpj'] ?? null]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/batch-import ────────────────────────────────────────────────
$router->post('fin/batch-import', function($params) {
    try {
        $b = getRequestBody(); $userId = $b['userId'] ?? '';
        try { finQuery("UPDATE dados_dachser.t_voucher_batch_import SET status = 'ABANDONED' WHERE created_by_user_id = ? AND status = 'PENDING_DOCUMENTS' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)", [(string)$userId]); } catch (Exception $e) {}
        $batchId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_batch_import (id, status, original_file_name, total_rows, valid_rows, error_rows, created_by_user_id, created_by_user_name, tipo) VALUES (?, 'PENDING_DOCUMENTS', ?, 0, 0, 0, ?, ?, 'FECHAMENTO_QUINZENAL')", [$batchId, 'FECHAMENTO_QUINZENAL', (string)$userId, (string)$userId]);
        sendJson(['success' => true, 'batch_id' => $batchId, 'tipo' => 'FECHAMENTO_QUINZENAL']);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/batch-import/:id/status ─────────────────────────────────────
$router->get('fin/batch-import/:id/status', function($params) {
    try {
        $batchId = $params['id'];
        $batchRows = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_import WHERE id = ?", [$batchId]);
        if (empty($batchRows)) sendJson(['success' => false, 'error' => 'Lote não encontrado'], 404);
        $items = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? ORDER BY row_index ASC", [$batchId]) ?: [];
        $docs = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ? ORDER BY created_at ASC", [$batchId]) ?: [];
        sendJson(['success' => true, 'batch' => $batchRows[0], 'items' => $items, 'documents' => $docs, 'checklist' => []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/batch-import/:id/pre-lancamento ─────────────────────────────
$router->get('fin/batch-import/:id/pre-lancamento', function($params) {
    try {
        $batchId = $params['id'];
        $vouchers = finQuery("SELECT id, numero_spo, id_rm, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, urgencia_tipo, processo_id, origem_processo, filial, data_emissao_documento, comentarios_operacao, created_at FROM dados_dachser.t_vouchers WHERE etapa_atual = 'PRE_LANCAMENTO' AND voucher_master_id IS NULL AND id NOT IN (SELECT bi.voucher_id FROM dados_dachser.t_voucher_batch_import_item bi WHERE bi.voucher_id IS NOT NULL AND bi.batch_id = ?) ORDER BY vencimento ASC LIMIT 500", [$batchId]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/batch-import/:id/attach-prelancamento ──────────────────────
$router->post('fin/batch-import/:id/attach-prelancamento', function($params) {
    try {
        $batchId = $params['id']; $b = getRequestBody();
        $voucherIds = $b['voucher_ids'] ?? [];
        if (empty($voucherIds)) sendJson(['success' => false, 'error' => 'voucher_ids são obrigatórios'], 400);
        $batchRows = finQuery("SELECT id, status FROM dados_dachser.t_voucher_batch_import WHERE id = ?", [$batchId]);
        if (empty($batchRows)) sendJson(['success' => false, 'error' => 'Lote não encontrado'], 404);
        $ph = implode(',', array_fill(0, count($voucherIds), '?'));
        $vchs = finQuery("SELECT id, numero_spo, id_rm, fornecedor, valor, vencimento, data_emissao_documento, forma_pagamento, comentarios_operacao, processo_id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN ($ph) AND etapa_atual = 'PRE_LANCAMENTO'", $voucherIds) ?: [];
        $attached = 0; $nextRow = 0;
        foreach ($vchs as $v) {
            $destino = strtoupper($v['urgencia_tipo'] ?? '') === 'URGENTE_REAL' ? 'SUPERVISOR' : (strtoupper($v['cobranca_em_nome_de'] ?? '') === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
            $itemId = genUUID();
            finQuery("INSERT INTO dados_dachser.t_voucher_batch_import_item (id, batch_id, row_index, voucher_id, processo, fornecedor, valor, vencimento, data_fatura, forma_pagamento, fatura, historico, status, validation_message, raw_json, etapa_destino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VOUCHER_CRIADO', 'Pré-lançamento anexado ao lote', '{}', ?)", [$itemId, $batchId, $nextRow++, $v['id'], $v['processo_id'] ?? null, $v['fornecedor'], $v['valor'], $v['vencimento'], $v['data_emissao_documento'], $v['forma_pagamento'], $v['numero_spo'], $v['comentarios_operacao'] ?? null, $destino]);
            finQuery("UPDATE dados_dachser.t_vouchers SET etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE', updated_at = NOW() WHERE id = ? AND etapa_atual = 'PRE_LANCAMENTO'", [$v['id']]);
            $attached++;
        }
        sendJson(['success' => true, 'attached' => $attached]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/batch-import/:id/bind-to-voucher ───────────────────────────
$router->post('fin/batch-import/:id/bind-to-voucher', function($params) {
    try {
        $b = getRequestBody();
        $batch_document_id = $b['batch_document_id'] ?? null; $voucher_id = $b['voucher_id'] ?? null; $tipo_anexo = $b['tipo_anexo'] ?? null;
        if (!$batch_document_id || !$voucher_id || !$tipo_anexo) sendJson(['success' => false, 'error' => 'batch_document_id, voucher_id, tipo_anexo são obrigatórios'], 400);
        $docs = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?", [$batch_document_id]);
        if (empty($docs)) sendJson(['success' => false, 'error' => 'Documento não encontrado'], 404);
        $doc = $docs[0];
        $anexoId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())", [$anexoId, $voucher_id, $tipo_anexo, $doc['file_name'], $doc['file_url'], $doc['size_bytes'] ?? 0]);
        finQuery("UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ?, tipo_anexo = ?, status = 'VINCULADO', bound_at = NOW() WHERE id = ?", [$voucher_id, $anexoId, $tipo_anexo, $batch_document_id]);
        sendJson(['success' => true, 'anexo_id' => $anexoId]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/batch-import/:id/finalize ──────────────────────────────────
$router->post('fin/batch-import/:id/finalize', function($params) {
    try {
        $batchId = $params['id']; $b = getRequestBody(); $userId = $b['userId'] ?? '';
        $items = finQuery("SELECT id, voucher_id, etapa_destino, forma_pagamento FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IS NOT NULL", [$batchId]) ?: [];
        $updated = 0;
        foreach ($items as $item) {
            $destino = $item['etapa_destino'] ?? 'FISCAL';
            finQuery("UPDATE dados_dachser.t_vouchers SET etapa_atual = ?, updated_at = NOW() WHERE id = ?", [$destino, $item['voucher_id']]);
            try { finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'LOTE_FINALIZADO', ?, NOW())", [$item['voucher_id'], (string)$userId, (string)$userId, "Lote $batchId finalizado → $destino"]); } catch (Exception $e) {}
            $updated++;
        }
        finQuery("UPDATE dados_dachser.t_voucher_batch_import SET status = 'COMPLETE', updated_at = NOW() WHERE id = ?", [$batchId]);
        sendJson(['success' => true, 'updated' => $updated]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/vouchers/batch-documents ────────────────────────────────────
$router->post('fin/vouchers/batch-documents', function($params) {
    try {
        $b = getRequestBody(); $batch_id = $b['batch_id'] ?? null; $documents = $b['documents'] ?? [];
        if (!$batch_id || empty($documents)) sendJson(['success' => false, 'error' => 'batch_id e documents[] são obrigatórios'], 400);
        try { finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_batch_documents (id VARCHAR(36) PRIMARY KEY, batch_id VARCHAR(36) NOT NULL, file_name VARCHAR(500), file_url TEXT, mime_type VARCHAR(200), size_bytes BIGINT DEFAULT 0, tipo_anexo VARCHAR(50), status VARCHAR(50) DEFAULT 'PENDENTE', uploaded_by_user_id VARCHAR(50), file_content MEDIUMBLOB NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"); } catch (Exception $e) {}
        $ids = [];
        foreach ($documents as $doc) {
            $docId = genUUID(); $fileBlob = null;
            if (!empty($doc['file_base64'])) { $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $doc['file_base64']); $fileBlob = base64_decode($base64Data); }
            $file_url = $fileBlob ? "/api/fin/vouchers/anexos/$docId/download" : ($doc['file_url'] ?? '');
            finQuery("INSERT INTO dados_dachser.t_voucher_batch_documents (id, batch_id, file_name, file_url, mime_type, size_bytes, tipo_anexo, status, uploaded_by_user_id, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)", [$docId, $batch_id, $doc['file_name'], $file_url, $doc['mime_type'] ?? null, $doc['size_bytes'] ?? 0, $doc['tipo_anexo'] ?? null, (string)($b['userId'] ?? ''), $fileBlob]);
            $ids[] = $docId;
        }
        sendJson(['success' => true, 'ids' => $ids, 'inserted' => count($ids)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/freetime/voucher ─────────────────────────────────────────────────
$router->get('freetime/voucher', function($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_freetime_vouchers ORDER BY created_at DESC LIMIT 200") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/freetime/voucher ────────────────────────────────────────────────
$router->post('freetime/voucher', function($params) {
    try {
        $b = getRequestBody();
        try { finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_freetime_vouchers (id VARCHAR(36) PRIMARY KEY, bl_number VARCHAR(100), container_number VARCHAR(50), shipping_line VARCHAR(100), free_time_days INT, demurrage_start DATE, status VARCHAR(50) DEFAULT 'PENDENTE', created_by VARCHAR(100), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"); } catch (Exception $e) {}
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_freetime_vouchers (id, bl_number, container_number, shipping_line, free_time_days, demurrage_start, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [$id, $b['bl_number'] ?? null, $b['container_number'] ?? null, $b['shipping_line'] ?? null, $b['free_time_days'] ?? null, $b['demurrage_start'] ?? null, $b['status'] ?? 'PENDENTE', $b['created_by'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/notifications/voucher ───────────────────────────────────────────
$router->get('notifications/voucher', function($params) {
    try {
        $userId = $_GET['user_id'] ?? null;
        if (!$userId) sendJson(['success' => true, 'notifications' => []]);
        $rows = finQuery("SELECT id, voucher_id, user_id, tipo, mensagem, lido, created_at FROM dados_dachser.t_voucher_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [$userId]) ?: [];
        sendJson(['success' => true, 'notifications' => $rows]);
    } catch (Exception $e) { sendJson(['success' => true, 'notifications' => []]); }
});

// ── POST /api/notifications/voucher ──────────────────────────────────────────
$router->post('notifications/voucher', function($params) {
    try {
        $b = getRequestBody();
        try { finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_notifications (id VARCHAR(36) PRIMARY KEY, voucher_id VARCHAR(100), user_id VARCHAR(100), tipo VARCHAR(50), mensagem TEXT, lido TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"); } catch (Exception $e) {}
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_notifications (id, voucher_id, user_id, tipo, mensagem, lido) VALUES (?, ?, ?, ?, ?, 0)", [$id, $b['voucher_id'] ?? null, $b['user_id'] ?? null, $b['tipo'] ?? 'INFO', $b['mensagem'] ?? '']);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/disputas ─────────────────────────────────────────────────────
$router->get('fin/disputas', function($params) {
    try {
        $rows = finQuery("SELECT d.*, t.razao_social, t.valor_nf, t.modal, t.numero_nf FROM dados_dachser.t_fin_disputas d LEFT JOIN dados_dachser.v_fin_regua_contas_receber t ON (d.documento <> 'CR' AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci) WHERE d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 500") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/disputas ────────────────────────────────────────────────────
$router->post('fin/disputas', function($params) {
    try {
        $b = getRequestBody();
        try { finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_disputas (id INT AUTO_INCREMENT PRIMARY KEY, documento VARCHAR(100), nf VARCHAR(50), nd VARCHAR(50), doc_key VARCHAR(200), is_disputa TINYINT(1) DEFAULT 1, motivo TEXT, user_id VARCHAR(100), user_name VARCHAR(100), resolved_at DATETIME NULL, deleted_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"); } catch (Exception $e) {}
        finQuery("INSERT INTO dados_dachser.t_fin_disputas (documento, nf, nd, doc_key, is_disputa, motivo, user_id, user_name) VALUES (?, ?, ?, ?, 1, ?, ?, ?)", [$b['documento'] ?? null, $b['nf'] ?? null, $b['nd'] ?? null, $b['doc_key'] ?? null, $b['motivo'] ?? null, $b['user_id'] ?? null, $b['user_name'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── PATCH /api/fin/disputas/:id/resolve ──────────────────────────────────────
$router->patch('fin/disputas/:id/resolve', function($params) {
    try { finQuery("UPDATE dados_dachser.t_fin_disputas SET resolved_at = NOW() WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/disputas/:id ─────────────────────────────────────────────
$router->delete('fin/disputas/:id', function($params) {
    try { finQuery("UPDATE dados_dachser.t_fin_disputas SET deleted_at = NOW() WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/regua ────────────────────────────────────────────────────────
$router->get('fin/regua', function($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.v_fin_regua_contas_receber LIMIT 5000") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/soft-delete ──────────────────────────────────────────────────
$router->get('fin/soft-delete', function($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_fin_soft_delete WHERE active = 0 ORDER BY deleted_at DESC LIMIT 200") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/soft-delete ─────────────────────────────────────────────────
$router->post('fin/soft-delete', function($params) {
    try {
        $b = getRequestBody();
        try { finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_soft_delete (id INT AUTO_INCREMENT PRIMARY KEY, documento VARCHAR(200) NOT NULL UNIQUE, active TINYINT(1) DEFAULT 0, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_by VARCHAR(100))"); } catch (Exception $e) {}
        finQuery("INSERT INTO dados_dachser.t_fin_soft_delete (documento, active, deleted_by) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE active = 0, deleted_at = NOW(), deleted_by = VALUES(deleted_by)", [$b['documento'] ?? null, $b['user_id'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/soft-delete/:documento ────────────────────────────────────
$router->delete('fin/soft-delete/:documento', function($params) {
    try { finQuery("UPDATE dados_dachser.t_fin_soft_delete SET active = 1 WHERE documento = ?", [urldecode($params['documento'])]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/email/enviar-cobranca ──────────────────────────────────────
$router->post('fin/email/enviar-cobranca', function($params) {
    // Requer Resend — retorna stub em ambiente PHP (sem Resend SDK nativo)
    sendJson(['success' => false, 'error' => 'Envio de email de cobrança requer configuração do Resend via webhook externo ou SMTP.'], 501);
});

// ── GET /api/fin/email-logs ───────────────────────────────────────────────────
$router->get('fin/email-logs', function($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj) sendJson(['success' => true, 'logs' => []]);
        $rows = finQuery("SELECT * FROM dados_dachser.t_fin_email_log WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? ORDER BY sent_at DESC LIMIT 100", [$cnpj]) ?: [];
        sendJson(['success' => true, 'logs' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/contatos ─────────────────────────────────────────────────────
$router->get('fin/contatos', function($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj) sendJson(['success' => true, 'data' => []]);
        $rows = finQuery("SELECT * FROM dados_dachser.t_dados_financeiro_contatos WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? AND ativo = 1 ORDER BY nome_contato ASC", [$cnpj]) ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/contatos ────────────────────────────────────────────────────
$router->post('fin/contatos', function($params) {
    try {
        $b = getRequestBody();
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_dados_financeiro_contatos (id, cnpj, nome_contato, email_contato, funcao, ativo) VALUES (?, ?, ?, ?, ?, 1)", [$id, $b['cnpj'] ?? null, $b['nome_contato'] ?? null, $b['email_contato'] ?? null, $b['funcao'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/contatos/:id ─────────────────────────────────────────────
$router->delete('fin/contatos/:id', function($params) {
    try { finQuery("UPDATE dados_dachser.t_dados_financeiro_contatos SET ativo = 0 WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── GET /api/fin/cliente-grupos ───────────────────────────────────────────────
$router->get('fin/cliente-grupos', function($params) {
    try { sendJson(['success' => true, 'data' => finQuery("SELECT * FROM dados_dachser.t_fin_cliente_grupo ORDER BY razao_social ASC") ?: []]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── POST /api/fin/cliente-grupos ──────────────────────────────────────────────
$router->post('fin/cliente-grupos', function($params) {
    try {
        $b = getRequestBody();
        finQuery("INSERT INTO dados_dachser.t_fin_cliente_grupo (razao_social, grupo) VALUES (?, ?) ON DUPLICATE KEY UPDATE grupo = VALUES(grupo)", [$b['razao_social'] ?? null, $b['grupo'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// ── DELETE /api/fin/cliente-grupos/:id ───────────────────────────────────────
$router->delete('fin/cliente-grupos/:id', function($params) {
    try { finQuery("DELETE FROM dados_dachser.t_fin_cliente_grupo WHERE id = ?", [$params['id']]); sendJson(['success' => true]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});
