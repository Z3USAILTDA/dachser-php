<?php
// api/debug_submit.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header("Access-Control-Allow-Origin: *");
header("Content-Type: text/plain; charset=utf-8");

echo "DEBUG SUBMIT START\n";

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helper.php';

echo "Requires finished successfully.\n";

$itemId = 689;
$analysisType = 'manifest_hbl';
$files = [
    [
        'name' => 'hbl SEKU5762065.PDF',
        'type' => 'application/pdf',
        'size' => 100,
        'content' => 'SGVsbG8='
    ]
];
$fileUrls = [];
$linkData = null;

try {
    echo "1. Checking database connection...\n";
    $pdo = getSeaPDO();
    echo "Database connected.\n";

    $actualItemId = $itemId ? (int)$itemId : null;
    $modeValue = $analysisType === 'invoices_hbl' ? 'hbl_mbl' : $analysisType;

    echo "2. Inserting into t_sea_runs (item_id=$actualItemId, mode=$modeValue)...\n";
    $stmt = $pdo->prepare("INSERT INTO dados_dachser.t_sea_runs (item_id, mode, status, created_at) VALUES (?, ?, 'pendente', NOW())");
    $stmt->execute([$actualItemId, $modeValue]);
    $runId = (int)$pdo->lastInsertId();
    echo "t_sea_runs inserted successfully. Run ID: $runId\n";

    echo "3. Inserting files into t_sea_files...\n";
    foreach ($files as $file) {
        $stmtFile = $pdo->prepare("
            INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, item_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        ");
        $stmtFile->execute([
            $file['name'], 
            isset($file['type']) ? $file['type'] : 'application/octet-stream', 
            isset($file['size']) ? $file['size'] : 0, 
            '', '', $actualItemId
        ]);
    }
    echo "Files inserted successfully.\n";

    echo "4. Updating t_sea_items status...\n";
    if ($actualItemId) {
        $stmtUpdate = $pdo->prepare("UPDATE dados_dachser.t_sea_items SET status = 'queued' WHERE id = ?");
        $stmtUpdate->execute([$actualItemId]);
    }
    echo "t_sea_items updated successfully.\n";

    echo "5. Preparing background job...\n";
    $allFiles = [];
    foreach ($files as $f) { $allFiles[] = array_merge($f, ['mimeType' => isset($f['mimeType']) ? $f['mimeType'] : (isset($f['type']) ? $f['type'] : 'application/octet-stream')]); }

    $jobData = [
        'task' => 'sea_analysis',
        'runId' => $runId,
        'itemId' => $actualItemId,
        'analysisType' => $analysisType,
        'files' => $allFiles,
        'context' => ['linkData' => $linkData]
    ];
    
    $jobFile = sys_get_temp_dir() . '/dachser_analysis_job_' . $runId . '.json';
    echo "Job file path: $jobFile\n";
    
    $written = file_put_contents($jobFile, json_encode($jobData));
    echo "file_put_contents returned: " . ($written !== false ? "$written bytes written" : "false") . "\n";
    
    echo "6. Running background worker...\n";
    runPHPBackground(dirname(__DIR__) . '/background_worker.php', [$jobFile]);
    echo "Background worker spawned successfully.\n";

    echo "DEBUG SUBMIT COMPLETE - ALL STEPS SUCCESSFUL\n";
} catch (Throwable $e) {
    echo "ERROR OCCURRED: " . $e->getMessage() . "\n";
    echo "Trace:\n" . $e->getTraceAsString() . "\n";
}
