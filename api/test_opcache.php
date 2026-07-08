<?php
// api/test_opcache.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

$success = false;
$msg = "";

if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        $success = true;
        $msg = "OPcache has been reset successfully!";
    } else {
        $msg = "Failed to reset OPcache.";
    }
} else {
    $msg = "opcache_reset function does not exist.";
}

echo json_encode([
    "success" => $success,
    "message" => $msg,
    "time" => date('c')
], JSON_PRETTY_PRINT);
