<?php
require 'api/db.php';
$_ENV['MARIADB_SEA_HOST'] = '177.70.19.42';
$_ENV['MARIADB_SEA_PORT'] = '3306';
$_ENV['MARIADB_SEA_DATABASE'] = 'dados_dachser';
$_ENV['MARIADB_SEA_USER'] = 'sea_dachser';
$_ENV['MARIADB_SEA_PASSWORD'] = 'owSSkt2a@root';

try {
    $pdo = getPDOFor('sea');
    $database = 'dados_dachser';
    $sql = "
      SELECT
        c.hawb,
        c.awb,
        c.eventos,
        c.teve_bloqueio,
        c.motivos_bloqueio,
        c.data_decolagem,
        c.peso_recebido_declarado,
        c.peso_constatado,
        c.volume_recebido_declarado,
        c.volume_constatado,
        c.situacao_portal_atual,
        c.data_ultima_atualizacao_atual,
        c.consulted_at_ultima_consulta,
        c.refreshed_at,
        COALESCE(NULLIF(TRIM(m.cliente), ''), NULLIF(TRIM(a.consignee_nome), '')) AS cliente,
        COALESCE(m.mawb, a.awb_number, c.awb) AS master,
        f.origin AS aeroporto_origem,
        f.destination AS aeroporto_destino,
        COALESCE(m.nome_analista, a.clerk) AS nome_analista,
        COALESCE(m.email_analista, a.clerk_email) AS email_analista,
        m.tratamento,
        NULL AS tratamentos_especiais,
        COALESCE(m.data_insert, a.created_at) AS created_at
      FROM {$database}.t_cct_dashboard_cache c
      LEFT JOIN (
        SELECT t.*
        FROM {$database}.t_master_dados t
        INNER JOIN (
          SELECT hawb, MAX(id) as max_id
          FROM {$database}.t_master_dados
          GROUP BY hawb
        ) max_t ON t.id = max_t.max_id
      ) m ON m.hawb = c.hawb
      LEFT JOIN {$database}.t_status_aereo a ON a.awb_number = c.hawb
      LEFT JOIN {$database}.t_flight f ON f.awb = c.awb
    ";
    
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    echo "SUCCESS, rows: " . count($rows) . "\n";
    if (count($rows) > 0) {
        echo "Sample created_at: " . $rows[0]['created_at'] . "\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
