<?php
// api/test_db.php
// Script de diagnóstico para testar conexões com o banco de dados a partir do servidor.

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

require_once __DIR__ . '/env.php';

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

$phases = ['auth', 'air', 'fin', 'sea', 'ops', 'admin', 'olimpo'];
$results = [];

foreach ($phases as $phase) {
    $prefix = "MARIADB_" . strtoupper($phase);
    
    $host = isset($_ENV["{$prefix}_HOST"]) ? $_ENV["{$prefix}_HOST"] : (isset($_ENV["DB_HOST"]) ? $_ENV["DB_HOST"] : null);
    $port = isset($_ENV["{$prefix}_PORT"]) ? $_ENV["{$prefix}_PORT"] : (isset($_ENV["DB_PORT"]) ? $_ENV["DB_PORT"] : "3306");
    $database = isset($_ENV["{$prefix}_DATABASE"]) ? $_ENV["{$prefix}_DATABASE"] : (isset($_ENV["DB_NAME"]) ? $_ENV["DB_NAME"] : null);
    $user = isset($_ENV["{$prefix}_USER"]) ? $_ENV["{$prefix}_USER"] : (isset($_ENV["DB_USER"]) ? $_ENV["DB_USER"] : null);
    $password = isset($_ENV["{$prefix}_PASSWORD"]) ? $_ENV["{$prefix}_PASSWORD"] : (isset($_ENV["DB_PASSWORD"]) ? $_ENV["DB_PASSWORD"] : null);

    if (!$host || !$database) {
        $results[$phase] = [
            "success" => false,
            "error" => "Configurações incompletas no .env para {$prefix}"
        ];
        continue;
    }

    $dsn = "mysql:host=$host;port=$port;dbname=$database;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5 // Timeout rápido de 5 segundos para testes
    ];

    try {
        $start = microtime(true);
        $pdo = new PDO($dsn, $user, $password, $options);
        $elapsed = round((microtime(true) - $start) * 1000, 2);
        
        // Testa uma query simples
        $stmt = $pdo->query("SELECT 1");
        $stmt->fetch();

        $results[$phase] = [
            "success" => true,
            "host" => $host,
            "database" => $database,
            "user" => $user,
            "time_ms" => $elapsed
        ];
    } catch (PDOException $e) {
        $results[$phase] = [
            "success" => false,
            "host" => $host,
            "database" => $database,
            "user" => $user,
            "error" => $e->getMessage(),
            "code" => $e->getCode()
        ];
    }
}

echo json_encode([
    "success" => true,
    "diagnostics" => $results,
    "server_time" => date('c')
], JSON_PRETTY_PRINT);
