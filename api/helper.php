<?php
// api/helper.php
// Funções utilitárias e simulação do fetch do Javascript

/**
 * Envia e-mail via API do Resend.
 */
function sendEmailResend($to, $subject, $html, $text = '', $attachments = []) {
    $apiKey = isset($_ENV['RESEND_API_KEY']) ? $_ENV['RESEND_API_KEY'] : null;
    $from = isset($_ENV['RESEND_FROM']) ? $_ENV['RESEND_FROM'] : 'Z3US System <noreply@hermes.z3us.ai>';
    
    if (!$apiKey) {
        error_log("[sendEmailResend] RESEND_API_KEY nao configurada no .env");
        return false;
    }

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $payload = [
        'from' => $from,
        'to' => is_array($to) ? $to : array_map('trim', explode(',', $to)),
        'subject' => $subject,
        'html' => $html
    ];

    if (!empty($text)) {
        $payload['text'] = $text;
    }

    if (!empty($attachments)) {
        $payload['attachments'] = [];
        foreach ($attachments as $att) {
            // Anexos em PHP vêm com filename e content (em base64)
            $payload['attachments'][] = [
                'filename' => $att['filename'],
                'content' => $att['content'], // Já deve vir em base64 se copiado do express
            ];
        }
    }

    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        return json_decode($response, true);
    } else {
        error_log("[sendEmailResend] Erro ao enviar e-mail. Codigo HTTP: $httpCode. Resposta: $response");
        return false;
    }
}

/**
 * Simula a função fetch() do Javascript no PHP.
 */
function fetch($url, $options = []) {
    $method = isset($options['method']) ? strtoupper($options['method']) : 'GET';
    $headers = isset($options['headers']) ? $options['headers'] : [];
    $body = isset($options['body']) ? $options['body'] : null;

    // Timeouts separados: conexão (10s) e resposta total (300s para IAs)
    $connectTimeout = isset($options['connectTimeout']) ? (int)$options['connectTimeout'] : 10;
    $responseTimeout = isset($options['timeout']) ? (int)$options['timeout'] : 300;

    // Contexto de log (passado via options para rastreamento estruturado)
    $logCtx = isset($options['logCtx']) ? $options['logCtx'] : [];

    // Sanitiza URL para log (remove query strings com tokens)
    $urlSanitized = preg_replace('/([?&])(key|token|apikey|api_key)=[^&]*/i', '$1***', $url);
    $urlParts = parse_url($url);
    $host = $urlParts['host'] ?? 'unknown';
    $payloadSize = $body !== null ? strlen($body) : 0;

    error_log("[CHB_CURL_REQUEST_STARTED] " . json_encode(array_merge([
        'url' => $urlSanitized,
        'host' => $host,
        'method' => $method,
        'connectTimeoutMs' => $connectTimeout * 1000,
        'timeoutMs' => $responseTimeout * 1000,
        'payloadSize' => $payloadSize,
        'timestamp' => date('Y-m-d H:i:s'),
    ], $logCtx)));

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
    curl_setopt($ch, CURLOPT_TIMEOUT, $responseTimeout);

    $formattedHeaders = [];
    foreach ($headers as $k => $v) {
        if (is_numeric($k)) {
            $formattedHeaders[] = $v;
        } else {
            $formattedHeaders[] = "$k: $v";
        }
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $formattedHeaders);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);
    $httpCode        = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErrno       = curl_errno($ch);
    $curlError       = curl_error($ch);
    $totalTime       = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
    $connectTime     = curl_getinfo($ch, CURLINFO_CONNECT_TIME);
    $startTransfer   = curl_getinfo($ch, CURLINFO_STARTTRANSFER_TIME);
    $primaryIp       = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
    $bytesReceived   = curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD);
    curl_close($ch);

    error_log("[CHB_CURL_REQUEST_FINISHED] " . json_encode(array_merge([
        'url' => $urlSanitized,
        'host' => $host,
        'httpCode' => $httpCode,
        'curlErrno' => $curlErrno,
        'curlError' => $curlError ?: null,
        'totalTime' => round($totalTime, 3),
        'connectTime' => round($connectTime, 3),
        'startTransferTime' => round($startTransfer, 3),
        'primaryIp' => $primaryIp ?: null,
        'bytesReceived' => $bytesReceived,
        'timestamp' => date('Y-m-d H:i:s'),
    ], $logCtx)));

    if ($curlError) {
        // Classifica o tipo de falha para stage mais específico
        if ($curlErrno === CURLE_OPERATION_TIMEDOUT && $connectTime < 0.01) {
            throw new Exception("[CHB_AI_CONNECTION_TIMEOUT] cURL: " . $curlError);
        } elseif ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
            throw new Exception("[CHB_AI_RESPONSE_TIMEOUT] cURL: " . $curlError);
        }
        throw new Exception("[CHB_CURL_ERROR_" . $curlErrno . "] cURL: " . $curlError);
    }

    return [
        'ok' => ($httpCode >= 200 && $httpCode < 300),
        'status' => $httpCode,
        'body' => $response,
        'json' => function() use ($response) {
            return json_decode($response, true);
        }
    ];
}

/**
 * Retorna valor armazenado em cache se ainda válido.
 */
function getCache($key, $ttlSeconds) {
    $file = sys_get_temp_dir() . '/dachser_cache_' . md5($key) . '.json';
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (isset($data['expiry']) && $data['expiry'] > time()) {
            return $data['value'];
        }
    }
    return null;
}

/**
 * Retorna cache validando Stale-While-Revalidate.
 * Se estiver vencido mas dentro da janela stale, retorna junto com flag is_stale.
 */
function getCacheStale($key, $ttlSeconds, $staleTtlSeconds = 86400) {
    $file = sys_get_temp_dir() . '/dachser_cache_' . md5($key) . '.json';
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (isset($data['expiry'])) {
            $isFresh = $data['expiry'] > time();
            $isStaleValid = ($data['expiry'] + $staleTtlSeconds) > time();
            if ($isFresh || $isStaleValid) {
                return [
                    'value' => $data['value'],
                    'is_stale' => !$isFresh
                ];
            }
        }
    }
    return null;
}

/**
 * Armazena valor em cache com TTL.
 */
function setCache($key, $value, $ttlSeconds) {
    $file = sys_get_temp_dir() . '/dachser_cache_' . md5($key) . '.json';
    $data = [
        'expiry' => time() + $ttlSeconds,
        'value' => $value
    ];
    file_put_contents($file, json_encode($data));
}

/**
 * Lê um arquivo XLSX binário e retorna um array associativo das linhas (primeira linha como chaves).
 */
function parseXlsxSimple($xlsxBase64) {
    $xlsxData = base64_decode($xlsxBase64);
    
    $tempFile = tempnam(sys_get_temp_dir(), 'xlsx');
    file_put_contents($tempFile, $xlsxData);
    
    $zip = new ZipArchive();
    if ($zip->open($tempFile) !== true) {
        @unlink($tempFile);
        throw new Exception("Não foi possível abrir o arquivo XLSX (formato inválido).");
    }
    
    // 1. Lê os Shared Strings
    $sharedStrings = [];
    $stringsXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($stringsXml) {
        $xml = simplexml_load_string($stringsXml);
        if ($xml && $xml->si) {
            foreach ($xml->si as $si) {
                // Pode haver tags 't' ou filhos formatados
                if (isset($si->t)) {
                    $sharedStrings[] = (string)$si->t;
                } else {
                    $sharedStrings[] = (string)$si->r->t;
                }
            }
        }
    }
    
    // 2. Lê a primeira planilha (sheet1.xml)
    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    if (!$sheetXml) {
        $zip->close();
        @unlink($tempFile);
        throw new Exception("Planilha vazia ou inválida.");
    }
    
    $xml = simplexml_load_string($sheetXml);
    $rows = [];
    $headers = [];
    
    if ($xml && $xml->sheetData && $xml->sheetData->row) {
        foreach ($xml->sheetData->row as $rowNode) {
            $rowIndex = (int)$rowNode['r'];
            $rowData = [];
            
            foreach ($rowNode->c as $cNode) {
                $cellRef = (string)$cNode['r'];
                preg_match('/^[A-Z]+/', $cellRef, $colMatch);
                $col = $colMatch[0];
                
                $val = (string)$cNode->v;
                $type = (string)$cNode['t'];
                
                if ($type === 's' && isset($sharedStrings[(int)$val])) {
                    $val = $sharedStrings[(int)$val];
                }
                
                $rowData[$col] = $val;
            }
            
            if ($rowIndex === 1) {
                $headers = $rowData;
            } else {
                $mappedRow = [];
                foreach ($headers as $col => $headerName) {
                    $mappedRow[$headerName] = isset($rowData[$col]) ? $rowData[$col] : '';
                }
                $rows[] = $mappedRow;
            }
        }
    }
    
    $zip->close();
    @unlink($tempFile);
    return $rows;
}

/**
 * Executa um script PHP em background.
 * Retorna array com 'success', 'method' e 'error' (se falhou).
 */
function runPHPBackground($scriptPath, $args = []) {
    if (strncasecmp(PHP_OS, 'WIN', 3) === 0) {
        // Windows: dispara via start /B
        $phpBin = 'C:\\xampp\\php\\php.exe';
        if (!file_exists($phpBin)) $phpBin = 'php';
        $escapedArgs = array_map('escapeshellarg', $args);
        $argsStr = implode(' ', $escapedArgs);
        $cmd = "start /B \"\" " . escapeshellarg($phpBin) . " " . escapeshellarg($scriptPath) . " " . $argsStr . " > NUL 2>&1";
        pclose(popen($cmd, "r"));
        error_log("[CHB_WORKER_DISPATCHED] method=windows cmd=" . $cmd);
        return ['success' => true, 'method' => 'windows'];
    }

    // ── ESTRATÉGIA 1: PHP CLI via exec (preferida em shared hosting) ──────────
    $disabled = ini_get('disable_functions');
    $execEnabled = function_exists('exec') && !in_array('exec', array_map('trim', explode(',', $disabled)));

    if ($execEnabled) {
        // Determina binário PHP CLI adequado
        $phpBin = 'php';
        $candidates = [];

        if (defined('PHP_BINARY') && PHP_BINARY) {
            $binaryName = basename(PHP_BINARY);
            // Exclui CGI/FPM — apenas CLI real
            if (in_array($binaryName, ['php', 'php-cli', 'php.exe'])) {
                $candidates[] = PHP_BINARY;
            }
        }

        // Candidatos genéricos de shared hosting
        $candidates = array_merge($candidates, [
            '/usr/bin/php',
            '/usr/local/bin/php',
            '/opt/cpanel/ea-php83/root/usr/bin/php',
            '/opt/cpanel/ea-php82/root/usr/bin/php',
            '/opt/cpanel/ea-php81/root/usr/bin/php',
            'php'
        ]);

        foreach ($candidates as $candidate) {
            if ($candidate === 'php' || (file_exists($candidate) && is_executable($candidate))) {
                $phpBin = $candidate;
                break;
            }
        }

        $escapedArgs = array_map('escapeshellarg', $args);
        $argsStr = implode(' ', $escapedArgs);
        $logFile = sys_get_temp_dir() . '/dachser_worker_' . md5($argsStr) . '.log';
        $cmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($scriptPath) . ' ' . $argsStr . ' > ' . escapeshellarg($logFile) . ' 2>&1 &';

        error_log("[CHB_WORKER_DISPATCHED] method=cli phpBin=$phpBin scriptPath=$scriptPath cmd=$cmd");
        exec($cmd, $output, $exitCode);

        // Pequena espera para verificar se o processo iniciou
        usleep(200000); // 200ms
        $started = file_exists($logFile);

        if ($exitCode === 0 || $started) {
            error_log("[CHB_WORKER_STARTED] method=cli phpBin=$phpBin pid_check=started=$started");
            return ['success' => true, 'method' => 'cli', 'phpBin' => $phpBin];
        }

        error_log("[CHB_WORKER_DISPATCH_FAILED] method=cli phpBin=$phpBin exitCode=$exitCode");
    }

    // ── ESTRATÉGIA 2: Loopback HTTP (apenas como disparo, NÃO aguarda resposta) ─
    // Timeout mínimo de 2s: envia o job e abandona imediatamente.
    // NUNCA use cURL loopback aguardando a resposta completa de um job demorado.
    try {
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['SERVER_PORT'] == 443)
            || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $protocol = $isHttps ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $url = $protocol . $host . '/api/background-worker';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['jobFile' => $args[0]]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Abandona após 3s — só dispara
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $loopErr = curl_error($ch);
        curl_close($ch);

        error_log("[CHB_WORKER_DISPATCHED] method=loopback url=$url httpCode=$httpCode err=$loopErr");

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true, 'method' => 'loopback', 'httpCode' => $httpCode];
        }
    } catch (Throwable $e) {
        error_log("[CHB_WORKER_DISPATCH_FAILED] method=loopback error=" . $e->getMessage());
    }

    // ── FALHA TOTAL: nenhum método funcionou ─────────────────────────────────
    error_log("[CHB_WORKER_DISPATCH_FAILED] All dispatch methods failed. scriptPath=$scriptPath");
    return ['success' => false, 'method' => 'none', 'error' => 'exec bloqueado e loopback falhou'];
}



