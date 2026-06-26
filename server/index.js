import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Resend } from 'resend';
import { getPoolFor } from './db/pools.js';

import { registerOlimpoRoutes }    from './routes/olimpo.js';
import { registerAuthRoutes }      from './routes/auth.js';
import { registerAirRoutes }       from './routes/air.js';
import { registerSeaRoutes }       from './routes/sea.js';
import { registerChbRoutes }       from './routes/chb.js';
import { registerDemurrageRoutes } from './routes/demurrage.js';
import { registerFinRoutes }       from './routes/fin.js';
import { registerAdminRoutes }     from './routes/admin.js';

const app  = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const distPath   = path.resolve(__dirname, '..', 'dist');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Health-check
app.get('/api/health', (_req, res) =>
  res.json({ success: true, service: 'dachser-api', time: new Date().toISOString() })
);

// ─── Rotas por módulo ────────────────────────────────────────────────────────
registerOlimpoRoutes(app);
registerAuthRoutes(app,      { resend });
registerAirRoutes(app,       { resend });
registerSeaRoutes(app,       { resend });
registerChbRoutes(app,       {});
registerDemurrageRoutes(app, { resend });
registerFinRoutes(app,       { resend });
registerAdminRoutes(app,     { resend });

// ─── SPA fallback (serve React build em produção) ────────────────────────────
const indexHtml = path.join(distPath, 'index.html');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/{*path}', (_req, res) => {
    if (fs.existsSync(indexHtml)) res.sendFile(indexHtml);
    else res.status(404).send('Build not found');
  });
}

// ─── Error handler global ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const msg = err?.message || String(err) || 'Internal error';
  console.error('[express]', msg);
  if (!res.headersSent) res.status(500).json({ success: false, error: msg });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}\n`);

  const checks = [
    { phase: 'auth', label: 'Auth',    hostKey: 'MARIADB_AUTH_HOST', dbKey: 'MARIADB_AUTH_DATABASE' },
    { phase: 'air',  label: 'Air',     hostKey: 'MARIADB_AIR_HOST',  dbKey: 'MARIADB_AIR_DATABASE'  },
    { phase: 'sea',  label: 'Sea',     hostKey: 'MARIADB_SEA_HOST',  dbKey: 'MARIADB_SEA_DATABASE'  },
    { phase: 'fin',  label: 'Fin',     hostKey: 'MARIADB_FIN_HOST',  dbKey: 'MARIADB_FIN_DATABASE'  },
    { phase: 'ops',  label: 'Ops/CHB', hostKey: 'MARIADB_OPS_HOST',  dbKey: 'MARIADB_OPS_DATABASE'  },
  ];

  for (const { phase, label, hostKey, dbKey } of checks) {
    const host = process.env[hostKey] || process.env.DB_HOST;
    const db   = process.env[dbKey]   || process.env.DB_NAME;
    if (!host || !db) {
      console.warn(`⚠️  [${label}] ${hostKey} / ${dbKey} não definidos — fase indisponível.`);
      continue;
    }
    try {
      const pool = getPoolFor(phase);
      const conn = await pool.getConnection();
      conn.release();
      console.log(`✅ [${label}] conectado a ${host}/${db}`);
    } catch (err) {
      console.error(`❌ [${label}] ${err.message}`);
    }
  }

  console.log('');
});
