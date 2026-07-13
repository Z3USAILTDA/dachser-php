<?php
// api/helper.php
// Funções utilitárias e simulação do fetch do Javascript

// Versão do backend PHP — bump a cada alteração relevante de comportamento.
// Exposta em /api/health, /api/test-deploy e nos logs estruturados SEA_*/CHB_*
// para permitir confirmar qual código está realmente em produção (não confundir
// com a versão do frontend).
define('BACKEND_API_VERSION', '2026.07.10-sea-chb-worker-fix-9-stage-timing');

/**
 * Normaliza uma data vinda de extração de IA para o formato SQL (Y-m-d) ou NULL.
 * Nunca deve retornar string vazia — colunas DATE não aceitam ''.
 * Trata: null, '', ' ', 'N/A', '-', '--', 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'.
 */
function normalizeSqlDate($value) {
    if ($value === null) return null;
    $v = trim((string)$value);
    if ($v === '' || strcasecmp($v, 'N/A') === 0 || strcasecmp($v, 'NULL') === 0 || $v === '-' || $v === '--') {
        return null;
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
        $d = DateTime::createFromFormat('Y-m-d', $v);
        return ($d && $d->format('Y-m-d') === $v) ? $v : null;
    }

    if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $v)) {
        $d = DateTime::createFromFormat('d/m/Y', $v);
        return ($d && $d->format('d/m/Y') === $v) ? $d->format('Y-m-d') : null;
    }

    if (preg_match('/^\d{2}-\d{2}-\d{4}$/', $v)) {
        $d = DateTime::createFromFormat('d-m-Y', $v);
        return ($d && $d->format('d-m-Y') === $v) ? $d->format('Y-m-d') : null;
    }

    // Formato não reconhecido: preferimos NULL a arriscar SQLSTATE[22007]
    error_log("[DATE_NORMALIZE_UNRECOGNIZED] raw=" . json_encode($value));
    return null;
}

/**
 * Descreve (sem expor) o estado de uma variável de ambiente de chave de API.
 * Usado para diagnóstico SEA_AI_CONFIG_VALIDATED / CHB_AI_CONFIG_VALIDATED.
 */
function describeEnvKey($name) {
    $val = isset($_ENV[$name]) ? $_ENV[$name] : (getenv($name) ?: null);
    $nonEmpty = $val !== null && $val !== false && trim((string)$val) !== '';
    return [
        'var' => $name,
        'found' => $val !== null && $val !== false,
        'non_empty' => $nonEmpty,
        'length' => $nonEmpty ? strlen($val) : 0,
        'fingerprint' => $nonEmpty ? substr(hash('sha256', $val), 0, 8) : null,
        'sapi' => PHP_SAPI,
    ];
}

/**
 * Valida presença de uma chave de IA obrigatória. Lança exceção com código
 * padronizado (ex: SEA_AI_CONFIG_MISSING / CHB_AI_CONFIG_MISSING) se ausente.
 * Usada no início do processamento em background para falhar rápido em vez
 * de deixar a análise presa em pending/pendente.
 */
function requireAiKey($envNames, $errorCode, $logTag) {
    $envNames = is_array($envNames) ? $envNames : [$envNames];
    $found = null;
    $diagAll = [];
    foreach ($envNames as $name) {
        $diag = describeEnvKey($name);
        $diagAll[] = $diag;
        if ($diag['non_empty'] && !$found) {
            $found = $diag;
        }
    }
    error_log("[$logTag] " . json_encode(['candidates' => $diagAll, 'sapi' => PHP_SAPI, 'backendVersion' => BACKEND_API_VERSION]));
    if (!$found) {
        throw new Exception("[$errorCode] Nenhuma variável de ambiente de IA configurada dentre: " . implode(', ', $envNames) . " (SAPI: " . PHP_SAPI . ")");
    }
    return $found;
}

/**
 * Faz uma chamada mínima (sem enviar documentos) para validar conectividade,
 * autenticação e disponibilidade do modelo de IA a partir do ambiente atual
 * (web ou CLI). Usada pelas rotas de diagnóstico GET /api/sea/diagnosticos-ia
 * e GET /api/chb/diagnosticos-ia — nunca é chamada durante uma análise real.
 */
function validateAiConnectivityAnthropic($key, $model) {
    $diag = ['provider' => 'Anthropic', 'model' => $model, 'sapi' => PHP_SAPI];
    if (!$key) return array_merge($diag, ['ok' => false, 'errorCode' => 'AI_CONFIG_MISSING']);

    try {
        $res = fetch('https://api.anthropic.com/v1/messages', [
            'method' => 'POST',
            'headers' => ['Content-Type' => 'application/json', 'x-api-key' => $key, 'anthropic-version' => '2023-06-01'],
            'body' => json_encode(['model' => $model, 'max_tokens' => 8, 'messages' => [['role' => 'user', 'content' => 'ping']]]),
            'connectTimeout' => 8,
            'timeout' => 20,
            'logCtx' => ['module' => 'diag', 'provider' => 'Anthropic'],
        ]);
        return array_merge($diag, classifyAiDiagResponse($res));
    } catch (Throwable $e) {
        return array_merge($diag, ['ok' => false, 'errorCode' => classifyAiDiagException($e), 'error' => $e->getMessage()]);
    }
}

function validateAiConnectivityGemini($key, $model) {
    $diag = ['provider' => 'Gemini', 'model' => $model, 'sapi' => PHP_SAPI];
    if (!$key) return array_merge($diag, ['ok' => false, 'errorCode' => 'AI_CONFIG_MISSING']);

    try {
        $res = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
            'method' => 'POST',
            'headers' => ['Authorization' => "Bearer $key", 'Content-Type' => 'application/json'],
            'body' => json_encode(['model' => $model, 'messages' => [['role' => 'user', 'content' => 'ping']], 'max_tokens' => 8]),
            'connectTimeout' => 8,
            'timeout' => 20,
            'logCtx' => ['module' => 'diag', 'provider' => 'Gemini'],
        ]);
        return array_merge($diag, classifyAiDiagResponse($res));
    } catch (Throwable $e) {
        return array_merge($diag, ['ok' => false, 'errorCode' => classifyAiDiagException($e), 'error' => $e->getMessage()]);
    }
}

function classifyAiDiagResponse($res) {
    if ($res['ok']) return ['ok' => true, 'httpCode' => $res['status']];
    $codeMap = [401 => 'AI_UNAUTHORIZED', 403 => 'AI_FORBIDDEN', 404 => 'AI_MODEL_NOT_FOUND', 413 => 'AI_PAYLOAD_TOO_LARGE', 429 => 'AI_RATE_LIMITED', 500 => 'AI_PROVIDER_ERROR', 529 => 'AI_PROVIDER_OVERLOADED'];
    $errorCode = $codeMap[$res['status']] ?? ('AI_HTTP_' . $res['status']);
    return ['ok' => false, 'httpCode' => $res['status'], 'errorCode' => $errorCode, 'bodySnippet' => substr((string)$res['body'], 0, 200)];
}

function classifyAiDiagException($e) {
    $msg = $e->getMessage();
    if (strpos($msg, 'AI_CONNECTION_TIMEOUT') !== false) return 'AI_CONNECTION_TIMEOUT';
    if (strpos($msg, 'AI_RESPONSE_TIMEOUT') !== false) return 'AI_RESPONSE_TIMEOUT';
    return 'AI_CONNECTION_ERROR';
}

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
    // Prefixo do módulo chamador (sea/chb) — evita confundir logs entre módulos
    // que compartilham esta função. Default 'AI' para chamadas não identificadas.
    $module = isset($logCtx['module']) ? strtoupper($logCtx['module']) : 'AI';

    // Sanitiza URL para log (remove query strings com tokens)
    $urlSanitized = preg_replace('/([?&])(key|token|apikey|api_key)=[^&]*/i', '$1***', $url);
    $urlParts = parse_url($url);
    $host = $urlParts['host'] ?? 'unknown';
    $payloadSize = $body !== null ? strlen($body) : 0;

    error_log("[{$module}_CURL_REQUEST_STARTED] " . json_encode(array_merge([
        'url' => $urlSanitized,
        'host' => $host,
        'method' => $method,
        'connectTimeoutMs' => $connectTimeout * 1000,
        'timeoutMs' => $responseTimeout * 1000,
        'payloadSize' => $payloadSize,
        'backendVersion' => BACKEND_API_VERSION,
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

    if ($body !== null && $body !== false) {
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

    error_log("[{$module}_CURL_REQUEST_FINISHED] " . json_encode(array_merge([
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
        'backendVersion' => BACKEND_API_VERSION,
        'timestamp' => date('Y-m-d H:i:s'),
    ], $logCtx)));

    if ($curlError) {
        // Classifica o tipo de falha para stage mais específico
        if ($curlErrno === CURLE_OPERATION_TIMEDOUT && $connectTime < 0.01) {
            throw new Exception("[{$module}_AI_CONNECTION_TIMEOUT] cURL: " . $curlError);
        } elseif ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
            throw new Exception("[{$module}_AI_RESPONSE_TIMEOUT] cURL: " . $curlError);
        }
        throw new Exception("[{$module}_CURL_ERROR_" . $curlErrno . "] cURL: " . $curlError);
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
 * Executa múltiplas requisições HTTP em paralelo via curl_multi — usada para
 * disparar Anthropic e Gemini simultaneamente em vez de sequencialmente,
 * cortando o pior caso de latência de ~600s (300s+300s somados) para ~300s
 * (o maior dos dois, rodando ao mesmo tempo).
 *
 * $requests: array associativo [chave => ['url'=>.., 'method'=>.., 'headers'=>..,
 *            'body'=>.., 'connectTimeout'=>.., 'timeout'=>.., 'logCtx'=>..]]
 *            (mesmo formato de opções aceito por fetch()).
 *
 * Retorna array associativo [chave => ['ok'=>bool,'status'=>int,'body'=>string,
 *            'error'=>string|null,'errorCode'=>string|null,'json'=>callable]] —
 * NUNCA lança exceção por falha de uma requisição individual (diferente de
 * fetch()); quem chama decide o que fazer com cada resultado via 'ok'/'errorCode'.
 * Cada requisição respeita seu próprio connectTimeout/timeout individualmente,
 * mesmo rodando em paralelo com as demais.
 */
function fetchParallel($requests) {
    if (empty($requests)) return [];

    $mh = curl_multi_init();
    $handles = [];
    $meta = [];

    foreach ($requests as $key => $req) {
        $method = isset($req['method']) ? strtoupper($req['method']) : 'GET';
        $headers = isset($req['headers']) ? $req['headers'] : [];
        $body = isset($req['body']) ? $req['body'] : null;
        $connectTimeout = isset($req['connectTimeout']) ? (int)$req['connectTimeout'] : 10;
        $responseTimeout = isset($req['timeout']) ? (int)$req['timeout'] : 300;
        $logCtx = isset($req['logCtx']) ? $req['logCtx'] : [];
        $module = isset($logCtx['module']) ? strtoupper($logCtx['module']) : 'AI';

        $urlSanitized = preg_replace('/([?&])(key|token|apikey|api_key)=[^&]*/i', '$1***', $req['url']);
        $host = parse_url($req['url'], PHP_URL_HOST) ?: 'unknown';
        $payloadSize = $body !== null ? strlen($body) : 0;

        error_log("[{$module}_CURL_REQUEST_STARTED] " . json_encode(array_merge([
            'url' => $urlSanitized, 'host' => $host, 'method' => $method, 'parallel' => true,
            'connectTimeoutMs' => $connectTimeout * 1000, 'timeoutMs' => $responseTimeout * 1000,
            'payloadSize' => $payloadSize, 'backendVersion' => BACKEND_API_VERSION,
            'timestamp' => date('Y-m-d H:i:s'),
        ], $logCtx)));

        $ch = curl_init($req['url']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
        curl_setopt($ch, CURLOPT_TIMEOUT, $responseTimeout);

        $formattedHeaders = [];
        foreach ($headers as $k => $v) {
            $formattedHeaders[] = is_numeric($k) ? $v : "$k: $v";
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $formattedHeaders);
        if ($body !== null && $body !== false) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        curl_multi_add_handle($mh, $ch);
        $handles[$key] = $ch;
        $meta[$key] = ['module' => $module, 'urlSanitized' => $urlSanitized, 'host' => $host, 'logCtx' => $logCtx];
    }

    // Roda todas as transferências até que todas terminem (sucesso, erro ou timeout individual)
    $running = null;
    do {
        $execStatus = curl_multi_exec($mh, $running);
    } while ($execStatus === CURLM_CALL_MULTI_PERFORM);

    while ($running > 0 && $execStatus === CURLM_OK) {
        $selectResult = curl_multi_select($mh, 1.0);
        if ($selectResult === -1) {
            // Em alguns ambientes/SAPI (como Windows ou LiteSpeed), curl_multi_select retorna -1 imediatamente.
            // O usleep evita consumo excessivo de CPU de 100% que faria o processo ser suspenso/congelado pelo watchdog do servidor.
            usleep(100000); // 100ms
        }
        do {
            $execStatus = curl_multi_exec($mh, $running);
        } while ($execStatus === CURLM_CALL_MULTI_PERFORM);
    }

    // IMPORTANTE: dentro de uma pilha curl_multi, curl_error()/curl_errno() em um
    // handle isolado não são confiáveis para refletir o resultado real da
    // transferência (bug real encontrado e confirmado em teste: uma falha SSL
    // ficava com curl_error() vazio). A forma correta é ler o CURLcode de cada
    // handle via curl_multi_info_read() ANTES de remover os handles da pilha.
    $errnoByHandle = [];
    while ($info = curl_multi_info_read($mh)) {
        $errnoByHandle[(int)$info['handle']] = $info['result'];
    }

    $results = [];
    foreach ($handles as $key => $ch) {
        $response = curl_multi_getcontent($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrno = $errnoByHandle[(int)$ch] ?? curl_errno($ch);
        $curlError = $curlErrno !== CURLE_OK ? curl_strerror($curlErrno) : '';
        $totalTime = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
        $connectTime = curl_getinfo($ch, CURLINFO_CONNECT_TIME);
        $primaryIp = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
        $bytesReceived = curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD);
        $m = $meta[$key];

        error_log("[{$m['module']}_CURL_REQUEST_FINISHED] " . json_encode(array_merge([
            'url' => $m['urlSanitized'], 'host' => $m['host'], 'httpCode' => $httpCode, 'parallel' => true,
            'curlErrno' => $curlErrno, 'curlError' => $curlError ?: null, 'totalTime' => round($totalTime, 3),
            'connectTime' => round($connectTime, 3), 'primaryIp' => $primaryIp ?: null,
            'bytesReceived' => $bytesReceived, 'backendVersion' => BACKEND_API_VERSION,
            'timestamp' => date('Y-m-d H:i:s'),
        ], $m['logCtx'])));

        $errorCode = null;
        if ($curlError) {
            if ($curlErrno === CURLE_OPERATION_TIMEDOUT && $connectTime < 0.01) {
                $errorCode = "{$m['module']}_AI_CONNECTION_TIMEOUT";
            } elseif ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
                $errorCode = "{$m['module']}_AI_RESPONSE_TIMEOUT";
            } else {
                $errorCode = "{$m['module']}_CURL_ERROR_" . $curlErrno;
            }
        }

        $results[$key] = [
            'ok' => (!$curlError) && ($httpCode >= 200 && $httpCode < 300),
            'status' => $httpCode,
            'body' => $response,
            'error' => $curlError ?: null,
            'errorCode' => $errorCode,
            'json' => function() use ($response) {
                return json_decode($response, true);
            },
        ];

        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    return $results;
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
function runPHPBackground($scriptPath, $args = [], $logPrefix = 'WORKER', $customLogFile = null) {
    $dispatchStart = microtime(true);

    if (strncasecmp(PHP_OS, 'WIN', 3) === 0) {
        // Windows (apenas ambiente de desenvolvimento local — produção é Linux):
        // usa proc_open com array de argumentos (evita problemas de escaping de
        // shell em caminhos com espaços/parênteses) e redireciona saída a um log.
        $phpBin = 'C:\\xampp\\php\\php.exe';
        if (!file_exists($phpBin)) $phpBin = 'php';
        $winLogFile = $customLogFile ? $customLogFile : (sys_get_temp_dir() . '\\dachser_worker_win_' . md5(implode('|', $args) . microtime(true)) . '.log');
        $cmdArray = array_merge([$phpBin, $scriptPath], $args);

        error_log("[{$logPrefix}_WORKER_DISPATCH_STARTED] " . json_encode(['method' => 'windows', 'phpBin' => $phpBin, 'scriptPath' => $scriptPath, 'cwd' => getcwd(), 'cmdArray' => $cmdArray, 'logFile' => $winLogFile]));

        $descriptorSpec = [0 => ['pipe', 'r'], 1 => ['file', $winLogFile, 'w'], 2 => ['file', $winLogFile, 'a']];
        $process = proc_open($cmdArray, $descriptorSpec, $pipes, null, null, ['bypass_shell' => true]);

        if (is_resource($process)) {
            fclose($pipes[0]);
            $status = proc_get_status($process);
            error_log("[{$logPrefix}_WORKER_DISPATCH_SUCCEEDED] " . json_encode(['method' => 'windows', 'pid' => $status['pid'] ?? null, 'durationMs' => round((microtime(true) - $dispatchStart) * 1000), 'logFile' => $winLogFile]));
            return ['success' => true, 'method' => 'windows', 'pid' => $status['pid'] ?? null, 'logFile' => $winLogFile];
        }

        error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode(['method' => 'windows', 'error' => 'proc_open falhou']));
        return ['success' => false, 'method' => 'windows', 'error' => 'proc_open falhou'];
    }

    // ── ESTRATÉGIA 1: Loopback HTTP (preferida neste host — ver nota abaixo) ──
    // Timeout curto de 3s: envia o job e abandona a espera da resposta, mas o
    // PHP do lado do /api/background-worker continua executando a análise DEPOIS
    // de responder (fastcgi_finish_request ou fallback Connection: close).
    //
    // Por que loopback primeiro e não CLI: em hosts LiteSpeed/LSAPI (este é um),
    // um processo filho criado via exec()+"&" a partir de uma requisição PHP
    // costuma ser morto pelo servidor assim que essa requisição termina, porque
    // ele herda o grupo de processos/sessão do worker LSAPI — o job "inicia com
    // sucesso" e morre segundos depois, antes de sequer atualizar o status no
    // banco. Já o loopback não cria processo-filho algum: é a MESMA requisição
    // HTTP continuando a rodar após responder ao cliente, então não sofre desse
    // problema. Evidência real: em produção, os runs 1104-1107 (que usavam
    // loopback como estratégia principal) chegaram a processar de verdade;
    // depois que o CLI passou a ser tentado primeiro, 100% dos runs recentes
    // (1118, 1120-1124) morreram em SEA_WORKER_NOT_STARTED. NUNCA use este
    // loopback como chamada bloqueante aguardando o resultado completo — ele só
    // deve disparar e devolver o controle em até ~3s.
    $loopbackStart = microtime(true);
    try {
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['SERVER_PORT'] == 443)
            || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $protocol = $isHttps ? 'https://' : 'http://';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $url = $protocol . $host . '/api/background-worker';

        error_log("[{$logPrefix}_WORKER_DISPATCH_STARTED] " . json_encode(['method' => 'loopback', 'url' => $url, 'backendVersion' => BACKEND_API_VERSION]));

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
        $durationMs = round((microtime(true) - $loopbackStart) * 1000);

        if ($httpCode >= 200 && $httpCode < 300) {
            error_log("[{$logPrefix}_WORKER_DISPATCH_SUCCEEDED] " . json_encode(['method' => 'loopback', 'httpCode' => $httpCode, 'durationMs' => $durationMs]));
            return ['success' => true, 'method' => 'loopback', 'httpCode' => $httpCode];
        }
        error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode(['method' => 'loopback', 'httpCode' => $httpCode, 'error' => $loopErr, 'durationMs' => $durationMs]));
    } catch (Throwable $e) {
        error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode(['method' => 'loopback', 'error' => $e->getMessage()]));
    }

    // ── ESTRATÉGIA 2: PHP CLI via exec (fallback) ──────────────────────────────
    $disabled = ini_get('disable_functions');
    $execEnabled = function_exists('exec') && !in_array('exec', array_map('trim', explode(',', $disabled)));

    if ($execEnabled) {
        // Determina binário PHP CLI adequado — nunca usa lsphp (SAPI web), apenas CLI real
        $phpBin = 'php';
        $candidates = [];

        if (defined('PHP_BINARY') && PHP_BINARY) {
            $binaryName = basename(PHP_BINARY);
            if (in_array($binaryName, ['php', 'php-cli', 'php.exe'])) {
                $candidates[] = PHP_BINARY;
            }
        }

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
        $logFile = $customLogFile ? $customLogFile : (sys_get_temp_dir() . '/dachser_worker_' . md5($argsStr . microtime(true)) . '.log');

        // IMPORTANTE: manter isto como UM único comando terminado em UM único `&`.
        // Um commit anterior desta mesma sessão (54e2dfe3) já constatou que
        // encadear uma segunda instrução depois do `&` (ex: `... & echo $! > pid`)
        // é bloqueado/derruba o processo sob o filtro de shell restrito da
        // Hostinger. `nohup` como prefixo do MESMO comando é seguro (não é uma
        // segunda instrução); um `echo` ou `;` depois do `&` não é.
        $cmd = 'nohup ' . escapeshellarg($phpBin) . ' ' . escapeshellarg($scriptPath) . ' ' . $argsStr
             . ' > ' . escapeshellarg($logFile) . ' 2>&1 &';

        error_log("[{$logPrefix}_WORKER_DISPATCH_STARTED] " . json_encode([
            'method' => 'cli', 'phpBin' => $phpBin, 'scriptPath' => $scriptPath,
            'cwd' => getcwd(), 'cmd' => $cmd, 'backendVersion' => BACKEND_API_VERSION,
        ]));

        exec($cmd, $output, $exitCode);

        // Sem chaining não há como capturar o PID real aqui — usamos o mesmo sinal
        // (mais fraco) já validado como seguro: existência do arquivo de log.
        usleep(250000); // 250ms
        $started = file_exists($logFile);
        $durationMs = round((microtime(true) - $dispatchStart) * 1000);

        if ($exitCode === 0 || $started) {
            error_log("[{$logPrefix}_WORKER_DISPATCH_SUCCEEDED] " . json_encode([
                'method' => 'cli', 'phpBin' => $phpBin, 'started' => $started,
                'exitCode' => $exitCode, 'durationMs' => $durationMs, 'logFile' => $logFile,
            ]));
            return ['success' => true, 'method' => 'cli', 'phpBin' => $phpBin, 'logFile' => $logFile];
        }

        error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode([
            'method' => 'cli', 'phpBin' => $phpBin, 'started' => $started,
            'exitCode' => $exitCode, 'durationMs' => $durationMs, 'stdout' => implode("\n", (array)$output),
        ]));
    } else {
        error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode(['method' => 'cli', 'error' => 'exec() desabilitado', 'disable_functions' => $disabled]));
    }

    // ── FALHA TOTAL: nenhum método funcionou ─────────────────────────────────
    error_log("[{$logPrefix}_WORKER_DISPATCH_FAILED] " . json_encode(['method' => 'none', 'scriptPath' => $scriptPath, 'error' => 'loopback e exec falharam']));
    return ['success' => false, 'method' => 'none', 'error' => 'loopback e exec falharam'];
}



