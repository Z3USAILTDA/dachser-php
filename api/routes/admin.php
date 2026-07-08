<?php
// api/routes/admin.php
// Rotas de administração: /api/admin/* e /api/system-logs

global $router;

// Helper para executar queries no pool financeiro
if (!function_exists('finQuery')) {
    function finQuery($sql, $params = []) {
        return queryWithRetry(getFinPDO(), $sql, $params);
    }
}

// GET /api/admin/sla-config
$router->get('admin/sla-config', function($params) {
    try {
        $slaConfigs = finQuery("SELECT * FROM dados_dachser.t_sla_config ORDER BY etapa ASC");
        sendJson(['success' => true, 'data' => $slaConfigs ?: []]);
    } catch (Exception $e) {
        error_log('[GET /api/admin/sla-config] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/admin/clear-opcache
$router->get('admin/clear-opcache', function($params) {
    try {
        if (function_exists('opcache_reset')) {
            if (opcache_reset()) {
                sendJson(['success' => true, 'message' => 'OPcache has been reset successfully!']);
            } else {
                sendJson(['success' => false, 'error' => 'Failed to reset OPcache.'], 500);
            }
        } else {
            sendJson(['success' => false, 'error' => 'opcache_reset function does not exist.'], 500);
        }
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/admin/sla-config/:id
$router->patch('admin/sla-config/:id', function($params) {
    try {
        $id = isset($params['id']) ? $params['id'] : null;
        $body = getRequestBody();
        $horasLimite = isset($body['horas_limite']) ? $body['horas_limite'] : null;
        $ativo = isset($body['ativo']) ? $body['ativo'] : null;

        if (!$id) {
            sendJson(['success' => false, 'error' => 'ID é obrigatório'], 400);
        }

        $clauses = [];
        $values = [];

        if ($horasLimite !== null) {
            $clauses[] = 'horas_limite = ?';
            $values[] = $horasLimite;
        }
        if ($ativo !== null) {
            $clauses[] = 'ativo = ?';
            $values[] = $ativo ? 1 : 0;
        }

        if (count($clauses) > 0) {
            $clauses[] = 'updated_at = NOW()';
            $values[] = $id;
            $sql = "UPDATE dados_dachser.t_sla_config SET " . implode(', ', $clauses) . " WHERE id = ?";
            finQuery($sql, $values);
        }

        sendJson(['success' => true]);
    } catch (Exception $e) {
        error_log('[PATCH /api/admin/sla-config/:id] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/admin/connections
$router->get('admin/connections', function($params) {
    try {
        $activityWindowMin = 20;
        $hiddenLogUsers = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];

        $conds = [
            "event_time >= (NOW() - INTERVAL ? MINUTE)",
            "username != 'unknown'",
            "username IS NOT NULL",
            "username != ''",
            "session_id IS NOT NULL"
        ];
        
        $placeholders = implode(', ', array_fill(0, count($hiddenLogUsers), '?'));
        $conds[] = "username NOT IN ($placeholders)";

        $sqlParams = array_merge([$activityWindowMin], $hiddenLogUsers);

        $sql = "SELECT
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
                 WHERE " . implode(' AND ', $conds) . "
                 GROUP BY session_id
                 ORDER BY last_activity_at DESC";

        $rows = finQuery($sql, $sqlParams);

        $connections = [];
        foreach (($rows ?: []) as $r) {
            $connections[] = [
                'sessionId' => $r['session_id'],
                'username' => $r['username'],
                'sessionStartedAt' => $r['session_started_at'],
                'lastActivityAt' => $r['last_activity_at'],
                'eventCount' => (int)$r['event_count'],
                'currentEndpoint' => preg_replace('/#dur=\d+$/', '', (string)$r['current_endpoint']),
            ];
        }

        $uniqueUsers = count(array_unique(array_column($connections, 'username')));

        sendJson([
            'success' => true,
            'activityWindowMin' => $activityWindowMin,
            'totalSessions' => count($connections),
            'uniqueUsers' => $uniqueUsers,
            'connections' => $connections,
            'serverNow' => date('c'),
        ]);
    } catch (Exception $e) {
        error_log('[GET /api/admin/connections] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/admin/metric-users
$router->get('admin/metric-users', function($params) {
    try {
        $hiddenLogUsers = ['admin', 'herbert.zacatei', 'laricell', 'teste.test3'];
        $placeholders = implode(', ', array_fill(0, count($hiddenLogUsers), '?'));
        
        $sql = "SELECT DISTINCT username FROM dados_dachser.t_usage_logs WHERE username != 'unknown' AND username NOT IN ($placeholders) ORDER BY username ASC";
        $rows = finQuery($sql, $hiddenLogUsers);

        $users = array_column($rows ?: [], 'username');
        sendJson(['success' => true, 'users' => $users]);
    } catch (Exception $e) {
        error_log('[GET /api/admin/metric-users] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/admin/database-stats
$router->get('admin/database-stats', function($params) {
    try {
        // No PHP executamos de forma sequencial
        $masterGeneral = queryWithRetry(getPDOFor('air'), "
            SELECT MAX(data_insert) as last_update, COUNT(*) as total_records,
              SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
            FROM dados_dachser.t_master_dados WHERE active = 1
        ");

        $masterByModal = queryWithRetry(getPDOFor('air'), "
            SELECT
              CASE WHEN tipo_processo IN ('AIR IMPORT','AIR EXPORT') THEN 'AIR'
                   WHEN tipo_processo IN ('SEA IMPORT','SEA EXPORT') THEN 'SEA' ELSE 'OTHER' END as modal,
              tipo_processo,
              MAX(data_insert) as last_update, COUNT(*) as total_records,
              SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts
            FROM dados_dachser.t_master_dados
            WHERE active = 1 AND tipo_processo IN ('AIR IMPORT','AIR EXPORT','SEA IMPORT','SEA EXPORT')
            GROUP BY modal, tipo_processo ORDER BY modal, tipo_processo
        ");

        $uniqueInsertsRows = queryWithRetry(getPDOFor('air'), "
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
        ");

        $finNfs = finQuery("SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.t_dados_financeiro_nfs");
        $finVoucher = finQuery("SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.t_dados_financeiro_voucher");
        $baixas = finQuery("SELECT MAX(data_insert) as last_update, COUNT(*) as total_records, SUM(CASE WHEN data_insert >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_inserts FROM dados_dachser.tbaixas");

        $uniqueMap = [];
        foreach (($uniqueInsertsRows ?: []) as $row) {
            $uniqueMap[$row['tipo_processo']] = (int)($row['unique_inserts'] ?? 0);
        }

        $airB = [
            'lastUpdate' => null, 'totalRecords' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0,
            'breakdown' => [
                'AIR IMPORT' => ['lastUpdate' => null, 'count' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0],
                'AIR EXPORT' => ['lastUpdate' => null, 'count' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0]
            ]
        ];

        $seaB = [
            'lastUpdate' => null, 'totalRecords' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0,
            'breakdown' => [
                'SEA IMPORT' => ['lastUpdate' => null, 'count' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0],
                'SEA EXPORT' => ['lastUpdate' => null, 'count' => 0, 'recentInserts' => 0, 'uniqueInserts' => 0]
            ]
        ];

        $airMax = null;
        $seaMax = null;

        foreach (($masterByModal ?: []) as $row) {
            $lu = $row['last_update'] ? date('c', strtotime($row['last_update'])) : null;
            $cnt = (int)$row['total_records'];
            $ri = (int)($row['recent_inserts'] ?? 0);
            $ui = isset($uniqueMap[$row['tipo_processo']]) ? $uniqueMap[$row['tipo_processo']] : 0;

            if ($row['modal'] === 'AIR') {
                $airB['totalRecords'] += $cnt;
                $airB['recentInserts'] += $ri;
                $airB['uniqueInserts'] += $ui;
                $airB['breakdown'][$row['tipo_processo']] = ['lastUpdate' => $lu, 'count' => $cnt, 'recentInserts' => $ri, 'uniqueInserts' => $ui];
                if ($row['last_update']) {
                    $d = strtotime($row['last_update']);
                    if (!$airMax || $d > $airMax) $airMax = $d;
                }
            } elseif ($row['modal'] === 'SEA') {
                $seaB['totalRecords'] += $cnt;
                $seaB['recentInserts'] += $ri;
                $seaB['uniqueInserts'] += $ui;
                $seaB['breakdown'][$row['tipo_processo']] = ['lastUpdate' => $lu, 'count' => $cnt, 'recentInserts' => $ri, 'uniqueInserts' => $ui];
                if ($row['last_update']) {
                    $d = strtotime($row['last_update']);
                    if (!$seaMax || $d > $seaMax) $seaMax = $d;
                }
            }
        }

        $airB['lastUpdate'] = $airMax ? date('c', $airMax) : null;
        $seaB['lastUpdate'] = $seaMax ? date('c', $seaMax) : null;

        sendJson([
            't_master_dados' => [
                'lastUpdate' => isset($masterGeneral[0]['last_update']) ? date('c', strtotime($masterGeneral[0]['last_update'])) : null,
                'totalRecords' => (int)($masterGeneral[0]['total_records'] ?? 0),
                'recentInserts' => (int)($masterGeneral[0]['recent_inserts'] ?? 0),
                'applications' => ['AIR', 'SEA', 'CCT', 'TRACKING', 'OLIMPO'],
                'byModal' => ['AIR' => $airB, 'SEA' => $seaB],
            ],
            't_dados_financeiro_nfs' => [
                'lastUpdate' => isset($finNfs[0]['last_update']) ? date('c', strtotime($finNfs[0]['last_update'])) : null,
                'totalRecords' => (int)($finNfs[0]['total_records'] ?? 0),
                'recentInserts' => (int)($finNfs[0]['recent_inserts'] ?? 0),
                'applications' => ['REGUA'],
            ],
            't_dados_financeiro_voucher' => [
                'lastUpdate' => isset($finVoucher[0]['last_update']) ? date('c', strtotime($finVoucher[0]['last_update'])) : null,
                'totalRecords' => (int)($finVoucher[0]['total_records'] ?? 0),
                'recentInserts' => (int)($finVoucher[0]['recent_inserts'] ?? 0),
                'applications' => ['ESTEIRA'],
            ],
            'tbaixas' => [
                'lastUpdate' => isset($baixas[0]['last_update']) ? date('c', strtotime($baixas[0]['last_update'])) : null,
                'totalRecords' => (int)($baixas[0]['total_records'] ?? 0),
                'recentInserts' => (int)($baixas[0]['recent_inserts'] ?? 0),
                'applications' => ['ESTEIRA'],
            ],
            'fetchedAt' => date('c'),
        ]);
    } catch (Exception $e) {
        error_log('[GET /api/admin/database-stats] ' . $e->getMessage());
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/admin/mapbox-token
$router->get('admin/mapbox-token', function($params) {
    $token = isset($_ENV['MAPBOX_PUBLIC_TOKEN']) ? $_ENV['MAPBOX_PUBLIC_TOKEN'] : (isset($_ENV['MAPBOX_TOKEN']) ? $_ENV['MAPBOX_TOKEN'] : null);
    if (!$token) {
        sendJson(['error' => 'Mapbox token not configured'], 404);
    }
    sendJson(['token' => $token]);
});

// GET /api/system-logs
$router->get('system-logs', function($params) {
    sendJson(['success' => true, 'data' => [], 'message' => 'System logs endpoint (stub — migrate from Supabase edge logs)']);
});

// POST /api/admin/test-api-key
$router->post('admin/test-api-key', function($params) {
    $start = microtime(true);
    $body = getRequestBody();
    $apiName = isset($body['apiName']) ? $body['apiName'] : null;
    $customKey = isset($body['customKey']) ? $body['customKey'] : null;

    if (!$apiName) {
        sendJson(['success' => false, 'error' => 'apiName é obrigatório', 'responseTimeMs' => 0], 400);
    }

    try {
        $result = ['success' => false, 'error' => 'Teste não implementado'];
        
        if ($apiName === 'gemini') {
            $key = $customKey ?: (isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null);
            if (!$key) {
                $result = ['success' => false, 'error' => 'GEMINI_API_KEY não configurada'];
            } else {
                $r = fetch("https://generativelanguage.googleapis.com/v1beta/models?key={$key}");
                $result = $r['ok'] ? ['success' => true, 'details' => 'Gemini API acessível'] : ['success' => false, 'error' => "HTTP {$r['status']}"];
            }
        } elseif ($apiName === 'anthropic') {
            $key = $customKey ?: (isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null);
            if (!$key) {
                $result = ['success' => false, 'error' => 'ANTHROPIC_API_KEY não configurada'];
            } else {
                $r = fetch('https://api.anthropic.com/v1/models', [
                    'headers' => [
                        'x-api-key' => $key,
                        'anthropic-version' => '2023-06-01'
                    ]
                ]);
                $result = $r['ok'] ? ['success' => true, 'details' => 'Anthropic API acessível'] : ['success' => false, 'error' => "HTTP {$r['status']}"];
            }
        } elseif ($apiName === 'resend') {
            $key = $customKey ?: (isset($_ENV['RESEND_API_KEY']) ? $_ENV['RESEND_API_KEY'] : null);
            if (!$key) {
                $result = ['success' => false, 'error' => 'RESEND_API_KEY não configurada'];
            } else {
                $r = fetch('https://api.resend.com/domains', [
                    'headers' => [
                        'Authorization' => "Bearer {$key}"
                    ]
                ]);
                $result = $r['ok'] ? ['success' => true, 'details' => 'Resend API acessível'] : ['success' => false, 'error' => "HTTP {$r['status']}"];
            }
        } elseif ($apiName === 'jsoncargo') {
            $key = $customKey ?: (isset($_ENV['JSONCARGO_API_KEY']) ? $_ENV['JSONCARGO_API_KEY'] : null);
            $result = $key ? ['success' => true, 'details' => 'Chave configurada'] : ['success' => false, 'error' => 'JSONCARGO_API_KEY não configurada'];
        } elseif ($apiName === 'hapag') {
            $clientId = isset($_ENV['HAPAG_CLIENT_ID']) ? $_ENV['HAPAG_CLIENT_ID'] : null;
            $apiKey = $customKey ?: (isset($_ENV['HAPAG_API_KEY']) ? $_ENV['HAPAG_API_KEY'] : null);
            $result = ($clientId && $apiKey) ? ['success' => true, 'details' => 'Credenciais configuradas'] : ['success' => false, 'error' => 'HAPAG_CLIENT_ID / HAPAG_API_KEY não configuradas'];
        }

        $duration = (int)round((microtime(true) - $start) * 1000);
        $result['responseTimeMs'] = $duration;
        sendJson($result);
    } catch (Exception $e) {
        $duration = (int)round((microtime(true) - $start) * 1000);
        sendJson(['success' => false, 'error' => $e->getMessage(), 'responseTimeMs' => $duration]);
    }
});

// POST /api/admin/bulk-insert-master
$router->post('admin/bulk-insert-master', function($params) {
    try {
        $body = getRequestBody();
        $rows = isset($body['rows']) ? $body['rows'] : null;
        $modal = isset($body['modal']) ? $body['modal'] : null;

        if (!$rows || !is_array($rows) || count($rows) === 0) {
            sendJson(['success' => false, 'error' => 'Nenhuma linha para inserir'], 400);
        }
        if (!$modal || !in_array($modal, ['AIR', 'SEA'])) {
            sendJson(['success' => false, 'error' => 'Modal deve ser AIR ou SEA'], 400);
        }

        $tableName = ($modal === 'AIR') ? 'dados_dachser.t_air_master' : 'dados_dachser.t_sea_master';
        $db = getPDOFor('sea');

        // Cria índice único se necessário (silenciosamente)
        try {
            if ($modal === 'AIR') {
                $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hawb ON dados_dachser.t_air_master (master(100), hawb(100))");
            } else {
                $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_master_hbl ON dados_dachser.t_sea_master (master(100), hbl(100))");
            }
        } catch (Exception $e) {}

        $inserted = 0;
        $updated = 0;
        $errors = [];

        foreach ($rows as $i => $row) {
            try {
                if ($modal === 'SEA') {
                    $sql = "INSERT INTO $tableName (
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
                      dn_available=COALESCE(VALUES(dn_available),dn_available)";
                    
                    $paramsVal = [
                      isset($row['nome_analista']) ? $row['nome_analista'] : null,
                      isset($row['customer_no']) ? $row['customer_no'] : null,
                      isset($row['po']) ? $row['po'] : null,
                      isset($row['hbl']) ? $row['hbl'] : null,
                      isset($row['hawb']) ? $row['hawb'] : null,
                      isset($row['master']) ? $row['master'] : null,
                      isset($row['etd']) ? $row['etd'] : null,
                      isset($row['pre_alert_sent']) ? $row['pre_alert_sent'] : null,
                      isset($row['oea_cl_doc']) ? $row['oea_cl_doc'] : null,
                      isset($row['customer_order']) ? $row['customer_order'] : null,
                      isset($row['accrual']) ? $row['accrual'] : null,
                      isset($row['dep']) ? $row['dep'] : null,
                      isset($row['eta_ata']) ? $row['eta_ata'] : null,
                      isset($row['email_title']) ? $row['email_title'] : null,
                      isset($row['te']) ? $row['te'] : null,
                      isset($row['at_field']) ? $row['at_field'] : null,
                      isset($row['wh_treatment']) ? $row['wh_treatment'] : null,
                      isset($row['cct_transm']) ? $row['cct_transm'] : null,
                      isset($row['remarks']) ? $row['remarks'] : null,
                      isset($row['tipo_processo']) ? $row['tipo_processo'] : null,
                      isset($row['data_insert']) ? $row['data_insert'] : null,
                      isset($row['deadline_draft_vgm']) ? $row['deadline_draft_vgm'] : null,
                      isset($row['drafts_sent']) ? $row['drafts_sent'] : null,
                      isset($row['deadline_load']) ? $row['deadline_load'] : null,
                      isset($row['cargo_departed']) ? $row['cargo_departed'] : null,
                      isset($row['d_term']) ? $row['d_term'] : null,
                      isset($row['pod_available']) ? $row['pod_available'] : null,
                      isset($row['dn_available']) ? $row['dn_available'] : null,
                    ];
                } else {
                    $sql = "INSERT INTO $tableName (
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
                      email_title=COALESCE(VALUES(email_title),email_title)";
                    
                    $paramsVal = [
                      isset($row['nome_analista']) ? $row['nome_analista'] : null,
                      isset($row['customer_no']) ? $row['customer_no'] : null,
                      isset($row['po']) ? $row['po'] : null,
                      isset($row['hawb']) ? $row['hawb'] : null,
                      isset($row['master']) ? $row['master'] : null,
                      isset($row['etd']) ? $row['etd'] : null,
                      isset($row['pre_alert_sent']) ? $row['pre_alert_sent'] : null,
                      isset($row['oea_cl_doc']) ? $row['oea_cl_doc'] : null,
                      isset($row['cargo_departed']) ? $row['cargo_departed'] : null,
                      isset($row['d_term']) ? $row['d_term'] : null,
                      isset($row['pod_dn_available']) ? $row['pod_dn_available'] : null,
                      isset($row['remarks']) ? $row['remarks'] : null,
                      isset($row['tipo_processo']) ? $row['tipo_processo'] : null,
                      isset($row['data_insert']) ? $row['data_insert'] : null,
                      isset($row['wh_treatment']) ? $row['wh_treatment'] : null,
                      isset($row['cct_transm']) ? $row['cct_transm'] : null,
                      isset($row['eta_ata']) ? $row['eta_ata'] : null,
                      isset($row['email_title']) ? $row['email_title'] : null,
                    ];
                }

                $stmt = $db->prepare($sql);
                $stmt->execute($paramsVal);
                $aff = $stmt->rowCount();

                if ($aff === 1) $inserted++;
                elseif ($aff === 2) $updated++;
                else $inserted++; // Se insert ignore ou similar
            } catch (Exception $err) {
                $errors[] = ['index' => $i, 'message' => $err->getMessage()];
            }
        }

        sendJson(['success' => true, 'inserted' => $inserted, 'updated' => $updated, 'rejected' => count($errors), 'errors' => $errors]);
    } catch (Exception $e) {
        error_log('[POST /api/admin/bulk-insert-master] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/admin/bulk-insert-clientes
$router->post('admin/bulk-insert-clientes', function($params) {
    try {
        $body = getRequestBody();
        $rows = isset($body['rows']) ? $body['rows'] : null;

        if (!$rows || !is_array($rows) || count($rows) === 0) {
            sendJson(['success' => false, 'error' => 'Nenhuma linha para inserir'], 400);
        }

        $db = getPDOFor('sea');
        $inserted = 0;
        $errors = [];

        $stmt = $db->prepare("
            INSERT INTO dados_dachser.t_clientes_base (
              ativo, classificacao, cod_rm, dchr_customer_number, cnpj,
              nome_cliente, cidade_uf, pais, logradouro, cep, info_complementar
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ");

        foreach ($rows as $i => $row) {
            try {
                $stmt->execute([
                    isset($row['ativo']) ? $row['ativo'] : 1,
                    isset($row['classificacao']) ? $row['classificacao'] : null,
                    isset($row['cod_rm']) ? $row['cod_rm'] : null,
                    isset($row['dchr_customer_number']) ? $row['dchr_customer_number'] : null,
                    isset($row['cnpj']) ? $row['cnpj'] : null,
                    isset($row['nome_cliente']) ? $row['nome_cliente'] : null,
                    isset($row['cidade_uf']) ? $row['cidade_uf'] : null,
                    isset($row['pais']) ? $row['pais'] : null,
                    isset($row['logradouro']) ? $row['logradouro'] : null,
                    isset($row['cep']) ? $row['cep'] : null,
                    isset($row['info_complementar']) ? $row['info_complementar'] : null,
                ]);
                $inserted++;
            } catch (Exception $err) {
                $errors[] = ['index' => $i, 'message' => $err->getMessage()];
            }
        }

        sendJson(['success' => true, 'inserted' => $inserted, 'rejected' => count($errors), 'errors' => $errors]);
    } catch (Exception $e) {
        error_log('[POST /api/admin/bulk-insert-clientes] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});
