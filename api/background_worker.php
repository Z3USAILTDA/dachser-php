<?php
// api/background_worker.php
// Executa tarefas de background de forma assíncrona (especialmente análises com IAs)

// Sobrescreve limite de tempo e memória para execuções em segundo plano.
// 1200s (20 min) dá folga sobre o pior caso teórico do pipeline de IA (~900s
// somando Claude + Gemini + arbitragem OpenAI, cada um podendo estourar até 300s).
set_time_limit(1200);
ini_set('memory_limit', '1024M');

// Carrega a infraestrutura base da API
require_once __DIR__ . '/env.php';
loadEnv(dirname(__DIR__) . '/.env');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/helper.php';
require_once __DIR__ . '/routes/upload_helper.php';

// Define helper de checkpoints
function logWorkerCheckpoint($checkpoint, $analysisId = null, $extra = []) {
    $logData = array_merge([
        'checkpoint' => $checkpoint,
        'analysis_id' => $analysisId,
        'timestamp' => date('Y-m-d H:i:s'),
        'sapi' => PHP_SAPI,
        'script' => __FILE__,
        'cwd' => getcwd(),
        'backendVersion' => defined('BACKEND_API_VERSION') ? BACKEND_API_VERSION : 'unknown',
    ], $extra);
    $msg = "[$checkpoint] " . json_encode($logData) . "\n";
    echo $msg;
    error_log($msg);
}

logWorkerCheckpoint('SEA_WORKER_BOOT');

// routes/sea.php e routes/chb.php registram rotas ($router->get/post) no escopo
// global assim que são incluídos — sem isso o worker CLI morre com um fatal
// "Call to a member function get() on null" antes de processar qualquer job
$GLOBALS['router'] = new Router();

// Argumento 1: Caminho do arquivo JSON com os parâmetros do job
if ($argc < 2) {
    logWorkerCheckpoint('SEA_WORKER_ERROR', null, ['error' => 'Caminho do arquivo de job não especificado']);
    echo "Erro: Caminho do arquivo de job não especificado.\n";
    exit(1);
}

$jobFile = $argv[1];
logWorkerCheckpoint('SEA_WORKER_ARGUMENT_RECEIVED', null, ['jobFile' => $jobFile]);

if (!file_exists($jobFile)) {
    logWorkerCheckpoint('SEA_WORKER_ERROR', null, ['error' => 'Arquivo de job não encontrado: ' . $jobFile]);
    echo "Erro: Arquivo de job não encontrado: $jobFile\n";
    exit(1);
}

$jobData = json_decode(file_get_contents($jobFile), true);
if (!$jobData) {
    logWorkerCheckpoint('SEA_WORKER_ERROR', null, ['error' => 'Falha ao decodificar dados do job']);
    echo "Erro: Falha ao decodificar dados do job.\n";
    @unlink($jobFile);
    exit(1);
}

$task = isset($jobData['task']) ? $jobData['task'] : '';
$runId = isset($jobData['runId']) ? $jobData['runId'] : null;

// Verifica conexão com o banco de dados
try {
    $pdo = getSeaPDO();
    logWorkerCheckpoint('SEA_WORKER_DATABASE_CONNECTED', $runId);
} catch (Throwable $dbEx) {
    logWorkerCheckpoint('SEA_WORKER_ERROR', $runId, ['error' => 'Database connection failed: ' . $dbEx->getMessage()]);
    @unlink($jobFile);
    throw $dbEx;
}

try {
    if ($task === 'sea_analysis') {
        require_once __DIR__ . '/routes/sea.php';
        
        $itemId = $jobData['itemId'];
        $analysisType = $jobData['analysisType'];
        $files = $jobData['files'];
        $context = $jobData['context'];
        $requestId = isset($jobData['requestId']) ? $jobData['requestId'] : null;

        // Check if run exists in DB
        $runRows = seaQuery("SELECT id, status FROM dados_dachser.t_sea_runs WHERE id = ? LIMIT 1", [$runId]);
        if (empty($runRows)) {
            logWorkerCheckpoint('SEA_WORKER_ERROR', $runId, ['error' => 'Run not found in database']);
            throw new Exception("Run $runId not found in database.");
        }
        logWorkerCheckpoint('SEA_WORKER_RUN_FOUND', $runId, ['db_status' => $runRows[0]['status']]);
        logWorkerCheckpoint('SEA_WORKER_STATUS_PROCESSING', $runId, ['itemId' => $itemId]);

        processSeaAnalysisRunPHP($runId, $itemId, $analysisType, $files, $context, $requestId);
    } else if ($task === 'chb_analysis') {
        require_once __DIR__ . '/routes/chb.php';
        
        $runId = $jobData['runId'];
        $stepId = $jobData['stepId'];
        $files = $jobData['files'];
        $clientConfig = $jobData['clientConfig'];
        $itemId = $jobData['itemId'];
        
        chbProcessAnalysis($runId, $stepId, $files, $clientConfig, $itemId);
    } else {
        logWorkerCheckpoint('SEA_WORKER_ERROR', $runId, ['error' => 'Tarefa desconhecida: ' . $task]);
        echo "Erro: Tarefa desconhecida: $task\n";
    }
} catch (Throwable $e) {
    logWorkerCheckpoint('SEA_WORKER_ERROR', $runId, [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
    error_log("[background_worker] Erro fatal na tarefa $task: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
} finally {
    // Garante que o arquivo temporário do job seja excluído
    @unlink($jobFile);
}
