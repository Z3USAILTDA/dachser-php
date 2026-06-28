/**
 * server/routes/auth.js
 * Rotas de autenticação: /api/auth/*
 * Pool: MARIADB_AUTH_* — database: dados_dachser
 */
import { getAuthPool } from '../db/pools.js';

const AUTH_USERS_TABLE = process.env.AUTH_USERS_TABLE || 'dados_dachser.t_users_dachser';
const AUTH_CODES_TABLE = process.env.AUTH_CODES_TABLE || 'dados_dachser.t_password_reset';

export function registerAuthRoutes(app, { resend }) {

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
      }
      const db = getAuthPool();

      const [rows] = await db.query(
        `SELECT id, email, username, password_hash,
                is_admin, must_change_password, olimpo_only, metrics_only,
                esteira_role, esteira_active, supervisor_id
           FROM ${AUTH_USERS_TABLE}
          WHERE username = ?
          LIMIT 1`,
        [username.trim()]
      );

      if (!rows || rows.length === 0) {
        console.warn(`[auth/login] Usuário não encontrado: "${username}"`);
        return res.status(401).json({ success: false, error: 'Usuário ou Senha incorretos.' });
      }
      const user = rows[0];

      const storedHash = user.password_hash || '';
      console.log(`[auth/login] Usuário encontrado: id=${user.id}, hash_prefix="${storedHash.substring(0, 10)}...", hash_len=${storedHash.length}`);

      let passwordOk = false;
      const bcrypt = await import('bcryptjs').catch(() => null);
      if (bcrypt && storedHash.startsWith('$2')) {
        console.log('[auth/login] Tentando bcrypt compare...');
        passwordOk = await bcrypt.default.compare(password, storedHash);
        console.log(`[auth/login] bcrypt result: ${passwordOk}`);
      } else {
        const crypto = await import('crypto');
        const md5    = crypto.default.createHash('md5').update(password).digest('hex');
        const sha256 = crypto.default.createHash('sha256').update(password).digest('hex');
        const sha1   = crypto.default.createHash('sha1').update(password).digest('hex');
        passwordOk = storedHash === md5 || storedHash === sha256 || storedHash === sha1 || storedHash === password;
        console.log(`[auth/login] hash match: ${passwordOk}`);
      }

      if (!passwordOk) {
        console.warn(`[auth/login] Senha incorreta para usuário "${username}"`);
        return res.status(401).json({ success: false, error: 'Usuário ou Senha incorretos.' });
      }

      const { password_hash: _h, ...safeUser } = user;
      res.json({ success: true, user: safeUser });
    } catch (err) {
      console.error('[auth/login]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao autenticar.' });
    }
  });

  // POST /api/auth/register
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password, esteira_role } = req.body || {};
      if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Usuário, e-mail e senha são obrigatórios.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });
      }

      const db = getAuthPool();

      const [existing] = await db.query(
        `SELECT id FROM ${AUTH_USERS_TABLE} WHERE username = ? OR email = ? LIMIT 1`,
        [username.trim(), email.trim()]
      );
      if (existing && existing.length > 0) {
        return res.status(409).json({ success: false, error: 'Usuário ou e-mail já cadastrado.' });
      }

      let hashedPassword = password;
      const bcrypt = await import('bcryptjs').catch(() => null);
      if (bcrypt) {
        hashedPassword = await bcrypt.default.hash(password, 10);
      }

      const [result] = await db.query(
        `INSERT INTO ${AUTH_USERS_TABLE}
           (username, email, password_hash, is_admin, must_change_password, esteira_role, esteira_active)
         VALUES (?, ?, ?, 0, 1, ?, 1)`,
        [username.trim(), email.trim(), hashedPassword, esteira_role || null]
      );

      if (process.env.RESEND_API_KEY) {
        try {
          const u = username.trim();
          const logoLight = 'https://i.ibb.co/TgXzCqz/logo-preto.png';
          const logoDark  = process.env.EMAIL_LOGO_URL || 'https://i.ibb.co/sJkY7y5/logo-branco.png';
          const accessUrl = 'https://dachser.z3us.app';

          const htmlBody = `<!doctype html>
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
          <img src="${logoLight}" width="120" alt="Z3US" class="logo-light" style="display:block;margin:0 auto 8px;border:0">
          <img src="${logoDark}" width="120" alt="Z3US" class="logo-dark" style="display:none;margin:0 auto 8px;border:0">
        </td></tr>
        <tr><td style="padding:8px 28px 0" align="left" class="text">
          <h1 style="margin:8px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Bem-vindo(a), ${u}!</h1>
          <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5" class="muted">
            Sua conta foi criada com sucesso no Z3US.AI @ Dachser
            (<a href="${accessUrl}" target="_blank" rel="noopener" style="color:#ffa500;text-decoration:none">dachser.z3us.app</a>).
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 12px" align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Usuário:</b> ${u}</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:6px 0" class="text"><b>Senha atual:</b> <code style="font-family:Consolas,monospace;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.06)">${password}</code></td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px" class="muted">Por segurança, altere sua senha no primeiro acesso.</p>
        </td></tr>
        <tr><td style="padding:10px 28px 22px" align="left">
          <a href="${accessUrl}" class="btn" style="font-family:Arial,Helvetica,sans-serif">Alterar senha</a>
        </td></tr>
        <tr><td style="padding:0 28px 26px" align="left">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5" class="muted">Caso não tenha solicitado este cadastro, ignore este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

          await resend.emails.send({
            from: 'Z3US.AI - DACHSER <noreply@hermes.z3us.ai>',
            to: email.trim(),
            subject: 'Bem-vindo(a) ao Z3US',
            html: htmlBody,
            text: `Bem-vindo(a), ${u}!\n\nUsuário: ${u}\nSenha temporária: ${password}\n\nAcesse: https://dachser.z3us.app`,
          });
        } catch (mailErr) {
          console.warn('[auth/register] Falha ao enviar e-mail:', mailErr.message);
        }
      }

      res.json({ success: true, user: { id: result.insertId, username: username.trim(), email: email.trim() } });
    } catch (err) {
      console.error('[auth/register]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao cadastrar usuário.' });
    }
  });

  // POST /api/auth/forgot-password
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ success: false, error: 'E-mail é obrigatório.' });

      const db = getAuthPool();
      const [users] = await db.query(
        `SELECT id, username, email FROM ${AUTH_USERS_TABLE} WHERE email = ? LIMIT 1`,
        [email.trim()]
      );
      if (!users || users.length === 0) {
        return res.json({ success: true }); // não vaza se e-mail existe
      }
      const user = users[0];

      const { default: crypto } = await import('crypto');
      const code = String(Math.floor(100000 + crypto.randomInt(900000)));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.query(
        `INSERT INTO ${AUTH_CODES_TABLE} (user_id, email, code, expires_at, used, created_at)
         VALUES (?, ?, ?, ?, 0, NOW())
         ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), used = 0, created_at = NOW()`,
        [user.id, email.trim(), code, expiresAt]
      );

      if (process.env.RESEND_API_KEY) {
        const resendFrom = process.env.RESEND_FROM || 'noreply@z3us.ai';
        const { error: mailError } = await resend.emails.send({
          from: resendFrom,
          to: email.trim(),
          subject: 'Código de recuperação de senha — DACHSER',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
              <h2 style="color:#041021;margin-bottom:8px">Recuperação de Senha</h2>
              <p style="color:#374151">Olá, <b>${user.username}</b>!</p>
              <p style="color:#374151">Seu código de verificação é:</p>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;text-align:center;margin:20px 0">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#041021">${code}</span>
              </div>
              <p style="color:#6b7280;font-size:14px">Este código expira em <b>15 minutos</b>.</p>
              <p style="color:#6b7280;font-size:13px">Se não foi você quem solicitou, ignore este e-mail.</p>
            </div>`,
        });
        if (mailError) console.error('[auth/forgot-password] Resend error:', mailError);
      } else {
        console.warn('[auth/forgot-password] RESEND_API_KEY não configurada — código:', code);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[auth/forgot-password]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao enviar código de recuperação.' });
    }
  });

  // POST /api/auth/verify-reset-code
  app.post('/api/auth/verify-reset-code', async (req, res) => {
    try {
      const { email, code } = req.body || {};
      if (!email || !code) return res.status(400).json({ success: false, error: 'E-mail e código são obrigatórios.' });

      const db = getAuthPool();
      const [rows] = await db.query(
        `SELECT rc.id, rc.user_id, u.username
           FROM ${AUTH_CODES_TABLE} rc
           JOIN ${AUTH_USERS_TABLE} u ON u.id = rc.user_id
          WHERE rc.email = ? AND rc.code = ? AND rc.used = 0 AND rc.expires_at > NOW()
          ORDER BY rc.created_at DESC LIMIT 1`,
        [email.trim(), String(code).trim()]
      );
      if (!rows || rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Código inválido ou expirado.' });
      }
      const row = rows[0];

      await db.query(`UPDATE ${AUTH_CODES_TABLE} SET used = 1 WHERE id = ?`, [row.id]);
      res.json({ success: true, user: { id: row.user_id, username: row.username } });
    } catch (err) {
      console.error('[auth/verify-reset-code]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao verificar código.' });
    }
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, password, username } = req.body || {};
      if (!email || !password) return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
      if (password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });

      const db = getAuthPool();

      let hashedPassword = password;
      const bcrypt = await import('bcryptjs').catch(() => null);
      if (bcrypt) {
        hashedPassword = await bcrypt.default.hash(password, 10);
      }

      await db.query(
        `UPDATE ${AUTH_USERS_TABLE} SET password_hash = ?, must_change_password = 0 WHERE email = ?`,
        [hashedPassword, email.trim()]
      );

      if (username) {
        try {
          await db.query(
            `INSERT INTO dados_dachser.t_usage_logs (username, endpoint, method, session_id, event_time)
             VALUES (?, ?, ?, NULL, NOW())`,
            [username, '/reset-password', 'POST']
          );
        } catch { /* best-effort */ }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[auth/reset-password]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao redefinir senha.' });
    }
  });

  // POST /api/auth/change-password
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const { userId, password } = req.body || {};
      if (!userId || !password) return res.status(400).json({ success: false, error: 'userId e senha são obrigatórios.' });
      if (password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' });

      const db = getAuthPool();

      let hashedPassword = password;
      const bcrypt = await import('bcryptjs').catch(() => null);
      if (bcrypt) {
        hashedPassword = await bcrypt.default.hash(password, 10);
      }

      await db.query(
        `UPDATE ${AUTH_USERS_TABLE} SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
        [hashedPassword, Number(userId)]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('[auth/change-password]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao alterar senha.' });
    }
  });

}
