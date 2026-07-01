<?php
// api/routes/demurrage.php
// Rotas de demurrage: /api/demurrage/*

global $router;

if (!function_exists('finQuery')) {
    function finQuery($sql, $params = []) {
        return queryWithRetry(getFinPDO(), $sql, $params);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function demurrageFormatDateBR($value) {
    if (!$value) return '-';
    try {
        $date = new DateTime(is_object($value) ? $value->format('Y-m-d') : (string)$value);
        return $date->format('d/m/Y');
    } catch (Exception $e) {
        return (string)$value;
    }
}

function demurrageEscapeHtml($value) {
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function buildDemurrageAlertHtml($payload) {
    $containers = is_array($payload['containers'] ?? null) ? $payload['containers'] : [];
    $rows = '';
    foreach ($containers as $c) {
        $totalUsd = number_format((float)($c['total_usd'] ?? 0), 2, '.', ',');
        $rows .= "<tr>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;\">" . demurrageEscapeHtml($c['number'] ?? $c['container_number'] ?? '-') . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageEscapeHtml($c['type'] ?? $c['size'] ?? '-') . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageFormatDateBR($c['discharge_date'] ?? null) . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageFormatDateBR($c['return_deadline'] ?? null) . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageFormatDateBR($c['return_date'] ?? null) . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageEscapeHtml($c['free_time_days'] ?? '-') . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:center;\">" . demurrageEscapeHtml($c['days_incident'] ?? $c['days_possession'] ?? '-') . "</td>
            <td style=\"padding:6px 8px;border:1px solid #d1d5db;text-align:right;\">USD $totalUsd</td>
        </tr>";
    }
    $totalSum = array_reduce($containers, function($carry, $c) { return $carry + (float)($c['total_usd'] ?? 0); }, 0);
    $totalUsd = number_format((float)($payload['total_usd'] ?? $totalSum), 2, '.', ',');
    $testBanner = !empty($payload['test_mode']) ? '<div style="background:#facc15;color:#111827;text-align:center;padding:10px;font-weight:700;margin-bottom:18px;">E-MAIL DE TESTE - NAO ENCAMINHAR</div>' : '';
    $tableHtml = count($containers) > 0 ? "
        <table style=\"border-collapse:collapse;margin:16px 0;font-size:12px;width:100%;\">
            <thead><tr style=\"background:#003369;color:#ffffff;\">
                <th style=\"padding:8px;border:1px solid #003369;text-align:left;\">Container</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">Tipo</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">ATA</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">Limite</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">Devolucao</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">Free Time</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:center;\">Dias excedidos</th>
                <th style=\"padding:8px;border:1px solid #003369;text-align:right;\">Valor</th>
            </tr></thead><tbody>$rows</tbody>
        </table>" : '';
    return "<!doctype html>
<html><body style=\"margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#1f2937;font-size:14px;line-height:1.55;\">
  $testBanner
  <p>Prezados(as),</p>
  <p>Identificamos custos de D&amp;D - Sobreestadia de Contêineres referentes ao(s) embarque(s) mencionado(s) abaixo:</p>
  <table style=\"border-collapse:collapse;margin:14px 0;font-size:13px;\">
    <tr><td style=\"padding:4px 14px 4px 0;font-weight:700;\">Cliente:</td><td>" . demurrageEscapeHtml($payload['client_name'] ?? 'N/A') . "</td></tr>
    <tr><td style=\"padding:4px 14px 4px 0;font-weight:700;\">House BL:</td><td>" . demurrageEscapeHtml($payload['house_bl'] ?? 'N/A') . "</td></tr>
    <tr><td style=\"padding:4px 14px 4px 0;font-weight:700;\">MBL:</td><td>" . demurrageEscapeHtml($payload['shipment_master'] ?? 'N/A') . "</td></tr>
    <tr><td style=\"padding:4px 14px 4px 0;font-weight:700;\">Total USD:</td><td>USD $totalUsd</td></tr>
  </table>
  $tableHtml
  <p>Caso haja alguma divergência, solicitamos que seja sinalizada com a devida evidência no prazo de 48 horas a contar desta data.</p>
  <p>Após este período, os custos serão considerados válidos e será emitida Nota de Débito para pagamento.</p>
  <p>Atenciosamente,<br/>Time Demurrage &amp; Detention<br/>Air &amp; Sea Logistics Brazil</p>
</body></html>";
}

function dmFmtDate($d) {
    if (!$d) return null;
    if (is_string($d)) return substr($d, 0, 10);
    try { return (is_object($d) ? $d : new DateTime($d))->format('Y-m-d'); } catch (Exception $e) { return null; }
}

function dmNormalizeCarrier($v) {
    if (!$v) return null;
    $c = strtoupper(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string)$v));
    if (strpos($c, 'HAPAG') !== false) return 'HAPAG-LLOYD';
    if (strpos($c, 'MEDITERRANEAN') !== false || preg_match('/\bMSC\b/', $c)) return 'MSC';
    if (strpos($c, 'CMA') !== false) return 'CMA-CGM';
    if (strpos($c, 'ZIM') !== false) return 'ZIM';
    if (strpos($c, 'MAERSK') !== false) return 'MAERSK';
    if (strpos($c, 'HMM') !== false || strpos($c, 'HYUNDAI') !== false) return 'HMM';
    if (strpos($c, 'OCEAN NETWORK') !== false || preg_match('/\bONE\b/', $c)) return 'ONE';
    if (strpos($c, 'COSCO') !== false) return 'COSCO';
    return strtoupper(trim((string)$v));
}

function dmMapCronosStatus($lastEvent, $statusArmador = null, $containerStatus = null) {
    $ev = strtolower((string)($lastEvent ?? ''));
    $st = strtolower((string)($statusArmador ?? ''));
    $cs = strtolower((string)($containerStatus ?? ''));
    if (str_contains($ev, 'return') || str_contains($ev, 'devol') || str_contains($st, 'return') || str_contains($cs, 'return') || str_contains($ev, 'empty') || str_contains($cs, 'empty')) return 'RETURNED';
    if (str_contains($ev, 'gate out') || str_contains($ev, 'gateout') || str_contains($ev, 'saída') || str_contains($ev, 'saida') || str_contains($st, 'gate out') || str_contains($cs, 'gate-out')) return 'GATE_OUT';
    if (str_contains($ev, 'arrived') || str_contains($ev, 'discharged') || str_contains($ev, 'atracado') || str_contains($ev, 'descarregado') || str_contains($ev, 'arrival') || str_contains($cs, 'discharged')) return 'ARRIVED';
    if (str_contains($ev, 'transit') || str_contains($ev, 'departed') || str_contains($ev, 'embarcado') || str_contains($ev, 'loaded') || str_contains($ev, 'sailing')) return 'IN_TRANSIT';
    return 'PENDING';
}

function dmInferTipoProcesso($t, $origem, $destino) {
    if ($t && trim($t)) return $t;
    $o = strtoupper((string)($origem ?? ''));
    $d = strtoupper((string)($destino ?? ''));
    $isBR = function($s) { return preg_match('/\bBR\b/', $s) || str_contains($s, 'BRAZIL') || str_contains($s, 'BRASIL') || preg_match('/\b(SANTOS|ITAJAI|ITAPOA|PARANAGUA|RIO GRANDE|MANAUS|SUAPE|SALVADOR|NAVEGANTES|PECEM|VITORIA|RIO DE JANEIRO|SAO FRANCISCO DO SUL)\b/', $s); };
    if ($isBR($d) && !$isBR($o)) return 'SEA IMPORT';
    if ($isBR($o) && !$isBR($d)) return 'SEA EXPORT';
    return 'SEA IMPORT';
}

function dmSendResendEmail($subject, $html, $recipientEmails) {
    $key = $_ENV['RESEND_API_KEY'] ?? null;
    $from = $_ENV['RESEND_FROM'] ?? 'Dachser <alerts@hermes.z3us.ai>';
    if (!$key) return ['sent' => 0, 'resendId' => null, 'skipped' => true];
    $res = fetch('https://api.resend.com/emails', [
        'method' => 'POST',
        'headers' => ['Authorization' => "Bearer $key", 'Content-Type' => 'application/json'],
        'body' => json_encode(['from' => $from, 'to' => $recipientEmails, 'subject' => $subject, 'html' => $html])
    ]);
    $data = $res['json']();
    if (isset($data['error'])) throw new Exception($data['error']['message'] ?? 'Falha ao enviar e-mail pelo Resend');
    return ['sent' => count($recipientEmails), 'resendId' => $data['data']['id'] ?? $data['id'] ?? null];
}

$ELIGIBLE_PREFIXES = ['HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU'];
$eligibleIn = "'" . implode("','", $ELIGIBLE_PREFIXES) . "'";

// ─── ROTAS ─────────────────────────────────────────────────────────────────

// GET /api/demurrage/containers
$router->get('demurrage/containers', function($params) use ($eligibleIn) {
    try {
        $where = [
            'dc.active = 1',
            "LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn)",
            "EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)",
        ];
        $qParams = [];
        $safeLimit = min(max((int)($_GET['limit'] ?? 500), 1), 1000);

        if (!empty($_GET['search'])) { $where[] = '(dc.numero LIKE ? OR dc.mbl LIKE ? OR dc.cliente LIKE ? OR dc.armador LIKE ?)'; $s = "%{$_GET['search']}%"; $qParams[] = $s; $qParams[] = $s; $qParams[] = $s; $qParams[] = $s; }
        if (!empty($_GET['risk_status']) && $_GET['risk_status'] !== 'all') { $where[] = 'dc.risk_status = ?'; $qParams[] = $_GET['risk_status']; }
        $csList = isset($_GET['cronos_status_list']) ? (array)$_GET['cronos_status_list'] : null;
        if ($csList && count($csList) > 0) { $where[] = 'dc.cronos_status IN (' . implode(',', array_fill(0, count($csList), '?')) . ')'; array_push($qParams, ...$csList); }
        elseif (!empty($_GET['cronos_status']) && $_GET['cronos_status'] !== 'all') { $where[] = 'dc.cronos_status = ?'; $qParams[] = $_GET['cronos_status']; }
        if (!empty($_GET['cliente'])) { $where[] = 'dc.cliente = ?'; $qParams[] = $_GET['cliente']; }
        if (!empty($_GET['armador'])) { $where[] = 'dc.armador = ?'; $qParams[] = $_GET['armador']; }
        if (!empty($_GET['pre_invoice_status']) && $_GET['pre_invoice_status'] !== 'all') { $where[] = 'dc.pre_invoice_status = ?'; $qParams[] = $_GET['pre_invoice_status']; }
        if (!empty($_GET['dispute_status']) && $_GET['dispute_status'] !== 'all') { $where[] = 'dc.dispute_status = ?'; $qParams[] = $_GET['dispute_status']; }
        if (!empty($_GET['audit_status']) && $_GET['audit_status'] !== 'all') { $where[] = 'dc.audit_status = ?'; $qParams[] = $_GET['audit_status']; }

        $containers = finQuery("SELECT dc.*, dc.bl AS hbl FROM dados_dachser.t_dachser_demurrage_containers dc WHERE " . implode(' AND ', $where) . " ORDER BY dc.updated_at DESC LIMIT ?", array_merge($qParams, [$safeLimit]));

        if ($containers && count($containers) > 0) {
            $clientes = array_unique(array_filter(array_column($containers, 'cliente')));
            $partnerMap = [];
            if (count($clientes) > 0) {
                try {
                    $rows = finQuery("SELECT nome_cliente, dchr_customer_number FROM dados_dachser.t_clientes_base WHERE nome_cliente IN (" . implode(',', array_fill(0, count($clientes), '?')) . ")", array_values($clientes));
                    foreach (($rows ?: []) as $r) $partnerMap[$r['nome_cliente']] = $r['dchr_customer_number'];
                } catch (Exception $e) {}
            }
            foreach ($containers as &$c) { $c['partner_id'] = $partnerMap[$c['cliente']] ?? null; }
        }
        sendJson(['success' => true, 'data' => $containers ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/containers/by-mbl
$router->get('demurrage/containers/by-mbl', function($params) use ($ELIGIBLE_PREFIXES) {
    try {
        $mbl = $_GET['mbl'] ?? null;
        $invoice_number = $_GET['invoice_number'] ?? null;
        if (!$mbl) sendJson(['success' => false, 'error' => 'MBL is required'], 400);

        $mblPrefix = strtoupper(substr(trim($mbl), 0, 4));
        if (!in_array($mblPrefix, $ELIGIBLE_PREFIXES)) { sendJson(['success' => true, 'data' => []]); }

        $mblContainers = finQuery("SELECT dc.* FROM dados_dachser.t_dachser_demurrage_containers dc WHERE TRIM(UPPER(dc.mbl)) = TRIM(UPPER(?)) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)", [$mbl]);

        if ((!$mblContainers || count($mblContainers) === 0) && $invoice_number) {
            $mblContainers = finQuery("SELECT dc.* FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.pre_invoice_number = ?", [$invoice_number]);
        }

        // Step 3: reconstruct from t_sea_tracking_current
        if (!$mblContainers || count($mblContainers) === 0) {
            try {
                $trackingRows = finQuery("SELECT t.id, t.mbl_id as mbl, t.container as numero, t.shipping_line as armador, t.consignee as cliente, t.tipo_processo, t.origem as porto_origem, t.destino as porto_destino, t.navio, t.vessel_imo, t.eta, t.last_event, t.container_status, t.email_analista, t.email_cliente FROM dados_dachser.t_sea_tracking_current t WHERE TRIM(UPPER(t.mbl_id)) = TRIM(UPPER(?)) AND t.container IS NOT NULL AND t.container != '' AND UPPER(t.container) != 'PENDENTE' AND UPPER(t.container) != 'NAO_ENCONTRADO' ORDER BY t.id DESC", [$mbl]);
                if ($trackingRows && count($trackingRows) > 0) {
                    $mblContainers = [];
                    foreach ($trackingRows as $row) {
                        $numero = trim($row['numero'] ?? '');
                        if (!$numero) continue;
                        $dischargeDate = null; $gateOutDate = null; $returnDate = null;
                        try {
                            $histRows = finQuery("SELECT event_type, MIN(event_datetime) as event_datetime FROM (SELECT 'discharge' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Discharged%' OR event_description = 'Discharge' OR event_description LIKE '%Unloaded from Vessel%' OR event_description LIKE '%Import Discharged%' OR event_description LIKE '%Descarga%') UNION ALL SELECT 'gate_out' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Gate out%' OR event_description LIKE '%Gate-out%' OR event_description = 'Import to consignee' OR event_description LIKE '%Saída%' OR event_description LIKE '%Saida%') UNION ALL SELECT 'return' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Empty%returned%' OR event_description LIKE '%Gate in%' OR event_description LIKE '%Devolução%' OR event_description LIKE '%Devolvido%' OR event_description LIKE '%Empty to shipper%')) AS events GROUP BY event_type", [$numero, $numero, $numero]);
                            foreach (($histRows ?: []) as $h) {
                                if (!$h['event_datetime']) continue;
                                $ds = dmFmtDate($h['event_datetime']);
                                if ($h['event_type'] === 'discharge') $dischargeDate = $ds;
                                elseif ($h['event_type'] === 'gate_out') $gateOutDate = $ds;
                                elseif ($h['event_type'] === 'return') $returnDate = $ds;
                            }
                        } catch (Exception $e) {}
                        $etaStr = dmFmtDate($row['eta'] ?? null);
                        $ftStartedAt = $dischargeDate ? "$dischargeDate 00:00:00" : ($etaStr ? "$etaStr 00:00:00" : null);
                        $mblContainers[] = ['id' => $row['id'], 'numero' => $numero, 'mbl' => trim($row['mbl'] ?? ''), 'booking' => null, 'cliente' => $row['cliente'] ?? null, 'armador' => $row['armador'] ?? null, 'tipo_processo' => $row['tipo_processo'] ?? null, 'porto_origem' => $row['porto_origem'] ?? null, 'porto_destino' => $row['porto_destino'] ?? null, 'navio' => $row['navio'] ?? null, 'vessel_imo' => $row['vessel_imo'] ?? null, 'voyage' => null, 'etd' => null, 'eta' => $etaStr, 'last_event' => $row['last_event'] ?? null, 'container_status' => $row['container_status'] ?? null, 'status_armador' => null, 'cronos_status' => null, 'email_analista' => $row['email_analista'] ?? null, 'email_cliente' => $row['email_cliente'] ?? null, 'tipo_conteiner' => null, 'ft_started_at' => $ftStartedAt, 'ft_source' => $dischargeDate ? 'HISTORICAL' : ($etaStr ? 'ETA' : null), 'data_atracacao' => $dischargeDate, 'data_gate_out' => $gateOutDate, 'data_devolucao' => $returnDate, 'mariadb_id' => $row['id'], 'active' => 1, 'partner_id' => null, 'hbl' => null, '_source' => 'tracking_fallback'];
                    }
                }
            } catch (Exception $e) {}
        }

        // Enrich partner_id and HBL
        if ($mblContainers && count($mblContainers) > 0) {
            $cliList = array_unique(array_filter(array_column($mblContainers, 'cliente')));
            $partnerMap = [];
            if (count($cliList) > 0) {
                try { $rows = finQuery("SELECT nome_cliente, dchr_customer_number FROM dados_dachser.t_clientes_base WHERE nome_cliente IN (" . implode(',', array_fill(0, count($cliList), '?')) . ")", array_values($cliList)); foreach (($rows ?: []) as $r) $partnerMap[$r['nome_cliente']] = $r['dchr_customer_number']; } catch (Exception $e) {}
            }
            $hbl = null;
            try {
                $smRows = finQuery("SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1", [$mbl]);
                if (!empty($smRows[0]['hawb'])) $hbl = $smRows[0]['hawb'];
                else { $mdRows = finQuery("SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1", [$mbl]); if (!empty($mdRows[0]['hawb'])) $hbl = $mdRows[0]['hawb']; }
            } catch (Exception $e) {}
            foreach ($mblContainers as &$c) { if (!($c['partner_id'] ?? null)) $c['partner_id'] = $partnerMap[$c['cliente']] ?? null; if (!($c['hbl'] ?? null)) $c['hbl'] = $hbl; }
        }
        sendJson(['success' => true, 'data' => $mblContainers ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/stats
$router->get('demurrage/stats', function($params) use ($eligibleIn) {
    try {
        $rows = finQuery("SELECT COUNT(*) as total, SUM(CASE WHEN cronos_status IN ('IN_TRANSIT', 'ARRIVED', 'PENDING') THEN 1 ELSE 0 END) as in_transit, SUM(CASE WHEN risk_status IN ('at_risk', 'critical', 'exceeded') THEN 1 ELSE 0 END) as at_risk, SUM(CASE WHEN cronos_status IN ('GATE_OUT', 'RETURNED') THEN 1 ELSE 0 END) as delivered, COALESCE(SUM(expected_cost_usd), 0) as total_demurrage_usd FROM dados_dachser.t_dachser_demurrage_containers dc WHERE active = 1 AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)");
        $row = $rows[0] ?? [];
        sendJson(['success' => true, 'data' => ['total' => (int)($row['total'] ?? 0), 'inTransit' => (int)($row['in_transit'] ?? 0), 'atRisk' => (int)($row['at_risk'] ?? 0), 'delivered' => (int)($row['delivered'] ?? 0), 'totalDemurrageUsd' => (float)($row['total_demurrage_usd'] ?? 0)]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/containers/:id
$router->patch('demurrage/containers/:id', function($params) {
    try {
        $body = getRequestBody();
        $updates = $body['updates'] ?? $body;
        if (!$params['id'] || !$updates) sendJson(['error' => 'id e updates são obrigatórios'], 400);
        $allowedFields = ['notes','pre_invoice_number','pre_invoice_status','pre_invoice_total_usd','disputed_amount_usd','recovered_amount_usd','dispute_status','dispute_reason','armador_invoice_number','armador_cost_usd','armador_days_charged','audit_status','discrepancy_usd','client_auto_alert','client_alert_days_before','client_report_frequency','ft_started_at','data_devolucao','free_time_days'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) { if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; $values[] = $value; } }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET " . implode(', ', $setClauses) . " WHERE id = ?", array_merge($values, [$params['id']]));
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/rates
$router->get('demurrage/rates', function($params) {
    try { sendJson(['success' => true, 'data' => finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_rates WHERE active = 1 ORDER BY created_at DESC, armador ASC, container_type ASC") ?: []]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/rates
$router->post('demurrage/rates', function($params) {
    try {
        $body = getRequestBody();
        if (empty($body['armador']) || empty($body['container_type']) || !isset($body['rate_usd'])) sendJson(['error' => 'armador, container_type e rate_usd são obrigatórios'], 400);
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_rates (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", [$body['armador'], $body['container_type'], $body['free_time_days'] ?? 14, $body['rate_usd'], $body['period_type'] ?? 'standard', $body['period_start_day'] ?? null, $body['period_end_day'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/rates/:id
$router->patch('demurrage/rates/:id', function($params) {
    try {
        $body = getRequestBody();
        $updates = $body['updates'] ?? $body;
        if (!$params['id']) sendJson(['error' => 'rate_id é obrigatório'], 400);
        $allowedFields = ['armador','container_type','free_time_days','rate_usd','period_type','period_start_day','period_end_day','active'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) { if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; $values[] = $value; } }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_rates SET " . implode(', ', $setClauses) . " WHERE id = ?", array_merge($values, [$params['id']]));
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// DELETE /api/demurrage/rates/:id
$router->delete('demurrage/rates/:id', function($params) {
    try {
        if (!$params['id']) sendJson(['error' => 'rate_id é obrigatório'], 400);
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_rates SET active = 0, updated_at = NOW() WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/rates/bulk
$router->post('demurrage/rates/bulk', function($params) {
    try {
        $body = getRequestBody();
        $rates = $body['rates'] ?? [];
        if (!$rates || count($rates) === 0) sendJson(['error' => 'rates array é obrigatório'], 400);
        $inserted = 0;
        foreach ($rates as $rate) {
            try { finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_rates (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day) VALUES (?, ?, ?, ?, ?, ?, ?)", [$rate['armador'], $rate['container_type'], $rate['free_time_days'], $rate['rate_usd'], $rate['period_type'] ?? 'STANDARD', $rate['period_start_day'] ?? null, $rate['period_end_day'] ?? null]); $inserted++; }
            catch (Exception $e) {}
        }
        sendJson(['success' => true, 'inserted' => $inserted, 'total' => count($rates)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/containers/:id/events
$router->get('demurrage/containers/:id/events', function($params) {
    try {
        $id = $params['id'];
        $limit = (int)($_GET['limit'] ?? 50);
        $containerNumber = null;
        if (ctype_digit((string)$id)) {
            $cr = finQuery('SELECT numero FROM dados_dachser.t_dachser_demurrage_containers WHERE id = ? LIMIT 1', [$id]);
            $containerNumber = $cr[0]['numero'] ?? null;
        } else { $containerNumber = $id; }
        if (!$containerNumber) { sendJson(['success' => true, 'data' => []]); }
        $rows = finQuery("SELECT id, mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, container_status, eta, source, created_at FROM dados_dachser.t_sea_tracking_history WHERE container = ? ORDER BY event_datetime DESC, created_at DESC LIMIT ?", [$containerNumber, $limit]);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/containers/:id/events
$router->post('demurrage/containers/:id/events', function($params) {
    try {
        $evtData = getRequestBody();
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_container_events (container_id, container_number, event_type, event_code, event_description, event_datetime, location, vessel_name, voyage_number, terminal, source, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [$params['id'], $evtData['container_number'] ?? null, $evtData['event_type'] ?? null, $evtData['event_code'] ?? null, $evtData['event_description'] ?? null, $evtData['event_datetime'] ?? null, $evtData['location'] ?? null, $evtData['vessel_name'] ?? null, $evtData['voyage_number'] ?? null, $evtData['terminal'] ?? null, $evtData['source'] ?? 'MANUAL', isset($evtData['raw_data']) ? json_encode($evtData['raw_data']) : null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/settings
$router->get('demurrage/settings', function($params) {
    try {
        $rows = finQuery("SELECT setting_key, setting_value, description FROM dados_dachser.t_dachser_demurrage_settings");
        $map = [];
        foreach (($rows ?: []) as $s) $map[$s['setting_key']] = $s['setting_value'];
        sendJson(['success' => true, 'data' => $map]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/settings/:key
$router->patch('demurrage/settings/:key', function($params) {
    try {
        $body = getRequestBody();
        $key = $params['key'];
        $value = $body['value'] ?? null;
        if (!$key || $value === null) sendJson(['error' => 'key e value são obrigatórios'], 400);
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()", [$key, $value, $value]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/clients
$router->get('demurrage/clients', function($params) use ($eligibleIn) {
    try { sendJson(['success' => true, 'data' => finQuery("SELECT DISTINCT cliente, COUNT(*) as total_containers, SUM(expected_cost_usd) as total_demurrage FROM dados_dachser.t_dachser_demurrage_containers dc WHERE active = 1 AND cliente IS NOT NULL AND cliente != '' AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci) GROUP BY cliente ORDER BY cliente ASC") ?: []]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/armadores
$router->get('demurrage/armadores', function($params) use ($eligibleIn) {
    try { sendJson(['success' => true, 'data' => finQuery("SELECT DISTINCT armador, COUNT(*) as total_containers FROM dados_dachser.t_dachser_demurrage_containers dc WHERE active = 1 AND armador IS NOT NULL AND armador != '' AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci) GROUP BY armador ORDER BY armador ASC") ?: []]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/client-profiles
$router->get('demurrage/client-profiles', function($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_client_profiles ORDER BY cliente ASC");
        $parsed = array_map(function($p) { $p['contact_emails'] = isset($p['contact_emails']) ? json_decode($p['contact_emails'], true) : []; return $p; }, $rows ?: []);
        sendJson(['success' => true, 'data' => $parsed]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/client-profiles
$router->post('demurrage/client-profiles', function($params) {
    try {
        $body = getRequestBody();
        if (empty($body['cliente'])) sendJson(['error' => 'cliente é obrigatório'], 400);
        $existing = finQuery("SELECT id FROM dados_dachser.t_dachser_demurrage_client_profiles WHERE cliente = ?", [$body['cliente']]);
        if ($existing && count($existing) > 0) sendJson(['error' => 'Perfil já existe para este cliente'], 400);
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_client_profiles (cliente, auto_alert_enabled, alert_days_before, report_frequency, contact_emails) VALUES (?, ?, ?, ?, ?)", [$body['cliente'], !empty($body['auto_alert_enabled']) ? 1 : 0, $body['alert_days_before'] ?? 3, $body['report_frequency'] ?? 'WEEKLY', json_encode($body['contact_emails'] ?? [])]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/client-profiles/:cliente
$router->patch('demurrage/client-profiles/:cliente', function($params) {
    try {
        $cliente = urldecode($params['cliente']);
        $body = getRequestBody();
        $updates = $body['updates'] ?? $body;
        if (!$cliente || !$updates) sendJson(['error' => 'cliente e updates são obrigatórios'], 400);
        $allowedFields = ['auto_alert_enabled','alert_days_before','report_frequency','contact_emails'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) {
            if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; if ($key === 'contact_emails') $values[] = json_encode($value); elseif ($key === 'auto_alert_enabled') $values[] = $value ? 1 : 0; else $values[] = $value; }
        }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_client_profiles SET " . implode(', ', $setClauses) . " WHERE cliente = ?", array_merge($values, [$cliente]));
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// DELETE /api/demurrage/client-profiles/:cliente
$router->delete('demurrage/client-profiles/:cliente', function($params) {
    try {
        $cliente = urldecode($params['cliente']);
        if (!$cliente) sendJson(['error' => 'cliente é obrigatório'], 400);
        finQuery("DELETE FROM dados_dachser.t_dachser_demurrage_client_profiles WHERE cliente = ?", [$cliente]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/pre-invoices
$router->get('demurrage/pre-invoices', function($params) use ($eligibleIn) {
    try {
        $where = ["LEFT(UPPER(TRIM(dados_dachser.t_dachser_demurrage_pre_invoices.shipment_mbl)),4) IN ($eligibleIn)", "EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dados_dachser.t_dachser_demurrage_pre_invoices.shipment_mbl)) COLLATE utf8mb4_unicode_ci)"];
        $qParams = [];
        $limit = (int)($_GET['limit'] ?? 100);
        if (!empty($_GET['status']) && $_GET['status'] !== 'all') { $where[] = 'status = ?'; $qParams[] = $_GET['status']; }
        if (!empty($_GET['workflow_status']) && $_GET['workflow_status'] !== 'all') { $where[] = 'workflow_status = ?'; $qParams[] = $_GET['workflow_status']; }
        if (!empty($_GET['client_name'])) { $where[] = 'client_name LIKE ?'; $qParams[] = "%{$_GET['client_name']}%"; }
        $preInvoices = finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoices WHERE " . implode(' AND ', $where) . " ORDER BY created_at DESC LIMIT ?", array_merge($qParams, [$limit]));
        sendJson(['success' => true, 'data' => $preInvoices ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/pre-invoices
$router->post('demurrage/pre-invoices', function($params) {
    try {
        $d = getRequestBody();
        if (empty($d['invoice_number'])) sendJson(['error' => 'invoice_number é obrigatório'], 400);
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoices (invoice_number, shipment_mbl, client_name, bl_number, vessel_name, voyage_number, origin_port, destination_port, arrival_date, issue_date, due_date, total_usd, total_brl, exchange_rate, status, workflow_status, financial_status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [$d['invoice_number'], $d['shipment_mbl'] ?? null, $d['client_name'] ?? null, $d['bl_number'] ?? null, $d['vessel_name'] ?? null, $d['voyage_number'] ?? null, $d['origin_port'] ?? null, $d['destination_port'] ?? null, $d['arrival_date'] ?? null, $d['issue_date'] ?? null, $d['due_date'] ?? null, $d['total_usd'] ?? 0, $d['total_brl'] ?? 0, $d['exchange_rate'] ?? 6.16, $d['status'] ?? 'pending', $d['workflow_status'] ?? 'calculated', $d['financial_status'] ?? 'PENDING', $d['notes'] ?? null, $d['created_by'] ?? null]);
        $pdo = getFinPDO(); sendJson(['success' => true, 'id' => $pdo->lastInsertId()]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/pre-invoices/:id
$router->patch('demurrage/pre-invoices/:id', function($params) {
    try {
        $body = getRequestBody();
        $updates = $body['updates'] ?? $body;
        if (!$params['id'] || !$updates) sendJson(['error' => 'id e updates são obrigatórios'], 400);
        $allowedFields = ['shipment_mbl','client_name','bl_number','vessel_name','voyage_number','origin_port','destination_port','arrival_date','issue_date','due_date','total_usd','total_brl','exchange_rate','status','workflow_status','financial_status','notes','posted_at','status_info','misk','observacao','othello_registro','alert_sent_at','contestacao_deadline'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) { if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; $values[] = $value; } }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_pre_invoices SET " . implode(', ', $setClauses) . " WHERE id = ?", array_merge($values, [$params['id']]));
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/pre-invoices/:id/items
$router->get('demurrage/pre-invoices/:id/items', function($params) {
    try {
        $rows = finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoice_items WHERE pre_invoice_id = ? ORDER BY container_number ASC", [$params['id']]);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/alerts
$router->get('demurrage/alerts', function($params) use ($eligibleIn) {
    try {
        $conditions = ["EXISTS (SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.id = dados_dachser.t_dachser_demurrage_alerts.container_id AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci))"];
        $qParams = [];
        if (!empty($_GET['container_id'])) { $conditions[] = 'container_id = ?'; $qParams[] = $_GET['container_id']; }
        if (!empty($_GET['status']) && $_GET['status'] !== 'all') { $conditions[] = 'status = ?'; $qParams[] = $_GET['status']; }
        $rows = finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_alerts WHERE " . implode(' AND ', $conditions) . " ORDER BY sent_at DESC LIMIT ?", array_merge($qParams, [(int)($_GET['limit'] ?? 100)]));
        $parsed = array_map(function($a) { $a['recipient_emails'] = isset($a['recipient_emails']) ? json_decode($a['recipient_emails'], true) : []; return $a; }, $rows ?: []);
        sendJson(['success' => true, 'data' => $parsed]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/alerts/:id/returned
$router->patch('demurrage/alerts/:id/returned', function($params) {
    try {
        $body = getRequestBody();
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_alerts SET client_returned = 1, client_returned_at = NOW(), client_returned_by = ? WHERE id = ?", [$body['user_name'] ?? 'sistema', $params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/disputes
$router->get('demurrage/disputes', function($params) use ($eligibleIn) {
    try {
        $conditions = ["EXISTS (SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.id = dados_dachser.t_dachser_demurrage_disputes.container_id AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ($eligibleIn) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci))"];
        $qParams = [];
        if (!empty($_GET['container_id'])) { $conditions[] = 'container_id = ?'; $qParams[] = $_GET['container_id']; }
        if (!empty($_GET['status']) && $_GET['status'] !== 'all') { $conditions[] = 'status = ?'; $qParams[] = $_GET['status']; }
        if (!empty($_GET['client_name'])) { $conditions[] = 'client_name LIKE ?'; $qParams[] = "%{$_GET['client_name']}%"; }
        $rows = finQuery("SELECT * FROM dados_dachser.t_dachser_demurrage_disputes WHERE " . implode(' AND ', $conditions) . " ORDER BY opened_at DESC LIMIT ?", array_merge($qParams, [(int)($_GET['limit'] ?? 100)]));
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/disputes
$router->post('demurrage/disputes', function($params) {
    try {
        $d = getRequestBody();
        if (empty($d['container_id'])) sendJson(['error' => 'container_id é obrigatório'], 400);
        finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_disputes (container_id, container_number, client_name, armador, status, disputed_amount_usd, reason, success_probability, opened_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [$d['container_id'], $d['container_number'] ?? null, $d['client_name'] ?? null, $d['armador'] ?? null, $d['status'] ?? 'opened', $d['disputed_amount_usd'] ?? 0, $d['reason'] ?? null, $d['success_probability'] ?? 50, $d['opened_by'] ?? null]);
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET dispute_status = 'opened', disputed_amount_usd = ?, updated_at = NOW() WHERE id = ?", [$d['disputed_amount_usd'] ?? 0, $d['container_id']]);
        $pdo = getFinPDO(); sendJson(['success' => true, 'id' => $pdo->lastInsertId()]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// PATCH /api/demurrage/disputes/:id
$router->patch('demurrage/disputes/:id', function($params) {
    try {
        $body = getRequestBody();
        $updates = $body['updates'] ?? $body;
        if (!$params['id'] || !$updates) sendJson(['error' => 'id e updates são obrigatórios'], 400);
        $allowedFields = ['status','disputed_amount_usd','recovered_amount_usd','reason','success_probability','resolution_notes','resolved_by','resolved_at'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) { if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; $values[] = $value; } }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_disputes SET " . implode(', ', $setClauses) . " WHERE id = ?", array_merge($values, [$params['id']]));
        if (in_array($updates['status'] ?? '', ['won', 'lost'])) {
            $dispInfo = finQuery('SELECT container_id FROM dados_dachser.t_dachser_demurrage_disputes WHERE id = ?', [$params['id']]);
            if (!empty($dispInfo[0])) { finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET dispute_status = ?, recovered_amount_usd = ?, updated_at = NOW() WHERE id = ?", [$updates['status'], $updates['recovered_amount_usd'] ?? 0, $dispInfo[0]['container_id']]); }
        }
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/containers/bulk-update
$router->post('demurrage/containers/bulk-update', function($params) {
    try {
        $body = getRequestBody();
        $containerIds = $body['container_ids'] ?? [];
        $updates = $body['updates'] ?? [];
        if (count($containerIds) === 0 || !$updates) sendJson(['error' => 'container_ids e updates são obrigatórios'], 400);
        $allowedFields = ['notes','pre_invoice_number','pre_invoice_status','pre_invoice_total_usd','disputed_amount_usd','recovered_amount_usd','dispute_status','dispute_reason','armador_invoice_number','armador_cost_usd','armador_days_charged','audit_status','discrepancy_usd','client_auto_alert','client_alert_days_before','client_report_frequency','ft_started_at','data_devolucao','free_time_days'];
        $setClauses = []; $values = [];
        foreach ($updates as $key => $value) { if (in_array($key, $allowedFields)) { $setClauses[] = "$key = ?"; $values[] = $value; } }
        if (count($setClauses) === 0) sendJson(['error' => 'Nenhum campo válido para atualizar'], 400);
        $setClauses[] = 'updated_at = NOW()';
        $placeholders = implode(', ', array_fill(0, count($containerIds), '?'));
        finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET " . implode(', ', $setClauses) . " WHERE id IN ($placeholders)", array_merge($values, $containerIds));
        sendJson(['success' => true, 'updated' => count($containerIds)]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/sync
$router->post('demurrage/sync', function($params) {
    try {
        $syncResults = ['total_records' => 0, 'created' => 0, 'updated' => 0, 'errors' => 0, 'error_details' => []];
        $sourceRows = finQuery("SELECT t.id, t.mbl_id, t.tipo_processo, t.container, t.shipping_line, t.consignee, t.origem, t.destino, t.navio, t.vessel_imo, t.eta, t.last_event, t.container_status, t.email_analista, t.email_cliente, t.active FROM dados_dachser.t_sea_tracking_current t WHERE t.active = 1 AND t.container IS NOT NULL AND t.container != '' AND UPPER(t.container) NOT IN ('PENDENTE', 'NAO_ENCONTRADO') AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NOT FOUND%') AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NAO_ENCONTRADO%') AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%PREFIX NOT FOUND%') AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%NOT FOUND%') ORDER BY t.id DESC LIMIT 2000");
        $syncResults['total_records'] = count($sourceRows ?? []);
        $hblCache = [];

        foreach (($sourceRows ?: []) as $row) {
            try {
                if (empty($row['mbl_id']) || empty($row['container'])) continue;
                $numero = trim($row['container']);
                $mbl = trim($row['mbl_id']);
                $cronosStatus = dmMapCronosStatus($row['last_event'], $row['container_status'], null);
                $eta = dmFmtDate($row['eta']);
                $armadorNorm = dmNormalizeCarrier($row['shipping_line']);
                $tipoProc = dmInferTipoProcesso($row['tipo_processo'], $row['origem'], $row['destino']);

                // HBL lookup
                $hbl = null;
                if (isset($hblCache[$mbl])) { $hbl = $hblCache[$mbl]; }
                else { try { $smRows = finQuery("SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1", [$mbl]); $hbl = !empty($smRows[0]['hawb']) ? $smRows[0]['hawb'] : null; if (!$hbl) { $mdRows = finQuery("SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1", [$mbl]); $hbl = !empty($mdRows[0]['hawb']) ? $mdRows[0]['hawb'] : null; } } catch (Exception $e) {} $hblCache[$mbl] = $hbl; }

                $existCheck = finQuery("SELECT id FROM dados_dachser.t_dachser_demurrage_containers WHERE UPPER(TRIM(numero)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(?)) COLLATE utf8mb4_unicode_ci AND UPPER(TRIM(mbl)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(?)) COLLATE utf8mb4_unicode_ci LIMIT 1", [$numero, $mbl]);

                if (!empty($existCheck[0])) {
                    finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET last_event = ?, container_status = ?, cronos_status = ?, eta = ?, armador = COALESCE(?, armador), last_sync_at = NOW(), mariadb_id = ?, updated_at = NOW() WHERE id = ?", [$row['last_event'], $row['container_status'], $cronosStatus, $eta, $armadorNorm, $row['id'], $existCheck[0]['id']]);
                    $syncResults['updated']++;
                } else {
                    finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_containers (numero, mbl, bl, booking, cliente, armador, tipo_processo, porto_origem, porto_destino, navio, vessel_imo, voyage, etd, eta, last_event, container_status, status_armador, cronos_status, email_analista, email_cliente, ft_started_at, ft_source, data_atracacao, data_gate_out, data_devolucao, mariadb_id, last_sync_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)", [$numero, $mbl, $hbl, null, $row['consignee'] ?? null, $armadorNorm, $tipoProc, $row['origem'] ?? null, $row['destino'] ?? null, $row['navio'] ?? null, $row['vessel_imo'] ?? null, null, null, $eta, $row['last_event'] ?? null, $row['container_status'] ?? null, null, $cronosStatus, $row['email_analista'] ?? null, $row['email_cliente'] ?? null, null, null, null, null, null, $row['id']]);
                    $syncResults['created']++;
                }
            } catch (Exception $rowErr) { $syncResults['errors']++; $syncResults['error_details'][] = "{$row['container']}: " . $rowErr->getMessage(); }
        }
        sendJson(['success' => true, 'results' => $syncResults]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/import-from-tracking
$router->post('demurrage/import-from-tracking', function($params) use ($ELIGIBLE_PREFIXES) {
    try {
        $body = getRequestBody();
        $preview = !empty($body['preview']);
        $placeholders = implode(',', array_fill(0, count($ELIGIBLE_PREFIXES), '?'));
        $sourceRows = finQuery("SELECT t.id, t.mbl_id, t.tipo_processo, t.container, t.shipping_line, t.consignee, t.origem, t.destino, t.navio, t.vessel_imo, t.eta, t.last_event, t.container_status, t.email_analista, t.email_cliente FROM dados_dachser.t_sea_tracking_current t WHERE t.active = 1 AND t.container IS NOT NULL AND t.container != '' AND UPPER(t.container) NOT IN ('PENDENTE', 'NAO_ENCONTRADO') AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NOT FOUND%') AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NAO_ENCONTRADO%') AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%PREFIX NOT FOUND%') AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%NOT FOUND%') AND LEFT(UPPER(TRIM(t.mbl_id)), 4) IN ($placeholders) AND NOT EXISTS (SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc WHERE UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(t.container)) COLLATE utf8mb4_unicode_ci AND UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(t.mbl_id)) COLLATE utf8mb4_unicode_ci AND dc.active = 1) ORDER BY t.id DESC LIMIT 500", $ELIGIBLE_PREFIXES);

        if ($preview) {
            sendJson(['success' => true, 'preview' => true, 'total' => count($sourceRows ?? []), 'items' => array_map(function($r) { return ['container' => $r['container'], 'mbl' => $r['mbl_id'], 'shipping_line' => $r['shipping_line'], 'consignee' => $r['consignee'], 'eta' => dmFmtDate($r['eta']), 'container_status' => $r['container_status'], 'last_event' => $r['last_event']]; }, $sourceRows ?: [])]);
        }

        $results = ['total' => count($sourceRows ?? []), 'created' => 0, 'errors' => 0, 'error_details' => []];
        $hblCache = [];
        foreach (($sourceRows ?: []) as $row) {
            try {
                if (empty($row['mbl_id']) || empty($row['container'])) continue;
                $numero = trim($row['container']); $mbl = trim($row['mbl_id']);
                $cronosStatus = dmMapCronosStatus($row['last_event'], null, $row['container_status']);
                $eta = dmFmtDate($row['eta']); $armadorNorm = dmNormalizeCarrier($row['shipping_line']); $tipoProc = dmInferTipoProcesso($row['tipo_processo'], $row['origem'], $row['destino']);
                $hbl = null;
                if (isset($hblCache[$mbl])) $hbl = $hblCache[$mbl];
                else { try { $sm = finQuery("SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1", [$mbl]); $hbl = !empty($sm[0]['hawb']) ? $sm[0]['hawb'] : null; if (!$hbl) { $md = finQuery("SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1", [$mbl]); $hbl = !empty($md[0]['hawb']) ? $md[0]['hawb'] : null; } } catch (Exception $e) {} $hblCache[$mbl] = $hbl; }
                finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_containers (numero, mbl, bl, booking, cliente, armador, tipo_processo, porto_origem, porto_destino, navio, vessel_imo, voyage, etd, eta, last_event, container_status, status_armador, cronos_status, email_analista, email_cliente, ft_started_at, ft_source, data_atracacao, data_gate_out, data_devolucao, mariadb_id, last_sync_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)", [$numero, $mbl, $hbl, null, $row['consignee'] ?? null, $armadorNorm, $tipoProc, $row['origem'] ?? null, $row['destino'] ?? null, $row['navio'] ?? null, $row['vessel_imo'] ?? null, null, null, $eta, $row['last_event'] ?? null, $row['container_status'] ?? null, null, $cronosStatus, $row['email_analista'] ?? null, $row['email_cliente'] ?? null, null, null, null, null, null, $row['id']]);
                $results['created']++;
            } catch (Exception $rowErr) { $results['errors']++; $results['error_details'][] = "{$row['container']}: " . $rowErr->getMessage(); }
        }
        sendJson(['success' => true, 'results' => $results]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/search-clientes
$router->get('demurrage/search-clientes', function($params) {
    try {
        $search = $_GET['search'] ?? '';
        if (!$search || strlen($search) < 2) { sendJson(['success' => true, 'data' => []]); }
        $rows = finQuery("SELECT DISTINCT nome_cliente, dchr_customer_number, cnpj FROM dados_dachser.t_clientes_base WHERE nome_cliente LIKE ? ORDER BY nome_cliente ASC LIMIT 15", ["%$search%"]);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/recalc
$router->post('demurrage/recalc', function($params) {
    try {
        $settingsRows = finQuery("SELECT setting_key, setting_value FROM dados_dachser.t_dachser_demurrage_settings");
        $settings = [];
        foreach (($settingsRows ?: []) as $row) $settings[$row['setting_key']] = $row['setting_value'];
        $defaultFreeTime = (int)($settings['default_free_time'] ?? 14);
        $defaultRate = (float)($settings['default_rate'] ?? 150);

        $rates = finQuery("SELECT armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day FROM dados_dachser.t_dachser_demurrage_rates WHERE active = 1 ORDER BY armador ASC, period_start_day ASC NULLS LAST");
        $containers = finQuery("SELECT id, numero, mbl, armador, tipo_conteiner, ft_started_at, free_time_days, data_devolucao FROM dados_dachser.t_dachser_demurrage_containers WHERE active = 1");

        $updated = 0; $errors = [];
        foreach (($containers ?: []) as $c) {
            try {
                $ftStart = $c['ft_started_at'] ? strtotime($c['ft_started_at']) : null;
                if (!$ftStart) continue;
                $returnDate = $c['data_devolucao'] ? strtotime($c['data_devolucao']) : time();
                $elapsed = max(0, (int)round(($returnDate - $ftStart) / 86400));
                $ftDays = $c['free_time_days'] ?: $defaultFreeTime;
                $daysIncident = max(0, $elapsed - $ftDays);
                $armador = strtoupper(trim($c['armador'] ?? ''));
                $containerType = strtoupper(trim($c['tipo_conteiner'] ?? 'DRY'));

                $applicableRates = array_filter($rates ?: [], function($r) use ($armador, $containerType) {
                    return strtoupper($r['armador']) === $armador && (strtoupper($r['container_type']) === $containerType || $r['container_type'] === '*');
                });

                $totalCost = 0;
                if (count($applicableRates) === 0) {
                    $totalCost = $daysIncident * $defaultRate;
                } else {
                    foreach (array_values($applicableRates) as $rate) {
                        $startDay = (int)($rate['period_start_day'] ?? 1);
                        $endDay = $rate['period_end_day'] ? (int)$rate['period_end_day'] : PHP_INT_MAX;
                        $daysInPeriod = max(0, min($daysIncident, $endDay) - max(0, $startDay - 1));
                        $totalCost += $daysInPeriod * (float)$rate['rate_usd'];
                    }
                }

                $riskStatus = $daysIncident === 0 ? ($elapsed > max(0, $ftDays - 3) ? 'at_risk' : 'ok') : ($daysIncident > 10 ? 'exceeded' : 'critical');
                finQuery("UPDATE dados_dachser.t_dachser_demurrage_containers SET expected_cost_usd = ?, days_possession = ?, days_incident = ?, risk_status = ?, updated_at = NOW() WHERE id = ?", [$totalCost, $elapsed, $daysIncident, $riskStatus, $c['id']]);
                $updated++;
            } catch (Exception $e) { $errors[] = "Container {$c['numero']}: " . $e->getMessage(); }
        }
        sendJson(['success' => true, 'updated' => $updated, 'errors' => count($errors), 'error_details' => $errors]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/demurrage/send-alert
$router->post('demurrage/send-alert', function($params) {
    try {
        $body = getRequestBody();
        $recipientEmails = array_filter(is_array($body['recipient_emails'] ?? null) ? $body['recipient_emails'] : []);
        if (count($recipientEmails) === 0) sendJson(['success' => false, 'error' => 'recipient_emails é obrigatório'], 400);
        $containers = is_array($body['containers'] ?? null) ? $body['containers'] : [];
        $subjectTarget = count($containers) > 1 ? count($containers) . ' containers em acompanhamento' : 'Container ' . ($containers[0]['number'] ?? $containers[0]['container_number'] ?? $body['container_number'] ?? $body['house_bl'] ?? $body['shipment_master'] ?? 'N/A');
        $subject = (!empty($body['test_mode']) ? '[TESTE] ' : '') . "Demurrage - $subjectTarget";
        $html = buildDemurrageAlertHtml(array_merge($body, ['containers' => $containers]));

        $sent = 0; $resendId = null; $skipped = false;
        if (isset($_ENV['RESEND_API_KEY'])) {
            $emailResult = dmSendResendEmail($subject, $html, array_values($recipientEmails));
            $sent = $emailResult['sent']; $resendId = $emailResult['resendId'];
        } else { $skipped = true; }

        if (empty($body['test_mode'])) {
            $containerNumbers = array_filter(array_merge([$body['container_number'] ?? null], array_map(function($c) { return $c['number'] ?? $c['container_number'] ?? null; }, $containers)));
            $idByNumber = [];
            if (count($containerNumbers) > 0) {
                $unique = array_unique($containerNumbers);
                $rows = finQuery("SELECT id, numero FROM dados_dachser.t_dachser_demurrage_containers WHERE numero IN (" . implode(',', array_fill(0, count($unique), '?')) . ")", array_values($unique));
                foreach (($rows ?: []) as $r) $idByNumber[$r['numero']] = $r['id'];
            }
            $historyTargets = count($containers) > 0 ? $containers : [['number' => $body['container_number'] ?? null]];
            foreach ($historyTargets as $c) {
                $containerNumber = $c['number'] ?? $c['container_number'] ?? $body['container_number'] ?? null;
                $containerId = $body['container_id'] ?? ($containerNumber ? ($idByNumber[$containerNumber] ?? null) : null);
                if (!$containerId) continue;
                finQuery("INSERT INTO dados_dachser.t_dachser_demurrage_alerts (container_id, container_number, alert_type, client_name, shipment_master, days_remaining, expected_cost_usd, recipient_emails, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [$containerId, $containerNumber, $body['alert_type'] ?? 'cost_statement', $body['client_name'] ?? null, $body['shipment_master'] ?? null, $body['days_remaining'] ?? $c['days_remaining'] ?? null, $body['expected_cost_usd'] ?? $body['total_usd'] ?? $c['total_usd'] ?? null, json_encode(array_values($recipientEmails)), isset($_ENV['RESEND_API_KEY']) ? 'sent' : 'logged', isset($_ENV['RESEND_API_KEY']) ? null : 'RESEND_API_KEY não configurada']);
            }
        }
        sendJson(['success' => true, 'status' => 'success', 'message' => isset($_ENV['RESEND_API_KEY']) ? "Alert sent to " . count($recipientEmails) . " recipient(s)" : 'RESEND_API_KEY não configurada; alerta validado e registrado quando aplicável', 'sent' => $sent, 'resendId' => $resendId]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/demurrage/job-logs
$router->get('demurrage/job-logs', function($params) {
    sendJson(['success' => true, 'data' => []]);
});

// GET /api/demurrage/health-check
$router->get('demurrage/health-check', function($params) {
    $startTime = microtime(true);
    $services = [];
    $dbStart = microtime(true);
    try { finQuery('SELECT 1'); $services[] = ['service' => 'Database', 'status' => 'healthy', 'latency_ms' => (int)round((microtime(true) - $dbStart) * 1000), 'message' => 'MariaDB accessible', 'last_checked' => date('c')]; }
    catch (Exception $err) { $services[] = ['service' => 'Database', 'status' => 'unhealthy', 'latency_ms' => (int)round((microtime(true) - $dbStart) * 1000), 'message' => $err->getMessage(), 'last_checked' => date('c')]; }
    $jcKey = $_ENV['JSONCARGO_API_KEY'] ?? null;
    $services[] = ['service' => 'JSONCARGO', 'status' => $jcKey ? 'healthy' : 'unhealthy', 'latency_ms' => 0, 'message' => $jcKey ? 'API key configured' : 'JSONCARGO_API_KEY não configurada', 'last_checked' => date('c')];
    $resendKey = $_ENV['RESEND_API_KEY'] ?? null;
    $services[] = ['service' => 'Resend (Email)', 'status' => $resendKey ? (str_starts_with($resendKey, 're_') ? 'healthy' : 'degraded') : 'unhealthy', 'latency_ms' => 0, 'message' => $resendKey ? ($resendKey ? 'API key configured' : 'Invalid API key format') : 'RESEND_API_KEY não configurada', 'last_checked' => date('c')];
    $hasUnhealthy = in_array('unhealthy', array_column($services, 'status'));
    $hasDegraded = in_array('degraded', array_column($services, 'status'));
    sendJson(['status' => $hasUnhealthy ? 'unhealthy' : ($hasDegraded ? 'degraded' : 'healthy'), 'total_latency_ms' => (int)round((microtime(true) - $startTime) * 1000), 'timestamp' => date('c'), 'services' => $services]);
});

// POST /api/demurrage/health-check
$router->post('demurrage/health-check', function($params) {
    $startTime = microtime(true);
    $services = [];
    $dbStart = microtime(true);
    try { finQuery('SELECT 1'); $services[] = ['service' => 'Database', 'status' => 'healthy', 'latency_ms' => (int)round((microtime(true) - $dbStart) * 1000), 'message' => 'MariaDB accessible', 'last_checked' => date('c')]; }
    catch (Exception $err) { $services[] = ['service' => 'Database', 'status' => 'unhealthy', 'latency_ms' => (int)round((microtime(true) - $dbStart) * 1000), 'message' => $err->getMessage(), 'last_checked' => date('c')]; }
    $services[] = ['service' => 'JSONCARGO', 'status' => isset($_ENV['JSONCARGO_API_KEY']) ? 'healthy' : 'unhealthy', 'latency_ms' => 0, 'message' => isset($_ENV['JSONCARGO_API_KEY']) ? 'API key configured' : 'JSONCARGO_API_KEY não configurada', 'last_checked' => date('c')];
    $services[] = ['service' => 'Resend (Email)', 'status' => isset($_ENV['RESEND_API_KEY']) ? 'healthy' : 'unhealthy', 'latency_ms' => 0, 'message' => isset($_ENV['RESEND_API_KEY']) ? 'API key configured' : 'RESEND_API_KEY não configurada', 'last_checked' => date('c')];
    $hasUnhealthy = in_array('unhealthy', array_column($services, 'status'));
    sendJson(['status' => $hasUnhealthy ? 'unhealthy' : 'healthy', 'total_latency_ms' => (int)round((microtime(true) - $startTime) * 1000), 'timestamp' => date('c'), 'services' => $services]);
});

// POST /api/demurrage/import-jsoncargo
$router->post('demurrage/import-jsoncargo', function($params) {
    try {
        $body = getRequestBody();
        $mbls = $body['mbls'] ?? [];
        $shipping_line = $body['shipping_line'] ?? null;
        $cliente = $body['cliente'] ?? null;
        if (!$mbls || !is_array($mbls) || count($mbls) === 0) sendJson(['error' => 'Nenhum MBL informado'], 400);
        if (!$shipping_line) sendJson(['error' => 'Armador é obrigatório'], 400);
        $jcKey = $_ENV['JSONCARGO_API_KEY'] ?? null;
        if (!$jcKey) sendJson(['error' => 'JSONCARGO_API_KEY não configurada'], 500);

        $isValidContainer = function($num) { return (bool)preg_match('/^[A-Z]{4}[0-9]{7}$/', strtoupper(trim((string)$num))); };
        $detectType = function($t) { if (!$t) return 'DRY'; $u = strtoupper($t); if (str_contains($u, 'REEF') || str_contains($u, 'RF') || str_contains($u, 'REFRIGER')) return 'REEFER'; if (str_contains($u, 'TANK')) return 'TANK'; if (str_contains($u, 'FLAT') || str_contains($u, 'OPEN') || str_contains($u, 'OT') || str_contains($u, 'FR')) return 'SPECIAL'; return 'DRY'; };
        $parseDate = function($d) { if (!$d) return null; try { if (preg_match('/^\d{4}-\d{2}-\d{2}/', $d)) return substr($d, 0, 10); return (new DateTime($d))->format('Y-m-d'); } catch (Exception $e) { return null; } };

        $results = []; $errors = [];
        foreach ($mbls as $mbl) {
            $cleanMbl = trim((string)$mbl);
            if (!$cleanMbl) continue;
            try {
                $apiUrl = "http://api.jsoncargo.com/api/v1/containers/bol/" . urlencode($cleanMbl) . "?shipping_line=" . urlencode($shipping_line);
                $res = fetch($apiUrl, ['method' => 'GET', 'headers' => ['x-api-key' => $jcKey, 'Content-Type' => 'application/json']]);
                if (!$res['ok']) { $errors[] = ['mbl' => $cleanMbl, 'error' => "{$res['status']} - {$res['body']}", 'carrier_tried' => $shipping_line]; continue; }
                $apiData = $res['json']();
                $bolData = $apiData['data'] ?? $apiData;
                $rawContainers = $bolData['associated_containers'] ?? $bolData['associated_container_numbers'] ?? (isset($bolData['container_number']) ? [$bolData['container_number']] : []);
                $containerList = [];
                foreach ($rawContainers as $c) { $rawNum = is_array($c) ? ($c['container_number'] ?? $c) : $c; $num = strtoupper(trim((string)$rawNum)); $containerList[] = ['numero' => $num, 'tipo_conteiner' => $detectType(is_array($c) ? ($c['container_type'] ?? null) : ($bolData['container_type'] ?? null)), 'status' => (is_array($c) ? ($c['container_status'] ?? null) : ($bolData['container_status'] ?? null)) ?? 'IN_TRANSIT', 'is_valid_format' => $isValidContainer($num), 'raw_number' => $rawNum]; }
                $results[] = ['mbl' => $bolData['bill_of_lading'] ?? $cleanMbl, 'armador' => $bolData['shipping_line_name'] ?? $shipping_line, 'porto_origem' => $bolData['shipped_from'] ?? null, 'porto_destino' => $bolData['shipped_to'] ?? null, 'expected_pod' => $bolData['shipped_to'] ?? null, 'data_atracacao' => $parseDate($bolData['eta_final_destination'] ?? null) ?? $parseDate($bolData['atd_origin'] ?? null), 'containers' => $containerList, 'raw_data' => $bolData];
            } catch (Exception $e) { $errors[] = ['mbl' => $cleanMbl, 'error' => $e->getMessage(), 'carrier_tried' => $shipping_line]; }
        }
        sendJson(['status' => 'success', 'total_requested' => count($mbls), 'total_found' => count($results), 'total_errors' => count($errors), 'shipments' => $results, 'errors' => $errors, 'cliente_sugerido' => $cliente, 'carrier_used' => $shipping_line]);
    } catch (Exception $e) { sendJson(['error' => $e->getMessage()], 500); }
});
