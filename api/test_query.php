<?php
// api/test_query.php
// Script de diagnóstico para executar e testar as queries da página AIR.

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

require_once __DIR__ . '/env.php';
require_once __DIR__ . '/db.php';

// Carrega o .env
$paths = [
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__) . '/.env',
    __DIR__ . '/.env'
];
foreach ($paths as $path) {
    if (file_exists($path)) {
        loadEnv($path);
        break;
    }
}

try {
    $pdo = getPDO();
    
    // Obter a versão do MySQL/MariaDB
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

    echo json_encode([
        "success" => true,
        "database_version" => $db_version,
        "queries" => [
            "t_eventos_awb" => $q1,
            "t_description_eventos" => $q2,
            "main_query_no_json_table" => $q3,
            "discrepancies_with_json_table" => $q4,
            "routes_with_json_table" => $q5
        ]
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error" => "Falha ao conectar: " . $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
