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
require_once __DIR__ . '/helper.php';

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
} catch (Exception $e) {
    error_log("[background_worker] Erro fatal na tarefa $task: " . $e->getMessage());
} finally {
    // Garante que o arquivo temporário do job seja excluído
    @unlink($jobFile);
}
