<?php
// api/routes/auth.php
// Rotas de autenticação: /api/auth/*

global $router;

$router->post('auth/login', function($params) {
    $body = getRequestBody();
    $username = isset($body['username']) ? trim($body['username']) : null;
    $password = isset($body['password']) ? $body['password'] : null;

    if (!$username || !$password) {
        sendJson(['success' => false, 'error' => 'Usuário e senha são obrigatórios.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $pdo = getAuthPDO();

    try {
        $stmt = $pdo->prepare("
            SELECT id, email, username, password_hash,
                   is_admin, must_change_password, olimpo_only, metrics_only,
                   esteira_role, esteira_active, supervisor_id
              FROM $authUsersTable
             WHERE username = ?
             LIMIT 1
        ");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user) {
            sendJson(['success' => false, 'error' => 'Usuário ou Senha incorretos.'], 401);
        }

        $storedHash = $user['password_hash'] ?: '';
        $passwordOk = false;

        if (strpos($storedHash, '$2') === 0) {
            $passwordOk = password_verify($password, $storedHash);
        } else {
            $md5    = md5($password);
            $sha256 = hash('sha256', $password);
            $sha1   = sha1($password);
            $passwordOk = ($storedHash === $md5 || $storedHash === $sha256 || $storedHash === $sha1 || $storedHash === $password);
        }

        if (!$passwordOk) {
            sendJson(['success' => false, 'error' => 'Usuário ou Senha incorretos.'], 401);
        }

        // Remove hash de senha por segurança
        unset($user['password_hash']);

        // Converter campos numéricos para int/bool para compatibilidade
        $user['id'] = (int)$user['id'];
        $user['is_admin'] = (int)$user['is_admin'];
        $user['must_change_password'] = (int)$user['must_change_password'];
        $user['olimpo_only'] = (int)$user['olimpo_only'];
        $user['metrics_only'] = (int)$user['metrics_only'];
        $user['esteira_active'] = (int)$user['esteira_active'];
        $user['supervisor_id'] = $user['supervisor_id'] !== null ? (int)$user['supervisor_id'] : null;

        sendJson(['success' => true, 'user' => $user]);
    } catch (Exception $e) {
        error_log('[auth/login] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao autenticar.'], 500);
    }
});

$router->post('auth/register', function($params) {
    $body = getRequestBody();
    $username = isset($body['username']) ? trim($body['username']) : null;
    $email = isset($body['email']) ? trim($body['email']) : null;
    $password = isset($body['password']) ? $body['password'] : null;
    $esteiraRole = isset($body['esteira_role']) ? $body['esteira_role'] : null;

    if (!$username || !$email || !$password) {
        sendJson(['success' => false, 'error' => 'Usuário, e-mail e senha são obrigatórios.'], 400);
    }
    if (strlen($password) < 6) {
        sendJson(['success' => false, 'error' => 'Senha deve ter pelo menos 6 caracteres.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $pdo = getAuthPDO();

    try {
        $stmt = $pdo->prepare("SELECT id FROM $authUsersTable WHERE username = ? OR email = ? LIMIT 1");
        $stmt->execute([$username, $email]);
        if ($stmt->fetch()) {
            sendJson(['success' => false, 'error' => 'Usuário ou e-mail já cadastrado.'], 409);
        }

        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

        $stmt = $pdo->prepare("
            INSERT INTO $authUsersTable
               (username, email, password_hash, is_admin, must_change_password, esteira_role, esteira_active)
             VALUES (?, ?, ?, 0, 1, ?, 1)
        ");
        $stmt->execute([$username, $email, $hashedPassword, $esteiraRole]);
        $insertId = $pdo->lastInsertId();

        // Disparo de e-mail de boas-vindas
        if (isset($_ENV['RESEND_API_KEY'])) {
            try {
                $logoLight = 'https://i.ibb.co/TgXzCqz/logo-preto.png';
                $logoDark  = isset($_ENV['EMAIL_LOGO_URL']) ? $_ENV['EMAIL_LOGO_URL'] : 'https://i.ibb.co/sJkY7y5/logo-branco.png';
                $accessUrl = 'https://dachser.z3us.app';

                $htmlBody = '<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Boas-vindas</title>
<style>
  .bg{background:#fff}.panel{background:#fff;border:1px solid #e8e8e8;border-radius:12px}
  .text{color:#111}.muted{color:#666}
  .btn{display:inline-block;background:#ffa500;color:#111;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 20px}
  @media (prefers-color-scheme: dark){
    .bg{background:#0b0b0b!important}.panel{background:#141414!important;border-color:#262626!important}
    .text{color:#ededed!important}.muted{color:#bdbdbd!important}
    .logo-light{display:none!important}.logo-dark{display:block!important}
  }
</style>
</head>
<body class="bg" style="margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="panel" style="border-collapse:collapse;max-width:640px">
        <tr><td style="padding:28px 28px 0" align="center">
          <img src="' . $logoLight . '" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="' . $logoDark . '" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>
        <tr><td style="padding:8px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Bem-vindo(a), ' . htmlspecialchars($username) . '!</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Sua conta foi criada com sucesso no Z3US.AI @ Dachser
            (<a href="' . $accessUrl . '" target="_blank" rel="noopener" style="color:#ffa500;text-decoration:none">dachser.z3us.app</a>).
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 12px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Usuário:</b> ' . htmlspecialchars($username) . '</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Senha atual:</b> <code style="font-family:Consolas,monospace;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.06)">' . htmlspecialchars($password) . '</code></td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px" class="muted">Por segurança, altere sua senha no primeiro acesso.</p>
        </td></tr>
        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="' . $accessUrl . '" class="btn" style="font-family:Arial,Helvetica,sans-serif">Alterar senha</a>
        </td></tr>
        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso não tenha solicitado este cadastro, ignore este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>';

                sendEmailResend(
                    $email,
                    'Bem-vindo(a) ao Z3US',
                    $htmlBody,
                    "Bem-vindo(a), {$username}!\n\nUsuário: {$username}\nSenha temporária: {$password}\n\nAcesse: https://dachser.z3us.app"
                );
            } catch (Exception $mailErr) {
                error_log('[auth/register] Falha ao enviar e-mail: ' . $mailErr->getMessage());
            }
        }

        sendJson([
            'success' => true,
            'user' => [
                'id' => (int)$insertId,
                'username' => $username,
                'email' => $email
            ]
        ]);
    } catch (Exception $e) {
        error_log('[auth/register] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao cadastrar usuário.'], 500);
    }
});

$router->post('auth/forgot-password', function($params) {
    $body = getRequestBody();
    $email = isset($body['email']) ? trim($body['email']) : null;

    if (!$email) {
        sendJson(['success' => false, 'error' => 'E-mail é obrigatório.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $authCodesTable = isset($_ENV['AUTH_CODES_TABLE']) ? $_ENV['AUTH_CODES_TABLE'] : 'dados_dachser.t_password_reset';
    $pdo = getAuthPDO();

    try {
        $stmt = $pdo->prepare("SELECT id, username, email FROM $authUsersTable WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            // Não vaza se o e-mail existe
            sendJson(['success' => true]);
        }

        $code = (string)random_int(100000, 999999);
        // Expira em 15 minutos
        $expiresAt = date('Y-m-d H:i:s', time() + 15 * 60);

        $stmt = $pdo->prepare("
            INSERT INTO $authCodesTable (user_id, email, code, expires_at, used, created_at)
            VALUES (?, ?, ?, ?, 0, NOW())
            ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), used = 0, created_at = NOW()
        ");
        $stmt->execute([$user['id'], $email, $code, $expiresAt]);

        if (isset($_ENV['RESEND_API_KEY'])) {
            $htmlBody = '
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
                  <h2 style="color:#041021;margin-bottom:8px">Recuperação de Senha</h2>
                  <p style="color:#374151">Olá, <b>' . htmlspecialchars($user['username']) . '</b>!</p>
                  <p style="color:#374151">Seu código de verificação é:</p>
                  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;text-align:center;margin:20px 0">
                    <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#041021">' . $code . '</span>
                  </div>
                  <p style="color:#6b7280;font-size:14px">Este código expira em <b>15 minutos</b>.</p>
                  <p style="color:#6b7280;font-size:13px">Se não foi você quem solicitou, ignore este e-mail.</p>
                </div>';

            sendEmailResend($email, 'Código de recuperação de senha — DACHSER', $htmlBody);
        } else {
            error_log('[auth/forgot-password] RESEND_API_KEY não configurada. Código gerado: ' . $code);
        }

        sendJson(['success' => true]);
    } catch (Exception $e) {
        error_log('[auth/forgot-password] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao enviar código de recuperação.'], 500);
    }
});

$router->post('auth/verify-reset-code', function($params) {
    $body = getRequestBody();
    $email = isset($body['email']) ? trim($body['email']) : null;
    $code = isset($body['code']) ? trim($body['code']) : null;

    if (!$email || !$code) {
        sendJson(['success' => false, 'error' => 'E-mail e código são obrigatórios.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $authCodesTable = isset($_ENV['AUTH_CODES_TABLE']) ? $_ENV['AUTH_CODES_TABLE'] : 'dados_dachser.t_password_reset';
    $pdo = getAuthPDO();

    try {
        $stmt = $pdo->prepare("
            SELECT rc.id, rc.user_id, u.username
              FROM $authCodesTable rc
              JOIN $authUsersTable u ON u.id = rc.user_id
             WHERE rc.email = ? AND rc.code = ? AND rc.used = 0 AND rc.expires_at > NOW()
             ORDER BY rc.created_at DESC LIMIT 1
        ");
        $stmt->execute([$email, $code]);
        $row = $stmt->fetch();

        if (!$row) {
            sendJson(['success' => false, 'error' => 'Código inválido ou expirado.'], 400);
        }

        $stmt = $pdo->prepare("UPDATE $authCodesTable SET used = 1 WHERE id = ?");
        $stmt->execute([$row['id']]);

        sendJson([
            'success' => true,
            'user' => [
                'id' => (int)$row['user_id'],
                'username' => $row['username']
            ]
        ]);
    } catch (Exception $e) {
        error_log('[auth/verify-reset-code] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao verificar código.'], 500);
    }
});

$router->post('auth/reset-password', function($params) {
    $body = getRequestBody();
    $email = isset($body['email']) ? trim($body['email']) : null;
    $password = isset($body['password']) ? $body['password'] : null;
    $username = isset($body['username']) ? trim($body['username']) : null;

    if (!$email || !$password) {
        sendJson(['success' => false, 'error' => 'E-mail e senha são obrigatórios.'], 400);
    }
    if (strlen($password) < 6) {
        sendJson(['success' => false, 'error' => 'Senha deve ter pelo menos 6 caracteres.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $pdo = getAuthPDO();

    try {
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("UPDATE $authUsersTable SET password_hash = ?, must_change_password = 0 WHERE email = ?");
        $stmt->execute([$hashedPassword, $email]);

        if ($username) {
            try {
                // Registro de log de uso
                $stmtLog = $pdo->prepare("
                    INSERT INTO dados_dachser.t_usage_logs (username, endpoint, method, session_id, event_time)
                    VALUES (?, ?, ?, NULL, NOW())
                ");
                $stmtLog->execute([$username, '/reset-password', 'POST']);
            } catch (Exception $ex) {
                // best-effort
            }
        }

        sendJson(['success' => true]);
    } catch (Exception $e) {
        error_log('[auth/reset-password] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao redefinir senha.'], 500);
    }
});

$router->post('auth/change-password', function($params) {
    $body = getRequestBody();
    $userId = isset($body['userId']) ? $body['userId'] : null;
    $password = isset($body['password']) ? $body['password'] : null;

    if (!$userId || !$password) {
        sendJson(['success' => false, 'error' => 'userId e senha são obrigatórios.'], 400);
    }
    if (strlen($password) < 6) {
        sendJson(['success' => false, 'error' => 'Senha deve ter pelo menos 6 caracteres.'], 400);
    }

    $authUsersTable = isset($_ENV['AUTH_USERS_TABLE']) ? $_ENV['AUTH_USERS_TABLE'] : 'dados_dachser.t_users_dachser';
    $pdo = getAuthPDO();

    try {
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("UPDATE $authUsersTable SET password_hash = ?, must_change_password = 0 WHERE id = ?");
        $stmt->execute([$hashedPassword, (int)$userId]);

        sendJson(['success' => true]);
    } catch (Exception $e) {
        error_log('[auth/change-password] ' . $e->getMessage());
        sendJson(['success' => false, 'error' => 'Erro ao alterar senha.'], 500);
    }
});
