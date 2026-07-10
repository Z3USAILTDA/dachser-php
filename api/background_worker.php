<?php
// api/background_worker.php
// Executa tarefas de background de forma assíncrona (especialmente análises com IAs)

// Sobrescreve limite de tempo e memória para execuções em segundo plano
set_time_limit(600);
ini_set('memory_limit', '1024M');

// Carrega a infraestrutura base da API
require_once __DIR__ . '/env.php';
loadEnv(dirname(__DIR__) . '/.env');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/helper.php';
require_once __DIR__ . '/routes/upload_helper.php';

// routes/sea.php e routes/chb.php registram rotas ($router->get/post) no escopo
// global assim que são incluídos — sem isso o worker CLI morre com um fatal
// "Call to a member function get() on null" antes de processar qualquer job,
// e o processo, mesmo tendo morrido, ainda cria o arquivo de log usado como
// sinal de "worker iniciado", mascarando a falha (a análise fica presa em
// pending/pendente indefinidamente).
$GLOBALS['router'] = new Router();

// Argumento 1: Caminho do arquivo JSON com os parâmetros do job
if ($argc < 2) {
    echo "Erro: Caminho do arquivo de job não especificado.\n";
    exit(1);
}

$jobFile = $argv[1];
if (!file_exists($jobFile)) {
    echo "Erro: Arquivo de job não encontrado: $jobFile\n";
    exit(1);
}

$jobData = json_decode(file_get_contents($jobFile), true);
if (!$jobData) {
    echo "Erro: Falha ao decodificar dados do job.\n";
    @unlink($jobFile);
    exit(1);
}

$task = isset($jobData['task']) ? $jobData['task'] : '';

try {
    if ($task === 'sea_analysis') {
        require_once __DIR__ . '/routes/sea.php';
        
        $runId = $jobData['runId'];
        $itemId = $jobData['itemId'];
        $analysisType = $jobData['analysisType'];
        $files = $jobData['files'];
        $context = $jobData['context'];
        $requestId = isset($jobData['requestId']) ? $jobData['requestId'] : null;

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
        echo "Erro: Tarefa desconhecida: $task\n";
    }
} catch (Throwable $e) {
    // Throwable (não apenas Exception) para também capturar Error fatais de PHP
    // (ex: chamada de método em objeto null) e registrá-los em vez de morrer
    // silenciosamente deixando o job travado.
    error_log("[background_worker] Erro fatal na tarefa $task: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
} finally {
    // Garante que o arquivo temporário do job seja excluído
    @unlink($jobFile);
}
