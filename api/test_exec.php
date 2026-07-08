<?php
// api/test_exec.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

$success = false;
$msg = "";
$output = [];
$return_var = null;

try {
    if (function_exists('exec')) {
        // Try calling exec
        exec('echo "Hello from exec"', $output, $return_var);
        $success = true;
        $msg = "exec() executes successfully. Output: " . implode("\n", $output) . " | Return code: " . $return_var;
    } else {
        $msg = "exec() function is disabled or does not exist.";
    }
} catch (Throwable $e) {
    $msg = "Exception/Error caught: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
}

echo json_encode([
    "success" => $success,
    "message" => $msg,
    "time" => date('c')
], JSON_PRETTY_PRINT);
