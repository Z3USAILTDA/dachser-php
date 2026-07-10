<?php
// api/routes/fin.php
// Rotas FIN: /api/fin/*, /api/freetime/*, /api/notifications/voucher

global $router;

if (!function_exists('finQuery')) {
    function finQuery($sql, $params = [])
    {
        return queryWithRetry(getFinPDO(), $sql, $params);
    }
}

function formatDateForDB($d)
{
    if (!$d)
        return null;
    $s = trim((string) $d);
    if (!$s || in_array($s, ['null', 'undefined', 'Invalid Date']))
        return null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s))
        return "$s 00:00:00";
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/', $s))
        return $s;
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m))
        return "{$m[3]}-{$m[2]}-{$m[1]} 00:00:00";
    if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s))
        return substr($s, 0, 10) . ' 00:00:00';
    return null;
}

function genUUID()
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff)
    );
}

function mapFormaPagamento($v)
{
    if (!$v)
        return 'BOLETO';
    $u = strtoupper($v);
    if (str_contains($u, 'BOL'))
        return 'BOLETO';
    if (str_contains($u, 'PIX'))
        return 'TRANSFERENCIA_PIX';
    if (str_contains($u, 'TED') || str_contains($u, 'DOC') || str_contains($u, 'TRANSF'))
        return 'TRANSFERENCIA_PIX';
    if (str_contains($u, 'DEBITO'))
        return 'DEBITO_CONTA';
    if (str_contains($u, 'DARF'))
        return 'DARF';
    if (str_contains($u, 'GPS'))
        return 'GPS';
    return 'BOLETO';
}

// ── GET /api/fin/pagamentos ──────────────────────────────────────────────────
$router->get('fin/pagamentos', function ($params) {
    try {
        $pdo = getFinPDO();
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $perPage = isset($_GET['perPage']) ? $_GET['perPage'] : '50';
        $unlimited = (!$perPage || $perPage === 'all' || $perPage === '0');
        $perPageNum = $unlimited ? null : (int) $perPage;
        if ($perPageNum === 0)
            $perPageNum = 50;
        $offset = $unlimited ? 0 : ($page - 1) * $perPageNum;

        $conditions = [
            "v.etapa_atual IN ('FINANCEIRO', 'ROBO')",
            "NOT EXISTS (SELECT 1 FROM dados_dachser.t_dados_financeiro_voucher dfv2 WHERE SUBSTRING_INDEX(TRIM(dfv2.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci AND dfv2.modal = 'ADM')",
            "v.sync_status = 'ATIVO'",
            "(v.voucher_master_id IS NULL OR v.voucher_master_id = '')"
        ];
        $sqlParams = [];

        $filterVencimento = $_GET['filterVencimento'] ?? null;
        if ($filterVencimento === 'hoje') {
            $conditions[] = "v.vencimento = CURDATE()";
        } else if ($filterVencimento === 'vencidos') {
            $conditions[] = "v.vencimento < CURDATE()";
            $conditions[] = "(v.is_pronto_para_robo = 0 OR v.is_pronto_para_robo IS NULL)";
        } else if ($filterVencimento === 'proximos7') {
            $conditions[] = "v.vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)";
        } else if ($filterVencimento === 'a_vencer') {
            $conditions[] = "v.vencimento >= CURDATE()";
        }

        $filterStatusPagamento = $_GET['filterStatusPagamento'] ?? null;
        if ($filterStatusPagamento && $filterStatusPagamento !== 'all') {
            $conditions[] = "v.status_pagamento = ?";
            $sqlParams[] = $filterStatusPagamento;
        }

        $filterTipoExecucao = $_GET['filterTipoExecucao'] ?? null;
        if ($filterTipoExecucao && $filterTipoExecucao !== 'all') {
            if ($filterTipoExecucao === 'REMESSA') {
                $conditions[] = "v.tipo_execucao_pagamento IN ('REMESSA_10H', 'REMESSA_15H')";
            } else if ($filterTipoExecucao === 'A_DEFINIR') {
                $conditions[] = "(v.tipo_execucao_pagamento IS NULL OR v.tipo_execucao_pagamento = '' OR v.tipo_execucao_pagamento = 'A_DEFINIR')";
            } else {
                $conditions[] = "v.tipo_execucao_pagamento = ?";
                $sqlParams[] = $filterTipoExecucao;
            }
        }

        $termoBusca = trim(($_GET['filterBusca'] ?? '') ?: ($_GET['filterFornecedor'] ?? ''));
        if ($termoBusca) {
            if (preg_match('/^\d+$/', $termoBusca)) {
                $conditions[] = "v.numero_spo LIKE ?";
                $sqlParams[] = "$termoBusca%";
            } else {
                $conditions[] = "(v.numero_spo LIKE ? OR v.fornecedor LIKE ?)";
                $sqlParams[] = "$termoBusca%";
                $sqlParams[] = "%$termoBusca%";
            }
        }

        $filterCobranca = $_GET['filterCobranca'] ?? null;
        if ($filterCobranca) {
            $conditions[] = "v.cobranca_em_nome_de = ?";
            $sqlParams[] = $filterCobranca;
        }

        $filterFilial = $_GET['filterFilial'] ?? null;
        if ($filterFilial) {
            $conditions[] = "v.filial = ?";
            $sqlParams[] = $filterFilial;
        }

        $filterMoeda = $_GET['filterMoeda'] ?? null;
        if ($filterMoeda) {
            $conditions[] = "v.moeda = ?";
            $sqlParams[] = $filterMoeda;
        }

        $filterFormaPagamento = $_GET['filterFormaPagamento'] ?? null;
        if ($filterFormaPagamento && $filterFormaPagamento !== 'all') {
            $conditions[] = "v.forma_pagamento = ?";
            $sqlParams[] = $filterFormaPagamento;
        }

        $filterStatusIntegracaoRm = $_GET['filterStatusIntegracaoRm'] ?? null;
        if ($filterStatusIntegracaoRm && $filterStatusIntegracaoRm !== 'all') {
            $conditions[] = "v.status_integracao_rm = ?";
            $sqlParams[] = $filterStatusIntegracaoRm;
        }

        $filterDataVencimentoInicio = $_GET['filterDataVencimentoInicio'] ?? null;
        if ($filterDataVencimentoInicio) {
            $conditions[] = "v.vencimento >= ?";
            $sqlParams[] = $filterDataVencimentoInicio;
        }

        $filterDataVencimentoFim = $_GET['filterDataVencimentoFim'] ?? null;
        if ($filterDataVencimentoFim) {
            $conditions[] = "v.vencimento <= ?";
            $sqlParams[] = $filterDataVencimentoFim;
        }

        $whereClause = count($conditions) > 0 ? "WHERE " . implode(' AND ', $conditions) : "";
        $limitClause = $unlimited ? "" : "LIMIT " . (int) $perPageNum . " OFFSET " . (int) $offset;

        $listSql = "
          WITH page_v AS (
            SELECT v.* FROM dados_dachser.t_vouchers v $whereClause
            ORDER BY v.vencimento ASC, v.created_at DESC $limitClause
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
        ";

        $statsSql = "
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
          FROM dados_dachser.t_vouchers v $whereClause
        ";

        $countSql = "SELECT COUNT(*) as total FROM dados_dachser.t_vouchers v $whereClause";

        $countResult = queryWithRetry($pdo, $countSql, $sqlParams);
        $vouchers = queryWithRetry($pdo, $listSql, $sqlParams);
        $statsResult = queryWithRetry($pdo, $statsSql, $sqlParams);

        $total = isset($countResult[0]['total']) ? (int) $countResult[0]['total'] : 0;

        sendJson([
            'success' => true,
            'vouchers' => $vouchers ?: [],
            'total' => $total,
            'totalPages' => $unlimited ? 1 : ceil($total / $perPageNum),
            'currentPage' => $unlimited ? 1 : $page,
            'stats' => $statsResult ? $statsResult[0] : []
        ]);
    } catch (Exception $e) {
        error_log('[GET fin/pagamentos] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/baixas/historico ─────────────────────────────────────────────
$router->get('fin/baixas/historico', function ($params) {
    try {
        $pdo = getFinPDO();
        $periodo = $_GET['periodo'] ?? '30dias';
        $dateFilter = '';
        if ($periodo === 'hoje')
            $dateFilter = "AND DATE(b.DataDaBaixa) = CURDATE()";
        else if ($periodo === '7dias')
            $dateFilter = "AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        else if ($periodo === '30dias')
            $dateFilter = "AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        else if ($periodo === '90dias')
            $dateFilter = "AND b.DataDaBaixa >= DATE_SUB(NOW(), INTERVAL 90 DAY)";

        $baixasRaw = queryWithRetry($pdo, "
          SELECT b.IdLancamentoRM, b.IdBaixa, b.TipoPagRec as tipo_pag_rec,
                 b.ValorBaixado as valor_baixa, b.DataDaBaixa as data_baixa,
                 b.UsuarioBaixa as usuario_baixa, b.StatusLan as status_lan
          FROM dados_dachser.tbaixas b
          WHERE b.TipoPagRec = 1 AND b.StatusLan IN (0, 1, 2, 3) $dateFilter
          ORDER BY b.DataDaBaixa DESC LIMIT 1500
        ");

        if (!$baixasRaw) {
            sendJson(['success' => true, 'data' => [], 'count' => 0]);
            return;
        }

        $idRms = [];
        foreach ($baixasRaw as $b) {
            if (!empty($b['IdLancamentoRM']))
                $idRms[] = $b['IdLancamentoRM'];
        }
        $idRms = array_values(array_unique($idRms));

        $dfvMap = [];
        $nfsIdSet = [];
        if (count($idRms) > 0) {
            $placeholders = implode(',', array_fill(0, count($idRms), '?'));
            $dfvRows = queryWithRetry($pdo, "SELECT id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_processo, forma_pag, data_vencimento, valor_nf, moeda, modal FROM dados_dachser.t_dados_financeiro_voucher WHERE id_rm IN ($placeholders)", $idRms);
            $nfsRows = queryWithRetry($pdo, "SELECT DISTINCT id_rm FROM dados_dachser.t_dados_financeiro_nfs WHERE id_rm IN ($placeholders)", $idRms);

            foreach (($dfvRows ?: []) as $row)
                $dfvMap[(string) $row['id_rm']] = $row;
            foreach (($nfsRows ?: []) as $row)
                $nfsIdSet[(string) $row['id_rm']] = true;
        }

        $baixas = [];
        foreach ($baixasRaw as $b) {
            $rm = (string) $b['IdLancamentoRM'];
            if (isset($nfsIdSet[$rm]))
                continue; // Filter out NFs
            $dfv = $dfvMap[$rm] ?? [];
            if (($dfv['modal'] ?? '') === 'ADM')
                continue; // Filter out ADM

            $b['nd'] = $dfv['nd'] ?? null;
            $b['documento'] = $dfv['documento'] ?? null;
            $b['nome_beneficiario'] = $dfv['nome_beneficiario'] ?? null;
            $b['nome_cobranca'] = $dfv['nome_cobranca'] ?? null;
            $b['numero_processo'] = $dfv['numero_processo'] ?? null;
            $b['forma_pag'] = $dfv['forma_pag'] ?? null;
            $b['data_vencimento'] = $dfv['data_vencimento'] ?? null;
            $b['valor_nf'] = $dfv['valor_nf'] ?? null;
            $b['moeda'] = $dfv['moeda'] ?? null;
            $baixas[] = $b;
        }

        sendJson(['success' => true, 'data' => $baixas, 'count' => count($baixas)]);
    } catch (Exception $e) {
        error_log('[GET fin/baixas/historico] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/fornecedor/dados-bancarios ──────────────────────────────────
$router->get('fin/fornecedor/dados-bancarios', function ($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj)
            sendJson(['success' => false, 'error' => 'cnpj é obrigatório'], 400);

        $rows = finQuery("
          SELECT banco, agencia, digito_agencia, conta_corrente, digito_conta, razao_social, cnpj
          FROM dados_dachser.t_dados_financeiro_pag
          WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? LIMIT 1
        ", [$cnpj]);

        if ($rows && count($rows) > 0) {
            sendJson(['success' => true, 'data' => $rows[0]]);
        } else {
            sendJson(['success' => false, 'error' => 'Dados bancários não encontrados']);
        }
    } catch (Exception $e) {
        error_log('[GET fin/fornecedor/dados-bancarios] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/users/:id/esteira-role ──────────────────────────────────────
$router->get('fin/users/:id/esteira-role', function ($params) {
    try {
        $userId = $params['id'] ?? null;
        if (!$userId)
            sendJson(['success' => false, 'error' => 'Missing user ID'], 400);

        $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
        $userRows = finQuery("SELECT is_admin, esteira_role FROM $authUsersTable WHERE id = ?", [$userId]);

        $role = 'user';
        if (!empty($userRows)) {
            $u = $userRows[0];
            if (!empty($u['esteira_role'])) {
                $role = $u['esteira_role'];
            } elseif (!empty($u['is_admin'])) {
                $role = 'admin';
            }
        }

        sendJson([
            'success' => true,
            'data' => [
                'user_id' => $userId,
                'role' => $role,
                'can_approve' => true,
                'can_pay' => true,
                'can_upload' => true,
                'can_view_all' => true
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/filhos-batch ───────────────────────────────────────
$router->post('fin/vouchers/filhos-batch', function ($params) {
    try {
        $body = getRequestBody();
        $masterIds = $body['master_ids'] ?? [];
        if (!is_array($masterIds) || empty($masterIds)) {
            sendJson(['success' => true, 'data' => []]);
            return;
        }

        $pdo = getFinPDO();
        $placeholders = implode(',', array_fill(0, count($masterIds), '?'));
        $rows = queryWithRetry($pdo, "SELECT voucher_master_id, numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id IN ($placeholders)", $masterIds);

        $data = [];
        foreach (($rows ?: []) as $row) {
            $masterId = $row['voucher_master_id'];
            if (!isset($data[$masterId])) {
                $data[$masterId] = [];
            }
            $data[$masterId][] = ['numero_spo' => $row['numero_spo']];
        }

        sendJson([
            'success' => true,
            'data' => $data
        ]);
    } catch (Exception $e) {
        error_log('[POST fin/vouchers/filhos-batch] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/debug-env ───────────────────────────────────────────────────
$router->get('fin/debug-env', function ($params) {
    try {
        $paths = [
            dirname(__FILE__, 4) . '/.env',
            dirname(__FILE__, 4) . '/app.env',
            dirname(__FILE__, 3) . '/.env',
            dirname(__FILE__, 3) . '/app.env'
        ];
        $envPath = null;
        foreach ($paths as $path) {
            if (file_exists($path)) {
                $envPath = $path;
                break;
            }
        }
        $envExists = ($envPath !== null);
        $rootFiles = [];
        if (is_dir(dirname(__FILE__, 3))) {
            $rootFiles = scandir(dirname(__FILE__, 3));
        }
        $parentFiles = [];
        if (is_dir(dirname(__FILE__, 4))) {
            $parentFiles = scandir(dirname(__FILE__, 4));
        }
        $vars = [];
        if ($envExists) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0)
                    continue;
                if (strpos($line, '=') === false)
                    continue;
                list($name, $value) = explode('=', $line, 2);
                $name = trim($name);
                $value = trim($value);
                if (stripos($name, 'password') !== false || stripos($name, 'pwd') !== false || stripos($name, 'key') !== false || stripos($name, 'secret') !== false) {
                    $value = '********';
                }
                $vars[$name] = $value;
            }
        }
        sendJson([
            'success' => true,
            'env_exists' => $envExists,
            'env_path' => $envPath,
            'root_files' => $rootFiles,
            'parent_files' => $parentFiles,
            'variables' => $vars,
            'loaded_env_auth_host' => $_ENV['MARIADB_AUTH_HOST'] ?? 'NOT LOADED IN $_ENV',
            'loaded_server_auth_host' => $_SERVER['MARIADB_AUTH_HOST'] ?? 'NOT LOADED IN $_SERVER'
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/stats ────────────────────────────────────────────────────────
$router->get('fin/stats', function ($params) {
    try {
        $lastRows = finQuery("SELECT MAX(data_insert) as last_update FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'");
        $statsRows = finQuery("SELECT COUNT(*) as total_records, COALESCE(SUM(valor_nf), 0) as total_valor FROM dados_dachser.t_dados_financeiro_voucher WHERE modal IS NULL OR modal <> 'ADM'");
        $etapaRows = finQuery("SELECT COALESCE(etapa_atual, 'OPERACAO') as etapa, COUNT(*) as count FROM dados_dachser.t_vouchers GROUP BY etapa_atual ORDER BY count DESC");
        $etapaLabels = ['RASCUNHO' => 'Rascunho', 'OPERACAO' => 'Operação', 'FISCAL' => 'Fiscal', 'SUPERVISOR' => 'Supervisor', 'FINANCEIRO' => 'Financeiro', 'ROBO' => 'Robô', 'CONCLUIDO' => 'Concluído', 'CANCELADO' => 'Cancelado', 'A_PROCESSAR' => 'A Processar'];
        sendJson(['success' => true, 'stats' => ['lastUpdate' => $lastRows[0]['last_update'] ?? null, 'totalVouchers' => (int) ($statsRows[0]['total_records'] ?? 0), 'totalValor' => (float) ($statsRows[0]['total_valor'] ?? 0), 'etapaBreakdown' => array_map(fn($r) => ['etapa' => $r['etapa'], 'label' => $etapaLabels[$r['etapa']] ?? $r['etapa'], 'count' => (int) $r['count']], $etapaRows ?: [])]]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/users ───────────────────────────────────────────────────────
$router->get('fin/users', function ($params) {
    try {
        sendJson(['success' => true, 'users' => finQuery("SELECT id, username, email, is_admin, COALESCE(esteira_role, NULL) as esteira_role, COALESCE(esteira_active, 1) as esteira_active, supervisor_id FROM dados_dachser.t_users_dachser ORDER BY username ASC") ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/users/esteira ───────────────────────────────────────────────
$router->get('fin/users/esteira', function ($params) {
    try {
        sendJson(['success' => true, 'users' => finQuery("SELECT id, username, email, is_admin, COALESCE(esteira_role, NULL) as esteira_role, COALESCE(esteira_active, 1) as esteira_active, supervisor_id FROM dados_dachser.t_users_dachser ORDER BY username ASC") ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/search-masters ─────────────────────────────────────
$router->get('fin/vouchers/search-masters', function ($params) {
    try {
        $spo = trim($_GET['spo_prefix'] ?? '');
        if (strlen($spo) < 2)
            sendJson(['success' => true, 'data' => []]);
        sendJson(['success' => true, 'data' => finQuery("SELECT DISTINCT voucher_master_id, numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id IS NOT NULL AND SUBSTRING_INDEX(TRIM(numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci LIMIT 50", [$spo]) ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/search ─────────────────────────────────────────────
$router->get('fin/vouchers/search', function ($params) {
    try {
        $term = trim($_GET['search'] ?? '');
        if (strlen($term) < 2)
            sendJson(['success' => true, 'data' => [], 'count' => 0]);
        $exactNd = preg_match('/^[A-Z0-9._\-\/]{4,}$/i', $term) ? explode(' ', $term)[0] : null;
        $vouchers = [];
        if ($exactNd) {
            $vouchers = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf FROM dados_dachser.t_dados_financeiro_voucher WHERE SUBSTRING_INDEX(TRIM(nd), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE v.sync_status = 'ATIVO' AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '') AND v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER') AND (SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci OR dfv.nd IS NOT NULL) ORDER BY v.updated_at DESC LIMIT 100", [$exactNd, $exactNd]) ?: [];
        }
        sendJson(['success' => true, 'data' => $vouchers, 'count' => count($vouchers)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/pendentes-rm ───────────────────────────────────────
$router->get('fin/vouchers/pendentes-rm', function ($params) {
    try {
        try {
            $pendentes = finQuery("WITH spo AS (SELECT 'SPO' AS source, dfs.id_rm, dfs.nd, dfs.documento, dfs.nome_beneficiario, dfs.nome_cobranca, dfs.numero_nf, dfs.numero_processo, dfs.modal, dfs.tipo_pag, dfs.forma_pag, dfs.data_emissao, dfs.data_vencimento, dfs.valor_nf, dfs.moeda, dfs.cnpj, dfs.razao_social, dfs.created_by, dfs.detalhes FROM dados_dachser.t_dados_financeiro_spo dfs WHERE (dfs.nome_beneficiario IS NULL OR LOWER(dfs.nome_beneficiario) NOT LIKE '%dachser%') AND (dfs.modal IS NULL OR dfs.modal <> 'ADM')), voucher AS (SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes FROM dados_dachser.t_dados_financeiro_voucher dfv WHERE (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM')), unified AS (SELECT * FROM spo UNION ALL SELECT v.* FROM voucher v WHERE NOT EXISTS (SELECT 1 FROM spo s WHERE s.numero_processo IS NOT NULL AND s.numero_processo COLLATE utf8mb4_unicode_ci = v.numero_processo COLLATE utf8mb4_unicode_ci)) SELECT u.* FROM unified u LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(u.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON u.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL ORDER BY u.data_vencimento ASC");
        } catch (Exception $e) {
            $pendentes = finQuery("SELECT 'VOUCHER' AS source, dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by, NULL AS detalhes FROM dados_dachser.t_dados_financeiro_voucher dfv LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM') ORDER BY dfv.data_vencimento ASC");
        }
        $normalized = array_map(function ($row) {
            $processos = [];
            if ($row['source'] === 'SPO' && !empty($row['detalhes'])) {
                $seen = [];
                $parts = explode(';', $row['detalhes']);
                foreach ($parts as $p) {
                    $p = trim($p);
                    if ($p && !in_array($p, $seen)) {
                        $processos[] = $p;
                        $seen[] = $p;
                    }
                }
            }
            return array_merge($row, ['processos_associados' => $processos]);
        }, $pendentes ?: []);
        sendJson(['success' => true, 'data' => $normalized]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/combined ───────────────────────────────────────────
$router->get('fin/vouchers/combined', function ($params) {
    try {
        $dataVencInicio = $_GET['data_vencimento_inicio'] ?? $_GET['data_emissao_inicio'] ?? null;
        $dataVencFim = $_GET['data_vencimento_fim'] ?? $_GET['data_emissao_fim'] ?? null;
        $hasMonthFilter = !empty($dataVencInicio) && !empty($dataVencFim);

        try {
            finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS ref_fornecedor VARCHAR(255) DEFAULT NULL");
        } catch (Exception $e) {
        }
        try {
            finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS mawb_mbl VARCHAR(255) DEFAULT NULL");
        } catch (Exception $e) {
        }

        $ativosMonthClause = $hasMonthFilter ? "AND (v.etapa_atual IN ('RASCUNHO','OPERACAO','FINANCEIRO') OR (v.vencimento >= ? AND v.vencimento < ?) OR (v.vencimento IS NULL AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?))" : '';
        $ativosParams = $hasMonthFilter ? [$dataVencInicio, $dataVencFim, $dataVencInicio, $dataVencFim] : [];

        $combinedAtivos = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MAX(data_emissao) as data_emissao, MAX(data_vencimento) as data_vencimento, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE sync_status = 'ATIVO' AND (voucher_master_id IS NULL OR voucher_master_id = '') AND etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER') AND (etapa_atual NOT IN ('CONCLUIDO','CANCELADO') OR (etapa_atual IN ('CONCLUIDO','CANCELADO') AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR))) $ativosMonthClause ORDER BY v.created_at DESC", $ativosParams) ?: [];

        $pendentesMonthClause = $hasMonthFilter ? 'AND dfv.data_vencimento >= ? AND dfv.data_vencimento < ?' : '';
        $pendentesParams = $hasMonthFilter ? [$dataVencInicio, $dataVencFim] : [];

        $combinedPendentes = finQuery("SELECT dfv.id_rm, dfv.nd, dfv.documento, dfv.nome_beneficiario, dfv.nome_cobranca, dfv.numero_nf, dfv.numero_processo, dfv.modal, dfv.tipo_pag, dfv.forma_pag, dfv.data_emissao, dfv.data_vencimento, dfv.valor_nf, dfv.moeda, dfv.cnpj, dfv.razao_social, dfv.created_by FROM dados_dachser.t_dados_financeiro_voucher dfv LEFT JOIN dados_dachser.t_vouchers v ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci LEFT JOIN dados_dachser.tbaixas b ON dfv.id_rm = b.IdLancamentoRM WHERE v.id IS NULL AND b.IdLancamentoRM IS NULL AND (dfv.nome_beneficiario IS NULL OR LOWER(dfv.nome_beneficiario) NOT LIKE '%dachser%') AND (dfv.modal IS NULL OR dfv.modal <> 'ADM') $pendentesMonthClause ORDER BY dfv.data_vencimento ASC", $pendentesParams) ?: [];

        sendJson(['success' => true, 'ativos' => $combinedAtivos, 'pendentes_rm' => $combinedPendentes, 'count_ativos' => count($combinedAtivos), 'count_pendentes' => count($combinedPendentes)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/esteira ────────────────────────────────────────────
$router->get('fin/vouchers/esteira', function ($params) {
    try {
        $search = $_GET['search'] ?? null;
        $etapa = $_GET['etapa'] ?? null;
        $where = ["(v.voucher_master_id IS NULL OR v.voucher_master_id = '')", "v.etapa_atual NOT IN ('AGUARDANDO_DOCUMENTOS_LOTE','CONSOLIDADO_NO_MASTER')", "(dfv.modal IS NULL OR dfv.modal <> 'ADM')", "(v.etapa_atual != 'CONCLUIDO' OR (v.etapa_atual = 'CONCLUIDO' AND v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))", "NOT EXISTS (SELECT 1 FROM dados_dachser.tbaixas b WHERE b.IdLancamentoRM = dfv.id_rm AND b.StatusLan IN (1, 2, 3))"];
        $qp = [];
        if ($search) {
            $where[] = '(v.numero_spo LIKE ? OR v.fornecedor LIKE ? OR v.cnpj_fornecedor LIKE ?)';
            $qp[] = "%$search%";
            $qp[] = "%$search%";
            $qp[] = "%$search%";
        }
        if ($etapa) {
            $where[] = 'v.etapa_atual = ?';
            $qp[] = $etapa;
        }
        $whereStr = implode(' AND ', $where);
        $vouchers = finQuery("SELECT v.*, dfv.id_rm as dfv_id_rm, dfv.numero_processo as dfv_numero_processo, dfv.razao_social as dfv_razao_social, dfv.nome_beneficiario as dfv_nome_beneficiario, dfv.valor_nf as dfv_valor_nf, (SELECT username FROM dados_dachser.t_users_dachser WHERE id = v.criado_por_user_id LIMIT 1) AS criado_por_user_name FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) as id_rm, MAX(created_by) as created_by, MIN(numero_processo) as numero_processo, MAX(razao_social) as razao_social, MAX(nome_beneficiario) as nome_beneficiario, MAX(valor_nf) as valor_nf, MAX(modal) as modal FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE $whereStr GROUP BY v.id ORDER BY v.created_at DESC", $qp) ?: [];
        sendJson(['success' => true, 'data' => $vouchers]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/find-multi ────────────────────────────────────────
$router->post('fin/vouchers/find-multi', function ($params) {
    try {
        $body = getRequestBody();
        $spoPrimary = $body['spoPrimary'] ?? null;
        $ndPrimary = $body['ndPrimary'] ?? null;
        $spoCandidates = $body['spoCandidates'] ?? [];
        $ndCandidates = $body['ndCandidates'] ?? [];
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";

        $lookupBySPO = function ($spo) use ($cols) {
            if (!$spo)
                return null;
            $rows = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$spo]);
            if (!empty($rows))
                return ['voucher' => $rows[0], 'matchedCandidate' => "SPO:$spo"];
            $child = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 1", [$spo]);
            if (!empty($child))
                return ['voucher' => $child[0], 'matchedCandidate' => "SPO:$spo"];
            return null;
        };
        $lookupByND = function ($nd) use ($cols) {
            if (!$nd)
                return null;
            foreach (["id_rm = ?", "processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci", "SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci"] as $w) {
                $rows = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE $w ORDER BY created_at DESC LIMIT 5", [$nd]);
                if (!empty($rows))
                    return ['voucher' => $rows[0], 'matchedCandidate' => "ND:$nd"];
            }
            return null;
        };

        $candidates = [fn() => $lookupBySPO($spoPrimary), fn() => $lookupByND($ndPrimary)];
        foreach ($spoCandidates as $s)
            $candidates[] = fn() => $lookupBySPO($s);
        foreach ($ndCandidates as $n)
            $candidates[] = fn() => $lookupByND($n);

        foreach ($candidates as $fn) {
            $result = $fn();
            if ($result)
                sendJson(array_merge(['success' => true], $result));
        }
        sendJson(['success' => true, 'voucher' => null, 'matchedCandidate' => null]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/find-by-spo ────────────────────────────────────────
$router->get('fin/vouchers/find-by-spo', function ($params) {
    try {
        $spo = trim($_GET['spo'] ?? '');
        if (!$spo)
            sendJson(['success' => false, 'error' => 'spo é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";
        $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 10", [$spo]) ?: [];
        if (empty($vouchers))
            $vouchers = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE SUBSTRING_INDEX(TRIM(c.numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$spo]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/find-by-nd ─────────────────────────────────────────
$router->get('fin/vouchers/find-by-nd', function ($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd)
            sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id, is_master, nome_master";
        $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers))
            $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers))
            $vouchers = finQuery("SELECT $cols, NULL as child_spo, 0 as matched_via_child FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$nd]) ?: [];
        $masters = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.id_rm, m.processo_id, m.is_master, m.nome_master, c.numero_spo as child_spo, 1 as matched_via_child FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$nd, $nd]) ?: [];
        sendJson(['success' => true, 'vouchers' => array_merge($vouchers, $masters)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/by-nd ───────────────────────────────────────────────
$router->get('fin/vouchers/by-nd', function ($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd)
            sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $cols = "id, numero_spo, fornecedor, valor, vencimento, etapa_atual, cobranca_em_nome_de, moeda, id_rm, processo_id";
        $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE id_rm = ? ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers))
            $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE processo_id COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY created_at DESC LIMIT 5", [$nd]) ?: [];
        if (empty($vouchers))
            $vouchers = finQuery("SELECT $cols FROM dados_dachser.t_vouchers WHERE SUBSTRING_INDEX(TRIM(numero_spo),' ',1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(?),' ',1) COLLATE utf8mb4_unicode_ci ORDER BY CHAR_LENGTH(numero_spo) ASC, created_at DESC LIMIT 5", [$nd]) ?: [];
        $masters = finQuery("SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual, m.cobranca_em_nome_de, m.moeda, m.is_master, m.nome_master, m.id_rm, m.processo_id, c.id as child_voucher_id, c.numero_spo as child_spo FROM dados_dachser.t_vouchers c JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id WHERE (c.id_rm = ? OR c.processo_id = ?) AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != '' LIMIT 5", [$nd, $nd]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers, 'masterVouchers' => $masters]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/log ────────────────────────────────────────────────
$router->post('fin/vouchers/log', function ($params) {
    try {
        $b = getRequestBody();
        if (empty($b['voucher_id']) || empty($b['acao']))
            sendJson(['success' => false, 'error' => 'voucher_id e acao são obrigatórios'], 400);
        finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, ?, ?, NOW())", [$b['voucher_id'], $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', $b['acao'], $b['detalhe'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/report ─────────────────────────────────────────────
$router->get('fin/vouchers/report', function ($params) {
    try {
        $where = [];
        $qp = [];
        $etapa = $_GET['etapa'] ?? null;
        $statusBaixa = $_GET['statusBaixa'] ?? null;
        $cobranca = $_GET['cobrancaEmNomeDe'] ?? null;
        $dataInicio = $_GET['dataInicio'] ?? null;
        $dataFim = $_GET['dataFim'] ?? null;
        if ($etapa && $etapa !== 'all') {
            if ($etapa === 'OPERACAO') {
                $where[] = "v.etapa_atual IN ('OPERACAO','A_PROCESSAR','AJUSTE_OPERACAO')";
            } elseif ($etapa === 'FISCAL') {
                $where[] = "v.etapa_atual IN ('FISCAL','AJUSTE_FISCAL')";
            } else {
                $where[] = 'v.etapa_atual = ?';
                $qp[] = $etapa;
            }
        }
        if ($statusBaixa && $statusBaixa !== 'all') {
            $where[] = 'v.status_baixa = ?';
            $qp[] = $statusBaixa;
        }
        if ($cobranca && $cobranca !== 'all') {
            $where[] = 'v.cobranca_em_nome_de = ?';
            $qp[] = $cobranca;
        }
        if ($dataInicio) {
            $where[] = 'v.created_at >= ?';
            $qp[] = $dataInicio;
        }
        if ($dataFim) {
            $where[] = 'v.created_at <= ?';
            $qp[] = "$dataFim 23:59:59";
        }
        $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
        $vouchers = finQuery("SELECT v.*, u_criado.username AS criado_por_username FROM dados_dachser.t_vouchers v LEFT JOIN dados_dachser.t_users_dachser u_criado ON v.criado_por_user_id = u_criado.id LEFT JOIN (SELECT nd, MAX(created_by) AS created_by FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci $whereClause ORDER BY v.created_at DESC LIMIT 5000", $qp) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/master/search ──────────────────────────────────────
$router->get('fin/vouchers/master/search', function ($params) {
    try {
        $search = $_GET['search'] ?? '';
        if (strlen($search) < 6)
            sendJson(['success' => true, 'data' => []]);
        $rows = finQuery("SELECT * FROM (SELECT v.numero_spo AS processo, v.fornecedor, v.cnpj_fornecedor, v.valor, v.moeda, v.vencimento FROM dados_dachser.t_vouchers v WHERE v.is_master = 0 AND v.voucher_master_id IS NULL AND v.etapa_atual NOT IN ('CONCLUIDO','CANCELADO') UNION ALL SELECT a.nd AS processo, a.razao_social AS fornecedor, a.cnpj AS cnpj_fornecedor, a.valor_nf AS valor, a.moeda, a.data_vencimento AS vencimento FROM dados_dachser.t_dados_financeiro_voucher a) x WHERE x.processo LIKE ?", ["%$search"]) ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/:id/filhos ─────────────────────────────────────────
$router->get('fin/vouchers/:id/filhos', function ($params) {
    try {
        $filhos = finQuery("SELECT id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, etapa_atual, status_envio_cliente, cobranca_em_nome_de, forma_pagamento, tipo_documento FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY created_at ASC", [$params['id']]) ?: [];
        sendJson(['success' => true, 'data' => $filhos]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/:id/anexos ─────────────────────────────────────────
$router->get('fin/vouchers/:id/anexos', function ($params) {
    try {
        sendJson(['success' => true, 'data' => finQuery("SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC", [$params['id']]) ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/comprovantes ────────────────────────────────────────
$router->get('fin/vouchers/comprovantes', function ($params) {
    try {
        $rows = finQuery(
            "SELECT
                a.id,
                a.voucher_id,
                v.numero_spo,
                a.file_name,
                a.file_url,
                a.file_size,
                a.created_at,
                a.tipo            AS tipo_anexo,
                v.forma_pagamento,
                v.valor,
                v.fornecedor,
                v.tipo_documento
             FROM dados_dachser.t_voucher_anexos a
             INNER JOIN dados_dachser.t_vouchers v ON v.id = a.voucher_id
             WHERE a.tipo = 'COMPROVANTE'
             ORDER BY a.created_at DESC
             LIMIT 2000"
        ) ?: [];

        error_log('[fin/vouchers/comprovantes] Total rows: ' . count($rows));
        sendJson(['success' => true, 'comprovantes' => $rows, 'total' => count($rows)]);
    } catch (Exception $e) {
        error_log('[fin/vouchers/comprovantes] ERROR: ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/fornecedor/dados-bancarios ──────────────────────────────────
$router->get('fin/fornecedor/dados-bancarios', function ($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj)
            sendJson(['success' => false, 'error' => 'cnpj é obrigatório'], 400);

        $rows = finQuery("
            SELECT banco, agencia, digito_agencia, conta_corrente, digito_conta, razao_social, cnpj
            FROM dados_dachser.t_dados_financeiro_pag
            WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? LIMIT 1
        ", [$cnpj]) ?: [];

        if (count($rows) > 0) {
            sendJson(['success' => true, 'data' => $rows[0]]);
        } else {
            sendJson(['success' => false, 'error' => 'Dados bancários não encontrados']);
        }
    } catch (Exception $e) {
        error_log('[GET fin/fornecedor/dados-bancarios] ERROR: ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/datas-antigas ───────────────────────────────────────
$router->get('fin/vouchers/datas-antigas', function ($params) {
    try {
        $rows = finQuery("
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
        ") ?: [];
        sendJson(['success' => true, 'total' => count($rows), 'rows' => $rows]);
    } catch (Exception $e) {
        error_log('[GET fin/vouchers/datas-antigas] ERROR: ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/:id ─────────────────────────────────────────────────
$router->get('fin/vouchers/:id', function ($params) {
    try {
        $id = $params['id'];
        $vouchers = finQuery("SELECT v.*, COALESCE(v.data_emissao_documento, dfv.data_emissao) AS data_emissao_documento, dfv.id_rm AS dfv_id_rm, dfv.numero_processo AS dfv_numero_processo, dfv.razao_social AS dfv_razao_social, dfv.nome_beneficiario AS dfv_nome_beneficiario, dfv.valor_nf AS dfv_valor_nf FROM dados_dachser.t_vouchers v LEFT JOIN (SELECT nd, MIN(id_rm) AS id_rm, MAX(data_emissao) AS data_emissao, MIN(numero_processo) AS numero_processo, MAX(razao_social) AS razao_social, MAX(nome_beneficiario) AS nome_beneficiario, MAX(valor_nf) AS valor_nf FROM dados_dachser.t_dados_financeiro_voucher GROUP BY nd) dfv ON SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_general_ci = SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_general_ci WHERE v.id = ?", [$id]) ?: [];
        $voucher = $vouchers[0] ?? null;
        if (!$voucher)
            sendJson(['success' => true, 'data' => null, 'anexos' => [], 'logs' => []]);
        $anexos = finQuery("SELECT id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ORDER BY created_at DESC", [$id]) ?: [];
        $logs = finQuery("SELECT id, voucher_id, user_id, user_name, acao, detalhe, data_hora FROM dados_dachser.t_voucher_logs WHERE voucher_id = ? ORDER BY data_hora DESC", [$id]) ?: [];
        sendJson(['success' => true, 'data' => $voucher, 'anexos' => $anexos, 'logs' => $logs]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers ────────────────────────────────────────────────────
$router->post('fin/vouchers', function ($params) {
    try {
        $d = getRequestBody();
        $numeroSpo = trim((string) ($d['numero_spo'] ?? ''));
        if (!$numeroSpo)
            sendJson(['error' => 'numero_spo é obrigatório'], 400);
        if (str_starts_with($numeroSpo, 'MANUAL-'))
            sendJson(['error' => 'Número de voucher/SPO inválido. Use um número real do RM.'], 400);
        $nil = fn($v) => ($v === '' || $v === null) ? null : $v;
        $toDate = function ($v) {
            if (!$v)
                return date('Y-m-d 00:00:00');
            $s = trim((string) $v);
            if (!$s || in_array($s, ['null', 'undefined']))
                return date('Y-m-d 00:00:00');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s))
                return "$s 00:00:00";
            if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s))
                return substr($s, 0, 10) . ' 00:00:00';
            return date('Y-m-d 00:00:00');
        };

        $existing = finQuery("SELECT id, numero_spo, etapa_atual FROM dados_dachser.t_vouchers WHERE numero_spo = ?", [$numeroSpo]) ?: [];
        if (!empty($existing)) {
            $advanced = array_filter($existing, fn($v) => $v['etapa_atual'] !== 'A_PROCESSAR');
            if (!empty($advanced)) {
                $adv = array_values($advanced)[0];
                sendJson(['error' => "Voucher com número $numeroSpo já existe na etapa {$adv['etapa_atual']}", 'existingId' => $adv['id'], 'existingEtapa' => $adv['etapa_atual'], 'duplicate' => true]);
            }
            foreach ($existing as $ex) {
                finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$ex['id']]);
                finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$ex['id']]);
                finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$ex['id']]);
            }
        }
        $voucherId = $d['id'] ?? genUUID();
        finQuery(
            "INSERT INTO dados_dachser.t_vouchers (id, id_rm, numero_spo, vencimento, cobranca_em_nome_de, forma_pagamento, remessa, urgente, urgencia_tipo, etapa_atual, status_baixa, status_envio_cliente, status_financeiro, tipo_documento, valor, moeda, fornecedor, cnpj_fornecedor, cliente_email, filial, data_emissao_documento, comentarios_operacao, comentarios_fiscal, comentarios_financeiro, ajuste_operacao, ajuste_fiscal, criado_por_user_id, processo_id, origem_processo, chave_pix, status_documento_fiscal, tipo_execucao_pagamento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$voucherId, $nil($d['id_rm'] ?? null), $nil($d['numero_spo'] ?? null), $toDate($d['vencimento'] ?? null), $nil($d['cobranca_em_nome_de'] ?? null) ?? 'DACHSER', $nil($d['forma_pagamento'] ?? null) ?? 'BOLETO', $nil($d['remessa'] ?? null) ?? 'NENHUM', !empty($d['urgente']) ? 1 : 0, $nil($d['urgencia_tipo'] ?? null) ?? 'NORMAL', $nil($d['etapa_atual'] ?? null) ?? 'OPERACAO', $nil($d['status_baixa'] ?? null) ?? 'PENDENTE', $nil($d['status_envio_cliente'] ?? null) ?? 'NAO_APLICA', $nil($d['status_financeiro'] ?? null) ?? 'PENDENTE', $nil($d['tipo_documento'] ?? null), $nil($d['valor'] ?? null), $nil($d['moeda'] ?? null) ?? 'BRL', $nil($d['fornecedor'] ?? null), isset($d['cnpj_fornecedor']) ? preg_replace('/\D/', '', $d['cnpj_fornecedor']) : null, $nil($d['cliente_email'] ?? null), $nil($d['filial'] ?? null), $toDate($d['data_emissao_documento'] ?? null), $nil($d['comentarios_operacao'] ?? null), $nil($d['comentarios_fiscal'] ?? null), $nil($d['comentarios_financeiro'] ?? null), $nil($d['ajuste_operacao'] ?? null), $nil($d['ajuste_fiscal'] ?? null), $nil($d['criado_por_user_id'] ?? null), $nil($d['processo_id'] ?? null), $nil($d['origem_processo'] ?? null), $nil($d['chave_pix'] ?? null), $nil($d['status_documento_fiscal'] ?? null) ?? 'ANEXADO', 'A_DEFINIR']
        );
        sendJson(['success' => true, 'mariadbId' => $voucherId]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/master ─────────────────────────────────────────────
$router->post('fin/vouchers/master', function ($params) {
    try {
        $b = getRequestBody();
        $voucher_ids = $b['voucher_ids'] ?? [];
        if (!is_array($voucher_ids) || count($voucher_ids) < 2)
            sendJson(['success' => false, 'error' => 'Mínimo 2 voucher_ids são obrigatórios'], 400);
        $masterId = genUUID();
        $seqRows = finQuery("SELECT IFNULL(MAX(CAST(REPLACE(numero_spo,'MASTER-','') AS UNSIGNED)),0)+1 AS next_num FROM dados_dachser.t_vouchers WHERE numero_spo LIKE 'MASTER-%'");
        $nextNum = (int) ($seqRows[0]['next_num'] ?? 1);
        $numeroSpoMaster = $b['nome_master'] ?? 'MASTER-' . str_pad($nextNum, 5, '0', STR_PAD_LEFT);
        finQuery("INSERT INTO dados_dachser.t_vouchers (id, numero_spo, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, filial, comentarios_operacao, etapa_atual, is_master, origem_criacao, criado_por_user_id, criado_por_user_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPERACAO', 1, 'MASTER', ?, ?, NOW(), NOW())", [$masterId, $numeroSpoMaster, $b['fornecedor'] ?? null, $b['cnpj_fornecedor'] ?? null, $b['valor_total'] ?? null, $b['moeda'] ?? 'BRL', $b['vencimento'] ?? null, $b['forma_pagamento'] ?? null, $b['tipo_documento'] ?? null, $b['cobranca_em_nome_de'] ?? 'DACHSER', $b['filial'] ?? null, $b['comentarios_operacao'] ?? null, $b['criado_por_user_id'] ?? null, $b['criado_por_user_name'] ?? 'Sistema']);
        $ph = implode(',', array_fill(0, count($voucher_ids), '?'));
        finQuery("UPDATE dados_dachser.t_vouchers SET voucher_master_id = ? WHERE numero_spo IN ($ph)", array_merge([$masterId], $voucher_ids));
        try {
            finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'MASTER_CRIADO', ?, NOW())", [$masterId, $b['criado_por_user_id'] ?? null, $b['criado_por_user_name'] ?? 'Sistema', "Voucher Master $numeroSpoMaster criado consolidando " . count($voucher_ids) . " processos"]);
        } catch (Exception $e) {
        }
        sendJson(['success' => true, 'masterId' => $masterId, 'numeroSpo' => $numeroSpoMaster, 'childCount' => count($voucher_ids)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/vouchers/:id/esteira ──────────────────────────────────────
$router->patch('fin/vouchers/:id/esteira', function ($params) {
    try {
        $id = $params['id'];
        $b = getRequestBody();
        $updates = $b['updates'] ?? [];
        if (empty($updates))
            sendJson(['success' => false, 'error' => 'updates é obrigatório'], 400);
        $allowed = ['etapa_atual', 'status_baixa', 'status_financeiro', 'status_comprovante', 'status_envio_cliente', 'status_documento_fiscal', 'is_pronto_para_robo', 'responsavel_operacao_user_id', 'responsavel_fiscal_user_id', 'responsavel_financeiro_user_id', 'aprovado_por_user_id'];
        $set = [];
        $qp = [];
        foreach ($updates as $k => $v) {
            if (in_array($k, $allowed)) {
                $set[] = "$k = ?";
                $qp[] = $v;
            }
        }
        if (empty($set))
            sendJson(['success' => false, 'error' => 'Nenhum campo permitido informado'], 400);
        $set[] = 'updated_at = NOW()';
        $qp[] = $id;
        finQuery("UPDATE dados_dachser.t_vouchers SET " . implode(', ', $set) . " WHERE id = ?", $qp);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/vouchers/:id ───────────────────────────────────────────────
$router->patch('fin/vouchers/:id', function ($params) {
    try {
        $id = $params['id'];
        $b = getRequestBody();
        $updates = $b['updates'] ?? array_diff_key($b, array_flip(['user_id', 'user_name']));
        $user_id = $b['user_id'] ?? null;
        $user_name = $b['user_name'] ?? 'Sistema';

        $etapasEditaveis = ['RASCUNHO', 'A_PROCESSAR', 'OPERACAO', 'AJUSTE_OPERACAO'];
        $dataEditFields = ['numero_spo', 'fornecedor', 'cnpj_fornecedor', 'valor', 'moeda', 'vencimento', 'data_emissao_documento', 'cobranca_em_nome_de', 'forma_pagamento', 'tipo_documento', 'filial', 'urgencia_tipo', 'cliente_email', 'remessa', 'chave_pix'];
        $hasDataEdit = !empty(array_intersect(array_keys($updates ?? []), $dataEditFields));

        $etapaRows = finQuery("SELECT etapa_atual FROM dados_dachser.t_vouchers WHERE id = ? LIMIT 1", [$id]);
        $currentEtapa = $etapaRows[0]['etapa_atual'] ?? null;
        if ($hasDataEdit && $currentEtapa && !in_array($currentEtapa, $etapasEditaveis)) {
            sendJson(['success' => false, 'error' => 'EDICAO_BLOQUEADA_ETAPA', 'message' => 'Edição de dados permitida apenas nas etapas A Processar, Operacional e Ajuste Operacional.', 'etapa_atual' => $currentEtapa], 403);
        }

        $fieldMapping = ['etapa_atual', 'status_baixa', 'status_financeiro', 'status_envio_cliente', 'comentarios_operacao', 'comentarios_fiscal', 'comentarios_financeiro', 'ajuste_operacao', 'ajuste_fiscal', 'responsavel_operacao_user_id', 'responsavel_fiscal_user_id', 'responsavel_financeiro_user_id', 'responsavel_supervisor_user_id', 'aprovado_por_user_id', 'numero_spo', 'fornecedor', 'cnpj_fornecedor', 'valor', 'moeda', 'vencimento', 'data_emissao_documento', 'cobranca_em_nome_de', 'forma_pagamento', 'tipo_documento', 'filial', 'urgencia_tipo', 'cliente_email', 'remessa', 'chave_pix', 'status_documento_fiscal', 'status_comprovante', 'origem_processo', 'is_pronto_para_robo', 'linha_digitavel'];
        $dateFields = ['vencimento', 'data_emissao_documento'];
        $set = [];
        $qp = [];
        foreach ($fieldMapping as $field) {
            if (isset($updates[$field])) {
                $set[] = "$field = ?";
                $qp[] = in_array($field, $dateFields) ? formatDateForDB($updates[$field]) : $updates[$field];
            }
        }
        if (!empty($set)) {
            $set[] = 'updated_at = NOW()';
            $qp[] = $id;
            finQuery("UPDATE dados_dachser.t_vouchers SET " . implode(', ', $set) . " WHERE id = ?", $qp);
            try {
                finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'VOUCHER_EDITADO', ?, NOW())", [$id, $user_id, $user_name, 'Voucher editado. Campos: ' . implode(', ', array_keys($updates))]);
            } catch (Exception $e) {
            }
        }
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/:id/log ───────────────────────────────────────────
$router->post('fin/vouchers/:id/log', function ($params) {
    try {
        $b = getRequestBody();
        $id = $params['id'];
        if (empty($b['acao']))
            sendJson(['success' => false, 'error' => 'acao é obrigatório'], 400);
        finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, origin, entity_type, event_type, payload_json, data_hora) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())", [$id, $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', $b['acao'], $b['detalhe'] ?? null, $b['origin'] ?? 'UI', $b['entity_type'] ?? 'VOUCHER', $b['event_type'] ?? null, isset($b['payload_json']) ? json_encode($b['payload_json']) : null]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/vouchers/:id ──────────────────────────────────────────────
$router->delete('fin/vouchers/:id', function ($params) {
    try {
        $id = $params['id'];
        finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$id]);
        try {
            finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$id]);
        } catch (Exception $e) {
        }
        finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$id]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/:id/disassemble ────────────────────────────────────
$router->post('fin/vouchers/:id/disassemble', function ($params) {
    try {
        $master_id = $params['id'];
        $b = getRequestBody();
        $child_ids = $b['child_ids'] ?? null;
        $keep_master = $b['keep_master'] ?? false;
        $computeDestino = fn($urgencia, $cobranca) => strtoupper($urgencia ?? '') === 'URGENTE_REAL' ? 'SUPERVISOR' : (strtoupper($cobranca ?? '') === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
        $targetIds = (!empty($child_ids) && is_array($child_ids)) ? $child_ids : array_column(finQuery("SELECT id FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?", [$master_id]) ?: [], 'id');
        $childrenRestored = 0;
        if (!empty($targetIds)) {
            $ph = implode(',', array_fill(0, count($targetIds), '?'));
            $childRows = finQuery("SELECT id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN ($ph)", $targetIds) ?: [];
            foreach ($childRows as $c) {
                finQuery("UPDATE dados_dachser.t_vouchers SET voucher_master_id = NULL, etapa_atual = ?, updated_at = NOW() WHERE id = ?", [$computeDestino($c['urgencia_tipo'], $c['cobranca_em_nome_de']), $c['id']]);
                $childrenRestored++;
            }
        }
        $remaining = (int) (finQuery("SELECT COUNT(*) as count FROM dados_dachser.t_vouchers WHERE voucher_master_id = ?", [$master_id])[0]['count'] ?? 0);
        if (!$keep_master || $remaining === 0) {
            try {
                finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ?", [$master_id]);
            } catch (Exception $e) {
            }
            try {
                finQuery("DELETE FROM dados_dachser.t_voucher_logs WHERE voucher_id = ?", [$master_id]);
            } catch (Exception $e) {
            }
            finQuery("DELETE FROM dados_dachser.t_vouchers WHERE id = ?", [$master_id]);
        }
        sendJson(['success' => true, 'childrenRestored' => $childrenRestored, 'remainingChildren' => $remaining, 'masterDeleted' => !$keep_master || $remaining === 0]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/users/:id/role ─────────────────────────────────────────────
$router->patch('fin/users/:id/role', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_role = ? WHERE id = ?", [$b['esteira_role'] ?? null, $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/users/:id/active ──────────────────────────────────────────
$router->patch('fin/users/:id/active', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_active = ? WHERE id = ?", [!empty($b['esteira_active']) ? 1 : 0, $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/users/:id/esteira-role ────────────────────────────────────
$router->patch('fin/users/:id/esteira-role', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_role = ? WHERE id = ?", [$b['esteira_role'] ?? null, $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/users/:id/esteira-active ──────────────────────────────────
$router->patch('fin/users/:id/esteira-active', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("UPDATE dados_dachser.t_users_dachser SET esteira_active = ? WHERE id = ?", [!empty($b['esteira_active']) ? 1 : 0, $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/users/:id/supervisor ──────────────────────────────────────
$router->patch('fin/users/:id/supervisor', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("UPDATE dados_dachser.t_users_dachser SET supervisor_id = ? WHERE id = ?", [isset($b['supervisor_id']) && $b['supervisor_id'] !== '' ? (int) $b['supervisor_id'] : null, $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/accrual ──────────────────────────────────────────────────────
$router->get('fin/accrual', function ($params) {
    try {
        $search = $_GET['search'] ?? null;
        $rows = $search ? finQuery("SELECT * FROM dados_dachser.t_accrual_entries WHERE fornecedor LIKE ? OR shared_code LIKE ? ORDER BY created_at DESC", ["%$search%", "%$search%"]) : finQuery("SELECT * FROM dados_dachser.t_accrual_entries ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/accrual ─────────────────────────────────────────────────────
$router->post('fin/accrual', function ($params) {
    try {
        $b = getRequestBody();
        if (empty($b['fornecedor']) || !isset($b['valor']))
            sendJson(['success' => false, 'error' => 'fornecedor e valor são obrigatórios'], 400);
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", [$id, $b['fornecedor'], $b['valor'], $b['shared_code'] ?? null, $b['status_accrual'] ?? 'ATIVO', $b['uploaded_by_user_id'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/accrual/bulk ────────────────────────────────────────────────
$router->post('fin/accrual/bulk', function ($params) {
    try {
        $b = getRequestBody();
        $entries = $b['entries'] ?? [];
        if (empty($entries))
            sendJson(['success' => true, 'inserted' => 0]);
        $inserted = 0;
        foreach ($entries as $e) {
            finQuery("INSERT INTO dados_dachser.t_accrual_entries (id, fornecedor, valor, shared_code, status_accrual) VALUES (?, ?, ?, ?, 'ATIVO')", [genUUID(), $e['fornecedor'], $e['valor'], $e['shared_code'] ?? null]);
            $inserted++;
        }
        sendJson(['success' => true, 'inserted' => $inserted]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/accrual/all ───────────────────────────────────────────────
$router->delete('fin/accrual/all', function ($params) {
    try {
        finQuery("DELETE FROM dados_dachser.t_accrual_entries");
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/accrual/:id ───────────────────────────────────────────────
$router->delete('fin/accrual/:id', function ($params) {
    try {
        finQuery("DELETE FROM dados_dachser.t_accrual_entries WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/sync/incremental ───────────────────────────────────────────
$router->post('fin/sync/incremental', function ($params) {
    sendJson(['success' => true, 'message' => 'Sync iniciado']);
});

// ── POST /api/fin/sync/baixados ───────────────────────────────────────────────
$router->post('fin/sync/baixados', function ($params) {
    try {
        try {
            finQuery("ALTER TABLE dados_dachser.t_vouchers ADD COLUMN IF NOT EXISTS sync_status ENUM('ATIVO', 'BAIXADO') DEFAULT 'ATIVO'");
        } catch (Exception $e) {
        }
        $result = finQuery("UPDATE dados_dachser.t_vouchers v JOIN dados_dachser.t_dados_financeiro_voucher dfv ON SUBSTRING_INDEX(TRIM(v.numero_spo), ' ', 1) COLLATE utf8mb4_unicode_ci = SUBSTRING_INDEX(TRIM(dfv.nd), ' ', 1) COLLATE utf8mb4_unicode_ci JOIN dados_dachser.tbaixas b ON CAST(dfv.id_rm AS UNSIGNED) = b.IdLancamentoRM SET v.sync_status = 'BAIXADO', v.etapa_atual = 'CONCLUIDO' WHERE v.sync_status = 'ATIVO'");
        sendJson(['success' => true, 'marked' => $result['affectedRows'] ?? 0]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/anexos (upload BLOB) ───────────────────────────────
$router->post('fin/vouchers/anexos', function ($params) {
    try {
        $b = getRequestBody();
        $voucher_id = $b['voucher_id'] ?? null;
        $file_name = $b['file_name'] ?? null;
        if (!$voucher_id || !$file_name)
            sendJson(['success' => false, 'error' => 'voucher_id e file_name são obrigatórios'], 400);
        $id = genUUID();
        $fileBlob = null;
        if (!empty($b['file_base64'])) {
            $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $b['file_base64']);
            $fileBlob = base64_decode($base64Data);
        }
        $file_url = "/api/fin/vouchers/anexos/$id/download";
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)", [$id, $voucher_id, $b['tipo'] ?? 'OUTROS', $file_name, $file_url, $b['file_size'] ?? 0, $b['mime_type'] ?? null, $fileBlob]);
        if (!empty($b['user_id']) || !empty($b['user_name'])) {
            try {
                finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'ANEXO_ADICIONADO', ?, NOW())", [$voucher_id, $b['user_id'] ?? null, $b['user_name'] ?? 'Sistema', "Anexo \"$file_name\" ({$b['tipo']})" . ' adicionado']);
            } catch (Exception $e) {
            }
        }
        sendJson(['success' => true, 'id' => $id, 'file_url' => $file_url]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/vouchers/anexos/:id/download ─────────────────────────────────
$router->get('fin/vouchers/anexos/:id/download', function ($params) {
    try {
        $rows = finQuery("SELECT file_name, mime_type, file_content FROM dados_dachser.t_voucher_anexos WHERE id = ?", [$params['id']]);
        $row = $rows[0] ?? null;
        if (!$row || !$row['file_content'])
            sendJson(['error' => 'Arquivo não encontrado'], 404);
        $mime = $row['mime_type'] ?? 'application/octet-stream';
        header("Content-Type: $mime");
        header('Content-Disposition: inline; filename="' . rawurlencode($row['file_name']) . '"');
        echo $row['file_content'];
        exit;
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/vouchers/anexos/:id ───────────────────────────────────────
$router->delete('fin/vouchers/anexos/:id', function ($params) {
    try {
        finQuery("DELETE FROM dados_dachser.t_voucher_anexos WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/comprovantes/batch ─────────────────────────────────
$router->post('fin/vouchers/comprovantes/batch', function ($params) {
    try {
        $b = getRequestBody();
        $comprovantes = $b['comprovantes'] ?? [];
        if (empty($comprovantes))
            sendJson(['success' => false, 'error' => 'comprovantes[] é obrigatório'], 400);
        $results = array_map(fn($c) => ['voucher_id' => $c['voucher_id'], 'success' => false], $comprovantes);
        foreach ($comprovantes as $i => $c) {
            try {
                $fileBlob = null;
                if (!empty($c['file_base64'])) {
                    $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $c['file_base64']);
                    $fileBlob = base64_decode($base64Data);
                }
                $anexoId = genUUID();
                $file_url = $fileBlob ? "/api/fin/vouchers/anexos/$anexoId/download" : ($c['file_url'] ?? '');
                finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, mime_type, file_content) VALUES (?, ?, 'COMPROVANTE', ?, ?, ?, NOW(), ?, ?)", [$anexoId, $c['voucher_id'], $c['file_name'], $file_url, $c['file_size'] ?? 0, $c['mime_type'] ?? null, $fileBlob]);
                finQuery("UPDATE dados_dachser.t_vouchers SET status_comprovante = 'ANEXADO' WHERE id = ?", [$c['voucher_id']]);
                $results[$i]['success'] = true;
            } catch (Exception $e) {
                $results[$i]['error'] = $e->getMessage();
            }
        }
        sendJson(['success' => true, 'results' => $results, 'successCount' => count(array_filter($results, fn($r) => $r['success'])), 'totalCount' => count($comprovantes)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/:id/anexos ────────────────────────────────────────
$router->post('fin/vouchers/:id/anexos', function ($params) {
    try {
        $voucherId = $params['id'];
        $b = getRequestBody();
        if (!$voucherId || empty($b['tipo']) || empty($b['file_name']) || empty($b['file_url']))
            sendJson(['error' => 'voucher_id, tipo, file_name e file_url são obrigatórios'], 400);
        $isMaster = 0;
        $filhosSposJson = null;
        try {
            $masterRow = finQuery("SELECT COALESCE(is_master,0) AS is_master FROM dados_dachser.t_vouchers WHERE id = ?", [$voucherId]);
            if (!empty($masterRow) && (int) $masterRow[0]['is_master'] === 1) {
                $isMaster = 1;
                $filhos = finQuery("SELECT numero_spo FROM dados_dachser.t_vouchers WHERE voucher_master_id = ? ORDER BY numero_spo", [$voucherId]);
                $spos = array_filter(array_column($filhos ?: [], 'numero_spo'));
                if (!empty($spos))
                    $filhosSposJson = json_encode(array_values($spos));
            }
        } catch (Exception $e) {
        }
        $anexoId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at, is_master, filhos_spos) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)", [$anexoId, $voucherId, $b['tipo'], $b['file_name'], $b['file_url'], $b['file_size'] ?? 0, $isMaster, $filhosSposJson]);
        sendJson(['success' => true, 'anexoId' => $anexoId]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/local-charges ────────────────────────────────────────────────
$router->get('fin/local-charges', function ($params) {
    $empty = function ($source) {
        return ['rows' => [], 'meta' => ['updated_at' => null, 'effective' => null], 'source' => $source];
    };

    $companies = [
        ['key' => 'hapag', 'name' => 'HAPAG-LLOYD', 'table' => 't_local_charge'],
        ['key' => 'cma', 'name' => 'CMA-CGM', 'table' => 't_local_charge_cma'],
        ['key' => 'hmm', 'name' => 'HMM', 'table' => 't_local_charge_hmm'],
        ['key' => 'msc', 'name' => 'MSC', 'table' => 't_local_charge_msc'],
        ['key' => 'one', 'name' => 'ONE', 'table' => 't_local_charge_one'],
        ['key' => 'zim', 'name' => 'ZIM', 'table' => 't_local_charge_zim'],
    ];

    try {
        $map = [
            'hapag' => $empty('HAPAG-LLOYD'),
            'cma' => $empty('CMA-CGM'),
            'hmm' => $empty('HMM'),
            'msc' => $empty('MSC'),
            'one' => $empty('ONE'),
            'zim' => $empty('ZIM'),
        ];

        foreach ($companies as $comp) {
            $key = $comp['key'];
            $name = $comp['name'];
            $table = $comp['table'];

            try {
                $rows = finQuery("
                    SELECT charge_description, charge_code, container_type, currency,
                           fee, unit_of_measure, effective_date, expiry_date, effective,
                           data_atualizacao, user_atualizacao
                    FROM dados_dachser.$table
                    ORDER BY charge_code
                ");

                if (!empty($rows)) {
                    $mappedRows = [];
                    foreach ($rows as $r) {
                        $r['empresa'] = $name;
                        $mappedRows[] = $r;
                    }
                    $map[$key]['rows'] = $mappedRows;
                    $map[$key]['meta']['updated_at'] = $rows[0]['data_atualizacao'] ?? null;
                    $map[$key]['meta']['effective'] = $rows[0]['effective'] ?? null;
                }
            } catch (Exception $companyErr) {
                error_log("[GET /api/fin/local-charges] company query failed: " . $companyErr->getMessage());
            }
        }

        sendJson(array_merge(['success' => true], $map));
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/fee-changes ──────────────────────────────────────────────────
$router->get('fin/fee-changes', function ($params) {
    $historyCompanies = [
        ['empresa' => 'HAPAG-LLOYD', 'table' => 't_local_charge_hapag_history'],
        ['empresa' => 'CMA-CGM', 'table' => 't_local_charge_cma_history'],
        ['empresa' => 'HMM', 'table' => 't_local_charge_hmm_history'],
        ['empresa' => 'MSC', 'table' => 't_local_charge_msc_history'],
        ['empresa' => 'ONE', 'table' => 't_local_charge_one_history'],
        ['empresa' => 'ZIM', 'table' => 't_local_charge_zim_history'],
    ];

    try {
        $allChanges = [];

        foreach ($historyCompanies as $comp) {
            $empresa = $comp['empresa'];
            $table = $comp['table'];

            try {
                $rows = finQuery("
                    WITH ranked AS (
                      SELECT
                        charge_description, charge_code, container_type, currency, unit_of_measure,
                        fee, effective, chave, data_atualizacao_chave, data_atualizacao, user_atualizacao,
                        ROW_NUMBER() OVER (
                          PARTITION BY charge_code, container_type, currency
                          ORDER BY data_atualizacao_chave DESC, data_atualizacao DESC
                        ) AS rn
                      FROM dados_dachser.$table
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
                      curr.src_atual              AS src_atual
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
                ");

                if (!empty($rows)) {
                    foreach ($rows as $row) {
                        $allChanges[] = [
                            'chave' => $row['dt_chave_atual'] ?? null,
                            'empresa' => $empresa,
                            'charge_description' => $row['charge_description'],
                            'charge_code' => $row['charge_code'],
                            'container_type' => $row['container_type'],
                            'currency' => $row['currency'],
                            'unit_of_measure' => $row['unit_of_measure'],
                            'fee_anterior' => $row['fee_anterior'],
                            'fee_atual' => $row['fee_atual'],
                            'diff_abs' => $row['diff_abs'],
                            'diff_pct' => $row['diff_pct'],
                            'effective_anterior' => $row['effective_anterior'],
                            'effective_atual' => $row['effective_atual'],
                            'dt_chave_anterior' => $row['dt_chave_anterior'],
                            'dt_chave_atual' => $row['dt_chave_atual'],
                            'dt_ordenacao_anterior' => $row['dt_ordenacao_anterior'],
                            'dt_ordenacao_atual' => $row['dt_ordenacao_atual'],
                            'src_anterior' => $row['src_anterior'],
                            'src_atual' => $row['src_atual']
                        ];
                    }
                }
            } catch (Exception $companyErr) {
                error_log("[GET /api/fin/fee-changes] $table: " . $companyErr->getMessage());
            }
        }

        usort($allChanges, function ($a, $b) {
            $ta = !empty($a['dt_ordenacao_atual']) ? strtotime($a['dt_ordenacao_atual']) : 0;
            $tb = !empty($b['dt_ordenacao_atual']) ? strtotime($b['dt_ordenacao_atual']) : 0;
            return $tb - $ta;
        });

        if (count($allChanges) > 0) {
            $allChanges[0]['is_latest'] = true;
        }

        $seenEmpresa = [];
        for ($i = 0; $i < count($allChanges); $i++) {
            $emp = $allChanges[$i]['empresa'];
            if (!in_array($emp, $seenEmpresa)) {
                $seenEmpresa[] = $emp;
                $allChanges[$i]['is_latest_empresa'] = true;
            }
        }

        $latestMarked = [];
        foreach ($allChanges as $c) {
            if (!empty($c['is_latest']) || !empty($c['is_latest_empresa'])) {
                $latestMarked[] = $c;
            }
        }

        sendJson(['success' => true, 'changes' => $allChanges, 'latestMarked' => $latestMarked]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/rm/fetch ─────────────────────────────────────────────────────
$router->get('fin/rm/fetch', function ($params) {
    try {
        $nd = trim($_GET['nd'] ?? '');
        if (!$nd)
            sendJson(['success' => false, 'error' => 'nd é obrigatório'], 400);
        $ndBase = explode(' ', $nd)[0];
        $ndCandidates = array_unique(array_filter([$nd, $ndBase]));
        $ph = implode(',', array_fill(0, count($ndCandidates), '?'));
        $selectCols = "id_rm, nd, documento, nome_beneficiario, nome_cobranca, numero_nf, numero_processo, modal, tipo_pag, forma_pag, data_emissao, data_vencimento, valor_nf, moeda, cnpj, razao_social";
        $isSpoLike = (bool) preg_match('/^\d+-/', $ndBase);
        $result = [];
        $querySpo = fn() => finQuery("SELECT $selectCols FROM dados_dachser.t_dados_financeiro_spo WHERE nd IN ($ph) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1", array_merge($ndCandidates, [$ndBase]));
        $queryVoucher = fn() => finQuery("SELECT $selectCols FROM dados_dachser.t_dados_financeiro_voucher WHERE nd IN ($ph) OR SUBSTRING_INDEX(TRIM(nd),' ',1) = ? LIMIT 1", array_merge($ndCandidates, [$ndBase]));
        if ($isSpoLike) {
            $result = $querySpo();
            if (empty($result))
                $result = $queryVoucher();
        } else {
            $result = $queryVoucher();
            if (empty($result))
                $result = $querySpo();
        }
        if (empty($result))
            sendJson(['success' => false, 'error' => "ND \"$nd\" não encontrado"], 404);
        $r = $result[0];
        $fmtDate = fn($d) => $d ? (date('Y-m-d', strtotime($d))) : null;
        sendJson(['success' => true, 'data' => ['idRM' => (string) ($r['id_rm'] ?? ''), 'numeroVoucher' => $r['nd'] ?? '', 'numeroDocumento' => $r['documento'] ?? '', 'fornecedor' => $r['nome_beneficiario'] ?? $r['razao_social'] ?? '', 'filial' => $r['nome_cobranca'] ?? '', 'numeroNF' => $r['numero_nf'] ?? '', 'numeroProcesso' => $r['numero_processo'] ?? '', 'modal' => $r['modal'] ?? '', 'tipoDocumento' => $r['tipo_pag'] ?? '', 'formaPagamento' => mapFormaPagamento($r['forma_pag']), 'dataEmissao' => $fmtDate($r['data_emissao']), 'vencimento' => $fmtDate($r['data_vencimento']), 'valor' => $r['valor_nf'] !== null ? (float) $r['valor_nf'] : null, 'moeda' => $r['moeda'] ?? 'BRL', 'cnpjFornecedor' => $r['cnpj'] ?? null]]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/batch-import ────────────────────────────────────────────────
$router->post('fin/batch-import', function ($params) {
    try {
        $b = getRequestBody();
        $userId = $b['userId'] ?? '';
        try {
            finQuery("UPDATE dados_dachser.t_voucher_batch_import SET status = 'ABANDONED' WHERE created_by_user_id = ? AND status = 'PENDING_DOCUMENTS' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)", [(string) $userId]);
        } catch (Exception $e) {
        }
        $batchId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_batch_import (id, status, original_file_name, total_rows, valid_rows, error_rows, created_by_user_id, created_by_user_name, tipo) VALUES (?, 'PENDING_DOCUMENTS', ?, 0, 0, 0, ?, ?, 'FECHAMENTO_QUINZENAL')", [$batchId, 'FECHAMENTO_QUINZENAL', (string) $userId, (string) $userId]);
        sendJson(['success' => true, 'batch_id' => $batchId, 'tipo' => 'FECHAMENTO_QUINZENAL']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/batch-import/:id/status ─────────────────────────────────────
$router->get('fin/batch-import/:id/status', function ($params) {
    try {
        $batchId = $params['id'];
        $batchRows = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_import WHERE id = ?", [$batchId]);
        if (empty($batchRows))
            sendJson(['success' => false, 'error' => 'Lote não encontrado'], 404);
        $items = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? ORDER BY row_index ASC", [$batchId]) ?: [];
        $docs = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE batch_id = ? ORDER BY created_at ASC", [$batchId]) ?: [];
        sendJson(['success' => true, 'batch' => $batchRows[0], 'items' => $items, 'documents' => $docs, 'checklist' => []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/batch-import/:id/pre-lancamento ─────────────────────────────
$router->get('fin/batch-import/:id/pre-lancamento', function ($params) {
    try {
        $batchId = $params['id'];
        $vouchers = finQuery("SELECT id, numero_spo, id_rm, fornecedor, cnpj_fornecedor, valor, moeda, vencimento, forma_pagamento, tipo_documento, cobranca_em_nome_de, urgencia_tipo, processo_id, origem_processo, filial, data_emissao_documento, comentarios_operacao, created_at FROM dados_dachser.t_vouchers WHERE etapa_atual = 'PRE_LANCAMENTO' AND voucher_master_id IS NULL AND id NOT IN (SELECT bi.voucher_id FROM dados_dachser.t_voucher_batch_import_item bi WHERE bi.voucher_id IS NOT NULL AND bi.batch_id = ?) ORDER BY vencimento ASC LIMIT 500", [$batchId]) ?: [];
        sendJson(['success' => true, 'vouchers' => $vouchers]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/batch-import/:id/attach-prelancamento ──────────────────────
$router->post('fin/batch-import/:id/attach-prelancamento', function ($params) {
    try {
        $batchId = $params['id'];
        $b = getRequestBody();
        $voucherIds = $b['voucher_ids'] ?? [];
        if (empty($voucherIds))
            sendJson(['success' => false, 'error' => 'voucher_ids são obrigatórios'], 400);
        $batchRows = finQuery("SELECT id, status FROM dados_dachser.t_voucher_batch_import WHERE id = ?", [$batchId]);
        if (empty($batchRows))
            sendJson(['success' => false, 'error' => 'Lote não encontrado'], 404);
        $ph = implode(',', array_fill(0, count($voucherIds), '?'));
        $vchs = finQuery("SELECT id, numero_spo, id_rm, fornecedor, valor, vencimento, data_emissao_documento, forma_pagamento, comentarios_operacao, processo_id, urgencia_tipo, cobranca_em_nome_de FROM dados_dachser.t_vouchers WHERE id IN ($ph) AND etapa_atual = 'PRE_LANCAMENTO'", $voucherIds) ?: [];
        $attached = 0;
        $nextRow = 0;
        foreach ($vchs as $v) {
            $destino = strtoupper($v['urgencia_tipo'] ?? '') === 'URGENTE_REAL' ? 'SUPERVISOR' : (strtoupper($v['cobranca_em_nome_de'] ?? '') === 'CLIENTE' ? 'FINANCEIRO' : 'FISCAL');
            $itemId = genUUID();
            finQuery("INSERT INTO dados_dachser.t_voucher_batch_import_item (id, batch_id, row_index, voucher_id, processo, fornecedor, valor, vencimento, data_fatura, forma_pagamento, fatura, historico, status, validation_message, raw_json, etapa_destino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VOUCHER_CRIADO', 'Pré-lançamento anexado ao lote', '{}', ?)", [$itemId, $batchId, $nextRow++, $v['id'], $v['processo_id'] ?? null, $v['fornecedor'], $v['valor'], $v['vencimento'], $v['data_emissao_documento'], $v['forma_pagamento'], $v['numero_spo'], $v['comentarios_operacao'] ?? null, $destino]);
            finQuery("UPDATE dados_dachser.t_vouchers SET etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE', updated_at = NOW() WHERE id = ? AND etapa_atual = 'PRE_LANCAMENTO'", [$v['id']]);
            $attached++;
        }
        sendJson(['success' => true, 'attached' => $attached]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/batch-import/:id/bind-to-voucher ───────────────────────────
$router->post('fin/batch-import/:id/bind-to-voucher', function ($params) {
    try {
        $b = getRequestBody();
        $batch_document_id = $b['batch_document_id'] ?? null;
        $voucher_id = $b['voucher_id'] ?? null;
        $tipo_anexo = $b['tipo_anexo'] ?? null;
        if (!$batch_document_id || !$voucher_id || !$tipo_anexo)
            sendJson(['success' => false, 'error' => 'batch_document_id, voucher_id, tipo_anexo são obrigatórios'], 400);
        $docs = finQuery("SELECT * FROM dados_dachser.t_voucher_batch_documents WHERE id = ?", [$batch_document_id]);
        if (empty($docs))
            sendJson(['success' => false, 'error' => 'Documento não encontrado'], 404);
        $doc = $docs[0];
        $anexoId = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_anexos (id, voucher_id, tipo, file_name, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())", [$anexoId, $voucher_id, $tipo_anexo, $doc['file_name'], $doc['file_url'], $doc['size_bytes'] ?? 0]);
        finQuery("UPDATE dados_dachser.t_voucher_batch_documents SET voucher_id = ?, anexo_id = ?, tipo_anexo = ?, status = 'VINCULADO', bound_at = NOW() WHERE id = ?", [$voucher_id, $anexoId, $tipo_anexo, $batch_document_id]);
        sendJson(['success' => true, 'anexo_id' => $anexoId]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/batch-import/:id/finalize ──────────────────────────────────
$router->post('fin/batch-import/:id/finalize', function ($params) {
    try {
        $batchId = $params['id'];
        $b = getRequestBody();
        $userId = $b['userId'] ?? '';
        $items = finQuery("SELECT id, voucher_id, etapa_destino, forma_pagamento FROM dados_dachser.t_voucher_batch_import_item WHERE batch_id = ? AND voucher_id IS NOT NULL", [$batchId]) ?: [];
        $updated = 0;
        foreach ($items as $item) {
            $destino = $item['etapa_destino'] ?? 'FISCAL';
            finQuery("UPDATE dados_dachser.t_vouchers SET etapa_atual = ?, updated_at = NOW() WHERE id = ?", [$destino, $item['voucher_id']]);
            try {
                finQuery("INSERT INTO dados_dachser.t_voucher_logs (id, voucher_id, user_id, user_name, acao, detalhe, data_hora) VALUES (UUID(), ?, ?, ?, 'LOTE_FINALIZADO', ?, NOW())", [$item['voucher_id'], (string) $userId, (string) $userId, "Lote $batchId finalizado → $destino"]);
            } catch (Exception $e) {
            }
            $updated++;
        }
        finQuery("UPDATE dados_dachser.t_voucher_batch_import SET status = 'COMPLETE', updated_at = NOW() WHERE id = ?", [$batchId]);
        sendJson(['success' => true, 'updated' => $updated]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/vouchers/batch-documents ────────────────────────────────────
$router->post('fin/vouchers/batch-documents', function ($params) {
    try {
        $b = getRequestBody();
        $batch_id = $b['batch_id'] ?? null;
        $documents = $b['documents'] ?? [];
        if (!$batch_id || empty($documents))
            sendJson(['success' => false, 'error' => 'batch_id e documents[] são obrigatórios'], 400);
        try {
            finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_batch_documents (id VARCHAR(36) PRIMARY KEY, batch_id VARCHAR(36) NOT NULL, file_name VARCHAR(500), file_url TEXT, mime_type VARCHAR(200), size_bytes BIGINT DEFAULT 0, tipo_anexo VARCHAR(50), status VARCHAR(50) DEFAULT 'PENDENTE', uploaded_by_user_id VARCHAR(50), file_content MEDIUMBLOB NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        } catch (Exception $e) {
        }
        $ids = [];
        foreach ($documents as $doc) {
            $docId = genUUID();
            $fileBlob = null;
            if (!empty($doc['file_base64'])) {
                $base64Data = preg_replace('/^data:[^;]+;base64,/', '', $doc['file_base64']);
                $fileBlob = base64_decode($base64Data);
            }
            $file_url = $fileBlob ? "/api/fin/vouchers/anexos/$docId/download" : ($doc['file_url'] ?? '');
            finQuery("INSERT INTO dados_dachser.t_voucher_batch_documents (id, batch_id, file_name, file_url, mime_type, size_bytes, tipo_anexo, status, uploaded_by_user_id, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)", [$docId, $batch_id, $doc['file_name'], $file_url, $doc['mime_type'] ?? null, $doc['size_bytes'] ?? 0, $doc['tipo_anexo'] ?? null, (string) ($b['userId'] ?? ''), $fileBlob]);
            $ids[] = $docId;
        }
        sendJson(['success' => true, 'ids' => $ids, 'inserted' => count($ids)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/freetime ────────────────────────────────────────────────────────
$router->get('freetime', function ($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_client_free_time WHERE ativo = TRUE ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/freetime/for-client ─────────────────────────────────────────────
$router->get('freetime/for-client', function ($params) {
    try {
        $cliente_nome = $_GET['cliente_nome'] ?? null;
        $mbl = $_GET['mbl'] ?? null;
        if ($mbl) {
            $rows = finQuery("SELECT * FROM dados_dachser.t_client_free_time WHERE tipo_ft = 'PROCESSO' AND mbl = ? AND ativo = TRUE LIMIT 1", [$mbl]);
            if ($rows && count($rows) > 0) {
                sendJson(['success' => true, 'data' => $rows[0]]);
                return;
            }
        }
        if ($cliente_nome) {
            $rows = finQuery("SELECT * FROM dados_dachser.t_client_free_time WHERE tipo_ft = 'CONTRATO' AND cliente_nome = ? AND ativo = TRUE AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE()) AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE()) ORDER BY created_at DESC LIMIT 1", [$cliente_nome]);
            if ($rows && count($rows) > 0) {
                sendJson(['success' => true, 'data' => $rows[0]]);
                return;
            }
        }
        sendJson(['success' => true, 'data' => null]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/freetime ───────────────────────────────────────────────────────
$router->post('freetime', function ($params) {
    try {
        $d = getRequestBody();
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_client_free_time (id, tipo_ft, cliente_nome, mbl, free_time_demurrage_days, demurrage_type, demurrage_currency, demurrage_amount, vigencia_inicio, vigencia_fim, observacao, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [$id, $d['tipo_ft'] ?? 'CONTRATO', $d['cliente_nome'] ?? null, $d['mbl'] ?? null, $d['free_time_demurrage_days'] ?? null, $d['demurrage_type'] ?? null, $d['demurrage_currency'] ?? null, $d['demurrage_amount'] ?? null, $d['vigencia_inicio'] ?? null, $d['vigencia_fim'] ?? null, $d['observacao'] ?? null, $d['updated_by'] ?? null]);
        $rows = finQuery("SELECT * FROM dados_dachser.t_client_free_time WHERE id = ?", [$id]);
        sendJson(['success' => true, 'data' => $rows[0]]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/freetime/:id ──────────────────────────────────────────────────
$router->patch('freetime/:id', function ($params) {
    try {
        $id = $params['id'];
        $d = getRequestBody();
        $setClauses = [];
        $values = [];
        $fields = ['tipo_ft', 'cliente_nome', 'mbl', 'free_time_demurrage_days', 'demurrage_type', 'demurrage_currency', 'demurrage_amount', 'vigencia_inicio', 'vigencia_fim', 'observacao', 'updated_by'];
        foreach ($fields as $f) {
            if (isset($d[$f])) {
                $setClauses[] = "$f = ?";
                $values[] = $d[$f];
            }
        }
        if (count($setClauses) > 0) {
            $values[] = $id;
            finQuery("UPDATE dados_dachser.t_client_free_time SET " . implode(', ', $setClauses) . " WHERE id = ?", $values);
        }
        $rows = finQuery("SELECT * FROM dados_dachser.t_client_free_time WHERE id = ?", [$id]);
        sendJson(['success' => true, 'data' => $rows[0] ?? null]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/freetime/:id ─────────────────────────────────────────────────
$router->delete('freetime/:id', function ($params) {
    try {
        finQuery("UPDATE dados_dachser.t_client_free_time SET ativo = FALSE WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/freetime/voucher ─────────────────────────────────────────────────
$router->get('freetime/voucher', function ($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_freetime_vouchers ORDER BY created_at DESC LIMIT 200") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/freetime/voucher ────────────────────────────────────────────────
$router->post('freetime/voucher', function ($params) {
    try {
        $b = getRequestBody();
        try {
            finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_freetime_vouchers (id VARCHAR(36) PRIMARY KEY, bl_number VARCHAR(100), container_number VARCHAR(50), shipping_line VARCHAR(100), free_time_days INT, demurrage_start DATE, status VARCHAR(50) DEFAULT 'PENDENTE', created_by VARCHAR(100), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
        } catch (Exception $e) {
        }
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_freetime_vouchers (id, bl_number, container_number, shipping_line, free_time_days, demurrage_start, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [$id, $b['bl_number'] ?? null, $b['container_number'] ?? null, $b['shipping_line'] ?? null, $b['free_time_days'] ?? null, $b['demurrage_start'] ?? null, $b['status'] ?? 'PENDENTE', $b['created_by'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/notifications/voucher ───────────────────────────────────────────
$router->get('notifications/voucher', function ($params) {
    try {
        $userId = $_GET['user_id'] ?? null;
        if (!$userId)
            sendJson(['success' => true, 'notifications' => []]);
        $rows = finQuery("SELECT id, voucher_id, user_id, tipo, mensagem, lido, created_at FROM dados_dachser.t_voucher_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [$userId]) ?: [];
        sendJson(['success' => true, 'notifications' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => true, 'notifications' => []]);
    }
});

// ── POST /api/notifications/voucher ──────────────────────────────────────────
$router->post('notifications/voucher', function ($params) {
    try {
        $b = getRequestBody();
        try {
            finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_voucher_notifications (id VARCHAR(36) PRIMARY KEY, voucher_id VARCHAR(100), user_id VARCHAR(100), tipo VARCHAR(50), mensagem TEXT, lido TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        } catch (Exception $e) {
        }
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_voucher_notifications (id, voucher_id, user_id, tipo, mensagem, lido) VALUES (?, ?, ?, ?, ?, 0)", [$id, $b['voucher_id'] ?? null, $b['user_id'] ?? null, $b['tipo'] ?? 'INFO', $b['mensagem'] ?? '']);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/disputas ─────────────────────────────────────────────────────
$router->get('fin/disputas', function ($params) {
    try {
        $rows = finQuery("SELECT d.*, t.razao_social, t.valor_nf, t.modal, t.numero_nf FROM dados_dachser.t_fin_disputas d LEFT JOIN dados_dachser.v_fin_regua_contas_receber t ON (d.documento <> 'CR' AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci) WHERE d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 500") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/disputas ────────────────────────────────────────────────────
$router->post('fin/disputas', function ($params) {
    try {
        $b = getRequestBody();
        try {
            finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_disputas (id INT AUTO_INCREMENT PRIMARY KEY, documento VARCHAR(100), nf VARCHAR(50), nd VARCHAR(50), doc_key VARCHAR(200), is_disputa TINYINT(1) DEFAULT 1, motivo TEXT, user_id VARCHAR(100), user_name VARCHAR(100), resolved_at DATETIME NULL, deleted_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
        } catch (Exception $e) {
        }
        finQuery("INSERT INTO dados_dachser.t_fin_disputas (documento, nf, nd, doc_key, is_disputa, motivo, user_id, user_name) VALUES (?, ?, ?, ?, 1, ?, ?, ?)", [$b['documento'] ?? null, $b['nf'] ?? null, $b['nd'] ?? null, $b['doc_key'] ?? null, $b['motivo'] ?? null, $b['user_id'] ?? null, $b['user_name'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PATCH /api/fin/disputas/:id/resolve ──────────────────────────────────────
$router->patch('fin/disputas/:id/resolve', function ($params) {
    try {
        finQuery("UPDATE dados_dachser.t_fin_disputas SET resolved_at = NOW() WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/disputas/:id ─────────────────────────────────────────────
$router->delete('fin/disputas/:id', function ($params) {
    try {
        finQuery("UPDATE dados_dachser.t_fin_disputas SET deleted_at = NOW() WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/regua ────────────────────────────────────────────────────────
$router->get('fin/regua', function ($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.v_fin_regua_contas_receber LIMIT 5000") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/soft-delete ──────────────────────────────────────────────────
$router->get('fin/soft-delete', function ($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_fin_soft_delete WHERE active = 0 ORDER BY deleted_at DESC LIMIT 200") ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/soft-delete ─────────────────────────────────────────────────
$router->post('fin/soft-delete', function ($params) {
    try {
        $b = getRequestBody();
        try {
            finQuery("CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_soft_delete (id INT AUTO_INCREMENT PRIMARY KEY, documento VARCHAR(200) NOT NULL UNIQUE, active TINYINT(1) DEFAULT 0, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_by VARCHAR(100))");
        } catch (Exception $e) {
        }
        finQuery("INSERT INTO dados_dachser.t_fin_soft_delete (documento, active, deleted_by) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE active = 0, deleted_at = NOW(), deleted_by = VALUES(deleted_by)", [$b['documento'] ?? null, $b['user_id'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/soft-delete/:documento ────────────────────────────────────
$router->delete('fin/soft-delete/:documento', function ($params) {
    try {
        finQuery("UPDATE dados_dachser.t_fin_soft_delete SET active = 1 WHERE documento = ?", [urldecode($params['documento'])]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/email/enviar-cobranca ──────────────────────────────────────
$router->post('fin/email/enviar-cobranca', function ($params) {
    // Requer Resend — retorna stub em ambiente PHP (sem Resend SDK nativo)
    sendJson(['success' => false, 'error' => 'Envio de email de cobrança requer configuração do Resend via webhook externo ou SMTP.'], 501);
});

// ── GET /api/fin/email-logs ───────────────────────────────────────────────────
$router->get('fin/email-logs', function ($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj)
            sendJson(['success' => true, 'logs' => []]);
        $rows = finQuery("SELECT * FROM dados_dachser.t_fin_email_log WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? ORDER BY sent_at DESC LIMIT 100", [$cnpj]) ?: [];
        sendJson(['success' => true, 'logs' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/contatos ─────────────────────────────────────────────────────
$router->get('fin/contatos', function ($params) {
    try {
        $cnpj = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
        if (!$cnpj)
            sendJson(['success' => true, 'data' => []]);
        $rows = finQuery("SELECT * FROM dados_dachser.t_dados_financeiro_contatos WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ? AND ativo = 1 ORDER BY nome_contato ASC", [$cnpj]) ?: [];
        sendJson(['success' => true, 'data' => $rows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/contatos ────────────────────────────────────────────────────
$router->post('fin/contatos', function ($params) {
    try {
        $b = getRequestBody();
        $id = genUUID();
        finQuery("INSERT INTO dados_dachser.t_dados_financeiro_contatos (id, cnpj, nome_contato, email_contato, funcao, ativo) VALUES (?, ?, ?, ?, ?, 1)", [$id, $b['cnpj'] ?? null, $b['nome_contato'] ?? null, $b['email_contato'] ?? null, $b['funcao'] ?? null]);
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/contatos/:id ─────────────────────────────────────────────
$router->delete('fin/contatos/:id', function ($params) {
    try {
        finQuery("UPDATE dados_dachser.t_dados_financeiro_contatos SET ativo = 0 WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/cliente-grupos ───────────────────────────────────────────────
$router->get('fin/cliente-grupos', function ($params) {
    try {
        sendJson(['success' => true, 'data' => finQuery("SELECT * FROM dados_dachser.t_fin_cliente_grupo ORDER BY razao_social ASC") ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/cliente-grupos ──────────────────────────────────────────────
$router->post('fin/cliente-grupos', function ($params) {
    try {
        $b = getRequestBody();
        finQuery("INSERT INTO dados_dachser.t_fin_cliente_grupo (razao_social, grupo) VALUES (?, ?) ON DUPLICATE KEY UPDATE grupo = VALUES(grupo)", [$b['razao_social'] ?? null, $b['grupo'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── DELETE /api/fin/cliente-grupos/:id ───────────────────────────────────────
$router->delete('fin/cliente-grupos/:id', function ($params) {
    try {
        finQuery("DELETE FROM dados_dachser.t_fin_cliente_grupo WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/metrics ──────────────────────────────────────────────────────
$router->get('fin/metrics', function ($params) {
    try {
        $dateFrom = $_GET['dateFrom'] ?? date('Y-m-d', strtotime('-7 days'));
        $dateTo = $_GET['dateTo'] ?? date('Y-m-d');
        $usernameFilter = $_GET['username'] ?? '';
        $moduleFilter = $_GET['module'] ?? '';
        $perPage = isset($_GET['perPage']) ? (int) $_GET['perPage'] : 50;
        $perPage = max(10, min($perPage, 200));
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $page = max(1, $page);
        $offset = ($page - 1) * $perPage;

        $hiddenLogUsers = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];

        $whereConditions = ["event_time BETWEEN ? AND ?"];
        $queryParams = ["$dateFrom 00:00:00", "$dateTo 23:59:59"];

        foreach ($hiddenLogUsers as $u) {
            $whereConditions[] = "username != ?";
            $queryParams[] = $u;
        }

        $whereConditions[] = "username IS NOT NULL AND username != '' AND username != 'unknown'";
        // Exclude dashboard and admin routes
        $whereConditions[] = "endpoint NOT LIKE '/dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE 'dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE '/admin%'";
        $whereConditions[] = "endpoint NOT LIKE 'admin%'";

        if ($usernameFilter) {
            $whereConditions[] = "username LIKE ?";
            $queryParams[] = "%$usernameFilter%";
        }

        if ($moduleFilter) {
            $mappedModule = strtolower($moduleFilter);
            if ($mappedModule === 'sea') {
                // sea can be stored as /sea/ or /maritimo/
                $whereConditions[] = "(LOWER(endpoint) LIKE ? OR LOWER(endpoint) LIKE ?)";
                $queryParams[] = "%/sea/%";
                $queryParams[] = "%/maritimo/%";
            } else {
                $whereConditions[] = "LOWER(endpoint) LIKE ?";
                $queryParams[] = "%/" . $mappedModule . "/%";
            }
        }

        $whereClause = "WHERE " . implode(' AND ', $whereConditions);

        // 1. Get total count
        $countSql = "SELECT COUNT(*) as total FROM dados_dachser.t_usage_logs $whereClause";
        $countResult = finQuery($countSql, $queryParams);
        $total = (int) ($countResult[0]['total'] ?? 0);
        $totalPages = max(1, ceil($total / $perPage));

        // 2. Get stats
        $statsSql = "SELECT
            COUNT(DISTINCT username) AS users,
            COUNT(DISTINCT SUBSTRING_INDEX(endpoint, '#', 1)) AS endpoints,
            SUM(CASE WHEN method='GET' THEN 1 ELSE 0 END) AS get_calls,
            SUM(CASE WHEN method='POST' THEN 1 ELSE 0 END) AS post_calls
          FROM dados_dachser.t_usage_logs
          $whereClause";
        $statsResult = finQuery($statsSql, $queryParams);
        $statsRow = $statsResult[0] ?? [];

        // Calculate days diff for average
        $fromDate = new DateTime($dateFrom);
        $toDate = new DateTime($dateTo);
        $daysDiff = max(1, $toDate->diff($fromDate)->days + 1);
        $avgPerDay = $daysDiff > 0 ? $total / $daysDiff : $total;

        // 3. Get daily data for chart
        $dailySql = "SELECT DATE(event_time) AS d, COUNT(*) AS total
          FROM dados_dachser.t_usage_logs
          $whereClause
          GROUP BY DATE(event_time)
          ORDER BY d ASC";
        $dailyResult = finQuery($dailySql, $queryParams);
        $dailyData = [];
        foreach (($dailyResult ?: []) as $row) {
            $dailyData[] = [
                'date' => date('d/m', strtotime($row['d'])),
                'total' => (int) $row['total']
            ];
        }

        // 4. Get top endpoints
        $endpointSql = "SELECT SUBSTRING_INDEX(endpoint, '#', 1) AS cleaned_endpoint, COUNT(*) AS total
          FROM dados_dachser.t_usage_logs
          $whereClause
          GROUP BY cleaned_endpoint
          ORDER BY total DESC
          LIMIT 5";
        $endpointResult = finQuery($endpointSql, $queryParams);
        $endpointData = [];
        foreach (($endpointResult ?: []) as $row) {
            $endpointData[] = [
                'endpoint' => $row['cleaned_endpoint'],
                'total' => (int) $row['total']
            ];
        }

        // 5. Get paginated logs
        $logsSql = "SELECT id, username, endpoint, method, event_time
          FROM dados_dachser.t_usage_logs
          $whereClause
          ORDER BY event_time DESC, id DESC
          LIMIT " . (int) $perPage . " OFFSET " . (int) $offset;
        $logsResult = finQuery($logsSql, $queryParams) ?: [];

        sendJson([
            'success' => true,
            'logs' => $logsResult,
            'stats' => [
                'total' => $total,
                'distinctUsers' => (int) ($statsRow['users'] ?? 0),
                'distinctEndpoints' => (int) ($statsRow['endpoints'] ?? 0),
                'getCalls' => (int) ($statsRow['get_calls'] ?? 0),
                'postCalls' => (int) ($statsRow['post_calls'] ?? 0),
                'avgPerDay' => round($avgPerDay, 1)
            ],
            'dailyData' => $dailyData,
            'endpointData' => $endpointData,
            'totalPages' => $totalPages,
            'currentPage' => $page
        ]);
    } catch (Exception $e) {
        error_log('[GET /api/fin/metrics] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/metrics/by-module ────────────────────────────────────────────
$router->get('fin/metrics/by-module', function ($params) {
    try {
        $dateFrom = $_GET['dateFrom'] ?? date('Y-m-d', strtotime('-30 days'));
        $dateTo = $_GET['dateTo'] ?? date('Y-m-d');
        $usernameFilter = $_GET['username'] ?? '';

        $hiddenLogUsers = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];

        $whereConditions = ["DATE(event_time) BETWEEN ? AND ?"];
        $queryParams = [$dateFrom, $dateTo];

        foreach ($hiddenLogUsers as $u) {
            $whereConditions[] = "username != ?";
            $queryParams[] = $u;
        }

        $whereConditions[] = "username IS NOT NULL AND username != '' AND username != 'unknown'";
        // Exclude dashboard and admin routes from module aggregation (with or without leading slash)
        $whereConditions[] = "endpoint NOT LIKE '/dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE 'dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE '/admin%'";
        $whereConditions[] = "endpoint NOT LIKE 'admin%'";

        if ($usernameFilter) {
            $whereConditions[] = "username = ?";
            $queryParams[] = $usernameFilter;
        }

        $whereClause = "WHERE " . implode(' AND ', $whereConditions);

        $sql = "SELECT
            CASE 
                WHEN endpoint LIKE 'event:%' THEN 
                    CASE 
                        WHEN endpoint LIKE 'event:admin.%' THEN 'admin'
                        WHEN endpoint LIKE 'event:vouchers.%' OR endpoint LIKE 'event:regua.%' OR endpoint LIKE 'event:financeiro.%' OR endpoint LIKE 'event:disputas.%' THEN 'fin'
                        WHEN endpoint LIKE 'event:chb.%' OR endpoint LIKE 'event:ocr.%' THEN 'chb'
                        WHEN endpoint LIKE 'event:air.%' OR endpoint LIKE 'event:tracking.%' THEN 'air'
                        WHEN endpoint LIKE 'event:sea.%' THEN 'sea'
                        WHEN endpoint LIKE 'event:olimpo.%' THEN 'olimpo'
                        WHEN endpoint LIKE 'event:cct.%' THEN 'cct'
                        ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, ':', -1), '.', 1)
                    END
                ELSE 
                    CASE 
                        WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '#', 1), '/', 2), '/', -1) = 'maritimo' THEN 'sea'
                        WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '#', 1), '/', 2), '/', -1) IN ('dashboard', 'admin', '') THEN NULL
                        ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '#', 1), '/', 2), '/', -1)
                    END
            END AS module,
            COUNT(*)                AS totalAccesses,
            COUNT(DISTINCT username) AS uniqueUsers,
            SUBSTRING_INDEX(
              GROUP_CONCAT(SUBSTRING_INDEX(endpoint, '#', 1) ORDER BY endpoint SEPARATOR '||'),
              '||', 1
            ) AS topEndpoint
          FROM dados_dachser.t_usage_logs
          $whereClause
          GROUP BY module
          HAVING module IS NOT NULL AND module NOT IN ('dashboard', 'admin', '')
          ORDER BY totalAccesses DESC";

        $rows = finQuery($sql, $queryParams);

        $labels = [
            'air' => 'AIR',
            'sea' => 'Marítimo',
            'fin' => 'Financeiro',
            'admin' => 'Admin',
            'olimpo' => 'Olimpo',
            'chb' => 'CHB',
            'cct' => 'CCT'
        ];

        $modulesMap = [
            'air' => ['module' => 'air', 'label' => 'AIR', 'totalAccesses' => 0, 'uniqueUsers' => 0, 'avgTimeOnScreenSec' => 0, 'topEndpoint' => null],
            'sea' => ['module' => 'sea', 'label' => 'Marítimo', 'totalAccesses' => 0, 'uniqueUsers' => 0, 'avgTimeOnScreenSec' => 0, 'topEndpoint' => null],
            'fin' => ['module' => 'fin', 'label' => 'Financeiro', 'totalAccesses' => 0, 'uniqueUsers' => 0, 'avgTimeOnScreenSec' => 0, 'topEndpoint' => null],
            'chb' => ['module' => 'chb', 'label' => 'CHB', 'totalAccesses' => 0, 'uniqueUsers' => 0, 'avgTimeOnScreenSec' => 0, 'topEndpoint' => null],
            'olimpo' => ['module' => 'olimpo', 'label' => 'Olimpo', 'totalAccesses' => 0, 'uniqueUsers' => 0, 'avgTimeOnScreenSec' => 0, 'topEndpoint' => null],
        ];

        // Modules to completely ignore (never show)
        $blockedModules = ['dashboard', 'admin', 'outros', '', null];

        $otherModules = [];

        foreach (($rows ?: []) as $r) {
            $modName = strtolower($r['module'] ?? '');
            // Skip blocked modules entirely
            if (in_array($modName, $blockedModules, true))
                continue;
            if (isset($modulesMap[$modName])) {
                $modulesMap[$modName]['totalAccesses'] = (int) $r['totalAccesses'];
                $modulesMap[$modName]['uniqueUsers'] = (int) $r['uniqueUsers'];
                $modulesMap[$modName]['topEndpoint'] = $r['topEndpoint'] ?: null;
            }
            // Ignore any other unknown modules — only the 5 core ones matter
        }

        $modules = array_values($modulesMap);

        sendJson([
            'success' => true,
            'modules' => $modules
        ]);
    } catch (Exception $e) {
        error_log('[GET /api/fin/metrics/by-module] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/metrics/sessions ─────────────────────────────────────────────
$router->get('fin/metrics/sessions', function ($params) {
    try {
        $dateFrom = $_GET['dateFrom'] ?? date('Y-m-d', strtotime('-7 days'));
        $dateTo = $_GET['dateTo'] ?? date('Y-m-d');
        $usernameFilter = $_GET['username'] ?? '';
        $perPage = isset($_GET['perPage']) ? (int) $_GET['perPage'] : 25;
        $perPage = max(10, min($perPage, 200));
        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $page = max(1, $page);
        $offset = ($page - 1) * $perPage;

        $hiddenLogUsers = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];

        $whereConditions = ["event_time BETWEEN ? AND ?"];
        $queryParams = ["$dateFrom 00:00:00", "$dateTo 23:59:59"];

        foreach ($hiddenLogUsers as $u) {
            $whereConditions[] = "username != ?";
            $queryParams[] = $u;
        }

        $whereConditions[] = "username IS NOT NULL AND username != '' AND username != 'unknown'";
        // Exclude dashboard and admin routes
        $whereConditions[] = "endpoint NOT LIKE '/dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE 'dashboard%'";
        $whereConditions[] = "endpoint NOT LIKE '/admin%'";
        $whereConditions[] = "endpoint NOT LIKE 'admin%'";

        if ($usernameFilter) {
            $whereConditions[] = "username LIKE ?";
            $queryParams[] = "%$usernameFilter%";
        }

        $whereClause = "WHERE " . implode(' AND ', $whereConditions);

        // 1. Count unique sessions
        $countSql = "SELECT COUNT(DISTINCT session_id) as total FROM dados_dachser.t_usage_logs $whereClause AND session_id IS NOT NULL AND session_id != ''";
        $countRes = finQuery($countSql, $queryParams);
        $totalSessions = (int) ($countRes[0]['total'] ?? 0);
        $totalPages = max(1, ceil($totalSessions / $perPage));

        // 2. Get sessions
        $sessionsSql = "SELECT
            session_id AS sessionId,
            MIN(username) AS username,
            MIN(event_time) AS startedAt,
            MAX(event_time) AS endedAt,
            COUNT(*) AS eventCount,
            COUNT(DISTINCT endpoint) AS uniqueEndpoints,
            TIMESTAMPDIFF(SECOND, MIN(event_time), MAX(event_time)) AS durationSec
        FROM dados_dachser.t_usage_logs
        $whereClause
        AND session_id IS NOT NULL AND session_id != ''
        GROUP BY session_id
        ORDER BY startedAt DESC
        LIMIT " . (int) $perPage . " OFFSET " . (int) $offset;

        $sessionsRows = finQuery($sessionsSql, $queryParams);

        $sessions = [];
        if (!empty($sessionsRows)) {
            $sessionIds = array_column($sessionsRows, 'sessionId');
            $sessionPlaceholders = implode(', ', array_fill(0, count($sessionIds), '?'));

            $eventsSql = "SELECT session_id AS sessionId, endpoint, method, event_time
                FROM dados_dachser.t_usage_logs
                WHERE session_id IN ($sessionPlaceholders)
                AND endpoint NOT LIKE '/dashboard%'
                AND endpoint NOT LIKE 'dashboard%'
                AND endpoint NOT LIKE '/admin%'
                AND endpoint NOT LIKE 'admin%'
                ORDER BY event_time ASC";

            $eventsRows = finQuery($eventsSql, $sessionIds) ?: [];

            $eventsBySession = [];
            foreach ($eventsRows as $ev) {
                $eventsBySession[$ev['sessionId']][] = [
                    'endpoint' => $ev['endpoint'],
                    'method' => $ev['method'],
                    'event_time' => $ev['event_time']
                ];
            }

            foreach ($sessionsRows as $sRow) {
                $sId = $sRow['sessionId'];
                $sessions[] = [
                    'sessionId' => $sId,
                    'username' => $sRow['username'],
                    'startedAt' => $sRow['startedAt'],
                    'endedAt' => $sRow['endedAt'],
                    'eventCount' => (int) $sRow['eventCount'],
                    'uniqueEndpoints' => (int) $sRow['uniqueEndpoints'],
                    'durationSec' => (int) $sRow['durationSec'],
                    'events' => $eventsBySession[$sId] ?? []
                ];
            }
        }

        sendJson([
            'success' => true,
            'sessions' => $sessions,
            'totalPages' => $totalPages,
            'currentPage' => $page
        ]);
    } catch (Exception $e) {
        error_log('[GET /api/fin/metrics/sessions] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/regua/counts ────────────────────────────────────────────────
$router->get('fin/regua/counts', function ($params) {
    try {
        $MAX_DIAS_ATRASO = 120;
        $sql = "
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
        ";
        $rows = finQuery($sql, [$MAX_DIAS_ATRASO]);
        $counts = ['PRE' => 0, 'D1' => 0, 'D7' => 0, 'D15' => 0, 'D30' => 0, 'D45' => 0, 'D60' => 0];
        $amounts = ['PRE' => 0, 'D1' => 0, 'D7' => 0, 'D15' => 0, 'D30' => 0, 'D45' => 0, 'D60' => 0];
        if (!empty($rows)) {
            foreach ($rows as $row) {
                $st = $row['stage'];
                if ($st && isset($counts[$st])) {
                    $counts[$st] = (int) $row['qt'];
                    $amounts[$st] = (float) $row['total_valor'];
                }
            }
        }
        sendJson(['success' => true, 'counts' => $counts, 'amounts' => $amounts]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/regua/stats ─────────────────────────────────────────────────
$router->get('fin/regua/stats', function ($params) {
    try {
        $rows = finQuery("SELECT COUNT(*) AS total_records, SUM(valor_nf) AS total_open_amount, MAX(datavalidade) AS last_update FROM dados_dachser.v_fin_regua_contas_receber");
        $r = !empty($rows) ? $rows[0] : [];
        sendJson([
            'success' => true,
            'stats' => [
                'lastUpdate' => $r['last_update'] ?? null,
                'totalRecords' => (int) ($r['total_records'] ?? 0),
                'totalOpenAmount' => (float) ($r['total_open_amount'] ?? 0)
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/regua/aging-defaults ────────────────────────────────────────
$router->get('fin/regua/aging-defaults', function ($params) {
    sendJson([
        'success' => true,
        'recipients' => $_ENV['REGUA_EMAIL_RECIPIENTS'] ?? 'devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com',
        'contato_email' => $_ENV['REGUA_CONTATO_EMAIL'] ?? 'jessica.costa@dachser.com',
        'contato_telefone' => $_ENV['REGUA_CONTATO_TELEFONE'] ?? '+55 (19) 3312-6185'
    ]);
});

// ── GET /api/fin/regua/stage ─────────────────────────────────────────────────
$router->get('fin/regua/stage', function ($params) {
    try {
        $stage = $_GET['stage'] ?? null;
        if (!$stage)
            sendJson(['success' => false, 'error' => 'stage é obrigatório'], 400);
        $MAX_DIAS_ATRASO = 120;
        $s = preg_replace('/[^A-Z0-9+]/i', '', $stage);
        $sql = "
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
        ";
        $rows = finQuery($sql, [$s, $s, $MAX_DIAS_ATRASO, $s, $s]);
        $formattedRows = [];
        if (!empty($rows)) {
            foreach ($rows as $r) {
                $r['valor_br'] = $r['valor_nf'] !== null ? 'R$ ' . number_format((float) $r['valor_nf'], 2, ',', '.') : '-';
                $formattedRows[] = $r;
            }
        }
        sendJson(['success' => true, 'rows' => $formattedRows]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── GET /api/fin/regua/clientes-resumo ───────────────────────────────────────
$router->get('fin/regua/clientes-resumo', function ($params) {
    try {
        $cliente = $_GET['cliente'] ?? null;
        if (!$cliente)
            sendJson(['success' => false, 'error' => 'cliente é obrigatório'], 400);
        $searchTerm = "%" . $cliente . "%";
        $rows = finQuery("
          SELECT SUBSTRING_INDEX(t.razao_social, ' - ', 1) AS razao_base, t.razao_social, t.cnpj, COUNT(*) AS qtd_faturas
          FROM dados_dachser.v_fin_regua_contas_receber t
          WHERE NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
            AND (t.razao_social LIKE ? OR t.cnpj LIKE ?)
          GROUP BY t.cnpj, t.razao_social
          ORDER BY razao_base ASC LIMIT 50
        ", [$searchTerm, $searchTerm]);
        sendJson(['success' => true, 'rows' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/regua/send-aging ───────────────────────────────────────────
$router->post('fin/regua/send-aging', function ($params) {
    try {
        $b = getRequestBody();
        $cnpj = $b['cnpj'] ?? null;
        $cnpjs = $b['cnpjs'] ?? [];
        $razao_base = $b['razao_base'] ?? null;
        $razao_bases = $b['razao_bases'] ?? [];
        $cliente = $b['cliente'] ?? null;
        $email_to = $b['email_to'] ?? null;
        $custom_text = $b['custom_text'] ?? null;

        if (!$cnpj && empty($cnpjs) && !$razao_base && empty($razao_bases)) {
            sendJson(['success' => false, 'error' => 'cnpj, cnpjs, razao_base ou razao_bases é obrigatório'], 400);
        }

        $parseEmails = function ($input) {
            $fallbackStr = $_ENV['REGUA_EMAIL_RECIPIENTS'] ?? 'devs@z3us.ai; bia.souza@dachser.com; jessica.costa@dachser.com';
            $fallback = array_filter(array_map('trim', preg_split('/[;,\n]/', strtolower($fallbackStr))), function ($e) {
                return filter_var($e, FILTER_VALIDATE_EMAIL);
            });
            if (empty($input) || !trim($input))
                return array_values($fallback);
            $emails = array_filter(array_map('trim', preg_split('/[;,\n]/', strtolower($input))), function ($e) {
                return filter_var($e, FILTER_VALIDATE_EMAIL);
            });
            return !empty($emails) ? array_values($emails) : array_values($fallback);
        };

        $formatCnpj = function ($c) {
            $d = preg_replace('/\D/', '', strval($c));
            return strlen($d) === 14 ? substr($d, 0, 2) . '.' . substr($d, 2, 3) . '.' . substr($d, 5, 3) . '/' . substr($d, 8, 4) . '-' . substr($d, 12, 2) : $c;
        };

        $formatCnpjShort = function ($c) {
            $d = preg_replace('/\D/', '', strval($c));
            return strlen($d) === 14 ? substr($d, 0, 2) . '.' . substr($d, 2, 3) . '.' . substr($d, 5, 3) . ' ' . substr($d, 8, 4) . '-' . substr($d, 12, 2) : $c;
        };

        $allRazaoBases = (!empty($razao_bases) && is_array($razao_bases)) ? $razao_bases : ($razao_base ? [$razao_base] : []);
        $inputCnpjsRaw = (!empty($cnpjs) && is_array($cnpjs)) ? $cnpjs : ($cnpj ? [$cnpj] : []);
        $recipientList = $parseEmails($email_to);

        $allCnpjs = [];
        if (!empty($allRazaoBases)) {
            $ph = implode(',', array_fill(0, count($allRazaoBases), '?'));
            $cnpjRows = finQuery("SELECT DISTINCT REPLACE(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-',''),' ','') AS cnpj FROM dados_dachser.v_fin_regua_contas_receber WHERE SUBSTRING_INDEX(razao_social, ' - ', 1) IN ($ph)", $allRazaoBases);
            if (!empty($cnpjRows)) {
                foreach ($cnpjRows as $r) {
                    if (!empty($r['cnpj']))
                        $allCnpjs[] = strval($r['cnpj']);
                }
            }
        } else {
            foreach ($inputCnpjsRaw as $c) {
                $d = preg_replace('/\D/', '', strval($c));
                if ($d)
                    $allCnpjs[] = $d;
            }
            $allCnpjs = array_values(array_unique($allCnpjs));
        }

        if (empty($allCnpjs)) {
            sendJson(['success' => false, 'error' => 'Nenhum CNPJ encontrado para gerar o Aging List.']);
        }

        $ph = implode(',', array_fill(0, count($allCnpjs), '?'));
        $invoices = finQuery("
          SELECT t.documento, COALESCE(t.nd,'') AS nd, COALESCE(t.ref_cliente,'') AS referencia_cliente,
            COALESCE(NULLIF(t.numero_nf,''),'') AS numero_nf, COALESCE(t.modal,'') AS modal, t.tipo_documento,
            DATE_FORMAT(t.data_emissao,'%d/%m/%Y') AS data_emissao, DATE_FORMAT(t.data_vencimento,'%d/%m/%Y') AS data_vencimento,
            t.valor_nf, t.razao_social, t.cnpj,
            COALESCE(t.processo,'') AS numero_processo, COALESCE(t.house,'') AS house, COALESCE(t.master,'') AS master,
            'Em atraso' AS status_fatura, 'Financeiro' AS responsavel
          FROM dados_dachser.v_fin_regua_contas_receber t
          WHERE REPLACE(REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-',''),' ','') IN ($ph)
            AND DATEDIFF(CURDATE(), t.data_vencimento) >= 1
            AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
          ORDER BY t.cnpj, t.data_vencimento ASC
        ", $allCnpjs);

        if (empty($invoices)) {
            sendJson(['success' => false, 'error' => 'Nenhum título vencido encontrado para este cliente.']);
        }

        $invoicesByCnpj = [];
        foreach ($invoices as $inv) {
            $invoicesByCnpj[$inv['cnpj']][] = $inv;
        }

        $clienteName = $cliente ?: ($invoices[0]['razao_social'] ?? 'Cliente');
        $currentDate = date('d/m/Y');

        $sheets = [];
        foreach ($invoicesByCnpj as $cnpjKey => $cnpjInvoices) {
            $sheetName = substr($formatCnpjShort($cnpjKey), 0, 31);
            $rows = [];
            // Header 1
            $rows[] = ['DACHSER', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Valor total em atraso', ''];
            // Header 2
            $totalValue = array_reduce($cnpjInvoices, function ($s, $i) {
                return $s + (float) ($i['valor_nf'] ?? 0);
            }, 0.0);
            $rows[] = ['', '', '', $clienteName . ' - Demonstrativo de Faturamento', '', '', '', '', '', '', '', '', '', '', 'R$ ' . number_format($totalValue, 2, ',', '.'), ''];
            // Header 3
            $rows[] = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', $currentDate];
            // Header 4
            $rows[] = ['Período de Faturamento:', '01/01/2022 a 31/12/2027', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            // Header 5 (Headers)
            $rows[] = ["DOCUMENTO", "ND", "REF. CLIENTE", "NOTA FISC", "MODAL", "TIPO DOC", "EMISSÃO", "VENCTO", "C.N.P.J", "CLIENTE", "VALOR", "PROCESSO", "MASTER", "HOUSE", "STATUS", "RESPONSÁVEL"];

            // Data rows
            foreach ($cnpjInvoices as $inv) {
                $rows[] = [
                    $inv['documento'] ?? '',
                    $inv['nd'] ?? '',
                    $inv['referencia_cliente'] ?? '',
                    $inv['numero_nf'] ?? '',
                    $inv['modal'] ?? '',
                    $inv['tipo_documento'] ?? '',
                    $inv['data_emissao'] ?? '',
                    $inv['data_vencimento'] ?? '',
                    $formatCnpj($inv['cnpj'] ?? ''),
                    $inv['razao_social'] ?? '',
                    (float) ($inv['valor_nf'] ?? 0),
                    $inv['numero_processo'] ?? '',
                    $inv['master'] ?? '',
                    $inv['house'] ?? '',
                    $inv['status_fatura'] ?? 'Em atraso',
                    $inv['responsavel'] ?? 'Financeiro'
                ];
            }

            $sheets[$sheetName] = ['rows' => $rows];
        }

        $excelData = generateSimpleXlsx($sheets);
        $excelBuffer = base64_encode($excelData);
        $dateForFile = str_replace('/', '.', date('d/m/Y'));

        if ($custom_text && trim($custom_text)) {
            $htmlContent = nl2br(htmlspecialchars($custom_text));
            $htmlContent = preg_replace('/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/', '<a href="mailto:$1">$1</a>', $htmlContent);
            $emailBodyHtml = "<p>$htmlContent</p>";
        } else {
            $cnpjsLines = [];
            foreach ($allCnpjs as $c) {
                $cnpjsLines[] = '<strong>' . htmlspecialchars($formatCnpj($c)) . '</strong>';
            }
            $cnpjsList = implode('<br/>', $cnpjsLines);
            $emailBodyHtml = "<p>Boa tarde!<br/>Tudo bem?</p><p>Segue anexo, aging list para os CNPJ's:</p><p>$cnpjsList</p><p>Por gentileza, poderia verificar e nos retornar com a programação de pagamento para essa semana?</p><p>Agradecemos a sua atenção e colaboração.</p><p>Atenciosamente,<br/><strong>Financeiro Dachser</strong></p>";
        }
        $emailHtml = "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#333;\">$emailBodyHtml</div>";

        $attachments = [
            [
                'filename' => "Aging_" . $clienteName . "_" . $dateForFile . ".xlsx",
                'content' => $excelBuffer
            ]
        ];

        $res = sendEmailResend($recipientList, "Aging List - " . $clienteName, $emailHtml, '', $attachments);

        if ($res) {
            sendJson(['success' => true, 'message' => "Aging List enviada para " . count($recipientList) . " destinatário(s)", 'sent_to' => $recipientList]);
        } else {
            sendJson(['success' => false, 'error' => 'Falha ao enviar e-mail pelo Resend.'], 500);
        }
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── POST /api/fin/regua/send-emails ──────────────────────────────────────────
$router->post('fin/regua/send-emails', function ($params) {
    try {
        sendJson(['success' => true, 'sent' => 0, 'skipped' => 0, 'errors' => [], 'message' => 'Bulk send endpoint — implementação completa pendente']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── EXCEL HELPERS ────────────────────────────────────────────────────────────
function generateSimpleXlsx($sheets)
{
    $tempFile = tempnam(sys_get_temp_dir(), 'xlsx');
    $zip = new ZipArchive();
    if ($zip->open($tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new Exception("Não foi possível criar arquivo zip temporário");
    }

    $relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>';
    $zip->addFromString('_rels/.rels', $relsXml);

    $sheetsContentTypes = '';
    $sheetsRels = '';
    $sheetsWorkbook = '';

    $sheetIndex = 1;
    foreach ($sheets as $sName => $sData) {
        $sheetsContentTypes .= '<Override PartName="/xl/worksheets/sheet' . $sheetIndex . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        $sheetsRels .= '<Relationship Id="rId' . $sheetIndex . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $sheetIndex . '.xml"/>';
        $sheetsWorkbook .= '<sheet name="' . htmlspecialchars($sName, ENT_QUOTES, 'UTF-8') . '" sheetId="' . $sheetIndex . '" r:id="rId' . $sheetIndex . '"/>';

        $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>';

        $rowNumber = 1;
        foreach ($sData['rows'] as $row) {
            $sheetXml .= '<row r="' . $rowNumber . '">';
            $colIndex = 0;
            foreach ($row as $cellVal) {
                $ref = getCellRef($colIndex, $rowNumber);
                if ($cellVal === null || $cellVal === '') {
                    // Empty cell
                } else if (is_numeric($cellVal) && !is_string($cellVal)) {
                    $sheetXml .= '<c r="' . $ref . '"><v>' . $cellVal . '</v></c>';
                } else {
                    $sheetXml .= '<c r="' . $ref . '" t="inlineStr"><is><t>' . htmlspecialchars(strval($cellVal), ENT_QUOTES, 'UTF-8') . '</t></is></c>';
                }
                $colIndex++;
            }
            $sheetXml .= '</row>';
            $rowNumber++;
        }

        $sheetXml .= '  </sheetData>
</worksheet>';
        $zip->addFromString('xl/worksheets/sheet' . $sheetIndex . '.xml', $sheetXml);
        $sheetIndex++;
    }

    $contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ' . $sheetsContentTypes . '
</Types>';
    $zip->addFromString('[Content_Types].xml', $contentTypesXml);

    $workbookRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ' . $sheetsRels . '
</Relationships>';
    $zip->addFromString('xl/_rels/workbook.xml.rels', $workbookRelsXml);

    $workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ' . $sheetsWorkbook . '
  </sheets>
</workbook>';
    $zip->addFromString('xl/workbook.xml', $workbookXml);

    $zip->close();
    $data = file_get_contents($tempFile);
    unlink($tempFile);
    return $data;
}

function getCellRef($colIndex, $rowIndex)
{
    $letters = '';
    $temp = $colIndex;
    while ($temp >= 0) {
        $letters = chr(($temp % 26) + 65) . $letters;
        $temp = intval($temp / 26) - 1;
    }
    return $letters . $rowIndex;
}

