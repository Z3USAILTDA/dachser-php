<?php
require 'api/db.php';
$_ENV['MARIADB_SEA_HOST'] = '177.70.19.42';
$_ENV['MARIADB_SEA_PORT'] = '3306';
$_ENV['MARIADB_SEA_DATABASE'] = 'dados_dachser';
$_ENV['MARIADB_SEA_USER'] = 'sea_dachser';
$_ENV['MARIADB_SEA_PASSWORD'] = 'owSSkt2a@root';

try {
    $pdo = getPDOFor('sea');
    $stmt = $pdo->query('SHOW COLUMNS FROM dados_dachser.t_status_aereo');
    $rows = $stmt->fetchAll();
    echo "Columns in t_status_aereo:\n";
    foreach ($rows as $row) {
        if (strpos($row['Field'], 'origem') !== false || strpos($row['Field'], 'dest') !== false || strpos($row['Field'], 'porto') !== false || strpos($row['Field'], 'airport') !== false) {
            echo $row['Field'] . "\n";
        }
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
