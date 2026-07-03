<?php
// api/index.php
// Entrada unificada para requisições de API sob Apache/XAMPP

// 1. CORS Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, x-api-key, anthropic-version");

// Se for requisição OPTIONS, encerra imediatamente (Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Oculta warnings em ambiente de produção se desejado, mas mostra erros fatais
ini_set('display_errors', 1);
error_reporting(E_ALL);

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

// Helpers para retorno de JSON
function sendJson($data, $status = 200) {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($data);
    exit;
}

// Helper para ler corpo em formato JSON
function getRequestBody() {
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

// Rota de Health-check padrão
if ($route === 'health' && $method === 'GET') {
    sendJson([
        'success' => true,
        'service' => 'dachser-api-php',
        'time' => date('c')
    ]);
}

// Executa o roteamento
$router->dispatch($method, $route);
