<?php
// api/routes/upload_helper.php

/**
 * Valida o array de upload $_FILES e move o arquivo para a pasta de uploads correta.
 * 
 * @param array $fileArray Exemplo: $_FILES['file']
 * @param string $moduleName Nome da pasta do módulo (ex: 'air', 'chb', 'sea')
 * @param array $allowedMimes Array de MIME types permitidos. Padrão: PDF, Excel, Imagens e CSV.
 * @return array Um array com 'success' booleano. Se true, contém 'path', 'size', 'mime'. Se false, contém 'error'.
 */
function handleFileUpload($fileArray, $moduleName, $allowedMimes = []) {
    if (empty($allowedMimes)) {
        $allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            'text/csv'
        ];
    }

    if (!isset($fileArray) || !is_array($fileArray)) {
        return ['success' => false, 'error' => 'Nenhum arquivo recebido na requisição.'];
    }

    if (!isset($fileArray['error']) || is_array($fileArray['error'])) {
        return ['success' => false, 'error' => 'Parâmetros de upload inválidos.'];
    }

    switch ($fileArray['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            return ['success' => false, 'error' => 'Nenhum arquivo enviado.'];
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return ['success' => false, 'error' => 'Limite de tamanho de arquivo excedido.'];
        default:
            return ['success' => false, 'error' => 'Erro desconhecido durante o upload. Código: ' . $fileArray['error']];
    }

    if (!isset($fileArray['tmp_name']) || empty($fileArray['tmp_name'])) {
        return ['success' => false, 'error' => 'Arquivo temporário não foi criado.'];
    }

    $filesize = filesize($fileArray['tmp_name']);
    if ($filesize === false || $filesize === 0) {
        return ['success' => false, 'error' => 'Arquivo enviado está vazio (0 bytes).'];
    }

    $mime = $fileArray['type'] ?? mime_content_type($fileArray['tmp_name']);
    
    $isValidMime = false;
    foreach ($allowedMimes as $allowed) {
        if ($mime === $allowed || (strpos($allowed, '/') === false && strpos($mime, $allowed) !== false)) {
            $isValidMime = true;
            break;
        }
        if (strpos($mime, 'image/') === 0 && in_array('image/*', $allowedMimes)) {
             $isValidMime = true;
             break;
        }
    }

    if (!$isValidMime && !in_array($mime, $allowedMimes)) {
        return ['success' => false, 'error' => 'Tipo de arquivo não permitido: ' . $mime];
    }

    // Cria a estrutura de pastas api/uploads/{modulo}
    $uploadDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $moduleName;
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0777, true)) {
            return ['success' => false, 'error' => 'Falha ao criar diretório de uploads no servidor.'];
        }
    }

    // Limpa nome do arquivo de caracteres estranhos para evitar issues
    $originalName = basename($fileArray['name']);
    $safeName = preg_replace('/[^a-zA-Z0-9.\-_]/', '_', $originalName);
    
    // Gera um nome unico
    $uniqueName = uniqid(time() . '_') . '_' . $safeName;
    $destinationPath = $uploadDir . DIRECTORY_SEPARATOR . $uniqueName;

    if (!move_uploaded_file($fileArray['tmp_name'], $destinationPath)) {
        return ['success' => false, 'error' => 'Falha ao mover arquivo salvo do diretório temporário. Verifique as permissões de gravação.'];
    }

    error_log("[UPLOAD SUCESSO] Modulo: {$moduleName} | Arquivo: {$uniqueName} | Tamanho: {$filesize} bytes | MIME: {$mime}");

    return [
        'success' => true,
        'path' => $destinationPath,
        'size' => $filesize,
        'mime' => $mime,
        'originalName' => $originalName
    ];
}
