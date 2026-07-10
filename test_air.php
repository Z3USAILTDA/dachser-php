<?php
require 'api/db.php';
$_ENV['MARIADB_AIR_HOST'] = '177.70.19.42';
$_ENV['MARIADB_AIR_PORT'] = '3306';
$_ENV['MARIADB_AIR_DATABASE'] = 'dados_dachser';
$_ENV['MARIADB_AIR_USER'] = 'air_dachser';
$_ENV['MARIADB_AIR_PASSWORD'] = 'owSSkt2a@root';

class DummyRouter {
    public function get($route, $callable) {}
    public function post($route, $callable) {}
    public function put($route, $callable) {}
    public function delete($route, $callable) {}
    public function patch($route, $callable) {}
}
$router = new DummyRouter();

function sendJson($data, $code=200) {}
function getCache($key, $ttl) { return null; }
function setCache($key, $data) {}
function getRequestBody() { return []; }

try {
    require 'api/routes/air.php';
    $res = computeTrackingData();
    echo "SUCCESS, rows: " . count($res['data']) . "\n";
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
