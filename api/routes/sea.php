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

// Template de formatação oficial DACHSER para o relatório manifest_hbl — usado
// tanto no prompt inicial (Claude/Gemini) quanto na arbitragem final (OpenAI),
// para garantir saída visualmente consistente entre execuções (nunca usar "___"
// como separador; sempre "━" repetido 66 vezes).
define('SEA_MANIFEST_HBL_FORMAT_TEMPLATE', <<<'TEMPLATE'
MANDATORY OUTPUT FORMAT — follow this exactly, do not deviate:

Hello, team.

Please update HBL as follows:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DRAFT HBL: <hbl number>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTAINER VERIFICATION:
- Manifest Container: <value>
- HBL Container: <value>
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

TOTAL WEIGHT:
- Manifest Total (Weight after Weighting): <value> kg
- HBL Total Gross Weight: <value> kg
- Delta: <value> kg
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

TOTAL CBM:
- Manifest Total: <value> m³
- HBL Total Measurement: <value> m³
- Delta: <value> m³
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

TOTAL VOLUMES:
- Manifest Total Packages: <value>
- HBL Total Packages: <value>
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

SEAL NUMBER:
- Manifest Seal: <value>
- HBL Seal: <value>
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

CONSIGNEE CNPJ:
- Manifest VAT No.: <value>
- HBL CNPJ: <value>
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

NCM CODES:
- Manifest NCMs: [<list>]
- HBL NCMs: [<list>]
- Missing in HBL: <list or "none">
- Extra in HBL: <list or "none">
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

INVOICE REFERENCES:
<summary sentence>
- Status: MATCH | UPDATE REQUIRED → Update: <instruction>

EXPORTER/SHIPPER ANALYSIS:
(repeat this block per exporter found)

EXPORTER #N: <name>
- CNPJ: Manifest: <value> | HBL: <value> | Status: MATCH | UPDATE REQUIRED
- Seal: Manifest: <value> | HBL: <value> | Status: MATCH | UPDATE REQUIRED

Invoice References:
- Manifest invoices: [<list>]
- HBL invoices: [<list>]
- Status: MATCH | UPDATE REQUIRED

Manifest Items (reference only — totals verified at exporter level):
  - Item: <description> / <weight> kg / <cbm> m³ / <packages>

Subtotals EXPORTER #N:
- Total Weight: Manifest: <value> kg | HBL: <value> kg | Delta: <value> kg | Status: MATCH | UPDATE REQUIRED
- Total CBM: Manifest: <value> m³ | HBL: <value> m³ | Delta: <value> m³ | Status: MATCH | UPDATE REQUIRED
- Total Volumes: Manifest: <value> | HBL: <value> | Delta: <value> | Status: MATCH | UPDATE REQUIRED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANALYSIS SUMMARY:
- Total exporters identified: <N> entries analyzed
- Total items analyzed: <N> packages
- Fields with discrepancies: <list, or "None">

VERIFICATION CHECKLIST:
Files analyzed:
- Manifest: <filename>
- Draft HBL: <filename>

Explicit verifications:
[✓ or ⚠] Container, [✓ or ⚠] Seal, [✓ or ⚠] Shipper, [✓ or ⚠] Consignee, [✓ or ⚠] CNPJ, [✓ or ⚠] NCM Codes, [✓ or ⚠] Invoices, [✓ or ⚠] Total CBM, [✓ or ⚠] Total Volumes, [✓ or ⚠] Total Weight

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMATTING RULES (mandatory):
- Section separator lines MUST be exactly 66 repetitions of the "━" character (U+2501, BOX DRAWINGS HEAVY HORIZONTAL). NEVER use "_", "-", "=" or any other character as a separator.
- Leave exactly one blank line between sections.
- Use "MATCH" or "UPDATE REQUIRED → Update: <clear instruction>" as the status value — never invent other status words.
- Always end the message with the JSON block below, wrapped EXACTLY in a fenced code block tagged json (so it can be reliably detected and removed before the report reaches the end user — it must NEVER be visible in the rendered report itself):
```json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
```
TEMPLATE
);

function seaPromptForAnalysisType($analysisType) {
  if ($analysisType === 'manifest_hbl') {
    return 'You are a senior ocean freight document auditor for DACHSER.
Compare the provided Manifest (Excel/spreadsheet) against the Draft HBL document(s) (PDF).
' . SEA_MANIFEST_HBL_FORMAT_TEMPLATE;
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

// ── Anthropic: build request / parse response (separados para permitir disparo
// paralelo via fetchParallel — ver processSeaAnalysisRunPHP) ──────────────────
function seaBuildAnthropicRequest($analysisType, $files, $context = [], $logCtx = []) {
  $key = isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null;
  if (!$key) throw new Exception('ANTHROPIC_API_KEY não configurada');

  $content = seaBuildLlmContentPHP($files);
  $content[] = [
    'type' => 'text',
    'text' => seaPromptForAnalysisType($analysisType) . "\n\nContext: " . json_encode($context)
  ];

  return [
    'url' => 'https://api.anthropic.com/v1/messages',
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
    ]),
    'connectTimeout' => 10,
    'timeout' => 300,
    'logCtx' => array_merge($logCtx, ['module' => 'sea', 'provider' => 'Anthropic']),
  ];
}

function seaParseAnthropicResponse($res) {
  if (!$res['ok']) {
      throw new Exception("[SEA_AI_HTTP_ERROR] Anthropic SEA error {$res['status']}: " . substr((string)$res['body'], 0, 300));
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

function seaAnalyzeWithAnthropicPHP($analysisType, $files, $context = [], $logCtx = []) {
  $req = seaBuildAnthropicRequest($analysisType, $files, $context, $logCtx);
  $res = fetch($req['url'], $req);
  return seaParseAnthropicResponse($res);
}

// ── Gemini: build request / parse response (idem) ─────────────────────────────
function seaBuildGeminiRequest($analysisType, $files, $context = [], $logCtx = []) {
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

  return [
    'url' => 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
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
    ]),
    'connectTimeout' => 10,
    'timeout' => 300,
    'logCtx' => array_merge($logCtx, ['module' => 'sea', 'provider' => 'Gemini']),
  ];
}

function seaParseGeminiResponse($res) {
  if (!$res['ok']) {
    throw new Exception("[SEA_AI_HTTP_ERROR] Gemini SEA error {$res['status']}: " . substr((string)$res['body'], 0, 300));
  }
  $data = $res['json']();
  return isset($data['choices'][0]['message']['content']) ? $data['choices'][0]['message']['content'] : '';
}

function seaAnalyzeWithGeminiPHP($analysisType, $files, $context = [], $logCtx = []) {
  $req = seaBuildGeminiRequest($analysisType, $files, $context, $logCtx);
  $res = fetch($req['url'], $req);
  return seaParseGeminiResponse($res);
}

function seaArbitrateWithOpenAIPHP($analysisType, $claudeText, $geminiText, $logCtx = []) {
  $key = isset($_ENV['OPENAI_API_KEY']) ? $_ENV['OPENAI_API_KEY'] : (isset($_ENV['CHB_OPENAI_API_KEY']) ? $_ENV['CHB_OPENAI_API_KEY'] : null);
  if (!$key) return $claudeText ?: $geminiText;

  $manifestHblInstructions = $analysisType === 'manifest_hbl' ? "
CRITICAL FORMAT RULE for manifest_hbl — the two analyses below may use inconsistent
separators/spacing; your job includes NORMALIZING the final output to this exact
template (do not change the factual content/findings, only the formatting):

" . SEA_MANIFEST_HBL_FORMAT_TEMPLATE . "
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
    ]),
    'connectTimeout' => 10,
    'timeout' => 300,
    'logCtx' => array_merge($logCtx, ['module' => 'sea', 'provider' => 'OpenAI']),
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

function logSeaWorkerStep($stage, $runId, $itemId, $requestId, $extra = []) {
    error_log("[$stage] " . json_encode(array_merge([
        'analysis_id' => $runId,
        'item_id' => $itemId,
        'request_id' => $requestId,
        'stage' => $stage,
        'backendVersion' => BACKEND_API_VERSION,
        'timestamp' => date('Y-m-d H:i:s'),
    ], $extra)));
}

// Background analysis process execution
// Persiste tempo decorrido (em ms desde o início do worker) por etapa, direto no
// banco (não só em error_log, que não é consultável remotamente). Escreve a cada
// checkpoint para que, mesmo se o processo morrer/travar depois, o que já rodou
// fique visível em t_sea_runs.timing_json em vez de virar uma caixa-preta.
function seaPersistTiming($runId, &$timing, $label, $startTime) {
    $timing[$label] = round((microtime(true) - $startTime) * 1000);
    try {
        seaQuery("UPDATE dados_dachser.t_sea_runs SET timing_json = ? WHERE id = ?", [json_encode($timing), $runId]);
    } catch (Throwable $e) {}
}

function processSeaAnalysisRunPHP($runId, $itemId, $analysisType, $files, $context, $requestId = null) {
  $requestId = $requestId ?: uniqid('sea_worker_');
  $startTime = microtime(true);
  $timing = [];
  logSeaWorkerStep('SEA_WORKER_STARTED', $runId, $itemId, $requestId, ['analysisType' => $analysisType, 'fileCount' => is_array($files) ? count($files) : 0]);

  try {
    // Falha rápido se nenhuma chave de IA estiver disponível neste ambiente (CLI/worker) —
    // evita deixar a análise presa em 'analisando' por até 2x300s só para descobrir isso.
    $claudeKeyDiag = describeEnvKey('ANTHROPIC_API_KEY');
    $geminiKeyDiag = describeEnvKey('GEMINI_API_KEY');
    logSeaWorkerStep('SEA_AI_CONFIG_VALIDATED', $runId, $itemId, $requestId, [
        'anthropic' => $claudeKeyDiag,
        'gemini' => $geminiKeyDiag,
        'sapi' => PHP_SAPI,
    ]);
    if (!$claudeKeyDiag['non_empty'] && !$geminiKeyDiag['non_empty']) {
      throw new Exception("[SEA_AI_CONFIG_MISSING] Nenhuma chave de IA (ANTHROPIC_API_KEY/GEMINI_API_KEY) configurada no ambiente $requestId" . "(SAPI: " . PHP_SAPI . ")");
    }

    seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'analisando', started_at = NOW() WHERE id = ?", [$runId]);
    if ($itemId) seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'analisando' WHERE id = ?", [$itemId]);
    logSeaWorkerStep('SEA_STATUS_PROCESSING', $runId, $itemId, $requestId);
    seaPersistTiming($runId, $timing, 'config_validated_ms', $startTime);

    $aiLogCtx = ['analysisId' => $runId, 'itemId' => $itemId, 'requestId' => $requestId];

    // Claude e Gemini disparados em PARALELO (curl_multi) em vez de sequenciais —
    // corta o pior caso de latência de ~600s (300s+300s somados) para ~300s
    // (o maior dos dois, rodando ao mesmo tempo). Timeout individual de 300s por
    // provedor é preservado; se um falhar/der timeout mas o outro responder, a
    // regra de negócio existente (arbitragem com o texto disponível) se aplica
    // normalmente. Só lança exceção se AMBOS falharem.
    $parallelRequests = [];
    try {
        $parallelRequests['anthropic'] = seaBuildAnthropicRequest($analysisType, $files, $context, $aiLogCtx);
    } catch (Throwable $ex) {
        error_log('[worker claude] build request failed: ' . $ex->getMessage());
    }
    try {
        $parallelRequests['gemini'] = seaBuildGeminiRequest($analysisType, $files, $context, $aiLogCtx);
    } catch (Throwable $ex) {
        error_log('[worker gemini] build request failed: ' . $ex->getMessage());
    }

    logSeaWorkerStep('SEA_AI_REQUEST_STARTED', $runId, $itemId, $requestId, [
        'providers' => array_keys($parallelRequests), 'parallel' => true,
    ]);
    seaPersistTiming($runId, $timing, 'ai_dispatch_started_ms', $startTime);
    $parallelResults = fetchParallel($parallelRequests);
    seaPersistTiming($runId, $timing, 'ai_parallel_fetch_done_ms', $startTime);

    $claudeText = '';
    if (isset($parallelResults['anthropic'])) {
        try {
            $claudeText = seaParseAnthropicResponse($parallelResults['anthropic']);
            logSeaWorkerStep('SEA_AI_RESPONSE_RECEIVED', $runId, $itemId, $requestId, ['provider' => 'Anthropic', 'chars' => strlen($claudeText)]);
        } catch (Throwable $ex) {
            error_log('[worker claude] ' . $ex->getMessage());
        }
    }

    $geminiText = '';
    if (isset($parallelResults['gemini'])) {
        try {
            $geminiText = seaParseGeminiResponse($parallelResults['gemini']);
            logSeaWorkerStep('SEA_AI_RESPONSE_RECEIVED', $runId, $itemId, $requestId, ['provider' => 'Gemini', 'chars' => strlen($geminiText)]);
        } catch (Throwable $ex) {
            error_log('[worker gemini] ' . $ex->getMessage());
        }
    }

    if (!$claudeText && !$geminiText) {
      throw new Exception("Falha nas duas análises de IA.");
    }

    // Só vale a pena chamar a arbitragem (OpenAI) quando HÁ duas análises reais
    // para reconciliar. Se só uma respondeu, arbitrar contra um texto vazio é
    // latência pura jogada fora (até +300s) sem nenhum ganho — usa a que existe.
    if ($claudeText && $geminiText) {
        logSeaWorkerStep('SEA_AI_ARBITRATION_STARTED', $runId, $itemId, $requestId, ['provider' => 'OpenAI']);
        $finalText = seaArbitrateWithOpenAIPHP($analysisType, $claudeText, $geminiText, $aiLogCtx);
        logSeaWorkerStep('SEA_AI_ARBITRATION_COMPLETED', $runId, $itemId, $requestId, ['chars' => strlen($finalText)]);
    } else {
        $finalText = $claudeText ?: $geminiText;
        logSeaWorkerStep('SEA_AI_ARBITRATION_SKIPPED', $runId, $itemId, $requestId, [
            'reason' => 'only one provider succeeded, nothing to arbitrate',
            'sourceUsed' => $claudeText ? 'Anthropic' : 'Gemini',
        ]);
    }
    seaPersistTiming($runId, $timing, 'arbitration_done_ms', $startTime);

    logSeaWorkerStep('SEA_RESULT_VALIDATED', $runId, $itemId, $requestId);
    $shippingData = extractSeaShippingData($finalText);

    $jsonResult   = [
      'model' => isset($_ENV['OPENAI_API_KEY']) ? 'multi-model-direct-openai-arbitration' : 'multi-model-direct',
      'result_claude' => $claudeText,
      'result_gemini' => $geminiText,
      'hblShippingData' => $shippingData,
    ];

    seaQuery(
      "UPDATE dados_dachser.t_sea_runs SET status = 'realizado', result_text = ?, result_json = ?, completed_at = NOW() WHERE id = ?",
      [$finalText, json_encode($jsonResult), $runId]
    );
    logSeaWorkerStep('SEA_RESULT_SAVED', $runId, $itemId, $requestId);

    if ($itemId) {
      $updateFields = [];
      $updateValues = [];
      if (isset($shippingData['consignee']))  { $updateFields[] = 'consignee = ?';  $updateValues[] = $shippingData['consignee']; }
      if (isset($shippingData['mbl_number'])) { $updateFields[] = 'mbl_number = ?'; $updateValues[] = $shippingData['mbl_number']; }
      if (isset($shippingData['carrier']))    { $updateFields[] = 'carrier = ?';    $updateValues[] = $shippingData['carrier']; }
      if (isset($shippingData['ata_date'])) {
        // Nunca envia string vazia para a coluna DATE — normaliza antes do execute().
        $rawAtaDate = $shippingData['ata_date'];
        $normalizedAtaDate = normalizeSqlDate($rawAtaDate);
        error_log("[SEA_ATA_DATE_NORMALIZE] " . json_encode([
            'analysis_id' => $runId,
            'raw' => $rawAtaDate,
            'raw_php_type' => gettype($rawAtaDate),
            'normalized' => $normalizedAtaDate,
            'normalized_php_type' => gettype($normalizedAtaDate),
        ]));
        $updateFields[] = 'ata_date = ?';
        $updateValues[] = $normalizedAtaDate; // string 'Y-m-d' ou null — nunca ''
      }

      $updateValues[] = $itemId;

      $sql = "UPDATE dados_dachser.t_sea_items SET " . (count($updateFields) > 0 ? implode(', ', $updateFields) . ", " : '') . "status = 'analisado' WHERE id = ?";
      seaQuery($sql, $updateValues);
    }
    logSeaWorkerStep('SEA_RUN_COMPLETED', $runId, $itemId, $requestId, ['durationMs' => round((microtime(true) - $startTime) * 1000)]);
  } catch (Throwable $err) {
    seaPersistTiming($runId, $timing, 'failed_at_ms', $startTime);
    $errMsg = $err->getMessage();
    $errorCode = 'SEA_PROCESSING_ERROR';
    $stage = 'AI_REQUEST';
    if (strpos($errMsg, '[SEA_AI_CONFIG_MISSING]') !== false) {
        $errorCode = 'SEA_AI_CONFIG_MISSING'; $stage = 'AI_CONFIG';
    } elseif (strpos($errMsg, '[SEA_AI_CONNECTION_TIMEOUT]') !== false) {
        $errorCode = 'SEA_AI_CONNECTION_TIMEOUT'; $stage = 'AI_REQUEST';
    } elseif (strpos($errMsg, '[SEA_AI_RESPONSE_TIMEOUT]') !== false) {
        $errorCode = 'SEA_AI_RESPONSE_TIMEOUT'; $stage = 'AI_REQUEST';
    } elseif (strpos($errMsg, 'SQLSTATE') !== false) {
        $errorCode = 'SEA_DB_WRITE_ERROR'; $stage = 'RESULT_SAVE';
    }

    logSeaWorkerStep('SEA_RUN_FAILED', $runId, $itemId, $requestId, [
        'error_code' => $errorCode,
        'stage' => $stage,
        'error_message' => $errMsg,
        'error_file' => $err->getFile(),
        'error_line' => $err->getLine(),
        'durationMs' => round((microtime(true) - $startTime) * 1000),
    ]);
    try {
        $errorPayload = json_encode([
            'success' => false,
            'error' => 'Erro no processamento da análise marítima: ' . $errMsg,
            'errorCode' => $errorCode,
            'stage' => $stage,
            'requestId' => $requestId,
            'technicalMessage' => $errMsg . " in " . $err->getFile() . " on line " . $err->getLine(),
        ]);
        seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ?, completed_at = NOW() WHERE id = ?", [$errorPayload, $runId]);
        if ($itemId) seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'erro' WHERE id = ?", [$itemId]);
    } catch (Throwable $updateErr) {}
  }
}

// ── SEA ROUTE HANDLERS ───────────────────────────────────────────────────────

// GET /api/sea/diagnosticos-ia
// Diagnóstico de conectividade com os provedores de IA usados no SEA — NÃO envia
// documentos, apenas valida chave/DNS/SSL/autenticação a partir do ambiente atual.
$router->get('sea/diagnosticos-ia', function($params) {
    $anthropicKeyDiag = describeEnvKey('ANTHROPIC_API_KEY');
    $geminiKeyDiag = describeEnvKey('GEMINI_API_KEY');
    $openaiKeyDiag = describeEnvKey('OPENAI_API_KEY');

    $anthropicModel = isset($_ENV['SEA_ANTHROPIC_MODEL']) ? $_ENV['SEA_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6';
    $geminiModel = isset($_ENV['SEA_GEMINI_MODEL']) ? $_ENV['SEA_GEMINI_MODEL'] : 'gemini-2.5-pro';

    sendJson([
        'success' => true,
        'backendVersion' => BACKEND_API_VERSION,
        'sapi' => PHP_SAPI,
        'keys' => ['anthropic' => $anthropicKeyDiag, 'gemini' => $geminiKeyDiag, 'openai' => $openaiKeyDiag],
        'connectivity' => [
            'anthropic' => validateAiConnectivityAnthropic($_ENV['ANTHROPIC_API_KEY'] ?? null, $anthropicModel),
            'gemini' => validateAiConnectivityGemini($_ENV['GEMINI_API_KEY'] ?? null, $geminiModel),
        ],
    ]);
});

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
        error_log("[SEA_RUN_CREATED] " . json_encode([
            'analysis_id' => $runId, 'item_id' => $actualItemId, 'request_id' => $requestId,
            'status' => 'pendente', 'mode' => $modeValue, 'backendVersion' => BACKEND_API_VERSION,
        ]));

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

        // Recupera o arquivo base (ex: Manifest Excel no caso de manifest_hbl, ou HBL base nos outros casos)
        // e o adiciona como o primeiro item do array de arquivos para a IA.
        if ($actualItemId) {
            try {
                $itemRows = seaQuery("SELECT arquivo_id FROM dados_dachser.t_sea_items WHERE id = ? LIMIT 1", [$actualItemId]);
                if (!empty($itemRows) && !empty($itemRows[0]['arquivo_id'])) {
                    $baseFileId = (int)$itemRows[0]['arquivo_id'];
                    $fileRows = seaQuery("SELECT filename, mime, size_bytes, file_content FROM dados_dachser.t_sea_files WHERE id = ? LIMIT 1", [$baseFileId]);
                    if (!empty($fileRows)) {
                        $baseFile = $fileRows[0];
                        $content = $baseFile['file_content'];
                        if (is_resource($content)) {
                            $content = stream_get_contents($content);
                        }
                        
                        $base64Content = null;
                        if (is_string($content) && strlen($content) > 0) {
                            if (strpos($content, 'data:') === 0 && strpos($content, ';base64,') !== false) {
                                $parts = explode(';base64,', $content);
                                $base64Content = $parts[1];
                            } else {
                                $base64Content = base64_encode($content);
                            }
                        }
                        
                        if ($base64Content !== null) {
                            $allFiles[] = [
                                'name' => $baseFile['filename'],
                                'type' => $baseFile['mime'] ?: 'application/octet-stream',
                                'mimeType' => $baseFile['mime'] ?: 'application/octet-stream',
                                'size' => (int)$baseFile['size_bytes'],
                                'content' => $base64Content
                            ];
                        }
                    }
                }
            } catch (Throwable $e) {
                error_log("[SUBMIT_ANALYSIS_LOAD_BASE_FILE_ERROR] ItemId: $actualItemId, Error: " . $e->getMessage());
            }
        }

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

        $step = 'WORKER_DISPATCH';
        $customLogFile = sys_get_temp_dir() . '/dachser_worker_sea_' . $runId . '.log';
        if (file_exists($customLogFile)) {
            @unlink($customLogFile);
        }
        $dispatchResult = runPHPBackground(dirname(__DIR__) . '/background_worker.php', [$jobFile], 'SEA', $customLogFile);

        if (!($dispatchResult['success'] ?? false)) {
            // Worker não iniciou — marca a análise como failed imediatamente em vez de
            // deixá-la presa em 'pendente' (10%) indefinidamente.
            $dispatchErr = json_encode([
                'success' => false,
                'error' => 'O processo em segundo plano (worker) não pôde ser iniciado (falha no dispatch).',
                'errorCode' => 'SEA_WORKER_DISPATCH_FAILED',
                'stage' => 'WORKER_DISPATCH',
                'requestId' => $requestId,
                'dispatchMethod' => $dispatchResult['method'] ?? 'unknown',
            ]);
            seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ?, completed_at = NOW() WHERE id = ?", [$dispatchErr, $runId]);
            if ($actualItemId) seaQuery("UPDATE dados_dachser.t_sea_items SET status = 'erro' WHERE id = ?", [$actualItemId]);
            @unlink($jobFile);
            error_log("[SEA_WORKER_DISPATCH_FAILED] analysisId=$runId requestId=$requestId method=" . ($dispatchResult['method'] ?? 'unknown') . " error=" . ($dispatchResult['error'] ?? 'unknown'));
            sendJson([
                'success' => false,
                'analysisId' => (string)$runId,
                'runId' => $runId,
                'itemId' => $actualItemId,
                'status' => 'erro',
                'code' => 'SEA_WORKER_DISPATCH_FAILED',
                'errorCode' => 'SEA_WORKER_DISPATCH_FAILED',
                'stage' => 'WORKER_DISPATCH',
                'error' => 'Não foi possível iniciar o processamento em segundo plano.',
                'requestId' => $requestId,
            ], 500);
            return;
        }

        error_log("[SEA_WORKER_DISPATCH_SUCCEEDED] analysisId=$runId requestId=$requestId method=" . ($dispatchResult['method'] ?? 'unknown') . " pid=" . ($dispatchResult['pid'] ?? 'n/a'));

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
    } catch (Throwable $e) {
        error_log("[ANALYSIS_FAILED] [RequestId: $requestId] [Step: $step] Error: " . $e->getMessage());
        sendJson([
            'success' => false,
            'code' => 'SEA_AI_REQUEST_FAILED',
            'error' => 'Não foi possível processar os documentos. Erro: ' . $e->getMessage() . ' (Etapa: ' . $step . ')',
            'message' => 'Não foi possível processar os documentos.',
            'technicalMessage' => $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine(),
            'requestId' => $requestId,
            'step' => $step
        ], 500);
    }
});

function logSeaStatusStep($analysisId, $requestId, $stage, $extra = []) {
    $log = array_merge([
        'analysis_id' => $analysisId,
        'user_id' => null,
        'tenant_id' => null,
        'request_id' => $requestId,
        'stage' => $stage,
        'timestamp' => date('Y-m-d H:i:s'),
        'microtime' => microtime(true)
    ], $extra);
    error_log("[SEA_LOG] " . json_encode($log));
}

// GET /api/sea/maritimo/analysis/:id
$router->get('sea/maritimo/analysis/:id', function($params) {
    $startTime = microtime(true);
    $requestId = uniqid('sea_get_');
    $analysisId = $params['id'] ?? null;
    
    logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_REQUEST_RECEIVED');
    
    try {
        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_AUTH_VALIDATED');
        
        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_ANALYSIS_QUERY_STARTED');
        $rows = seaQuery("SELECT id, status, result_text, result_json, created_at, started_at, completed_at, NOW() as db_now FROM dados_dachser.t_sea_runs WHERE id = ? LIMIT 1", [$analysisId]);

        $run = isset($rows[0]) ? $rows[0] : null;
        if (!$run) {
            logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_FAILED', [
                'error_code' => 'SEA_ANALYSIS_NOT_FOUND',
                'mensagem_tecnica' => 'Análise não encontrada'
            ]);
            sendJson([
                'success' => false,
                'code' => 'SEA_ANALYSIS_NOT_FOUND',
                'message' => 'Análise não encontrada.'
            ], 404);
            return;
        }

        // Watchdog: não deixa a análise presa indefinidamente em 'pendente' (worker nunca
        // assumiu) ou 'analisando' (IA travou). Usa NOW() do próprio banco (evita deadlock
        // de timezone entre app e DB). Baseado no mesmo padrão já usado no CHB.
        $dbNow = strtotime($run['db_now']);
        $createdAt = strtotime($run['created_at']);
        $elapsedSeconds = $dbNow - $createdAt;
        $dispatchTimeoutSeconds = 45;
        // 750s (era 600s): a run 1138 real errou aos 618s — ou seja, o pior caso
        // teórico da pipeline (300s paralelo Claude/Gemini + até 300s de
        // arbitragem = 600s) já estava sendo atingido de verdade, mais uma folga
        // de overhead real (rede, prompt grande de 37+ exportadores). Isso não é
        // "aumentar timeout sem achar a causa" — a causa (soma dos timeouts
        // nominais dos 2 estágios) está identificada; a folga é para não matar
        // runs legítimas bem na borda enquanto SEA_AI_ARBITRATION_SKIPPED (que já
        // evita a arbitragem span quando só uma IA responde) reduz o caso comum.
        $processingTimeoutSeconds = 750;

        if ($run['status'] === 'pendente' && $elapsedSeconds > $dispatchTimeoutSeconds) {
            $customLogFile = sys_get_temp_dir() . '/dachser_worker_sea_' . $analysisId . '.log';
            $logContent = '';
            if (file_exists($customLogFile)) {
                $logContent = @file_get_contents($customLogFile);
            }
            
            $workerBooted = false;
            $lastStep = 'Nenhum log gravado. O processo PHP CLI sequer iniciou.';
            
            if ($logContent) {
                if (strpos($logContent, 'SEA_WORKER_BOOT') !== false) {
                    $workerBooted = true;
                    $lastStep = 'Processo CLI iniciado (SEA_WORKER_BOOT)';
                }
                if (strpos($logContent, 'SEA_WORKER_ARGUMENT_RECEIVED') !== false) {
                    $lastStep = 'Argumentos do job recebidos';
                }
                if (strpos($logContent, 'SEA_WORKER_DATABASE_CONNECTED') !== false) {
                    $lastStep = 'Conectado ao banco de dados';
                }
                if (strpos($logContent, 'SEA_WORKER_RUN_FOUND') !== false) {
                    $lastStep = 'Registro da análise encontrado no banco';
                }
                if (strpos($logContent, 'SEA_WORKER_STATUS_PROCESSING') !== false) {
                    $lastStep = 'Processamento da análise iniciado';
                }
                if (preg_match('/(Fatal error|Parse error|Exception|Throwable): (.*)/i', $logContent, $matches)) {
                    $lastStep .= ' | Erro CLI fatal: ' . trim($matches[0]);
                }
            }

            $errorPayload = json_encode([
                'success' => false,
                'error' => 'O worker de processamento não assumiu a análise a tempo.',
                'errorCode' => 'SEA_WORKER_NOT_STARTED',
                'stage' => 'WAITING_FOR_WORKER',
                'requestId' => $requestId,
                'elapsedMs' => $elapsedSeconds * 1000,
                'workerBooted' => $workerBooted,
                'lastStep' => $lastStep,
                'workerLog' => $logContent ? substr($logContent, -2000) : 'Sem log do worker.'
            ]);
            seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ?, completed_at = NOW() WHERE id = ?", [$errorPayload, $analysisId]);
            $run['status'] = 'erro';
            $run['result_text'] = $errorPayload;
            logSeaStatusStep($analysisId, $requestId, 'SEA_RUN_FAILED', ['error_code' => 'SEA_WORKER_NOT_STARTED', 'stage' => 'WAITING_FOR_WORKER', 'elapsedSeconds' => $elapsedSeconds]);
        } elseif ($run['status'] === 'analisando' && $elapsedSeconds > $processingTimeoutSeconds) {
            $errorPayload = json_encode([
                'success' => false,
                'error' => 'A análise demorou mais que o esperado. O processamento foi interrompido.',
                'errorCode' => 'SEA_AI_REQUEST_TIMEOUT',
                'stage' => 'AI_REQUEST',
                'requestId' => $requestId,
                'elapsedMs' => $elapsedSeconds * 1000,
            ]);
            seaQuery("UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ?, completed_at = NOW() WHERE id = ?", [$errorPayload, $analysisId]);
            $run['status'] = 'erro';
            $run['result_text'] = $errorPayload;
            logSeaStatusStep($analysisId, $requestId, 'SEA_RUN_FAILED', ['error_code' => 'SEA_AI_REQUEST_TIMEOUT', 'stage' => 'AI_REQUEST', 'elapsedSeconds' => $elapsedSeconds]);
        }

        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_ANALYSIS_FOUND', [
            'status' => $run['status']
        ]);

        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_RELATIONS_LOADED');

        $resultData = null;
        try {
            $resultData = $run['result_json'] ? json_decode($run['result_json'], true) : null;
        } catch (Throwable $ex) {}
        
        $progressMap = [
            'pendente' => [10, 'Na fila...'],
            'analisando' => [60, 'Processando com IA...'],
            'realizado' => [100, 'Concluído!'],
            'completed' => [100, 'Concluído!'],
            'erro' => [100, 'Erro na análise'],
            'error' => [100, 'Erro na análise']
        ];
        
        $progress = isset($progressMap[$run['status']]) ? $progressMap[$run['status']] : [25, 'Processando...'];
        
        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_RESPONSE_BUILT', [
            'status' => $run['status'],
            'duracao' => round(microtime(true) - $startTime, 4)
        ]);
        
        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_RESPONSE_SENT');

        $errorMessage = null;
        $errorCode = null;
        $errorStage = null;
        if ($run['status'] === 'erro' || $run['status'] === 'error') {
            $errorJson = null;
            try { $errorJson = $run['result_text'] ? json_decode($run['result_text'], true) : null; } catch (Throwable $ex) {}
            if (is_array($errorJson) && isset($errorJson['error'])) {
                $errorMessage = $errorJson['error'];
                $errorCode = $errorJson['errorCode'] ?? null;
                $errorStage = $errorJson['stage'] ?? null;
            } else {
                $errorMessage = $run['result_text'];
            }
        }

        sendJson([
            'success' => true,
            'analysis' => [
                'id' => (string)$run['id'],
                'status' => $run['status'],
                'progress_percent' => $progress[0],
                'progress_step' => $progress[1],
                'progress_message' => $progress[1],
                'result_text' => $run['result_text'],
                'result_data' => $resultData,
                'error_message' => $errorMessage,
                'error_code' => $errorCode,
                'stage' => $errorStage,
                'backendVersion' => BACKEND_API_VERSION,
            ]
        ]);
    } catch (Throwable $e) {
        logSeaStatusStep($analysisId, $requestId, 'SEA_STATUS_FAILED', [
            'error_code' => 'SEA_STATUS_QUERY_ERROR',
            'mensagem_tecnica' => $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine(),
            'duracao' => round(microtime(true) - $startTime, 4)
        ]);
        sendJson([
            'success' => false,
            'code' => 'SEA_STATUS_QUERY_ERROR',
            'message' => 'Erro interno ao consultar o status da análise.',
            'error' => $e->getMessage(),
            'technicalMessage' => $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine(),
            'requestId' => $requestId
        ], 500);
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

// GET /api/sea/diagnostic
$router->get('sea/diagnostic', function($params) {
    try {
        $disabled = ini_get('disable_functions');
        $diagnostics = [
            'php_sapi' => PHP_SAPI,
            'php_binary' => defined('PHP_BINARY') ? PHP_BINARY : 'unknown',
            'disable_functions' => $disabled,
            'exec_exists' => function_exists('exec'),
            'shell_exec_exists' => function_exists('shell_exec'),
            'system_exists' => function_exists('system'),
            'proc_open_exists' => function_exists('proc_open'),
            'temp_dir' => sys_get_temp_dir(),
            'env_vars' => [
                'GEMINI_API_KEY_exists' => isset($_ENV['GEMINI_API_KEY']),
                'GEMINI_API_KEY_empty' => empty($_ENV['GEMINI_API_KEY']),
                'GEMINI_API_KEY_length' => isset($_ENV['GEMINI_API_KEY']) ? strlen($_ENV['GEMINI_API_KEY']) : 0,
            ],
            'files' => []
        ];

        // Scan temp dir
        $tempDir = sys_get_temp_dir();
        if (is_dir($tempDir)) {
            $files = scandir($tempDir);
            foreach ($files as $file) {
                if (str_starts_with($file, 'dachser_worker_') || str_starts_with($file, 'dachser_analysis_job_')) {
                    $filePath = $tempDir . '/' . $file;
                    $content = @file_get_contents($filePath);
                    $diagnostics['files'][] = [
                        'name' => $file,
                        'size' => @filesize($filePath),
                        'mtime' => date('Y-m-d H:i:s', @filemtime($filePath)),
                        'content' => $content
                    ];
                }
            }
        }
        sendJson(['success' => true, 'diagnostics' => $diagnostics]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});
