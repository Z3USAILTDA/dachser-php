<?php
// api/db.php
// Gerenciador centralizado de conexões PDO (Lazy Init)

function getPDOFor($phase) {
    static $connections = [];
    if (isset($connections[$phase])) {
        return $connections[$phase];
    }

    $prefix = "MARIADB_" . strtoupper($phase);
    
    // Fallbacks para as variáveis comuns de DB
    $host = isset($_ENV["{$prefix}_HOST"]) ? $_ENV["{$prefix}_HOST"] : (isset($_ENV["DB_HOST"]) ? $_ENV["DB_HOST"] : null);
    $port = isset($_ENV["{$prefix}_PORT"]) ? $_ENV["{$prefix}_PORT"] : (isset($_ENV["DB_PORT"]) ? $_ENV["DB_PORT"] : "3306");
    $database = isset($_ENV["{$prefix}_DATABASE"]) ? $_ENV["{$prefix}_DATABASE"] : (isset($_ENV["DB_NAME"]) ? $_ENV["DB_NAME"] : null);
    $user = isset($_ENV["{$prefix}_USER"]) ? $_ENV["{$prefix}_USER"] : (isset($_ENV["DB_USER"]) ? $_ENV["DB_USER"] : null);
    $password = isset($_ENV["{$prefix}_PASSWORD"]) ? $_ENV["{$prefix}_PASSWORD"] : (isset($_ENV["DB_PASSWORD"]) ? $_ENV["DB_PASSWORD"] : null);

    if (!$host || !$database) {
        throw new Exception("[PDO:$phase] Variáveis de conexão incompletas no .env. Defina {$prefix}_HOST e {$prefix}_DATABASE.");
    }

    $dsn = "mysql:host=$host;port=$port;dbname=$database;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_PERSISTENT => true, // Conexões persistentes sob Apache
    ];

    try {
        $pdo = new PDO($dsn, $user, $password, $options);
        
        // Aumenta o tamanho de max_allowed_packet se necessário
        try {
            $pdo->exec("SET GLOBAL max_allowed_packet = 1073741824");
        } catch (Exception $e) {
            // Ignora se não houver permissão de admin
        }

        $connections[$phase] = $pdo;
        return $pdo;
    } catch (PDOException $e) {
        throw new Exception("Falha na conexão de banco [$phase]: " . $e->getMessage());
    }
}

// Atalhos semânticos
function getPDO() { return getPDOFor('air'); }
function getAuthPDO() { return getPDOFor('auth'); }
function getFinPDO() { return getPDOFor('fin'); }
function getSeaPDO() { return getPDOFor('sea'); }
function getOpsPDO() { return getPDOFor('ops'); }
function getAdminPDO() { return getPDOFor('admin'); }
function getOlimpoPDO() { return getPDOFor('olimpo'); }

/**
 * Executa uma query com tentativa automática (retry).
 */
function queryWithRetry($pdo, $sql, $params = [], $maxRetries = 1) {
    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            
            // Se for SELECT, retorna o resultado completo
            if (preg_match('/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)/i', $sql)) {
                return $stmt->fetchAll();
            }
            
            // Para comandos de escrita, retorna informações úteis
            return [
                'affectedRows' => $stmt->rowCount(),
                'insertId' => $pdo->lastInsertId()
            ];
        } catch (Exception $e) {
            if ($attempt === $maxRetries) {
                throw $e;
            }
            usleep(500000); // Aguarda 500ms antes de tentar novamente
        }
    }
}
