<?php
// api/routes/air.php
// Rotas do módulo AIR, CCT e Parsers: /api/air/*, /api/cct/*, /api/parsers/*

global $router;

// Constantes
$airDb = isset($_ENV['MARIADB_AIR_DATABASE']) ? $_ENV['MARIADB_AIR_DATABASE'] : (isset($_ENV['DB_NAME']) ? $_ENV['DB_NAME'] : 'dados_dachser');
$etdCutoff = isset($_ENV['AIR_ETD_CUTOFF']) ? $_ENV['AIR_ETD_CUTOFF'] : '2026-06-01';

define('AIR_DB', $airDb);
define('ETD_CUTOFF', $etdCutoff);

define('CHECK_TABLE', 'dados_dachser.t_awb_check');
define('PARSED_TABLE', 'dados_dachser.t_awb_parsed');
define('DOCUMENT_TABLE', 'dados_dachser.t_awb_document');
define('LOG_TABLE', 'dados_dachser.t_awb_check_log');
define('MATRIX_TABLE', 'dados_dachser.t_awb_rule_matrix');
define('RULE_TABLE', 'dados_dachser.t_awb_rule_row');

// IATA Map
$iataCityMap = [
    "GUARULHOS" => "GRU",
    "SAO PAULO" => "GRU",
    "CAMPINAS" => "VCP",
    "VIRACOPOS" => "VCP",
    "CURITIBA" => "CWB",
    "PORTO ALEGRE" => "POA",
    "RIO DE JANEIRO" => "GIG",
    "BELO HORIZONTE" => "CNF",
    "SALVADOR" => "SSA",
    "RECIFE" => "REC",
    "FORTALEZA" => "FOR",
    "BRASILIA" => "BSB",
    "MANAUS" => "MAO",
    "BELEM" => "BEL",
    "GOIANIA" => "GYN",
    "VITORIA" => "VIX",
    "FLORIANOPOLIS" => "FLN",
    "NATAL" => "NAT",
    "FRANKFURT" => "FRA",
    "PARIS" => "CDG",
    "AMSTERDAM" => "AMS",
    "LONDON" => "LHR",
    "MADRID" => "MAD",
    "MILAN" => "MXP",
    "ROME" => "FCO",
    "LISBON" => "LIS",
    "MUNICH" => "MUC",
    "ZURICH" => "ZRH",
    "VIENNA" => "VIE",
    "BRUSSELS" => "BRU",
    "BARCELONA" => "BCN",
    "VALENCIA" => "VLC",
    "OSLO" => "OSL",
    "STOCKHOLM" => "ARN",
    "NEW YORK" => "JFK",
    "MIAMI" => "MIA",
    "CHICAGO" => "ORD",
    "LOS ANGELES" => "LAX",
    "ATLANTA" => "ATL",
    "DALLAS" => "DFW",
    "HOUSTON" => "IAH",
    "BOSTON" => "BOS",
    "TORONTO" => "YYZ",
    "MONTREAL" => "YUL",
    "MEXICO CITY" => "MEX",
    "BOGOTA" => "BOG",
    "SANTIAGO" => "SCL",
    "BUENOS AIRES" => "EZE",
    "LIMA" => "LIM",
    "DUBAI" => "DXB",
    "HONG KONG" => "HKG",
    "SHANGHAI" => "PVG",
    "BEIJING" => "PEK",
    "TOKYO" => "NRT",
    "SINGAPORE" => "SIN",
    "SYDNEY" => "SYD",
    "AUCKLAND" => "AKL",
    "JOHANNESBURG" => "JNB",
    "NAIROBI" => "NBO",
    "ADDIS ABABA" => "ADD"
];

function extractIATA($loc)
{
    global $iataCityMap;
    if (!$loc)
        return "";
    $t = trim($loc);
    if (preg_match('/\(([A-Z]{3})\)/i', $t, $matches))
        return strtoupper($matches[1]);
    if (preg_match('/^[A-Z]{3}$/i', $t))
        return strtoupper($t);

    $upper = preg_replace('/\s+/', ' ', preg_replace('/[^A-Z\s]/i', ' ', strtoupper($t)));
    $upper = trim($upper);
    if (isset($iataCityMap[$upper]))
        return $iataCityMap[$upper];

    $parts = explode(" ", $upper);
    $firstWord = isset($parts[0]) ? $parts[0] : '';
    if ($firstWord && strlen($firstWord) > 3 && isset($iataCityMap[$firstWord]))
        return $iataCityMap[$firstWord];

    if (preg_match('/[\s-]([A-Z]{3})$/i', $t, $endMatch))
        return strtoupper($endMatch[1]);
    return strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $t), 0, 3));
}
// Core compute tracking
//
// Fluxo simplificado (2026-07-13): sempre consulta o MariaDB diretamente e
// devolve o conjunto completo de AWBs dentro da janela de ETD_CUTOFF numa
// única resposta síncrona. Sem cache, sem paginação por cursor e sem
// recomputo em background — o volume de dados desta tela (janela de poucas
// semanas) é pequeno o suficiente para não precisar dessas camadas, e elas
// eram a origem dos 504/ERR_HTTP2_PROTOCOL_ERROR intermitentes (força
// disparava recompute concorrente com o polling).
function computeTrackingData($requestId = null)
{
    $requestId = $requestId ?: substr(md5(uniqid('', true)), 0, 10);
    $computeStart = microtime(true);
    $effectiveCutoff = ETD_CUTOFF;

    error_log("[tracking-aereo][$requestId] origem dos dados: consulta direta ao banco (dados_dachser) — sem API externa envolvida");
    $pdo = getPDO();
    $normalizeDesc = function ($s) {
        return trim(preg_replace('/\s+/', ' ', preg_replace('/[^\w\s]/u', ' ', strtoupper(trim($s)))));
    };

    // Eventos
    $eventsRows = queryWithRetry($pdo, "SELECT id, code, descricao_en FROM dados_dachser.t_eventos_awb");
    $eventMap = [];
    $exactMap = [];
    $keywordIndex = [];
    foreach (($eventsRows ?: []) as $e) {
        $code = strtoupper(trim($e['code']));
        if (!$code)
            continue;
        $eventMap[$code] = ['id' => (int) $e['id'], 'descricao_en' => $e['descricao_en'] ?: ''];
        $desc = $normalizeDesc($e['descricao_en']);
        if ($desc) {
            $exactMap[$desc] = $code;
            $keywordIndex[] = ['needle' => $desc, 'code' => $code];
        }
    }

    $descRows = queryWithRetry($pdo, "SELECT code, description FROM dados_dachser.t_description_eventos");
    $descLookup = [];
    foreach (($descRows ?: []) as $d) {
        $code = strtoupper(trim($d['code']));
        $descText = strtoupper($d['description']);
        $descLookup[] = ['code' => $code, 'description' => $descText];

        $desc = $normalizeDesc($d['description']);
        if (!$code || !$desc)
            continue;
        if (!isset($exactMap[$desc]))
            $exactMap[$desc] = $code;
        $keywordIndex[] = ['needle' => $desc, 'code' => $code];
    }

    // Ordena palavra-chave por tamanho desc
    usort($keywordIndex, function ($a, $b) {
        return strlen($b['needle']) - strlen($a['needle']);
    });

    $queryParams = [$effectiveCutoff];

    $sql = "
        WITH base AS (
          SELECT tda.id, tda.awb_number AS AWB, tda.hawb_number AS HAWB, tda.consignee_nome AS CLIENTE,
              tda.tipo_servico AS TIPO_SERVICO, tda.etd AS ETD,
              tdaf.origin AS ORIGEM, tdaf.destination AS DESTINO, tda.clerk AS ANALISTA,
              tdaf.last_status_code,
              tdaf.timeline_json AS TIMELINE,
              json_unquote(json_extract(tdaf.timeline_json,'$[0].description')) AS desc0,
              json_unquote(json_extract(tdaf.timeline_json,'$[1].description')) AS desc1,
              json_unquote(json_extract(tdaf.timeline_json,'$[2].description')) AS desc2,
              json_unquote(json_extract(tdaf.timeline_json,'$[3].description')) AS desc3,
              json_unquote(json_extract(tdaf.timeline_json,'$[4].description')) AS desc4,
              json_unquote(json_extract(tdaf.timeline_json,'$[5].description')) AS desc5,
              json_unquote(json_extract(tdaf.timeline_json,'$[0].location'))    AS loc0,
              json_unquote(json_extract(tdaf.timeline_json,'$[1].location'))    AS loc1,
              json_unquote(json_extract(tdaf.timeline_json,'$[2].location'))    AS loc2,
              json_unquote(json_extract(tdaf.timeline_json,'$[3].location'))    AS loc3,
              json_unquote(json_extract(tdaf.timeline_json,'$[4].location'))    AS loc4,
              json_unquote(json_extract(tdaf.timeline_json,'$[5].location'))    AS loc5,
              json_unquote(json_extract(tdaf.timeline_json,'$[0].date'))        AS date0,
              json_unquote(json_extract(tdaf.timeline_json,'$[1].date'))        AS date1,
              json_unquote(json_extract(tdaf.timeline_json,'$[2].date'))        AS date2,
              json_unquote(json_extract(tdaf.timeline_json,'$[3].date'))        AS date3,
              json_unquote(json_extract(tdaf.timeline_json,'$[4].date'))        AS date4,
              json_unquote(json_extract(tdaf.timeline_json,'$[5].date'))        AS date5,
              json_unquote(json_extract(tdaf.timeline_json,'$[0].time'))        AS time0,
              json_unquote(json_extract(tdaf.timeline_json,'$[0].status_code')) AS code0_native,
              json_unquote(json_extract(tdaf.timeline_json,'$[1].status_code')) AS code1_native,
              json_unquote(json_extract(tdaf.timeline_json,'$[2].status_code')) AS code2_native,
              json_unquote(json_extract(tdaf.timeline_json,'$[3].status_code')) AS code3_native,
              json_unquote(json_extract(tdaf.timeline_json,'$[4].status_code')) AS code4_native,
              json_unquote(json_extract(tdaf.timeline_json,'$[5].status_code')) AS code5_native
          FROM dados_dachser.t_dados_aereo tda
          LEFT JOIN dados_dachser.t_fato_aereo tdaf
              ON tdaf.awb = tda.awb_number
          WHERE tda.etd >= ?
        ),
        event_time AS (
          SELECT b.*,
              str_to_date(concat(nullif(b.date0,''), CASE WHEN nullif(b.time0,'') IS NOT NULL THEN concat(' ',b.time0) ELSE ' 00:00' END),'%d %b %Y %H:%i') AS data_evento_base
          FROM base b
        ),
        sla_calc AS (
          SELECT e.*,
              timestampdiff(SECOND, e.data_evento_base, now())/3600 AS sla_hours_in_status,
              CASE
                  WHEN e.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN null
                  WHEN e.last_status_code='BKD' THEN 12 WHEN e.last_status_code='RCS' THEN 12
                  WHEN e.last_status_code='MAN' THEN 3  WHEN e.last_status_code='PRE' THEN 6
                  WHEN e.last_status_code='RCF' THEN 6  WHEN e.last_status_code='DEP' THEN 48
                  WHEN e.last_status_code='FOH' THEN 12 WHEN e.last_status_code='FWB' THEN 24
                  WHEN e.last_status_code='RDP' THEN 3  WHEN e.last_status_code='RFC' THEN 6
                  ELSE 24
              END AS sla_limite_horas
          FROM event_time e
        )
        SELECT s.*,
            round(s.sla_hours_in_status,2) AS hours_in_status_rounded,
            CASE WHEN s.sla_limite_horas IS null OR s.sla_limite_horas=0 THEN null
                 ELSE round(s.sla_hours_in_status/s.sla_limite_horas,4) END AS sla_ratio,
            CASE WHEN s.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN 'VERDE'
                 WHEN s.sla_limite_horas IS null OR s.sla_limite_horas=0 THEN null
                 WHEN s.sla_hours_in_status/s.sla_limite_horas<0.7 THEN 'VERDE'
                 WHEN s.sla_hours_in_status/s.sla_limite_horas<1.0 THEN 'AMARELO'
                 ELSE 'VERMELHO' END AS sla_cor,
            CASE WHEN s.sla_hours_in_status IS null THEN null
                 WHEN s.sla_hours_in_status<24 THEN concat(floor(s.sla_hours_in_status),'h',lpad(floor((s.sla_hours_in_status-floor(s.sla_hours_in_status))*60),2,'0'))
                 ELSE concat(floor(s.sla_hours_in_status/24),'d',lpad(floor(mod(s.sla_hours_in_status,24)),2,'0'),'h') END AS sla_tempo_formatado,
            CASE WHEN s.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN 'Status pós-chegada/final'
                 WHEN s.sla_limite_horas IS null THEN null
                 ELSE concat(round(s.sla_hours_in_status/s.sla_limite_horas*100,1),'% do limite') END AS sla_tooltip
        FROM sla_calc s
    ";

    error_log("[tracking-aereo][$requestId] início da consulta SQL (principal, cutoff=$effectiveCutoff)");
    $sqlStart = microtime(true);
    $rows = queryWithRetry($pdo, $sql, $queryParams);
    $sqlDuration = microtime(true) - $sqlStart;
    error_log(sprintf("[tracking-aereo][%s] fim da consulta SQL (principal) — duração=%.3fs — quantidade de registros=%d", $requestId, $sqlDuration, count($rows ?: [])));

    $missingClienteHawbs = [];
    foreach (($rows ?: []) as $r) {
        if (!isset($r['CLIENTE']) || trim($r['CLIENTE']) === '') {
            if ($r['HAWB'] && $r['HAWB'] !== 'NI')
                $missingClienteHawbs[] = $r['HAWB'];
        }
    }

    $clienteMap = [];
    if (count($missingClienteHawbs) > 0) {
        $unique = array_unique($missingClienteHawbs);
        $chunks = array_chunk($unique, 100);
        foreach ($chunks as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $masterRows = queryWithRetry($pdo, "SELECT hawb, cliente FROM dados_dachser.t_master_dados WHERE hawb IN ($ph) AND cliente IS NOT NULL AND cliente != ''", $chunk);
            foreach (($masterRows ?: []) as $mr) {
                if ($mr['hawb'] && $mr['cliente'])
                    $clienteMap[$mr['hawb']] = $mr['cliente'];
            }
        }
    }

    $visibilityMap = [];
    try {
        $visRows = queryWithRetry($pdo, "SELECT awb, hawb, hide_reason FROM dados_dachser.t_air_process_visibility");
        foreach (($visRows ?: []) as $v) {
            $visibilityMap["{$v['awb']}|{$v['hawb']}"] = $v['hide_reason'] ?: '';
        }
    } catch (Exception $e) {
    }

    // Discrepancias
    $discrepancyMap = [];
    try {
        $activeAwbs = array_unique(array_filter(array_map(function ($r) {
            return trim($r['AWB']);
        }, $rows ?: [])));
        if (count($activeAwbs) > 0) {
            $awbInClause = "AND tda.awb_number IN (" . implode(',', array_map(function ($a) use ($pdo) {
                return $pdo->quote($a);
            }, $activeAwbs)) . ")";
        } else {
            $awbInClause = "AND 1=0";
        }

        $discSql = "
            WITH base_disc AS (
              SELECT tda.awb_number AS awb, tda.hawb_number AS hawb, tdaf.timeline_json
              FROM dados_dachser.t_dados_aereo tda
              INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb = tda.awb_number AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
              WHERE tda.etd >= '" . $effectiveCutoff . "' $awbInClause AND tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json)
            ),
            eventos_disc AS (
              SELECT b.awb, b.hawb, jt.ordem, jt.description,
                CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)' THEN NULL
                     WHEN UPPER(COALESCE(jt.description,'')) REGEXP 'OFFLOADED|OFLD' AND (UPPER(jt.description) REGEXP '(^|[^0-9])0[[:space:]]+PIECES?([^A-Z]|$)' OR UPPER(jt.description) REGEXP 'QTY:[[:space:]]*0([^0-9]|$)') THEN NULL
                     WHEN UPPER(jt.description) REGEXP 'QTY:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'QTY:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                     WHEN UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'PIECES?:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                     WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]+PIECES?' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'[1-9][0-9]*[[:space:]]+PIECES?'),'[1-9][0-9]*') AS UNSIGNED)
                     ELSE NULL END AS pieces_extraidas,
                CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)' THEN 1 ELSE 0 END AS is_dis_event
              FROM base_disc b
              JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY, description VARCHAR(1000) PATH '$.description')) jt
            ),
            baseline_pieces AS (
              SELECT awb,hawb,pieces_extraidas AS baseline_pecas FROM (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem) AS rn FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0) x WHERE x.rn=1
            ),
            ultimo_evento_absoluto AS (
              SELECT awb,hawb,is_dis_event AS ultimo_is_dis_event FROM (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC) AS rn FROM eventos_disc e) x WHERE x.rn=1
            ),
            eventos_validos_pecas AS (
              SELECT e.awb,e.hawb,e.ordem,e.pieces_extraidas,ROW_NUMBER() OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC) AS rn_desc,SUM(e.pieces_extraidas) OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS soma_pecas_desc
              FROM eventos_disc e WHERE e.pieces_extraidas IS NOT NULL AND e.pieces_extraidas>0
            ),
            ultimo_evento_pecas AS (SELECT awb,hawb,pieces_extraidas AS ultimo_evento_pecas FROM eventos_validos_pecas WHERE rn_desc=1),
            normalizado_por_soma_final AS (SELECT v.awb,v.hawb,MAX(CASE WHEN bp.baseline_pecas IS NOT NULL AND v.rn_desc>=2 AND v.soma_pecas_desc=bp.baseline_pecas THEN 1 ELSE 0 END) AS normalizado_soma_final FROM eventos_validos_pecas v LEFT JOIN baseline_pieces bp ON bp.awb=v.awb AND bp.hawb=v.hawb GROUP BY v.awb,v.hawb),
            agregado_disc AS (SELECT ev.awb,ev.hawb,MIN(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS min_pieces,MAX(CASE WHEN ev.pieces_extraidas IS NOT NULL AND ev.pieces_extraidas>0 THEN ev.pieces_extraidas END) AS max_pieces FROM eventos_disc ev GROUP BY ev.awb,ev.hawb),
            final_classificacao AS (
              SELECT a.awb,a.hawb,bp.baseline_pecas,up.ultimo_evento_pecas,
                CASE WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 1 ELSE 0 END AS pieces_discrepancy,
                CASE WHEN ua.ultimo_is_dis_event=1 THEN 1 ELSE 0 END AS has_dis_event,
                CASE WHEN ua.ultimo_is_dis_event=1 THEN 'DIS_ULTIMO_EVENTO' WHEN bp.baseline_pecas IS NOT NULL AND a.min_pieces IS NOT NULL AND a.max_pieces IS NOT NULL AND a.min_pieces<>a.max_pieces AND NOT(up.ultimo_evento_pecas IS NOT NULL AND up.ultimo_evento_pecas=bp.baseline_pecas) AND COALESCE(ns.normalizado_soma_final,0)=0 THEN 'DISCREPANCIA_REAL' ELSE 'SEM_DISCREPANCIA' END AS status_final
              FROM agregado_disc a LEFT JOIN baseline_pieces bp ON bp.awb=a.awb AND bp.hawb=a.hawb LEFT JOIN ultimo_evento_pecas up ON up.awb=a.awb AND up.hawb=a.hawb LEFT JOIN ultimo_evento_absoluto ua ON ua.awb=a.awb AND ua.hawb=a.hawb LEFT JOIN normalizado_por_soma_final ns ON ns.awb=a.awb AND ns.hawb=a.hawb
            )
            SELECT awb AS AWB,hawb AS HAWB,baseline_pecas AS BASELINE_PECAS,ultimo_evento_pecas AS ULTIMO_EVENTO_PECAS,pieces_discrepancy AS PIECES_DISCREPANCY,has_dis_event AS HAS_DIS_EVENT,status_final AS STATUS_FINAL
            FROM final_classificacao WHERE status_final IN ('DIS_ULTIMO_EVENTO','DISCREPANCIA_REAL')
        ";
        $discSqlStart = microtime(true);
        $discRows = queryWithRetry($pdo, $discSql);
        error_log(sprintf("[tracking-aereo][%s] consulta SQL (discrepâncias) — duração=%.3fs — registros=%d", $requestId, microtime(true) - $discSqlStart, count($discRows ?: [])));
        foreach (($discRows ?: []) as $dr) {
            $discrepancyMap["{$dr['AWB']}|{$dr['HAWB']}"] = [
                'pieces_discrepancy' => (int) $dr['PIECES_DISCREPANCY'] === 1,
                'baseline_pieces' => $dr['BASELINE_PECAS'] !== null ? (int) $dr['BASELINE_PECAS'] : null,
                'has_dis_event' => (int) $dr['HAS_DIS_EVENT'] === 1
            ];
        }
    } catch (Exception $e) {
        error_log('[discrepancy compute] ' . $e->getMessage());
    }

    // Rotas
    $routeMap = [];
    try {
        $activeAwbsRoute = array_unique(array_filter(array_map(function ($r) {
            return trim($r['AWB']);
        }, $rows ?: [])));
        if (count($activeAwbsRoute) > 0) {
            $awbInClauseRoute = "AND tda.awb_number IN (" . implode(',', array_map(function ($a) use ($pdo) {
                return $pdo->quote($a);
            }, $activeAwbsRoute)) . ")";
        } else {
            $awbInClauseRoute = "AND 1=0";
        }

        $routeSql = "
          WITH base_rota AS (
            SELECT tda.awb_number AS awb,tda.hawb_number AS hawb,tdaf.timeline_json,TRIM(COALESCE(tdaf.origin,'')) AS origin_raw,TRIM(COALESCE(tdaf.destination,'')) AS destination_raw
            FROM dados_dachser.t_dados_aereo tda
            INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb = tda.awb_number AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
            WHERE tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json) $awbInClauseRoute
          ),
          base_parse AS (
            SELECT b.awb,b.hawb,b.timeline_json,b.origin_raw,b.destination_raw,
              CASE WHEN b.origin_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.origin_raw,'(',-1),')',1))) WHEN b.origin_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.origin_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS origin_candidate_code,
              CASE WHEN b.destination_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(b.destination_raw,'(',-1),')',1))) WHEN b.destination_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(b.destination_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS destination_candidate_code,
              UPPER(TRIM(b.origin_raw)) COLLATE utf8mb4_unicode_ci AS origin_alias_key,
              UPPER(TRIM(b.destination_raw)) COLLATE utf8mb4_unicode_ci AS destination_alias_key
            FROM base_rota b
          ),
          base_resolvida AS (
            SELECT b.awb,b.hawb,b.timeline_json,
              COALESCE(ai_origin.iata_code,an_origin.iata_code,ac_origin.iata_code) AS origin_code,
              COALESCE(ai_dest.iata_code,an_dest.iata_code,ac_dest.iata_code) AS destination_code
            FROM base_parse b
            LEFT JOIN dados_dachser.t_iata_airports ai_origin ON ai_origin.iata_code COLLATE utf8mb4_unicode_ci=b.origin_candidate_code COLLATE utf8mb4_unicode_ci AND ai_origin.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports an_origin ON UPPER(TRIM(an_origin.airport_name)) COLLATE utf8mb4_unicode_ci=b.origin_alias_key COLLATE utf8mb4_unicode_ci AND an_origin.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports ac_origin ON UPPER(TRIM(ac_origin.city_name)) COLLATE utf8mb4_unicode_ci=b.origin_alias_key COLLATE utf8mb4_unicode_ci AND ac_origin.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports ai_dest ON ai_dest.iata_code COLLATE utf8mb4_unicode_ci=b.destination_candidate_code COLLATE utf8mb4_unicode_ci AND ai_dest.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports an_dest ON UPPER(TRIM(an_dest.airport_name)) COLLATE utf8mb4_unicode_ci=b.destination_alias_key COLLATE utf8mb4_unicode_ci AND an_dest.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports ac_dest ON UPPER(TRIM(ac_dest.city_name)) COLLATE utf8mb4_unicode_ci=b.destination_alias_key COLLATE utf8mb4_unicode_ci AND ac_dest.is_active=1
          ),
          eventos_raw AS (SELECT b.awb,b.hawb,jt.ordem,TRIM(COALESCE(jt.location,'')) AS location_raw FROM base_resolvida b JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY,location VARCHAR(255) PATH '$.location')) jt WHERE jt.location IS NOT NULL AND TRIM(jt.location)<>''),
          eventos_parse AS (
            SELECT e.awb,e.hawb,e.ordem,e.location_raw,
              CASE WHEN e.location_raw REGEXP '\\\\([A-Za-z]{3}\\\\)' THEN UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(e.location_raw,'(',-1),')',1))) WHEN e.location_raw REGEXP '^[A-Za-z]{3}$' THEN UPPER(TRIM(e.location_raw)) ELSE NULL END COLLATE utf8mb4_unicode_ci AS location_candidate_code,
              UPPER(TRIM(e.location_raw)) COLLATE utf8mb4_unicode_ci AS location_alias_key
            FROM eventos_raw e
          ),
          eventos_resolvidos AS (
            SELECT e.awb,e.hawb,e.ordem,COALESCE(ai.iata_code,an.iata_code,ac.iata_code) AS location_code
            FROM eventos_parse e
            LEFT JOIN dados_dachser.t_iata_airports ai ON ai.iata_code COLLATE utf8mb4_unicode_ci=e.location_candidate_code COLLATE utf8mb4_unicode_ci AND ai.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports an ON UPPER(TRIM(an.airport_name)) COLLATE utf8mb4_unicode_ci=e.location_alias_key COLLATE utf8mb4_unicode_ci AND an.is_active=1
            LEFT JOIN dados_dachser.t_iata_airports ac ON UPPER(TRIM(ac.city_name)) COLLATE utf8mb4_unicode_ci=e.location_alias_key COLLATE utf8mb4_unicode_ci AND ac.is_active=1
          ),
          eventos_validos AS (SELECT awb,hawb,ordem,location_code FROM eventos_resolvidos WHERE location_code IS NOT NULL AND TRIM(location_code)<>''),
          eventos_sem_rep AS (SELECT e.awb,e.hawb,e.ordem,e.location_code,LAG(e.location_code) OVER(PARTITION BY e.awb,e.hawb ORDER BY e.ordem) AS prev FROM eventos_validos e),
          rota_timeline_limpa AS (SELECT awb,hawb,ordem,location_code FROM eventos_sem_rep WHERE prev IS NULL OR location_code COLLATE utf8mb4_unicode_ci<>prev COLLATE utf8mb4_unicode_ci),
          timeline_stats AS (SELECT awb,hawb,COUNT(*) AS qtd_pontos,COUNT(DISTINCT location_code) AS qtd_distintos FROM rota_timeline_limpa GROUP BY awb,hawb),
          primeiro_ultimo AS (
            SELECT x.awb,x.hawb,MAX(CASE WHEN x.rn_asc=1 THEN x.location_code END) AS first_code,MAX(CASE WHEN x.rn_desc=1 THEN x.location_code END) AS last_code
            FROM (SELECT r.awb,r.hawb,r.location_code,ROW_NUMBER() OVER(PARTITION BY r.awb,r.hawb ORDER BY r.ordem ASC) AS rn_asc,ROW_NUMBER() OVER(PARTITION BY r.awb,r.hawb ORDER BY r.ordem DESC) AS rn_desc FROM rota_timeline_limpa r) x
            GROUP BY x.awb,x.hawb
          ),
          rota_base_final AS (
            SELECT b.awb,b.hawb,
              CASE WHEN b.origin_code IS NOT NULL AND (b.destination_code IS NULL OR b.origin_code COLLATE utf8mb4_unicode_ci<>b.destination_code COLLATE utf8mb4_unicode_ci) THEN b.origin_code
                   WHEN b.origin_code IS NULL AND b.destination_code IS NULL AND ts.qtd_distintos>=2 AND p.first_code IS NOT NULL AND p.last_code IS NOT NULL AND p.first_code COLLATE utf8mb4_unicode_ci<>p.last_code COLLATE utf8mb4_unicode_ci THEN p.first_code
                   ELSE NULL END AS origin_final,
              CASE WHEN b.destination_code IS NOT NULL AND (b.origin_code IS NULL OR b.destination_code COLLATE utf8mb4_unicode_ci<>b.origin_code COLLATE utf8mb4_unicode_ci) THEN b.destination_code
                   WHEN b.origin_code IS NULL AND b.destination_code IS NULL AND ts.qtd_distintos>=2 AND p.first_code IS NOT NULL AND p.last_code IS NOT NULL AND p.first_code COLLATE utf8mb4_unicode_ci<>p.last_code COLLATE utf8mb4_unicode_ci THEN p.last_code
                   ELSE NULL END AS destination_final,
              ts.qtd_pontos,ts.qtd_distintos,p.first_code,p.last_code
            FROM base_resolvida b LEFT JOIN timeline_stats ts ON ts.awb=b.awb AND ts.hawb=b.hawb LEFT JOIN primeiro_ultimo p ON p.awb=b.awb AND p.hawb=b.hawb
          ),
          conexoes_inter AS (
            SELECT r.awb,r.hawb,GROUP_CONCAT(r.location_code ORDER BY r.ordem SEPARATOR ',') AS conexoes
            FROM rota_timeline_limpa r INNER JOIN rota_base_final f ON f.awb=r.awb AND f.hawb=r.hawb
            WHERE (f.origin_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci<>f.origin_final COLLATE utf8mb4_unicode_ci)
              AND (f.destination_final IS NULL OR r.location_code COLLATE utf8mb4_unicode_ci<>f.destination_final COLLATE utf8mb4_unicode_ci)
            GROUP BY r.awb,r.hawb
          )
          SELECT f.awb AS AWB,f.hawb AS HAWB,f.origin_final AS ORIGEM_FINAL,f.destination_final AS DESTINO_FINAL,ci.conexoes AS CONEXOES,
            CASE WHEN f.origin_final IS NULL AND f.destination_final IS NULL THEN 'SEM_ORIGEM_DESTINO_CONFIAVEIS'
                 WHEN f.origin_final IS NULL OR f.destination_final IS NULL THEN 'ROTA_INCOMPLETA'
                 WHEN f.origin_final COLLATE utf8mb4_unicode_ci=f.destination_final COLLATE utf8mb4_unicode_ci THEN 'ORIGEM_DESTINO_IGUAIS'
                 ELSE 'OK' END AS STATUS_ROTA
          FROM rota_base_final f LEFT JOIN conexoes_inter ci ON ci.awb=f.awb AND ci.hawb=f.hawb
        ";
        $routeSqlStart = microtime(true);
        $routeRows = queryWithRetry($pdo, $routeSql);
        error_log(sprintf("[tracking-aereo][%s] consulta SQL (rotas) — duração=%.3fs — registros=%d", $requestId, microtime(true) - $routeSqlStart, count($routeRows ?: [])));
        foreach (($routeRows ?: []) as $rr) {
            $routeMap["{$rr['AWB']}|{$rr['HAWB']}"] = [
                'origin' => $rr['ORIGEM_FINAL'] ?: null,
                'destination' => $rr['DESTINO_FINAL'] ?: null,
                'conexoes' => $rr['CONEXOES'] ?: null,
                'status' => $rr['STATUS_ROTA'] ?: ''
            ];
        }
    } catch (Exception $e) {
        error_log('[routes compute] ' . $e->getMessage());
    }

    $iataWeight = [
        'POD' => 44,
        'DLV' => 43,
        'NFD' => 42,
        'RCF' => 41,
        'AWD' => 40,
        'ARR' => 39,
        'TRM' => 38,
        'TFD' => 37,
        'DEP' => 36,
        'MAN' => 35,
        'RCS' => 34,
        'RCT' => 34,
        'FOH' => 33,
        'BKD' => 32,
        'AWR' => 40,
        'CCD' => 40,
        'FWB' => 4,
        'DOC' => 12,
        'PRE' => 20,
        'TRA' => 32,
        'DIS' => 30,
        'OFLD' => 28
    ];
    $validIata = array_merge(array_keys($iataWeight), ['OFLD', 'NIL', 'NIF', 'DIS', 'TFD', 'RCT', 'TRM', 'POD', 'UNK']);
    $validIataSet = array_flip($validIata);

    $validate = function ($c) use ($validIataSet) {
        if (!$c)
            return null;
        $u = strtoupper(trim($c));
        return isset($validIataSet[$u]) ? $u : null;
    };

    $resolveCode = function ($desc) use ($descLookup) {
        if (!$desc || $desc === 'null')
            return null;
        $upper = strtoupper($desc);
        if (strpos($upper, 'OFFLOADED') !== false)
            return 'OFLD';
        if (strpos($upper, 'READY FOR PICK-UP') !== false || strpos($upper, 'AGENT NOTIFIED') !== false || strpos($upper, 'NOTIFIED FOR DELIVERY') !== false)
            return 'NFD';
        if (strpos($upper, 'DOCUMENTS DELIVERED') !== false)
            return 'AWD';
        if (strpos($upper, 'RECEIVED FROM FLIGHT') !== false)
            return 'RCF';
        if (strpos($upper, 'RECEIVED FROM CARRIER') !== false)
            return 'RCT';
        if (strpos($upper, 'RECEIVED FROM SHIPPER') !== false || strpos($upper, 'READY FOR CARRIAGE') !== false)
            return 'RCS';
        if (strpos($upper, 'FREIGHT ON HAND') !== false)
            return 'FOH';
        if (strpos($upper, 'MANIFESTED') !== false)
            return 'MAN';
        if (strpos($upper, 'DEPARTED') !== false)
            return 'DEP';
        if (strpos($upper, 'ARRIVED') !== false)
            return 'ARR';
        if (strpos($upper, 'DELIVERED') !== false)
            return 'DLV';
        foreach ($descLookup as $d) {
            if (strpos($upper, $d['description']) === 0)
                return $d['code'];
        }
        return null;
    };

    $resolveCodeFromSlot = function ($nativeCode, $desc) use ($validate, $exactMap, $keywordIndex, $resolveCode) {
        $native = strtoupper(trim((string)($nativeCode ?? '')));
        if ($native && preg_match('/^[A-Z]{2,5}$/', $native)) {
            $v = $validate($native);
            if ($v)
                return $v;
        }
        if (!$desc || $desc === 'null')
            return null;

        // normaliza desc
        $normDesc = trim(preg_replace('/\s+/', ' ', preg_replace('/[^\w\s]/u', ' ', strtoupper(trim($desc)))));
        if ($normDesc) {
            if (isset($exactMap[$normDesc])) {
                $v = $validate($exactMap[$normDesc]);
                if ($v)
                    return $v;
            }
            foreach ($keywordIndex as $kw) {
                if ($kw['needle'] && strpos($normDesc, $kw['needle']) !== false) {
                    $v = $validate($kw['code']);
                    if ($v)
                        return $v;
                }
            }
        }

        if (preg_match('/\|\s*Code\s+([A-Z]{2,5})\s*\|/i', $desc, $m)) {
            $v = $validate($m[1]);
            if ($v)
                return $v;
        }
        if (preg_match('/^([A-Z]{2,5})\b/i', trim($desc), $m)) {
            $v = $validate($m[1]);
            if ($v)
                return $v;
        }
        if (preg_match('/\(([A-Z]{2,5})\)/i', $desc, $m)) {
            $v = $validate($m[1]);
            if ($v)
                return $v;
        }
        return $validate($resolveCode($desc));
    };

    $parseSlotDateMs = function ($s) {
        if (!$s)
            return 0;
        $direct = strtotime($s);
        if ($direct !== false && $direct > 0)
            return $direct * 1000;

        if (preg_match('/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/i', $s, $m)) {
            $months = ['jan' => 0, 'feb' => 1, 'mar' => 2, 'apr' => 3, 'may' => 4, 'jun' => 5, 'jul' => 6, 'aug' => 7, 'sep' => 8, 'oct' => 9, 'nov' => 10, 'dec' => 11];
            $mo = isset($months[strtolower($m[2])]) ? $months[strtolower($m[2])] : null;
            if ($mo !== null) {
                $hr = isset($m[4]) ? (int) $m[4] : 0;
                $mn = isset($m[5]) ? (int) $m[5] : 0;
                return gmmktime($hr, $mn, 0, $mo + 1, (int) $m[1], (int) $m[3]) * 1000;
            }
        }
        return 0;
    };

    $pickTopByIATA = function ($row) use ($resolveCodeFromSlot, $parseSlotDateMs, $iataWeight) {
        $slots = [
            ['code' => $resolveCodeFromSlot($row['code0_native'], $row['desc0']), 'desc' => $row['desc0'], 'loc' => $row['loc0'], 'date' => $row['date0'], 'idx' => 0],
            ['code' => $resolveCodeFromSlot($row['code1_native'], $row['desc1']), 'desc' => $row['desc1'], 'loc' => $row['loc1'], 'date' => $row['date1'], 'idx' => 1],
            ['code' => $resolveCodeFromSlot($row['code2_native'], $row['desc2']), 'desc' => $row['desc2'], 'loc' => $row['loc2'], 'date' => $row['date2'], 'idx' => 2],
            ['code' => $resolveCodeFromSlot($row['code3_native'], $row['desc3']), 'desc' => $row['desc3'], 'loc' => $row['loc3'], 'date' => $row['date3'], 'idx' => 3],
            ['code' => $resolveCodeFromSlot($row['code4_native'], $row['desc4']), 'desc' => $row['desc4'], 'loc' => $row['loc4'], 'date' => $row['date4'], 'idx' => 4],
            ['code' => $resolveCodeFromSlot($row['code5_native'], $row['desc5']), 'desc' => $row['desc5'], 'loc' => $row['loc5'], 'date' => $row['date5'], 'idx' => 5],
        ];

        $slots = array_filter($slots, function ($s) {
            return $s['desc'] || $s['code'];
        });
        if (count($slots) === 0)
            return ['code' => null, 'desc' => null, 'loc' => null, 'date' => null, 'idx' => -1];

        $isBkd = function ($c) {
            $u = strtoupper(trim($c));
            return $u === 'BKD' || $u === 'BKG' || $u === 'BOOKED';
        };

        $nonBkd = array_filter($slots, function ($s) use ($isBkd) {
            return !$isBkd($s['code']);
        });
        $activeSlots = count($nonBkd) > 0 ? $nonBkd : $slots;

        $slotsWithDate = [];
        foreach ($activeSlots as $s) {
            $s['dateMs'] = $parseSlotDateMs($s['date']);
            $slotsWithDate[] = $s;
        }

        $latestDateMs = count($slotsWithDate) > 0 ? max(array_column($slotsWithDate, 'dateMs')) : 0;
        if ($latestDateMs <= 0) {
            // retorna o de menor index
            usort($activeSlots, function ($a, $b) {
                return $a['idx'] - $b['idx'];
            });
            return reset($activeSlots);
        }

        $bestGroup = array_filter($slotsWithDate, function ($s) use ($latestDateMs) {
            return $s['dateMs'] === $latestDateMs;
        });

        $winner = reset($bestGroup);
        $winnerW = isset($iataWeight[strtoupper($winner['code'])]) ? $iataWeight[strtoupper($winner['code'])] : 0;

        foreach ($bestGroup as $s) {
            $w = isset($iataWeight[strtoupper($s['code'])]) ? $iataWeight[strtoupper($s['code'])] : 0;
            if ($w > $winnerW || ($w === $winnerW && $s['idx'] < $winner['idx'])) {
                $winner = $s;
                $winnerW = $w;
            }
        }
        return $winner;
    };

    $stopWordsConn = array_flip([
        'NIL',
        'NIF',
        'DIS',
        'OFD',
        'OFL',
        'BUP',
        'RDP',
        'LAT',
        'TKG',
        'SCR',
        'ECC',
        'TFD',
        'TRM',
        'RFC',
        'DMG',
        'RET',
        'AWB',
        'PRE',
        'DEP',
        'ARR',
        'RCF',
        'RCS',
        'MAN',
        'NFD',
        'DLV',
        'POD',
        'BKD',
        'BKG',
        'BKF',
        'FOH',
        'AWD',
        'CCD',
        'ASN',
        'MOV',
        'OFLD',
        'FWB',
        'DOC',
        'AWR',
        'TDE',
        'LOF',
        'TFS',
        'MIS',
        'BCBP',
        'UNK',
        'TRA',
        'PRD',
        'RCP',
        'CAN',
        'LRC',
        'FSH',
        'FSU',
        'AND',
        'THE',
        'FOR',
        'BUT',
        'NOT',
        'ALL',
        'ANY',
        'ARE',
        'OUR',
        'ONE',
        'TWO',
        'NEW',
        'OLD',
        'WAY',
        'OUT',
        'OFF',
        'END',
        'NOW',
        'WHO',
        'HOW',
        'ITS',
        'HIM',
        'HER',
        'HIS',
        'OWN',
        'GET',
        'PUT',
        'SET',
        'LET',
        'HAS',
        'HAD',
        'USE',
        'ACT',
        'AGE',
        'AIR',
        'FAR',
        'YET',
        'TOP',
        'DAY',
        'MAY',
        'FLT',
        'AGT',
        'SHT'
    ]);

    $suppressedDiscrepancyAwbs = array_flip(['047-32916380']);

    $data = [];
    $failed = [];

    foreach (($rows ?: []) as $row) {
        $timeline = [];
        if ($row['TIMELINE']) {
            $timeline = is_string($row['TIMELINE']) ? json_decode($row['TIMELINE'], true) : $row['TIMELINE'];
        }

        $lastStatusCode = $row['last_status_code'] ?: '';
        $top = $pickTopByIATA($row);
        $codeFromTimeline = $top['code'];
        $routeKey = "{$row['AWB']}|{$row['HAWB']}";
        $routeEntry = isset($routeMap[$routeKey]) ? $routeMap[$routeKey] : null;

        $allCodes = [
            $top['code'],
            $resolveCodeFromSlot($row['code1_native'], $row['desc1']),
            $resolveCodeFromSlot($row['code2_native'], $row['desc2']),
            $resolveCodeFromSlot($row['code3_native'], $row['desc3']),
            $resolveCodeFromSlot($row['code4_native'], $row['desc4']),
            $resolveCodeFromSlot($row['code5_native'], $row['desc5'])
        ];

        $sanitizedLastStatus = strtoupper(trim($lastStatusCode));
        $safeLastStatus = isset($validIataSet[$sanitizedLastStatus]) ? $sanitizedLastStatus : null;

        $finalCode = null;
        $hasDlvOrPod = false;
        foreach ($allCodes as $c) {
            if ($c === 'DLV' || $c === 'POD') {
                $hasDlvOrPod = true;
                break;
            }
        }
        if ($sanitizedLastStatus === 'DLV' || $sanitizedLastStatus === 'POD') {
            $hasDlvOrPod = true;
        }

        if ($hasDlvOrPod) {
            $hasPod = false;
            foreach ($allCodes as $c) {
                if ($c === 'POD') {
                    $hasPod = true;
                    break;
                }
            }
            if ($sanitizedLastStatus === 'POD')
                $hasPod = true;

            $finalCode = $hasPod ? 'POD' : 'DLV';
        } else {
            $finalCode = $codeFromTimeline ?: ($safeLastStatus ?: null);
        }

        $electedLoc = $top['loc'] ?: ($row['loc0'] ?: '');
        $electedDate = $top['date'] ?: ($row['date0'] ?: '');

        if ($finalCode === 'ARR') {
            $loc = extractIATA($electedLoc);
            $authDest = $routeEntry ? $routeEntry['destination'] : null;
            $dest = $authDest ?: extractIATA($row['DESTINO'] ?: '');
            if ($dest && $loc && $loc === $dest)
                $finalCode = 'ARR - DESTINO';
            elseif ($authDest && $loc && $loc !== $authDest)
                $finalCode = 'ARR - CONEXÃO';
        }

        $dateStr = $electedDate ?: null;
        if (!$dateStr) {
            $dateStr = trim(($row['date0'] ?: '') . ' ' . ($row['time0'] ?: '')) ?: null;
        }
        if (!$dateStr && is_array($timeline) && count($timeline) > 0) {
            foreach ($timeline as $evt) {
                $d = trim(isset($evt['date']) ? $evt['date'] : (isset($evt['Date']) ? $evt['Date'] : ''));
                if ($d) {
                    $dateStr = $d;
                    break;
                }
            }
        }

        $arrDestinoDate = null;
        $destIATA = ($routeEntry && $routeEntry['destination']) ? $routeEntry['destination'] : extractIATA($row['DESTINO'] ?: '');
        if ($destIATA && is_array($timeline) && count($timeline) > 0) {
            foreach ($timeline as $evt) {
                $desc = strtoupper(isset($evt['description']) ? $evt['description'] : (isset($evt['Description']) ? $evt['Description'] : ''));
                $evtLoc = extractIATA(isset($evt['location']) ? $evt['location'] : (isset($evt['Location']) ? $evt['Location'] : ''));
                if (strpos($desc, 'ARRIVED') !== false && $evtLoc === $destIATA) {
                    $d = trim(isset($evt['date']) ? $evt['date'] : (isset($evt['Date']) ? $evt['Date'] : ''));
                    if ($d) {
                        $arrDestinoDate = $d;
                        break;
                    }
                }
            }
        }

        $hideReason = isset($visibilityMap[$routeKey]) ? $visibilityMap[$routeKey] : '';
        $disc = isset($discrepancyMap[$routeKey]) ? $discrepancyMap[$routeKey] : ['pieces_discrepancy' => false, 'baseline_pieces' => null, 'has_dis_event' => false];
        if (isset($suppressedDiscrepancyAwbs[trim($row['AWB'])])) {
            $disc = ['pieces_discrepancy' => false, 'baseline_pieces' => null, 'has_dis_event' => false];
        }

        $workingOrigin = ($routeEntry && $routeEntry['origin']) ? $routeEntry['origin'] : extractIATA($row['ORIGEM'] ?: '');
        $workingDest = ($routeEntry && $routeEntry['destination']) ? $routeEntry['destination'] : extractIATA($row['DESTINO'] ?: '');

        if ($workingOrigin && $workingDest && $workingOrigin === $workingDest && is_array($timeline) && count($timeline) > 0) {
            $chronoScan = array_reverse($timeline);
            $foundAny = false;
            $derivedDest = $workingDest;
            foreach ($chronoScan as $evt) {
                $loc = strtoupper(trim(isset($evt['location']) ? $evt['location'] : (isset($evt['Location']) ? $evt['Location'] : '')));
                $apt = (strlen($loc) === 3 && !isset($stopWordsConn[$loc])) ? $loc : null;
                if (!$apt) {
                    $d = strtoupper(isset($evt['description']) ? $evt['description'] : (isset($evt['Description']) ? $evt['Description'] : ''));
                    if (preg_match('/\b(?:FROM|IN|AT|DEPARTED|ARRIVED|TO)\s+([A-Z]{3})\b/', $d, $m)) {
                        if (!isset($stopWordsConn[$m[1]]))
                            $apt = $m[1];
                    }
                }
                if (!$apt)
                    continue;
                if (!$foundAny) {
                    $workingOrigin = $apt;
                    $foundAny = true;
                }
                $derivedDest = $apt;
            }
            if ($foundAny)
                $workingDest = $derivedDest;
        }

        $originIATAforConn = $workingOrigin;
        $destinIATAforConn = $workingDest;

        $seenAirports = [];
        $seenSet = [];
        if (is_array($timeline) && count($timeline) > 0) {
            $chronological = array_reverse($timeline);
            $destReached = false;
            foreach ($chronological as $evt) {
                if ($destReached)
                    break;
                $candidates = [];

                $loc = extractIATA(isset($evt['location']) ? $evt['location'] : (isset($evt['Location']) ? $evt['Location'] : ''));
                if ($loc)
                    $candidates[] = $loc;

                $desc = strtoupper(isset($evt['description']) ? $evt['description'] : (isset($evt['Description']) ? $evt['Description'] : ''));
                if (preg_match('/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH|AWD)\s+([A-Z]{3})\b/', $desc, $evtPrefix)) {
                    $candidates[] = $evtPrefix[1];
                }
                if (preg_match('/\b(?:FROM|IN|AT|DEPARTED|ARRIVED)\s+([A-Z]{3})\b/', $desc, $prepMatch)) {
                    $candidates[] = $prepMatch[1];
                }
                if (preg_match_all('/\b([A-Z]{3})\s*(?:->|-|→|\/)\s*([A-Z]{3})\b/', $desc, $routeMatches, PREG_SET_ORDER)) {
                    foreach ($routeMatches as $m) {
                        $candidates[] = $m[1];
                        $candidates[] = $m[2];
                    }
                }
                if (preg_match('/\(([A-Z]{3})\)/', $desc, $parenMatch)) {
                    $candidates[] = $parenMatch[1];
                }

                foreach ($candidates as $apt) {
                    if (!$apt || strlen($apt) !== 3)
                        continue;
                    if (isset($stopWordsConn[$apt]))
                        continue;
                    if ($apt === $originIATAforConn || $apt === $destinIATAforConn)
                        continue;
                    if (isset($seenSet[$apt]))
                        continue;
                    $seenSet[$apt] = true;
                    $seenAirports[] = $apt;
                }
                if ($loc && !isset($stopWordsConn[$loc]) && $loc === $destinIATAforConn)
                    $destReached = true;
            }
        }

        $conexao = count($seenAirports) > 0 ? implode(',', $seenAirports) : null;
        $rawConexao = $routeEntry ? $routeEntry['conexoes'] : $conexao;

        $finalConexao = null;
        if ($rawConexao) {
            $parts = explode(',', $rawConexao);
            $cleanParts = [];
            foreach ($parts as $c) {
                $c = strtoupper(trim($c));
                if (strlen($c) === 3 && !isset($stopWordsConn[$c]))
                    $cleanParts[] = $c;
            }
            $finalConexao = count($cleanParts) > 0 ? implode(',', $cleanParts) : null;
        }

        $finalOrigin = $workingOrigin ?: ($row['ORIGEM'] ?: '');
        $finalDestination = $workingDest ?: ($row['DESTINO'] ?: '');

        $hasGroundFlightPattern = function ($val) {
            $clean = strtoupper(trim(preg_replace('/\s+/', ' ', str_replace('\/', '/', $val))));
            $clean = preg_replace('/[,;]\s*$/', '', $clean);
            return preg_match('/\b[A-Z]{2,3}\s?\d{2,5}-T\b/', $clean) || preg_match('/\b[A-Z]{2,3}\s?\d{2,5}\s*X\s*\/\s*D\b/', $clean);
        };

        $idx = $top['idx'];
        $electedDesc = (string) ($top['desc'] ?: (($idx >= 0 && isset($row["desc{$idx}"])) ? $row["desc{$idx}"] : ''));
        $isGroundTransport = false;
        if ($electedDesc && $hasGroundFlightPattern($electedDesc))
            $isGroundTransport = true;

        if (!$finalCode) {
            $failed[] = ['awb' => $row['AWB'] ?: '', 'hawb' => $row['HAWB'] ?: '', 'cliente' => $row['CLIENTE'] ?: ''];
        }

        $data[] = [
            'id' => $row['id'] ?: '',
            'awb_number' => $row['AWB'] ?: '',
            'hawb_number' => $row['HAWB'] ?: '',
            'consignee_nome' => $row['CLIENTE'] ?: (isset($clienteMap[$row['HAWB']]) ? $clienteMap[$row['HAWB']] : ''),
            'tipo_servico' => $row['TIPO_SERVICO'] ?: '',
            'etd' => $row['ETD'] ?: null,
            'clerk' => $row['ANALISTA'] ?: '',
            'origin' => $finalOrigin,
            'destination' => $finalDestination,
            'conexao' => $finalConexao,
            'route_status' => $routeEntry ? $routeEntry['status'] : null,
            'timeline_json' => $timeline,
            'last_event' => $finalCode ?: '',
            'last_event_description' => isset($eventMap[$finalCode]) ? $eventMap[$finalCode]['descricao_en'] : '',
            'last_status_code' => $finalCode ?: '',
            'last_event_date' => $dateStr,
            'last_event_location' => $electedLoc,
            'penultimate_location' => $row['loc1'] ?: '',
            'arr_destino_date' => $arrDestinoDate,
            'hide_reason' => $hideReason,
            'pieces_discrepancy' => $disc['pieces_discrepancy'],
            'baseline_pieces' => $disc['baseline_pieces'],
            'has_dis_event' => $disc['has_dis_event'],
            'hours_in_status' => $row['hours_in_status_rounded'] !== null ? (float) $row['hours_in_status_rounded'] : null,
            'sla_limite_horas' => $row['sla_limite_horas'] !== null ? (float) $row['sla_limite_horas'] : null,
            'sla_ratio' => $row['sla_ratio'] !== null ? (float) $row['sla_ratio'] : null,
            'sla_cor' => $row['sla_cor'] ?: null,
            'sla_tempo_formatado' => $row['sla_tempo_formatado'] ?: null,
            'sla_tooltip' => $row['sla_tooltip'] ?: null,
            'is_ground_transport' => $isGroundTransport,
        ];
    }

    error_log("[tracking-aereo][$requestId] início da serialização JSON");
    $serializeStart = microtime(true);
    $result = ['success' => true, 'data' => $data, 'failed_count' => count($failed)];
    $approxResponseBytes = strlen(json_encode($result));
    error_log(sprintf(
        "[tracking-aereo][%s] fim da serialização JSON — duração=%.3fs — quantidade de registros=%d — tamanho aproximado da resposta=%d bytes — duração total do compute=%.3fs",
        $requestId, microtime(true) - $serializeStart, count($data), $approxResponseBytes, microtime(true) - $computeStart
    ));
    return $result;
}

// ── ROTAS / HANDLERS ─────────────────────────────────────────────────────────

// GET /api/air/tracking-aereo
// Fluxo único e síncrono: consulta o MariaDB e devolve todos os AWBs da janela
// de ETD_CUTOFF numa resposta só. Sem parâmetros — não há mais cache, force,
// paginação por cursor nem recompute em background para configurar.
$router->get('air/tracking-aereo', function ($params) {
    // request_id por requisição — permite conferir no log quantas chamadas o
    // frontend realmente dispara e quanto tempo cada uma leva.
    $requestId = substr(md5(uniqid('', true)), 0, 10);
    $routeStart = microtime(true);
    error_log("[tracking-aereo][$requestId] início da requisição em " . date('c'));

    try {
        $result = computeTrackingData($requestId);
        error_log(sprintf("[tracking-aereo][%s] duração total (até enviar resposta)=%.3fs", $requestId, microtime(true) - $routeStart));
        sendJson($result);
    } catch (Exception $e) {
        error_log("[tracking-aereo][$requestId] erro completo: " . $e->getMessage() . "\n" . $e->getTraceAsString());
        sendJson([
            'success' => false,
            'message' => 'Não foi possível carregar os dados do Tracking Aéreo.',
            'error' => $e->getMessage(),
            'request_id' => $requestId,
        ], 500);
    }
});

// GET /api/air/test-query
$router->get('air/test-query', function ($params) {
    try {
        $pdo = getPDO();
        $stmt = $pdo->query("SELECT VERSION() AS ver");
        $db_version = $stmt->fetch()['ver'];

        // 1. Testar t_eventos_awb
        try {
            $pdo->query("SELECT 1 FROM dados_dachser.t_eventos_awb LIMIT 1");
            $q1 = "OK";
        } catch (Exception $e) {
            $q1 = "ERRO: " . $e->getMessage();
        }

        // 2. Testar t_description_eventos
        try {
            $pdo->query("SELECT 1 FROM dados_dachser.t_description_eventos LIMIT 1");
            $q2 = "OK";
        } catch (Exception $e) {
            $q2 = "ERRO: " . $e->getMessage();
        }

        // 3. Testar a query principal (sem JSON_TABLE, que está em sla_calc / base)
        $etdCutoff = isset($_ENV['AIR_ETD_CUTOFF']) ? $_ENV['AIR_ETD_CUTOFF'] : '2026-06-01';
        try {
            $sql = "
                WITH base AS (
                  SELECT tda.awb_number AS AWB, tda.hawb_number AS HAWB, tda.consignee_nome AS CLIENTE,
                      tda.tipo_servico AS TIPO_SERVICO, tda.etd AS ETD,
                      tdaf.origin AS ORIGEM, tdaf.destination AS DESTINO, tda.clerk AS ANALISTA,
                      tdaf.last_status_code,
                      tdaf.timeline_json AS TIMELINE,
                      json_unquote(json_extract(tdaf.timeline_json,'$[0].description')) AS desc0,
                      json_unquote(json_extract(tdaf.timeline_json,'$[1].description')) AS desc1,
                      json_unquote(json_extract(tdaf.timeline_json,'$[2].description')) AS desc2,
                      json_unquote(json_extract(tdaf.timeline_json,'$[3].description')) AS desc3,
                      json_unquote(json_extract(tdaf.timeline_json,'$[4].description')) AS desc4,
                      json_unquote(json_extract(tdaf.timeline_json,'$[5].description')) AS desc5,
                      json_unquote(json_extract(tdaf.timeline_json,'$[0].location'))    AS loc0,
                      json_unquote(json_extract(tdaf.timeline_json,'$[1].location'))    AS loc1,
                      json_unquote(json_extract(tdaf.timeline_json,'$[2].location'))    AS loc2,
                      json_unquote(json_extract(tdaf.timeline_json,'$[3].location'))    AS loc3,
                      json_unquote(json_extract(tdaf.timeline_json,'$[4].location'))    AS loc4,
                      json_unquote(json_extract(tdaf.timeline_json,'$[5].location'))    AS loc5,
                      json_unquote(json_extract(tdaf.timeline_json,'$[0].date'))        AS date0,
                      json_unquote(json_extract(tdaf.timeline_json,'$[1].date'))        AS date1,
                      json_unquote(json_extract(tdaf.timeline_json,'$[2].date'))        AS date2,
                      json_unquote(json_extract(tdaf.timeline_json,'$[3].date'))        AS date3,
                      json_unquote(json_extract(tdaf.timeline_json,'$[4].date'))        AS date4,
                      json_unquote(json_extract(tdaf.timeline_json,'$[5].date'))        AS date5,
                      json_unquote(json_extract(tdaf.timeline_json,'$[0].time'))        AS time0,
                      json_unquote(json_extract(tdaf.timeline_json,'$[0].status_code')) AS code0_native,
                      json_unquote(json_extract(tdaf.timeline_json,'$[1].status_code')) AS code1_native,
                      json_unquote(json_extract(tdaf.timeline_json,'$[2].status_code')) AS code2_native,
                      json_unquote(json_extract(tdaf.timeline_json,'$[3].status_code')) AS code3_native,
                      json_unquote(json_extract(tdaf.timeline_json,'$[4].status_code')) AS code4_native,
                      json_unquote(json_extract(tdaf.timeline_json,'$[5].status_code')) AS code5_native
                  FROM dados_dachser.t_dados_aereo tda
                  LEFT JOIN dados_dachser.t_fato_aereo tdaf
                      ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci
                  WHERE tda.etd >= ?
                ),
                event_time AS (
                  SELECT b.*,
                      str_to_date(concat(nullif(b.date0,''), CASE WHEN nullif(b.time0,'') IS NOT NULL THEN concat(' ',b.time0) ELSE ' 00:00' END),'%d %b %Y %H:%i') AS data_evento_base
                  FROM base b
                ),
                sla_calc AS (
                  SELECT e.*,
                      timestampdiff(SECOND, e.data_evento_base, now())/3600 AS sla_hours_in_status,
                      CASE
                          WHEN e.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN null
                          WHEN e.last_status_code='BKD' THEN 12 WHEN e.last_status_code='RCS' THEN 12
                          WHEN e.last_status_code='MAN' THEN 3  WHEN e.last_status_code='PRE' THEN 6
                          WHEN e.last_status_code='RCF' THEN 6  WHEN e.last_status_code='DEP' THEN 48
                          WHEN e.last_status_code='FOH' THEN 12 WHEN e.last_status_code='FWB' THEN 24
                          WHEN e.last_status_code='RDP' THEN 3  WHEN e.last_status_code='RFC' THEN 6
                          ELSE 24
                      END AS sla_limite_horas
                  FROM event_time e
                )
                SELECT s.*,
                    round(s.sla_hours_in_status,2) AS hours_in_status_rounded,
                    CASE WHEN s.sla_limite_horas IS null OR s.sla_limite_horas=0 THEN null
                         ELSE round(s.sla_hours_in_status/s.sla_limite_horas,4) END AS sla_ratio,
                    CASE WHEN s.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN 'VERDE'
                         WHEN s.sla_limite_horas IS null OR s.sla_limite_horas=0 THEN null
                         WHEN s.sla_hours_in_status/s.sla_limite_horas<0.7 THEN 'VERDE'
                         WHEN s.sla_hours_in_status/s.sla_limite_horas<1.0 THEN 'AMARELO'
                         ELSE 'VERMELHO' END AS sla_cor,
                    CASE WHEN s.sla_hours_in_status IS null THEN null
                         WHEN s.sla_hours_in_status<24 THEN concat(floor(s.sla_hours_in_status),'h',lpad(floor((s.sla_hours_in_status-floor(s.sla_hours_in_status))*60),2,'0'))
                         ELSE concat(floor(s.sla_hours_in_status/24),'d',lpad(floor(mod(s.sla_hours_in_status,24)),2,'0'),'h') END AS sla_tempo_formatado,
                    CASE WHEN s.last_status_code IN ('ARR','ARR - DESTINO','ARR - CONEXAO','ARR - CONEXÃO','RCF','NFD','AWD','AWR','CCD','DLV','POD') THEN 'Status pós-chegada/final'
                         WHEN s.sla_limite_horas IS null THEN null
                         ELSE concat(round(s.sla_hours_in_status/s.sla_limite_horas*100,1),'% do limite') END AS sla_tooltip
                FROM sla_calc s LIMIT 1
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$etdCutoff]);
            $stmt->fetchAll();
            $q3 = "OK";
        } catch (Exception $e) {
            $q3 = "ERRO: " . $e->getMessage();
        }

        // 4. Testar a query com JSON_TABLE (discrepâncias)
        try {
            $discSql = "
                WITH base_disc AS (
                  SELECT tda.awb_number AS awb, tda.hawb_number AS hawb, tdaf.timeline_json
                  FROM dados_dachser.t_dados_aereo tda
                  INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb COLLATE utf8mb4_unicode_ci = tda.awb_number COLLATE utf8mb4_unicode_ci AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json, JSON_ARRAY(tda.hawb_number))
                  WHERE tda.etd >= ? AND tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json)
                ),
                eventos_disc AS (
                  SELECT b.awb, b.hawb, jt.ordem, jt.description,
                    CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)' THEN NULL
                         WHEN UPPER(COALESCE(jt.description,'')) REGEXP 'OFFLOADED|OFLD' AND (UPPER(jt.description) REGEXP '(^|[^0-9])0[[:space:]]+PIECES?([^A-Z]|$)' OR UPPER(jt.description) REGEXP 'QTY:[[:space:]]*0([^0-9]|$)') THEN NULL
                         WHEN UPPER(jt.description) REGEXP 'QTY:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'QTY:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                         WHEN UPPER(jt.description) REGEXP 'PIECES?:[[:space:]]*[1-9][0-9]*' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'PIECES?:[[:space:]]*[1-9][0-9]*'),'[1-9][0-9]*') AS UNSIGNED)
                         WHEN UPPER(jt.description) REGEXP '[1-9][0-9]*[[:space:]]+PIECES?' THEN CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(UPPER(jt.description),'[1-9][0-9]*[[:space:]]+PIECES?'),'[1-9][0-9]*') AS UNSIGNED)
                         ELSE NULL END AS pieces_extraidas,
                    CASE WHEN UPPER(COALESCE(jt.description,'')) REGEXP '(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)' THEN 1 ELSE 0 END AS is_dis_event
                  FROM base_disc b
                  JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY, description VARCHAR(1000) PATH '$.description')) jt
                )
                SELECT * FROM eventos_disc LIMIT 1
            ";
            $stmt = $pdo->prepare($discSql);
            $stmt->execute([$etdCutoff]);
            $stmt->fetchAll();
            $q4 = "OK";
        } catch (Exception $e) {
            $q4 = "ERRO: " . $e->getMessage();
        }

        // 5. Testar a query com JSON_TABLE (rotas)
        try {
            $routeSql = "
              WITH base_rota AS (
                SELECT tda.awb_number AS awb,tda.hawb_number AS hawb,tdaf.timeline_json
                FROM dados_dachser.t_dados_aereo tda
                INNER JOIN dados_dachser.t_fato_aereo tdaf ON tdaf.awb COLLATE utf8mb4_unicode_ci=tda.awb_number COLLATE utf8mb4_unicode_ci AND JSON_VALID(tdaf.hawbs_json) AND JSON_CONTAINS(tdaf.hawbs_json,JSON_ARRAY(tda.hawb_number))
                WHERE tdaf.timeline_json IS NOT NULL AND JSON_VALID(tdaf.timeline_json) AND tda.etd >= ?
              ),
              eventos_raw AS (
                SELECT b.awb,b.hawb,jt.ordem,TRIM(COALESCE(jt.location,'')) AS location_raw 
                FROM base_rota b 
                JOIN JSON_TABLE(b.timeline_json,'$[*]' COLUMNS(ordem FOR ORDINALITY,location VARCHAR(255) PATH '$.location')) jt
              )
              SELECT * FROM eventos_raw LIMIT 1
            ";
            $stmt = $pdo->prepare($routeSql);
            $stmt->execute([$etdCutoff]);
            $stmt->fetchAll();
            $q5 = "OK";
        } catch (Exception $e) {
            $q5 = "ERRO: " . $e->getMessage();
        }

        sendJson([
            "success" => true,
            "database_version" => $db_version,
            "queries" => [
                "t_eventos_awb" => $q1,
                "t_description_eventos" => $q2,
                "main_query_no_json_table" => $q3,
                "discrepancies_with_json_table" => $q4,
                "routes_with_json_table" => $q5
            ]
        ]);
    } catch (Exception $e) {
        sendJson(["success" => false, "error" => $e->getMessage()], 500);
    }
});

// GET /api/air/test-tracking-execution
$router->get('air/test-tracking-execution', function ($params) {
    try {
        $mem_start = memory_get_usage();
        $time_start = microtime(true);

        $pdo = getPDO();
        $etdCutoff = isset($_ENV['AIR_ETD_CUTOFF']) ? $_ENV['AIR_ETD_CUTOFF'] : '2026-06-01';
        $countStmt = $pdo->prepare("SELECT COUNT(*) AS total FROM dados_dachser.t_dados_aereo tda WHERE tda.etd >= ?");
        $countStmt->execute([$etdCutoff]);
        $total_rows = $countStmt->fetch()['total'];

        $result = computeTrackingData();

        $mem_end = memory_get_usage();
        $time_end = microtime(true);

        sendJson([
            "success" => true,
            "total_rows_db" => $total_rows,
            "result_count" => count($result['data']),
            "failed_count" => $result['failed_count'],
            "memory_used_mb" => round(($mem_end - $mem_start) / 1024 / 1024, 2),
            "time_taken_sec" => round($time_end - $time_start, 2)
        ]);
    } catch (Throwable $e) {
        sendJson([
            "success" => false,
            "error_class" => get_class($e),
            "error_message" => $e->getMessage(),
            "error_file" => $e->getFile(),
            "error_line" => $e->getLine(),
            "error_trace" => $e->getTraceAsString()
        ], 500);
    }
});

// GET /api/air/test-db-data
$router->get('air/test-db-data', function ($params) {
    try {
        $pdo = getPDO();

        // 1. Verificar tabelas no banco
        $tables = $pdo->query("SHOW TABLES FROM dados_dachser")->fetchAll(PDO::FETCH_COLUMN);

        // 2. Contar linhas em t_dados_aereo
        $count_all = 0;
        $min_etd = null;
        $max_etd = null;

        if (in_array('t_dados_aereo', $tables)) {
            $count_all = $pdo->query("SELECT COUNT(*) FROM dados_dachser.t_dados_aereo")->fetchColumn();
            $min_etd = $pdo->query("SELECT MIN(etd) FROM dados_dachser.t_dados_aereo")->fetchColumn();
            $max_etd = $pdo->query("SELECT MAX(etd) FROM dados_dachser.t_dados_aereo")->fetchColumn();
        }

        // 3. Contar linhas em t_fato_aereo
        $count_fato = 0;
        if (in_array('t_fato_aereo', $tables)) {
            $count_fato = $pdo->query("SELECT COUNT(*) FROM dados_dachser.t_fato_aereo")->fetchColumn();
        }

        sendJson([
            "success" => true,
            "tables" => $tables,
            "t_dados_aereo_count" => $count_all,
            "min_etd" => $min_etd,
            "max_etd" => $max_etd,
            "t_fato_aereo_count" => $count_fato,
            "etd_cutoff_configured" => (isset($_ENV['AIR_ETD_CUTOFF']) ? $_ENV['AIR_ETD_CUTOFF'] : '2026-06-01')
        ]);
    } catch (Throwable $e) {
        sendJson([
            "success" => false,
            "error" => $e->getMessage()
        ], 500);
    }
});

// GET /api/air/db-columns-collation
$router->get('air/db-columns-collation', function ($params) {
    try {
        $pdo = getPDO();
        $cols1 = $pdo->query("SHOW FULL COLUMNS FROM dados_dachser.t_dados_aereo LIKE 'awb_number'")->fetch();
        $cols2 = $pdo->query("SHOW FULL COLUMNS FROM dados_dachser.t_fato_aereo LIKE 'awb'")->fetch();

        sendJson([
            "success" => true,
            "t_dados_aereo_awb_number" => [
                "Type" => $cols1 ? $cols1['Type'] : null,
                "Collation" => $cols1 ? $cols1['Collation'] : null
            ],
            "t_fato_aereo_awb" => [
                "Type" => $cols2 ? $cols2['Type'] : null,
                "Collation" => $cols2 ? $cols2['Collation'] : null
            ]
        ]);
    } catch (Throwable $e) {
        sendJson(["success" => false, "error" => $e->getMessage()]);
    }
});

// GET /tracking-aereo (legado compat)
$router->get('tracking-aereo', function ($params) {
    try {
        $result = computeTrackingData();
        sendJson($result);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/tracking-aereo/filters
$router->get('air/tracking-aereo/filters', function ($params) {
    try {
        $res = computeTrackingData();
        $data = $res['data'];

        $airlines = [];
        $analysts = [];
        $services = [];

        foreach ($data as $d) {
            $prefix = substr($d['awb_number'], 0, 3);
            if ($prefix)
                $airlines[] = $prefix;

            $clerk = trim($d['clerk']);
            if ($clerk)
                $analysts[] = $clerk;

            $srv = trim($d['tipo_servico']);
            if ($srv)
                $services[] = $srv;
        }

        $airlines = array_values(array_unique($airlines));
        $analysts = array_values(array_unique($analysts));
        $services = array_values(array_unique($services));

        sort($airlines);
        sort($analysts);
        sort($services);

        sendJson(['success' => true, 'filters' => ['airlines' => $airlines, 'analysts' => $analysts, 'services' => $services]]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/tracking-aereo/summary
$router->get('air/tracking-aereo/summary', function ($params) {
    try {
        $res = computeTrackingData();
        $data = $res['data'];

        $inTransit = array_flip(['DEP', 'MAN', 'RCF', 'ARR']);
        $criticalCodes = array_flip(['NIL', 'NIF', 'OFLD']);

        $total = 0;
        $transit = 0;
        $alert = 0;
        $critical = 0;

        foreach ($data as $a) {
            $code = strtoupper(trim($a['last_status_code'] ?: ($a['last_event'] ?: '')));
            if ($code === 'DLV' || $code === 'POD')
                continue;
            if ($a['hide_reason'])
                continue;

            $total++;
            if (isset($inTransit[$code]))
                $transit++;
            if ($code === 'DIS' || ($a['has_dis_event'] && !$a['pieces_discrepancy']))
                $alert++;
            if (isset($criticalCodes[$code]) || $a['pieces_discrepancy'])
                $critical++;
        }

        sendJson(['success' => true, 'summary' => ['total' => $total, 'transit' => $transit, 'alert' => $alert, 'critical' => $critical]]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/tracking-aereo/failed-alert
$router->post('air/tracking-aereo/failed-alert', function ($params) {
    $body = getRequestBody();
    $awbs = isset($body['awbs']) && is_array($body['awbs']) ? $body['awbs'] : [];
    sendJson(['success' => true, 'count' => count($awbs), 'emailed' => false]);
});

// POST /api/air/master-swaps
$router->post('air/master-swaps', function ($params) {
    try {
        $body = getRequestBody();
        $awbs = isset($body['awbs']) && is_array($body['awbs']) ? array_filter($body['awbs'], 'is_string') : [];
        if (count($awbs) === 0) {
            sendJson(['success' => true, 'data' => []]);
        }

        $pdo = getPDO();
        $ph = implode(',', array_fill(0, count($awbs), '?'));

        $sql = "SELECT id, hawb, awb_antigo, awb_novo, fonte, id_olss,
                      flight_number, departure_airport, destination_airport,
                      data_atualizacao, flag_troca_master, resolvido_manual
                 FROM " . AIR_DB . ".t_aereo_master_swap
                WHERE TRIM(awb_novo) COLLATE utf8mb4_unicode_ci IN ($ph)
                ORDER BY data_atualizacao DESC";

        $rows = queryWithRetry($pdo, $sql, array_map('trim', $awbs));
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        error_log('[master-swaps] ' . $e->getMessage());
        sendJson(['success' => true, 'data' => []]);
    }
});

// GET /api/air/master-discrepancies
$router->get('air/master-discrepancies', function ($params) {
    try {
        $pdo = getPDO();
        $rows = queryWithRetry($pdo, "
            SELECT id, hawb, id_olss, data_inclusao_nova, awbs_candidatos,
                  status, awb_escolhido, resolvido_em, resolvido_por, created_at
             FROM " . AIR_DB . ".t_aereo_master_discrepancia
            WHERE status = 'PENDENTE'
            ORDER BY created_at DESC
        ");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        error_log('[master-discrepancies] ' . $e->getMessage());
        sendJson(['success' => true, 'data' => []]);
    }
});

// POST /api/air/master-discrepancies/resolve
$router->post('air/master-discrepancies/resolve', function ($params) {
    try {
        $body = getRequestBody();
        $id = isset($body['id']) ? (int) $body['id'] : null;
        $awbEscolhido = isset($body['awb_escolhido']) ? trim($body['awb_escolhido']) : null;
        $user = isset($body['user']) ? trim($body['user']) : 'system';

        if (!$id || !$awbEscolhido) {
            sendJson(['success' => false, 'error' => 'id e awb_escolhido são obrigatórios.'], 400);
        }

        $pdo = getPDO();
        $discRows = queryWithRetry($pdo, "
            SELECT id, hawb, id_olss, data_inclusao_nova, awbs_candidatos
             FROM " . AIR_DB . ".t_aereo_master_discrepancia
            WHERE id = ? AND status = 'PENDENTE' LIMIT 1
        ", [$id]);

        if (!$discRows || count($discRows) === 0) {
            sendJson(['success' => false, 'error' => 'Discrepância não encontrada.'], 404);
        }

        $disc = $discRows[0];
        $candidatos = [];
        try {
            $candidatos = is_string($disc['awbs_candidatos']) ? json_decode($disc['awbs_candidatos'], true) : ($disc['awbs_candidatos'] ?: []);
        } catch (Exception $ex) {
        }

        $descartados = array_values(array_filter($candidatos, function ($c) use ($awbEscolhido) {
            return trim($c) !== $awbEscolhido;
        }));

        foreach ($descartados as $awbAntigo) {
            try {
                // remove o hawb do json do master descartado
                $res = queryWithRetry($pdo, "SELECT id, hawbs_json FROM " . AIR_DB . ".t_fato_aereo WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci LIMIT 1", [$awbAntigo]);
                if (count($res) > 0) {
                    $fatoId = $res[0]['id'];
                    $hJson = is_string($res[0]['hawbs_json']) ? json_decode($res[0]['hawbs_json'], true) : ($res[0]['hawbs_json'] ?: []);
                    $filtered = array_values(array_filter($hJson, function ($h) use ($disc) {
                        return trim($h) !== trim($disc['hawb']);
                    }));
                    queryWithRetry($pdo, "UPDATE " . AIR_DB . ".t_fato_aereo SET hawbs_json = ? WHERE id = ?", [json_encode($filtered), $fatoId]);
                }
            } catch (Exception $e) {
                error_log('[resolve desc loop] ' . $e->getMessage());
            }

            try {
                queryWithRetry($pdo, "
                    INSERT IGNORE INTO " . AIR_DB . ".t_aereo_master_swap
                      (hawb, awb_antigo, awb_novo, fonte, id_olss, data_atualizacao, flag_troca_master, resolvido_manual)
                    VALUES (?, ?, ?, 'DADOS_AEREO', ?, NOW(), 1, 1)
                ", [$disc['hawb'], $awbAntigo, $awbEscolhido, $disc['id_olss']]);
            } catch (Exception $e) {
            }

            try {
                queryWithRetry($pdo, "
                    UPDATE " . AIR_DB . ".t_fato_aereo
                       SET last_status_code = 'DLV'
                     WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
                       AND TRIM(COALESCE(hawb,'')) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
                ", [$awbAntigo, $disc['hawb']]);
            } catch (Exception $e) {
            }
        }

        queryWithRetry($pdo, "
            UPDATE " . AIR_DB . ".t_aereo_master_discrepancia
               SET status='RESOLVIDA', awb_escolhido=?, resolvido_em=NOW(), resolvido_por=?
             WHERE id = ?
        ", [$awbEscolhido, $user, $id]);

        sendJson(['success' => true, 'descartados' => $descartados, 'awb_escolhido' => $awbEscolhido]);
    } catch (Exception $e) {
        error_log('[master-discrepancies/resolve] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/usage-log
$router->post('air/usage-log', 'handleUsageLogRoute');
$router->post('usage-log', 'handleUsageLogRoute');

function handleUsageLogRoute($params)
{
    try {
        $body = getRequestBody();
        $username = isset($body['username']) ? $body['username'] : null;
        $endpoint = isset($body['endpoint']) ? $body['endpoint'] : null;
        $method = isset($body['method']) ? $body['method'] : 'GET';
        $sessionId = isset($body['sessionId']) ? $body['sessionId'] : null;
        $eventType = isset($body['eventType']) ? $body['eventType'] : null;
        $durationMs = isset($body['durationMs']) ? $body['durationMs'] : null;

        if (!$username || !$endpoint || $username === 'unknown') {
            sendJson(['success' => true]);
        }

        $storedMethod = $method;
        $storedEndpoint = $endpoint;

        if ($eventType === 'view_start') {
            $storedMethod = 'VI';
        } elseif ($eventType === 'view_end') {
            $storedMethod = 'VO';
            if ($durationMs !== null && (float) $durationMs >= 0) {
                $storedEndpoint = "{$endpoint}#dur=" . round($durationMs);
            }
        }

        $safeMethod = substr($storedMethod, 0, 4);
        queryWithRetry(getPDO(), "
            INSERT INTO dados_dachser.t_usage_logs (username, endpoint, method, session_id, event_time)
            VALUES (?, ?, ?, ?, NOW())
        ", [$username, $storedEndpoint, $safeMethod, $sessionId]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        error_log('[usage-log] ' . $e->getMessage());
        sendJson(['success' => true]);
    }
}

// POST /api/air/olimpo/force-swap-log
$router->post('air/olimpo/force-swap-log', function ($params) {
    try {
        $body = getRequestBody();
        $awb = isset($body['awb']) ? $body['awb'] : null;
        $oldMawb = isset($body['old_mawb']) ? $body['old_mawb'] : null;
        $hawbNumber = isset($body['hawb_number']) ? $body['hawb_number'] : null;
        $swappedBy = isset($body['swapped_by']) ? $body['swapped_by'] : null;

        if (!$awb || !$oldMawb) {
            sendJson(['error' => 'awb e old_mawb são obrigatórios'], 400);
        }

        queryWithRetry(getFinPDO(), "
            INSERT INTO dados_dachser.t_master_swap_log (hawb_number, old_mawb, new_mawb, swapped_by)
            VALUES (?, ?, ?, ?)
        ", [$hawbNumber, $oldMawb, $awb, $swappedBy]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/air/check-awb
$router->get('air/check-awb', function ($params) {
    try {
        $pdo = getPDO();
        $rows = queryWithRetry($pdo, "
            SELECT
              c.*,
              p.extracted_awb, p.extracted_cnpj, p.extracted_origin, p.extracted_destination,
              p.extracted_customer, p.confidence_score, p.shipper, p.consignee, p.carrier,
              p.gross_weight_kg, p.chargeable_weight_kg, p.mrn, p.routing_legs,
              p.flight_numbers, p.hs_codes, p.dims, p.incoterms, p.`references`,
              d.filename  AS hawb_file_name,
              d.id        AS hawb_document_id,
              r.email_despachante AS rule_email,
              r.airport_code      AS rule_airport,
              r.ref_othello       AS rule_ref_othello
            FROM " . CHECK_TABLE . " c
            LEFT JOIN " . PARSED_TABLE . "   p ON p.awb_check_id = c.id
            LEFT JOIN " . DOCUMENT_TABLE . " d ON d.id = p.document_id
            LEFT JOIN " . RULE_TABLE . "     r ON r.id = c.matched_rule_id
            ORDER BY c.created_at DESC
            LIMIT 200
        ");
        sendJson(['success' => true, 'checks' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/air/check-awb/:id
$router->delete('air/check-awb/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        $body = getRequestBody();
        $performedBy = isset($body['performed_by']) ? $body['performed_by'] : 'system';

        $pdo = getPDO();
        $parsedRows = queryWithRetry($pdo, "SELECT document_id FROM " . PARSED_TABLE . " WHERE awb_check_id = ? LIMIT 1", [$id]);
        $documentId = isset($parsedRows[0]['document_id']) ? $parsedRows[0]['document_id'] : null;

        queryWithRetry($pdo, "DELETE FROM " . PARSED_TABLE . " WHERE awb_check_id = ?", [$id]);
        if ($documentId) {
            queryWithRetry($pdo, "DELETE FROM " . DOCUMENT_TABLE . " WHERE id = ?", [$documentId]);
        }
        queryWithRetry($pdo, "DELETE FROM " . CHECK_TABLE . " WHERE id = ?", [$id]);

        try {
            queryWithRetry($pdo, "INSERT INTO " . LOG_TABLE . " (action, entity_type, entity_id, performed_by) VALUES ('delete', 'awb_check', ?, ?)", [$id, $performedBy]);
        } catch (Exception $ex) {
        }

        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/check-awb/upload
$router->post('air/check-awb/upload', function ($params) {
    try {
        error_log("[CheckAwb Upload] Arquivo de upload recebido: " . ($_FILES['file']['name'] ?? 'N/A'));
        
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'air');
        if (!$uploadResult['success']) {
            error_log("[CheckAwb Upload] Falha no upload físico: " . ($uploadResult['error'] ?? ''));
            sendJson([
                'success' => false,
                'step' => 'upload_arquivo',
                'message' => 'Falha no upload do arquivo físico para a pasta temporária.',
                'error' => $uploadResult['error']
            ], 400);
        }

        $fileName = $uploadResult['originalName'];
        $mimeType = $uploadResult['mime'];
        $destinationPath = $uploadResult['path'];

        $buffer = file_get_contents($destinationPath);
        $pdo = getPDO();

        $uploadedBy = isset($_POST['uploadedBy']) && $_POST['uploadedBy'] !== 'null' ? (int) $_POST['uploadedBy'] : null;

        error_log("[CheckAwb Upload] Salvando no banco de dados...");
        $stmt = $pdo->prepare("INSERT INTO " . DOCUMENT_TABLE . " (filename, file_type, file_size, file_content, uploaded_by) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$fileName, $mimeType, $uploadResult['size'], $buffer, $uploadedBy]);
        $documentId = $pdo->lastInsertId();

        error_log("[CheckAwb Upload] Arquivo cadastrado com sucesso. ID do arquivo criado: " . $documentId);
        sendJson(['success' => true, 'documentId' => (int) $documentId]);
    } catch (Exception $e) {
        error_log("[CheckAwb Upload] Erro crítico no upload: " . $e->getMessage());
        sendJson([
            'success' => false,
            'step' => 'cadastro_arquivo',
            'message' => 'Falha ao cadastrar arquivo no banco de dados.',
            'error' => $e->getMessage()
        ], 500);
    }
});

// GET /api/air/check-awb/document/:id
$router->get('air/check-awb/document/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        $pdo = getPDO();
        $stmt = $pdo->prepare("SELECT filename, file_type, file_content FROM " . DOCUMENT_TABLE . " WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $doc = $stmt->fetch();

        if (!$doc || !$doc['file_content']) {
            sendJson(['success' => false, 'error' => 'Documento não encontrado.'], 404);
        }

        header('Content-Type: ' . ($doc['file_type'] ?: 'application/pdf'));
        header('Content-Disposition: inline; filename="' . $doc['filename'] . '"');
        echo $doc['file_content'];
        exit;
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/check-awb/parse
$router->post('air/check-awb/parse', function ($params) {
    try {
        error_log("[CheckAwb Parse] Iniciando parse do arquivo: " . ($_FILES['file']['name'] ?? 'N/A'));
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'air');
        if (!$uploadResult['success']) {
            error_log("[CheckAwb Parse] Falha no upload temporário: " . ($uploadResult['error'] ?? ''));
            sendJson([
                'success' => false,
                'step' => 'upload_arquivo',
                'message' => 'Falha ao processar arquivo temporário para extração.',
                'error' => $uploadResult['error']
            ], 400);
            return;
        }

        $documentType = isset($_POST['documentType']) ? $_POST['documentType'] : 'house_awb';
        $mimeType = $uploadResult['mime'];
        $fileBase64 = base64_encode(file_get_contents($uploadResult['path']));

        $apiKey = isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null;
        
        if ($documentType === 'house_awb') {
            $systemPrompt = "Você é um especialista em extração de dados de documentos AWB (Air Waybill) e House AWB para operações logísticas.
Extraia as informações com ALTA PRECISÃO seguindo estas REGRAS:
1. CNPJ: EXATAMENTE 14 dígitos numéricos. Ignore sufixos como \"01-76\".
2. ORIGEM: Código IATA. Se não explícito, deduza do prefixo AWB (HAJ-xxxxx → HAJ)
3. DESTINO: Código IATA da cidade do destinatário (São Paulo=GRU, Rio=GIG, Curitiba=CWB, Viracopos=VCP)
4. CLIENTE: Procure \"KLABIN\" ou \"ZF\" no shipper/consignee
5. AWB NUMBER: Formato XXX-XXXXXXXX ou XXX XXXX XXXX
Retorne APENAS JSON válido.";
            $userPrompt = "Analise este documento AWB/HAWB e retorne JSON:
{
  \"awbNumber\": \"string (XXX-XXXXXXXX) ou null\",
  \"cnpj\": \"string (14 dígitos sem formatação) ou null\",
  \"origin\": \"string (código IATA 3 letras) ou null\",
  \"destination\": \"string (código IATA 3 letras) ou null\",
  \"shipper\": \"string (NOME + ENDEREÇO COMPLETO) ou null\",
  \"consignee\": \"string (NOME + ENDEREÇO + TELEFONE + CNPJ) ou null\",
  \"customer\": \"KLABIN ou ZF ou null\",
  \"carrier\": \"string (código 2 letras da cia aérea) ou null\",
  \"grossWeight\": \"number (kg) ou null\",
  \"chargeableWeight\": \"number (kg) ou null\",
  \"routingLegs\": [\"array IATA\"] ou null,
  \"flightNumbers\": [\"array voos\"] ou null,
  \"mrn\": \"string ou null\",
  \"hsCodes\": [\"array NCM/HS\"] ou null,
  \"dimensions\": \"string ou null\",
  \"incoterms\": \"string ou null\",
  \"references\": [\"array refs/POs\"] ou null,
  \"confidence\": \"high | medium | low\"
}";
        } else {
            $systemPrompt = "Você é um especialista em documentos de instrução logística. Extraia padrões de sufixo CNPJ.";
            $userPrompt = "Extraia sufixo CNPJ e retorne JSON:
{
  \"cnpjSuffix\": \"string (4 dígitos) ou null\",
  \"cnpjSuffixes\": [{ \"suffix\": \"string\", \"criteria\": \"string\", \"addressPattern\": \"string ou null\" }],
  \"defaultSuffix\": \"string ou null\",
  \"references\": [\"array de padrões XX-XX\"],
  \"confidence\": \"high | medium | low\"
}";
        }

        $rawText = '';
        $success = false;

        // 1. Tentar Anthropic se houver chave e parecer válida
        if ($apiKey && strpos($apiKey, 'sk-ant') === 0) {
            error_log("[CheckAwb Parse] Tentando chamada para a API Anthropic...");
            try {
                $isImage = strpos($mimeType, 'image/') === 0;
                $contentBlock = $isImage
                    ? ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mimeType, 'data' => $fileBase64]]
                    : ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $fileBase64]];

                $res = fetch('https://api.anthropic.com/v1/messages', [
                    'method' => 'POST',
                    'headers' => [
                        'x-api-key' => $apiKey,
                        'anthropic-version' => '2023-06-01',
                        'content-type' => 'application/json'
                    ],
                    'body' => json_encode([
                        'model' => isset($_ENV['PARSER_ANTHROPIC_MODEL']) ? $_ENV['PARSER_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
                        'max_tokens' => 4096,
                        'system' => $systemPrompt,
                        'messages' => [['role' => 'user', 'content' => [$contentBlock, ['type' => 'text', 'text' => $userPrompt]]]]
                    ])
                ]);

                if ($res['ok']) {
                    $aiData = $res['json']();
                    $rawText = isset($aiData['content'][0]['text']) ? $aiData['content'][0]['text'] : '';
                    error_log("[CheckAwb Parse] Resposta Anthropic recebida.");
                    $success = true;
                } else {
                    $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
                    error_log("[CheckAwb Parse] Falha na API Anthropic (Status " . $res['status'] . "): " . $errorDetail);
                }
            } catch (Exception $ex) {
                error_log("[CheckAwb Parse] Exceção durante chamada Anthropic: " . $ex->getMessage());
            }
        }

        // 2. Fallback para Gemini se a chamada da Anthropic não funcionou
        if (!$success) {
            $geminiKey = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
            if (!$geminiKey) {
                error_log("[CheckAwb Parse] Erro: Sem chave do Gemini para fallback.");
                sendJson([
                    'success' => false,
                    'step' => 'verificacao_config',
                    'message' => 'Nenhuma API Key válida configurada para extração.',
                    'error' => 'NO_VALID_API_KEY'
                ], 500);
                return;
            }

            error_log("[CheckAwb Parse] Executando fallback/direto com Gemini...");
            try {
                $geminiRes = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
                    'method' => 'POST',
                    'headers' => [
                        'Authorization' => "Bearer $geminiKey",
                        'Content-Type' => 'application/json'
                    ],
                    'body' => json_encode([
                        'model' => isset($_ENV['PARSER_GEMINI_MODEL']) ? $_ENV['PARSER_GEMINI_MODEL'] : 'gemini-2.5-pro',
                        'messages' => [
                            ['role' => 'system', 'content' => $systemPrompt],
                            [
                                'role' => 'user',
                                'content' => [
                                    ['type' => 'text', 'text' => $userPrompt],
                                    ['type' => 'image_url', 'image_url' => ['url' => "data:$mimeType;base64,$fileBase64"]]
                                ]
                            ]
                        ],
                        'max_tokens' => 4096,
                        'temperature' => 0
                    ])
                ]);

                if ($geminiRes['ok']) {
                    $aiData = $geminiRes['json']();
                    $rawText = isset($aiData['choices'][0]['message']['content']) ? $aiData['choices'][0]['message']['content'] : '';
                    error_log("[CheckAwb Parse] Resposta Gemini recebida.");
                    $success = true;
                } else {
                    $errorDetail = substr(isset($geminiRes['body']) ? $geminiRes['body'] : 'No body', 0, 500);
                    error_log("[CheckAwb Parse] Falha no fallback Gemini (Status " . $geminiRes['status'] . "): " . $errorDetail);
                    sendJson([
                        'success' => false,
                        'step' => 'chamada_gemini',
                        'message' => 'Erro na API do Gemini ao tentar extrair dados do documento.',
                        'error' => "Status: {$geminiRes['status']}. Detalhe: {$errorDetail}"
                    ], 502);
                    return;
                }
            } catch (Exception $ex) {
                error_log("[CheckAwb Parse] Exceção crítica no fallback Gemini: " . $ex->getMessage());
                sendJson([
                    'success' => false,
                    'step' => 'chamada_gemini_ex',
                    'message' => 'Erro interno ao processar fallback com o Gemini.',
                    'error' => $ex->getMessage()
                ], 500);
                return;
            }
        }

        // 3. Processar a resposta obtida (de qualquer um dos modelos)
        if (preg_match('/\{[\s\S]*\}/', $rawText, $jsonMatch)) {
            $parsed = json_decode($jsonMatch[0], true);
            error_log("[CheckAwb Parse] Parse de JSON concluído com sucesso.");
            sendJson(array_merge(['success' => true], $parsed));
            return;
        } else {
            error_log("[CheckAwb Parse] Falha ao extrair JSON da resposta do modelo.");
            sendJson([
                'success' => false,
                'step' => 'extracao_json',
                'message' => 'A resposta do modelo de IA não continha um formato JSON estruturado válido.',
                'error' => $rawText
            ], 500);
            return;
        }
    } catch (Exception $e) {
        error_log("[CheckAwb Parse] Erro crítico no parse do documento: " . $e->getMessage());
        sendJson([
            'success' => false,
            'step' => 'processamento_geral',
            'message' => 'Ocorreu um erro interno ao processar e extrair os dados do arquivo.',
            'error' => $e->getMessage()
        ], 500);
        return;
    }
});

// POST /api/air/check-awb
$router->post('air/check-awb', function ($params) {
    try {
        $body = getRequestBody();
        $awbNumber = isset($body['awbNumber']) ? $body['awbNumber'] : 'N/A';
        $cnpj = isset($body['cnpj']) ? $body['cnpj'] : 'N/A';
        $origin = isset($body['origin']) ? $body['origin'] : 'N/A';
        $destination = isset($body['destination']) ? $body['destination'] : 'N/A';
        $customer = isset($body['customer']) ? $body['customer'] : null;
        $validationStatus = isset($body['validationStatus']) ? $body['validationStatus'] : 'pending';
        $validationMessage = isset($body['validationMessage']) ? $body['validationMessage'] : null;
        $matchedRuleId = isset($body['matchedRuleId']) ? $body['matchedRuleId'] : null;
        $createdBy = isset($body['createdBy']) ? $body['createdBy'] : null;
        $documentId = isset($body['documentId']) ? $body['documentId'] : null;

        error_log("[CheckAwb Create] Iniciando persistência de validação para AWB: $awbNumber | CNPJ: $cnpj");
        $pdo = getPDO();
        $stmt = $pdo->prepare("
            INSERT INTO " . CHECK_TABLE . "
               (awb_number, cnpj, origin, destination, customer, validation_status, validation_message, matched_rule_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ");
        $stmt->execute([$awbNumber, $cnpj, $origin, $destination, $customer, $validationStatus, $validationMessage, $matchedRuleId, $createdBy]);
        $checkId = $pdo->lastInsertId();

        error_log("[CheckAwb Create] Gravação em t_check_awb concluída (ID: $checkId). Salvando dados extraídos em t_parsed_awb...");

        $stmtParsed = $pdo->prepare("
            INSERT INTO " . PARSED_TABLE . "
               (awb_check_id, document_id, extracted_awb, extracted_cnpj, extracted_origin,
                extracted_destination, extracted_customer, confidence_score, shipper, consignee,
                carrier, gross_weight_kg, chargeable_weight_kg, mrn, routing_legs, flight_numbers,
                hs_codes, dims, incoterms, `references`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $routingLegs = isset($body['routingLegs']) ? json_encode($body['routingLegs']) : null;
        $flightNumbers = isset($body['flightNumbers']) ? json_encode($body['flightNumbers']) : null;
        $hsCodes = isset($body['hsCodes']) ? json_encode($body['hsCodes']) : null;
        $references = isset($body['references']) ? json_encode($body['references']) : null;

        $stmtParsed->execute([
            $checkId,
            $documentId,
            isset($body['extractedAwb']) ? $body['extractedAwb'] : null,
            isset($body['extractedCnpj']) ? $body['extractedCnpj'] : null,
            isset($body['extractedOrigin']) ? $body['extractedOrigin'] : null,
            isset($body['extractedDestination']) ? $body['extractedDestination'] : null,
            isset($body['extractedCustomer']) ? $body['extractedCustomer'] : null,
            isset($body['confidenceScore']) ? $body['confidenceScore'] : null,
            isset($body['shipper']) ? $body['shipper'] : null,
            isset($body['consignee']) ? $body['consignee'] : null,
            isset($body['carrier']) ? $body['carrier'] : null,
            isset($body['grossWeight']) ? $body['grossWeight'] : null,
            isset($body['chargeableWeight']) ? $body['chargeableWeight'] : null,
            isset($body['mrn']) ? $body['mrn'] : null,
            $routingLegs,
            $flightNumbers,
            $hsCodes,
            isset($body['dimensions']) ? $body['dimensions'] : null,
            isset($body['incoterms']) ? $body['incoterms'] : null,
            $references
        ]);

        error_log("[CheckAwb Create] Gravação concluída com sucesso para o ID de validação: " . $checkId);
        sendJson(['success' => true, 'checkId' => (int) $checkId]);
    } catch (Exception $e) {
        error_log("[CheckAwb Create] Falha crítica ao salvar resultado no banco: " . $e->getMessage());
        sendJson([
            'success' => false,
            'step' => 'salvar_resultado',
            'message' => 'Erro ao salvar o resultado final da validação e extração no banco.',
            'error' => $e->getMessage()
        ], 500);
    }
});

// PATCH /api/air/check-awb/:id/parsed
$router->patch('air/check-awb/:id/parsed', function ($params) {
    try {
        $checkId = (int) $params['id'];
        $body = getRequestBody();

        $pdo = getPDO();
        $stmt = $pdo->prepare("
            UPDATE " . PARSED_TABLE . "
               SET shipper=?, consignee=?, carrier=?, gross_weight_kg=?, chargeable_weight_kg=?,
                   mrn=?, routing_legs=?, flight_numbers=?, hs_codes=?, dims=?, incoterms=?,
                   `references`=?, extracted_awb=?, extracted_cnpj=?, extracted_origin=?,
                   extracted_destination=?, extracted_customer=?
             WHERE awb_check_id=?
        ");

        $routingLegs = isset($body['routingLegs']) ? json_encode($body['routingLegs']) : null;
        $flightNumbers = isset($body['flightNumbers']) ? json_encode($body['flightNumbers']) : null;
        $hsCodes = isset($body['hsCodes']) ? json_encode($body['hsCodes']) : null;
        $references = isset($body['references']) ? json_encode($body['references']) : null;

        $stmt->execute([
            isset($body['shipper']) ? $body['shipper'] : null,
            isset($body['consignee']) ? $body['consignee'] : null,
            isset($body['carrier']) ? $body['carrier'] : null,
            isset($body['grossWeight']) ? $body['grossWeight'] : null,
            isset($body['chargeableWeight']) ? $body['chargeableWeight'] : null,
            isset($body['mrn']) ? $body['mrn'] : null,
            $routingLegs,
            $flightNumbers,
            $hsCodes,
            isset($body['dimensions']) ? $body['dimensions'] : null,
            isset($body['incoterms']) ? $body['incoterms'] : null,
            $references,
            isset($body['extractedAwb']) ? $body['extractedAwb'] : null,
            isset($body['extractedCnpj']) ? $body['extractedCnpj'] : null,
            isset($body['extractedOrigin']) ? $body['extractedOrigin'] : null,
            isset($body['extractedDestination']) ? $body['extractedDestination'] : null,
            isset($body['extractedCustomer']) ? $body['extractedCustomer'] : null,
            $checkId
        ]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/check-awb/matrices
$router->get('air/check-awb/matrices', function ($params) {
    try {
        $pdo = getPDO();
        $rows = queryWithRetry($pdo, "SELECT * FROM " . MATRIX_TABLE . " ORDER BY customer, version DESC");
        $matrices = [];
        foreach (($rows ?: []) as $m) {
            $m['is_active'] = (bool) $m['is_active'];
            $m['effective_from'] = $m['effective_date'];
            $matrices[] = $m;
        }
        sendJson(['success' => true, 'matrices' => $matrices]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/check-awb/rules
$router->get('air/check-awb/rules', function ($params) {
    try {
        $matrixId = isset($_GET['matrixId']) ? $_GET['matrixId'] : null;
        $cnpj = isset($_GET['cnpj']) ? $_GET['cnpj'] : null;

        if (!$matrixId)
            sendJson(['success' => false, 'error' => 'matrixId é obrigatório.'], 400);

        $pdo = getPDO();
        $sql = "SELECT * FROM " . RULE_TABLE . " WHERE matrix_id = ? AND is_active = 1";
        $sqlParams = [$matrixId];

        if ($cnpj) {
            $sql .= ' AND cnpj = ?';
            $sqlParams[] = $cnpj;
        }
        $sql .= ' ORDER BY id';

        $rows = queryWithRetry($pdo, $sql, $sqlParams);
        sendJson(['success' => true, 'rules' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/check-awb/matrices/active
$router->get('air/check-awb/matrices/active', function ($params) {
    try {
        $pdo = getPDO();
        $rows = queryWithRetry($pdo, "SELECT * FROM " . MATRIX_TABLE . " WHERE is_active = 1 ORDER BY customer");
        $matrices = [];
        foreach (($rows ?: []) as $m) {
            $m['is_active'] = true;
            $matrices[] = $m;
        }
        sendJson(['success' => true, 'matrices' => $matrices]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/check-awb/rules
$router->post('air/check-awb/rules', function ($params) {
    try {
        $body = getRequestBody();
        $matrixId = isset($body['matrixId']) ? $body['matrixId'] : null;
        $cnpj = isset($body['cnpj']) ? $body['cnpj'] : null;
        $airportCode = isset($body['airportCode']) ? $body['airportCode'] : null;
        $addressPattern = isset($body['addressPattern']) ? $body['addressPattern'] : null;
        $emailDespachante = isset($body['emailDespachante']) ? $body['emailDespachante'] : null;
        $refOthello = isset($body['refOthello']) ? $body['refOthello'] : null;
        $empresa = isset($body['empresa']) ? $body['empresa'] : null;
        $endereco = isset($body['endereco']) ? $body['endereco'] : null;
        $cidade = isset($body['cidade']) ? $body['cidade'] : null;
        $estado = isset($body['estado']) ? $body['estado'] : null;
        $cep = isset($body['cep']) ? $body['cep'] : null;
        $pais = isset($body['pais']) ? $body['pais'] : null;

        if (!$matrixId || !$cnpj) {
            sendJson(['success' => false, 'error' => 'matrixId e cnpj são obrigatórios.'], 400);
        }

        $pdo = getPDO();
        $stmt = $pdo->prepare("
            INSERT INTO " . RULE_TABLE . "
               (matrix_id, cnpj, airport_code, address_pattern, email_despachante,
                ref_othello, empresa, endereco, cidade, estado, cep, pais)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $matrixId,
            preg_replace('/\D/', '', $cnpj),
            $airportCode,
            $addressPattern,
            $emailDespachante,
            $refOthello,
            $empresa,
            $endereco,
            $cidade,
            $estado,
            $cep,
            $pais
        ]);

        sendJson(['success' => true, 'ruleId' => (int) $pdo->lastInsertId()]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/air/check-awb/rules/:id
$router->delete('air/check-awb/rules/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        queryWithRetry(getPDO(), "UPDATE " . RULE_TABLE . " SET is_active = 0 WHERE id = ?", [$id]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/check-awb/matrices/import
$router->post('air/check-awb/matrices/import', function ($params) {
    try {
        $body = getRequestBody();
        $fileBase64 = isset($body['fileBase64']) ? $body['fileBase64'] : null;

        if (!$fileBase64)
            sendJson(['success' => false, 'error' => 'fileBase64 é obrigatório.'], 400);

        // Processa planilha excel usando o helper nativo do ZipArchive
        $rows = parseXlsxSimple($fileBase64);

        $pdo = getPDO();
        $version = time();
        $effectiveDate = date('Y-m-d');

        // Separa regras de Klabin e ZF
        $klabinRules = [];
        $zfRules = [];

        foreach ($rows as $row) {
            // Acha o cliente com base nas chaves do array associativo
            $cnpjVal = '';
            foreach ($row as $k => $v) {
                if (stripos($k, 'cnpj') !== false) {
                    $cnpjVal = preg_replace('/\D/', '', $v);
                    break;
                }
            }
            if (strlen($cnpjVal) !== 14)
                continue;

            // Detecta qual planilha ou marcação
            // No excel exportado do lovable, geralmente tem coluna ou padrão de cliente
            $isZf = false;
            $isKlabin = false;

            // Detecta pelo nome da empresa ou padrão
            $empresaVal = '';
            foreach ($row as $k => $v) {
                if (stripos($k, 'empresa') !== false || stripos($k, 'company') !== false || stripos($k, 'nome') !== false) {
                    $empresaVal = strtoupper($v);
                    break;
                }
            }

            if (strpos($empresaVal, 'ZF') !== false)
                $isZf = true;
            else
                $isKlabin = true; // Default

            if ($isZf)
                $zfRules[] = $row;
            else
                $klabinRules[] = $row;
        }

        $processGroup = function ($groupRules, $customer) use ($pdo, $version, $effectiveDate) {
            if (count($groupRules) === 0)
                return 0;

            queryWithRetry($pdo, "UPDATE " . MATRIX_TABLE . " SET is_active = 0 WHERE customer = ?", [$customer]);
            $res = queryWithRetry($pdo, "INSERT INTO " . MATRIX_TABLE . " (customer, version, effective_date, is_active) VALUES (?, ?, ?, 1)", [$customer, $version, $effectiveDate]);
            $matrixId = $res['insertId'];

            $getVal = function ($row, $keys) {
                foreach ($row as $rk => $rv) {
                    foreach ($keys as $k) {
                        if (stripos($rk, $k) !== false && $rv !== '')
                            return (string) $rv;
                    }
                }
                return null;
            };

            $count = 0;
            foreach ($groupRules as $row) {
                $cnpj = $getVal($row, ['cnpj']) ? preg_replace('/\D/', '', $getVal($row, ['cnpj'])) : '';
                if (strlen($cnpj) !== 14)
                    continue;

                $stmt = $pdo->prepare("
                    INSERT INTO " . RULE_TABLE . "
                       (matrix_id, cnpj, airport_code, address_pattern, email_despachante,
                        ref_othello, empresa, endereco, cidade, estado, cep, pais)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $matrixId,
                    $cnpj,
                    $getVal($row, ['aeroporto', 'airport']),
                    $getVal($row, ['endereço', 'endereco', 'address']),
                    $getVal($row, ['email', 'despachante']),
                    $getVal($row, ['ref', 'othello', 'referencia']),
                    $getVal($row, ['empresa', 'company', 'nome']),
                    $getVal($row, ['endereço', 'endereco', 'address']),
                    $getVal($row, ['cidade', 'city']),
                    $getVal($row, ['estado', 'uf', 'state']),
                    $getVal($row, ['cep', 'zip']),
                    $getVal($row, ['pais', 'país', 'country'])
                ]);
                $count++;
            }
            return $count;
        };

        $klabinCount = $processGroup($klabinRules, 'KLABIN');
        $zfCount = $processGroup($zfRules, 'ZF');

        sendJson([
            'success' => true,
            'message' => "Importação concluída: $klabinCount regras Klabin, $zfCount regras ZF."
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/stats
$router->get('air/stats', function ($params) {
    try {
        $pdo = getPDO();
        $lastRows = queryWithRetry($pdo, "
            SELECT MAX(data_insert) AS last_update
            FROM dados_dachser.t_master_dados
            WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        ");
        $lastUpdate = isset($lastRows[0]['last_update']) ? $lastRows[0]['last_update'] : null;

        $statsRows = queryWithRetry($pdo, "
            SELECT COUNT(*) AS total_records
             FROM dados_dachser.t_master_dados
             WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') AND data_insert = ?
        ", [$lastUpdate]);

        $breakRows = queryWithRetry($pdo, "
            SELECT LEFT(mawb, 3) AS airline_code, COUNT(*) AS count
             FROM dados_dachser.t_master_dados
             WHERE active = 1 AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
               AND mawb IS NOT NULL AND mawb != '' AND data_insert = ?
             GROUP BY LEFT(mawb, 3) ORDER BY count DESC
        ", [$lastUpdate]);

        $airlineNames = [
            "001" => "American Airlines",
            "020" => "Lufthansa Cargo",
            "045" => "LATAM Cargo",
            "057" => "Air France Cargo",
            "074" => "AF/KL Cargo",
            "075" => "IAG Cargo",
            "125" => "British Airways",
            "157" => "Qatar Airways",
            "176" => "Emirates SkyCargo",
            "235" => "Turkish Airlines",
            "577" => "Azul Cargo",
            "724" => "Swiss WorldCargo",
            "729" => "Avianca Cargo"
        ];

        $airlineBreakdown = [];
        foreach (($breakRows ?: []) as $r) {
            $code = $r['airline_code'] ?: '???';
            $airlineBreakdown[] = [
                'code' => $code,
                'name' => isset($airlineNames[$code]) ? $airlineNames[$code] : $code,
                'count' => (int) $r['count']
            ];
        }

        sendJson([
            'success' => true,
            'stats' => [
                'lastUpdate' => $lastUpdate,
                'totalRecords' => isset($statsRows[0]['total_records']) ? (int) $statsRows[0]['total_records'] : 0,
                'airlineBreakdown' => $airlineBreakdown
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/status-aereo
$router->get('air/status-aereo', function ($params) {
    try {
        $res = computeTrackingData();
        $data = $res['data'];

        $inTransitCodes = array_flip(['DEP', 'MAN', 'RCF', 'ARR', 'ARR - DESTINO', 'ARR - CONEXAO', 'ARR - CONEXÃO', 'TRA', 'FOH']);

        $mapped = [];
        foreach ($data as $index => $item) {
            $mapped[] = [
                'id' => $index,
                'awb' => $item['awb_number'] ?: '',
                'hawb' => $item['hawb_number'] ?: '',
                'destinatário' => $item['consignee_nome'] ?: '',
                'nome_analista' => $item['clerk'] ?: '',
                'email_analista' => null,
                'email_cliente' => null,
                'origem' => $item['origin'] ?: 'N/A',
                'destino' => $item['destination'] ?: 'N/A',
                'conexao' => $item['conexao'] ?: null,
                'último_status' => $item['last_status_code'] ?: '',
                'status_info' => $item['last_event_description'] ?: null,
                'última atualização' => $item['last_event_date'] ?: null,
                'tipo_servico' => $item['tipo_servico'] ?: 'N/A',
                'tipo_processo' => null,
                'hours_in_status' => $item['hours_in_status'],
                'pieces_discrepancy' => $item['pieces_discrepancy'],
                'baseline_pieces' => $item['baseline_pieces'],
                'has_dis_event' => $item['has_dis_event'],
                'etd' => $item['etd'],
                'master_changed' => false,
                'last_event_date' => $item['last_event_date'],
                'in_transit' => isset($inTransitCodes[strtoupper($item['last_status_code'])]),
                'tracking_failed' => !$item['last_status_code'],
                'is_ground_transport' => $item['is_ground_transport'],
            ];
        }
        sendJson(['success' => true, 'data' => $mapped]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/awb-list
$router->get('air/awb-list', function ($params) {
    try {
        $search = isset($_GET['search']) ? $_GET['search'] : '';
        $status = isset($_GET['status']) ? $_GET['status'] : '';

        $pdo = getPDO();
        $sql = "
            SELECT awb, LEFT(awb,3) AS airline_code, destinatário AS consignee_name,
                   ultimo_evento AS last_event, ultimo_status AS status, data_insert AS created_at
            FROM dados_dachser.t_aereo_ws
            WHERE 1=1";
        $sqlParams = [];

        if ($search) {
            $sql .= " AND (awb LIKE ? OR destinatário LIKE ?)";
            $sqlParams[] = "%{$search}%";
            $sqlParams[] = "%{$search}%";
        }
        if ($status) {
            $sql .= " AND ultimo_status = ?";
            $sqlParams[] = $status;
        }
        $sql .= " ORDER BY data_insert DESC LIMIT 200";

        $rows = queryWithRetry($pdo, $sql, $sqlParams);
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/timeline/:awb
$router->get('air/timeline/:awb', function ($params) {
    $queryAwb = trim($params['awb']);
    if (!$queryAwb)
        sendJson(['success' => false, 'error' => 'AWB é obrigatório'], 400);

    $errorPhrases = [
        'não foi possível detectar',
        'nao foi possivel detectar',
        'could not detect',
        'carrier not supported',
        'operadora não suportada',
        'erro ao rastrear',
        'error tracking',
        'timeout',
        'failed to fetch',
        'unable to detect',
        'envie-me o número',
        'send me the tracking number',
        'adicionarei suporte',
        'add support for'
    ];

    $isErrorEvent = function ($text) use ($errorPhrases) {
        if (!$text)
            return false;
        $lower = strtolower($text);
        foreach ($errorPhrases as $p) {
            if (strpos($lower, $p) !== false)
                return true;
        }
        return false;
    };

    $extractStatusCode = function ($description) {
        if (!$description)
            return 'UNK';
        $upper = strtoupper($description);
        $knownCodes = ['DEP', 'ARR', 'RCF', 'DLV', 'NFD', 'MAN', 'BKD', 'RCS', 'DIS', 'NIL', 'OFLD', 'FOH', 'TRM', 'PRE', 'AWD', 'CCD', 'TGC', 'DDL', 'AWR', 'POD', 'TFD', 'RCT', 'RCP', 'LOF', 'TDE', 'ASN', 'MIS', 'TFS', 'BKF', 'FWB', 'CAN', 'NIF'];
        if (preg_match('/\(([A-Z]{2,5})\)/', $description, $m)) {
            if (in_array($m[1], $knownCodes))
                return $m[1];
        }
        foreach ($knownCodes as $code) {
            if (strpos($upper, $code . ' ') === 0 || strpos($upper, $code . '-') === 0 || $upper === $code)
                return $code;
        }
        foreach ($knownCodes as $code) {
            if (strpos($upper, $code) !== false)
                return $code;
        }
        $descPatterns = [
            ['/\bbooked\b/i', 'BKD'],
            ['/\bdelivered\b/i', 'DLV'],
            ['/\barrived?\b/i', 'ARR'],
            ['/\bdeparted?\b/i', 'DEP'],
            ['/\breceived?\s+from\s+flight\b/i', 'RCF'],
            ['/\breceived?\s+from\s+shipper\b/i', 'RCS'],
            ['/\bmanifested?\b/i', 'MAN'],
            ['/\bnotified?\s+(for\s+)?delivery\b/i', 'NFD'],
            ['/\bawaitin[g]?\s+delivery\b/i', 'AWD'],
            ['/\bavailable\s+for\s+delivery\b/i', 'AWD'],
            ['/\bdocuments?\s+available\b/i', 'AWD'],
            ['/\bdiscrepancy\b/i', 'DIS'],
            ['/\boffloaded?\b/i', 'OFLD'],
            ['/\bfreight\s+on\s+hand\b/i', 'FOH'],
            ['/\btransferred?\b/i', 'TFD'],
            ['/\bproof\s+of\s+delivery\b/i', 'POD'],
            ['/\bnot\s+found\b/i', 'NIF'],
            ['/\bcancell?ed\b/i', 'CAN'],
            ['/\breceived\b/i', 'RCF']
        ];
        foreach ($descPatterns as $item) {
            if (preg_match($item[0], $description))
                return $item[1];
        }
        return 'UNK';
    };

    $extractPiecesFromDesc = function ($text) {
        if (!$text)
            return null;
        if (preg_match('/(OFLD|OFFLOAD|OFFLOADED)/i', $text) && preg_match('/(^|[^0-9])0\s+PIECES?([^A-Z]|$)/i', $text))
            return null;
        if (preg_match('/(^|[^A-Z])(BOOKED|BOOKING)([^A-Z]|$)/i', $text))
            return null;
        if (preg_match('/Pcs\s*\/\s*Wt\s*[:=]?\s*(\d+)\s*\/\s*[\d.,]+/i', $text, $m))
            return (int) $m[1];
        if (preg_match('/Pieces:\s*(\d+)/i', $text, $m))
            return (int) $m[1];
        if (preg_match('/(\d+)\s*\/\s*[\d.,]+\s*(KGS?|LBS?|K)\b/i', $text, $m))
            return (int) $m[1];
        if (preg_match('/qty:\s*(\d+)/i', $text, $m))
            return (int) $m[1];
        if (preg_match('/(\d+)\s*piece(?:s|\(s\))?/i', $text, $m))
            return (int) $m[1];
        return null;
    };

    $extractWeightFromDesc = function ($text) {
        if (!$text)
            return null;
        if (preg_match('/Weight:\s*([\d.,]+\s*(?:K|KGS?|kg))/i', $text, $m))
            return $m[1];
        if (preg_match('/([\d.,]+)\s*KGS/i', $text, $m))
            return $m[1] . ' KGS';
        return null;
    };

    $parseFlexibleDate = function ($dateStr) {
        if (!$dateStr)
            return null;
        $direct = strtotime($dateStr);
        if ($direct !== false && $direct > 0)
            return new DateTime("@$direct");

        $ptMonths = ['jan' => '01', 'fev' => '02', 'mar' => '03', 'abr' => '04', 'mai' => '05', 'jun' => '06', 'jul' => '07', 'ago' => '08', 'set' => '09', 'out' => '10', 'nov' => '11', 'dez' => '12'];
        $enMonths = ['jan' => '01', 'feb' => '02', 'mar' => '03', 'apr' => '04', 'may' => '05', 'jun' => '06', 'jul' => '07', 'aug' => '08', 'sep' => '09', 'oct' => '10', 'nov' => '11', 'dec' => '12'];

        if (preg_match('/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(\d{2}:\d{2}))?/i', $dateStr, $m)) {
            $day = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $monthStr = strtolower($m[2]);
            $year = $m[3];
            $time = isset($m[4]) ? $m[4] : '00:00';
            $month = isset($ptMonths[$monthStr]) ? $ptMonths[$monthStr] : (isset($enMonths[$monthStr]) ? $enMonths[$monthStr] : null);
            if ($month)
                return new DateTime("{$year}-{$month}-{$day}T{$time}:00");
        }
        return null;
    };

    try {
        $pdo = getPDO();
        $wsRows = queryWithRetry($pdo, "
            SELECT id, awb, timeline_json, scraped_at, last_status_code
            FROM dados_dachser.t_aereo_ws_firecrawl
            WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
            ORDER BY id DESC LIMIT 1
        ", [$queryAwb]);

        if (!$wsRows || count($wsRows) === 0) {
            sendJson(['success' => true, 'data' => [], 'tracking_failed' => true]);
        }

        $wsRecord = $wsRows[0];
        $timelineData = [];
        if ($wsRecord['timeline_json']) {
            $raw = is_string($wsRecord['timeline_json']) ? json_decode($wsRecord['timeline_json'], true) : $wsRecord['timeline_json'];
            if (is_array($raw))
                $timelineData = $raw;
        }

        $invalidStatuses = array_flip(['', 'N/A', 'NOT_FOUND', 'ERRO', 'UNK']);
        $wsStatus = strtoupper(trim($wsRecord['last_status_code'] ?: ''));

        $needsFallback = count($timelineData) === 0
            || $isErrorEvent($wsRecord['timeline_json'] ? (string) $wsRecord['timeline_json'] : null)
            || isset($invalidStatuses[$wsStatus])
            || !$wsRecord['last_status_code'];

        $apiTimelineRaw = [];
        try {
            $apiRows = queryWithRetry($pdo, "
                SELECT historico_status FROM dados_dachser.t_aereo_api
                WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
                  AND historico_status IS NOT NULL
                ORDER BY id DESC LIMIT 1
            ", [$queryAwb]);
            if (count($apiRows) > 0 && $apiRows[0]['historico_status']) {
                $parsed = is_string($apiRows[0]['historico_status']) ? json_decode($apiRows[0]['historico_status'], true) : $apiRows[0]['historico_status'];
                if (is_array($parsed))
                    $apiTimelineRaw = $parsed;
            }
        } catch (Exception $e) {
        }

        if ($needsFallback && count($timelineData) > 0 && count($apiTimelineRaw) > 0) {
            foreach ($apiTimelineRaw as $apiEvt) {
                $apiStatus = strtoupper($apiEvt['status']);
                $apiAirport = strtoupper($apiEvt['aeroporto']);
                $apiDate = isset($apiEvt['dataEvento']) ? strtotime($apiEvt['dataEvento']) : 0;
                $matched = false;

                foreach ($timelineData as &$fcEvt) {
                    $fcDesc = strtoupper(isset($fcEvt['Description']) ? $fcEvt['Description'] : (isset($fcEvt['description']) ? $fcEvt['description'] : ''));
                    $fcLoc = strtoupper(isset($fcEvt['Location']) ? $fcEvt['Location'] : (isset($fcEvt['location']) ? $fcEvt['location'] : ''));

                    $fcRaw = isset($fcEvt['Timestamp']) ? $fcEvt['Timestamp'] : (isset($fcEvt['timestamp']) ? $fcEvt['timestamp'] : (isset($fcEvt['date']) ? $fcEvt['date'] : ''));
                    $fcTime = $fcRaw ? strtotime($fcRaw) : 0;

                    $statusMatch = (strpos($fcDesc, $apiStatus) !== false) || (strpos($fcLoc, $apiAirport) !== false);
                    $timeClose = $apiDate && $fcTime && abs($apiDate - $fcTime) < 2 * 3600;
                    if ($statusMatch && ($timeClose || !$apiDate || !$fcTime)) {
                        $fcEvt['_pecas'] = isset($apiEvt['quantidadeCargo']) ? $apiEvt['quantidadeCargo'] : (isset($apiEvt['quantidadeCarga']) ? $apiEvt['quantidadeCarga'] : null);
                        $fcEvt['_peso'] = isset($apiEvt['pesoCarga']) ? $apiEvt['pesoCarga'] : null;
                        $matched = true;
                        break;
                    }
                }
                unset($fcEvt);

                if (!$matched) {
                    $timelineData[] = array_merge($apiEvt, [
                        '_fromApi' => true,
                        '_pecas' => isset($apiEvt['quantidadeCargo']) ? $apiEvt['quantidadeCargo'] : (isset($apiEvt['quantidadeCarga']) ? $apiEvt['quantidadeCarga'] : null),
                        '_peso' => isset($apiEvt['pesoCarga']) ? $apiEvt['pesoCarga'] : null
                    ]);
                }
            }
        } elseif ($needsFallback && count($timelineData) === 0 && count($apiTimelineRaw) > 0) {
            foreach ($apiTimelineRaw as $evt) {
                $timelineData[] = array_merge($evt, [
                    '_fromApi' => true,
                    '_pecas' => isset($evt['quantidadeCargo']) ? $evt['quantidadeCargo'] : (isset($evt['quantidadeCarga']) ? $evt['quantidadeCarga'] : null),
                    '_peso' => isset($evt['pesoCarga']) ? $evt['pesoCarga'] : null
                ]);
            }
        } elseif (!$needsFallback && count($apiTimelineRaw) > 0) {
            foreach ($apiTimelineRaw as $apiEvt) {
                $apiStatus = strtoupper($apiEvt['status']);
                $apiAirport = strtoupper($apiEvt['aeroporto']);
                foreach ($timelineData as &$fcEvt) {
                    $fcDesc = strtoupper(isset($fcEvt['Description']) ? $fcEvt['Description'] : (isset($fcEvt['description']) ? $fcEvt['description'] : ''));
                    $fcLoc = strtoupper(isset($fcEvt['Location']) ? $fcEvt['Location'] : (isset($fcEvt['location']) ? $fcEvt['location'] : ''));
                    if (strpos($fcDesc, $apiStatus) !== false || strpos($fcLoc, $apiAirport) !== false) {
                        $fcEvt['_pecas'] = isset($apiEvt['quantidadeCargo']) ? $apiEvt['quantidadeCargo'] : (isset($apiEvt['quantidadeCarga']) ? $apiEvt['quantidadeCarga'] : null);
                        $fcEvt['_peso'] = isset($apiEvt['pesoCarga']) ? $apiEvt['pesoCarga'] : null;
                        break;
                    }
                }
                unset($fcEvt);
            }
        }

        $allAreErrors = count($timelineData) === 0;
        if (count($timelineData) > 0) {
            $allAreErrors = true;
            foreach ($timelineData as $entry) {
                $desc = isset($entry['Description']) ? $entry['Description'] : (isset($entry['description']) ? $entry['description'] : (isset($entry['status']) ? $entry['status'] : ''));
                if (!$isErrorEvent(strval($desc))) {
                    $allAreErrors = false;
                    break;
                }
            }
        }

        if ($allAreErrors)
            sendJson(['success' => true, 'data' => [], 'tracking_failed' => true]);

        $events = [];
        foreach ($timelineData as $idx => $entry) {
            if ((isset($entry['status']) && !isset($entry['Description']) && !isset($entry['description'])) || isset($entry['_fromApi'])) {
                $statusCode = strtoupper($entry['status'] ?: '');
                $airport = isset($entry['aeroporto']) ? $entry['aeroporto'] : '';
                $flight = isset($entry['voo']) ? $entry['voo'] : '';
                $qty = isset($entry['_pecas']) ? $entry['_pecas'] : (isset($entry['quantidadeCargo']) ? $entry['quantidadeCargo'] : (isset($entry['quantidadeCarga']) ? $entry['quantidadeCarga'] : null));
                $weight = isset($entry['_peso']) ? $entry['_peso'] : (isset($entry['pesoCarga']) ? $entry['pesoCarga'] : null);

                $desc = $statusCode;
                if ($airport)
                    $desc .= " - $airport";
                if ($flight)
                    $desc .= ", Flight $flight";
                if ($qty && $qty > 0)
                    $desc .= ", Pieces: $qty";
                if ($weight && $weight !== 'N/A')
                    $desc .= ", Weight: $weight";

                $events[] = [
                    'id' => $idx + 1,
                    'codigo_evento' => $statusCode ?: 'UNK',
                    'descricao_evento' => $desc,
                    'data_hora_evento' => isset($entry['dataEvento']) ? $entry['dataEvento'] : null,
                    'fonte' => 'API',
                    'aeroporto' => $airport ?: null,
                    'pecas' => ($qty && $qty > 0) ? (int) $qty : null,
                    'peso' => ($weight && $weight !== 'N/A') ? (string) $weight : null
                ];
                continue;
            }

            $description = isset($entry['Description']) ? $entry['Description'] : (isset($entry['description']) ? $entry['description'] : (isset($entry['status']) ? $entry['status'] : ''));
            $codigoEvento = $extractStatusCode($description);
            $eventDateTime = isset($entry['Timestamp']) ? $entry['Timestamp'] : (isset($entry['timestamp']) ? $entry['timestamp'] : (isset($entry['date']) ? $entry['date'] : (isset($entry['Date']) ? $entry['Date'] : (isset($entry['datetime']) ? $entry['datetime'] : (isset($entry['dataEvento']) ? $entry['dataEvento'] : (isset($entry['time']) ? $entry['time'] : null))))));

            $events[] = [
                'id' => $idx + 1,
                'codigo_evento' => $codigoEvento,
                'descricao_evento' => $description,
                'data_hora_evento' => $eventDateTime,
                'fonte' => isset($entry['Carrier']) ? $entry['Carrier'] : (isset($entry['carrier']) ? $entry['carrier'] : 'TRACKING'),
                'aeroporto' => isset($entry['Location']) ? $entry['Location'] : (isset($entry['location']) ? $entry['location'] : (isset($entry['aeroporto']) ? $entry['aeroporto'] : null)),
                'pecas' => isset($entry['_pecas']) ? (int) $entry['_pecas'] : $extractPiecesFromDesc($description),
                'peso' => (isset($entry['_peso']) && $entry['_peso'] !== 'N/A') ? (string) $entry['_peso'] : $extractWeightFromDesc($description),
            ];
        }

        $validIataCodes = array_flip([
            'DEP',
            'ARR',
            'RCF',
            'DLV',
            'NFD',
            'MAN',
            'BKD',
            'RCS',
            'DIS',
            'NIL',
            'OFLD',
            'FOH',
            'TRM',
            'PRE',
            'AWD',
            'CCD',
            'TGC',
            'DDL',
            'AWR',
            'POD',
            'TFD',
            'RCT',
            'RCP',
            'LOF',
            'TDE',
            'ASN',
            'MIS',
            'TFS',
            'BKF',
            'FWB',
            'CAN',
            'NIF',
            'UNK',
            'NOVO_MASTER',
            'BCBP',
            'RCD'
        ]);

        $validEvents = array_filter($events, function ($e) use ($isErrorEvent, $validIataCodes) {
            return !$isErrorEvent($e['descricao_evento']) && isset($validIataCodes[strtoupper($e['codigo_evento'])]);
        });

        // Re-ordenação
        $validEvents = array_values($validEvents);
        $iataWeightTl = ['POD' => 44, 'DLV' => 43, 'NFD' => 42, 'RCF' => 41, 'AWD' => 40, 'ARR' => 39, 'TRM' => 38, 'TFD' => 37, 'DEP' => 36, 'MAN' => 35, 'RCS' => 34, 'FOH' => 33, 'BKD' => 32, 'AWR' => 40, 'CCD' => 40, 'FWB' => 4, 'RCT' => 11, 'PRE' => 20, 'DIS' => 30, 'OFLD' => 28];
        if (count($validEvents) >= 2) {
            $topN = min(4, count($validEvents));
            $topWithDate = [];
            for ($i = 0; $i < $topN; $i++) {
                $ev = $validEvents[$i];
                $time = $ev['data_hora_evento'] ? strtotime($ev['data_hora_evento']) : 0;
                $topWithDate[] = ['ev' => $ev, 'idx' => $i, 'dateMs' => $time * 1000];
            }
            $latestDateMs = max(array_column($topWithDate, 'dateMs'));
            if ($latestDateMs > 0) {
                $bestGroup = array_filter($topWithDate, function ($x) use ($latestDateMs) {
                    return $x['dateMs'] === $latestDateMs;
                });
                $bestGroup = array_values($bestGroup);

                $bestIdx = $bestGroup[0]['idx'];
                $bestW = isset($iataWeightTl[strtoupper($bestGroup[0]['ev']['codigo_evento'])]) ? $iataWeightTl[strtoupper($bestGroup[0]['ev']['codigo_evento'])] : 0;

                foreach ($bestGroup as $bg) {
                    $w = isset($iataWeightTl[strtoupper($bg['ev']['codigo_evento'])]) ? $iataWeightTl[strtoupper($bg['ev']['codigo_evento'])] : 0;
                    if ($w > $bestW || ($w === $bestW && $bg['idx'] < $bestIdx)) {
                        $bestW = $w;
                        $bestIdx = $bg['idx'];
                    }
                }
                if ($bestIdx > 0) {
                    $winner = array_splice($validEvents, $bestIdx, 1);
                    array_unshift($validEvents, $winner[0]);
                }
            }
        }

        $etdCutoffVal = null;
        try {
            $etdRows = queryWithRetry($pdo, "
                SELECT etd, data_insert FROM dados_dachser.t_master_dados
                WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
                  AND etd IS NOT NULL ORDER BY data_insert DESC LIMIT 1
            ", [$queryAwb]);
            if (count($etdRows) > 0 && $etdRows[0]['etd']) {
                $etdDate = strtotime($etdRows[0]['etd']);
                $nowTime = time();
                if ($etdDate <= $nowTime) {
                    $etdCutoffVal = $etdDate - 30 * 24 * 60 * 60;
                } else {
                    $insertTime = strtotime($etdRows[0]['data_insert']);
                    if ($insertTime > 0)
                        $etdCutoffVal = $insertTime - 7 * 24 * 60 * 60;
                }
            }
        } catch (Exception $e) {
        }

        $nowLimit = time() + 6 * 3600;
        $filteredEvents = array_filter($validEvents, function ($e) use ($parseFlexibleDate, $nowLimit, $etdCutoffVal) {
            if (!$e['data_hora_evento'])
                return $e['fonte'] !== 'API';
            $eventDate = $parseFlexibleDate($e['data_hora_evento']);
            if (!$eventDate)
                return $e['fonte'] !== 'API';
            $t = $eventDate->getTimestamp();
            if ($t > $nowLimit)
                return false;
            if ($etdCutoffVal !== null && $t < $etdCutoffVal)
                return false;
            return true;
        });

        $filteredEvents = array_values($filteredEvents);

        if (count($filteredEvents) === 0) {
            sendJson(['success' => true, 'data' => [], 'tracking_failed' => true]);
        }

        try {
            $swapRows = queryWithRetry($pdo, "
                SELECT hawb_number, old_mawb, new_mawb, swapped_at FROM dados_dachser.t_master_swap_log
                WHERE TRIM(new_mawb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
                ORDER BY swapped_at DESC
            ", [$queryAwb]);
            if (count($swapRows) > 0) {
                foreach ($swapRows as $swap) {
                    $filteredEvents[] = [
                        'id' => "swap-{$swap['old_mawb']}-{$swap['new_mawb']}",
                        'codigo_evento' => 'NOVO_MASTER',
                        'descricao_evento' => "Master atualizado: {$swap['old_mawb']} → {$swap['new_mawb']}",
                        'data_hora_evento' => $swap['swapped_at'] ?: null,
                        'fonte' => 'SISTEMA',
                        'aeroporto' => '',
                        'pecas' => null,
                        'peso' => null,
                    ];
                }
                usort($filteredEvents, function ($a, $b) {
                    $da = $a['data_hora_evento'] ? strtotime($a['data_hora_evento']) : 0;
                    $db = $b['data_hora_evento'] ? strtotime($b['data_hora_evento']) : 0;
                    return $db - $da;
                });
            }
        } catch (Exception $e) {
        }

        $discrepancy = null;
        $allPieces = [];
        foreach ($filteredEvents as $e) {
            if ($e['pecas'] !== null && $e['pecas'] > 0)
                $allPieces[] = $e['pecas'];
        }
        if (count($allPieces) >= 2) {
            $minP = min($allPieces);
            $maxP = max($allPieces);
            if ($minP !== $maxP) {
                $discrepancy = ['field' => 'pecas', 'values' => array_values(array_unique($allPieces)), 'min' => $minP, 'max' => $maxP];
            }
        }
        if (!$discrepancy) {
            $hasDis = false;
            foreach ($filteredEvents as $e) {
                $txt = $e['descricao_evento'];
                if (preg_match('/(^|[^A-Z])(DISCREP|DIS)([^A-Z]|$)/i', $txt) || preg_match('/\b(DISCREPANCY|IRREGULAR|MISSING|SHORT\s+SHIPPED|OVERAGE)\b/i', $txt)) {
                    $hasDis = true;
                    break;
                }
            }
            if ($hasDis)
                $discrepancy = ['field' => 'dis', 'values' => [], 'min' => null, 'max' => null];
        }

        $resPayload = ['success' => true, 'data' => $filteredEvents];
        if ($discrepancy)
            $resPayload['discrepancy'] = $discrepancy;
        sendJson($resPayload);
    } catch (Exception $e) {
        error_log('[GET air/timeline/:awb] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/air/email-regras
$router->get('air/email-regras', function ($params) {
    try {
        $rows = queryWithRetry(getPDO(), "
            SELECT id, cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo, created_at, updated_at
             FROM dados_dachser.t_email_cliente ORDER BY id ASC
        ");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/air/email-regras
$router->post('air/email-regras', function ($params) {
    try {
        $body = getRequestBody();
        $cliente_nome = isset($body['cliente_nome']) ? $body['cliente_nome'] : null;
        $cnpj_consignatario = isset($body['cnpj_consignatario']) ? $body['cnpj_consignatario'] : null;
        $email_cliente = isset($body['email_cliente']) ? $body['email_cliente'] : null;
        $aeroportos = isset($body['aeroportos']) ? $body['aeroportos'] : [];
        $eventos_disparo = isset($body['eventos_disparo']) ? $body['eventos_disparo'] : [];
        $canais = isset($body['canais']) ? $body['canais'] : [];
        $ativo = isset($body['ativo']) ? $body['ativo'] : 1;

        queryWithRetry(getPDO(), "
            INSERT INTO dados_dachser.t_email_cliente (cliente_nome, cnpj_consignatario, email_cliente, aeroportos, eventos_disparo, canais, ativo, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ", [
            $cliente_nome,
            $cnpj_consignatario,
            $email_cliente,
            is_string($aeroportos) ? $aeroportos : json_encode($aeroportos),
            is_string($eventos_disparo) ? $eventos_disparo : json_encode($eventos_disparo),
            is_string($canais) ? $canais : json_encode($canais),
            $ativo ? 1 : 0
        ]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/air/email-regras/:id
$router->patch('air/email-regras/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        $body = getRequestBody();

        $sets = [];
        $sqlParams = [];

        if (isset($body['cliente_nome'])) {
            $sets[] = 'cliente_nome = ?';
            $sqlParams[] = $body['cliente_nome'];
        }
        if (isset($body['cnpj_consignatario'])) {
            $sets[] = 'cnpj_consignatario = ?';
            $sqlParams[] = $body['cnpj_consignatario'];
        }
        if (isset($body['email_cliente'])) {
            $sets[] = 'email_cliente = ?';
            $sqlParams[] = $body['email_cliente'];
        }
        if (isset($body['aeroportos'])) {
            $sets[] = 'aeroportos = ?';
            $sqlParams[] = is_string($body['aeroportos']) ? $body['aeroportos'] : json_encode($body['aeroportos']);
        }
        if (isset($body['eventos_disparo'])) {
            $sets[] = 'eventos_disparo = ?';
            $sqlParams[] = is_string($body['eventos_disparo']) ? $body['eventos_disparo'] : json_encode($body['eventos_disparo']);
        }
        if (isset($body['canais'])) {
            $sets[] = 'canais = ?';
            $sqlParams[] = is_string($body['canais']) ? $body['canais'] : json_encode($body['canais']);
        }
        if (isset($body['ativo'])) {
            $sets[] = 'ativo = ?';
            $sqlParams[] = $body['ativo'] ? 1 : 0;
        }

        if (count($sets) === 0) {
            sendJson(['success' => true]);
        }

        $sets[] = 'updated_at = NOW()';
        $sqlParams[] = $id;

        queryWithRetry(getPDO(), "UPDATE dados_dachser.t_email_cliente SET " . implode(', ', $sets) . " WHERE id = ?", $sqlParams);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/air/email-regras/:id
$router->delete('air/email-regras/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        queryWithRetry(getPDO(), "DELETE FROM dados_dachser.t_email_cliente WHERE id = ?", [$id]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── CCT ROUTES ───────────────────────────────────────────────────────────────

// GET /api/cct/profiles
$router->get('cct/profiles', function ($params) {
    try {
        $rows = queryWithRetry(getPDO(), "
            SELECT DISTINCT nome_analista AS nome, email_analista AS email
             FROM dados_dachser.t_status_aereo
             WHERE nome_analista IS NOT NULL AND nome_analista != ''
             ORDER BY nome_analista
        ");
        $profiles = [];
        foreach (($rows ?: []) as $idx => $row) {
            $profiles[] = [
                'id' => 'analyst-' . ($idx + 1),
                'nome' => $row['nome'] ?: '',
                'email' => $row['email'] ?: '',
                'ativo' => true
            ];
        }
        sendJson(['success' => true, 'data' => $profiles]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/cct/regras-notificacao
$router->get('cct/regras-notificacao', function ($params) {
    try {
        $rows = queryWithRetry(getPDO(), "SELECT * FROM dados_dachser.t_cct_regras_notificacao ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/cct/regras-notificacao
$router->post('cct/regras-notificacao', function ($params) {
    try {
        $body = getRequestBody();
        $cliente_nome = isset($body['cliente_nome']) ? $body['cliente_nome'] : null;
        $cnpj_consignatario = isset($body['cnpj_consignatario']) ? $body['cnpj_consignatario'] : null;
        $aeroportos = isset($body['aeroportos']) ? $body['aeroportos'] : [];
        $eventos_disparo = isset($body['eventos_disparo']) ? $body['eventos_disparo'] : [];
        $canais = isset($body['canais']) ? $body['canais'] : [];
        $template_id = isset($body['template_id']) ? $body['template_id'] : 'default';
        $ativo = isset($body['ativo']) ? $body['ativo'] : 1;

        queryWithRetry(getPDO(), "
            INSERT INTO dados_dachser.t_cct_regras_notificacao (cliente_nome, cnpj_consignatario, aeroportos, eventos_disparo, canais, template_id, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?)
        ", [
            $cliente_nome,
            $cnpj_consignatario,
            is_string($aeroportos) ? $aeroportos : json_encode($aeroportos),
            is_string($eventos_disparo) ? $eventos_disparo : json_encode($eventos_disparo),
            is_string($canais) ? $canais : json_encode($canais),
            $template_id,
            $ativo ? 1 : 0
        ]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/cct/regras-notificacao/:id
$router->patch('cct/regras-notificacao/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        $body = getRequestBody();

        $sets = [];
        $sqlParams = [];

        if (isset($body['cliente_nome'])) {
            $sets[] = 'cliente_nome = ?';
            $sqlParams[] = $body['cliente_nome'];
        }
        if (isset($body['cnpj_consignatario'])) {
            $sets[] = 'cnpj_consignatario = ?';
            $sqlParams[] = $body['cnpj_consignatario'];
        }
        if (isset($body['aeroportos'])) {
            $sets[] = 'aeroportos = ?';
            $sqlParams[] = is_string($body['aeroportos']) ? $body['aeroportos'] : json_encode($body['aeroportos']);
        }
        if (isset($body['eventos_disparo'])) {
            $sets[] = 'eventos_disparo = ?';
            $sqlParams[] = is_string($body['eventos_disparo']) ? $body['eventos_disparo'] : json_encode($body['eventos_disparo']);
        }
        if (isset($body['canais'])) {
            $sets[] = 'canais = ?';
            $sqlParams[] = is_string($body['canais']) ? $body['canais'] : json_encode($body['canais']);
        }
        if (isset($body['template_id'])) {
            $sets[] = 'template_id = ?';
            $sqlParams[] = $body['template_id'];
        }
        if (isset($body['ativo'])) {
            $sets[] = 'ativo = ?';
            $sqlParams[] = $body['ativo'] ? 1 : 0;
        }

        if (count($sets) === 0) {
            sendJson(['success' => true]);
        }
        $sqlParams[] = $id;
        queryWithRetry(getPDO(), "UPDATE dados_dachser.t_cct_regras_notificacao SET " . implode(', ', $sets) . " WHERE id = ?", $sqlParams);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/cct/regras-notificacao/:id
$router->delete('cct/regras-notificacao/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        queryWithRetry(getPDO(), "DELETE FROM dados_dachser.t_cct_regras_notificacao WHERE id = ?", [$id]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/cct/leadcomex-logs/stats
$router->get('cct/leadcomex-logs/stats', function ($params) {
    try {
        $date_from = isset($_GET['date_from']) ? $_GET['date_from'] : null;
        $date_to = isset($_GET['date_to']) ? $_GET['date_to'] : null;

        $dateThreshold = '2026-01-26';
        $where = "WHERE DATE(dep_date) >= '$dateThreshold'";
        $sqlParams = [];

        if ($date_from) {
            $where .= " AND DATE(created_at) >= ?";
            $sqlParams[] = $date_from;
        }
        if ($date_to) {
            $where .= " AND DATE(created_at) <= ?";
            $sqlParams[] = $date_to;
        }

        $rows = queryWithRetry(getPDO(), "
            SELECT COUNT(*) AS total,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS error_count,
                    AVG(total_time_ms) AS avg_time_ms,
                    AVG(CASE WHEN success = 1 THEN offset_days ELSE NULL END) AS avg_offset_days,
                    AVG(total_attempts) AS avg_attempts,
                    COUNT(DISTINCT DATE(created_at)) AS days_with_data
             FROM dados_dachser.t_leadcomex_enrichment_logs $where
        ", $sqlParams);

        $row = isset($rows[0]) ? $rows[0] : [];
        $total = isset($row['total']) ? (int) $row['total'] : 0;
        $success = isset($row['success_count']) ? (int) $row['success_count'] : 0;

        sendJson([
            'success' => true,
            'stats' => [
                'total' => $total,
                'success_count' => $success,
                'error_count' => isset($row['error_count']) ? (int) $row['error_count'] : 0,
                'success_rate' => $total > 0 ? number_format(($success / $total) * 100, 1) : '0.0',
                'avg_time_ms' => (int) round(isset($row['avg_time_ms']) ? $row['avg_time_ms'] : 0),
                'avg_offset_days' => number_format(isset($row['avg_offset_days']) ? $row['avg_offset_days'] : 0, 1),
                'avg_attempts' => number_format(isset($row['avg_attempts']) ? $row['avg_attempts'] : 0, 1),
                'days_with_data' => isset($row['days_with_data']) ? (int) $row['days_with_data'] : 0
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/cct/leadcomex-logs/:id
$router->get('cct/leadcomex-logs/:id', function ($params) {
    try {
        $id = (int) $params['id'];
        $rows = queryWithRetry(getPDO(), "SELECT * FROM dados_dachser.t_leadcomex_enrichment_logs WHERE id = ?", [$id]);
        if (!$rows || count($rows) === 0) {
            sendJson(['success' => false, 'error' => 'Log não encontrado'], 404);
        }
        $row = $rows[0];
        $parseSafe = function ($col) {
            try {
                return $col ? json_decode($col, true) : [];
            } catch (Exception $e) {
                return [];
            }
        };

        $log = array_merge($row, [
            'success' => (int) $row['success'] === 1,
            'lc_bloqueios_ativos' => $parseSafe($row['lc_bloqueios_ativos_json']),
            'lc_bloqueios_baixados' => $parseSafe($row['lc_bloqueios_baixados_json']),
            'lc_divergencias' => $parseSafe($row['lc_divergencias_json']),
            'lc_viagens_associadas' => $parseSafe($row['lc_viagens_associadas_json']),
            'lc_mawb_associados' => $parseSafe($row['lc_mawb_associados_json']),
            'lc_partes_estoque' => $parseSafe($row['lc_partes_estoque_json']),
            'lc_itens_carga' => $parseSafe($row['lc_itens_carga_json']),
            'lc_frete' => $row['lc_frete_json'] ? json_decode($row['lc_frete_json'], true) : null,
            'attempts' => $parseSafe($row['attempts_json']),
            'raw_response' => $row['raw_response_json'] ? json_decode($row['raw_response_json'], true) : null,
        ]);

        sendJson(['success' => true, 'log' => $log]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/cct/leadcomex-logs
$router->get('cct/leadcomex-logs', function ($params) {
    try {
        $limit = isset($_GET['limit']) ? $_GET['limit'] : '100';
        $offset = isset($_GET['offset']) ? $_GET['offset'] : '0';
        $hawb = isset($_GET['hawb']) ? $_GET['hawb'] : null;
        $filterSuccess = isset($_GET['success']) ? $_GET['success'] : null;
        $date_from = isset($_GET['date_from']) ? $_GET['date_from'] : null;
        $date_to = isset($_GET['date_to']) ? $_GET['date_to'] : null;
        $execution_source = isset($_GET['execution_source']) ? $_GET['execution_source'] : null;

        $dateThreshold = '2026-01-26';
        $where = "WHERE DATE(dep_date) >= '$dateThreshold'";
        $sqlParams = [];

        if ($hawb) {
            $where .= " AND (hawb LIKE ? OR mawb LIKE ? OR lc_hawb LIKE ?)";
            $sqlParams[] = "%{$hawb}%";
            $sqlParams[] = "%{$hawb}%";
            $sqlParams[] = "%{$hawb}%";
        }
        if ($filterSuccess !== null && $filterSuccess !== '' && $filterSuccess !== 'all') {
            $where .= " AND success = ?";
            $sqlParams[] = ($filterSuccess === 'true' || $filterSuccess === '1') ? 1 : 0;
        }
        if ($execution_source) {
            $where .= " AND execution_source = ?";
            $sqlParams[] = $execution_source;
        }
        if ($date_from) {
            $where .= " AND DATE(created_at) >= ?";
            $sqlParams[] = $date_from;
        }
        if ($date_to) {
            $where .= " AND DATE(created_at) <= ?";
            $sqlParams[] = $date_to;
        }

        $pdo = getPDO();
        $countRows = queryWithRetry($pdo, "SELECT COUNT(*) AS total FROM dados_dachser.t_leadcomex_enrichment_logs $where", $sqlParams);
        $total = isset($countRows[0]['total']) ? (int) $countRows[0]['total'] : 0;

        $lim = min((int) $limit ?: 100, 500);
        $off = (int) $offset ?: 0;

        $sql = "SELECT id, hawb, mawb, dep_date, success, matched_date, offset_days, total_attempts, total_time_ms,
                      execution_source, lc_hawb, lc_data_emissao, lc_situacao_lead, lc_situacao_portal, lc_tipo,
                      lc_situacao_carga, lc_categoria_carga, lc_aeroporto_origem, lc_aeroporto_destino,
                      lc_peso_bruto, lc_quantidade_volumes, lc_cnpj_consignatario, lc_nome_consignatario,
                      lc_nome_embarcador, lc_cidade_embarcador, lc_pais_embarcador,
                      lc_frete_valor_total, lc_frete_moeda_codigo,
                      lc_bloqueios_ativos_json, lc_viagens_associadas_json, attempts_json, created_at
               FROM dados_dachser.t_leadcomex_enrichment_logs $where
               ORDER BY created_at DESC LIMIT $lim OFFSET $off";

        $rows = queryWithRetry($pdo, $sql, $sqlParams);

        $logs = [];
        foreach (($rows ?: []) as $row) {
            $logs[] = array_merge($row, [
                'success' => (int) $row['success'] === 1,
                'lc_bloqueios_ativos' => $row['lc_bloqueios_ativos_json'] ? json_decode($row['lc_bloqueios_ativos_json'], true) : [],
                'lc_viagens_associadas' => $row['lc_viagens_associadas_json'] ? json_decode($row['lc_viagens_associadas_json'], true) : [],
                'attempts' => $row['attempts_json'] ? json_decode($row['attempts_json'], true) : []
            ]);
        }

        sendJson(['success' => true, 'logs' => $logs, 'total' => $total, 'limit' => $lim, 'offset' => $off]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// ── PARSERS HELPER LOGIC ─────────────────────────────────────────────────────

function parseAnthropicPdfJsonPHP($fileBase64, $prompt, $logName)
{
    $apiKey = isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null;
    $tryAnthropic = ($apiKey && strpos($apiKey, 'sk-ant') === 0);

    if ($tryAnthropic) {
        try {
            $res = fetch('https://api.anthropic.com/v1/messages', [
                'method' => 'POST',
                'headers' => [
                    'x-api-key' => $apiKey,
                    'anthropic-version' => '2023-06-01',
                    'Content-Type' => 'application/json'
                ],
                'body' => json_encode([
                    'model' => isset($_ENV['PARSER_ANTHROPIC_MODEL']) ? $_ENV['PARSER_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
                    'max_tokens' => 16000,
                    'temperature' => 0,
                    'messages' => [
                        [
                            'role' => 'user',
                            'content' => [
                                ['type' => 'text', 'text' => $prompt],
                                ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $fileBase64]]
                            ]
                        ]
                    ]
                ])
            ]);

            if ($res['ok']) {
                $aiData = $res['json']();
                $content = isset($aiData['content'][0]['text']) ? $aiData['content'][0]['text'] : '';
                if ($content) {
                    $cleaned = preg_replace('/```(?:json)?\s*/i', '', $content);
                    $cleaned = str_replace('```', '', $cleaned);

                    if (preg_match('/\{[\s\S]*\}/', $cleaned, $m)) {
                        return json_decode($m[0], true);
                    }
                    return json_decode($cleaned, true);
                }
            } else {
                $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
                error_log("[Anthropic {$logName}] Call failed with status: {$res['status']}. Details: {$errorDetail}. Falling back to Gemini...");
            }
        } catch (Exception $e) {
            error_log("[Anthropic {$logName}] Exception: {$e->getMessage()}. Falling back to Gemini...");
        }
    } else {
        error_log("[Anthropic {$logName}] Key not configured or invalid. Falling back to Gemini...");
    }

    // Fallback to Gemini
    return parseGeminiPdfJsonPHP(
        $fileBase64,
        'application/pdf',
        'You are an expert logistics document parser. Extract all requested fields and return a JSON object.',
        $prompt,
        $logName . '-fallback'
    );
}

function parseGeminiPdfJsonPHP($fileBase64, $mimeType, $systemPrompt, $userPrompt, $logName)
{
    $key = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
    if (!$key)
        throw new Exception('GEMINI_API_KEY não configurada');

    $res = fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", [
        'method' => 'POST',
        'headers' => [
            'Authorization' => "Bearer $key",
            'Content-Type' => 'application/json'
        ],
        'body' => json_encode([
            'model' => isset($_ENV['PARSER_GEMINI_MODEL']) ? $_ENV['PARSER_GEMINI_MODEL'] : 'gemini-2.5-pro',
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $userPrompt],
                        ['type' => 'image_url', 'image_url' => ['url' => "data:$mimeType;base64,$fileBase64"]]
                    ]
                ]
            ],
            'max_tokens' => 16000,
            'temperature' => 0
        ])
    ]);

    if (!$res['ok']) {
        if ($res['status'] === 429)
            throw new Exception('Limite de requisições excedido.');
        throw new Exception("$logName Gemini API error {$res['status']}: " . substr($res['body'], 0, 300));
    }

    $aiData = $res['json']();
    $content = isset($aiData['choices'][0]['message']['content']) ? $aiData['choices'][0]['message']['content'] : '';
    $cleaned = preg_replace('/```(?:json)?\s*/i', '', $content);
    $cleaned = str_replace('```', '', $cleaned);

    if (preg_match('/\{[\s\S]*\}/', $cleaned, $m)) {
        return json_decode($m[0], true);
    }
    throw new Exception('Não foi possível extrair JSON da IA');
}

$hawbCadastroPrompt = 'You are an expert at extracting data from HAWB (House Air Waybill) documents.
Extract ALL fields from this HAWB PDF and return a JSON object. If a field is not found, use null.
CRITICAL MAWB RULES:
1. Try labeled MAWB fields: "MAWB", "Master AWB", "Air Waybill No", "Accounting Information".
2. Also inspect the top header triple pattern: 3-digit airline prefix + 3-letter airport code + 7-8 digit number. Example "001 | MAD | 2208 4156" means awb_number = "001-22084156".
3. awb_number is the MASTER airway bill number (XXX-XXXXXXXX). hawb_number is the HOUSE number.
Return ONLY valid JSON with fields matching template.';

$blCadastroPrompt = 'You are an expert at extracting data from Bill of Lading (BL) documents for maritime/ocean freight.
Extract ALL fields from this BL PDF and return a JSON object. If a field is not found, use null.';

// POST /api/parsers/hawb-cadastro
$router->post('parsers/hawb-cadastro', function ($params) use ($hawbCadastroPrompt) {
    $startTime = microtime(true);
    try {
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'air');
        if (!$uploadResult['success']) {
            sendJson(['success' => false, 'error' => $uploadResult['error']], 400);
        }
        $fileBase64 = base64_encode(file_get_contents($uploadResult['path']));

        // Claude call is async, but in PHP we run synchronously
        $data = parseAnthropicPdfJsonPHP($fileBase64, $hawbCadastroPrompt, 'parse-hawb-cadastro');
        sendJson([
            'success' => true,
            'data' => $data,
            'processingTimeMs' => (int) round((microtime(true) - $startTime) * 1000)
        ]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/parsers/bl-cadastro
$router->post('parsers/bl-cadastro', function ($params) use ($blCadastroPrompt) {
    $startTime = microtime(true);
    try {
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'air');
        if (!$uploadResult['success']) {
            sendJson(['success' => false, 'error' => $uploadResult['error']], 400);
        }
        $fileBase64 = base64_encode(file_get_contents($uploadResult['path']));

        $data = parseAnthropicPdfJsonPHP($fileBase64, $blCadastroPrompt, 'parse-bl-cadastro');
        sendJson([
            'success' => true,
            'data' => $data,
            'processingTimeMs' => (int) round((microtime(true) - $startTime) * 1000)
        ]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/parsers/manifest-swap
$router->post('parsers/manifest-swap', function ($params) {
    $startTime = microtime(true);
    try {
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'air');
        if (!$uploadResult['success']) {
            sendJson(['success' => false, 'error' => $uploadResult['error']], 400);
        }
        $fileBase64 = base64_encode(file_get_contents($uploadResult['path']));
        $mimeType = $uploadResult['mime'];

        $systemPrompt = "You are a specialist in parsing DACHSER air cargo manifest PDFs.
Extract the MAWB and all HAWB entries. Return ONLY valid JSON with mawb and hawbs array.";

        $data = parseGeminiPdfJsonPHP(
            $fileBase64,
            $mimeType,
            $systemPrompt,
            'Parse this DACHSER manifest PDF and extract the MAWB and all HAWBs with their details.',
            'parse-manifest-swap'
        );

        sendJson([
            'success' => true,
            'data' => $data,
            'processingTimeMs' => (int) round((microtime(true) - $startTime) * 1000)
        ]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/parsers/comprovante-pdf
$router->post('parsers/comprovante-pdf', function ($params) {
    try {
        $body = getRequestBody();
        $fileName = isset($body['fileName']) ? $body['fileName'] : '';
        if (!$fileName) {
            sendJson(['error' => 'fileName é obrigatório'], 400);
            return;
        }

        // Simulação da lógica de parse de comprovante baseada no nome do arquivo
        $nameWithoutExt = preg_replace('/\.[^/.]+$/', '', $fileName);

        preg_match_all('/(?<![0-9])(\d{5,13})(?![0-9])/', $nameWithoutExt, $matches);
        $collected = array_values(array_unique($matches[0] ?: []));

        $spoScores = [];
        $ndScores = [];

        $addScore = function (&$scoreArray, $val, $score) {
            if (!$val)
                return;
            $v = trim($val);
            if (!preg_match('/^\d+$/', $v) && !preg_match('/^\d{2,4}-\d{4,13}$/', $v))
                return;
            $scoreArray[$v] = max(isset($scoreArray[$v]) ? $scoreArray[$v] : 0, $score);
        };

        foreach ($collected as $c) {
            $addScore($spoScores, $c, 20);
            $addScore($ndScores, $c, 20);
        }

        if (preg_match_all('/(\d{3})-(\d{6})[A-Z]\d{8}\.\d{1,3}/i', $fileName, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $addScore($spoScores, "{$item[1]}-{$item[2]}", 102);
                $addScore($spoScores, $item[2], 100);
            }
        }
        if (preg_match_all('/(\d{3})-(\d{5,7})(?:\.|$|[^0-9])/i', $fileName, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $addScore($spoScores, "{$item[1]}-{$item[2]}", 97);
                $addScore($spoScores, $item[2], 95);
            }
        }
        if (preg_match_all('/(?:OT\s*)?(\d{3})-(\d{10,13})/i', $fileName, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $addScore($ndScores, $item[2], 90);
            }
        }
        if (preg_match_all('/(?<![0-9])(20\d{8,11})(?![0-9])/i', $nameWithoutExt, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $addScore($ndScores, $item[1], 55);
            }
        }
        if (preg_match_all('/(?<![0-9])(\d{6,7})(?![0-9])/i', $nameWithoutExt, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $addScore($spoScores, $item[1], 60);
                $addScore($ndScores, $item[1], 60);
            }
        }

        arsort($spoScores);
        arsort($ndScores);

        $spoSortedKeys = array_keys($spoScores);
        $ndSortedKeys = array_keys($ndScores);

        $maxSpoScore = count($spoScores) > 0 ? reset($spoScores) : 0;
        $maxNdScore = count($ndScores) > 0 ? reset($ndScores) : 0;

        sendJson([
            'success' => true,
            'data' => [
                'numeroSPO' => isset($spoSortedKeys[0]) ? $spoSortedKeys[0] : null,
                'numeroND' => isset($ndSortedKeys[0]) ? $ndSortedKeys[0] : null,
                'linhaDigitavel' => null,
                'valor' => null,
                'fornecedor' => null,
                'dataVencimento' => null,
                'confidence' => min(0.99, max($maxSpoScore, $maxNdScore) / 110),
                'source' => 'filename',
                'candidatosSPO' => $spoSortedKeys,
                'candidatosND' => $ndSortedKeys,
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/parsers/boleto-barcode
// POST /api/parsers/boleto-barcode
$router->post('parsers/boleto-barcode', function ($params) {
    try {
        $body = getRequestBody();
        $fileUrl = isset($body['fileUrl']) ? $body['fileUrl'] : null;
        $base64 = isset($body['base64']) ? $body['base64'] : null;
        $mediaType = isset($body['mediaType']) ? $body['mediaType'] : 'application/pdf';

        $fileBase64 = $base64;
        $effectiveMediaType = $mediaType;

        if (!$fileBase64 && $fileUrl) {
            // Verifica se é anexo interno
            if (is_string($fileUrl) && preg_match('/\/api\/fin\/vouchers\/anexos\/([^\/]+)\/download/', $fileUrl, $internalMatch)) {
                $anexoId = $internalMatch[1];
                $rows = queryWithRetry(getFinPDO(), "SELECT file_content, mime_type FROM dados_dachser.t_voucher_anexos WHERE id = ? LIMIT 1", [$anexoId]);

                if (!$rows || count($rows) === 0 || !$rows[0]['file_content']) {
                    sendJson(['success' => false, 'error' => 'Anexo não encontrado no banco'], 404);
                    return;
                }

                $fileBase64 = base64_encode($rows[0]['file_content']);
                $effectiveMediaType = $rows[0]['mime_type'] ?: $effectiveMediaType;
            } else {
                $res = fetch($fileUrl);
                if (!$res['ok']) {
                    sendJson(['success' => false, 'error' => 'Failed to fetch file from URL'], 400);
                    return;
                }
                $fileBase64 = base64_encode($res['body']);
                // Tenta ler o header
                $effectiveMediaType = 'application/pdf'; // fallback
            }
        }

        if (!$fileBase64) {
            sendJson(['success' => false, 'error' => 'No file data provided'], 400);
            return;
        }

        // Extracao boleto com Anthropic
        $key = isset($_ENV['ANTHROPIC_FINANCEIRO_API_KEY']) ? $_ENV['ANTHROPIC_FINANCEIRO_API_KEY'] : (isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null);
        
        $prompt = "Analise este documento e extraia a LINHA DIGITÁVEL do boleto ou arrecadação.
Formatos possíveis:
- Boleto bancário: 47 dígitos.
- Arrecadação/convênio/DAI/DARF: 48 dígitos, geralmente começa com 8.
Retorne exatamente:
TIPO: BANCARIO ou ARRECADACAO
FORMATADA: <linha formatada>
LIMPA: <somente dígitos, 47 ou 48>
Se não encontrar nenhum código, responda apenas: NAO_ENCONTRADO";

        $text = '';
        $success = false;

        $tryAnthropic = ($key && strpos($key, 'sk-ant') === 0);
        if ($tryAnthropic) {
            try {
                $res = fetch('https://api.anthropic.com/v1/messages', [
                    'method' => 'POST',
                    'headers' => [
                        'x-api-key' => $key,
                        'anthropic-version' => '2023-06-01',
                        'Content-Type' => 'application/json'
                    ],
                    'body' => json_encode([
                        'model' => isset($_ENV['FIN_ANTHROPIC_MODEL']) ? $_ENV['FIN_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
                        'max_tokens' => 4000,
                        'temperature' => 0,
                        'messages' => [
                            [
                                'role' => 'user',
                                'content' => [
                                    ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => $effectiveMediaType, 'data' => $fileBase64]],
                                    ['type' => 'text', 'text' => $prompt]
                                ]
                            ]
                        ]
                    ])
                ]);

                if ($res['ok']) {
                    $aiData = $res['json']();
                    $text = isset($aiData['content'][0]['text']) ? $aiData['content'][0]['text'] : '';
                    $success = true;
                } else {
                    $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
                    error_log("[Boleto Barcode] Anthropic failed (Status " . $res['status'] . "): " . $errorDetail);
                }
            } catch (Exception $e) {
                error_log("[Boleto Barcode] Anthropic Exception: " . $e->getMessage());
            }
        }

        // Gemini Fallback
        if (!$success) {
            $geminiKey = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
            if (!$geminiKey) {
                throw new Exception("Nenhuma API key configurada para extração do boleto.");
            }
            error_log("[Boleto Barcode] Executando fallback com Gemini...");
            
            $geminiRes = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
                'method' => 'POST',
                'headers' => [
                    'Authorization' => "Bearer $geminiKey",
                    'Content-Type' => 'application/json'
                ],
                'body' => json_encode([
                    'model' => isset($_ENV['PARSER_GEMINI_MODEL']) ? $_ENV['PARSER_GEMINI_MODEL'] : 'gemini-2.5-pro',
                    'messages' => [
                        [
                            'role' => 'user',
                            'content' => [
                                ['type' => 'text', 'text' => $prompt],
                                ['type' => 'image_url', 'image_url' => ['url' => "data:$effectiveMediaType;base64,$fileBase64"]]
                            ]
                        ]
                    ],
                    'max_tokens' => 4000,
                    'temperature' => 0
                ])
            ]);

            if ($geminiRes['ok']) {
                $aiData = $geminiRes['json']();
                $text = isset($aiData['choices'][0]['message']['content']) ? $aiData['choices'][0]['message']['content'] : '';
                $success = true;
            } else {
                $errorDetail = substr(isset($geminiRes['body']) ? $geminiRes['body'] : 'No body', 0, 500);
                throw new Exception("Erro ao tentar ler o documento com Gemini. Detalhe: " . $errorDetail);
            }
        }

        if (stripos($text, 'NAO_ENCONTRADO') !== false) {
            sendJson(['success' => false, 'error' => 'Linha digitável não encontrada no documento']);
            return;
        }

        preg_match('/LIMPA:\s*(\d+)/i', $text, $limpaMatch);
        $limpa = isset($limpaMatch[1]) ? $limpaMatch[1] : preg_replace('/\D/', '', $text);

        if (!empty($limpa) && $limpa[0] === '8' && strlen($limpa) > 48)
            $clean = substr($limpa, 0, 48);
        elseif (strlen($limpa) > 47)
            $clean = substr($limpa, 0, 47);
        else
            $clean = $limpa;

        if (strlen($clean) !== 47 && strlen($clean) !== 48) {
            throw new Exception("Linha digitável com tamanho inválido (" . strlen($clean) . " dígitos)");
        }

        $formatLinhaDigitavelFin = function ($c) {
            if (strlen($c) === 47) {
                return substr($c, 0, 5) . "." . substr($c, 5, 5) . " " . substr($c, 10, 5) . "." . substr($c, 15, 6) . " " . substr($c, 21, 5) . "." . substr($c, 26, 6) . " " . substr($c, 32, 1) . " " . substr($c, 33);
            }
            if (strlen($c) === 48) {
                return substr($c, 0, 11) . "-" . substr($c, 11, 1) . " " . substr($c, 12, 11) . "-" . substr($c, 23, 1) . " " . substr($c, 24, 11) . "-" . substr($c, 35, 1) . " " . substr($c, 36, 11) . "-" . substr($c, 47);
            }
            return $c;
        };

        sendJson([
            'success' => true,
            'tipo' => (strlen($clean) === 48 || $clean[0] === '8') ? 'ARRECADACAO' : 'BANCARIO',
            'linhaDigitavel' => $clean,
            'linhaDigitavelFormatada' => $formatLinhaDigitavelFin($clean),
            'rawResponse' => $text,
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});
