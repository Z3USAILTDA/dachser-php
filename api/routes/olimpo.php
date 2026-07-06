<?php
// api/routes/olimpo.php
// Rotas do módulo Olimpo: /api/olimpo/* e /api/sea/tracking/*

global $router;

$DB = $_ENV['MARIADB_OLIMPO_DATABASE'] ?? $_ENV['MARIADB_AIR_DATABASE'] ?? $_ENV['MARIADB_OPS_DATABASE'] ?? $_ENV['DB_NAME'] ?? 'dados_dachser';

function olimpoQuery($sql, $params = []) {
    return queryWithRetry(getOpsPDO(), $sql, $params);
}

function parsePageLimit() {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $rawLimit = (int)($_GET['limit'] ?? $_GET['pageSize'] ?? 50);
    $limit = max(1, min($rawLimit ?: 50, 2000));
    return ['page' => $page, 'limit' => $limit, 'offset' => ($page - 1) * $limit];
}

function onlyDigits($value) {
    return preg_replace('/\D/', '', (string)($value ?? ''));
}

$AIRPORTS = [
    'GRU' => [-23.4356, -46.4731], 'VCP' => [-23.0074, -47.1345], 'GIG' => [-22.8099, -43.2506],
    'CWB' => [-25.5285, -49.1758], 'POA' => [-29.9939, -51.1714], 'CNF' => [-19.6244, -43.9719],
    'FRA' => [50.0379, 8.5622], 'CDG' => [49.0097, 2.5479], 'AMS' => [52.3105, 4.7683],
    'LHR' => [51.4700, -0.4543], 'MAD' => [40.4983, -3.5676], 'MIA' => [25.7959, -80.2870],
    'ATL' => [33.6407, -84.4277], 'IAH' => [29.9902, -95.3368], 'YYZ' => [43.6777, -79.6248],
    'DOH' => [25.2731, 51.6081], 'DXB' => [25.2532, 55.3657], 'IST' => [41.2753, 28.7519],
    'HKG' => [22.3080, 113.9185], 'SIN' => [1.3644, 103.9915], 'NRT' => [35.7719, 140.3929],
    'SCL' => [-33.3928, -70.7858], 'EZE' => [-34.8222, -58.5358], 'BOG' => [4.7016, -74.1469],
    'PTY' => [9.0714, -79.3835], 'ZRH' => [47.4581, 8.5555], 'VIE' => [48.1103, 16.5697],
    'BRU' => [50.9014, 4.4844],
];

$PORTS = [
    'SANTOS' => [-23.9618, -46.3322], 'SSZ' => [-23.9618, -46.3322],
    'PARANAGUA' => [-25.5161, -48.5089], 'ITAJAI' => [-26.9078, -48.6619],
    'NAVEGANTES' => [-26.8975, -48.6536], 'ITAPOA' => [-26.1133, -48.6122],
    'RIO GRANDE' => [-32.0350, -52.0986], 'ROTTERDAM' => [51.9244, 4.4777],
    'ANTWERP' => [51.2602, 4.4023], 'HAMBURG' => [53.5413, 9.9836],
    'BREMERHAVEN' => [53.5396, 8.5810], 'LE HAVRE' => [49.4944, 0.1079],
    'VALENCIA' => [39.4699, -0.3763], 'BARCELONA' => [41.3500, 2.1500],
    'GENOA' => [44.4056, 8.9463], 'LA SPEZIA' => [44.0950, 9.8200],
    'FELIXSTOWE' => [51.9542, 1.3464], 'LISBON' => [38.7081, -9.1361],
    'NEWYORK' => [40.6840, -74.0480], 'NEW YORK' => [40.6840, -74.0480],
    'MIAMI' => [25.7780, -80.1700], 'HOUSTON' => [29.7300, -95.3000],
    'SHANGHAI' => [31.3300, 121.5000], 'NINGBO' => [29.8683, 121.5440],
    'SHENZHEN' => [22.5333, 113.9333], 'HONG KONG' => [22.3050, 114.1700],
    'QINGDAO' => [36.0833, 120.3167], 'TIANJIN' => [38.9833, 117.7833],
    'BUSAN' => [35.1000, 129.0400], 'SINGAPORE' => [1.2640, 103.8200],
    'JEBEL ALI' => [25.0167, 55.0667], 'MANAUS' => [-3.1300, -60.0200],
    'VITORIA' => [-20.3200, -40.3300], 'PECEM' => [-3.5500, -38.8000],
    'SUAPE' => [-8.3900, -34.9500], 'SALVADOR' => [-12.9700, -38.5100],
    'LONG BEACH' => [33.7500, -118.2000], 'LOS ANGELES' => [33.7400, -118.2700],
    'SAVANNAH' => [32.0800, -81.1000], 'DURBAN' => [-29.8700, 31.0300],
];

$PORT_KEYS_BY_LEN = array_keys($PORTS);
usort($PORT_KEYS_BY_LEN, function($a, $b) { return strlen($b) - strlen($a); });

function portCoords($raw, $PORTS, $PORT_KEYS_BY_LEN) {
    if (!$raw) return null;
    $clean = strtoupper(preg_replace('/\s+/', ' ', trim((string)$raw)));
    if (!$clean) return null;
    if (isset($PORTS[$clean])) return $PORTS[$clean];
    $beforeComma = trim(preg_split('/[,(]/', $clean)[0]);
    if (isset($PORTS[$beforeComma])) return $PORTS[$beforeComma];
    if (isset($PORTS[str_replace(' ', '', $beforeComma)])) return $PORTS[str_replace(' ', '', $beforeComma)];
    foreach ($PORT_KEYS_BY_LEN as $key) {
        if ($beforeComma === $key || str_starts_with($beforeComma, $key . ' ')) return $PORTS[$key];
    }
    $firstToken = explode(' ', $beforeComma)[0];
    return $PORTS[$firstToken] ?? null;
}

function agingBaseSubquery($DB) {
    return "
        SELECT t.*,
          CASE WHEN EXISTS (
            SELECT 1 FROM $DB.t_fin_disputas d
            WHERE (((COALESCE(d.documento,'') <> 'CR'
                  AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci
                  AND COALESCE(d.nf,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.numero_nf,'') COLLATE utf8mb4_unicode_ci
                  AND COALESCE(d.nd,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.nd,'') COLLATE utf8mb4_unicode_ci)
                OR (d.documento = 'CR'
                  AND CONCAT('CR|', COALESCE(d.nf,'')) COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci)))\r\n
              AND d.is_disputa = 1 AND d.resolved_at IS NULL AND d.deleted_at IS NULL
          ) THEN 1 ELSE 0 END AS is_disputa
        FROM $DB.v_fin_regua_contas_receber t
        WHERE NOT EXISTS (
          SELECT 1 FROM $DB.t_fin_soft_delete sd
          WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci
            AND sd.active = 0
        )
    ";
}

function getCobrancaAging($viewMode, $DB) {
    $groupExpr = $viewMode === 'client'
        ? "COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1)))"
        : "COALESCE(t.modal, 'Outros')";
    $joinGroup = $viewMode === 'client'
        ? "LEFT JOIN $DB.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci"
        : '';
    $cnpjs = $viewMode === 'client'
        ? ", GROUP_CONCAT(DISTINCT REPLACE(REPLACE(REPLACE(t.cnpj, '.', ''), '/', ''), '-', '') SEPARATOR ',') AS cnpjs"
        : '';

    $agingBase = agingBaseSubquery($DB);
    $sql = "
        SELECT $groupExpr AS product,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS not_due,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS aging_30,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN t.valor_nf ELSE 0 END) AS aging_40,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN t.valor_nf ELSE 0 END) AS aging_60,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN t.valor_nf ELSE 0 END) AS aging_90,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN t.valor_nf ELSE 0 END) AS aging_120,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN t.valor_nf ELSE 0 END) AS aging_180,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS aging_240,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN t.valor_nf ELSE 0 END) AS aging_365,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN t.valor_nf ELSE 0 END) AS aging_366_plus,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN 1 ELSE 0 END) AS count_not_due,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS count_30,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN 1 ELSE 0 END) AS count_40,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN 1 ELSE 0 END) AS count_60,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS count_90,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN 1 ELSE 0 END) AS count_120,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN 1 ELSE 0 END) AS count_180,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN 1 ELSE 0 END) AS count_240,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN 1 ELSE 0 END) AS count_365,
          SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN 1 ELSE 0 END) AS count_366_plus,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS disp_not_due,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS disp_30,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 40 THEN t.valor_nf ELSE 0 END) AS disp_40,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 41 AND 60 THEN t.valor_nf ELSE 0 END) AS disp_60,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 61 AND 90 THEN t.valor_nf ELSE 0 END) AS disp_90,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 120 THEN t.valor_nf ELSE 0 END) AS disp_120,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 121 AND 180 THEN t.valor_nf ELSE 0 END) AS disp_180,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS disp_240,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 365 THEN t.valor_nf ELSE 0 END) AS disp_365,
          SUM(CASE WHEN t.is_disputa = 1 AND DATEDIFF(CURDATE(), t.data_prev_baixa) > 365 THEN t.valor_nf ELSE 0 END) AS disp_366_plus,
          SUM(CASE WHEN t.is_disputa = 1 THEN t.valor_nf ELSE 0 END) AS disp_total
          $cnpjs
        FROM ($agingBase) t
        $joinGroup
        GROUP BY $groupExpr
        ORDER BY SUM(t.valor_nf) DESC
    ";
    $rows = olimpoQuery($sql);
    $fields = ['not_due','aging_30','aging_40','aging_60','aging_90','aging_120','aging_180','aging_240','aging_365','aging_366_plus','count_not_due','count_30','count_40','count_60','count_90','count_120','count_180','count_240','count_365','count_366_plus','disp_not_due','disp_30','disp_40','disp_60','disp_90','disp_120','disp_180','disp_240','disp_365','disp_366_plus','disp_total'];
    $totals = ['product' => 'Grand Total'];
    foreach ($fields as $f) $totals[$f] = 0;
    $data = [];
    foreach (($rows ?: []) as $r) {
        $row = ['product' => $r['product'] ?? 'Outros'];
        if (isset($r['cnpjs'])) $row['cnpjs'] = explode(',', $r['cnpjs']);
        foreach ($fields as $f) { $row[$f] = (float)($r[$f] ?? 0); $totals[$f] += $row[$f]; }
        $data[] = $row;
    }
    $lastRows = olimpoQuery("SELECT MAX(datavalidade) as last_update FROM $DB.v_fin_regua_contas_receber");
    return ['success' => true, 'data' => $data, 'totals' => $totals, 'lastUpdate' => $lastRows[0]['last_update'] ?? null];
}

function getFaturamentoRows($DB) {
    return olimpoQuery("
        SELECT processo, faturado_em, filial, modal, cliente,
               CAST(COALESCE(valor_total_faturado, 0) AS DOUBLE) as valor_total_faturado,
               regiao, divisao_por_modal, 'TOTVS_RM' as fonte
          FROM $DB.t_base_totvs_rm
         WHERE faturado_em IS NOT NULL
        UNION ALL
        SELECT CAST(id_ref_object AS CHAR), service_date, branch,
               CASE WHEN cost_center_iv LIKE '%Air%' THEN 'AI' WHEN cost_center_iv LIKE '%Sea%' THEN 'SI' ELSE 'OUTROS' END,
               deb_cred_name, CAST(COALESCE(total_revenue, 0) AS DOUBLE), NULL, NULL, 'NACIONAL_NAO_RLS'
          FROM $DB.t_othello_nacional_nao_rls
         WHERE service_date IS NOT NULL
        UNION ALL
        SELECT CAST(id_ref_object AS CHAR), service_date, branch,
               CASE WHEN cost_center_iv LIKE '%Air%' THEN 'AI' WHEN cost_center_iv LIKE '%Sea%' THEN 'SI' ELSE 'OUTROS' END,
               deb_cred_name, CAST(COALESCE(revenue, 0) AS DOUBLE), NULL, NULL, 'INTERNACIONAL_NAO_RLS'
          FROM $DB.t_othello_internacional_nao_rls
         WHERE service_date IS NOT NULL
         ORDER BY faturado_em DESC
    ");
}

// ── ROTAS ─────────────────────────────────────────────────────────────────

// GET /api/olimpo/mapbox-token
$router->get('olimpo/mapbox-token', function($params) {
    $token = !empty($_ENV['MAPBOX_PUBLIC_TOKEN']) ? $_ENV['MAPBOX_PUBLIC_TOKEN'] : (!empty($_ENV['MAPBOX_TOKEN']) ? $_ENV['MAPBOX_TOKEN'] : '');
    sendJson(['success' => true, 'token' => $token]);
});

// GET /api/olimpo/movimentacao-global
$router->get('olimpo/movimentacao-global', function($params) use ($DB, $AIRPORTS, $PORTS, $PORT_KEYS_BY_LEN) {
    try {
        $pl = parsePageLimit();
        $out = [];
        $now = time();
        $hubs = ['LH' => 'FRA','LA' => 'SCL','DL' => 'ATL','AZ' => 'FCO','AF' => 'CDG','KL' => 'AMS','BA' => 'LHR','IB' => 'MAD','TP' => 'LIS','UA' => 'IAH','AA' => 'MIA','AC' => 'YYZ','QR' => 'DOH','EK' => 'DXB','TK' => 'IST','CX' => 'HKG','SQ' => 'SIN','JL' => 'NRT','NH' => 'NRT','AV' => 'BOG','CM' => 'PTY'];

        try {
            $airRows = olimpoQuery("SELECT DISTINCT af.awb, UPPER(REPLACE(af.num_voo, ' ', '')) AS flight, dm.cliente, dm.tipo_processo AS tipo FROM $DB.t_awb_voo af INNER JOIN $DB.t_master_dados dm ON dm.mawb = af.awb WHERE af.num_voo IS NOT NULL AND TRIM(af.num_voo) <> '' AND TRIM(af.num_voo) <> '0' AND dm.cliente IS NOT NULL AND TRIM(dm.cliente) <> '' LIMIT 500");
            foreach (array_values($airRows ?: []) as $i => $r) {
                $flight = preg_replace('/[^A-Z0-9]/', '', strtoupper($r['flight'] ?? ''));
                preg_match('/^([A-Z]{2,3}|[0-9][A-Z])/', $flight, $cm); $carrier = $cm[1] ?? '';
                $hub = $hubs[$carrier] ?? 'MIA';
                $isExport = str_contains(strtoupper($r['tipo'] ?? ''), 'EXPORT');
                $oCode = $isExport ? 'GRU' : $hub; $dCode = $isExport ? $hub : 'GRU';
                $h = 0; $s = (string)($r['awb'] ?? $flight ?? $i); for ($j = 0; $j < strlen($s); $j++) $h = ($h * 31 + ord($s[$j])) & 0x7FFFFFFF;
                $etaIso = date('c', $now + (2 + ($h % 20)) * 3600);
                $prog = 0.15 + (($h % 70) / 100);
                $o = $AIRPORTS[$oCode] ?? $AIRPORTS['GRU']; $d = $AIRPORTS[$dCode] ?? $AIRPORTS['MIA'];
                $out[] = ['id' => "air:{$r['awb']}", 'mode' => 'air', 'tipo_label' => $r['tipo'] ?? 'Air', 'cliente' => explode(' - ', $r['cliente'] ?? '')[0], 'rota' => "$oCode → $dCode", 'eta_iso' => $etaIso, 'eta_api' => null, 'ata_iso' => null, 'delivered_until_ts' => null, 'status' => 'Em trânsito', 'orig' => $o, 'dest' => $d, 'prog' => $prog, 'pos' => $o && $d ? [$o[0] + ($d[0] - $o[0]) * $prog, $o[1] + ($d[1] - $o[1]) * $prog] : null, 'flight' => $flight, 'asset' => $r['awb'] ?? null];
            }
        } catch (Exception $e) {}

        try {
            $seaRows = olimpoQuery("SELECT ts.mbl_id, ts.container, ts.consignee, ts.tipo_processo, ts.origem AS porto_origem, ts.destino AS porto_destino, ts.navio AS vessel_name, ts.eta, ts.container_status, ts.last_event, ts.last_check, ts.shipping_line, 0 AS is_eta_delayed, MAX(ot.origem_lat) AS origem_lat, MAX(ot.origem_lon) AS origem_lon, MAX(ot.destino_lat) AS destino_lat, MAX(ot.destino_lon) AS destino_lon, MAX(ot.current_lat) AS current_lat, MAX(ot.current_lon) AS current_lon FROM $DB.t_sea_tracking_current ts LEFT JOIN $DB.t_olimpo_tracking ot ON ot.mode = 'sea' AND ot.asset COLLATE utf8mb4_unicode_ci = ts.mbl_id COLLATE utf8mb4_unicode_ci WHERE ts.active = 1 AND NOT (UPPER(ts.container_status) IN ('DELIVERED', 'DLV', 'GOD', 'EMPTY_RETURNED') AND ts.last_check < DATE_SUB(NOW(), INTERVAL 24 HOUR)) GROUP BY ts.mbl_id ORDER BY ts.eta ASC LIMIT 500");
            foreach (($seaRows ?: []) as $s) {
                $oCode = strtoupper(trim($s['porto_origem'] ?? '')) ?: 'ORIGEM';
                $dCode = strtoupper(trim($s['porto_destino'] ?? '')) ?: 'DESTINO';
                $orig = ($s['origem_lat'] && $s['origem_lon']) ? [(float)$s['origem_lat'], (float)$s['origem_lon']] : portCoords($oCode, $PORTS, $PORT_KEYS_BY_LEN);
                $dest = ($s['destino_lat'] && $s['destino_lon']) ? [(float)$s['destino_lat'], (float)$s['destino_lon']] : portCoords($dCode, $PORTS, $PORT_KEYS_BY_LEN);
                $etaIso = $s['eta'] ? date('c', strtotime($s['eta'])) : null;
                $statusRaw = strtoupper($s['container_status'] ?? '');
                $status = 'Em trânsito'; $deliveredUntil = null;
                if (in_array($statusRaw, ['DELIVERED','DLV','GOD','EMPTY_RETURNED'])) { $status = 'Entregue'; $deliveredUntil = $s['last_check'] ? (strtotime($s['last_check']) + 86400) * 1000 : null; }
                elseif ($etaIso && $now > strtotime($etaIso)) { $status = 'Atraso'; }
                $out[] = ['id' => "sea:{$s['mbl_id']}", 'mode' => 'sea', 'tipo_label' => $s['tipo_processo'] ?? 'SEA IMPORT', 'cliente' => $s['consignee'] ?? '', 'rota' => "$oCode → $dCode", 'eta_iso' => $etaIso, 'eta_api' => null, 'ata_iso' => null, 'delivered_until_ts' => $deliveredUntil, 'status' => $status, 'orig' => $orig, 'dest' => $dest, 'prog' => 0.5, 'pos' => ($s['current_lat'] && $s['current_lon']) ? [(float)$s['current_lat'], (float)$s['current_lon']] : null, 'flight' => null, 'asset' => $s['mbl_id'] ?? $s['container'] ?? null];
            }
        } catch (Exception $e) {}

        $q = strtolower(trim($_GET['search'] ?? ''));
        if ($q) $out = array_filter($out, function($i) use ($q) { return str_contains(strtolower(implode(' ', [$i['tipo_label'], $i['cliente'], $i['rota'], $i['asset'], $i['flight'], $i['status']])), $q); });
        if (!empty($_GET['mode'])) $out = array_filter($out, fn($i) => $i['mode'] === $_GET['mode']);
        if (!empty($_GET['status'])) $out = array_filter($out, fn($i) => $i['status'] === $_GET['status']);
        $out = array_values($out);
        $total = count($out);
        sendJson(['success' => true, 'data' => array_slice($out, $pl['offset'], $pl['limit']), 'pagination' => ['page' => $pl['page'], 'limit' => $pl['limit'], 'total' => $total, 'totalPages' => (int)ceil($total / $pl['limit'])]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => 'Não foi possível carregar os dados do Olimpo no momento. Tente novamente.'], 500); }
});

// GET /api/olimpo/movimentacao-global/summary
$router->get('olimpo/movimentacao-global/summary', function($params) use ($DB, $AIRPORTS, $PORTS, $PORT_KEYS_BY_LEN) {
    try {
        // Use same data source — lightweight count query
        $seaActive = olimpoQuery("SELECT COUNT(DISTINCT mbl_id) as c FROM $DB.t_sea_tracking_current WHERE active = 1");
        $seaDelivered = olimpoQuery("SELECT COUNT(DISTINCT mbl_id) as c FROM $DB.t_sea_tracking_current WHERE active = 1 AND UPPER(container_status) IN ('DELIVERED','DLV','GOD','EMPTY_RETURNED')");
        $airCount = olimpoQuery("SELECT COUNT(DISTINCT af.awb) as c FROM $DB.t_awb_voo af INNER JOIN $DB.t_master_dados dm ON dm.mawb = af.awb WHERE af.num_voo IS NOT NULL AND TRIM(af.num_voo) <> ''");
        sendJson(['success' => true, 'summary' => [
            'totalRegistros' => (int)($seaActive[0]['c'] ?? 0) + (int)($airCount[0]['c'] ?? 0),
            'containers' => (int)(($seaActive[0]['c'] ?? 0) - ($seaDelivered[0]['c'] ?? 0)),
            'voos' => (int)($airCount[0]['c'] ?? 0),
            'atrasos' => 0
        ]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/filters
$router->get('olimpo/filters', function($params) {
    sendJson(['success' => true, 'filters' => ['status' => ['Em trânsito', 'Entregue', 'Atraso'], 'clientes' => [], 'modes' => ['air', 'sea']]]);
});

// GET /api/olimpo/cobranca
$router->get('olimpo/cobranca', function($params) use ($DB) {
    try { sendJson(getCobrancaAging(($_GET['viewMode'] ?? '') === 'client' ? 'client' : 'product', $DB)); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/summary
$router->get('olimpo/cobranca/summary', function($params) use ($DB) {
    try {
        $data = getCobrancaAging(($_GET['viewMode'] ?? '') === 'client' ? 'client' : 'product', $DB);
        $fields = ['not_due','aging_30','aging_40','aging_60','aging_90','aging_120','aging_180','aging_240','aging_365','aging_366_plus'];
        $totalValor = array_reduce($fields, fn($s, $k) => $s + (float)($data['totals'][$k] ?? 0), 0);
        sendJson(['success' => true, 'summary' => ['totalRegistros' => count($data['data']), 'totalValor' => $totalValor, 'emAberto' => $totalValor, 'emDisputa' => (float)($data['totals']['disp_total'] ?? 0)]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/budget-forecast
$router->get('olimpo/cobranca/budget-forecast', function($params) use ($DB) {
    try {
        $viewMode = ($_GET['viewMode'] ?? '') === 'client' ? 'client' : 'product';
        $period = date('Y-m');
        $budget = 0;
        try { $rows = olimpoQuery("SELECT COALESCE(budget_value, 0) AS budget FROM $DB.t_budget_cobranca WHERE period = DATE_FORMAT(CURDATE(), '%Y-%m') AND view_mode = ?", [$viewMode]); $budget = (float)($rows[0]['budget'] ?? 0); } catch (Exception $e) {}
        sendJson(['success' => true, 'period' => $period, 'budget' => $budget, 'forecast' => 0, 'asOf' => date('c')]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// Legacy stubs
$router->get('olimpo/cobranca/payment-term-rating', function($p) { sendJson(['success' => true, 'data' => [], 'legacy' => true]); });
$router->get('olimpo/cobranca/aging-historical', function($p) { sendJson(['success' => true, 'data' => [], 'legacy' => true]); });
$router->get('olimpo/cobranca/payment-term-by-client', function($p) { sendJson(['success' => true, 'data' => [], 'legacy' => true]); });
$router->get('olimpo/cobranca/aging-historical-by-client', function($p) { sendJson(['success' => true, 'data' => [], 'legacy' => true]); });

// GET /api/olimpo/cobranca/aging-analitico
$router->get('olimpo/cobranca/aging-analitico', function($params) use ($DB) {
    try {
        $rows = olimpoQuery("
            SELECT t.documento, t.numero_nf, t.modal, t.tipo_documento, t.data_emissao,
                   t.data_prev_baixa AS data_vencimento, NULL AS cod_cliente, t.razao_social,
                   REPLACE(REPLACE(REPLACE(COALESCE(t.cnpj,''),'.',''),'/',''),'-','') AS cnpj_clean,
                   t.valor_nf, t.valor_liquido, t.processo, t.master, t.house, t.id_rm,
                   DATEDIFF(CURDATE(), t.data_prev_baixa) AS dias_vencimento,
                   le.last_success AS email_success, le.last_error AS email_error, le.last_sent_at AS email_sent_at
            FROM ({agingBase}) t
            LEFT JOIN (
                SELECT REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpj_clean,
                       SUBSTRING_INDEX(GROUP_CONCAT(success ORDER BY sent_at DESC), ',', 1) AS last_success,
                       SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(error_message,'') ORDER BY sent_at DESC SEPARATOR '||'), '||', 1) AS last_error,
                       MAX(sent_at) AS last_sent_at
                FROM $DB.t_fin_email_log
                GROUP BY REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','')
            ) le ON le.cnpj_clean COLLATE utf8mb4_unicode_ci = REPLACE(REPLACE(REPLACE(COALESCE(t.cnpj,''),'.',''),'/',''),'-','') COLLATE utf8mb4_unicode_ci
            WHERE NOT EXISTS (SELECT 1 FROM $DB.t_fin_soft_delete sd WHERE sd.documento COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci AND sd.active = 0)
              AND NOT EXISTS (SELECT 1 FROM $DB.t_fin_disputas d WHERE ((COALESCE(d.documento,'') <> 'CR' AND d.documento COLLATE utf8mb4_unicode_ci = t.documento COLLATE utf8mb4_unicode_ci AND COALESCE(d.nf,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.numero_nf,'') COLLATE utf8mb4_unicode_ci AND COALESCE(d.nd,'') COLLATE utf8mb4_unicode_ci = COALESCE(t.nd,'') COLLATE utf8mb4_unicode_ci) OR (d.documento = 'CR' AND CONCAT('CR|', COALESCE(d.nf,'')) COLLATE utf8mb4_unicode_ci = t.doc_key COLLATE utf8mb4_unicode_ci)) AND d.is_disputa = 1 AND d.resolved_at IS NULL AND d.deleted_at IS NULL)
            ORDER BY DATEDIFF(CURDATE(), t.data_prev_baixa) DESC, t.razao_social, t.data_prev_baixa
            LIMIT 10000
        ");

        // Actually use the agingBaseSubquery properly
        $agingBase = agingBaseSubquery($DB);
        $rows = olimpoQuery(str_replace('{agingBase}', $agingBase, "SELECT t.documento, t.numero_nf, t.modal, t.tipo_documento, t.data_emissao, t.data_prev_baixa AS data_vencimento, NULL AS cod_cliente, t.razao_social, REPLACE(REPLACE(REPLACE(COALESCE(t.cnpj,''),'.',''),'/',''),'-','') AS cnpj_clean, t.valor_nf, t.valor_liquido, t.processo, t.master, t.house, t.id_rm, DATEDIFF(CURDATE(), t.data_prev_baixa) AS dias_vencimento FROM ($agingBase) t ORDER BY dias_vencimento DESC LIMIT 10000"));

        $data = array_map(function($row) {
            return array_merge($row, ['valor_nf' => (float)($row['valor_nf'] ?? 0), 'valor_liquido' => (float)($row['valor_liquido'] ?? $row['valor_nf'] ?? 0), 'dias_vencimento' => (int)($row['dias_vencimento'] ?? 0), 'email_status' => 'nao_enviado', 'email_error' => '']);
        }, $rows ?: []);
        sendJson(['success' => true, 'data' => $data, 'dataCorte' => date('Y-m-d')]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/client-detail
$router->get('olimpo/cobranca/client-detail', function($params) use ($DB) {
    try {
        $clientName = trim($_GET['clientName'] ?? '');
        if (!$clientName) sendJson(['success' => false, 'error' => 'clientName required'], 400);
        $agingBase = agingBaseSubquery($DB);
        $rows = olimpoQuery("
            SELECT REPLACE(REPLACE(REPLACE(t.cnpj, '.', ''), '/', ''), '-', '') AS cnpj_clean, t.cnpj AS cnpj_original,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) <= 0 THEN t.valor_nf ELSE 0 END) AS not_due,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 1 AND 30 THEN t.valor_nf ELSE 0 END) AS aging_30,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 31 AND 90 THEN t.valor_nf ELSE 0 END) AS aging_90,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 91 AND 180 THEN t.valor_nf ELSE 0 END) AS aging_180,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 181 AND 240 THEN t.valor_nf ELSE 0 END) AS aging_240,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) BETWEEN 241 AND 360 THEN t.valor_nf ELSE 0 END) AS aging_360,
                   SUM(CASE WHEN DATEDIFF(CURDATE(), t.data_prev_baixa) > 360 THEN t.valor_nf ELSE 0 END) AS aging_360_plus,
                   COUNT(*) AS total_count, MAX(t.condicao_pag) AS condicao_pagamento, MAX(t.nome_vendedor) AS nome_vendedor,
                   SUM(CASE WHEN t.is_disputa = 1 THEN t.valor_nf ELSE 0 END) AS disputa_total,
                   SUM(CASE WHEN t.is_disputa = 1 THEN 1 ELSE 0 END) AS disputa_count
              FROM ($agingBase) t
              LEFT JOIN $DB.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci
             WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
             GROUP BY cnpj_clean, cnpj_original
             ORDER BY total_count DESC
        ", [$clientName]);
        $data = array_map(fn($r) => ['cnpj' => $r['cnpj_original'] ?? $r['cnpj_clean'], 'cnpjClean' => $r['cnpj_clean'], 'not_due' => (float)($r['not_due'] ?? 0), 'aging_30' => (float)($r['aging_30'] ?? 0), 'aging_90' => (float)($r['aging_90'] ?? 0), 'aging_180' => (float)($r['aging_180'] ?? 0), 'aging_240' => (float)($r['aging_240'] ?? 0), 'aging_360' => (float)($r['aging_360'] ?? 0), 'aging_360_plus' => (float)($r['aging_360_plus'] ?? 0), 'totalCount' => (int)($r['total_count'] ?? 0), 'condicao_pagamento' => $r['condicao_pagamento'] ?? null, 'nome_vendedor' => $r['nome_vendedor'] ?? null, 'disputa_total' => (float)($r['disputa_total'] ?? 0), 'disputa_count' => (int)($r['disputa_count'] ?? 0)], $rows ?: []);
        $cnpjs = array_filter(array_column($data, 'cnpjClean'));
        $observacoes = []; $contatos = [];
        if (count($cnpjs) > 0) {
            $ph = implode(',', array_fill(0, count($cnpjs), '?'));
            try { $observacoes = olimpoQuery("SELECT cnpj, observacao, updated_by, updated_at FROM $DB.t_cobranca_observacoes WHERE cnpj IN ($ph)", array_values($cnpjs)); } catch (Exception $e) {}
            try { $contatos = olimpoQuery("SELECT REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') AS cnpjClean, MAX(nome_contato) AS nome_contato, LOWER(TRIM(email_contato)) AS email_contato FROM $DB.t_dados_financeiro_contatos WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') IN ($ph) AND email_contato IS NOT NULL AND email_contato <> '' AND ativo = 1 AND (funcao IS NULL OR funcao IN ('Cobrança Zeus','ZEUS AI','ZEUS ASO','ZEUS DEX','ZEUS DIM','ZEUS SI','ZEUS TCK')) GROUP BY cnpjClean, LOWER(TRIM(email_contato)) ORDER BY cnpjClean, email_contato", array_values($cnpjs)); } catch (Exception $e) {}
        }
        sendJson(['success' => true, 'data' => $data, 'observacoes' => $observacoes, 'contatos' => $contatos]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/email-logs
$router->get('olimpo/cobranca/email-logs', function($params) use ($DB) {
    try {
        $cnpj = onlyDigits($_GET['cnpj'] ?? '');
        if (!$cnpj) { sendJson(['success' => true, 'logsByEmail' => []]); }
        $rows = olimpoQuery("SELECT id, stage, LOWER(TRIM(email_to)) AS email_to, subject, sent_at, success, error_message FROM $DB.t_fin_email_log WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY sent_at DESC LIMIT 200", [$cnpj]);
        $logsByEmail = [];
        foreach (($rows ?: []) as $r) { $key = strtolower(trim($r['email_to'] ?? '')); if (!$key) continue; if (!isset($logsByEmail[$key])) $logsByEmail[$key] = []; if (count($logsByEmail[$key]) < 10) $logsByEmail[$key][] = array_merge($r, ['success' => (int)$r['success'] === 1 ? 1 : 0]); }
        sendJson(['success' => true, 'logsByEmail' => $logsByEmail]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/client-faturas
$router->get('olimpo/cobranca/client-faturas', function($params) use ($DB) {
    try {
        $clientName = trim($_GET['clientName'] ?? '');
        if (!$clientName) sendJson(['success' => false, 'error' => 'clientName required'], 400);
        $pl = parsePageLimit();
        $modal = trim($_GET['modalFilter'] ?? '');
        $modalClause = $modal ? " AND COALESCE(t.modal,'') COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ? COLLATE utf8mb4_unicode_ci, '%')" : '';
        $vencSort = $_GET['vencSort'] ?? '';
        $order = $vencSort === 'asc' ? 't.data_prev_baixa ASC' : ($vencSort === 'desc' ? 't.data_prev_baixa DESC' : "CASE WHEN t.data_prev_baixa < CURDATE() THEN 0 ELSE 1 END, t.data_prev_baixa ASC");
        $agingBase = agingBaseSubquery($DB);
        $qParams = $modal ? [$clientName, $modal, $pl['limit'], $pl['offset']] : [$clientName, $pl['limit'], $pl['offset']];
        $rows = olimpoQuery("SELECT t.doc_key, t.documento, t.numero_nf, t.nd, t.cnpj, t.razao_social, DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao, DATE_FORMAT(t.data_prev_baixa, '%d/%m/%Y') AS data_vencimento, t.valor_nf, t.valor_liquido, t.modal, t.tipo_documento, t.processo AS numero_processo, t.master, t.house, t.condicao_pag AS condicao_pagamento, t.nome_vendedor, t.id_rm, t.idlan, CASE WHEN t.is_disputa = 1 THEN 1 ELSE 0 END AS disputa FROM ($agingBase) t LEFT JOIN $DB.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci $modalClause ORDER BY $order LIMIT ? OFFSET ?", $qParams);
        $countParams = $modal ? [$clientName, $modal] : [$clientName];
        $countRows = olimpoQuery("SELECT COUNT(*) AS total FROM ($agingBase) t LEFT JOIN $DB.t_fin_cliente_grupo g ON g.razao_social COLLATE utf8mb4_unicode_ci = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social, 'Sem Cliente'), '-', 1))) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci $modalClause", $countParams);
        sendJson(['success' => true, 'rows' => $rows, 'total' => (int)($countRows[0]['total'] ?? 0), 'page' => $pl['page'], 'pageSize' => $pl['limit']]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/cobranca/client-disputas
$router->get('olimpo/cobranca/client-disputas', function($params) use ($DB) {
    try {
        $cnpj = onlyDigits($_GET['cnpj'] ?? '');
        if (!$cnpj) sendJson(['success' => false, 'error' => 'cnpj required'], 400);
        $agingBase = agingBaseSubquery($DB);
        $rows = olimpoQuery("SELECT t.nd, t.numero_nf, t.documento, t.valor_nf, t.modal, DATE_FORMAT(t.data_emissao, '%d/%m/%Y') AS data_emissao, DATE_FORMAT(t.data_prev_baixa, '%d/%m/%Y') AS data_vencimento FROM ($agingBase) t WHERE REPLACE(REPLACE(REPLACE(t.cnpj,'.',''),'/',''),'-','') = ? AND t.is_disputa = 1 ORDER BY t.data_prev_baixa DESC LIMIT 500", [$cnpj]);
        sendJson(['success' => true, 'rows' => array_map(fn($r) => array_merge($r, ['valor_nf' => (float)($r['valor_nf'] ?? 0)]), $rows ?: [])]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/olimpo/cobranca/observacao
$router->post('olimpo/cobranca/observacao', function($params) use ($DB) {
    try {
        $body = getRequestBody();
        $cnpj = onlyDigits($body['cnpj'] ?? '');
        if (!$cnpj) sendJson(['success' => false, 'error' => 'cnpj required'], 400);
        olimpoQuery("INSERT INTO $DB.t_cobranca_observacoes (cnpj, observacao, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE observacao = VALUES(observacao), updated_by = VALUES(updated_by)", [$cnpj, $body['observacao'] ?? '', $body['updatedBy'] ?? null]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/faturamento
$router->get('olimpo/faturamento', function($params) use ($DB) {
    try {
        $pl = parsePageLimit();
        $rows = getFaturamentoRows($DB);
        $q = strtolower(trim($_GET['search'] ?? ''));
        if ($q) $rows = array_filter($rows, fn($r) => str_contains(strtolower(implode(' ', [$r['processo'] ?? '', $r['filial'] ?? '', $r['modal'] ?? '', $r['cliente'] ?? '', $r['regiao'] ?? '', $r['divisao_por_modal'] ?? ''])), $q));
        if (!empty($_GET['startDate'])) $rows = array_filter($rows, fn($r) => $r['faturado_em'] && strtotime($r['faturado_em']) >= strtotime($_GET['startDate']));
        if (!empty($_GET['endDate'])) $rows = array_filter($rows, fn($r) => $r['faturado_em'] && strtotime($r['faturado_em']) <= strtotime($_GET['endDate']));
        $rows = array_values($rows);
        $total = count($rows);
        sendJson(['success' => true, 'data' => array_slice($rows, $pl['offset'], $pl['limit']), 'pagination' => ['page' => $pl['page'], 'limit' => $pl['limit'], 'total' => $total, 'totalPages' => (int)ceil($total / $pl['limit'])]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/faturamento/summary
$router->get('olimpo/faturamento/summary', function($params) use ($DB) {
    try {
        $rows = getFaturamentoRows($DB);
        sendJson(['success' => true, 'summary' => ['totalRegistros' => count($rows ?: []), 'totalValor' => array_reduce($rows ?: [], fn($s, $r) => $s + (float)($r['valor_total_faturado'] ?? 0), 0)]]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/search-clientes
$router->get('olimpo/search-clientes', function($params) use ($DB) {
    try {
        $q = trim($_GET['q'] ?? '');
        $limit = min((int)($_GET['limit'] ?? 15), 50);
        if (strlen($q) < 2) { sendJson(['success' => true, 'clientes' => []]); }
        $rows = olimpoQuery("SELECT DISTINCT nome_cliente, dchr_customer_number, cnpj FROM $DB.t_clientes_base WHERE nome_cliente LIKE ? ORDER BY nome_cliente ASC LIMIT ?", ["%$q%", $limit]);
        sendJson(['success' => true, 'clientes' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/olimpo/search-analistas
$router->get('olimpo/search-analistas', function($params) use ($DB) {
    try {
        $q = trim($_GET['q'] ?? '');
        $limit = min((int)($_GET['limit'] ?? 15), 50);
        $modal = strtoupper($_GET['modal'] ?? '');
        if (strlen($q) < 2) { sendJson(['success' => true, 'analistas' => []]); }
        $tipoFilter = $modal === 'AIR' ? "AND tipo_processo IN ('AI','AE','AIR IMPORT','AIR EXPORT')" : ($modal === 'SEA' ? "AND tipo_processo IN ('SI','SE','SEA IMPORT','SEA EXPORT')" : '');
        $rows = olimpoQuery("SELECT DISTINCT nome_analista, email_analista FROM $DB.t_master_dados WHERE nome_analista LIKE ? $tipoFilter AND nome_analista IS NOT NULL AND TRIM(nome_analista) != '' ORDER BY nome_analista ASC LIMIT ?", ["$q%", $limit]);
        sendJson(['success' => true, 'analistas' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/olimpo/cadastro/aereo
$router->post('olimpo/cadastro/aereo', function($params) use ($DB) {
    try {
        $p = getRequestBody();
        if (empty($p['cadastro_id'])) sendJson(['success' => false, 'error' => 'cadastro_id é obrigatório'], 400);
        olimpoQuery("CREATE TABLE IF NOT EXISTS $DB.t_cadastros_aereo (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, cadastro_id VARCHAR(50) NOT NULL UNIQUE, mode VARCHAR(10), awb_number VARCHAR(50), hawb_number VARCHAR(50), consignee_nome VARCHAR(255), consignee_cnpj VARCHAR(20), consignee_customer_number VARCHAR(50), clerk VARCHAR(100), clerk_email VARCHAR(150), shipper_name VARCHAR(255), shipper_address TEXT, airport_departure VARCHAR(10), airport_destination VARCHAR(10), etd DATE, eta DATE, pieces INT, gross_weight_kg DECIMAL(12,3), chargeable_weight DECIMAL(12,3), rate DECIMAL(12,4), total_charge DECIMAL(12,2), volume_cbm DECIMAL(12,3), nature_of_goods TEXT, service_level VARCHAR(50), green_light_date DATE, pickup_date DATE, wh_treatment VARCHAR(100), pre_alert_date DATE, d_term VARCHAR(50), po_number VARCHAR(100), customer_order VARCHAR(100), routing_destination VARCHAR(200), other_charges_agent DECIMAL(12,2), total_prepaid DECIMAL(12,2), total_collect DECIMAL(12,2), hs_code VARCHAR(50), packaging TEXT, dimensions TEXT, cct_transmitido TINYINT(1) DEFAULT 0, oea_checklist TINYINT(1) DEFAULT 0, pre_alert_sent TINYINT(1) DEFAULT 0, cargo_departed TINYINT(1) DEFAULT 0, pod_dn_available TINYINT(1) DEFAULT 0, created_by VARCHAR(100), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        olimpoQuery("INSERT INTO $DB.t_cadastros_aereo (cadastro_id,mode,awb_number,hawb_number,consignee_nome,consignee_cnpj,consignee_customer_number,clerk,clerk_email,shipper_name,shipper_address,airport_departure,airport_destination,etd,eta,pieces,gross_weight_kg,chargeable_weight,rate,total_charge,volume_cbm,nature_of_goods,service_level,green_light_date,pickup_date,wh_treatment,pre_alert_date,d_term,po_number,customer_order,routing_destination,other_charges_agent,total_prepaid,total_collect,hs_code,packaging,dimensions,cct_transmitido,oea_checklist,pre_alert_sent,cargo_departed,pod_dn_available,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [$p['cadastro_id'],$p['mode']??null,$p['awb_number']??null,$p['hawb_number']??null,$p['consignee_nome']??null,$p['consignee_cnpj']??null,$p['consignee_customer_number']??null,$p['clerk']??null,$p['clerk_email']??null,$p['shipper_name']??null,$p['shipper_address']??null,$p['airport_departure']??null,$p['airport_destination']??null,$p['etd']??null,$p['eta']??null,$p['pieces']??null,$p['gross_weight_kg']??null,$p['chargeable_weight']??null,$p['rate']??null,$p['total_charge']??null,$p['volume_cbm']??null,$p['nature_of_goods']??null,$p['service_level']??null,$p['green_light_date']??null,$p['pickup_date']??null,$p['wh_treatment']??null,$p['pre_alert_date']??null,$p['d_term']??null,$p['po_number']??null,$p['customer_order']??null,$p['routing_destination']??null,$p['other_charges_agent']??null,$p['total_prepaid']??null,$p['total_collect']??null,$p['hs_code']??null,$p['packaging']??null,$p['dimensions']??null,!empty($p['cct_transmitido'])?1:0,!empty($p['oea_checklist'])?1:0,!empty($p['pre_alert_sent'])?1:0,!empty($p['cargo_departed'])?1:0,!empty($p['pod_dn_available'])?1:0,$p['created_by']??null]);
        sendJson(['success' => true, 'cadastro_id' => $p['cadastro_id']]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/olimpo/cadastro/maritimo
$router->post('olimpo/cadastro/maritimo', function($params) use ($DB) {
    try {
        $p = getRequestBody();
        if (empty($p['cadastro_id'])) sendJson(['success' => false, 'error' => 'cadastro_id é obrigatório'], 400);
        olimpoQuery("CREATE TABLE IF NOT EXISTS $DB.t_cadastros_maritimo (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, cadastro_id VARCHAR(50) NOT NULL UNIQUE, mode VARCHAR(10), master_number VARCHAR(50), hbl_number VARCHAR(50), bl_number VARCHAR(50), consignee_nome VARCHAR(255), consignee_cnpj VARCHAR(20), consignee_customer_number VARCHAR(50), consignee_expo VARCHAR(255), clerk VARCHAR(100), clerk_email VARCHAR(150), shipper_name VARCHAR(255), shipper_address TEXT, po_number VARCHAR(100), customer_order VARCHAR(100), green_light_date DATE, etd DATE, eta DATE, port_origin VARCHAR(100), port_destination VARCHAR(100), port_loading VARCHAR(100), port_discharge VARCHAR(100), place_receipt VARCHAR(100), place_delivery VARCHAR(100), vessel_voyage VARCHAR(100), ec_merchant VARCHAR(100), pre_alert_date DATE, pre_alert_comexpert VARCHAR(100), courier VARCHAR(100), free_time VARCHAR(50), d_term VARCHAR(50), deadline_draft_vgm DATE, deadline_load DATE, notify_party TEXT, delivery_agent TEXT, container_numbers TEXT, seal_numbers TEXT, marks_numbers TEXT, nature_of_goods TEXT, hs_code VARCHAR(50), gross_weight_kg DECIMAL(12,3), volume_cbm DECIMAL(12,3), pieces INT, packaging TEXT, freight_charges VARCHAR(100), freight_payment VARCHAR(50), service_type VARCHAR(50), total_prepaid DECIMAL(12,2), total_collect DECIMAL(12,2), num_original_bls INT, shipped_on_board_date DATE, place_date_issue TEXT, issued_by VARCHAR(100), remarks_1 TEXT, remarks_2 TEXT, booking_confirmed TINYINT(1) DEFAULT 0, dep TINYINT(1) DEFAULT 0, eta_ata_confirmed TINYINT(1) DEFAULT 0, dta TINYINT(1) DEFAULT 0, dachser_trucking TINYINT(1) DEFAULT 0, accrual TINYINT(1) DEFAULT 0, oea_checklist TINYINT(1) DEFAULT 0, drafts_available TINYINT(1) DEFAULT 0, drafts_sent TINYINT(1) DEFAULT 0, cargo_departed TINYINT(1) DEFAULT 0, pre_alert_sent TINYINT(1) DEFAULT 0, pod_available TINYINT(1) DEFAULT 0, dn_available TINYINT(1) DEFAULT 0, created_by VARCHAR(100), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $cols = ['cadastro_id','mode','master_number','hbl_number','bl_number','consignee_nome','consignee_cnpj','consignee_customer_number','consignee_expo','clerk','clerk_email','shipper_name','shipper_address','po_number','customer_order','green_light_date','etd','eta','port_origin','port_destination','port_loading','port_discharge','place_receipt','place_delivery','vessel_voyage','ec_merchant','pre_alert_date','pre_alert_comexpert','courier','free_time','d_term','deadline_draft_vgm','deadline_load','notify_party','delivery_agent','container_numbers','seal_numbers','marks_numbers','nature_of_goods','hs_code','gross_weight_kg','volume_cbm','pieces','packaging','freight_charges','freight_payment','service_type','total_prepaid','total_collect','num_original_bls','shipped_on_board_date','place_date_issue','issued_by','remarks_1','remarks_2','booking_confirmed','dep','eta_ata_confirmed','dta','dachser_trucking','accrual','oea_checklist','drafts_available','drafts_sent','cargo_departed','pre_alert_sent','pod_available','dn_available','created_by'];
        $bools = ['booking_confirmed','dep','eta_ata_confirmed','dta','dachser_trucking','accrual','oea_checklist','drafts_available','drafts_sent','cargo_departed','pre_alert_sent','pod_available','dn_available'];
        $vals = array_map(fn($c) => in_array($c, $bools) ? (!empty($p[$c]) ? 1 : 0) : ($p[$c] ?? null), $cols);
        olimpoQuery("INSERT INTO $DB.t_cadastros_maritimo (" . implode(',', $cols) . ") VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")", $vals);
        sendJson(['success' => true, 'cadastro_id' => $p['cadastro_id']]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/olimpo/cadastro/swap-master
$router->post('olimpo/cadastro/swap-master', function($params) use ($DB) {
    try {
        $body = getRequestBody();
        $new_mawb = $body['new_mawb'] ?? null;
        $hawbs = $body['hawbs'] ?? [];
        if (!$new_mawb || !is_array($hawbs) || count($hawbs) === 0) sendJson(['success' => false, 'error' => 'new_mawb e hawbs são obrigatórios'], 400);
        $ph = implode(',', array_fill(0, count($hawbs), '?'));
        $existing = olimpoQuery("SELECT hawb, mawb FROM $DB.t_master_dados WHERE hawb IN ($ph)", $hawbs);
        $oldMawbs = []; foreach ($existing as $r) $oldMawbs[$r['hawb']] = $r['mawb'];
        $found = array_column($existing, 'hawb');
        $notFound = array_diff($hawbs, $found);
        if (count($found) > 0) olimpoQuery("UPDATE $DB.t_master_dados SET mawb = ? WHERE hawb IN (" . implode(',', array_fill(0, count($found), '?')) . ")", array_merge([$new_mawb], $found));
        sendJson(['success' => true, 'updated' => $found, 'not_found' => array_values($notFound), 'updated_count' => count($found), 'not_found_count' => count($notFound), 'old_mawbs' => $oldMawbs]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/sea/tracking
$router->get('sea/tracking', function($params) use ($DB) {
    try {
        $rows = olimpoQuery("SELECT mbl_id, container, tipo_processo, consignee, shipping_line, origem, destino, navio, vessel_imo, eta, last_event, last_check, container_status, email_analista, email_cliente, active, updated_at FROM $DB.t_sea_tracking_current WHERE active = 1 AND NOT (UPPER(container_status) IN ('DELIVERED','DLV','GOD','EMPTY_RETURNED') AND last_check < DATE_SUB(NOW(), INTERVAL 24 HOUR)) ORDER BY eta ASC LIMIT 2000");
        $mblMap = [];
        foreach (($rows ?: []) as $row) {
            if (!isset($mblMap[$row['mbl_id']])) $mblMap[$row['mbl_id']] = array_merge($row, ['container_count' => 0]);
            $cnt = strtoupper($row['container'] ?? '');
            if ($cnt && $cnt !== 'PENDENTE' && $cnt !== 'NAO_ENCONTRADO') $mblMap[$row['mbl_id']]['container_count']++;
            if ($row['container_status'] && !in_array(strtoupper($row['container_status']), ['DELIVERED','DLV','GOD','EMPTY_RETURNED'])) { $mblMap[$row['mbl_id']]['container_status'] = $row['container_status']; $mblMap[$row['mbl_id']]['last_event'] = $row['last_event']; }
        }
        $data = array_map(fn($m) => ['mbl_id' => $m['mbl_id'], 'tipo_processo' => $m['tipo_processo'], 'consignee' => $m['consignee'], 'shipping_line' => $m['shipping_line'], 'origem' => $m['origem'], 'destino' => $m['destino'], 'navio' => $m['navio'], 'vessel_imo' => $m['vessel_imo'] ?? null, 'eta' => $m['eta'] ?? null, 'etd' => $m['etd'] ?? null, 'email_analista' => $m['email_analista'] ?? '', 'email_cliente' => $m['email_cliente'] ?? '', 'container_count' => $m['container_count'], 'container_status' => $m['container_status'] ?? null, 'last_event' => $m['last_event'] ?? null, 'last_check' => $m['last_check'] ?? null, 'last_check_real' => null, 'updated_at' => $m['updated_at'] ?? null, 'is_critico' => 0, 'is_eta_delayed' => 0, 'dias_atraso' => 0, 'has_free_time' => 0, 'tipo_carga' => $m['tipo_carga'] ?? 'FCL', 'coloader' => $m['coloader'] ?? null, 'transshipment_port' => $m['transshipment_port'] ?? null, 'nome_analista' => $m['nome_analista'] ?? null, 'hbl' => $m['hbl'] ?? null, 'cliente' => $m['cliente'] ?? null, 'eta_master' => null, 'eta_api' => null, 'latitude' => null, 'longitude' => null, 'origem_code' => null, 'destino_code' => null], array_values($mblMap));
        sendJson(['success' => true, 'data' => $data]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/sea/tracking/containers
$router->get('sea/tracking/containers', function($params) use ($DB) {
    try {
        $mbl_id = $_GET['mbl_id'] ?? null;
        if (!$mbl_id) sendJson(['success' => false, 'error' => 'mbl_id é obrigatório'], 400);
        $rows = olimpoQuery("SELECT id, mbl_id, container, shipping_line, container_status, last_event, last_check, eta, navio, vessel_imo, origem, destino, consignee FROM $DB.t_sea_tracking_current WHERE mbl_id = ? AND active = 1 ORDER BY id ASC", [$mbl_id]);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/sea/tracking/events
$router->post('sea/tracking/events', function($params) use ($DB) {
    try {
        $body = getRequestBody();
        $mbl_id = $body['mbl_id'] ?? null;
        if (!$mbl_id) { sendJson(['success' => true, 'data' => []]); }
        $lim = min((int)($body['limit'] ?? 200), 500);
        $rows = olimpoQuery("SELECT id, mbl_id, container, event_datetime, event_description, event_location, voyage FROM $DB.t_sea_tracking_history WHERE mbl_id = ? ORDER BY event_datetime DESC LIMIT ?", [$mbl_id, $lim]);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/sea/tracking/resolve-ports (stub)
$router->post('sea/tracking/resolve-ports', function($params) { sendJson(['success' => true, 'data' => []]); });

// GET /api/sea/tracking/cleanup-orphans
$router->get('sea/tracking/cleanup-orphans', function($params) use ($DB) {
    try {
        $result = getOpsPDO()->exec("DELETE ts FROM $DB.t_sea_tracking_current ts INNER JOIN (SELECT DISTINCT mbl_id FROM $DB.t_sea_tracking_current WHERE active = 1 AND container IS NOT NULL AND UPPER(container) NOT IN ('PENDENTE','NAO_ENCONTRADO')) sub ON sub.mbl_id = ts.mbl_id WHERE UPPER(ts.container) = 'PENDENTE'");
        sendJson(['success' => true, 'deleted' => $result]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/sea/tracking/deactivate-invalid
$router->get('sea/tracking/deactivate-invalid', function($params) use ($DB) {
    try { $result = getOpsPDO()->exec("UPDATE $DB.t_sea_tracking_current SET active = 0 WHERE active = 1 AND mbl_id REGEXP '^[0-9]+\$'"); sendJson(['success' => true, 'deactivated' => $result]); }
    catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/sea/tracking/reset-nao-encontrado
$router->get('sea/tracking/reset-nao-encontrado', function($params) use ($DB) {
    try {
        $mbl_id = $_GET['mbl_id'] ?? null;
        $sql = "UPDATE $DB.t_sea_tracking_current SET container_status = 'PENDENTE' WHERE UPPER(container) = 'NAO_ENCONTRADO' AND active = 1";
        $qParams = [];
        if ($mbl_id) { $sql .= ' AND mbl_id = ?'; $qParams[] = $mbl_id; }
        $result = olimpoQuery($sql, $qParams);
        sendJson(['success' => true, 'reset' => is_array($result) ? count($result) : 0]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// GET /api/sea/tracking/sync
$router->get('sea/tracking/sync', function($params) use ($DB) {
    try {
        $newMbls = olimpoQuery("SELECT DISTINCT TRIM(mawb) AS mbl_id, tipo_processo, cliente, consignee, nome_analista, email_analista FROM $DB.t_master_dados WHERE tipo_processo IN ('SI','SE','SEA IMPORT','SEA EXPORT') AND mawb IS NOT NULL AND TRIM(mawb) != '' AND data_insert >= DATE_SUB(NOW(), INTERVAL 6 MONTH)");
        $inserted = 0;
        $pdo = getOpsPDO();
        foreach (($newMbls ?: []) as $row) {
            try {
                $stmt = $pdo->prepare("INSERT IGNORE INTO $DB.t_sea_tracking_current (mbl_id, tipo_processo, consignee, container, email_analista, nome_analista, cliente, active, container_status, last_check) VALUES (?, ?, ?, 'PENDENTE', ?, ?, ?, 1, 'PENDENTE', NOW())");
                $stmt->execute([$row['mbl_id'], $row['tipo_processo'] ?? null, $row['consignee'] ?? $row['cliente'] ?? null, $row['email_analista'] ?? null, $row['nome_analista'] ?? null, $row['cliente'] ?? null]);
                $inserted++;
            } catch (Exception $e) {}
        }
        sendJson(['success' => true, 'inserted' => $inserted, 'updated' => 0]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// Background stubs
$router->get('sea/tracking/enrich', fn($p) => sendJson(['success' => true, 'enriched' => 0, 'errors' => 0, 'remaining' => 0]));
$router->get('sea/tracking/refresh', fn($p) => sendJson(['success' => true, 'processed' => 0, 'errors' => 0, 'remaining' => 0]));
$router->get('sea/tracking/populate-imos', fn($p) => sendJson(['success' => true, 'remaining' => 0, 'vesselsProcessed' => 0]));
$router->get('sea/tracking/refresh-vessel-imos', fn($p) => sendJson(['success' => true, 'updated' => 0, 'total' => 0, 'unchanged' => 0, 'errors' => 0, 'changes' => []]));
$router->post('sea/tracking/hapag-discover', fn($p) => sendJson(['success' => true, 'discovered' => 0, 'failed' => 0, 'total' => 0, 'rate_limited' => false]));

// POST /api/sea/tracking/delete
$router->post('sea/tracking/delete', function($params) use ($DB) {
    try {
        $body = getRequestBody();
        $mbl_id = $body['mbl_id'] ?? null;
        if (!$mbl_id) sendJson(['success' => false, 'error' => 'mbl_id é obrigatório'], 400);
        olimpoQuery("UPDATE $DB.t_sea_tracking_current SET active = 0 WHERE mbl_id = ?", [$mbl_id]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});

// POST /api/sea/tracking/add-lcl
$router->post('sea/tracking/add-lcl', function($params) use ($DB) {
    try {
        $body = getRequestBody();
        $mbl_id = $body['mbl_id'] ?? null; $container = $body['container'] ?? null; $shipping_line = $body['shipping_line'] ?? null;
        if (!$mbl_id || !$container || !$shipping_line) sendJson(['success' => false, 'error' => 'mbl_id, container e shipping_line são obrigatórios'], 400);
        olimpoQuery("INSERT INTO $DB.t_sea_tracking_current (mbl_id, container, shipping_line, consignee, eta, transshipment_port, tipo_carga, coloader, tipo_processo, container_status, active, last_check) VALUES (?, ?, ?, ?, ?, ?, 'LCL', ?, 'SEA IMPORT', 'PENDENTE', 1, NOW()) ON DUPLICATE KEY UPDATE consignee=VALUES(consignee), eta=VALUES(eta), transshipment_port=VALUES(transshipment_port), active=1, last_check=NOW()", [$mbl_id, $container, $shipping_line, $body['consignee'] ?? null, $body['eta'] ?? null, $body['transbordo'] ?? null, $shipping_line]);
        sendJson(['success' => true]);
    } catch (Exception $e) { sendJson(['success' => false, 'error' => $e->getMessage()], 500); }
});
