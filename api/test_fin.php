<?php
require_once __DIR__ . '/helper.php';
require_once __DIR__ . '/db.php';

$pdo = getFinPDO();
$sql = "SELECT COUNT(*) as total FROM dados_dachser.t_vouchers v WHERE v.sync_status = 'ATIVO' AND (v.voucher_master_id IS NULL OR v.voucher_master_id = '') AND v.etapa_atual IN ('FINANCEIRO', 'ROBO')";
$res = queryWithRetry($pdo, $sql);
echo "Result: "; print_r($res);
