<?php
// api/index.php
// Entrada unificada para requisições de API sob Apache/XAMPP

// Ativa buffering de saída para evitar que warnings/erros quebrem a estrutura do JSON
ob_start();

// 1. CORS Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, x-api-key, anthropic-version");

// Se for requisição OPTIONS, encerra imediatamente (Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Em produção, nunca exibir erros — eles corrompem o JSON
ini_set('display_errors', 0);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);

// 2. Carrega dependências de infraestrutura
require_once __DIR__ . '/env.php';
$paths = [
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__, 2) . '/app.env',
    dirname(__DIR__) . '/.env',
    dirname(__DIR__) . '/app.env'
];
$envFile = null;
foreach ($paths as $path) {
    if (file_exists($path)) {
        $envFile = $path;
        break;
    }
}
if ($envFile) {
    loadEnv($envFile);
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/helper.php';
require_once __DIR__ . '/routes/upload_helper.php';

// Helpers para retorno de JSON
function sendJson($data, $status = 200)
{
    // Limpa qualquer output bufferizado anteriormente (e.g. warnings, echos acidentais)
    if (ob_get_length() > 0) {
        ob_clean();
    }

    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($data);

    // Se existir função de terminar a request (PHP-FPM), executamos para liberar o client
    // e permitir que o script continue rodando em background (ex: atualizar cache).
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        // Fallback para fechar buffer e tentar liberar a conexão
        while (ob_get_level() > 0)
            ob_end_flush();
        flush();
    }

    // Encerra imediatamente para garantir que nenhum warning, notice ou HTML posterior corrompa o JSON
    exit(0);
}

// Helper para ler corpo em formato JSON
function getRequestBody()
{
    $input = file_get_contents('php://input');
    return json_decode($input, true) ?? [];
}

// 3. Inicializa o Roteador
$router = new Router();

// 4. Carrega as rotas dos arquivos modulares
require_once __DIR__ . '/routes/auth.php';
require_once __DIR__ . '/routes/admin.php';
require_once __DIR__ . '/routes/air.php';
require_once __DIR__ . '/routes/sea.php';
require_once __DIR__ . '/routes/chb.php';
require_once __DIR__ . '/routes/demurrage.php';
require_once __DIR__ . '/routes/fin.php';
require_once __DIR__ . '/routes/olimpo.php';

// 5. Determina a rota atual relativa a '/api/'
$request_uri = $_SERVER['REQUEST_URI'];
$base_path = '/api/';

$pos = strpos($request_uri, $base_path);
if ($pos === false) {
    sendJson(["success" => false, "error" => "Entrada de API inválida"], 404);
}

$path = substr($request_uri, $pos + strlen($base_path));
$path_parts = explode('?', $path);
$route = trim($path_parts[0], '/');
$method = $_SERVER['REQUEST_METHOD'];

// Rota de teste de deploy
if ($route === 'test-deploy' && $method === 'GET') {
    $seaFile = __DIR__ . '/routes/sea.php';
    sendJson([
        'success' => true,
        'sea_file_exists' => file_exists($seaFile),
        'sea_file_size' => file_exists($seaFile) ? filesize($seaFile) : 0,
        'sea_file_md5' => file_exists($seaFile) ? md5_file($seaFile) : '',
        'sea_file_mtime' => file_exists($seaFile) ? date('c', filemtime($seaFile)) : '',
    ]);
    return;
}

// Rota de diagnóstico de ambiente
if ($route === 'chb/diagnosticos' && $method === 'GET') {
    $disabled = ini_get('disable_functions');
    $execEnabled = function_exists('exec') && !in_array('exec', array_map('trim', explode(',', $disabled)));
    $popenEnabled = function_exists('popen') && !in_array('popen', array_map('trim', explode(',', $disabled)));
    
    $testExec = 'Not run';
    if ($execEnabled) {
        try {
            $testOutput = [];
            exec('php -v 2>&1', $testOutput, $code);
            $testExec = [
                'output' => implode("\n", $testOutput),
                'exit_code' => $code
            ];
        } catch (Throwable $e) {
            $testExec = 'Exception: ' . $e->getMessage();
        }
    }

    // Teste de conexão cURL local
    $testLoopback = 'Not run';
    try {
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['SERVER_PORT'] == 443)
            || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $protocol = $isHttps ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $url = $protocol . $host . "/api/health";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        
        $testLoopback = [
            'url' => $url,
            'is_https_detected' => $isHttps,
            'http_code' => $httpCode,
            'response' => $res,
            'error' => $curlErr
        ];
    } catch (Throwable $e) {
        $testLoopback = 'Exception: ' . $e->getMessage();
    }

    sendJson([
        'success' => true,
        'php_os' => PHP_OS,
        'php_version' => PHP_VERSION,
        'php_binary' => defined('PHP_BINARY') ? PHP_BINARY : 'Not defined',
        'php_default_timezone' => date_default_timezone_get(),
        'php_time' => time(),
        'php_date_now' => date('Y-m-d H:i:s'),
        'php_gmdate_now' => gmdate('Y-m-d H:i:s'),
        'disable_functions' => $disabled,
        'exec_enabled' => $execEnabled,
        'popen_enabled' => $popenEnabled,
        'test_php_cli' => $testExec,
        'test_loopback' => $testLoopback,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'Unknown',
        'current_file' => __FILE__,
    ]);
    return;
}

// Rota para execução de background tasks por Loopback HTTP
if ($route === 'background-worker' && $method === 'POST') {
    $body = getRequestBody();
    $jobFile = $body['jobFile'] ?? null;
    
    if (!$jobFile || !file_exists($jobFile)) {
        sendJson(['success' => false, 'error' => 'Arquivo de job inválido'], 400);
    }
    
    // Libera a requisição HTTP imediatamente
    if (function_exists('fastcgi_finish_request')) {
        sendJson(['success' => true, 'message' => 'Executando em background via FastCGI']);
        fastcgi_finish_request();
    } else {
        ignore_user_abort(true);
        set_time_limit(600);
        ob_start();
        echo json_encode(['success' => true, 'message' => 'Executando em background via loopback']);
        $size = ob_get_length();
        header("Content-Length: $size");
        header("Connection: close");
        ob_end_flush();
        flush();
    }
    
    // Processa a tarefa após a liberação da conexão
    try {
        $jobData = json_decode(file_get_contents($jobFile), true);
        if ($jobData) {
            $task = $jobData['task'] ?? '';
            if ($task === 'sea_analysis') {
                require_once __DIR__ . '/routes/sea.php';
                processSeaAnalysisRunPHP(
                    $jobData['runId'],
                    $jobData['itemId'],
                    $jobData['analysisType'],
                    $jobData['files'],
                    $jobData['context']
                );
            } else if ($task === 'chb_analysis') {
                require_once __DIR__ . '/routes/chb.php';
                chbProcessAnalysis(
                    $jobData['runId'],
                    $jobData['stepId'],
                    $jobData['files'],
                    $jobData['clientConfig'],
                    $jobData['itemId']
                );
            }
        }
    } catch (Throwable $e) {
        error_log("[background-worker] Loopback execution error: " . $e->getMessage());
    } finally {
        @unlink($jobFile);
    }
    exit(0);
}

// Rota de Health-check padrão
if ($route === 'health' && $method === 'GET') {
    sendJson([
        'success' => true,
        'service' => 'dachser-api-php',
        'time' => date('c')
    ]);
    return;
}

// Executa o roteamento
$router->dispatch($method, $route);
