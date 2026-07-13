<?php
// api/cron_sea_recover.php
//
// Rede de segurança para o worker de análise SEA. O disparo normal (loopback
// HTTP + fastcgi_finish_request, ver runPHPBackground em helper.php) roda o
// worker "destacado" da conexão do cliente. Em produção (Hostinger/LiteSpeed)
// esse processo destacado morre em silêncio às vezes — sem exceção, sem
// timeout individual disparando, só some (confirmado via heartbeat: run 1164
// gravou progresso aos 5s e nunca mais, até o watchdog externo de 300s matar
// a run 300s depois). Isso não é um loop preso que dá pra corrigir no código
// do cURL; é o processo em si sumindo.
//
// Este script deve ser chamado por um CRON JOB de verdade no hPanel (ex: a
// cada 1 minuto). Cron jobs não são "processos destacados de uma requisição
// HTTP" — são processos legítimos e esperados, não alvo do mesmo mecanismo
// que mata o worker via loopback. Ele varre runs 'pendente'/'analisando'
// abandonadas há tempo suficiente e as reprocessa de forma síncrona dentro
// do próprio processo do cron (sem loopback, sem fastcgi_finish_request).
//
// Uso: php api/cron_sea_recover.php   (SOMENTE via CLI)

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Este script só pode ser executado via CLI (cron), não via web.\n";
    exit(1);
}

set_time_limit(1200);
ini_set('memory_limit', '1024M');

require_once __DIR__ . '/env.php';

$envDirs = [
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__, 2) . '/app.env',
    dirname(__DIR__) . '/.env',
    dirname(__DIR__) . '/app.env'
];
foreach ($envDirs as $path) {
    if (file_exists($path)) {
        loadEnv($path);
        break;
    }
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/helper.php';
require_once __DIR__ . '/routes/upload_helper.php';

$GLOBALS['router'] = new Router();
require_once __DIR__ . '/routes/sea.php';

function cronLog($msg, $extra = []) {
    echo "[SEA_CRON_RECOVER] $msg " . json_encode($extra) . "\n";
    error_log("[SEA_CRON_RECOVER] $msg " . json_encode($extra));
}

// Só considera abandonada uma run 'pendente' há mais de 90s (tempo de sobra
// para o disparo normal via loopback assumir) ou 'analisando' há mais de
// 200s (abaixo do watchdog externo de 300s do endpoint de status — ver
// $processingTimeoutSeconds em sea.php — para recuperar ANTES do usuário
// ver o erro de timeout, não depois).
// 260s para 'analisando': acima do pior caso teórico legítimo da pipeline
// (~240s — ver seaBuildAnthropicRequest/seaBuildGeminiRequest/
// seaArbitrateWithOpenAIPHP) para não competir com um worker original que
// ainda esteja genuinamente vivo e prestes a terminar sozinho. Ainda fica
// abaixo dos 300s do watchdog do endpoint de status, então a recuperação
// começa antes do usuário ver o erro de timeout.
$stuckRuns = seaQuery("
    SELECT id, item_id, mode, status, created_at, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_s
    FROM dados_dachser.t_sea_runs
    WHERE (status = 'pendente' AND created_at < NOW() - INTERVAL 90 SECOND)
       OR (status = 'analisando' AND created_at < NOW() - INTERVAL 260 SECOND)
    ORDER BY created_at ASC
    LIMIT 20
");

if (empty($stuckRuns)) {
    cronLog('NO_STUCK_RUNS_FOUND');
    exit(0);
}

cronLog('STUCK_RUNS_FOUND', ['count' => count($stuckRuns), 'ids' => array_column($stuckRuns, 'id')]);

foreach ($stuckRuns as $run) {
    $runId = (int)$run['id'];
    $pdo = getSeaPDO();

    // Lock consultivo do MySQL — evita que dois ticks de cron sobrepostos (ex:
    // cron a cada 1min processando uma run que leva 4min) reprocessem a MESMA
    // run em paralelo. GET_LOCK com timeout 0 retorna imediatamente se já
    // estiver travado por outra sessão/processo.
    $lockName = 'sea_run_recover_' . $runId;
    $lockRow = $pdo->query("SELECT GET_LOCK(" . $pdo->quote($lockName) . ", 0) AS got")->fetch();
    if (!$lockRow || (int)$lockRow['got'] !== 1) {
        cronLog('RUN_LOCK_BUSY_SKIPPING', ['runId' => $runId]);
        continue;
    }

    try {
        // Reconfirma o status DEPOIS de obter o lock — outra run (loopback
        // original ainda vivo, ou outro tick de cron) pode ter concluído
        // entre a SELECT acima e agora.
        $fresh = seaQuery("SELECT status FROM dados_dachser.t_sea_runs WHERE id = ? LIMIT 1", [$runId]);
        if (empty($fresh) || !in_array($fresh[0]['status'], ['pendente', 'analisando'], true)) {
            cronLog('RUN_NO_LONGER_STUCK_SKIPPING', ['runId' => $runId, 'status' => $fresh[0]['status'] ?? 'not_found']);
            continue;
        }

        $jobFile = sys_get_temp_dir() . '/dachser_analysis_job_' . $runId . '.json';
        if (!file_exists($jobFile)) {
            cronLog('JOB_FILE_MISSING_MARKING_ERROR', ['runId' => $runId, 'jobFile' => $jobFile]);
            $errorPayload = json_encode([
                'success' => false,
                'error' => 'O worker original foi encerrado e o arquivo do job não está mais disponível para nova tentativa automática.',
                'errorCode' => 'SEA_CRON_RECOVERY_JOB_FILE_MISSING',
                'stage' => 'CRON_RECOVERY',
            ]);
            seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ?, completed_at = NOW() WHERE id = ?", [$errorPayload, $runId]);
            if (!empty($run['item_id'])) {
                seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'erro' WHERE id = ?", [$run['item_id']]);
            }
            continue;
        }

        $jobData = json_decode(file_get_contents($jobFile), true);
        if (!$jobData || ($jobData['task'] ?? '') !== 'sea_analysis') {
            cronLog('JOB_FILE_INVALID_SKIPPING', ['runId' => $runId]);
            continue;
        }

        cronLog('RECOVERING_RUN', ['runId' => $runId, 'elapsedSecondsBeforeRecovery' => $run['elapsed_s']]);
        processSeaAnalysisRunPHP(
            $runId,
            $jobData['itemId'] ?? null,
            $jobData['analysisType'] ?? null,
            $jobData['files'] ?? [],
            $jobData['context'] ?? [],
            'sea_cron_recover_' . $runId
        );
        cronLog('RUN_RECOVERY_COMPLETED', ['runId' => $runId]);
        @unlink($jobFile);
    } catch (Throwable $e) {
        cronLog('RUN_RECOVERY_FAILED', ['runId' => $runId, 'error' => $e->getMessage()]);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK(" . $pdo->quote($lockName) . ")");
    }
}

cronLog('CRON_RUN_COMPLETE');
