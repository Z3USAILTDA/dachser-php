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

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120); // timeout padrão de 120s para IAs

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
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception("cURL Error: " . $error);
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
 */
function runPHPBackground($scriptPath, $args = []) {
    $phpBin = 'php'; // Fallback
    if (file_exists('C:\\xampp\\php\\php.exe')) {
        $phpBin = 'C:\\xampp\\php\\php.exe';
    }
    
    $escapedArgs = array_map('escapeshellarg', $args);
    $argsStr = implode(' ', $escapedArgs);
    
    if (strncasecmp(PHP_OS, 'WIN', 3) === 0) {
        // Windows background
        $cmd = "start /B \"\" " . escapeshellarg($phpBin) . " " . escapeshellarg($scriptPath) . " " . $argsStr . " > NUL 2>&1";
        pclose(popen($cmd, "r"));
    } else {
        // Linux/Unix background
        $cmd = escapeshellarg($phpBin) . " " . escapeshellarg($scriptPath) . " " . $argsStr . " > /dev/null 2>&1 &";
        exec($cmd);
    }
}



