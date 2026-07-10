<?php
// api/routes/sea.php
// Rotas do módulo SEA: /api/sea/*

global $router;

// Constants
define('SEA_ACTIVE_WHERE', "
  m.active = 1
  AND m.tipo_processo = 'SEA EXPORT'
  AND m.mawb IS NOT NULL
  AND TRIM(m.mawb) != ''
  AND (
    m.mawb LIKE 'HLC%'  OR m.mawb LIKE 'MSC%'  OR m.mawb LIKE 'MEDU%'
    OR m.mawb LIKE 'ONEY%' OR m.mawb LIKE 'ONEU%' OR m.mawb LIKE 'EBKG%'
    OR m.mawb LIKE 'NYKU%' OR m.mawb LIKE 'MOLU%' OR m.mawb LIKE 'KKFU%'
    OR m.mawb LIKE 'MOAU%' OR m.mawb LIKE 'KKLU%'
  )
  AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
");

$seaShippingLines = [
  ['code' => 'HAPAG', 'name' => 'Hapag-Lloyd', 'prefixes' => ['HLC']],
  ['code' => 'MSC', 'name' => 'MSC', 'prefixes' => ['MSC', 'MEDU']],
  ['code' => 'ONE', 'name' => 'ONE', 'prefixes' => ['ONEY', 'ONEU', 'EBKG', 'NYKU', 'MOLU', 'KKFU', 'MOAU', 'KKLU']],
];

// Helper to query sea db
function seaQuery($sql, $params = []) {
    return queryWithRetry(getSeaPDO(), $sql, $params);
}

// Helper query CCT / fin
function cctFinQuery($sql, $params = []) {
    return queryWithRetry(getFinPDO(), $sql, $params);
}

// ── CCT COMPUTATION ──────────────────────────────────────────────────────────

function parsePipeDateToISO($s) {
    $s = trim($s);
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/', $s, $m)) {
        $hh = isset($m[4]) ? $m[4] : '00';
        $mi = isset($m[5]) ? $m[5] : '00';
        $ss = isset($m[6]) ? $m[6] : '00';
        return "{$m[3]}-{$m[2]}-{$m[1]} {$hh}:{$mi}:{$ss}";
    }
    return null;
}

function getDeliveredAt($raw) {
    if (!$raw) return null;
    $arr = [];
    if (is_array($raw)) {
        $arr = $raw;
    } elseif (is_string($raw)) {
        $trimmed = trim($raw);
        if (strpos($trimmed, '[') === 0) {
            try { $arr = json_decode($trimmed, true) ?: []; } catch (Exception $e) {}
        } elseif (strpos($trimmed, '|') !== false) {
            $chunks = array_filter(explode('||', $trimmed));
            foreach ($chunks as $chunk) {
                $parts = array_map('trim', explode('|', $chunk));
                $d = isset($parts[0]) ? $parts[0] : '';
                $dt = isset($parts[1]) ? $parts[1] : null;
                $arr[] = [
                    'descricao' => $d,
                    'data_hora_evento' => $dt ? parsePipeDateToISO($dt) : null
                ];
            }
        }
    }
    
    if (!is_array($arr) || count($arr) === 0) return null;
    
    $norm = [];
    foreach ($arr as $e) {
        if ($e && is_array($e)) {
            $desc = strtolower(isset($e['descricao']) ? $e['descricao'] : (isset($e['evento']) ? $e['evento'] : (isset($e['codigo_evento']) ? $e['codigo_evento'] : '')));
            $dt = isset($e['data_hora_evento']) ? $e['data_hora_evento'] : (isset($e['data_hora']) ? $e['data_hora'] : (isset($e['dataHora']) ? $e['dataHora'] : (isset($e['data']) ? $e['data'] : null)));
            
            $ts = null;
            if ($dt) {
                $time = strtotime(str_replace(' ', 'T', (string)$dt));
                if ($time !== false) $ts = $time * 1000;
            }
            $norm[] = ['desc' => $desc, 'dt' => $dt, 'ts' => $ts];
        }
    }
    
    // Ordena
    usort($norm, function($a, $b) {
        if ($a['ts'] === null && $b['ts'] === null) return 0;
        if ($a['ts'] === null) return 1;
        if ($b['ts'] === null) return -1;
        return $a['ts'] - $b['ts'];
    });
    
    $last = count($norm) > 0 ? end($norm) : null;
    if (!$last || strpos($last['desc'], 'entreg') === false || !$last['dt']) return null;
    
    $time = strtotime(str_replace(' ', 'T', (string)$last['dt']));
    if ($time === false) return null;
    
    return date('Y-m-d H:i:s', $time);
}

function computeCCTData() {
    $cached = getCache('cctResultCache', 60);
    if ($cached) return $cached;

    $database = 'dados_dachser';
    $cachedRows = cctFinQuery("
      SELECT
        c.hawb,
        c.awb,
        c.eventos,
        c.teve_bloqueio,
        c.motivos_bloqueio,
        c.data_decolagem,
        c.peso_recebido_declarado,
        c.peso_constatado,
        c.volume_recebido_declarado,
        c.volume_constatado,
        c.situacao_portal_atual,
        c.data_ultima_atualizacao_atual,
        c.consulted_at_ultima_consulta,
        c.refreshed_at,
        COALESCE(NULLIF(TRIM(m.cliente), ''), NULLIF(TRIM(a.consignee_nome), '')) AS cliente,
        COALESCE(m.mawb, a.awb_number, c.awb) AS master,
        f.origin AS aeroporto_origem,
        f.destination AS aeroporto_destino,
        COALESCE(m.nome_analista, a.clerk) AS nome_analista,
        COALESCE(m.email_analista, a.clerk_email) AS email_analista,
        m.tratamento,
        NULL AS tratamentos_especiais,
        COALESCE(m.data_insert, a.created_at) AS created_at
      FROM {$database}.t_cct_dashboard_cache c
      LEFT JOIN (
        SELECT t.*
        FROM {$database}.t_master_dados t
        INNER JOIN (
          SELECT TRIM(hawb) COLLATE utf8mb4_unicode_ci AS h, MAX(data_insert) AS max_di
          FROM {$database}.t_master_dados
          WHERE hawb IS NOT NULL AND TRIM(hawb) <> ''
          GROUP BY TRIM(hawb) COLLATE utf8mb4_unicode_ci
        ) latest
          ON TRIM(t.hawb) COLLATE utf8mb4_unicode_ci = latest.h
         AND t.data_insert = latest.max_di
      ) m
        ON TRIM(m.hawb) COLLATE utf8mb4_unicode_ci = TRIM(c.hawb) COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT x.*
        FROM (
          SELECT
            TRIM(t.hawb_number) AS hawb_key,
            TRIM(t.consignee_nome) AS consignee_nome,
            TRIM(t.awb_number) AS awb_number,
            t.clerk,
            t.clerk_email,
            t.created_at,
            ROW_NUMBER() OVER (
              PARTITION BY TRIM(t.hawb_number)
              ORDER BY t.created_at DESC, t.data_emissao DESC
            ) AS rn
          FROM {$database}.t_dados_aereo t
          WHERE t.hawb_number IS NOT NULL AND TRIM(t.hawb_number) <> ''
        ) x
        WHERE x.rn = 1
      ) a
        ON a.hawb_key COLLATE utf8mb4_unicode_ci = TRIM(c.hawb) COLLATE utf8mb4_unicode_ci
      LEFT JOIN {$database}.t_fato_aereo f
        ON TRIM(f.awb) COLLATE utf8mb4_unicode_ci = TRIM(COALESCE(c.awb, m.mawb, a.awb_number)) COLLATE utf8mb4_unicode_ci
      WHERE c.teve_bloqueio IS NULL
         OR TRIM(c.teve_bloqueio) COLLATE utf8mb4_unicode_ci <> 'Sem retorno CCT' COLLATE utf8mb4_unicode_ci
      ORDER BY c.hawb
    ");

    try {
        cctFinQuery("
            CREATE TABLE IF NOT EXISTS dados_dachser.t_cct_hidden_hawbs (
              id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              hawb VARCHAR(64) NOT NULL,
              reason VARCHAR(32) NOT NULL DEFAULT 'ENTREGUE',
              delivered_at DATETIME NOT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uq_cct_hidden_hawbs_hawb (hawb),
              KEY idx_cct_hidden_hawbs_delivered_at (delivered_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Exception $e) {}

    $newlyDelivered = [];
    foreach (($cachedRows ?: []) as $row) {
        $hawb = trim($row['hawb'] ?: '');
        if (!$hawb) continue;
        $deliveredAt = getDeliveredAt($row['eventos']);
        if ($deliveredAt) {
            $newlyDelivered[] = ['hawb' => $hawb, 'deliveredAt' => $deliveredAt];
        }
    }
    
    if (count($newlyDelivered) > 0) {
        try {
            $pdo = getFinPDO();
            $stmt = $pdo->prepare("INSERT IGNORE INTO dados_dachser.t_cct_hidden_hawbs (hawb, reason, delivered_at) VALUES (?, 'ENTREGUE', ?)");
            foreach ($newlyDelivered as $x) {
                $stmt->execute([$x['hawb'], $x['deliveredAt']]);
            }
        } catch (Exception $e) {}
    }

    $hiddenRows = [];
    try {
        $hiddenRows = cctFinQuery("SELECT hawb, delivered_at FROM dados_dachser.t_cct_hidden_hawbs WHERE delivered_at < DATE_SUB(NOW(), INTERVAL 5 DAY)");
    } catch (Exception $e) {}
    
    $normalizeCctHawb = function($value) {
        return strtoupper(trim(preg_replace('/\s+/', '', (string)$value)));
    };
    
    $expiredHidden = [];
    foreach (($hiddenRows ?: []) as $r) {
        $h = $normalizeCctHawb($r['hawb']);
        if ($h) $expiredHidden[$h] = true;
    }

    $visibleRows = [];
    foreach (($cachedRows ?: []) as $r) {
        $h = $normalizeCctHawb($r['hawb']);
        if (!isset($expiredHidden[$h])) {
            $visibleRows[] = $r;
        }
    }

    $result = ['success' => true, 'data' => $visibleRows];
    setCache('cctResultCache', $result, 60);
    return $result;
}

// ── SEA PROMPTS & AI HELPERS ──────────────────────────────────────────────────

function seaPromptForAnalysisType($analysisType) {
  if ($analysisType === 'manifest_hbl') {
    return 'You are a senior ocean freight document auditor for DACHSER.
Compare the provided Manifest (Excel/spreadsheet) against the Draft HBL document(s) (PDF).
Produce a structured operational correction report in English, with:
DRAFT HBL, CONTAINER VERIFICATION, TOTAL WEIGHT, TOTAL CBM, TOTAL VOLUMES, SEAL NUMBER, CONSIGNEE CNPJ, NCM CODES, INVOICE REFERENCES, EXPORTER/SHIPPER ANALYSIS.
At the end, always append:
```json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
```';
  }
  if ($analysisType === 'hbl_mbl') {
    return 'You are a senior ocean freight document auditor for DACHSER.
Compare HBL vs MBL. Identify discrepancies.
At the end, always append the hbl_shipping_data JSON.';
  }
  if ($analysisType === 'invoices_hbl') {
    return 'You are a senior ocean freight document auditor for DACHSER.
Compare Invoices vs HBL. Identify discrepancies.
At the end, always append the hbl_shipping_data JSON.';
  }
  return 'You are a senior ocean freight document auditor for DACHSER.
At the end, always append the hbl_shipping_data JSON.';
}

function seaBuildLlmContentPHP($files) {
    $content = [];
    foreach ($files as $file) {
        $name = isset($file['name']) ? $file['name'] : (isset($file['file_name']) ? $file['file_name'] : 'arquivo');
        $mime = isset($file['mimeType']) ? $file['mimeType'] : (isset($file['type']) ? $file['type'] : (isset($file['file_type']) ? $file['file_type'] : 'application/octet-stream'));
        
        $base64 = isset($file['content']) ? $file['content'] : (isset($file['fileBase64']) ? $file['fileBase64'] : null);
        
        if (!$base64 && isset($file['url']) && $file['url']) {
            $res = fetch($file['url']);
            if ($res['ok']) {
                $base64 = base64_encode($res['body']);
            }
        }
        
        if (!$base64) {
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name] - sem conteúdo disponível"];
            continue;
        }

        $isPdf = $mime === 'application/pdf' || preg_match('/\.pdf$/i', $name);
        $isImage = strpos($mime, 'image/') === 0;
        $isExcel = preg_match('/spreadsheet|excel/i', $mime) || preg_match('/\.(xlsx|xls)$/i', $name);

        if ($isPdf) {
            $content[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $base64]];
            $content[] = ['type' => 'text', 'text' => "[Arquivo PDF: $name]"];
        } elseif ($isImage) {
            $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $base64]];
            $content[] = ['type' => 'text', 'text' => "[Imagem: $name]"];
        } elseif ($isExcel) {
            try {
                $rows = parseXlsxSimple($base64);
                $text = "[Arquivo Excel: $name]\n";
                $count = 0;
                foreach ($rows as $row) {
                    $line = implode(' | ', array_filter(array_map('trim', $row)));
                    if ($line) {
                        $text .= "$line\n";
                        $count++;
                    }
                    if ($count > 300) break;
                }
                $content[] = ['type' => 'text', 'text' => $text];
            } catch (Exception $e) {
                $content[] = ['type' => 'text', 'text' => "[Arquivo Excel: $name] - erro ao extrair planilha: " . $e->getMessage()];
            }
        } else {
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name]\n" . base64_decode($base64)];
        }
    }
    return $content;
}

function seaAnalyzeWithAnthropicPHP($analysisType, $files, $context = []) {
  $key = isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null;
  if (!$key) throw new Exception('ANTHROPIC_API_KEY não configurada');
  
  $content = seaBuildLlmContentPHP($files);
  $content[] = [
    'type' => 'text',
    'text' => seaPromptForAnalysisType($analysisType) . "\n\nContext: " . json_encode($context)
  ];

  $res = fetch('https://api.anthropic.com/v1/messages', [
    'method' => 'POST',
    'headers' => [
      'x-api-key' => $key,
      'anthropic-version' => '2023-06-01',
      'Content-Type' => 'application/json',
    ],
    'body' => json_encode([
      'model' => isset($_ENV['SEA_ANTHROPIC_MODEL']) ? $_ENV['SEA_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
      'max_tokens' => 32000,
      'temperature' => 0,
      'messages' => [['role' => 'user', 'content' => $content]],
    ])
  ]);
  
  if (!$res['ok']) {
      throw new Exception("Anthropic SEA error {$res['status']}: " . substr($res['body'], 0, 300));
  }
  $data = $res['json']();
  
  $text = '';
  if (isset($data['content'])) {
      foreach ($data['content'] as $c) {
          if ($c['type'] === 'text') { $text = $c['text']; break; }
      }
  }
  return $text;
}

function seaAnalyzeWithGeminiPHP($analysisType, $files, $context = []) {
  $key = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
  if (!$key) throw new Exception('GEMINI_API_KEY não configurada');
  
  $parts = [];
  foreach ($files as $file) {
    $name = isset($file['name']) ? $file['name'] : (isset($file['file_name']) ? $file['file_name'] : 'arquivo');
    $mime = isset($file['mimeType']) ? $file['mimeType'] : (isset($file['type']) ? $file['type'] : (isset($file['file_type']) ? $file['file_type'] : 'application/octet-stream'));
    $base64 = isset($file['content']) ? $file['content'] : (isset($file['fileBase64']) ? $file['fileBase64'] : null);
    
    if (!$base64 && isset($file['url']) && $file['url']) {
      $res = fetch($file['url']);
      if ($res['ok']) $base64 = base64_encode($res['body']);
    }
    
    $isPdfOrImage = $mime === 'application/pdf' || strpos($mime, 'image/') === 0 || preg_match('/\.pdf$/i', $name);
    
    if ($base64 && $isPdfOrImage) {
      $parts[] = ['type' => 'image_url', 'image_url' => ['url' => "data:" . ($mime ?: 'application/pdf') . ";base64,$base64"]];
    } elseif ($base64) {
      $parts[] = ['type' => 'text', 'text' => "[Arquivo: $name]\n" . base64_decode($base64)];
    }
    $parts[] = ['type' => 'text', 'text' => "[Arquivo: $name]"];
  }
  
  $parts[] = ['type' => 'text', 'text' => seaPromptForAnalysisType($analysisType) . "\n\nContext: " . json_encode($context)];

  $res = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
    'method' => 'POST',
    'headers' => [
      'Authorization' => "Bearer $key",
      'Content-Type' => 'application/json',
    ],
    'body' => json_encode([
      'model' => isset($_ENV['SEA_GEMINI_MODEL']) ? $_ENV['SEA_GEMINI_MODEL'] : 'gemini-2.5-pro',
      'messages' => [['role' => 'user', 'content' => $parts]],
      'max_tokens' => 32000,
      'temperature' => 0,
    ])
  ]);
  
  if (!$res['ok']) {
    throw new Exception("Gemini SEA error {$res['status']}: " . substr($res['body'], 0, 300));
  }
  $data = $res['json']();
  return isset($data['choices'][0]['message']['content']) ? $data['choices'][0]['message']['content'] : '';
}

function seaArbitrateWithOpenAIPHP($analysisType, $claudeText, $geminiText) {
  $key = isset($_ENV['OPENAI_API_KEY']) ? $_ENV['OPENAI_API_KEY'] : (isset($_ENV['CHB_OPENAI_API_KEY']) ? $_ENV['CHB_OPENAI_API_KEY'] : null);
  if (!$key) return $claudeText ?: $geminiText;

  $manifestHblInstructions = $analysisType === 'manifest_hbl' ? "
CRITICAL FORMAT RULE for manifest_hbl:
The output MUST start with \"Hello, team.\" and follow the exact HBL correction structure. Do not reformat.
" : '';

  $prompt = "You are a senior logistics document auditor. Produce one final report from the two model analyses.
$manifestHblInstructions
Analysis type: $analysisType
ANALYSIS A (Claude): $claudeText
ANALYSIS B (Gemini): $geminiText";

  $res = fetch('https://api.openai.com/v1/chat/completions', [
    'method' => 'POST',
    'headers' => [
      'Authorization' => "Bearer $key",
      'Content-Type' => 'application/json',
    ],
    'body' => json_encode([
      'model' => isset($_ENV['SEA_OPENAI_MODEL']) ? $_ENV['SEA_OPENAI_MODEL'] : 'gpt-4o',
      'messages' => [['role' => 'user', 'content' => $prompt]],
      'max_completion_tokens' => 16000,
    ])
  ]);
  
  if (!$res['ok']) return $claudeText ?: $geminiText;
  $data = $res['json']();
  return isset($data['choices'][0]['message']['content']) ? $data['choices'][0]['message']['content'] : ($claudeText ?: $geminiText);
}

function extractSeaShippingData($resultText = '') {
  $empty = ['container' => '', 'consignee' => '', 'vessel' => '', 'voyage' => '', 'origem' => '', 'destino' => '', 'mbl_number' => '', 'carrier' => '', 'ata_date' => ''];
  if (preg_match_all('/```json\s*(\{[\s\S]*?\})\s*```/i', $resultText, $blocks, PREG_SET_ORDER)) {
      foreach ($blocks as $block) {
          try {
              $parsed = json_decode($block[1], true);
              if (isset($parsed['hbl_shipping_data'])) return array_merge($empty, $parsed['hbl_shipping_data']);
          } catch (Exception $e) {}
      }
  }
  if (preg_match('/\{"hbl_shipping_data"[\s\S]*?\}\}/', $resultText, $inline)) {
      try {
          $parsed = json_decode($inline[0], true);
          if (isset($parsed['hbl_shipping_data'])) return array_merge($empty, $parsed['hbl_shipping_data']);
      } catch (Exception $e) {}
  }
  return null;
}

// Background analysis process execution
function processSeaAnalysisRunPHP($runId, $itemId, $analysisType, $files, $context) {
  try {
    seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'analisando' WHERE id = ?", [$runId]);
    if ($itemId) seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'analisando' WHERE id = ?", [$itemId]);

    error_log("[AI_REQUEST_STARTED] [RunID: $runId] Calling AI models (Anthropic/Gemini) for Sea Analysis");

    $claudeText = '';
    try {
        $claudeText = seaAnalyzeWithAnthropicPHP($analysisType, $files, $context);
    } catch (Exception $ex) {
        error_log('[worker claude] ' . $ex->getMessage());
    }

    $geminiText = '';
    try {
        $geminiText = seaAnalyzeWithGeminiPHP($analysisType, $files, $context);
    } catch (Exception $ex) {
        error_log('[worker gemini] ' . $ex->getMessage());
    }

    if (!$claudeText && !$geminiText) {
      throw new Exception("Falha nas duas análises de IA.");
    }

    error_log("[AI_RESPONSE_RECEIVED] [RunID: $runId] AI response received. Proceeding to arbitration with OpenAI");

    $finalText    = seaArbitrateWithOpenAIPHP($analysisType, $claudeText, $geminiText);
    
    error_log("[RESULT_PARSED] [RunID: $runId] OpenAI arbitration response received. Extracting shipping data...");
    $shippingData = extractSeaShippingData($finalText);
    
    $jsonResult   = [
      'model' => isset($_ENV['OPENAI_API_KEY']) ? 'multi-model-direct-openai-arbitration' : 'multi-model-direct',
      'result_claude' => $claudeText,
      'result_gemini' => $geminiText,
      'hblShippingData' => $shippingData,
    ];

    error_log("[RESULT_SAVED] [RunID: $runId] Saving analysis results to database");
    seaQuery(
      "UPDATE dados_dachser.t_sea_runs SET status = 'realizado', result_text = ?, result_json = ? WHERE id = ?",
      [$finalText, json_encode($jsonResult), $runId]
    );

    if ($itemId) {
      $updateFields = [];
      $updateValues = [];
      if (isset($shippingData['consignee']))  { $updateFields[] = 'consignee = ?';  $updateValues[] = $shippingData['consignee']; }
      if (isset($shippingData['mbl_number'])) { $updateFields[] = 'mbl_number = ?'; $updateValues[] = $shippingData['mbl_number']; }
      if (isset($shippingData['carrier']))    { $updateFields[] = 'carrier = ?';    $updateValues[] = $shippingData['carrier']; }
      if (isset($shippingData['ata_date']))   { $updateFields[] = 'ata_date = ?';   $updateValues[] = $shippingData['ata_date']; }
      
      $updateValues[] = $itemId;
      
      $sql = "UPDATE dados_dachser.t_sea_items SET " . (count($updateFields) > 0 ? implode(', ', $updateFields) . ", " : '') . "status = 'analisado' WHERE id = ?";
      seaQuery($sql, $updateValues);
    }
    error_log("[ANALYSIS_COMPLETED] [RunID: $runId] Sea analysis run successfully completed");
  } catch (Exception $err) {
    error_log("[ANALYSIS_FAILED] [RunID: $runId] Sea analysis failed: " . $err->getMessage());
    seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ? WHERE id = ?", [$err->getMessage(), $runId]);
    if ($itemId) seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'erro' WHERE id = ?", [$itemId]);
  }
}

// ── SEA ROUTE HANDLERS ───────────────────────────────────────────────────────

// GET /api/sea/draft-exportacao/stats
$router->get('sea/draft-exportacao/stats', function($params) use ($seaShippingLines) {
    try {
        $totalRows = seaQuery("SELECT COUNT(*) AS total FROM dados_dachser.t_master_dados m WHERE " . SEA_ACTIVE_WHERE);
        $lastRows = seaQuery("SELECT MAX(data_insert) AS last_update FROM dados_dachser.t_master_dados WHERE tipo_processo = 'SEA EXPORT'");

        $shippingLineBreakdown = [];
        foreach ($seaShippingLines as $line) {
            $likes = [];
            foreach ($line['prefixes'] as $p) { $likes[] = "m.mawb LIKE '{$p}%'"; }
            $likeClauses = implode(' OR ', $likes);
            
            $rows = seaQuery("
              SELECT COUNT(*) AS count FROM dados_dachser.t_master_dados m
              WHERE m.active = 1 AND m.tipo_processo = 'SEA EXPORT'
                AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
                AND ($likeClauses)
                AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
            ");
            $shippingLineBreakdown[] = ['code' => $line['code'], 'name' => $line['name'], 'count' => (int)($rows[0]['count'] ?? 0)];
        }

        sendJson([
            'success' => true,
            'stats' => [
                'lastUpdate' => isset($lastRows[0]['last_update']) ? $lastRows[0]['last_update'] : null,
                'totalRecords' => isset($totalRows[0]['total']) ? (int)$totalRows[0]['total'] : 0,
                'shippingLineBreakdown' => $shippingLineBreakdown
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/draft-exportacao
$router->get('sea/draft-exportacao', function($params) {
    try {
        $mblRows = seaQuery("
          SELECT TRIM(m.mawb) AS mbl_id, m.tipo_processo, m.etd, m.cliente AS shipper
          FROM dados_dachser.t_master_dados m
          WHERE " . SEA_ACTIVE_WHERE . "
          ORDER BY m.etd DESC, m.mawb
        ");
        
        $trackingRows = seaQuery("
          SELECT id, mbl_id, booking, origem, destino, navio, voyage,
                 etd, eta, tipo_processo, status_armador,
                 transaction_id, hash_hapag_lloyd, api_endpoint,
                 data_hora_servidor, data_hora_consulta, created_at
          FROM dados_dachser.t_consulta_armador
        ");

        $trackingStatus = [];
        foreach (($trackingRows ?: []) as $row) {
            $key = trim($row['mbl_id'] ?: '');
            if (!$key) continue;
            
            $existing = isset($trackingStatus[$key]) ? $trackingStatus[$key] : null;
            $rowDate = strtotime($row['data_hora_consulta'] ?: ($row['created_at'] ?: '1970-01-01'));
            $exDate = $existing ? strtotime($existing['data_hora_consulta'] ?: ($existing['created_at'] ?: '1970-01-01')) : -1;
            
            if (!$existing || $rowDate >= $exDate) {
                $trackingStatus[$key] = $row;
            }
        }

        sendJson(['success' => true, 'mbls' => $mblRows ?: [], 'trackingStatus' => $trackingStatus]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/regras-notificacao
$router->get('sea/regras-notificacao', function($params) {
    try {
        $rows = seaQuery("SELECT * FROM dados_dachser.t_sea_regras_notificacao ORDER BY is_default DESC, created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/regras-notificacao
$router->post('sea/regras-notificacao', function($params) {
    try {
        $body = getRequestBody();
        $is_default = isset($body['is_default']) ? $body['is_default'] : null;

        if ($is_default) {
            seaQuery("UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE");
        }
        
        seaQuery("
            INSERT INTO dados_dachser.t_sea_regras_notificacao
              (cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino,
               eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ", [
            isset($body['cliente_nome']) ? $body['cliente_nome'] : null,
            isset($body['cnpj_consignatario']) ? $body['cnpj_consignatario'] : null,
            isset($body['tipo_processo']) ? $body['tipo_processo'] : 'BOTH',
            isset($body['portos_origem']) ? $body['portos_origem'] : '[]',
            isset($body['portos_destino']) ? $body['portos_destino'] : '[]',
            isset($body['eventos_disparo']) ? $body['eventos_disparo'] : '[]',
            isset($body['frequencia']) ? $body['frequencia'] : 'IMEDIATO',
            isset($body['canais']) ? $body['canais'] : '[]',
            isset($body['emails_import']) ? $body['emails_import'] : null,
            isset($body['emails_export']) ? $body['emails_export'] : null,
            isset($body['template_id']) ? $body['template_id'] : 'default',
            isset($body['ativo']) && $body['ativo'] === false ? 0 : 1,
            $is_default ? 1 : 0
        ]);

        sendJson(['success' => true, 'message' => 'Regra criada com sucesso']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/sea/regras-notificacao/:id
$router->patch('sea/regras-notificacao/:id', function($params) {
    try {
        $id = $params['id'];
        $body = getRequestBody();
        $is_default = isset($body['is_default']) ? $body['is_default'] : null;

        if ($is_default === true) {
            seaQuery("UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE AND id != ?", [$id]);
        }

        $fields = [];
        $values = [];
        
        if (isset($body['cliente_nome'])) { $fields[] = 'cliente_nome = ?'; $values[] = $body['cliente_nome']; }
        if (isset($body['cnpj_consignatario'])) { $fields[] = 'cnpj_consignatario = ?'; $values[] = $body['cnpj_consignatario']; }
        if (isset($body['tipo_processo'])) { $fields[] = 'tipo_processo = ?'; $values[] = $body['tipo_processo']; }
        if (isset($body['portos_origem'])) { $fields[] = 'portos_origem = ?'; $values[] = $body['portos_origem']; }
        if (isset($body['portos_destino'])) { $fields[] = 'portos_destino = ?'; $values[] = $body['portos_destino']; }
        if (isset($body['eventos_disparo'])) { $fields[] = 'eventos_disparo = ?'; $values[] = $body['eventos_disparo']; }
        if (isset($body['frequencia'])) { $fields[] = 'frequencia = ?'; $values[] = $body['frequencia']; }
        if (isset($body['canais'])) { $fields[] = 'canais = ?'; $values[] = $body['canais']; }
        if (isset($body['emails_import'])) { $fields[] = 'emails_import = ?'; $values[] = $body['emails_import']; }
        if (isset($body['emails_export'])) { $fields[] = 'emails_export = ?'; $values[] = $body['emails_export']; }
        if (isset($body['template_id'])) { $fields[] = 'template_id = ?'; $values[] = $body['template_id']; }
        if (isset($body['ativo'])) { $fields[] = 'ativo = ?'; $values[] = $body['ativo'] ? 1 : 0; }
        if (isset($body['is_default'])) { $fields[] = 'is_default = ?'; $values[] = $body['is_default'] ? 1 : 0; }

        if (count($fields) > 0) {
            $values[] = $id;
            seaQuery("UPDATE dados_dachser.t_sea_regras_notificacao SET " . implode(', ', $fields) . " WHERE id = ?", $values);
        }
        sendJson(['success' => true, 'message' => 'Regra atualizada com sucesso']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/sea/regras-notificacao/:id
$router->delete('sea/regras-notificacao/:id', function($params) {
    try {
        seaQuery("DELETE FROM dados_dachser.t_sea_regras_notificacao WHERE id = ?", [$params['id']]);
        sendJson(['success' => true, 'message' => 'Regra excluída com sucesso']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/items
$router->get('sea/maritimo/items', function($params) {
    try {
        $analysisType = isset($_GET['analysisType']) ? $_GET['analysisType'] : null;
        $status = isset($_GET['status']) ? $_GET['status'] : null;
        $search = isset($_GET['search']) ? $_GET['search'] : null;

        $sql = "
            SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
                   i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
                   i.status, i.active, i.created_at,
                   (SELECT COUNT(*) FROM dados_dachser.t_sea_runs r WHERE r.item_id = i.id) AS run_count
            FROM dados_dachser.t_sea_items i
            WHERE i.active = 1
        ";
        $sqlParams = [];
        
        if ($analysisType) { $sql .= " AND i.view = ?"; $sqlParams[] = $analysisType; }
        if ($status && $status !== 'todos') { $sql .= " AND i.status = ?"; $sqlParams[] = $status; }
        if ($search) {
            $sql .= " AND (i.arquivo_label LIKE ? OR i.consignee LIKE ? OR i.container LIKE ?)";
            $p = "%$search%";
            $sqlParams[] = $p; $sqlParams[] = $p; $sqlParams[] = $p;
        }
        $sql .= " ORDER BY i.created_at DESC";

        $items = seaQuery($sql, $sqlParams);
        sendJson(['success' => true, 'items' => $items ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/items/:id
$router->get('sea/maritimo/items/:id', function($params) {
    try {
        $items = seaQuery("
            SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
                   i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
                   i.status, i.active, i.created_at
            FROM dados_dachser.t_sea_items i WHERE i.id = ?
        ", [$params['id']]);
        sendJson(['success' => true, 'item' => isset($items[0]) ? $items[0] : null]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/items/:id/history
$router->get('sea/maritimo/items/:id/history', function($params) {
    try {
        $id = $params['id'];
        $items = seaQuery("
          SELECT i.id, i.arquivo_id, i.arquivo_label AS base_file_name, i.consignee,
                 i.container, i.status, i.view AS analysis_type, i.created_at
          FROM dados_dachser.t_sea_items i WHERE i.id = ?
        ", [$id]);
        
        $runs = seaQuery("
          SELECT r.id, r.item_id, r.mode, r.thread_id, r.run_id, r.status, r.result_text, r.created_at
          FROM dados_dachser.t_sea_runs r WHERE r.item_id = ?
          ORDER BY r.created_at DESC
        ", [$id]);

        $arquivoId = isset($items[0]['arquivo_id']) ? $items[0]['arquivo_id'] : null;
        $itemFiles = [];
        if ($arquivoId) {
            $itemFiles = seaQuery("
              SELECT f.id, f.filename AS file_name, f.url AS file_url, f.mime AS file_type, f.size_bytes, f.created_at
              FROM dados_dachser.t_sea_files f WHERE f.id = ? ORDER BY f.created_at ASC
            ", [$arquivoId]);
        }
        
        $runsWithFiles = [];
        foreach (($runs ?: []) as $r) {
            $r['files'] = $itemFiles;
            $runsWithFiles[] = $r;
        }

        sendJson(['success' => true, 'item' => isset($items[0]) ? $items[0] : ['base_file_name' => ''], 'runs' => $runsWithFiles]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/items/:id/files
$router->get('sea/maritimo/items/:id/files', function($params) {
    try {
        $id = $params['id'];
        $items = seaQuery("SELECT arquivo_id FROM dados_dachser.t_sea_items WHERE id = ?", [$id]);
        $arquivoId = isset($items[0]['arquivo_id']) ? $items[0]['arquivo_id'] : null;
        
        $files = seaQuery("
            SELECT DISTINCT id, filename, mime, size_bytes, url, rel_path, created_at
            FROM dados_dachser.t_sea_files
            WHERE id = ? OR item_id = ?
            ORDER BY created_at ASC
        ", [$arquivoId ?: 0, $id]);

        $baseFile = null;
        $analysisFiles = [];
        
        foreach (($files ?: []) as $f) {
            if ($f['id'] === $arquivoId) {
                $baseFile = $f;
            } else {
                $analysisFiles[] = $f;
            }
        }
        
        sendJson(['success' => true, 'files' => $analysisFiles, 'baseFileName' => $baseFile ? $baseFile['filename'] : '']);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/sea/maritimo/items/:id
$router->delete('sea/maritimo/items/:id', function($params) {
    try {
        seaQuery("UPDATE dados_dachser.t_sea_items SET active = 0, active_at = NOW() WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/maritimo/submit-analysis
$router->post('sea/maritimo/submit-analysis', function($params) {
    $requestId = uniqid('sea_');
    error_log("[REQUEST_RECEIVED] [RequestId: $requestId] POST sea/maritimo/submit-analysis initiated");
    $step = 'REQUEST_RECEIVED';

    try {
        $body = getRequestBody();
        $itemId = isset($body['itemId']) ? $body['itemId'] : null;
        $analysisType = isset($body['analysisType']) ? $body['analysisType'] : null;
        $files = isset($body['files']) ? $body['files'] : [];
        $fileUrls = isset($body['fileUrls']) ? $body['fileUrls'] : [];
        $linkData = isset($body['linkData']) ? $body['linkData'] : null;

        $step = 'FILES_VALIDATED';
        if (!$analysisType) {
            error_log("[FILES_VALIDATED] [RequestId: $requestId] Missing analysisType");
            sendJson([
                'success' => false,
                'code' => 'SEA_MISSING_ANALYSIS_TYPE',
                'message' => 'analysisType é obrigatório',
                'requestId' => $requestId,
                'step' => $step
            ], 400);
            return;
        }

        if ($analysisType === 'manifest_hbl' && count($files) === 0) {
            error_log("[FILES_VALIDATED] [RequestId: $requestId] Missing HBL files");
            sendJson([
                'success' => false,
                'code' => 'SEA_MISSING_HBL_FILES',
                'message' => 'At least 1 HBL file is required',
                'requestId' => $requestId,
                'step' => $step
            ], 400);
            return;
        }

        if ($analysisType === 'hbl_mbl' && count($files) !== 1) {
            error_log("[FILES_VALIDATED] [RequestId: $requestId] Invalid MBL count");
            sendJson([
                'success' => false,
                'code' => 'SEA_INVALID_MBL_COUNT',
                'message' => 'Exactly 1 MBL file is required',
                'requestId' => $requestId,
                'step' => $step
            ], 400);
            return;
        }

        if ($analysisType === 'invoices_hbl' && count($files) === 0 && count($fileUrls) === 0) {
            error_log("[FILES_VALIDATED] [RequestId: $requestId] No files provided");
            sendJson([
                'success' => false,
                'code' => 'SEA_NO_FILES_PROVIDED',
                'message' => 'At least 1 file is required for analysis',
                'requestId' => $requestId,
                'step' => $step
            ], 400);
            return;
        }

        $step = 'MANIFEST_LOADED';
        $actualItemId = $itemId ? (int)$itemId : null;
        if ($analysisType === 'invoices_hbl' && !$actualItemId) {
            $base = null;
            foreach ($files as $f) { if (preg_match('/hbl|house|hbol/i', $f['name'])) { $base = $f; break; } }
            if (!$base) { foreach ($fileUrls as $f) { if (preg_match('/hbl|house|hbol/i', $f['name'])) { $base = $f; break; } } }
            if (!$base) $base = count($files) > 0 ? $files[0] : (count($fileUrls) > 0 ? $fileUrls[0] : null);
            
            if ($base) {
                $fileRes = seaQuery("
                    INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, created_at)
                    VALUES (?, ?, ?, ?, ?, NOW())
                ", [
                    $base['name'], 
                    isset($base['type']) ? $base['type'] : (isset($base['mimeType']) ? $base['mimeType'] : 'application/pdf'), 
                    isset($base['size']) ? $base['size'] : 0, 
                    '', 
                    isset($base['url']) ? $base['url'] : ''
                ]);
                $itemRes = seaQuery("
                    INSERT INTO dados_dachser.t_sea_items (view, arquivo_id, arquivo_label, status, active, created_at)
                    VALUES (?, ?, ?, 'queued', 1, NOW())
                ", ['invoices_hbl', $fileRes['insertId'], $base['name']]);
                
                $actualItemId = (int)$itemRes['insertId'];
            }
        }

        $step = 'HBL_FILES_LOADED';
        // Prevent duplicating active runs: check if there's already an active (queued/analisando) run for this itemId and mode
        $modeValue = $analysisType === 'invoices_hbl' ? 'hbl_mbl' : $analysisType;
        if ($actualItemId) {
            $existingRuns = seaQuery("
                SELECT id, status FROM dados_dachser.t_sea_runs 
                WHERE item_id = ? AND mode = ? AND status IN ('pendente', 'analisando') 
                LIMIT 1
            ", [$actualItemId, $modeValue]);
            if (count($existingRuns) > 0) {
                $existingRun = $existingRuns[0];
                error_log("[HBL_FILES_LOADED] [RequestId: $requestId] Analysis already in progress: Run ID " . $existingRun['id']);
                sendJson([
                    'success' => true,
                    'analysisId' => (string)$existingRun['id'],
                    'runId' => (int)$existingRun['id'],
                    'itemId' => $actualItemId,
                    'status' => $existingRun['status'],
                    'message' => 'Análise já está em processamento',
                    'files' => count($files) + count($fileUrls)
                ]);
                return;
            }
        }

        $runRes = seaQuery("INSERT INTO dados_dachser.t_sea_runs (item_id, mode, status, created_at) VALUES (?, ?, 'pendente', NOW())", [$actualItemId, $modeValue]);
        $runId = (int)$runRes['insertId'];

        foreach ($files as $file) {
            seaQuery("
                INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, item_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            ", [
                $file['name'], 
                isset($file['type']) ? $file['type'] : (isset($file['mimeType']) ? $file['mimeType'] : 'application/octet-stream'), 
                isset($file['size']) ? $file['size'] : 0, 
                '', '', $actualItemId
            ]);
        }
        foreach ($fileUrls as $file) {
            seaQuery("
                INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, item_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            ", [
                $file['name'], 
                isset($file['type']) ? $file['type'] : 'application/octet-stream', 
                isset($file['size']) ? $file['size'] : 0, 
                '', 
                isset($file['url']) ? $file['url'] : '', 
                $actualItemId
            ]);
        }
        
        if ($actualItemId) {
            seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'queued' WHERE id = ?", [$actualItemId]);
        }

        $allFiles = [];
        foreach ($files as $f) { $allFiles[] = array_merge($f, ['mimeType' => isset($f['mimeType']) ? $f['mimeType'] : (isset($f['type']) ? $f['type'] : 'application/octet-stream')]); }
        foreach ($fileUrls as $f) { $allFiles[] = array_merge($f, ['mimeType' => isset($f['type']) ? $f['type'] : 'application/octet-stream']); }

        $step = 'AI_REQUEST_STARTED';
        // Agendamento do job no worker de background usando arquivo temporário
        $jobData = [
            'task' => 'sea_analysis',
            'runId' => $runId,
            'itemId' => $actualItemId,
            'analysisType' => $analysisType,
            'files' => $allFiles,
            'context' => ['linkData' => $linkData],
            'requestId' => $requestId
        ];
        
        $jobFile = sys_get_temp_dir() . '/dachser_analysis_job_' . $runId . '.json';
        file_put_contents($jobFile, json_encode($jobData));
        
        runPHPBackground(dirname(__DIR__) . '/background_worker.php', [$jobFile]);

        error_log("[AI_REQUEST_STARTED] [RequestId: $requestId] Background job scheduled. RunID: $runId, ItemID: $actualItemId");

        sendJson([
            'success' => true,
            'analysisId' => (string)$runId,
            'runId' => $runId,
            'itemId' => $actualItemId,
            'status' => 'queued',
            'message' => 'Análise iniciada em background',
            'files' => count($allFiles),
            'requestId' => $requestId
        ]);
    } catch (Exception $e) {
        error_log("[ANALYSIS_FAILED] [RequestId: $requestId] [Step: $step] Error: " . $e->getMessage());
        sendJson([
            'success' => false,
            'code' => 'SEA_AI_REQUEST_FAILED',
            'message' => 'Não foi possível processar os documentos.',
            'technicalMessage' => $e->getMessage(),
            'requestId' => $requestId,
            'step' => $step
        ], 500);
    }
});

// GET /api/sea/maritimo/analysis/:id
$router->get('sea/maritimo/analysis/:id', function($params) {
    try {
        $rows = seaQuery("SELECT id, status, result_text, result_json, created_at FROM dados_dachser.t_sea_runs WHERE id = ? LIMIT 1", [$params['id']]);
        $run = isset($rows[0]) ? $rows[0] : null;
        if (!$run) sendJson(['error' => 'Análise não encontrada'], 404);
        
        $resultData = null;
        try {
            $resultData = $run['result_json'] ? json_decode($run['result_json'], true) : null;
        } catch (Exception $ex) {}
        
        $progressMap = [
            'pendente' => [10, 'Na fila...'],
            'analisando' => [60, 'Processando com IA...'],
            'realizado' => [100, 'Concluído!'],
            'completed' => [100, 'Concluído!'],
            'erro' => [100, 'Erro na análise'],
            'error' => [100, 'Erro na análise']
        ];
        
        $progress = isset($progressMap[$run['status']]) ? $progressMap[$run['status']] : [25, 'Processando...'];
        
        sendJson([
            'success' => true,
            'analysis' => [
                'id' => String($run['id']),
                'status' => $run['status'],
                'progress_percent' => $progress[0],
                'progress_step' => $progress[1],
                'progress_message' => $progress[1],
                'result_text' => $run['result_text'],
                'result_data' => $resultData,
                'error_message' => ($run['status'] === 'erro' || $run['status'] === 'error') ? $run['result_text'] : null
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/maritimo/complete-analysis
$router->post('sea/maritimo/complete-analysis', function($params) {
    try {
        $body = getRequestBody();
        $analysisId = $body['analysisId'];
        $itemId = $body['itemId'];
        $completed = $body['completed'];

        seaQuery("UPDATE dados_dachser.t_sea_runs SET status = ? WHERE id = ?", [$completed ? 'realizado' : 'erro', $analysisId]);
        if ($itemId) {
            seaQuery("UPDATE dados_dachser.t_sea_items SET status = ? WHERE id = ?", [$completed ? 'analisado' : 'erro', $itemId]);
        }
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/system-logs
$router->get('sea/maritimo/system-logs', function($params) {
    sendJson(['success' => true, 'data' => []]);
});

// GET /api/sea/maritimo/export-report
$router->get('sea/maritimo/export-report', function($params) {
    sendJson(['success' => true, 'message' => 'Report generated']);
});

// GET /api/sea/mbls-export
$router->get('sea/mbls-export', function($params) {
    try {
        $rows = seaQuery("
            SELECT DISTINCT mbl_id FROM dados_dachser.t_consulta_armador
            ORDER BY mbl_id ASC
        ");
        sendJson(['success' => true, 'mbls' => array_column($rows ?: [], 'mbl_id')]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/approved-examples/list
$router->get('sea/maritimo/approved-examples/list', function($params) {
    try {
        $rows = seaQuery("SELECT id, text_block, label FROM dados_dachser.t_sea_approved_examples WHERE active = 1 ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/maritimo/approved-examples
$router->get('sea/maritimo/approved-examples', function($params) {
    try {
        $rows = seaQuery("SELECT * FROM dados_dachser.t_sea_approved_examples ORDER BY created_at DESC");
        sendJson(['success' => true, 'data' => $rows ?: []]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/maritimo/approved-examples
$router->post('sea/maritimo/approved-examples', function($params) {
    try {
        $body = getRequestBody();
        $textBlock = $body['textBlock'];
        $label = isset($body['label']) ? $body['label'] : 'Exemplo Aprovado';

        seaQuery("INSERT INTO dados_dachser.t_sea_approved_examples (text_block, label, active, created_at) VALUES (?, ?, 1, NOW())", [$textBlock, $label]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// PATCH /api/sea/maritimo/approved-examples/:id/toggle
$router->patch('sea/maritimo/approved-examples/:id/toggle', function($params) {
    try {
        seaQuery("UPDATE dados_dachser.t_sea_approved_examples SET active = NOT active WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// DELETE /api/sea/maritimo/approved-examples/:id
$router->delete('sea/maritimo/approved-examples/:id', function($params) {
    try {
        seaQuery("DELETE FROM dados_dachser.t_sea_approved_examples WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/cct/shipments
$router->get('sea/cct/shipments', function($params) {
    try {
        $result = computeCCTData();
        sendJson($result);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/cct/shipments/:id
$router->get('sea/cct/shipments/:id', function($params) {
    try {
        $res = computeCCTData();
        $match = null;
        foreach ($res['data'] as $row) {
            if (trim($row['hawb']) === trim($params['id'])) { $match = $row; break; }
        }
        if (!$match) sendJson(['success' => false, 'error' => 'Shipment não encontrado'], 404);
        sendJson(['success' => true, 'shipment' => $match]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/sea/cct/shipments/:id
$router->patch('sea/cct/shipments/:id', function($params) {
    try {
        $id = $params['id'];
        $body = getRequestBody();
        $action = isset($body['action']) ? $body['action'] : '';

        if ($action === 'ocultar') {
            cctFinQuery("
                INSERT INTO dados_dachser.t_cct_hidden_hawbs (hawb, reason, delivered_at)
                VALUES (?, 'MANUAL', NOW())
                ON DUPLICATE KEY UPDATE reason='MANUAL', delivered_at=NOW()
            ", [$id]);
        }
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/cct/analytics
$router->get('sea/cct/analytics', function($params) {
    try {
        $res = computeCCTData();
        $data = $res['data'];
        
        $bloqueados = 0;
        $semRetorno = 0;
        $liberados = 0;
        
        foreach ($data as $r) {
            $sit = strtoupper($r['situacao_portal_atual'] ?: '');
            if ($r['teve_bloqueio'] === 'Sim' || $r['teve_bloqueio'] === 1) $bloqueados++;
            elseif (strpos($sit, 'SEM RETORNO') !== false) $semRetorno++;
            else $liberados++;
        }
        
        sendJson([
            'success' => true,
            'analytics' => [
                'total' => count($data),
                'bloqueados' => $bloqueados,
                'semRetorno' => $semRetorno,
                'liberados' => $liberados
            ]
        ]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/cct/profiles
$router->get('sea/cct/profiles', function($params) {
    try {
        $res = computeCCTData();
        $data = $res['data'];
        $analysts = [];
        foreach ($data as $d) {
            $n = trim($d['nome_analista']);
            $e = trim($d['email_analista']);
            if ($n) $analysts[$n] = $e;
        }
        $profiles = [];
        $idx = 1;
        foreach ($analysts as $n => $e) {
            $profiles[] = ['id' => "analyst-$idx", 'nome' => $n, 'email' => $e, 'ativo' => true];
            $idx++;
        }
        sendJson(['success' => true, 'data' => $profiles]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/sea/cct/events
$router->get('sea/cct/events', function($params) {
    sendJson(['success' => true, 'events' => []]);
});

// POST /api/sea/resolve-vessel-imo
$router->post('sea/resolve-vessel-imo', function($params) {
    sendJson(['success' => true, 'imo' => null]);
});

// GET /api/sea/files/:id/download
$router->get('sea/files/:id/download', function($params) {
    try {
        $id = (int)$params['id'];
        $rows = seaQuery("SELECT filename, mime, file_content FROM dados_dachser.t_sea_files WHERE id = ? LIMIT 1", [$id]);
        if (!$rows || count($rows) === 0) {
            sendJson(['error' => 'Arquivo não encontrado'], 404);
        }
        $file = $rows[0];
        
        // Se file_content estiver em base64 no banco ou for BLOB
        $content = $file['file_content'];
        if (strpos($content, 'data:') === 0 && strpos($content, ';base64,') !== false) {
            $parts = explode(';base64,', $content);
            $content = base64_decode($parts[1]);
        }
        
        header('Content-Type: ' . ($file['mime'] ?: 'application/octet-stream'));
        header('Content-Disposition: attachment; filename="' . $file['filename'] . '"');
        echo $content;
        exit;
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/upload-base-file
$router->post('sea/upload-base-file', function($params) {
    // Configura limites de tempo e memória para uploads maiores
    ini_set('memory_limit', '1024M');
    set_time_limit(300);

    try {
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'sea');
        if (!$uploadResult['success']) {
            sendJson(['success' => false, 'error' => $uploadResult['error']], 400);
        }

        $fileName = $uploadResult['originalName'];
        $mimeType = $uploadResult['mime'];
        $filePath = $uploadResult['path'];
        $fileSize = $uploadResult['size'];
        $view = isset($_POST['analysisType']) ? $_POST['analysisType'] : 'manifest_hbl';

        // Tenta extrair o número do container a partir do nome do arquivo (ex: Manifest SEKU5762065.xlsx)
        $container = null;
        if (preg_match('/\b([A-Z]{4}\d{7})\b/', $fileName, $matches)) {
            $container = $matches[1];
        }

        $pdo = getSeaPDO();
        
        // Abre o arquivo em modo leitura binária para persistir como BLOB eficientemente
        $fp = fopen($filePath, 'rb');
        
        // rel_path e url são NOT NULL no banco. Definimos '' temporariamente
        $stmtFile = $pdo->prepare("INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, file_content, rel_path, url, created_at) VALUES (?, ?, ?, ?, '', '', NOW())");
        $stmtFile->bindValue(1, $fileName);
        $stmtFile->bindValue(2, $mimeType);
        $stmtFile->bindValue(3, $fileSize);
        $stmtFile->bindValue(4, $fp, PDO::PARAM_LOB);
        $stmtFile->execute();
        $fileId = $pdo->lastInsertId();
        
        if (is_resource($fp)) {
            fclose($fp);
        }

        // Atualiza a URL do arquivo com a rota de download correta
        $fileUrl = "/api/sea/files/{$fileId}/download";
        $stmtUpdateFile = $pdo->prepare("UPDATE dados_dachser.t_sea_files SET url = ? WHERE id = ?");
        $stmtUpdateFile->execute([$fileUrl, $fileId]);

        // Insere o item na tabela t_sea_items registrando o container
        $stmtItem = $pdo->prepare("INSERT INTO dados_dachser.t_sea_items (view, arquivo_id, arquivo_label, container, status, active, created_at) VALUES (?, ?, ?, ?, 'queued', 1, NOW())");
        $stmtItem->execute([$view, $fileId, $fileName, $container]);
        $itemId = $pdo->lastInsertId();

        sendJson(['success' => true, 'itemId' => (int)$itemId, 'fileId' => (int)$fileId]);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/sea/extract-attachments
$router->post('sea/extract-attachments', function($params) {
    // Simplesmente retorna o próprio base64 em arrays
    $body = getRequestBody();
    $files = isset($body['files']) ? $body['files'] : [];
    sendJson(['success' => true, 'attachments' => $files]);
});

// POST /api/sea/tracking/send-status-email
$router->post('sea/tracking/send-status-email', function($params) {
    $body = getRequestBody();
    $to = isset($body['to']) ? $body['to'] : null;
    $subject = isset($body['subject']) ? $body['subject'] : 'Tracking status';
    $html = isset($body['html']) ? $body['html'] : '';
    
    if (sendEmailResend($to, $subject, $html)) {
        sendJson(['success' => true]);
    } else {
        sendJson(['success' => false, 'error' => 'Falha ao enviar e-mail'], 500);
    }
});
