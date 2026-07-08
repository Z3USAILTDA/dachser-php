<?php
// api/invalidate.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

$files = [
    __DIR__ . '/routes/sea.php',
    __DIR__ . '/index.php',
    __DIR__ . '/test_opcache.php',
    __DIR__ . '/routes/admin.php'
];

$results = [];
foreach ($files as $file) {
    $real = realpath($file);
    if ($real) {
        $results[basename($file)] = [
            "path" => $real,
            "invalidated" => opcache_invalidate($real, true)
        ];
    } else {
        $results[basename($file)] = [
            "error" => "File not found"
        ];
    }
}

echo json_encode([
    "success" => true,
    "results" => $results,
    "time" => date('c')
], JSON_PRETTY_PRINT);
