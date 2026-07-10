<?php
// api/routes/chb.php
// Rotas do módulo CHB (Conferência HBL): /api/chb/*

global $router;

function opsQuery($sql, $params = []) {
    return queryWithRetry(getOpsPDO(), $sql, $params);
}

function parseMaybeJson($value, $fallback) {
    if ($value === null) return $fallback;
    if (!is_string($value)) return $value;
    $decoded = json_decode($value, true);
    return ($decoded !== null) ? $decoded : $fallback;
}

function normalizeChbConfig($row) {
    if (!$row) return null;
    $row['campos_obrigatorios'] = parseMaybeJson($row['campos_obrigatorios'], []);
    $row['regras_comparacao']   = parseMaybeJson($row['regras_comparacao'], []);
    return $row;
}

function getUserIdFromBody($body) {
    $userId = isset($body['userId']) ? $body['userId'] : (isset($body['user_id']) ? $body['user_id'] : null);
    return $userId !== null ? (int)$userId : null;
}

function detectDocumentType($filename) {
    $n = strtolower($filename ?: '');
    if (strpos($n, 'cct') !== false || strpos($n, 'conhecimento') !== false) return 'CCT';
    if (strpos($n, 'hawb') !== false || strpos($n, 'house') !== false)       return 'HAWB';
    if (strpos($n, 'mawb') !== false || strpos($n, 'master') !== false)      return 'MAWB';
    if (strpos($n, 'invoice') !== false || strpos($n, 'fatura') !== false)   return 'Invoice';
    if (strpos($n, 'packing') !== false || strpos($n, 'romaneio') !== false) return 'PackingList';
    if (strpos($n, 'bl') !== false || strpos($n, 'bill') !== false)          return 'BL';
    if (strpos($n, 'ce') !== false || strpos($n, 'mercante') !== false)      return 'CE_Mercante';
    if (strpos($n, 'di') !== false || strpos($n, 'declaracao') !== false)    return 'DI';
    return 'Outros';
}

function callGeminiChb($prompt, $model = null, $maxTokens = 8000, $temperature = 0.1) {
    $key = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
    if (!$key) throw new Exception('GEMINI_API_KEY não configurada');
    if (!$model) $model = isset($_ENV['CHB_GEMINI_MODEL']) ? $_ENV['CHB_GEMINI_MODEL'] : 'gemini-2.5-pro';

    $res = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
        'method' => 'POST',
        'headers' => ['Authorization' => "Bearer $key", 'Content-Type' => 'application/json'],
        'body' => json_encode([
            'model' => $model,
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'max_tokens' => $maxTokens,
            'temperature' => $temperature,
        ])
    ]);

    if (!$res['ok']) {
        throw new Exception("Gemini error {$res['status']}: " . substr($res['body'], 0, 300));
    }
    $json = $res['json']();
    return isset($json['choices'][0]['message']['content']) ? $json['choices'][0]['message']['content'] : '';
}

function locateValueInFile($filename, $fieldName, $correctedValue, $fileContent) {
    $prompt = "Você é um especialista em análise de documentos de comércio exterior.
TAREFA: Localizar onde o valor \"$correctedValue\" aparece no arquivo \"$filename\" para o campo \"$fieldName\".
CONTEÚDO DO ARQUIVO: " . substr($fileContent, 0, 50000) . "
INSTRUÇÕES:
1. Procure o valor exato \"$correctedValue\" no conteúdo
2. Se encontrar, identifique a localização (página, seção, tabela)
3. Extraia o contexto ao redor (texto antes e depois)
4. Avalie a confiança da localização
RETORNE APENAS JSON no formato:
{\"found\":true/false,\"location\":\"Página X, seção Y\",\"context\":\"...texto antes... [VALOR] ...texto depois...\",\"confidence\":\"alta\"|\"media\"|\"baixa\"}";

    try {
        $content = callGeminiChb($prompt, null, 8000, 0.1);
        if (preg_match('/\{[\s\S]*\}/', $content, $match)) {
            $parsed = json_decode($match[0], true);
            return [
                'found'      => isset($parsed['found']) ? (bool)$parsed['found'] : false,
                'location'   => $parsed['location'] ?? 'Não localizado',
                'context'    => $parsed['context'] ?? '',
                'confidence' => $parsed['confidence'] ?? 'baixa',
            ];
        }
    } catch (Exception $err) {
        error_log('[chb] locateValueInFile error: ' . $err->getMessage());
    }
    return ['found' => false, 'location' => 'Erro ao localizar', 'context' => '', 'confidence' => 'baixa'];
}

function reextractFieldWithContext($filename, $fieldName, $correctedValue, $fileContent) {
    $prompt = "TAREFA DE EXTRAÇÃO PRECISA
Você é um especialista em documentos de comércio exterior.
OBJETIVO: Encontrar EXATAMENTE onde o valor \"$correctedValue\" aparece para o campo \"$fieldName\" no arquivo \"$filename\".
CONTEÚDO COMPLETO DO DOCUMENTO: $fileContent
RESPONDA EXATAMENTE no formato JSON:
{\"found\":true,\"location\":\"descrição\",\"pattern\":\"padrão\",\"extractionHint\":\"dica\",\"nearbyText\":\"texto próximo\",\"confidence\":\"alta\",\"isCalculated\":false,\"calculationFormula\":null,\"processingInstruction\":null}";

    try {
        $content = callGeminiChb($prompt, null, 16000, 0.1);
        if (preg_match('/\{[\s\S]*\}/', $content, $match)) {
            $p = json_decode($match[0], true);
            return [
                'success' => true, 'found' => $p['found'] ?? false,
                'location' => $p['location'] ?? '', 'pattern' => $p['pattern'] ?? '',
                'extractionHint' => $p['extractionHint'] ?? '', 'nearbyText' => $p['nearbyText'] ?? '',
                'confidence' => $p['confidence'] ?? 'baixa', 'isCalculated' => $p['isCalculated'] ?? false,
                'calculationFormula' => $p['calculationFormula'] ?? null,
                'processingInstruction' => $p['processingInstruction'] ?? null,
            ];
        }
    } catch (Exception $err) {
        error_log('[chb] reextractFieldWithContext error: ' . $err->getMessage());
    }
    return ['success' => false, 'found' => false, 'location' => '', 'pattern' => '', 'extractionHint' => '', 'nearbyText' => '', 'confidence' => 'baixa', 'isCalculated' => false, 'calculationFormula' => null, 'processingInstruction' => null];
}

function saveChbExtractionRule($fieldName, $documentType, $pattern, $extractionHint, $exampleValue, $processingInstruction) {
    try {
        $existing = opsQuery(
            'SELECT id, times_used, success_rate, processing_instruction FROM dados_dachser.t_chb_extraction_rules WHERE field_name = ? AND document_type = ? LIMIT 1',
            [$fieldName, $documentType]
        );
        if ($existing && count($existing) > 0) {
            $rule = $existing[0];
            $newTimesUsed   = ((int)$rule['times_used'] ?: 0) + 1;
            $newSuccessRate = min(100, (((float)$rule['success_rate'] ?: 50) + 100) / 2);
            $effectiveInstruction = $processingInstruction ?: $rule['processing_instruction'];
            opsQuery(
                'UPDATE dados_dachser.t_chb_extraction_rules SET extraction_pattern=?,location_hint=?,example_value=?,times_used=?,success_rate=?,processing_instruction=?,updated_at=NOW() WHERE id=?',
                [$pattern, $extractionHint, $exampleValue, $newTimesUsed, $newSuccessRate, $effectiveInstruction, $rule['id']]
            );
        } else {
            opsQuery(
                'INSERT INTO dados_dachser.t_chb_extraction_rules (field_name, document_type, extraction_pattern, location_hint, example_value, times_used, success_rate, processing_instruction) VALUES (?, ?, ?, ?, ?, 1, 80.00, ?)',
                [$fieldName, $documentType, $pattern, $extractionHint, $exampleValue, $processingInstruction]
            );
        }
    } catch (Exception $err) {
        error_log('[chb] saveExtractionRule error: ' . $err->getMessage());
    }
}

function fetchDocContentFromDb($itemId, $filename) {
    $buildContent = function($rows) {
        if (!$rows || count($rows) === 0) return null;
        $parts = [];
        foreach ($rows as $r) {
            $raw = trim($r['raw_text'] ?? '');
            $fields = $r['extracted_fields'] ? (is_string($r['extracted_fields']) ? $r['extracted_fields'] : json_encode($r['extracted_fields'])) : '';
            $lines = [];
            if (isset($r['filename']) && $r['filename']) $lines[] = "=== Documento: {$r['filename']} ===";
            if ($raw) $lines[] = $raw;
            if ($fields) $lines[] = "--- Campos já extraídos ---\n$fields";
            $joined = implode("\n", $lines);
            if ($joined) $parts[] = $joined;
        }
        $joined = trim(implode("\n\n", $parts));
        return strlen($joined) > 0 ? $joined : null;
    };

    $rows = opsQuery('SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? AND filename = ? LIMIT 1', [$itemId, $filename]);
    $content = $buildContent($rows);
    if ($content) return $content;

    $tokens = array_filter(preg_split('/[\s_\-\.]+/', preg_replace('/\.[^.]+$/', '', $filename ?: '')), function($t) { return strlen($t) > 2; });
    if (count($tokens) > 0) {
        $likeClauses = implode(' AND ', array_fill(0, count($tokens), 'LOWER(filename) LIKE ?'));
        $params = array_merge([$itemId], array_map(function($t) { return "%" . strtolower($t) . "%"; }, array_values($tokens)));
        $rows = opsQuery("SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? AND ($likeClauses) ORDER BY updated_at DESC LIMIT 1", $params);
        $content = $buildContent($rows);
        if ($content) return $content;
    }

    $rows = opsQuery('SELECT filename, raw_text, extracted_fields FROM dados_dachser.t_chb_extracted_data WHERE item_id = ? ORDER BY updated_at DESC', [$itemId]);
    return $buildContent($rows);
}

function chbExtractHtmlAndTags($responseText, $stepId) {
    preg_match('/<<METADATA>>([\s\S]*?)<<END_METADATA>>/', $responseText, $metadataMatch);
    $metadata = $metadataMatch[1] ?? '';
    preg_match('/MODAL:\s*(SEA|AIR)/i', $metadata, $modalMatch);
    $modal = strtoupper($modalMatch[1] ?? 'SEA');
    preg_match('/CLIENTE:\s*([^\n]+)/i', $metadata, $clienteMatch);
    $cliente = trim($clienteMatch[1] ?? '');

    preg_match('/<<BEGIN_HTML>>([\s\S]*?)<<END_HTML>>/', $responseText, $htmlMatch);
    $html = trim($htmlMatch[1] ?? '');
    if (!$html) {
        preg_match('/<table[\s\S]*?<\/table>/i', $responseText, $tableMatch);
        preg_match('/<div class="observations-section">[\s\S]*?<\/div>/i', $responseText, $obsMatch);
        preg_match('/<div class="parecer-section">[\s\S]*?<\/div>/i', $responseText, $parecerMatch);
        preg_match('/<div class="actions-section">[\s\S]*?<\/div>/i', $responseText, $actionsMatch);
        $html = implode("\n", array_filter([$tableMatch[0] ?? '', $obsMatch[0] ?? '', $parecerMatch[0] ?? '', $actionsMatch[0] ?? '']));
    }
    if (!$html) $html = '<p>' . substr(htmlspecialchars($responseText ?? ''), 0, 8000) . '</p>';

    $criticalCount = substr_count($html, '🔴');
    $warningCount  = substr_count($html, '🟨');
    $okCount       = substr_count($html, '✅');
    $tags = [];
    if ($criticalCount > 0) $tags[] = ['type' => 'danger',  'label' => "$criticalCount crítico(s)"];
    if ($warningCount > 0)  $tags[] = ['type' => 'warning', 'label' => "$warningCount alerta(s)"];
    if ($okCount > 0)       $tags[] = ['type' => 'success', 'label' => ($criticalCount || $warningCount) ? "$okCount conforme(s)" : 'Documentos conformes'];

    $summary = $criticalCount > 0
        ? "$criticalCount divergência(s) crítica(s) encontrada(s)"
        : ($warningCount > 0 ? "$warningCount alerta(s) para verificação" : 'Documentos em conformidade');

    $stepNames = [1 => 'Pré-Alerta', 2 => 'Instrução', 3 => 'DI/Fechamento'];
    preg_match('/<div class="parecer-section">([\s\S]*?)<\/div>/i', $html, $parecerBodyMatch);
    $parecer = trim(preg_replace('/\s+/', ' ', strip_tags($parecerBodyMatch[1] ?? '')));

    $stepName = $stepNames[(int)$stepId] ?? "Etapa $stepId";
    return [
        'html' => $html, 'tags' => $tags, 'summary' => $summary, 'parecer' => $parecer,
        'modal' => $modal, 'cliente' => $cliente,
        'detailedSummary' => "$stepName: $criticalCount crítico(s), $warningCount alerta(s), $okCount conforme(s)",
    ];
}

function chbExtractExcelText($file) {
    try {
        $base64 = $file['content'] ?? $file['fileBase64'] ?? null;
        if (!$base64) return "[Arquivo Excel: {$file['name']}] - Sem conteúdo.";
        $rows = parseXlsxSimple($base64);
        $text = "[Arquivo Excel: {$file['name']}]\n\n";
        $count = 0;
        foreach ($rows as $row) {
            $line = implode(' | ', array_filter(array_map('trim', $row)));
            if ($line) { $text .= "$line\n"; $count++; }
            if ($count > 300) break;
        }
        return $text;
    } catch (Exception $err) {
        return "[Arquivo Excel: {$file['name']}] - Não foi possível extrair texto da planilha.";
    }
}

function chbBuildPrompt($stepId, $files, $clientConfig, $itemId) {
    $fileNames   = implode(', ', array_map(function($f) { return $f['name'] ?? 'arquivo'; }, $files));
    $configBlock = $clientConfig ? json_encode($clientConfig, JSON_PRETTY_PRINT) : 'Sem configuração específica de cliente.';
    $learnedContext = '';

    try {
        if ($itemId) {
            $corrections = opsQuery(
                'SELECT filename, field_name, corrected_value, location_reference, location_context, location_confidence
                 FROM dados_dachser.t_chb_user_corrections WHERE item_id = ? ORDER BY updated_at DESC',
                [$itemId]
            );
            if ($corrections && count($corrections) > 0) {
                $learnedContext .= "\nCORREÇÕES VALIDADAS PELO USUÁRIO (fonte de verdade):\n";
                foreach ($corrections as $corr) {
                    $learnedContext .= "- {$corr['filename']} | {$corr['field_name']}: {$corr['corrected_value']}";
                    if ($corr['location_reference']) $learnedContext .= " | localização: {$corr['location_reference']}";
                    if ($corr['location_context'])   $learnedContext .= " | contexto: {$corr['location_context']}";
                    $learnedContext .= "\n";
                }
            }
        }
    } catch (Exception $e) {}

    try {
        $rules = opsQuery(
            'SELECT field_name, document_type, extraction_pattern, location_hint, example_value, success_rate
             FROM dados_dachser.t_chb_extraction_rules WHERE times_used > 0 AND success_rate >= 50
             ORDER BY success_rate DESC, times_used DESC LIMIT 30'
        );
        if ($rules && count($rules) > 0) {
            $learnedContext .= "\nREGRAS DE EXTRAÇÃO APRENDIDAS:\n";
            foreach ($rules as $rule) {
                $learnedContext .= "- {$rule['field_name']} ({$rule['document_type']}): {$rule['extraction_pattern']} {$rule['location_hint']} Ex: {$rule['example_value']}\n";
            }
        }
    } catch (Exception $e) {}

    try {
        if ($itemId && (int)$stepId > 1) {
            $snapshots = opsQuery(
                'SELECT etapa, snapshot, approved_at FROM dados_dachser.t_chb_approved_snapshots WHERE item_id = ? AND etapa < ? ORDER BY etapa ASC',
                [$itemId, (string)$stepId]
            );
            if ($snapshots && count($snapshots) > 0) {
                $learnedContext .= "\nETAPAS ANTERIORES APROVADAS (ground truth):\n";
                foreach ($snapshots as $snap) {
                    $learnedContext .= "- Etapa {$snap['etapa']}, aprovada em {$snap['approved_at']}: " . substr((string)($snap['snapshot'] ?? ''), 0, 4000) . "\n";
                }
            }
        }
    } catch (Exception $e) {}

    $CAMPOS_POR_ETAPA = [
        1 => ['nome' => 'Pré-Alerta', 'campos' => ['CNPJ Consignee','Peso Bruto (kg)','Peso Líquido (kg)','Valor Mercadoria','Valor Total Frete','Moeda','Incoterm','NCM','Aeroporto Origem','Aeroporto Destino','Quantidade de Volumes','Tipo de Frete vs Incoterm'], 'instrucaoExtra' => 'Para "Tipo de Frete vs Incoterm": verifique se o Incoterm é compatível com o tipo de frete declarado.'],
        2 => ['nome' => 'Instrução',  'campos' => ['Peso Bruto (kg)','Peso Líquido (kg)','Valor Mercadoria','Valor Total Frete','Moeda','Incoterm','NCM','CNPJ Consignee','Aeroporto Origem','Aeroporto Destino','Quantidade de Volumes','Descrição das Mercadorias','Dimensões da Embalagem'], 'instrucaoExtra' => 'Para "Descrição das Mercadorias": compare a descrição entre AWB, invoice e packing list.'],
        3 => ['nome' => 'DI/Fechamento', 'campos' => ['Peso Bruto (kg)','Peso Líquido (kg)','Valor Mercadoria','Valor Total Frete','Moeda','Incoterm','NCM','CNPJ Consignee','Aeroporto Origem','Aeroporto Destino','Quantidade de Volumes','Tipo de Frete vs Incoterm'], 'instrucaoExtra' => 'Para "Tipo de Frete vs Incoterm": verifique se o Incoterm é compatível com o tipo de frete declarado.'],
    ];

    $etapaConfig = $CAMPOS_POR_ETAPA[(int)$stepId] ?? $CAMPOS_POR_ETAPA[1];
    $camposLista = implode("\n", array_map(function($c, $i) { return ($i+1) . ". $c"; }, $etapaConfig['campos'], array_keys($etapaConfig['campos'])));

    return "Você é um especialista em conferência documental CHB da DACHSER.

Etapa $stepId — {$etapaConfig['nome']}
Arquivos enviados: $fileNames
Configuração do cliente:
$configBlock
$learnedContext

CAMPOS OBRIGATÓRIOS A ANALISAR NESTA ETAPA:
$camposLista

Analise EXCLUSIVAMENTE os campos listados acima. Para cada campo, extraia o valor presente em CADA arquivo enviado e compare entre eles. {$etapaConfig['instrucaoExtra']}

Regras:
- Use o nome real de cada arquivo como coluna.
- Coloque cada valor somente na coluna do arquivo onde ele aparece.
- Use \"ND\" quando o campo não existir no arquivo.
- Correções validadas pelo usuário têm prioridade máxima.
- Aponte divergências críticas com 🔴, alertas com 🟨 e conformidades com ✅.
- Não invente valores.

Retorne obrigatoriamente:
<<METADATA>>
MODAL: SEA ou AIR
CLIENTE: nome do cliente/consignee identificado
<<END_METADATA>>

<<BEGIN_HTML>>
HTML simples contendo:
1. Uma tabela com colunas: Status, Campo, e uma coluna para cada arquivo.
2. Uma seção <div class=\"observations-section\"> quando houver alerta/crítico.
3. Uma seção <div class=\"parecer-section\"> com impedimento para registrar DI.
4. Uma seção <div class=\"actions-section\"> com próximas ações quando aplicável.
<<END_HTML>>";
}

function chbCallAnthropic($prompt, $files) {
    $key = isset($_ENV['CHB_ANTHROPIC_API_KEY']) ? $_ENV['CHB_ANTHROPIC_API_KEY'] : (isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null);
    if (!$key) throw new Exception('ANTHROPIC_API_KEY não configurada');

    $content = [];
    foreach ($files as $file) {
        $mime = $file['mimeType'] ?? $file['type'] ?? 'application/octet-stream';
        $fileContent = $file['content'] ?? $file['fileBase64'] ?? '';
        $name = $file['name'] ?? 'arquivo';

        if (strpos($mime, 'image/') === 0) {
            $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $fileContent]];
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name]"];
        } elseif ($mime === 'application/pdf') {
            $content[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $fileContent]];
            $content[] = ['type' => 'text', 'text' => "[Arquivo PDF: $name]"];
        } elseif (preg_match('/spreadsheet|excel/i', $mime) || preg_match('/\.(xlsx|xls)$/i', $name)) {
            $content[] = ['type' => 'text', 'text' => chbExtractExcelText($file)];
        } else {
            $text = '';
            try { $text = base64_decode($fileContent); } catch (Exception $e) {}
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name]\n" . ($text ?: 'Conteúdo binário não legível')];
        }
    }
    $content[] = ['type' => 'text', 'text' => $prompt];

    $res = fetch('https://api.anthropic.com/v1/messages', [
        'method' => 'POST',
        'headers' => ['Content-Type' => 'application/json', 'x-api-key' => $key, 'anthropic-version' => '2023-06-01'],
        'body' => json_encode([
            'model' => isset($_ENV['CHB_ANTHROPIC_MODEL']) ? $_ENV['CHB_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
            'max_tokens' => 64000,
            'temperature' => 0,
            'messages' => [['role' => 'user', 'content' => $content]],
        ])
    ]);

    if (!$res['ok']) {
        $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
        $curlError = isset($res['error']) ? $res['error'] : 'N/A';
        error_log("[Anthropic CHB] Error HTTP {$res['status']}: {$errorDetail} | cURL: {$curlError}");
        throw new Exception("API ANTHROPIC - ERRO AO EXTRAIR O ARQUIVO. Status {$res['status']}: {$errorDetail}");
    }
    $data = $res['json']();
    foreach (($data['content'] ?? []) as $c) {
        if ($c['type'] === 'text') return $c['text'];
    }
    return '';
}

function chbCallGeminiVision($prompt, $files) {
    $key = isset($_ENV['GEMINI_API_KEY']) ? $_ENV['GEMINI_API_KEY'] : null;
    if (!$key) throw new Exception('GEMINI_API_KEY não configurada');

    $content = [];
    foreach ($files as $file) {
        $mime = $file['mimeType'] ?? $file['type'] ?? 'application/octet-stream';
        $fileContent = $file['content'] ?? $file['fileBase64'] ?? '';
        $name = $file['name'] ?? 'arquivo';

        if ($mime === 'application/pdf' || strpos($mime, 'image/') === 0) {
            $content[] = ['type' => 'image_url', 'image_url' => ['url' => "data:$mime;base64,$fileContent"]];
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name]"];
        } elseif (preg_match('/spreadsheet|excel/i', $mime) || preg_match('/\.(xlsx|xls)$/i', $name)) {
            $content[] = ['type' => 'text', 'text' => chbExtractExcelText($file)];
        } else {
            $text = '';
            try { $text = base64_decode($fileContent); } catch (Exception $e) {}
            $content[] = ['type' => 'text', 'text' => "[Arquivo: $name]\n" . ($text ?: 'Conteúdo binário não legível')];
        }
    }
    $content[] = ['type' => 'text', 'text' => $prompt];

    $res = fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', [
        'method' => 'POST',
        'headers' => ['Authorization' => "Bearer $key", 'Content-Type' => 'application/json'],
        'body' => json_encode([
            'model' => isset($_ENV['CHB_GEMINI_MODEL']) ? $_ENV['CHB_GEMINI_MODEL'] : 'gemini-2.5-pro',
            'messages' => [['role' => 'user', 'content' => $content]],
            'max_tokens' => 65536,
            'temperature' => 0.1,
        ])
    ]);

    if (!$res['ok']) {
        $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
        $curlError = isset($res['error']) ? $res['error'] : 'N/A';
        error_log("[Gemini CHB] Error HTTP {$res['status']}: {$errorDetail} | cURL: {$curlError}");
        throw new Exception("API GEMINI - ERRO AO EXTRAIR O ARQUIVO. Status {$res['status']}: {$errorDetail}");
    }
    $data = $res['json']();
    return $data['choices'][0]['message']['content'] ?? '';
}

function logChbStep($runId, $itemId, $requestId, $stage, $extra = []) {
    $log = array_merge([
        'analysis_request_id' => $runId,
        'conference_id' => $itemId,
        'request_id' => $requestId,
        'etapa_logs' => $stage,
        'timestamp' => date('Y-m-d H:i:s'),
        'microtime' => microtime(true),
    ], $extra);
    error_log("[CHB_LOG] " . json_encode($log));
}

function chbProcessAnalysis($runId, $stepId, $files, $clientConfig, $itemId) {
    $startTime = microtime(true);
    $requestId = uniqid('chb_');
    $filesCount = is_array($files) ? count($files) : 0;
    
    logChbStep($runId, $itemId, $requestId, 'CHB_REQUEST_PICKED_BY_WORKER', [
        'quantidade_arquivos' => $filesCount
    ]);
    
    try {
        logChbStep($runId, $itemId, $requestId, 'CHB_STATUS_PROCESSING');
        opsQuery("UPDATE dados_dachser.t_chb_runs SET status = 'processing' WHERE id = ?", [$runId]);
        
        logChbStep($runId, $itemId, $requestId, 'CHB_FILES_LOADING');
        logChbStep($runId, $itemId, $requestId, 'CHB_FILES_LOADED', [
            'quantidade_arquivos' => $filesCount
        ]);
        
        logChbStep($runId, $itemId, $requestId, 'CHB_DOCUMENT_EXTRACTION_STARTED');
        $prompt = chbBuildPrompt($stepId, $files, $clientConfig, $itemId);
        logChbStep($runId, $itemId, $requestId, 'CHB_DOCUMENT_EXTRACTION_COMPLETED');
        
        logChbStep($runId, $itemId, $requestId, 'CHB_AI_REQUEST_STARTED');
        $responseText = '';
        $usedFallback = false;
        $aiStartTime = microtime(true);
        try {
            $responseText = chbCallAnthropic($prompt, $files);
            logChbStep($runId, $itemId, $requestId, 'CHB_AI_RESPONSE_RECEIVED', [
                'provider' => 'Anthropic',
                'duracao' => round(microtime(true) - $aiStartTime, 2)
            ]);
        } catch (Throwable $anthropicErr) {
            error_log('[chb analyze] Anthropic failed, trying Gemini: ' . $anthropicErr->getMessage());
            $usedFallback = true;
            $responseText = chbCallGeminiVision($prompt, $files);
            logChbStep($runId, $itemId, $requestId, 'CHB_AI_RESPONSE_RECEIVED', [
                'provider' => 'Gemini (Fallback)',
                'duracao' => round(microtime(true) - $aiStartTime, 2)
            ]);
        }

        logChbStep($runId, $itemId, $requestId, 'CHB_AI_RESPONSE_PARSED');
        $parsed = chbExtractHtmlAndTags($responseText, (int)$stepId);
        
        $resultData = array_merge(['id' => "chb-$runId", 'stepId' => $stepId], $parsed, [
            'generatedAt'   => date('d/m/Y H:i:s'),
            'filesAnalyzed' => array_map(function($f) { return $f['name'] ?? ''; }, $files),
            'usedFallback'  => $usedFallback,
        ]);

        logChbStep($runId, $itemId, $requestId, 'CHB_RESULT_SAVED');
        opsQuery(
            "UPDATE dados_dachser.t_chb_runs SET status = 'completed', result_html = ?, result_json = ? WHERE id = ?",
            [json_encode($resultData), json_encode($resultData), $runId]
        );
        
        logChbStep($runId, $itemId, $requestId, 'CHB_STATUS_COMPLETED', [
            'duracao_total' => round(microtime(true) - $startTime, 2)
        ]);
    } catch (Throwable $err) {
        logChbStep($runId, $itemId, $requestId, 'CHB_ANALYSIS_FAILED', [
            'codigo_erro' => 'CHB_PROCESSING_ERROR',
            'mensagem_tecnica' => $err->getMessage() . " in " . $err->getFile() . " on line " . $err->getLine(),
            'duracao' => round(microtime(true) - $startTime, 2)
        ]);
        try {
            $errorPayload = json_encode([
                'success' => false,
                'error' => 'Erro no processamento da conferência: ' . $err->getMessage(),
                'technicalMessage' => $err->getMessage() . " in " . $err->getFile() . " on line " . $err->getLine(),
                'requestId' => $requestId
            ]);
            opsQuery("UPDATE dados_dachser.t_chb_runs SET status = 'error', result_text = ? WHERE id = ?", [$errorPayload, $runId]);
        } catch (Throwable $updateErr) {}
    }
}

// ── ROTAS CHB ────────────────────────────────────────────────────────────────

// GET /api/chb/items
$router->get('chb/items', function($params) {
    try {
        $items = opsQuery("
            SELECT i.*,
              (SELECT MAX(r.created_at) FROM dados_dachser.t_chb_runs r WHERE r.item_id = i.id) AS last_run_at
            FROM dados_dachser.t_chb_items i
            WHERE i.active = 1
            ORDER BY i.created_at DESC
        ");
        sendJson(['success' => true, 'data' => $items ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/items
$router->post('chb/items', function($params) {
    try {
        $body = getRequestBody();
        $result = opsQuery(
            "INSERT INTO dados_dachser.t_chb_items
             (reference, consignee, status_macro, step1_status, step2_status, step3_status, active, created_by)
             VALUES (?, ?, 'pre_alerta_pendente', 'pendente', 'pendente', 'pendente', 1, ?)",
            [$body['reference'] ?? null, $body['consignee'] ?? null, getUserIdFromBody($body)]
        );
        sendJson(['success' => true, 'id' => $result['insertId']]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/chb/items/:id
$router->patch('chb/items/:id', function($params) {
    try {
        $id = $params['id'];
        $body = getRequestBody();
        $allowed = ['status_macro', 'step1_status', 'step2_status', 'step3_status', 'consignee', 'modal'];
        $fields = []; $values = [];
        foreach ($allowed as $key) {
            if (isset($body[$key])) { $fields[] = "$key = ?"; $values[] = $body[$key] ?? null; }
        }
        if (count($fields) > 0) {
            $values[] = $id;
            try {
                opsQuery("UPDATE dados_dachser.t_chb_items SET " . implode(', ', $fields) . " WHERE id = ?", $values);
            } catch (Exception $err) {
                // Retry sem modal
                if (strpos(strtolower($err->getMessage()), 'modal') !== false) {
                    $fields2 = []; $values2 = [];
                    foreach (['status_macro', 'step1_status', 'step2_status', 'step3_status', 'consignee'] as $key) {
                        if (isset($body[$key])) { $fields2[] = "$key = ?"; $values2[] = $body[$key] ?? null; }
                    }
                    if (count($fields2) > 0) {
                        $values2[] = $id;
                        opsQuery("UPDATE dados_dachser.t_chb_items SET " . implode(', ', $fields2) . " WHERE id = ?", $values2);
                    }
                } else throw $err;
            }
        }
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/chb/items/:id
$router->delete('chb/items/:id', function($params) {
    try {
        opsQuery("UPDATE dados_dachser.t_chb_items SET active = 0 WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/items/:id/files
$router->get('chb/items/:id/files', function($params) {
    try {
        $files = opsQuery("
            SELECT f.id, f.filename, f.mime, f.size_bytes, f.sha256, f.rel_path, f.url, f.created_at, f.created_by,
                   d.etapa, d.doc_role, d.is_active AS doc_active
            FROM dados_dachser.t_chb_files f
            INNER JOIN dados_dachser.t_chb_docs d ON d.file_id = f.id
            WHERE d.item_id = ? AND d.is_active = 1
            ORDER BY d.etapa, f.created_at
        ", [$params['id']]);
        sendJson(['success' => true, 'data' => $files ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/items/:id/docs
$router->get('chb/items/:id/docs', function($params) {
    try {
        $docs = opsQuery(
            "SELECT d.id, d.doc_role, d.created_at, f.id AS file_id, f.filename, f.url AS file_url, f.size_bytes AS file_size, d.etapa
             FROM dados_dachser.t_chb_docs d
             JOIN dados_dachser.t_chb_files f ON d.file_id = f.id
             WHERE d.item_id = ? AND d.is_active = 1
             ORDER BY d.created_at ASC",
            [$params['id']]
        );
        sendJson(['success' => true, 'rows' => $docs ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/items/:id/files
$router->post('chb/items/:id/files', function($params) {
    try {
        $body = getRequestBody();
        $filename = $body['filename'] ?? null;
        $mime = $body['mime'] ?? null;
        $sizeBytes = $body['sizeBytes'] ?? null;
        $sha256 = $body['sha256'] ?? null;
        $relPath = $body['relPath'] ?? '';
        $url = $body['url'] ?? '';
        $etapa = $body['etapa'] ?? '1';
        $docRole = $body['docRole'] ?? 'O';
        $fileBase64Raw = $body['fileBase64'] ?? null;

        $pdo = getOpsPDO();
        $fileId = null;

        if ($fileBase64Raw) {
            // remove data URL prefix if present
            $cleanBase64 = preg_replace('/^data:[^;]+;base64,/', '', (string)$fileBase64Raw);
            $buffer = base64_decode($cleanBase64);
            $sizeBytes = strlen($buffer);

            // Ensure column exists
            try { opsQuery("ALTER TABLE dados_dachser.t_chb_files ADD COLUMN IF NOT EXISTS file_content LONGBLOB NULL"); } catch (Exception $e) {}

            $stmt = $pdo->prepare("INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$filename, $mime, $sizeBytes, $sha256, $relPath, $url, getUserIdFromBody($body), $buffer]);
            $fileId = $pdo->lastInsertId();

            $fileUrl = "/api/chb/files/$fileId/download";
            if (!$url) opsQuery("UPDATE dados_dachser.t_chb_files SET url = ? WHERE id = ?", [$fileUrl, $fileId]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$filename, $mime, $sizeBytes, $sha256, $relPath, $url, getUserIdFromBody($body)]);
            $fileId = $pdo->lastInsertId();
            $fileUrl = $url;
        }

        opsQuery(
            "INSERT INTO dados_dachser.t_chb_docs (item_id, file_id, etapa, doc_role, version, is_active, created_by) VALUES (?, ?, ?, ?, 1, 1, ?)",
            [$params['id'], $fileId, $etapa, trim((string)$docRole), getUserIdFromBody($body)]
        );

        sendJson(['success' => true, 'fileId' => (int)$fileId, 'fileUrl' => $fileUrl]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/items/:id/files/upload
$router->post('chb/items/:id/files/upload', function($params) {
    try {
        $uploadResult = handleFileUpload(isset($_FILES['file']) ? $_FILES['file'] : null, 'chb', [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            'text/csv'
        ]);
        if (!$uploadResult['success']) sendJson(['success' => false, 'error' => $uploadResult['error']], 400);

        $filename = $uploadResult['originalName'];
        $mime = $uploadResult['mime'];
        $sizeBytes = $uploadResult['size'];
        $buffer = file_get_contents($uploadResult['path']);

        $etapa = isset($_POST['etapa']) ? $_POST['etapa'] : '1';
        $docRole = isset($_POST['docRole']) ? $_POST['docRole'] : 'O';
        $userId = isset($_POST['userId']) ? (int)$_POST['userId'] : null;

        try { opsQuery("ALTER TABLE dados_dachser.t_chb_files ADD COLUMN IF NOT EXISTS file_content LONGBLOB NULL"); } catch (Exception $e) {}

        $pdo = getOpsPDO();
        $stmt = $pdo->prepare("INSERT INTO dados_dachser.t_chb_files (filename, mime, size_bytes, sha256, rel_path, url, created_by, file_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$filename, $mime, $sizeBytes, null, '', '', $userId, $buffer]);
        $fileId = $pdo->lastInsertId();

        $fileUrl = "/api/chb/files/$fileId/download";
        opsQuery("UPDATE dados_dachser.t_chb_files SET url = ? WHERE id = ?", [$fileUrl, $fileId]);
        opsQuery(
            "INSERT INTO dados_dachser.t_chb_docs (item_id, file_id, etapa, doc_role, version, is_active, created_by) VALUES (?, ?, ?, ?, 1, 1, ?)",
            [$params['id'], $fileId, $etapa, trim((string)$docRole), $userId]
        );

        sendJson(['success' => true, 'fileId' => (int)$fileId, 'fileUrl' => $fileUrl, 'sizeBytes' => $sizeBytes]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/files/:fileId/download
$router->get('chb/files/:fileId/download', function($params) {
    try {
        try { opsQuery("ALTER TABLE dados_dachser.t_chb_files ADD COLUMN IF NOT EXISTS file_content LONGBLOB NULL"); } catch (Exception $e) {}

        $rows = opsQuery("SELECT filename, mime, file_content FROM dados_dachser.t_chb_files WHERE id = ? LIMIT 1", [$params['fileId']]);
        $file = $rows[0] ?? null;
        if (!$file || !$file['file_content']) {
            sendJson(['success' => false, 'error' => 'Arquivo não encontrado'], 404);
        }
        header('Content-Type: ' . ($file['mime'] ?: 'application/octet-stream'));
        header('Content-Disposition: inline; filename="' . str_replace('"', '', $file['filename']) . '"');
        echo $file['file_content'];
        exit;
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/chb/items/:itemId/files/:fileId
$router->delete('chb/items/:itemId/files/:fileId', function($params) {
    try {
        opsQuery("UPDATE dados_dachser.t_chb_docs SET is_active = 0 WHERE file_id = ? AND item_id = ?", [$params['fileId'], $params['itemId']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/chb/docs/:docId
$router->delete('chb/docs/:docId', function($params) {
    try {
        opsQuery("DELETE FROM dados_dachser.t_chb_docs WHERE id = ?", [$params['docId']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/items/:id/runs
$router->get('chb/items/:id/runs', function($params) {
    try {
        $sqlParams = [$params['id']];
        $sql = "
            SELECT r.*, u.username AS created_by_name, u.email AS created_by_email
            FROM dados_dachser.t_chb_runs r
            LEFT JOIN dados_dachser.t_users_dachser u ON u.id = r.created_by
            WHERE r.item_id = ?
        ";
        if (isset($_GET['etapa'])) { $sql .= " AND r.etapa = ?"; $sqlParams[] = $_GET['etapa']; }
        $sql .= " ORDER BY r.created_at DESC";
        $runs = opsQuery($sql, $sqlParams);
        sendJson(['success' => true, 'data' => $runs ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/items/:id/runs
$router->post('chb/items/:id/runs', function($params) {
    try {
        $body = getRequestBody();
        $resultJson = $body['resultJson'] ?? null;
        $result = opsQuery(
            "INSERT INTO dados_dachser.t_chb_runs
             (item_id, etapa, status, result_text, result_html, result_json, used_as_ctx, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $params['id'],
                $body['etapa'] ?? '1',
                $body['status'] ?? 'completed',
                $body['resultText'] ?? null,
                $body['resultHtml'] ?? null,
                $resultJson !== null ? (is_string($resultJson) ? $resultJson : json_encode($resultJson)) : null,
                !empty($body['usedAsCtx']) ? 1 : 0,
                getUserIdFromBody($body)
            ]
        );
        sendJson(['success' => true, 'runId' => $result['insertId']]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/chb/runs/:runId
$router->patch('chb/runs/:runId', function($params) {
    try {
        $body = getRequestBody();
        $map = ['status' => 'status', 'resultText' => 'result_text', 'resultHtml' => 'result_html', 'resultJson' => 'result_json'];
        $fields = []; $values = [];
        foreach ($map as $bodyKey => $col) {
            if (isset($body[$bodyKey])) {
                $fields[] = "$col = ?";
                $v = $body[$bodyKey];
                $values[] = ($bodyKey === 'resultJson' && !is_string($v)) ? json_encode($v) : $v;
            }
        }
        if (count($fields) === 0) { sendJson(['success' => true]); }
        $values[] = $params['runId'];
        opsQuery("UPDATE dados_dachser.t_chb_runs SET " . implode(', ', $fields) . " WHERE id = ?", $values);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/client-configs
$router->get('chb/client-configs', function($params) {
    try {
        $rows = opsQuery("SELECT * FROM dados_dachser.t_chb_client_config WHERE ativo = 1 ORDER BY cliente_nome ASC");
        sendJson(['success' => true, 'data' => array_map('normalizeChbConfig', $rows ?: [])]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/client-configs/:cnpj
$router->get('chb/client-configs/:cnpj', function($params) {
    try {
        $rows = opsQuery("SELECT * FROM dados_dachser.t_chb_client_config WHERE cliente_cnpj = ? AND ativo = 1 LIMIT 1", [$params['cnpj']]);
        sendJson(['success' => true, 'data' => normalizeChbConfig($rows[0] ?? null)]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/client-configs
$router->post('chb/client-configs', function($params) {
    try {
        $body = getRequestBody();
        $c = $body;
        $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000, mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
        opsQuery(
            "INSERT INTO dados_dachser.t_chb_client_config
              (id, cliente_cnpj, cliente_nome, tolerancia_peso, tolerancia_valor,
               campos_obrigatorios, regras_comparacao, instrucoes_personalizadas,
               armador, agente_destino, contato_email, prazo_resposta_dias,
               porto_descarga_real, tolerancia_taxas_acessorias_abs, tolerancia_taxas_acessorias_pct,
               beneficio_fiscal, cfop_padrao, estado_uf, icms_diferido, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            [
                $id, $c['cliente_cnpj'] ?? null, $c['cliente_nome'] ?? null,
                $c['tolerancia_peso'] ?? 2.0, $c['tolerancia_valor'] ?? 1.0,
                json_encode($c['campos_obrigatorios'] ?? []), json_encode($c['regras_comparacao'] ?? []),
                $c['instrucoes_personalizadas'] ?? null, $c['armador'] ?? null, $c['agente_destino'] ?? null,
                $c['contato_email'] ?? null, $c['prazo_resposta_dias'] ?? 2, $c['porto_descarga_real'] ?? null,
                $c['tolerancia_taxas_acessorias_abs'] ?? 50, $c['tolerancia_taxas_acessorias_pct'] ?? 1.0,
                $c['beneficio_fiscal'] ?? null, $c['cfop_padrao'] ?? null, $c['estado_uf'] ?? null,
                !empty($c['icms_diferido']) ? 1 : 0,
            ]
        );
        sendJson(['success' => true, 'id' => $id]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// PATCH /api/chb/client-configs/:id
$router->patch('chb/client-configs/:id', function($params) {
    try {
        $body = getRequestBody();
        $allowed = ['cliente_cnpj','cliente_nome','tolerancia_peso','tolerancia_valor','campos_obrigatorios','regras_comparacao','instrucoes_personalizadas','armador','agente_destino','contato_email','prazo_resposta_dias','porto_descarga_real','tolerancia_taxas_acessorias_abs','tolerancia_taxas_acessorias_pct','beneficio_fiscal','cfop_padrao','estado_uf','icms_diferido','ativo'];
        $fields = []; $values = [];
        foreach ($allowed as $key) {
            if (isset($body[$key])) {
                $fields[] = "$key = ?";
                if (in_array($key, ['campos_obrigatorios', 'regras_comparacao'])) {
                    $values[] = json_encode($body[$key]);
                } elseif ($key === 'icms_diferido' || $key === 'ativo') {
                    $values[] = $body[$key] ? 1 : 0;
                } else {
                    $values[] = $body[$key];
                }
            }
        }
        if (count($fields) > 0) {
            $fields[] = 'updated_at = NOW()';
            $values[] = $params['id'];
            opsQuery("UPDATE dados_dachser.t_chb_client_config SET " . implode(', ', $fields) . " WHERE id = ?", $values);
        }
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// DELETE /api/chb/client-configs/:id
$router->delete('chb/client-configs/:id', function($params) {
    try {
        opsQuery("UPDATE dados_dachser.t_chb_client_config SET ativo = 0, updated_at = NOW() WHERE id = ?", [$params['id']]);
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/approved-snapshots
$router->post('chb/approved-snapshots', function($params) {
    try {
        $body = getRequestBody();
        $snapshot = $body['snapshot'] ?? null;
        $summary  = $body['summary'] ?? null;
        opsQuery(
            "INSERT INTO dados_dachser.t_chb_approved_snapshots
               (item_id, etapa, run_id, snapshot, result_html, summary, approved_by, approved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               run_id = VALUES(run_id), snapshot = VALUES(snapshot), result_html = VALUES(result_html),
               summary = VALUES(summary), approved_by = VALUES(approved_by),
               approved_at = NOW(), updated_at = NOW()",
            [
                $body['itemId'] ?? null,
                (string)($body['etapa'] ?? '1'),
                $body['runId'] ?? null,
                is_string($snapshot) ? $snapshot : json_encode($snapshot ?? []),
                $body['resultHtml'] ?? null,
                is_string($summary) ? $summary : ($summary !== null ? json_encode($summary) : null),
                $body['approvedBy'] ?? null,
            ]
        );
        sendJson(['success' => true]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// GET /api/chb/corrections
$router->get('chb/corrections', function($params) {
    try {
        $item_id = $_GET['item_id'] ?? null;
        if (!$item_id) sendJson(['success' => false, 'error' => 'item_id is required'], 400);
        $corrections = opsQuery(
            "SELECT id, item_id, filename, field_name, original_value, corrected_value,
                    location_reference, location_context, location_confidence,
                    corrected_by, applied_count, is_validated, created_at, updated_at
             FROM dados_dachser.t_chb_user_corrections
             WHERE item_id = ? ORDER BY created_at DESC",
            [$item_id]
        );
        sendJson(['success' => true, 'corrections' => $corrections ?: []]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/corrections
$router->post('chb/corrections', function($params) {
    try {
        $body = getRequestBody();
        $action = $body['action'] ?? null;

        if ($action === 'delete') {
            $correction_id = $body['correction_id'] ?? null;
            if (!$correction_id) sendJson(['success' => false, 'error' => 'correction_id is required'], 400);
            opsQuery("DELETE FROM dados_dachser.t_chb_user_corrections WHERE id = ?", [$correction_id]);
            sendJson(['success' => true, 'deleted' => $correction_id]);
        }

        if ($action === 'increment-applied') {
            $correction_id = $body['correction_id'] ?? null;
            if (!$correction_id) sendJson(['success' => false, 'error' => 'correction_id is required'], 400);
            opsQuery("UPDATE dados_dachser.t_chb_user_corrections SET applied_count = applied_count + 1, updated_at = NOW() WHERE id = ?", [$correction_id]);
            sendJson(['success' => true]);
        }

        // Default: save
        $item_id       = $body['item_id'] ?? null;
        $filename      = $body['filename'] ?? null;
        $field_name    = $body['field_name'] ?? null;
        $original_value = $body['original_value'] ?? null;
        $corrected_value = $body['corrected_value'] ?? null;
        $corrected_by  = $body['corrected_by'] ?? null;
        $file_content  = $body['file_content'] ?? null;

        if (!$item_id || !$filename || !$field_name || !$corrected_value) {
            sendJson(['success' => false, 'error' => 'item_id, filename, field_name e corrected_value são obrigatórios'], 400);
        }

        $effectiveFileContent = $file_content ?: fetchDocContentFromDb($item_id, $filename);

        $locationResult = ['found' => false, 'location' => 'Localização automática não disponível', 'context' => '', 'confidence' => 'baixa'];
        if ($effectiveFileContent && isset($_ENV['GEMINI_API_KEY'])) {
            $locationResult = locateValueInFile($filename, $field_name, $corrected_value, $effectiveFileContent);
        }

        $existing = opsQuery(
            "SELECT id FROM dados_dachser.t_chb_user_corrections WHERE item_id = ? AND filename = ? AND field_name = ? LIMIT 1",
            [$item_id, $filename, $field_name]
        );

        $correctionId = null;
        if ($existing && count($existing) > 0) {
            $correctionId = $existing[0]['id'];
            opsQuery(
                "UPDATE dados_dachser.t_chb_user_corrections SET original_value=?,corrected_value=?,location_reference=?,location_context=?,location_confidence=?,corrected_by=?,updated_at=NOW() WHERE id=?",
                [$original_value, $corrected_value, $locationResult['location'], $locationResult['context'], $locationResult['confidence'], $corrected_by, $correctionId]
            );
        } else {
            $result = opsQuery(
                "INSERT INTO dados_dachser.t_chb_user_corrections (item_id, filename, field_name, original_value, corrected_value, location_reference, location_context, location_confidence, corrected_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [$item_id, $filename, $field_name, $original_value, $corrected_value, $locationResult['location'], $locationResult['context'], $locationResult['confidence'], $corrected_by]
            );
            $correctionId = $result['insertId'] ?? null;
        }

        if (!$locationResult['found'] && $effectiveFileContent && isset($_ENV['GEMINI_API_KEY'])) {
            try {
                $reext = reextractFieldWithContext($filename, $field_name, $corrected_value, $effectiveFileContent);
                if ($reext['success'] && $reext['found']) {
                    opsQuery(
                        "UPDATE dados_dachser.t_chb_user_corrections SET location_reference=?,location_context=?,location_confidence=?,updated_at=NOW() WHERE id=?",
                        [$reext['location'], $reext['nearbyText'], $reext['confidence'], $correctionId]
                    );
                    $locationResult = ['found' => true, 'location' => $reext['location'], 'context' => $reext['nearbyText'], 'confidence' => $reext['confidence']];
                    $docType = detectDocumentType($filename);
                    saveChbExtractionRule($field_name, $docType, $reext['pattern'], $reext['extractionHint'], $corrected_value, $reext['processingInstruction']);
                }
            } catch (Exception $reextErr) {}
        }

        sendJson(['success' => true, 'correction_id' => $correctionId, 'location' => $locationResult]);
    } catch (Exception $e) {
        sendJson(['success' => false, 'error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/analyze-documents
$router->post('chb/analyze-documents', function($params) {
    try {
        $body = getRequestBody();

        // Polling por requestId
        if (isset($body['requestId'])) {
            $rows = opsQuery(
                "SELECT status, result_html, result_text, result_json, created_at FROM dados_dachser.t_chb_runs WHERE id = ? LIMIT 1",
                [$body['requestId']]
            );
            $row = $rows[0] ?? null;
            if (!$row) sendJson(['status' => 'error', 'error' => 'Requisição não encontrada'], 404);

            $status = $row['status'];
            $createdAt = strtotime($row['created_at']);
            $now = time();
            $timeoutSeconds = 600; // 10 minutes

            if (($status === 'pending' || $status === 'processing') && ($now - $createdAt) > $timeoutSeconds) {
                opsQuery(
                    "UPDATE dados_dachser.t_chb_runs SET status = 'error', result_text = 'TIMEOUT: A análise demorou mais que o esperado. O processamento foi interrompido.' WHERE id = ?",
                    [$body['requestId']]
                );
                $status = 'error';
                $row['result_text'] = 'TIMEOUT: A análise demorou mais que o esperado. O processamento foi interrompido.';
            }

            $result = null;
            if ($status === 'completed' && $row['result_html']) {
                $result = json_decode($row['result_html'], true);
                if (!$result) $result = ['html' => $row['result_html']];
            }
            sendJson(['status' => $status, 'result' => $result, 'error' => $status === 'error' ? $row['result_text'] : null]);
            return;
        }

        $stepId = $body['stepId'] ?? null;
        $files  = $body['files'] ?? [];
        $clientConfig = $body['clientConfig'] ?? null;
        $itemId = $body['itemId'] ?? null;

        if (!$stepId || !is_array($files) || count($files) === 0) {
            sendJson(['error' => 'stepId e files são obrigatórios'], 400);
        }

        $totalChars = 0;
        foreach ($files as $f) { $totalChars += strlen($f['content'] ?? '') + strlen($f['name'] ?? ''); }
        $estimatedTokens = (int)ceil($totalChars / 4);
        if ($estimatedTokens > 1000000) {
            sendJson(['error' => "Input muito grande ($estimatedTokens tokens estimados). Reduza o número ou tamanho dos arquivos."], 400);
        }

        $insert = opsQuery(
            "INSERT INTO dados_dachser.t_chb_runs (item_id, etapa, status, result_text, used_as_ctx, created_by) VALUES (?, ?, 'pending', ?, 0, ?)",
            [$itemId ?: 0, (string)$stepId, json_encode(['filesCount' => count($files), 'fileNames' => array_map(function($f) { return $f['name'] ?? ''; }, $files), 'hasClientConfig' => (bool)$clientConfig]), null]
        );
        $requestId = (string)($insert['insertId'] ?? '');

        // Run analysis in a background worker (usando arquivo de job temporário)
        $jobData = [
            'task' => 'chb_analysis',
            'runId' => $requestId,
            'stepId' => $stepId,
            'files' => $files,
            'clientConfig' => $clientConfig,
            'itemId' => $itemId
        ];
        $jobFile = sys_get_temp_dir() . '/dachser_chb_job_' . $requestId . '.json';
        file_put_contents($jobFile, json_encode($jobData));
        runPHPBackground(dirname(__DIR__) . '/background_worker.php', [$jobFile]);

        sendJson(['requestId' => $requestId, 'status' => 'pending', 'message' => 'Análise iniciada. Use o requestId para consultar o status.']);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});

// POST /api/chb/compare-documents
$router->post('chb/compare-documents', function($params) {
    $startTime = microtime(true);
    try {
        $uploadResult = handleFileUpload(isset($_FILES['pdfFile']) ? $_FILES['pdfFile'] : null, 'chb');
        if (!$uploadResult['success']) {
            sendJson(['error' => $uploadResult['error']], 400);
        }

        $pdfBase64 = base64_encode(file_get_contents($uploadResult['path']));
        $pdfFileName = $uploadResult['originalName'];
        
        $excelContent = isset($_POST['excelContent']) ? $_POST['excelContent'] : null;
        $excelFileName = isset($_POST['excelFileName']) ? $_POST['excelFileName'] : 'planilha.xlsx';

        if (!$pdfBase64 || !$excelContent) {
            sendJson(['error' => 'pdfFile e excelContent são obrigatórios'], 400);
        }

        $key = isset($_ENV['CHB_ANTHROPIC_API_KEY']) ? $_ENV['CHB_ANTHROPIC_API_KEY'] : (isset($_ENV['ANTHROPIC_API_KEY']) ? $_ENV['ANTHROPIC_API_KEY'] : null);
        if (!$key) sendJson(['error' => 'ANTHROPIC_API_KEY não configurada'], 500);

        $systemPrompt = "Você é um especialista em análise e conferência de documentos fiscais e financeiros brasileiros. Retorne OBRIGATORIAMENTE um JSON válido sem markdown.";
        $userPrompt = "Analise os seguintes documentos:\n\n=== CONTEÚDO DA PLANILHA EXCEL ($excelFileName) ===\n$excelContent\n\n=== DOCUMENTO PDF ===\nO PDF ($pdfFileName) está anexado. Compare TODOS os itens e valores de ambos os documentos.\n\nRetorne JSON:{\"pdfSummary\":{},\"excelSummary\":{},\"comparison\":{},\"analysis\":{}}";

        $res = fetch('https://api.anthropic.com/v1/messages', [
            'method' => 'POST',
            'headers' => ['x-api-key' => $key, 'anthropic-version' => '2023-06-01', 'Content-Type' => 'application/json'],
            'body' => json_encode([
                'model' => isset($_ENV['CHB_ANTHROPIC_MODEL']) ? $_ENV['CHB_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
                'max_tokens' => 32000,
                'temperature' => 0,
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $systemPrompt . "\n\n" . $userPrompt],
                        ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $pdfBase64]],
                    ]
                ]]
            ])
        ]);

        if (!$res['ok']) {
            $errorDetail = substr(isset($res['body']) ? $res['body'] : 'No body', 0, 500);
            $curlError = isset($res['error']) ? $res['error'] : 'N/A';
            error_log("[Anthropic Compare] Error HTTP {$res['status']}: {$errorDetail} | cURL: {$curlError}");

            if ($res['status'] === 429) sendJson(['error' => 'Limite de requisições excedido. Tente novamente em alguns minutos.'], 429);
            throw new Exception("API ANTHROPIC - ERRO AO EXTRAIR O ARQUIVO. Detalhes: {$res['status']} — {$errorDetail}");
        }

        $aiResponse = $res['json']();
        $content    = $aiResponse['content'][0]['text'] ?? null;
        if (!$content) throw new Exception('Resposta vazia da IA');

        $analysisResult = null;
        if (preg_match('/\{[\s\S]*\}/', $content, $jsonMatch)) {
            $analysisResult = json_decode($jsonMatch[0], true);
        }
        if (!$analysisResult) {
            throw new Exception('Falha ao interpretar resposta da IA. Tente novamente.');
        }

        $analysisResult['metadata'] = [
            'model' => isset($_ENV['CHB_ANTHROPIC_MODEL']) ? $_ENV['CHB_ANTHROPIC_MODEL'] : 'claude-sonnet-4-6',
            'processingTimeMs' => (int)round((microtime(true) - $startTime) * 1000),
            'pdfFileName' => $pdfFileName, 'excelFileName' => $excelFileName,
            'tokensUsed' => (($aiResponse['usage']['input_tokens'] ?? 0) + ($aiResponse['usage']['output_tokens'] ?? 0))
        ];

        sendJson($analysisResult);
    } catch (Exception $e) {
        sendJson(['error' => $e->getMessage()], 500);
    }
});
